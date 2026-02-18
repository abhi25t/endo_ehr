"""
Voice-Controlled Endoscopy EHR — FastAPI Backend

Serves the frontend HTML/JS, and provides a WebSocket endpoint for
real-time voice dictation → ASR → LLM → EHR JSON updates.

Usage:
    python server.py                    # Start on port 8000
    python server.py --port 9000        # Custom port

Then open http://localhost:8000 in Chrome.
"""

import asyncio
import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.websockets import WebSocketState

from schema_builder import build_schema
from models import validate_llm_response

# ── Logging ──
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("ehr-voice")

# ── Paths ──
PROJECT_DIR = Path(__file__).parent
SRC_DIR = PROJECT_DIR / "src"
PHRASESET_FILE = PROJECT_DIR / "endoscopy_phraseset.txt"


def _load_phrase_hints() -> list[str]:
    """Load phrase hints from endoscopy_phraseset.txt (one phrase per line)."""
    if not PHRASESET_FILE.exists():
        log.warning("Phrase set file not found: %s", PHRASESET_FILE)
        return []
    lines = PHRASESET_FILE.read_text(encoding="utf-8").splitlines()
    hints = [line.strip() for line in lines if line.strip()]
    log.info("Loaded %d phrase hints from %s", len(hints), PHRASESET_FILE.name)
    return hints

# ── App ──
app = FastAPI(title="Endoscopy EHR Voice Server")


# ── Static file serving ──

@app.get("/")
async def index():
    return FileResponse(SRC_DIR / "Endo_EHR.html")


app.mount("/js", StaticFiles(directory=SRC_DIR / "js"), name="js")
app.mount("/pictures", StaticFiles(directory=PROJECT_DIR / "pictures"), name="pictures")


# ── Session state per WebSocket connection ──

FILLER_WORDS = {"um", "uh", "ah", "okay", "ok", "so", "like", "yeah", "yes", "hmm", "hm"}

VOICE_COMMANDS = {
    "pause dictation", "stop recording", "pause",
    "resume dictation", "start recording", "resume",
    "capture photo", "take photo", "take picture", "take a photo",
}


@dataclass
class SessionState:
    """Per-WebSocket-connection state."""
    audio_queue: asyncio.Queue = field(default_factory=asyncio.Queue)
    transcript_queue: asyncio.Queue = field(default_factory=asyncio.Queue)

    current_report: dict = field(default_factory=dict)
    overall_remarks: str = ""
    ehr_schema: Optional[dict] = None
    phrase_hints: list = field(default_factory=list)

    paused: bool = False           # Voice pause command active
    llm_busy: bool = False
    cancel_event: asyncio.Event = field(default_factory=asyncio.Event)
    tasks: list = field(default_factory=list)


def is_garbage(text: str) -> bool:
    """Check if transcript is too short/filler to warrant an LLM call."""
    words = [w for w in text.lower().split() if w not in FILLER_WORDS]
    return len(words) < 2


def detect_voice_command(text: str) -> Optional[str]:
    """Check if transcript matches a known voice command."""
    normalized = text.strip().lower().rstrip(".")
    for cmd in VOICE_COMMANDS:
        if cmd in normalized:
            return cmd
    return None


async def send_safe(ws: WebSocket, data: dict):
    """Send JSON to WebSocket, ignoring errors if connection is closing."""
    try:
        if ws.client_state == WebSocketState.CONNECTED:
            await ws.send_text(json.dumps(data))
    except Exception:
        pass


# ── Transcript Batcher ──

DEBOUNCE_SECONDS = 1.5


