from __future__ import annotations

import operator
import os
import re
from typing import Annotated, Any, TypedDict

import httpx
from langchain_core.messages import AIMessage, AnyMessage, HumanMessage
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages


OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:7b")
OLLAMA_TIMEOUT_SECONDS = float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "45"))

RISK_RULES = (
    ({"안전계좌", "검찰", "수사관", "금감원"}, 28, "기관 사칭"),
    ({"지금 즉시", "오늘 안에", "전화 끊으면", "비밀"}, 20, "긴급성"),
    ({"이체", "송금", "수수료", "현금", "지정 계좌"}, 30, "금전 요구"),
    ({"대출", "대환대출", "선입금"}, 34, "대출 미끼"),
    ({"앱 설치", "앱을 설치", "원격제어", "apk", "링크", "설치하세요"}, 42, "앱 설치"),
    ({"자녀", "따님", "아들", "사고", "납치"}, 30, "가족 빙자"),
)

NEGATIONS = ("필요는 없습니다", "요구하지 않습니다", "하지 마세요", "불필요", "대표번호로 다시")

KNOWLEDGE_BASE = (
    {
        "id": "FSS-ORG-001",
        "title": "기관사칭형 보이스피싱 대응",
        "authority": "금융감독원",
        "risk_types": ["기관 사칭", "금전 요구"],
        "content": "수사기관과 금융기관은 전화로 안전계좌 이체를 요구하지 않습니다. 통화를 종료하고 상대가 알려준 번호가 아닌 공식 대표번호로 사실을 확인합니다.",
        "source_url": "https://fine.fss.or.kr/",
    },
    {
        "id": "KNPA-112-001",
        "title": "보이스피싱 피해 직후 조치",
        "authority": "경찰청",
        "risk_types": ["피해 발생", "금전 요구"],
        "content": "이미 송금했다면 즉시 112와 해당 금융회사에 연락해 지급정지를 요청하고 이체내역, 계좌번호, 통화와 문자 기록을 보관합니다.",
        "source_url": "https://www.police.go.kr/",
    },
    {
        "id": "FSS-LOAN-001",
        "title": "대출빙자형 사기 예방",
        "authority": "금융감독원",
        "risk_types": ["대출 미끼", "선입금 요구", "금전 요구"],
        "content": "정상 금융회사는 대출 실행 전에 개인 계좌로 수수료나 상환금을 먼저 보내라고 요구하지 않습니다. 공식 앱과 대표번호로 상품 존재 여부를 확인합니다.",
        "source_url": "https://fine.fss.or.kr/",
    },
    {
        "id": "KNPA-FAMILY-001",
        "title": "가족빙자형 사기 확인 절차",
        "authority": "경찰청",
        "risk_types": ["가족 빙자", "통제·협박"],
        "content": "상대와 통화를 종료한 뒤 가족 본인과 다른 가족에게 별도로 연락해 안전을 확인하고, 상대가 지정한 사람에게 현금을 전달하지 않습니다.",
        "source_url": "https://www.police.go.kr/",
    },
    {
        "id": "FSEC-APP-001",
        "title": "악성 앱과 원격제어 대응",
        "authority": "금융보안원",
        "risk_types": ["앱 설치", "원격제어"],
        "content": "출처가 불분명한 앱과 원격제어 앱을 설치하지 않습니다. 이미 설치했다면 네트워크를 차단하고 다른 안전한 기기로 금융회사에 연락합니다.",
        "source_url": "https://www.fsec.or.kr/",
    },
    {
        "id": "SAFE-NORMAL-001",
        "title": "정상 금융상담 확인 기준",
        "authority": "AI_Finance_Sec 검증셋",
        "risk_types": ["정상 절차", "교차 확인"],
        "content": "고객이 먼저 시작한 상담이고 송금·앱 설치를 요구하지 않으며 공식 대표번호 재확인을 허용한다면 위험 단어만으로 사기로 단정하지 않습니다.",
        "source_url": "https://www.fsec.or.kr/",
    },
)


