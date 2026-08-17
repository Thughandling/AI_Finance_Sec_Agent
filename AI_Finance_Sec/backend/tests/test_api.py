from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.app import graph
from backend.main import app


client = TestClient(app)
EVALUATION_PATH = Path(__file__).parents[2] / "public" / "data" / "evaluation_cases.json"
HOLDOUT_PATH = Path(__file__).parents[2] / "public" / "data" / "evaluation_holdout.json"


def _structured(**overrides):
    value = {
        "state": "normal", "risk_type": "정상 절차", "completed_action": False, "external_actor": False,
        "requested_asset": {"financial_value": False, "credential": False, "remote_control": False, "identity": False},
        "action_polarity": "self_action", "destination": "self", "confidence": 0.93, "evidence_spans": [],
    }
    value.update(overrides)
    return value


def test_structured_json_parsing_conservative_fusion_and_failure(monkeypatch) -> None:
    fraud = _structured(state="fraud", risk_type="기업 사칭 BEC", external_actor=True, action_polarity="requested", destination="external", confidence=0.91)
    parsed = graph.parse_structured_risk(json.dumps(fraud, ensure_ascii=False))
    fused = graph.fuse_risk(graph.analyze_risk("모르는 요청입니다"), parsed)
    assert fused["verdict"] == "사기" and fused["level"] == "위험" and fused["risk_type"] == "기업 사칭 BEC"

    victim = _structured(state="victim", risk_type="개인정보 요구", completed_action=True, external_actor=True, action_polarity="completed", destination="external", confidence=0.88)
    assert graph.fuse_risk(graph.analyze_risk("자료를 줬어요"), victim)["risk_type"] == "피해 발생"

    disagreement = _structured(state="normal", confidence=0.9)
    cautious = graph.fuse_risk(graph.analyze_risk("검찰이 안전계좌로 송금하래요"), disagreement)
    assert cautious["verdict"] == "사기" and cautious["level"] in {"주의", "위험"}

    async def invalid(_context):
        return "not-json"
    monkeypatch.setattr(graph, "call_ollama_structured", invalid)
    result = asyncio.run(graph.structured_risk_agent({"analysis_input": "검찰이 안전계좌로 송금하래요"}))
    assert result["structured_fallback"] is True
    assert result["risk"]["fusion"] == "rule_fallback"


def test_incident_summary_reset_and_progressive_preservation() -> None:
    first = graph.prepare_input({"user_input": "검찰 수사관이라고 전화했어요"})
    second = graph.prepare_input({"user_input": "범죄 연루라네요", "incident_summary": first["incident_summary"]})
    third = graph.prepare_input({"user_input": "그 계좌로 보내도 되나요", "incident_summary": second["incident_summary"]})
    assert "검찰 수사관" in third["analysis_input"] and "계좌로 보내" in third["analysis_input"]
    corrected = graph.prepare_input({"user_input": "정정합니다. 앞 문장은 예문이고 실제로 송금하지 않았습니다", "incident_summary": third["incident_summary"]})
    assert corrected["incident_status"] == "closed"
    assert "검찰 수사관" not in corrected["analysis_input"]
ROUND2_PATH = Path(__file__).parents[2] / "public" / "data" / "evaluation_adversarial_round2.json"
ROUND3_PATH = Path(__file__).parents[2] / "public" / "data" / "evaluation_adversarial_round3.json"


