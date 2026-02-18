
#export GOOGLE_APPLICATION_CREDENTIALS=skan-radiology-prism-c0d90808a981.json

import queue
import pyaudio

from google.auth import default
from google.api_core.client_options import ClientOptions
from google.cloud.speech_v2 import SpeechClient
from google.cloud.speech_v2.types import cloud_speech as cloud_speech_types
from google.protobuf.duration_pb2 import Duration

# --------- CONFIG ---------
STT_LOCATION = "asia-southeast1"
MODEL = "chirp_3"
LANGUAGE_CODES = ["en-IN"]   # , "hi-IN"

RATE = 16000          # sample rate
CHUNK_DURATION = 0.1  # seconds
CHUNK = int(RATE * CHUNK_DURATION)
# --------------------------

creds, PROJECT_ID = default()

client = SpeechClient(
    client_options=ClientOptions(
        api_endpoint=f"{STT_LOCATION}-speech.googleapis.com"
    )
)

recognizer = client.recognizer_path(PROJECT_ID, STT_LOCATION, "_")

# Raw PCM from mic → explicit decoding config
recognition_config = cloud_speech_types.RecognitionConfig(
    explicit_decoding_config=cloud_speech_types.ExplicitDecodingConfig(
        encoding=cloud_speech_types.ExplicitDecodingConfig.AudioEncoding.LINEAR16,
        sample_rate_hertz=RATE,
        audio_channel_count=1,
    ),
    language_codes=LANGUAGE_CODES,
    model=MODEL,
)

# ---- Streaming features: interim + VAD events ----
streaming_features = cloud_speech_types.StreamingRecognitionFeatures(
    interim_results=True,              # 👈 stream partials in real time
    enable_voice_activity_events=True, # 👈 get VAD events (can tune timeouts)
    # Optional: customize VAD timeouts
    # voice_activity_timeout=cloud_speech_types.StreamingRecognitionFeatures.VoiceActivityTimeout(
    #     speech_start_timeout=Duration(seconds=10),
    #     speech_end_timeout=Duration(seconds=10),
    # ),
)

streaming_config = cloud_speech_types.StreamingRecognitionConfig(
    config=recognition_config,
    streaming_features=streaming_features,
)

config_request = cloud_speech_types.StreamingRecognizeRequest(
    recognizer=recognizer,
    streaming_config=streaming_config,
)

# ---------- Mic plumbing ----------
audio_q = queue.Queue()
pa = pyaudio.PyAudio()

stream = pa.open(
    format=pyaudio.paInt16,
    channels=1,
    rate=RATE,
    input=True,
    frames_per_buffer=CHUNK,
    # Push chunks into the queue from callback thread
    stream_callback=lambda in_data, frame_count, time_info, status_flags: (
        audio_q.put(in_data) or (None, pyaudio.paContinue)
    ),
)

def request_generator():
    # 1st message: config
    yield config_request

    # Then: pure audio chunks
    while True:
        data = audio_q.get()
        if data is None:
            return
        yield cloud_speech_types.StreamingRecognizeRequest(audio=data)

print("🎤 Speak into the microphone... (Ctrl+C to stop)")
stream.start_stream()

try:
    responses = client.streaming_recognize(requests=request_generator())
    for response in responses:
        # If server sends a speech event (start/end etc.)
        if response.speech_event_type:
            print("EVENT:", response.speech_event_type)

        for result in response.results:
            text = result.alternatives[0].transcript
            if result.is_final:
                print("FINAL:  ", text)
            else:
                # Overwrite same line for smooth interim display
                print("\rINTERIM:", text, end="", flush=True)

except KeyboardInterrupt:
    print("\nStopping...")

finally:
    audio_q.put(None)
    stream.stop_stream()
    stream.close()
    pa.terminate()
