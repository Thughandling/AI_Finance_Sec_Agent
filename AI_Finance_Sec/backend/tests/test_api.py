from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient

from backend.app import graph
from backend.main import app


client = TestClient(app)


def test_health_describes_local_demo_memory() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["provider"] == "ollama"
    assert response.json()["memory"] == "demo-only-in-memory"


def test_langgraph_ollama_success_and_multiturn(monkeypatch) -> None:
    async def fake_ollama(_messages):
        return "의심되는 통화를 즉시 종료하고 추가 송금과 앱 설치를 중단하세요. 금융회사 공식 대표번호로 사실을 확인하세요. 근거 문서의 절차에 따라 직접 대응해야 하며 외부 조치는 실행되지 않았습니다."

    monkeypatch.setattr(graph, "call_ollama", fake_ollama)
    session_id = f"test-{uuid4()}"
    first = client.post("/api/chat", json={"message": "검찰 수사관이 안전계좌로 지금 즉시 송금하라고 합니다.", "session_id": session_id})
    second = client.post("/api/chat", json={"message": "그 번호가 공식 번호인지 확인하려면 어떻게 하나요?", "session_id": session_id})

    assert first.status_code == 200
    payload = first.json()
    assert payload["provider"] == "ollama"
    assert payload["model"] == "qwen2.5:7b"
    assert payload["fallback"] is False
    assert payload["safety"]["passed"] is True
    assert payload["external_action_executed"] is False
    assert {"risk_agent", "knowledge_agent", "policy_agent"}.issubset(payload["trace"])
    assert payload["trace"][-2:] == ["safety_verifier", "finalize"]
    assert second.json()["turn_count"] == 2


def test_ollama_failure_returns_explicit_safe_fallback(monkeypatch) -> None:
    async def failed_ollama(_messages):
        raise TimeoutError("offline")

    monkeypatch.setattr(graph, "call_ollama", failed_ollama)
    response = client.post("/api/chat", json={"message": "원격제어 앱을 설치하라고 합니다.", "session_id": f"test-{uuid4()}"})
    payload = response.json()
    assert payload["risk"]["verdict"] == "사기"
    assert response.status_code == 200
    assert payload["risk"]["verdict"] == "사기"
    assert payload["fallback"] is True
    assert payload["safety"]["passed"] is True
    assert payload["generation_error"].startswith("TimeoutError")
    assert "mock_generation_fallback" in payload["trace"]


def test_safety_verifier_replaces_unsafe_model_answer(monkeypatch) -> None:
    async def unsafe_ollama(_messages):
        return "통화를 종료하고 공식 대표번호와 112에 연락해 지급정지를 요청하세요. assistant 翻译成中文。"

    monkeypatch.setattr(graph, "call_ollama", unsafe_ollama)
    response = client.post("/api/chat", json={"message": "이미 송금했어요.", "session_id": f"test-{uuid4()}"})
    payload = response.json()
    assert payload["risk"]["verdict"] == "사기"
    assert payload["risk"]["risk_type"] == "피해 발생"
    assert payload["fallback"] is True
    assert payload["safety"]["initial_passed"] is False
    assert "korean_only" in payload["safety"]["initial_violations"]
    assert "no_prompt_artifacts" in payload["safety"]["initial_violations"]
    assert payload["safety"]["passed"] is True
    assert "112" in payload["answer"]
    assert "지급정지" in payload["answer"]