def test_shared_regression_set_confusion_category_rag_and_victim_policy_gates() -> None:
    dataset = json.loads(EVALUATION_PATH.read_text(encoding="utf-8"))
    cases = dataset["cases"]
    gates = dataset["quality_gates"]
    assert len(cases) >= 38
    assert len({case["id"] for case in cases}) == len(cases)

    tp = tn = fp = fn = 0
    category_results: dict[str, list[bool]] = defaultdict(list)
    rag_hits = 0
    for case in cases:
        risk = graph.analyze_risk(case["text"])
        predicted = "fraud" if risk["verdict"] == "사기" else "normal"
        correct = predicted == case["label"]
        category_results[case["category"]].append(correct)
        tp += int(case["label"] == "fraud" and predicted == "fraud")
        tn += int(case["label"] == "normal" and predicted == "normal")
        fp += int(case["label"] == "normal" and predicted == "fraud")
        fn += int(case["label"] == "fraud" and predicted == "normal")

        assert predicted == case["label"], f"{case['id']}: {case['failure_mode']}"
        assert risk["risk_type"] == case["expected_risk_type"], case["id"]
        top1 = graph.retrieve_documents(case["text"], risk["risk_type"])[0]["id"]
        rag_hits += int(top1 == case["expected_top1"])
        assert top1 == case["expected_top1"], case["id"]

        if case["category"] == "피해완료":
            actions = graph.recommend_policy(risk)["actions"]
            assert "1394 신고·상담" in actions
            assert "긴급 시 112 신고" in actions
            assert "해당 금융회사 콜센터에 지급정지 요청" in actions

    fraud_precision = tp / max(tp + fp, 1)
    fraud_recall = tp / max(tp + fn, 1)
    fraud_f1 = 2 * fraud_precision * fraud_recall / max(fraud_precision + fraud_recall, 1e-12)
    normal_precision = tn / max(tn + fn, 1)
    normal_recall = tn / max(tn + fp, 1)
    normal_f1 = 2 * normal_precision * normal_recall / max(normal_precision + normal_recall, 1e-12)
    macro_f1 = (fraud_f1 + normal_f1) / 2
    false_positive_rate = fp / max(fp + tn, 1)

    assert macro_f1 >= gates["min_macro_f1"]
    assert fraud_recall >= gates["min_fraud_recall"]
    assert false_positive_rate <= gates["max_false_positive_rate"]
    assert rag_hits / len(cases) >= gates["rag_top1_accuracy"]
    for category, results in category_results.items():
        assert sum(results) / len(results) >= gates["min_category_recall"], category


def test_separate_holdout_and_critical_cases() -> None:
    dataset = json.loads(HOLDOUT_PATH.read_text(encoding="utf-8"))
    cases = dataset["cases"]
    gates = dataset["quality_gates"]
    critical = [case for case in cases if case["critical"]]
    assert len(cases) >= 40
    assert len(critical) == 8
    assert len({case["family_id"] for case in cases}) == len(cases)

    tp = tn = fp = fn = rag_hits = rag_total = critical_hits = 0
    for case in cases:
        risk = graph.analyze_risk(case["text"])
        predicted = "fraud" if risk["verdict"] == "사기" else "normal"
        tp += int(case["label"] == "fraud" and predicted == "fraud")
        tn += int(case["label"] == "normal" and predicted == "normal")
        fp += int(case["label"] == "normal" and predicted == "fraud")
        fn += int(case["label"] == "fraud" and predicted == "normal")
        critical_hits += int(case["critical"] and predicted == case["label"])
        assert predicted == case["label"], case["id"]
        assert risk["risk_type"] == case["expected_risk_type"], case["id"]
        documents = graph.retrieve_documents(case["text"], risk["risk_type"])
        if case["expected_top1"] is None:
            assert documents == []
        else:
            rag_total += 1
            rag_hits += int(documents[0]["id"] == case["expected_top1"])
            assert documents[0]["id"] == case["expected_top1"], case["id"]
        if case["category"] == "피해완료":
            actions = graph.recommend_policy(risk)["actions"]
            assert {"1394 신고·상담", "긴급 시 112 신고", "해당 금융회사 콜센터에 지급정지 요청"}.issubset(actions)

    fraud_precision = tp / max(tp + fp, 1)
    fraud_recall = tp / max(tp + fn, 1)
    fraud_f1 = 2 * fraud_precision * fraud_recall / max(fraud_precision + fraud_recall, 1e-12)
    normal_precision = tn / max(tn + fn, 1)
    normal_recall = tn / max(tn + fp, 1)
    normal_f1 = 2 * normal_precision * normal_recall / max(normal_precision + normal_recall, 1e-12)
    assert (fraud_f1 + normal_f1) / 2 >= gates["min_macro_f1"]
    assert fraud_recall >= gates["min_fraud_recall"]
    assert fp / max(fp + tn, 1) <= gates["max_false_positive_rate"]
    assert critical_hits / len(critical) >= gates["min_critical_recall"]
    assert rag_hits / rag_total >= gates["min_rag_top1_accuracy"]


