from __future__ import annotations

from typing import Any
from uuid import uuid4

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from backend.app.graph import OLLAMA_BASE_URL, OLLAMA_MODEL, run_chat


class TransactionContext(BaseModel):
    """백그라운드 이상거래 탐지 입력. 모두 합성 데이터다."""

    amount: int = Field(default=0, ge=0, le=1_000_000_000)
    payee: str = Field(default="", max_length=64)
    hour: int = Field(default=12, ge=0, le=23)
    in_call: bool = False
    new_device_or_app: bool = False
    limit_raised: bool = False
    recent_transfer_count: int = Field(default=0, ge=0, le=50)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    session_id: str | None = Field(default=None, min_length=1, max_length=120, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]*$")
    transaction: TransactionContext | None = None

    @field_validator("message")
    @classmethod
    def message_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("메시지는 공백일 수 없습니다.")
        return value


app = FastAPI(title="AI_Finance_Sec Local LangGraph API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["content-type"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "provider": "ollama",
        "model": OLLAMA_MODEL,
        "ollama_base_url": OLLAMA_BASE_URL,
        "memory": "demo-only-in-memory",
    }


@app.post("/api/chat")
async def chat(request: ChatRequest) -> dict:
    session_id = request.session_id or f"demo-{uuid4()}"
    transaction: dict[str, Any] | None = request.transaction.model_dump() if request.transaction else None
    return await run_chat(request.message.strip(), session_id, transaction)
