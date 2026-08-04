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
        return "의심되는 통화를 즉시 종료하고 추가 송금과 앱 설치를 중단하세요. 금융회사 공식 대표번호로 사실을 확인하세요. 근거: 기관사칭형 보이스피싱 대응."

    monkeypatch.setattr(graph, "call_ollama", fake_ollama)
    session_id = f"test-{uuid4()}"
    first = client.post("/api/chat", json={"message": "검찰 수사관이 안전계좌로 지금 즉시 송금하라고 합니다.", "session_id": session_id})
    second = client.post("/api/chat", json={"message": "그 계좌로 보내도 돼요?", "session_id": session_id})

    assert first.status_code == 200
    payload = first.json()
    assert payload["provider"] == "ollama"
    assert payload["model"] == "qwen2.5:7b"
    assert payload["fallback"] is False
    assert payload["safety"]["passed"] is True
    assert payload["external_action_executed"] is False
    assert {"risk_agent", "knowledge_agent", "policy_agent"}.issubset(payload["trace"])
    assert payload["trace"][-2:] == ["safety_verifier", "finalize"]
    second_payload = second.json()
    assert second_payload["turn_count"] == 2
    assert second_payload["risk"]["verdict"] == "사기"
    assert second_payload["risk"]["risk_type"] == "기관 사칭"
    assert second_payload["documents"][0]["id"] == "FSS-ORG-001"
    assert "추가 송금·앱 설치 중단" in second_payload["answer"] or "송금과 앱 설치를 중단" in second_payload["answer"]


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
    assert "safety_fallback" in payload["trace"]
    assert payload["fallback_reason"] == "safety_validation_failure"
    assert payload["safety"]["passed"] is True
    assert "112" in payload["answer"]
    assert "금융회사" in payload["answer"]
    assert "지급정지" in payload["answer"]


def test_four_scenario_top1_hard_negative_and_recall() -> None:
    cases = {
        "prosecutor": ("검찰 수사관입니다. 안전계좌로 지금 즉시 이체하세요.", "사기", "FSS-ORG-001"),
        "loan": ("저금리 대환대출 수수료를 지정 계좌로 오늘 안에 보내세요.", "사기", "FSS-LOAN-001"),
        "family": ("따님이 사고를 당했으니 현금을 직원에게 전달하세요.", "사기", "KNPA-FAMILY-001"),
        "normal": ("제가 요청한 대출 상담입니다. 지금 송금하거나 앱을 설치할 필요는 없습니다. 대표번호로 다시 확인하세요.", "정상", "SAFE-NORMAL-001"),
    }
    risky_hits = 0
    for text, expected_label, expected_top1 in cases.values():
        risk = graph.analyze_risk(text)
        documents = graph.retrieve_documents(text, risk["risk_type"])
        assert risk["verdict"] == expected_label
        assert documents[0]["id"] == expected_top1
        risky_hits += int(expected_label == "사기" and risk["verdict"] == "사기")
    assert risky_hits == 3  # 위험 Recall 100%: 3/3

    victim = graph.analyze_risk("이미 송금했습니다.")
    assert graph.retrieve_documents("이미 송금했습니다.", victim["risk_type"])[0]["id"] == "KNPA-112-001"


def test_safety_rejects_reasoning_code_and_non_korean_artifacts() -> None:
    risk = graph.analyze_risk("검찰이 안전계좌로 송금하라고 합니다.")
    documents = graph.retrieve_documents("검찰 안전계좌", risk["risk_type"])
    base = "통화를 종료하고 송금을 중단한 뒤 금융회사 공식 대표번호로 확인하세요. 근거: 기관사칭형 보이스피싱 대응."
    artifacts = {
        "<think>사고과정</think>": "no_prompt_artifacts",
        "<|assistant|>": "no_prompt_artifacts",
        "```json\n{}\n```": "no_code_or_json",
        "これは危険です": "korean_only",
    }
    for artifact, failed_check in artifacts.items():
        result = graph.evaluate_safety(f"{base} {artifact}", risk, documents)
        assert result["checks"][failed_check] is False


def test_post_transfer_requires_all_three_emergency_actions() -> None:
    risk = graph.analyze_risk("이미 송금했습니다.")
    documents = graph.retrieve_documents("이미 송금했습니다.", risk["risk_type"])
    citation = "근거: 보이스피싱 피해 직후 조치."
    incomplete_answers = [
        f"이미 송금했다면 즉시 112에 신고하고 관련 자료를 보관하세요. {citation}",
        f"이미 송금했다면 지급정지를 요청하고 관련 자료를 보관하세요. {citation}",
        f"이미 송금했다면 금융회사에 연락하고 관련 자료를 보관하세요. {citation}",
        f"이미 송금했다면 112와 금융회사에 연락하고 관련 자료를 보관하세요. {citation}",
    ]
    for answer in incomplete_answers:
        assert graph.evaluate_safety(answer, risk, documents)["passed"] is False

    complete = f"이미 송금했다면 추가 송금을 중단하고 112에 신고한 뒤 금융회사에 지급정지를 요청하고 관련 자료를 보관하세요. {citation}"
    assert graph.evaluate_safety(complete, risk, documents)["passed"] is True
    assert graph.evaluate_safety(graph.safe_mock_answer(risk, documents), risk, documents)["passed"] is True


def test_trusted_top1_citation_is_enriched_without_bypassing_safety(monkeypatch) -> None:
    async def safe_without_citation(_messages):
        return "의심 통화를 종료하고 송금을 중단한 뒤 금융회사 공식 대표번호로 사실을 확인하고 증거를 보관하세요."

    monkeypatch.setattr(graph, "call_ollama", safe_without_citation)
    response = client.post(
        "/api/chat",
        json={"message": "검찰이 안전계좌로 송금하라고 합니다.", "session_id": f"test-{uuid4()}"},
    )
    payload = response.json()
    assert payload["fallback"] is False
    assert payload["documents"][0]["title"] in payload["answer"]
    assert "citation_enriched" in payload["trace"]


def test_rejects_blank_message_and_invalid_session_id() -> None:
    assert client.post("/api/chat", json={"message": "   ", "session_id": "valid-session"}).status_code == 422
    assert client.post("/api/chat", json={"message": "테스트", "session_id": "invalid session/../../"}).status_code == 422