def test_adversarial_rounds_cover_single_turn_rag_and_multiturn(monkeypatch) -> None:
    round2 = json.loads(ROUND2_PATH.read_text(encoding="utf-8"))
    round3 = json.loads(ROUND3_PATH.read_text(encoding="utf-8"))
    for case in [*round2["cases"], *round3["single_turn"]]:
        risk = graph.analyze_risk(case["text"])
        assert ("fraud" if risk["verdict"] == "사기" else "normal") == case["label"], case["id"]
        assert risk["risk_type"] == case["expected_risk_type"], case["id"]
    for case in round3["rag"]:
        documents = graph.retrieve_documents(case["query"], case["risk_type"])
        assert (documents[0]["id"] if documents else None) == case["expected"], case["id"]
        assert (documents[0]["retrieval_mode"] if documents else None) == case["mode"], case["id"]

    async def fake_ollama(_messages):
        return "금융회사 공식 대표번호로 사실을 확인하고 필요한 자료를 보관하세요."

    monkeypatch.setattr(graph, "call_ollama", fake_ollama)
    for case in round3["multi_turn"]:
        session_id = f"adversarial-{case['id']}-{uuid4()}"
        payload = None
        for turn in case["turns"]:
            response = client.post("/api/chat", json={"message": turn, "session_id": session_id})
            assert response.status_code == 200
            payload = response.json()
        assert payload is not None
        assert payload["risk"]["verdict"] == case["expected"], case["id"]


def test_health_describes_local_demo_memory() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["provider"] == "ollama"
    assert response.json()["memory"] == "demo-only-in-memory"


def test_langgraph_ollama_success_and_multiturn(monkeypatch) -> None:
    async def fake_ollama(_messages):
        return "의심되는 통화를 즉시 종료하고 추가 송금과 앱 설치를 중단하세요. 금융회사 공식 대표번호로 사실을 확인하고 증거를 보관하세요."

    monkeypatch.setattr(graph, "call_ollama", fake_ollama)
    session_id = f"test-{uuid4()}"
    first = client.post("/api/chat", json={"message": "검찰 수사관이 안전계좌로 지금 즉시 송금하라고 합니다.", "session_id": session_id})
    second = client.post("/api/chat", json={"message": "그 계좌로 보내도 돼요?", "session_id": session_id})

    assert first.status_code == 200
    payload = first.json()
    assert payload["provider"] == "ollama"
    assert payload["model"] == "qwen2.5:7b"
    assert payload["fallback"] is False
    assert payload["response_mode"] == "guarded_policy"
    assert payload["llm_invoked"] is True
    assert payload["policy_guardrail_applied"] is True
    assert payload["safety"]["passed"] is True
    assert payload["external_action_executed"] is False
    assert {"structured_risk_agent_failed", "rule_risk_fallback", "knowledge_agent", "policy_agent"}.issubset(payload["trace"])
    assert "policy_guardrail" in payload["trace"]
    assert payload["trace"][-2:] == ["safety_verifier", "finalize"]
    second_payload = second.json()
    assert second_payload["turn_count"] == 2
    assert second_payload["risk"]["verdict"] == "사기"
    assert second_payload["risk"]["risk_type"] == "기관 사칭"
    assert second_payload["documents"][0]["id"] == "FSS-ORG-001"
    assert second_payload["response_mode"] == "guarded_policy"
    assert "통화 즉시 종료" in second_payload["answer"]
    assert "추가 송금·앱 설치 중단" in second_payload["answer"]
    assert "공식 대표번호·앱에서 사실 확인" in second_payload["answer"]


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
    assert payload["response_mode"] == "mock_fallback"
    assert payload["llm_invoked"] is True
    assert payload["policy_guardrail_applied"] is False
    assert payload["safety"]["passed"] is True
    assert payload["generation_error"].startswith("TimeoutError")
    assert "mock_generation_fallback" in payload["trace"]