async def transcript_batcher(ws: WebSocket, session: SessionState):
    """
    Consumes transcript_queue, debounces rapid finals, calls LLM, sends results.

    State machine:
    - IDLE: waiting for transcripts
    - DEBOUNCING: received a final, waiting for more finals or timeout
    - LLM_BUSY: sent to LLM, accumulating new transcripts for next batch
    """
    accumulated = []

    while not session.cancel_event.is_set():
        try:
            msg = await asyncio.wait_for(
                session.transcript_queue.get(), timeout=1.0
            )
        except asyncio.TimeoutError:
            continue

        if "error" in msg:
            await send_safe(ws, {"type": "error", "message": msg["error"]})
            continue

        if "info" in msg:
            await send_safe(ws, {"type": "info", "message": msg["info"]})
            continue

        # Forward interim transcripts to frontend for display
        if not msg.get("is_final"):
            await send_safe(ws, {
                "type": "interim_transcript",
                "text": msg["text"],
            })
            continue

        final_text = msg["text"]

        # Check for voice commands BEFORE accumulating
        cmd = detect_voice_command(final_text)
        if cmd:
            await _handle_voice_command(ws, session, cmd, final_text)
            continue

        # Send final transcript to frontend for display
        await send_safe(ws, {"type": "final_transcript", "text": final_text})

        # If paused, don't accumulate for LLM
        if session.paused:
            continue

        accumulated.append(final_text)

        # Debounce: keep collecting finals until silence
        while True:
            try:
                msg2 = await asyncio.wait_for(
                    session.transcript_queue.get(),
                    timeout=DEBOUNCE_SECONDS,
                )
                if "error" in msg2 or "info" in msg2:
                    continue
                if not msg2.get("is_final"):
                    await send_safe(ws, {
                        "type": "interim_transcript",
                        "text": msg2["text"],
                    })
                    continue

                final2 = msg2["text"]
                cmd2 = detect_voice_command(final2)
                if cmd2:
                    await _handle_voice_command(ws, session, cmd2, final2)
                    continue

                await send_safe(ws, {"type": "final_transcript", "text": final2})
                if not session.paused:
                    accumulated.append(final2)

            except asyncio.TimeoutError:
                break

        if not accumulated:
            continue

        # Batch text and send to LLM
        batch_text = " ".join(accumulated)
        accumulated = []

        if is_garbage(batch_text):
            log.debug("Skipping garbage transcript: %s", batch_text[:80])
            continue

        session.llm_busy = True
        await send_safe(ws, {"type": "status", "llm": "processing"})

        try:
            updated = await call_llm_wrapper(session, batch_text)
            if updated is not None:
                session.current_report = updated.get("report", {})
                session.overall_remarks = updated.get("overallRemarks", "")
                await send_safe(ws, {
                    "type": "report_update",
                    "report": session.current_report,
                    "overallRemarks": session.overall_remarks,
                })
            else:
                await send_safe(ws, {
                    "type": "error",
                    "message": "LLM returned invalid response",
                })
        except Exception as e:
            log.exception("LLM error")
            await send_safe(ws, {
                "type": "error",
                "message": f"LLM error: {str(e)}",
            })
        finally:
            session.llm_busy = False
            await send_safe(ws, {"type": "status", "llm": "idle"})

        # Drain any transcripts that arrived during LLM processing
        while not session.transcript_queue.empty():
            try:
                msg3 = session.transcript_queue.get_nowait()
                if msg3.get("is_final"):
                    cmd3 = detect_voice_command(msg3["text"])
                    if cmd3:
                        await _handle_voice_command(ws, session, cmd3, msg3["text"])
                    elif not session.paused:
                        accumulated.append(msg3["text"])
                        await send_safe(ws, {"type": "final_transcript", "text": msg3["text"]})
            except asyncio.QueueEmpty:
                break


async def _handle_voice_command(ws: WebSocket, session: SessionState, cmd: str, text: str):
    """Handle a detected voice command."""
    await send_safe(ws, {"type": "final_transcript", "text": text})

    if cmd in ("pause dictation", "stop recording", "pause"):
        session.paused = True
        await send_safe(ws, {"type": "status", "paused": True})
        log.info("Dictation paused by voice command")
    elif cmd in ("resume dictation", "start recording", "resume"):
        session.paused = False
        await send_safe(ws, {"type": "status", "paused": False})
        log.info("Dictation resumed by voice command")
    elif cmd in ("capture photo", "take photo", "take picture", "take a photo"):
        await send_safe(ws, {"type": "capture_photo"})
        log.info("Capture photo command received")