class ChatState(TypedDict, total=False):
    messages: Annotated[list[AnyMessage], add_messages]
    user_input: str
    analysis_input: str
    risk: dict[str, Any]
    documents: list[dict[str, Any]]
    policy: dict[str, Any]
    draft_answer: str
    final_answer: str
    safety: dict[str, Any]
    initial_safety: dict[str, Any]
    provider: str
    model: str
    fallback: bool
    response_mode: str
    llm_invoked: bool
    policy_guardrail_applied: bool
    generation_error: str | None
    turn_count: int
    trace: Annotated[list[str], operator.add]


def analyze_risk(text: str) -> dict[str, Any]:
    normalized = re.sub(r"\s+", " ", text.lower()).strip()
    evidence: list[dict[str, Any]] = []
    type_scores: dict[str, int] = {}
    score = 0
    for terms, weight, risk_type in RISK_RULES:
        hits = sorted(term for term in terms if term.lower() in normalized)
        if hits:
            added = min(weight + (len(hits) - 1) * 5, 55)
            score += added
            type_scores[risk_type] = type_scores.get(risk_type, 0) + added
            evidence.append({"type": risk_type, "keywords": hits, "score_added": added})
    negation_hits = [term for term in NEGATIONS if term.lower() in normalized]
    if negation_hits:
        reduction = min(90, 35 + len(negation_hits) * 25)
        score -= reduction
        evidence.append({"type": "정상성 근거", "keywords": negation_hits, "score_added": -reduction})
    already_transferred = bool(re.search(r"이미.*(송금|이체)|보냈|입금했", normalized))
    if already_transferred:
        score = max(score, 75)
        type_scores["피해 발생"] = 75
        evidence.append({"type": "피해 발생", "keywords": ["송금·이체 완료 표현"], "score_added": 75})
    score = max(0, min(100, score))
    risk_type = max(type_scores, key=type_scores.get) if score >= 40 and type_scores else "정상 절차"
    return {
        "score": score,
        "level": "위험" if score >= 70 else "주의" if score >= 40 else "안전",
        "verdict": "사기" if score >= 40 else "정상",
        "risk_type": risk_type,
        "evidence": evidence,
        "already_transferred": already_transferred,
    }


def _tokens(value: str) -> set[str]:
    return {token for token in re.sub(r"[^0-9a-z가-힣\s]", " ", value.lower()).split() if len(token) > 1}


def retrieve_documents(query: str, risk_type: str) -> list[dict[str, Any]]:
    query_tokens = _tokens(query)
    lexical = sorted(
        KNOWLEDGE_BASE,
        key=lambda doc: len(query_tokens & _tokens(f"{doc['title']} {doc['content']}")),
        reverse=True,
    )
    semantic = sorted(KNOWLEDGE_BASE, key=lambda doc: risk_type in doc["risk_types"], reverse=True)
    lexical_rank = {doc["id"]: index + 1 for index, doc in enumerate(lexical)}
    semantic_rank = {doc["id"]: index + 1 for index, doc in enumerate(semantic)}
    ranked = []
    for doc in KNOWLEDGE_BASE:
        risk_type_bonus = 0.01 if risk_type in doc["risk_types"] else 0
        score = 1 / (60 + lexical_rank[doc["id"]]) + 1 / (60 + semantic_rank[doc["id"]]) + risk_type_bonus
        ranked.append({**doc, "lexical_rank": lexical_rank[doc["id"]], "semantic_rank": semantic_rank[doc["id"]], "rerank_score": score})
    return sorted(ranked, key=lambda doc: doc["rerank_score"], reverse=True)[:3]


def recommend_policy(risk: dict[str, Any]) -> dict[str, Any]:
    actions = ["공식 대표번호·앱에서 사실 확인"]
    if risk["verdict"] == "사기":
        actions = ["통화 즉시 종료", "추가 송금·앱 설치 중단", "통화·문자·계좌 증거 보관", *actions]
    if risk["level"] == "위험" or risk["already_transferred"]:
        actions.extend(["112 상담·신고", "금융회사 콜센터에 지급정지 요청"])
    return {"actions": actions, "external_action_executed": False}


POLICY_ACTION_ALLOWLIST = (
    "통화 즉시 종료",
    "추가 송금·앱 설치 중단",
    "통화·문자·계좌 증거 보관",
    "공식 대표번호·앱에서 사실 확인",
    "112 상담·신고",
    "금융회사 콜센터에 지급정지 요청",
)