def test_safety_verifier_replaces_unsafe_model_answer(monkeypatch) -> None:
    async def unsafe_ollama(_messages):
        return "통화를 종료하고 1394와 공식 대표번호에 연락하며 긴급 시 112에 신고하고 금융회사에 지급정지를 요청하세요. assistant 翻译成中文。"

    monkeypatch.setattr(graph, "call_ollama", unsafe_ollama)
    response = client.post("/api/chat", json={"message": "이미 송금했어요.", "session_id": f"test-{uuid4()}"})
    payload = response.json()
    assert payload["risk"]["verdict"] == "사기"
    assert payload["risk"]["risk_type"] == "피해 발생"
    assert payload["fallback"] is False
    assert payload["response_mode"] == "guarded_policy"
    assert payload["policy_guardrail_applied"] is True
    assert payload["safety"]["initial_passed"] is False
    assert "korean_only" in payload["safety"]["initial_violations"]
    assert "no_prompt_artifacts" in payload["safety"]["initial_violations"]
    assert "policy_guardrail" in payload["trace"]
    assert "safety_fallback" not in payload["trace"]
    assert payload["fallback_reason"] is None
    assert payload["safety"]["passed"] is True
    assert "1394" in payload["answer"]
    assert "긴급 시 112" in payload["answer"]
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
    assert graph.retrieve_documents("이미 송금했습니다.", victim["risk_type"])[0]["id"] == "KNPA-1394-001"


def test_safety_rejects_reasoning_code_and_non_korean_artifacts() -> None:
    risk = graph.analyze_risk("검찰이 안전계좌로 송금하라고 합니다.")
    documents = graph.retrieve_documents("검찰 안전계좌", risk["risk_type"])
    base = "통화를 종료하고 송금을 중단한 뒤 금융회사 공식 대표번호로 사실을 확인하고 관련 증거를 보관하세요."
    artifacts = {
        "<think>사고과정</think>": "no_prompt_artifacts",
        "<|assistant|>": "no_prompt_artifacts",
        "```json\n{}\n```": "no_code_or_json",
        "これは危険です": "korean_only",
    }
    for artifact, failed_check in artifacts.items():
        result = graph.evaluate_safety(f"{base} {artifact}", risk, documents)
        assert result["checks"][failed_check] is False


def test_post_transfer_requires_all_four_response_actions() -> None:
    risk = graph.analyze_risk("이미 송금했습니다.")
    documents = graph.retrieve_documents("이미 송금했습니다.", risk["risk_type"])
    incomplete_answers = [
        "이미 송금했다면 추가 송금을 중단하고 긴급 시 112에 신고한 뒤 금융회사에 지급정지를 요청하고 공식 안내를 확인하세요.",
        "이미 송금했다면 추가 송금을 중단하고 1394에 신고·상담한 뒤 금융회사에 지급정지를 요청하고 공식 안내를 확인하세요.",
        "이미 송금했다면 추가 송금을 중단하고 1394에 신고·상담하고 긴급 시 112에 신고한 뒤 지급정지를 요청하세요.",
        "이미 송금했다면 추가 송금을 중단하고 1394에 신고·상담하고 긴급 시 112에 신고한 뒤 금융회사에 연락하세요.",
    ]
    for answer in incomplete_answers:
        assert graph.evaluate_safety(answer, risk, documents)["passed"] is False

    complete = "이미 송금했다면 추가 송금을 중단하고 1394에 신고·상담한 뒤 긴급 시 112에 신고하고 해당 금융회사에 지급정지를 요청하세요."
    assert graph.evaluate_safety(complete, risk, documents)["passed"] is True
    assert graph.evaluate_safety(graph.safe_mock_answer(risk, documents), risk, documents)["passed"] is True


