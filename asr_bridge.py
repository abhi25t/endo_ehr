"""
ASR Bridge — Streams audio from WebSocket to Google Cloud Speech-to-Text v2.

Threading model:
  asyncio event loop                     background thread
  ==================                     =================
  session.audio_queue                    sync_audio_queue (queue.Queue)
          |                                      |
          v                                      v
  audio_pump() coroutine -------->       request_generator()
                                                 |
                                                 v
                                         streaming_recognize()
                                                 |
                                         transcript results
                                                 |
                                  loop.call_soon_threadsafe()
                                                 |
                                                 v
                                  session.transcript_queue → batcher
"""

import asyncio
import logging
import queue
import threading

from google.api_core.client_options import ClientOptions
from google.api_core.exceptions import OutOfRange
from google.auth import default
from google.cloud.speech_v2 import SpeechClient
from google.cloud.speech_v2.types import cloud_speech as cloud_speech_types

log = logging.getLogger("ehr-voice")

# ── Defaults (overridden by config dict passed to run_asr_bridge) ──
_DEFAULT_STT_LOCATION = "asia-southeast1"
_DEFAULT_MODEL = "chirp_3"
_DEFAULT_LANGUAGE_CODES = ["en-IN", "hi-IN"]
_DEFAULT_SAMPLE_RATE = 16000
_DEFAULT_MAX_PHRASES_PER_SET = 1200
_DEFAULT_PHRASE_BOOST = 5.0


def _build_phrase_set_inline(hints: list[str], max_per_set: int = 1200,
                             boost: float = 5.0) -> list[cloud_speech_types.SpeechAdaptation.AdaptationPhraseSet]:
    """Build inline PhraseSet(s) from hint list, splitting at max_per_set per set."""
    if not hints:
        return []

    phrase_sets = []
    for i in range(0, len(hints), max_per_set):
        chunk = hints[i:i + max_per_set]
        phrases = [cloud_speech_types.PhraseSet.Phrase(value=h, boost=boost) for h in chunk]
        phrase_set = cloud_speech_types.PhraseSet(phrases=phrases)
        adaptation_set = cloud_speech_types.SpeechAdaptation.AdaptationPhraseSet(
            inline_phrase_set=phrase_set
        )
        phrase_sets.append(adaptation_set)
    return phrase_sets


def _create_client_and_config(phrase_hints: list[str], asr_config: dict | None = None):
    """Create STT client and streaming config."""
    cfg = asr_config or {}
    stt_location = cfg.get("location", _DEFAULT_STT_LOCATION)
    model = cfg.get("model", _DEFAULT_MODEL)
    language_codes = cfg.get("language_codes", _DEFAULT_LANGUAGE_CODES)
    sample_rate = cfg.get("sample_rate", _DEFAULT_SAMPLE_RATE)
    max_phrases = cfg.get("max_phrases_per_set", _DEFAULT_MAX_PHRASES_PER_SET)
    phrase_boost = cfg.get("phrase_boost", _DEFAULT_PHRASE_BOOST)

    creds, project_id = default()

    client = SpeechClient(
        client_options=ClientOptions(
            api_endpoint=f"{stt_location}-speech.googleapis.com"
        )
    )

    recognizer = client.recognizer_path(project_id, stt_location, "_")

    # Explicit decoding for raw PCM from browser AudioWorklet
    recognition_config = cloud_speech_types.RecognitionConfig(
        explicit_decoding_config=cloud_speech_types.ExplicitDecodingConfig(
            encoding=cloud_speech_types.ExplicitDecodingConfig.AudioEncoding.LINEAR16,
            sample_rate_hertz=sample_rate,
            audio_channel_count=1,
        ),
        language_codes=language_codes,
        model=model,
    )

    # Add phrase hints for medical jargon recognition
    phrase_sets = _build_phrase_set_inline(phrase_hints, max_per_set=max_phrases,
                                           boost=phrase_boost)
    if phrase_sets:
        recognition_config.adaptation = cloud_speech_types.SpeechAdaptation(
            phrase_sets=phrase_sets,
        )

    streaming_features = cloud_speech_types.StreamingRecognitionFeatures(
        interim_results=True,
        enable_voice_activity_events=True,
    )

    streaming_config = cloud_speech_types.StreamingRecognitionConfig(
        config=recognition_config,
        streaming_features=streaming_features,
    )

    config_request = cloud_speech_types.StreamingRecognizeRequest(
        recognizer=recognizer,
        streaming_config=streaming_config,
    )

    return client, config_request