def guarded_policy_answer(risk: dict[str, Any], policy: dict[str, Any], documents: list[dict[str, Any]]) -> str:
    allowed_actions = [action for action in policy.get("actions", []) if action in POLICY_ACTION_ALLOWLIST]
    if not allowed_actions:
        allowed_actions = ["공식 대표번호·앱에서 사실 확인"]
    action_lines = "\n".join(f"- {action}" for action in allowed_actions)
    return (
        f"서버 위험 판정: {risk['level']} · {risk['risk_type']}.\n"
        f"허용된 사용자 행동:\n{action_lines}\n"
        f"서버가 선택한 검색 근거 {len(documents)}건은 별도 패널에서 확인하세요. "
        "실제 신고나 지급정지는 사용자가 직접 요청해야 합니다."
    )


def safe_mock_answer(risk: dict[str, Any], documents: list[dict[str, Any]]) -> str:
    if risk["verdict"] == "사기":
        return guarded_policy_answer(risk, recommend_policy(risk), documents)
    return "현재 문장에서는 강한 사기 징후가 확인되지 않았습니다. 다만 송금이나 앱 설치를 새로 요구하면 중단하고 금융회사 공식 대표번호로 다시 확인하세요."


async def call_ollama(messages: list[dict[str, str]]) -> str:
    async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT_SECONDS) as client:
        response = await client.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json={
                "model": OLLAMA_MODEL,
                "messages": messages,
                "stream": False,
                "options": {
                    "temperature": 0.1,
                    "num_ctx": 4096,
                    "num_predict": 180,
                    "stop": ["<|assistant|>", "<|system|>", "<think>"],
                },
            },
        )
        response.raise_for_status()
        payload = response.json()
    answer = str(payload.get("message", {}).get("content", "")).strip()
    if not answer:
        raise RuntimeError("Ollama가 빈 응답을 반환했습니다.")
    return answer


def prepare_input(state: ChatState) -> dict[str, Any]:
    if not state.get("user_input", "").strip():
        raise ValueError("사용자 입력이 비어 있습니다.")
    recent_user_messages = [
        str(message.content).strip()
        for message in state.get("messages", [])
        if isinstance(message, HumanMessage) and str(message.content).strip()
    ][-3:]
    return {
        "user_input": state["user_input"].strip(),
        "analysis_input": "\n".join(recent_user_messages),
        "provider": "ollama",
        "model": OLLAMA_MODEL,
        "trace": ["prepare_input"],
    }


def risk_agent(state: ChatState) -> dict[str, Any]:
    return {"risk": analyze_risk(state["analysis_input"]), "trace": ["risk_agent"]}


def knowledge_agent(state: ChatState) -> dict[str, Any]:
    risk = analyze_risk(state["analysis_input"])
    return {"documents": retrieve_documents(state["analysis_input"], risk["risk_type"]), "trace": ["knowledge_agent"]}


def policy_agent(state: ChatState) -> dict[str, Any]:
    return {"policy": recommend_policy(analyze_risk(state["analysis_input"])), "trace": ["policy_agent"]}