async def call_llm_wrapper(session: SessionState, transcript: str) -> dict | None:
    """
    Call the LLM to update EHR JSON from transcript.
    Returns dict with {report, overallRemarks} or None.
    """
    try:
        from llm_caller import call_llm
        result = await call_llm(
            session.ehr_schema,
            session.current_report,
            session.overall_remarks,
            transcript,
        )
        if result is None:
            log.warning("LLM returned None for transcript: %s", transcript[:80])
            return None

        log.info("LLM response: %d locations", len(result.get("report", {})))

        # Validate with Pydantic
        validated = validate_llm_response(result, session.ehr_schema)
        if validated is None:
            log.warning(
                "LLM response failed validation. Raw keys: %s",
                list(result.keys()) if isinstance(result, dict) else type(result),
            )
            return None

        return {
            "report": {k: v.model_dump() for k, v in validated.report.items()},
            "overallRemarks": validated.overallRemarks,
        }
    except ImportError:
        log.warning("llm_caller not available yet — returning None")
        return None


# ── WebSocket endpoint ──

@app.websocket("/ws/voice")
async def voice_ws(ws: WebSocket):
    await ws.accept()
    session = SessionState()
    log.info("WebSocket connection accepted")

    try:
        # Wait for init message
        init_raw = await asyncio.wait_for(ws.receive_text(), timeout=10.0)
        init_data = json.loads(init_raw)

        if init_data.get("type") != "init":
            await send_safe(ws, {
                "type": "error",
                "message": "First message must be type:init",
            })
            await ws.close()
            return

        # Parse CSV and build schema
        csv_text = init_data.get("csv_text", "")
        if csv_text:
            session.ehr_schema = build_schema(csv_text)
            session.phrase_hints = _load_phrase_hints()
            log.info(
                "Schema built: %d diseases, %d phrase hints",
                len(session.ehr_schema.get("diseases", {})),
                len(session.phrase_hints),
            )
        else:
            log.warning("No CSV text in init message")

        session.current_report = init_data.get("report", {})
        session.overall_remarks = init_data.get("overallRemarks", "")

        # Start ASR bridge
        try:
            from asr_bridge import run_asr_bridge
            asr_task = asyncio.create_task(
                run_asr_bridge(ws, session)
            )
            session.tasks.append(asr_task)
            log.info("ASR bridge started")
        except ImportError:
            log.warning("asr_bridge not available — ASR disabled")

        # Start transcript batcher
        batcher_task = asyncio.create_task(
            transcript_batcher(ws, session)
        )
        session.tasks.append(batcher_task)

        await send_safe(ws, {"type": "status", "asr": "active"})

        # Main receive loop
        while True:
            message = await ws.receive()

            if "bytes" in message:
                # Binary frame = audio data
                await session.audio_queue.put(message["bytes"])

            elif "text" in message:
                data = json.loads(message["text"])
                msg_type = data.get("type")

                if msg_type == "report_state":
                    session.current_report = data.get("report", {})
                    session.overall_remarks = data.get("overallRemarks", "")
                elif msg_type == "stop":
                    log.info("Stop message received")
                    break

    except WebSocketDisconnect:
        log.info("WebSocket disconnected")
    except asyncio.TimeoutError:
        log.warning("Timeout waiting for init message")
    except Exception:
        log.exception("WebSocket error")
    finally:
        session.cancel_event.set()
        await session.audio_queue.put(None)  # Sentinel to stop ASR

        for task in session.tasks:
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass

        log.info("Session cleaned up")


# ── Entrypoint ──

if __name__ == "__main__":
    import argparse
    import uvicorn

    parser = argparse.ArgumentParser(description="Endoscopy EHR Voice Server")
    parser.add_argument("--port", type=int, default=8000, help="Port to listen on")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind to")
    args = parser.parse_args()

    uvicorn.run(app, host=args.host, port=args.port)