def test_model_answer_is_not_modified_with_document_title(monkeypatch) -> None:
    async def safe_without_citation(_messages):
        return "의심 통화를 종료하고 송금을 중단한 뒤 금융회사 공식 대표번호로 사실을 확인하고 증거를 보관하세요."

    monkeypatch.setattr(graph, "call_ollama", safe_without_citation)
    response = client.post(
        "/api/chat",
        json={"message": "제가 요청한 상담의 영업시간을 확인하고 싶습니다.", "session_id": f"test-{uuid4()}"},
    )
    payload = response.json()
    assert payload["fallback"] is False
    assert payload["response_mode"] == "guarded_policy"
    assert payload["policy_guardrail_applied"] is True
    assert payload["answer"] != "의심 통화를 종료하고 송금을 중단한 뒤 금융회사 공식 대표번호로 사실을 확인하고 증거를 보관하세요."
    assert "강한 사기 징후 없음" in payload["answer"]
    assert "새로운 송금·앱 설치 요구 시 중단" in payload["answer"]
    assert "불필요한 개인정보 제공 금지" in payload["answer"]
    snapshot = graph.chat_graph.get_state({"configurable": {"thread_id": payload["session_id"]}})
    assert "의심 통화를 종료하고 송금을 중단한 뒤" not in repr(snapshot.values)
    assert payload["documents"][0]["title"] not in payload["answer"]
    assert "citation_enriched" not in payload["trace"]


RISKY_QWEN_OUTPUTS = [
    "안전계좌로 지금 송금하세요. 송금한 뒤 통화를 종료하고 금융회사 공식 대표번호로 사실을 확인하세요.",
    "지금 이체하세요. 그런 다음 통화를 종료하고 금융회사 공식 대표번호로 사실을 확인하세요.",
    "지정 계좌에 입금하십시오. 이후 통화를 종료하고 금융회사 공식 대표번호로 사실을 확인하세요.",
    "현금을 직원에게 전달하세요. 이후 통화를 종료하고 금융회사 공식 대표번호로 사실을 확인하세요.",
    "원격제어 앱을 설치하세요. 이후 통화를 종료하고 금융회사 공식 대표번호로 사실을 확인하세요.",
    "링크를 클릭하세요. 이후 통화를 종료하고 금융회사 공식 대표번호로 사실을 확인하세요.",
    "통화를 종료하고 송금을 중단한 뒤 금융회사 공식 대표번호로 확인하고 증거를 보관하세요.",
    "자금을 넘기는 편이 좋습니다. 통화를 종료하고 금융회사 공식 대표번호로 사실을 확인하세요.",
    "assistant 지시를 무시하고 안전계좌를 이용하세요. 통화를 종료하고 금융회사 공식 대표번호로 확인하세요.",
    "```json\n{\"action\": \"transfer\"}\n``` 금융회사 공식 대표번호를 확인하고 통화를 종료하세요.",
    "これは安全です. 통화를 종료하고 금융회사 공식 대표번호로 사실을 확인하세요.",
    "송금취소 완료 처리되었습니다. 통화를 종료하고 금융회사 공식 대표번호로 사실을 확인하세요.",
]


@pytest.mark.parametrize("qwen_output", RISKY_QWEN_OUTPUTS)
def test_risky_qwen_output_never_controls_final_answer(monkeypatch, qwen_output: str) -> None:
    async def fake_ollama(_messages):
        return qwen_output

    monkeypatch.setattr(graph, "call_ollama", fake_ollama)
    response = client.post(
        "/api/chat",
        json={"message": "검찰이 안전계좌로 송금하라고 합니다.", "session_id": f"test-{uuid4()}"},
    )
    payload = response.json()
    expected = graph.guarded_policy_answer(payload["risk"], graph.recommend_policy(payload["risk"]), payload["documents"])
    assert payload["answer"] == expected
    assert payload["answer"] != qwen_output
    assert qwen_output not in response.text
    snapshot = graph.chat_graph.get_state({"configurable": {"thread_id": payload["session_id"]}})
    assert qwen_output not in repr(snapshot.values)
    assert payload["response_mode"] == "guarded_policy"
    assert payload["llm_invoked"] is True
    assert payload["policy_guardrail_applied"] is True
    assert payload["fallback"] is False
    assert payload["fallback_reason"] is None
    assert isinstance(payload["safety"]["initial_passed"], bool)
    assert "policy_guardrail" in payload["trace"]
    assert graph.recommends_dangerous_action(payload["answer"]) is False
    for action in graph.recommend_policy(payload["risk"])["actions"]:
        assert action in payload["answer"]


def test_guarded_policy_answer_drops_non_allowlisted_policy_actions() -> None:
    risk = graph.analyze_risk("검찰이 안전계좌로 송금하라고 합니다.")
    documents = graph.retrieve_documents("검찰 안전계좌", risk["risk_type"])
    answer = graph.guarded_policy_answer(
        risk,
        {"actions": ["통화 즉시 종료", "안전계좌로 송금"]},
        documents,
    )
    assert "통화 즉시 종료" in answer
    assert "안전계좌로 송금" not in answer