async def generate_answer(state: ChatState) -> dict[str, Any]:
    history = []
    for message in state.get("messages", [])[-7:]:
        if isinstance(message, HumanMessage):
            history.append({"role": "user", "content": str(message.content)})
        elif isinstance(message, AIMessage):
            history.append({"role": "assistant", "content": str(message.content)})
    system = {
        "role": "system",
        "content": (
            "당신은 AI_Finance_Sec 금융 보안 비서다. 한국어로 짧고 침착하게 답한다. "
            "통화 종료, 추가 송금·앱 설치 중단, 공식 대표번호 확인을 우선한다. "
            "실제로 신고·지급정지·송금취소를 완료했다고 주장하지 않는다. "
            "한국어 외 문자, 역할명, 사고과정, JSON, 코드, 번역문을 출력하지 않는다. "
            f"사건 컨텍스트: {state['analysis_input']}\n위험 분석: {state['risk']}\n"
            f"검색 문서: {state['documents']}\n허용 정책: {state['policy']}"
        ),
    }
    try:
        answer = await call_ollama([system, *history])
        initial = evaluate_safety(answer, state["risk"], state["documents"])
        guarded = state["risk"]["verdict"] == "사기" or state["risk"]["already_transferred"]
        if guarded:
            return {
                "draft_answer": guarded_policy_answer(state["risk"], state["policy"], state["documents"]),
                "initial_safety": initial,
                "fallback": False,
                "response_mode": "guarded_policy",
                "llm_invoked": True,
                "policy_guardrail_applied": True,
                "generation_error": None,
                "trace": ["ollama_generate", "policy_guardrail"],
            }
        if initial["passed"]:
            return {
                "draft_answer": answer,
                "initial_safety": initial,
                "fallback": False,
                "response_mode": "llm_verified",
                "llm_invoked": True,
                "policy_guardrail_applied": False,
                "generation_error": None,
                "trace": ["ollama_generate", "llm_verified"],
            }
        return {
            "draft_answer": safe_mock_answer(state["risk"], state["documents"]),
            "initial_safety": initial,
            "fallback": True,
            "response_mode": "mock_fallback",
            "llm_invoked": True,
            "policy_guardrail_applied": False,
            "generation_error": None,
            "trace": ["ollama_generate", "llm_validation_failed"],
        }
    except Exception as exc:
        return {
            "draft_answer": safe_mock_answer(state["risk"], state["documents"]),
            "initial_safety": {"passed": False, "checks": {}, "violations": ["ollama_call_failure"]},
            "fallback": True,
            "response_mode": "mock_fallback",
            "llm_invoked": True,
            "policy_guardrail_applied": False,
            "generation_error": f"{type(exc).__name__}: {str(exc)[:180]}",
            "trace": ["ollama_generate_failed", "mock_generation_fallback"],
        }


def recommends_dangerous_action(answer: str) -> bool:
    action_commands = (
        r"(?:송금|이체|입금)(?:을|를)?\s*(?:하(?:세요|십시오|라|도록\s*하세요|면\s*됩니다|는\s*것이\s*좋습니다)|해(?:요|주세요|야\s*합니다)|진행하세요)",
        r"(?:돈|금액|자금)(?:을|를)?\s*(?:보내(?:세요|십시오|라|주세요)|송금하세요|이체하세요)",
        r"현금.{0,24}전달(?:을|를)?\s*(?:하(?:세요|십시오|라)|해(?:요|주세요|야\s*합니다))",
        r"(?:원격\s*제어\s*)?앱(?:을|를)?\s*설치(?:를)?\s*(?:하(?:세요|십시오|라)|해(?:요|주세요|야\s*합니다))",
        r"링크(?:를|을)?\s*(?:클릭|누르|접속)(?:하)?(?:세요|십시오|라|해요|해주세요)",
    )
    return any(re.search(pattern, answer) for pattern in action_commands)


def evaluate_safety(answer: str, risk: dict[str, Any], _documents: list[dict[str, Any]]) -> dict[str, Any]:
    dangerous = risk["verdict"] == "사기" or risk["level"] == "위험" or risk["already_transferred"]
    transferred = risk["already_transferred"]
    checks = {
        "minimum_length": len(answer.strip()) >= 40,
        "risk_stop_action": (not dangerous) or bool(re.search(r"중단|종료|끊", answer)),
        "no_dangerous_action_recommendation": not recommends_dangerous_action(answer),
        "official_verification": bool(re.search(r"공식|대표번호|금융회사|경찰청|금융감독원", answer)),
        "post_transfer_police_112": (not transferred) or bool(re.search(r"112|경찰(?:청)?", answer)),
        "post_transfer_financial_company": (not transferred) or bool(re.search(r"금융\s*회사|금융\s*기관|은행|카드사", answer)),
        "post_transfer_payment_stop": (not transferred) or bool(re.search(r"지급\s*정지|계좌\s*(?:동결|정지)|송금\s*정지", answer)),
        "no_false_external_completion": not bool(re.search(r"신고(가|를)? 완료|지급정지(가|를)? 완료|처리되었습니다|송금취소 완료", answer)),
        "korean_only": not bool(re.search(r"[\u3040-\u30ff\u3400-\u9fff]", answer)),
        "no_prompt_artifacts": not bool(
            re.search(r"(?i)<\/?think>|<\|(?:system|assistant|user)\|>|\b(system|assistant|user)\b|번역|翻译|translate", answer)
        ),
        "no_code_or_json": not bool(re.search(r"```|^\s*[\{\[]", answer)),
    }
    return {"passed": all(checks.values()), "checks": checks, "violations": [name for name, passed in checks.items() if not passed]}


