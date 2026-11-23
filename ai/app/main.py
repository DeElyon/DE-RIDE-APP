import os
from typing import Annotated

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.safety.content_filter import is_safe
from app.services.groq_service import generate
from app.services.persona_engine import system_prompt

app = FastAPI(title="DE RIDE Amebo AI", version="1.0.0")


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    language: str = Field(default="PCM", pattern="^(EN|YO|HA|IG|PCM)$")
    persona: str = Field(default="passenger", pattern="^(passenger|driver|biker|dispatch_rider|operator)$")


class TriviaRequest(BaseModel):
    language: str = Field(default="PCM", pattern="^(EN|YO|HA|IG|PCM)$")
    corridor: str = Field(default="", max_length=120)


def require_internal_key(value: str | None) -> None:
    secret = os.getenv("INTERNAL_AI_SHARED_SECRET", "")
    if not secret or value != secret:
        raise HTTPException(status_code=401, detail="invalid internal service key")


@app.get("/healthz")
async def health():
    return {"status": "ok", "provider_configured": bool(os.getenv("GROQ_API_KEY"))}


@app.post("/ai/v1/chat")
async def chat(body: ChatRequest, x_internal_service_key: str | None = Header(default=None)):
    require_internal_key(x_internal_service_key)
    if not is_safe(body.message):
        raise HTTPException(status_code=422, detail="prompt is not allowed")
    reply = await generate(system_prompt(body.language, body.persona), body.message)
    return {"reply": reply, "token_cost": 1}


@app.post("/ai/v1/trivia")
async def trivia(body: TriviaRequest, x_internal_service_key: str | None = Header(default=None)):
    require_internal_key(x_internal_service_key)
    route = f" along {body.corridor}" if body.corridor else ""
    prompt = f"Ask one short, family-friendly Nigerian road and geography trivia question{route}. Do not provide its answer yet. Reply in {body.language}."
    return {"question": await generate(system_prompt(body.language, "passenger"), prompt), "token_cost": 1}


@app.post("/ai/v1/voice")
async def voice(audio: Annotated[UploadFile, File()], x_internal_service_key: Annotated[str | None, Header()] = None):
    require_internal_key(x_internal_service_key)
    allowed = {"audio/webm", "audio/ogg", "audio/wav", "audio/mpeg", "audio/mp4", "audio/m4a", "audio/x-m4a"}
    if audio.content_type not in allowed:
        raise HTTPException(status_code=415, detail="unsupported audio type")
    content = await audio.read(20 * 1024 * 1024 + 1)
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="audio file exceeds 20 MiB")
    if not content:
        raise HTTPException(status_code=422, detail="audio file is empty")
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=503, detail="AI provider is not configured")
    from groq import AsyncGroq

    client = AsyncGroq(api_key=api_key)
    result = await client.audio.transcriptions.create(
        file=(audio.filename or "voice.webm", content, audio.content_type),
        model=os.getenv("GROQ_WHISPER_MODEL", "whisper-large-v3"),
        response_format="text",
    )
    return {"transcription": str(result), "token_cost": 2}