def _run_stt_stream(
    client: SpeechClient,
    config_request,
    sync_audio_q: queue.Queue,
    loop: asyncio.AbstractEventLoop,
    transcript_queue: asyncio.Queue,
    cancel_event: asyncio.Event,
):
    """
    Run a single STT streaming session in a background thread.
    Auto-restarts on 5-minute timeout (OutOfRange).
    """

    while not cancel_event.is_set():
        def request_generator():
            # First message: config
            yield config_request
            # Subsequent: audio chunks
            while not cancel_event.is_set():
                try:
                    data = sync_audio_q.get(timeout=1.0)
                except queue.Empty:
                    continue
                if data is None:
                    return
                yield cloud_speech_types.StreamingRecognizeRequest(audio=data)

        try:
            responses = client.streaming_recognize(requests=request_generator())

            for response in responses:
                if cancel_event.is_set():
                    break

                for result in response.results:
                    if not result.alternatives:
                        continue
                    text = result.alternatives[0].transcript
                    is_final = result.is_final

                    msg = {"text": text, "is_final": is_final}
                    loop.call_soon_threadsafe(transcript_queue.put_nowait, msg)

        except OutOfRange:
            # STT stream hit 5-minute limit — restart
            log.info("STT stream timeout, restarting...")
            loop.call_soon_threadsafe(
                transcript_queue.put_nowait,
                {"info": "ASR stream restarted (timeout)"},
            )
            continue

        except Exception as e:
            if cancel_event.is_set():
                break
            log.exception("STT stream error")
            loop.call_soon_threadsafe(
                transcript_queue.put_nowait,
                {"error": f"ASR error: {str(e)}"},
            )
            break

    log.info("STT thread exiting")


async def run_asr_bridge(ws, session, asr_config: dict | None = None):
    """
    Main entry point — called as an asyncio task from server.py.

    Pumps audio from session.audio_queue (async) → sync queue → STT thread,
    and STT results back into session.transcript_queue.
    """
    cfg = asr_config or {}
    phrase_hints = getattr(session, "phrase_hints", [])
    language_codes = cfg.get("language_codes", _DEFAULT_LANGUAGE_CODES)

    log.info(
        "ASR bridge starting (languages=%s, hints=%d)",
        language_codes, len(phrase_hints),
    )

    try:
        client, config_request = _create_client_and_config(phrase_hints, asr_config=cfg)
    except Exception as e:
        log.exception("Failed to create STT client")
        await session.transcript_queue.put({"error": f"ASR init failed: {e}"})
        return

    sync_audio_q = queue.Queue()
    loop = asyncio.get_event_loop()

    # Start STT thread
    stt_thread = threading.Thread(
        target=_run_stt_stream,
        args=(client, config_request, sync_audio_q, loop,
              session.transcript_queue, session.cancel_event),
        daemon=True,
    )
    stt_thread.start()

    # Audio pump: async queue → sync queue
    try:
        while not session.cancel_event.is_set():
            try:
                audio_data = await asyncio.wait_for(
                    session.audio_queue.get(), timeout=1.0
                )
            except asyncio.TimeoutError:
                continue

            if audio_data is None:
                # Sentinel: stop
                sync_audio_q.put(None)
                break

            sync_audio_q.put(audio_data)

    except asyncio.CancelledError:
        log.info("ASR bridge cancelled")
    finally:
        sync_audio_q.put(None)  # Ensure STT thread exits
        stt_thread.join(timeout=5.0)
        log.info("ASR bridge stopped")