def safety_verifier(state: ChatState) -> dict[str, Any]:
    initial = state["initial_safety"]
    final_answer = state["draft_answer"]
    fallback = bool(state.get("fallback"))
    response_mode = state["response_mode"]
    policy_guardrail_applied = bool(state["policy_guardrail_applied"])
    final = evaluate_safety(final_answer, state["risk"], state["documents"])
    if not final["passed"]:
        final_answer = safe_mock_answer(state["risk"], state["documents"])
        fallback = True
        response_mode = "mock_fallback"
        policy_guardrail_applied = False
        final = evaluate_safety(final_answer, state["risk"], state["documents"])
    trace = ["safety_verifier"]
    if response_mode == "mock_fallback":
        trace.append("safety_fallback")
    return {
        "final_answer": final_answer,
        "fallback": fallback,
        "response_mode": response_mode,
        "policy_guardrail_applied": policy_guardrail_applied,
        "safety": {
            "passed": final["passed"],
            "checks": final["checks"],
            "violations": final["violations"],
            "initial_passed": initial["passed"],
            "initial_violations": initial["violations"],
            "fallback_applied": fallback,
            "policy_guardrail_applied": policy_guardrail_applied,
        },
        "trace": trace,
    }


def finalize(state: ChatState) -> dict[str, Any]:
    return {
        "messages": [AIMessage(content=state["final_answer"])],
        "turn_count": int(state.get("turn_count", 0)) + 1,
        "trace": ["finalize"],
    }


workflow = StateGraph(ChatState)
workflow.add_node("prepare_input", prepare_input)
workflow.add_node("risk_agent", risk_agent)
workflow.add_node("knowledge_agent", knowledge_agent)
workflow.add_node("policy_agent", policy_agent)
workflow.add_node("ollama_generate", generate_answer)
workflow.add_node("safety_verifier", safety_verifier)
workflow.add_node("finalize", finalize)
workflow.add_edge(START, "prepare_input")
workflow.add_edge("prepare_input", "risk_agent")
workflow.add_edge("prepare_input", "knowledge_agent")
workflow.add_edge("prepare_input", "policy_agent")
workflow.add_edge(["risk_agent", "knowledge_agent", "policy_agent"], "ollama_generate")
workflow.add_edge("ollama_generate", "safety_verifier")
workflow.add_edge("safety_verifier", "finalize")
workflow.add_edge("finalize", END)

# Demo-only volatile memory: all sessions disappear when this process exits.
memory = InMemorySaver()
chat_graph = workflow.compile(checkpointer=memory)


async def run_chat(message: str, session_id: str) -> dict[str, Any]:
    result = await chat_graph.ainvoke(
        {"messages": [HumanMessage(content=message)], "user_input": message},
        config={"configurable": {"thread_id": session_id}, "recursion_limit": 16},
    )
    full_trace = result.get("trace", [])
    start = max(index for index, item in enumerate(full_trace) if item == "prepare_input")
    return {
        "answer": result["final_answer"],
        "risk": result["risk"],
        "documents": result["documents"],
        "safety": result["safety"],
        "trace": full_trace[start:],
        "provider": result["provider"],
        "model": result["model"],
        "fallback": bool(result["fallback"]),
        "response_mode": result["response_mode"],
        "llm_invoked": bool(result["llm_invoked"]),
        "policy_guardrail_applied": bool(result["policy_guardrail_applied"]),
        "fallback_reason": (
            "ollama_call_failure"
            if result.get("generation_error")
            else "safety_validation_failure" if result["response_mode"] == "mock_fallback"
            else None
        ),
        "generation_error": result.get("generation_error"),
        "session_id": session_id,
        "turn_count": result["turn_count"],
        "memory": "InMemorySaver (demo-only, process-local, non-persistent)",
        "external_action_executed": False,
    }