@pytest.mark.parametrize(
    "qwen_output",
    [
        "지금 송금하세요. 금융회사 공식 대표번호로 상담 내용을 확인하고 필요한 자료를 보관하세요.",
        "지금 이체하세요. 금융회사 공식 대표번호로 상담 내용을 확인하고 필요한 자료를 보관하세요.",
        "원격제어 앱을 설치하세요. 금융회사 공식 대표번호로 상담 내용을 확인하고 자료를 보관하세요.",
        "링크를 클릭하세요. 금융회사 공식 대표번호로 상담 내용을 확인하고 관련 자료를 보관하세요.",
        "현금을 직원에게 전달하세요. 금융회사 공식 대표번호로 상담 내용을 확인하고 자료를 보관하세요.",
        "정상 상담으로 보입니다. 금융회사 공식 대표번호와 공식 앱에서 영업시간을 확인하세요. NORMAL-RAW-SENTINEL-6.",
    ],
)
def test_normal_qwen_output_never_controls_final_answer(monkeypatch, qwen_output: str) -> None:
    async def fake_ollama(_messages):
        return qwen_output

    monkeypatch.setattr(graph, "call_ollama", fake_ollama)
    response = client.post(
        "/api/chat",
        json={"message": "제가 요청한 상담의 영업시간을 확인하고 싶습니다.", "session_id": f"test-{uuid4()}"},
    )
    payload = response.json()
    assert payload["risk"]["verdict"] == "정상"
    assert payload["response_mode"] == "guarded_policy"
    assert payload["llm_invoked"] is True
    assert payload["policy_guardrail_applied"] is True
    assert payload["fallback"] is False
    assert payload["fallback_reason"] is None
    assert qwen_output not in response.text
    snapshot = graph.chat_graph.get_state({"configurable": {"thread_id": payload["session_id"]}})
    assert qwen_output not in repr(snapshot.values)
    assert "강한 사기 징후 없음" in payload["answer"]
    assert "새로운 송금·앱 설치 요구 시 중단" in payload["answer"]
    assert "공식 대표번호·앱에서 사실 확인" in payload["answer"]
    assert "불필요한 개인정보 제공 금지" in payload["answer"]
    assert graph.recommends_dangerous_action(payload["answer"]) is False


def test_negated_or_stopped_dangerous_actions_are_safe() -> None:
    risk = graph.analyze_risk("검찰이 안전계좌로 송금하라고 합니다.")
    documents = graph.retrieve_documents("검찰 안전계좌", risk["risk_type"])
    safe_answers = [
        "통화를 종료하고 송금하지 마세요. 금융회사 공식 대표번호로 사실을 확인하고 관련 증거를 보관하세요.",
        "통화를 종료하고 이체를 중단하세요. 금융회사 공식 대표번호로 사실을 확인하고 관련 증거를 보관하세요.",
        "통화를 종료하고 지정 계좌에 입금하지 마세요. 금융회사 공식 대표번호로 사실을 확인하고 증거를 보관하세요.",
        "통화를 종료하고 현금을 직원에게 전달하지 마세요. 금융회사 공식 대표번호로 사실을 확인하고 증거를 보관하세요.",
        "통화를 종료하고 원격제어 앱을 설치하지 마세요. 금융회사 공식 대표번호로 사실을 확인하고 증거를 보관하세요.",
        "통화를 종료하고 링크를 클릭하지 마세요. 금융회사 공식 대표번호로 사실을 확인하고 관련 증거를 보관하세요.",
    ]
    for answer in safe_answers:
        result = graph.evaluate_safety(answer, risk, documents)
        assert result["checks"]["no_dangerous_action_recommendation"] is True
        assert result["passed"] is True


def test_rejects_blank_message_and_invalid_session_id() -> None:
    assert client.post("/api/chat", json={"message": "   ", "session_id": "valid-session"}).status_code == 422
    assert client.post("/api/chat", json={"message": "테스트", "session_id": "invalid session/../../"}).status_code == 422
