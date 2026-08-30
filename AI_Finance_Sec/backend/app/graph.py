from __future__ import annotations

import operator
import os
import re
import json
from typing import Annotated, Any, TypedDict

import httpx
from langchain_core.messages import AIMessage, AnyMessage, HumanMessage
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages


OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:7b")
OLLAMA_TIMEOUT_SECONDS = float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "45"))

RISK_PATTERNS = (
    (r"(검찰|검사|수사관|금감원|금융감독원|금융감독언|법원|구속영장).{0,35}(범죄|연루|혐의|영장|계좌|자금|돈|소명)", 42, "기관 사칭", "수사·감독기관 사칭 맥락"),
    (r"(안전|보호|보안|검수|별도|임시보관)계좌.{0,24}(이체|송금|옮겨|보내|입금|넘기|넘겨|집행)|(?:이체|송금|옮겨|보내|입금|넘기|넘겨|집행).{0,24}(안전|보호|보안|검수|별도|임시보관)계좌", 42, "기관 사칭", "보호 명목 계좌 이동 요구"),
    (r"(대출|대환|신용점수|신용복구|한도|3퍼센트상품).{0,45}(수수료|선입금|먼저상환|작업비|보증료|예탁금|처리)|(?:수수료|선입금|작업비|보증료|예탁금).{0,35}(대출|한도|상품|승인|실행|신용복구)", 50, "대출 미끼", "대출 실행 전 비용 요구"),
    (r"(원격제어|보안프로그램|보안앱|apk|팀뷰어|애니데스크|연결숫자).{0,32}(설치|깔아|받아|실행|인증|읽어|회신|알려)|(?:설치|깔아|받아|실행).{0,24}(원격제어|보안프로그램|보안앱|apk|팀뷰어|애니데스크)", 52, "앱 설치", "원격제어·비공식 앱 실행 요구"),
    (r"(택배|배송|소포|환급|과오납|국세).{0,55}(링크|주소|페이지|bit점ly|카드번호|계좌비밀번호|인증|결제)", 48, "택배·환급", "택배·환급 미끼 정보입력 요구"),
    (r"(리딩방|코인|가상자산|거래소|손실복구|증거금).{0,55}(원금|수익|보장|입금|송금|세금|먼저|보태|회수|출금)", 50, "투자 사기", "투자수익·출금 명목 선입금"),
    (r"(재무이사|대표|사장|임원).{0,65}(변경된?협력사계좌|협력사계좌변경|대금집행|쿠폰|상품권|코드).{0,25}(송금|이체|집행|회신|보내|알려)|(?:변경된?협력사계좌|대금집행).{0,45}(대표|사장|임원|재무이사)", 55, "기업 사칭 BEC", "임원 사칭 결제·코드 요구"),
    (r"(부장님|사장님|친구|지인|새번호|친구폰|회의중|통화못|전화는안돼).{0,55}(상품권|핀번호|돈|병원비|빌려|보내|결제|회신)", 48, "지인·메신저", "지인 사칭 비대면 금전 요구"),
    (r"(따님|자녀|아들|딸|엄마나|아빠나).{0,55}(사고|수술|잡혀|납치|휴대폰.*고장|친구폰|돈|현금|계좌|보내)|(?:사고|수술|잡혀|납치).{0,45}(현금|돈|전달|넘기)", 52, "가족 빙자", "가족 위급상황·금전 요구"),
    (r"(계좌비밀번호|카드번호|인증번호|인증코드|otp|일회용암호|공동인증서|선불카드뒷면숫자).{0,25}(입력|알려|보내|인증|읽어|회신|넘기)", 45, "개인정보 요구", "금융 인증정보 요구"),
    (r"(지금|오늘|즉시|바로|전화끊지|비밀|말하지).{0,35}(보내|송금|이체|입금|전달|준비|옮겨)", 18, "긴급성", "긴급·고립 압박"),
    (r"(돈|자금|현금|금액|수수료|보증료|작업비).{0,24}(보내|송금|이체|입금|전달|넘기|준비)|(?:송금|이체|입금).{0,15}(하세요|해라|해주세요|해야|부탁)", 24, "금전 요구", "금전 이동 요구"),
)

NORMAL_CLAUSE_PATTERNS = (
    r"(?:뉴스|기사|보도).{0,30}(사건|사례|보도)",
    r"(?:교육|예방|예방법).{0,45}(배웠|의심|하지말|누르지말|설치하지말|입금하지말)",
    r"(?:신고|제보).{0,35}(가져왔|하려고).{0,30}(보내지않|입금하지않|이체하지않)",
    r"(?:제가|직접).{0,25}(신청|요청).{0,35}(공식앱|대표번호).{0,35}(필요없|요구하지않|확인)",
    r"(?:고객|제가).{0,40}(요청|신청).{0,80}(송금|설치).{0,18}(필요없|필요는없)",
    r"(?:은행|직원|상담원).{0,35}(요구하지않|보내지않|링크를보내지않).{0,35}(대표번호|공식앱|다시확인|확인)",
    r"(?:등록된|평소쓰던).{0,25}(아들|딸|부모님|가족|계좌).{0,35}(생활비|학원비|병원비|송금|이체|입금)",
    r"(?:앱스토어|공식스토어).{0,25}(은행)?공식앱.{0,25}(설치|검색)",
    r"택배사공식앱.{0,35}(배송주소|주소).{0,35}(수정|변경)",
    r"제가.{0,20}(신청|요청).{0,20}(대출|상담)",
    r"(?:신고|제보).{0,30}(하려고|가져왔)",
    r"공식앱.{0,35}(필요없|필요는없|요구하지않|확인)",
    r"(?:세미나|교육|뉴스|기사|자료).{0,55}(읽었|배웠|나왔|사례)",
    r"본인이연공식앱.{0,35}(otp|일회용암호).{0,20}(직접입력)",
    r"본인명의거래소.{0,35}(인증된본인계좌|본인개인지갑).{0,20}(출금|전송)",
    r"업무용법인카드.{0,20}(직원|동료).{0,15}(전달|건넸)",
)

COMPLETED_ACTION_PATTERNS = (
    r"이미.{0,15}(송금|이체)|(?:돈|자금).{0,12}(보냈|입금했|송금했|이체했|전송했)|알려준곳에입금했|요구한대로.{0,15}(보냈|입금했|송금했|이체했)",
    r"(?:상품권|기프트카드).{0,20}(핀번호|pin|번호).{0,20}(보냈|알려|전달)",
    r"(?:현금|카드).{0,20}(전달했|건넸|줬|넘겼)",
    r"(?:otp|인증번호|인증코드|비밀번호).{0,20}(알려|보냈|제공|입력)",
    r"(?:원격제어|팀뷰어|보안앱|apk).{0,20}(설치했|깔았|실행했)",
    r"(?:코인|가상자산|비트코인|테더).{0,25}(보냈|전송했|출금했)",
    r"(?:신분증).{0,15}(통장사본).{0,20}(보냈|제공|넘겼)|(?:통장사본).{0,15}(신분증).{0,20}(보냈|제공|넘겼)",
    r"(?:공동인증서).{0,20}(비밀번호).{0,20}(알려|보냈|제공|넘겼)",
    r"(?:금괴|골드바|문화상품권).{0,25}(전달했|건넸|보냈|번호를알려)",
)
SUSPICIOUS_TRANSFER_CONTEXT = r"(이미송금|이미이체|검찰|검사|수사관|금감원|법원|모르는사람|요구한대로|그쪽|알려준곳|사기|연락이끊|새번호|직원에게|상담원|리딩방|출금잠금|대표가|임원이|재무이사)"
SAFE_COMPLETED_CONTEXT = r"업무용법인카드.{0,20}(직원|동료).{0,15}(전달|건넸)|본인명의거래소.{0,35}(인증된본인계좌|본인개인지갑).{0,20}(출금|전송)|본인이연공식앱.{0,35}(otp|일회용암호).{0,20}(직접입력)"

KNOWLEDGE_BASE = (
    {
        "id": "FSS-ORG-001",
        "title": "기관사칭형 보이스피싱 대응",
        "authority": "금융감독원",
        "risk_types": ["기관 사칭", "금전 요구"],
        "content": "수사기관과 금융기관은 안전계좌·임시보관계좌 이체나 자금 집행을 요구하지 않습니다. 통화를 종료하고 상대가 알려준 번호가 아닌 공식 대표번호로 사실을 확인합니다.",
        "source_url": "https://fine.fss.or.kr/",
    },
    {
        "id": "KNPA-1394-001",
        "title": "보이스피싱 피해 직후 조치",
        "authority": "경찰청",
        "risk_types": ["피해 발생", "금전 요구"],
        "content": "이미 송금하거나 상품권 코드·OTP·신분증·통장사본·공동인증서·금괴·가상자산을 전달했다면 1394에 신고·상담하고, 긴급한 상황은 112에 신고하며 금융회사에 지급정지를 요청합니다.",
        "source_url": "https://www.police.go.kr/",
    },
    {
        "id": "FSS-LOAN-001",
        "title": "대출빙자형 사기 예방",
        "authority": "금융감독원",
        "risk_types": ["대출 미끼", "선입금 요구", "금전 요구"],
        "content": "정상 금융회사는 대출·신용복구 실행 전에 예탁금·보증료·작업비를 개인 계좌로 먼저 보내라고 요구하지 않습니다. 공식 앱과 대표번호로 확인합니다.",
        "source_url": "https://fine.fss.or.kr/",
    },
    {
        "id": "KNPA-FAMILY-001",
        "title": "가족빙자형 사기 확인 절차",
        "authority": "경찰청",
        "risk_types": ["가족 빙자", "통제·협박"],
        "content": "엄마·아들·딸을 사칭해 휴대폰 고장이나 친구 폰·새 번호라며 병원비와 돈을 요구하면 가족의 기존 번호로 확인하고 현금을 전달하지 않습니다.",
        "source_url": "https://www.police.go.kr/",
    },
    {
        "id": "FSEC-APP-001",
        "title": "악성 앱과 원격제어 대응",
        "authority": "금융보안원",
        "risk_types": ["앱 설치", "원격제어"],
        "content": "출처가 불분명한 APK와 보안 프로그램을 실행하거나 팀뷰어·애니데스크 원격제어 앱과 연결 숫자를 제공하지 않습니다. 설치했다면 네트워크를 차단합니다.",
        "source_url": "https://www.fsec.or.kr/",
    },
    {
        "id": "FSEC-SMISH-001",
        "title": "택배·환급 사칭 스미싱 대응",
        "authority": "금융보안원",
        "risk_types": ["택배·환급", "개인정보 요구"],
        "content": "택배 주소 수정이나 환급금을 빌미로 문자 링크 접속과 금융정보 입력을 요구하면 링크를 열지 말고 해당 기관의 공식 앱과 대표번호에서 직접 확인합니다.",
        "source_url": "https://www.fsec.or.kr/",
    },
    {
        "id": "FSS-INVEST-001",
        "title": "리딩방·가상자산 투자사기 대응",
        "authority": "금융감독원",
        "risk_types": ["투자 사기", "금전 요구"],
        "content": "원금·고수익 보장, 손실 복구, 출금 전 세금이나 증거금 선입금 요구를 신뢰하지 말고 추가 입금을 중단한 뒤 제도권 금융회사 여부를 확인합니다.",
        "source_url": "https://fine.fss.or.kr/",
    },
    {
        "id": "KNPA-MESSENGER-001",
        "title": "지인·메신저 사칭 확인 절차",
        "authority": "경찰청",
        "risk_types": ["지인·메신저", "가족 빙자"],
        "content": "새 번호, 통화 곤란을 이유로 돈이나 상품권을 요구하면 송금하지 말고 기존에 알던 번호로 당사자에게 직접 연락해 사실을 확인합니다.",
        "source_url": "https://www.police.go.kr/",
    },
    {
        "id": "FSEC-BEC-001",
        "title": "기업 이메일·임원 사칭 BEC 대응",
        "authority": "금융보안원",
        "risk_types": ["기업 사칭 BEC"],
        "content": "대표·사장·임원·재무이사 사칭으로 변경된 협력사 계좌에 대금 집행을 요구하거나 쿠폰·상품권 코드를 회신하라고 하면 기존 연락처와 승인 절차로 재확인합니다.",
        "source_url": "https://www.fsec.or.kr/",
    },
    {
        "id": "FSEC-AUTH-001",
        "title": "OTP·인증정보 탈취 대응",
        "authority": "금융보안원",
        "risk_types": ["개인정보 요구"],
        "content": "OTP·일회용암호·인증번호·공동인증서 비밀번호·선불카드 뒷면 숫자를 전화나 메신저로 읽어주거나 회신하지 않습니다.",
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
    rule_risk: dict[str, Any]
    structured_risk: dict[str, Any]
    structured_fallback: bool
    structured_error: str | None
    incident_summary: str
    incident_status: str
    transaction: dict[str, Any]
    transaction_anomaly: dict[str, Any]
    alert: dict[str, Any]


def analyze_risk(text: str) -> dict[str, Any]:
    normalized = re.sub(r"\s+", " ", text.lower()).strip()
    compact = re.sub(r"\s+", "", normalized)
    evidence: list[dict[str, Any]] = []
    type_scores: dict[str, int] = {}
    score = 0
    clauses = [re.sub(r"\s+", "", clause) for clause in re.split(r"[.!?。！？\n]|(?:하지만|지만|그런데|그러나|다만|지금은)", normalized) if clause.strip()]
    unsafe_clauses = ["" if any(re.search(pattern, clause) for pattern in NORMAL_CLAUSE_PATTERNS) else clause for clause in clauses]
    detection_units = [clause for clause in unsafe_clauses if clause]
    detection_units.extend(
        unsafe_clauses[index] + unsafe_clauses[index + 1]
        for index in range(len(unsafe_clauses) - 1)
        if unsafe_clauses[index] and unsafe_clauses[index + 1]
    )
    for pattern, weight, risk_type, explanation in RISK_PATTERNS:
        if any(re.search(pattern, clause) for clause in detection_units):
            score += weight
            type_scores[risk_type] = type_scores.get(risk_type, 0) + weight
            evidence.append({"type": risk_type, "keywords": [explanation], "score_added": weight})
    if any(not clause for clause in unsafe_clauses):
        evidence.append({"type": "정상성 근거", "keywords": ["해당 절의 공식 확인·교육·일상거래 맥락"], "score_added": 0})
    already_transferred = bool(
        any(re.search(pattern, compact) for pattern in COMPLETED_ACTION_PATTERNS)
        and re.search(SUSPICIOUS_TRANSFER_CONTEXT, compact)
        and not re.search(SAFE_COMPLETED_CONTEXT, compact)
    )
    if already_transferred:
        score = max(score, 75)
        type_scores["피해 발생"] = 75
        evidence.append({"type": "피해 발생", "keywords": ["송금·이체 완료 표현"], "score_added": 75})
    score = max(0, min(100, score))
    risk_type = "피해 발생" if already_transferred else max(type_scores, key=type_scores.get) if score >= 40 and type_scores else "정상 절차"
    return {
        "score": score,
        "level": "위험" if score >= 70 else "주의" if score >= 40 else "안전",
        "verdict": "사기" if score >= 40 else "정상",
        "risk_type": risk_type,
        "evidence": evidence,
        "already_transferred": already_transferred,
    }


def _tokens(value: str) -> set[str]:
    words = {token for token in re.sub(r"[^0-9a-z가-힣\s]", " ", value.lower()).split() if len(token) > 1}
    bigrams = {
        word[index:index + 2]
        for word in words if re.search(r"[가-힣]", word)
        for index in range(len(word) - 1)
    }
    return (words | bigrams) - {"하라고", "하라", "라고"}


def retrieve_documents(query: str, risk_type: str) -> list[dict[str, Any]]:
    eligible = tuple(doc for doc in KNOWLEDGE_BASE if risk_type in doc["risk_types"])
    if not eligible:
        eligible = tuple(doc for doc in KNOWLEDGE_BASE if "정상 절차" in doc["risk_types"]) if risk_type == "정상 절차" else ()
    if not eligible:
        return []
    query_tokens = _tokens(query)
    lexical_scores = {
        doc["id"]: len(query_tokens & _tokens(f"{doc['title']} {doc['content']}"))
        for doc in eligible
    }
    if max(lexical_scores.values(), default=0) == 0:
        if risk_type == "정상 절차":
            return []
        return [
            {**doc, "lexical_rank": len(eligible), "semantic_rank": index + 1, "rerank_score": 0, "retrieval_mode": "policy_fallback"}
            for index, doc in enumerate(eligible)
        ][:3]
    lexical = sorted(
        eligible,
        key=lambda doc: lexical_scores[doc["id"]],
        reverse=True,
    )
    semantic = sorted(eligible, key=lambda doc: risk_type in doc["risk_types"], reverse=True)
    lexical_rank = {doc["id"]: index + 1 for index, doc in enumerate(lexical)}
    semantic_rank = {doc["id"]: index + 1 for index, doc in enumerate(semantic)}
    ranked = []
    for doc in eligible:
        risk_type_bonus = 0.007 if risk_type in doc["risk_types"] and lexical_scores[doc["id"]] > 0 else 0
        score = 1 / (60 + lexical_rank[doc["id"]]) + 1 / (60 + semantic_rank[doc["id"]]) + risk_type_bonus + lexical_scores[doc["id"]] * 0.001
        ranked.append({**doc, "lexical_rank": lexical_rank[doc["id"]], "semantic_rank": semantic_rank[doc["id"]], "rerank_score": score, "retrieval_mode": "hybrid"})
    return sorted(ranked, key=lambda doc: doc["rerank_score"], reverse=True)[:3]


def recommend_policy(risk: dict[str, Any]) -> dict[str, Any]:
    actions = ["새로운 송금·앱 설치 요구 시 중단", "공식 대표번호·앱에서 사실 확인", "불필요한 개인정보 제공 금지"]
    if risk["verdict"] == "사기":
        actions = ["통화 즉시 종료", "추가 송금·앱 설치 중단", "통화·문자·계좌 증거 보관", *actions]
    if risk["level"] == "위험" or risk["already_transferred"]:
        actions.extend(["1394 신고·상담", "긴급 시 112 신고", "해당 금융회사 콜센터에 지급정지 요청"])
    return {"actions": actions, "external_action_executed": False}


POLICY_ACTION_ALLOWLIST = (
    "통화 즉시 종료",
    "추가 송금·앱 설치 중단",
    "통화·문자·계좌 증거 보관",
    "공식 대표번호·앱에서 사실 확인",
    "1394 신고·상담",
    "긴급 시 112 신고",
    "해당 금융회사 콜센터에 지급정지 요청",
    "새로운 송금·앱 설치 요구 시 중단",
    "불필요한 개인정보 제공 금지",
)


# --- 백그라운드 이상거래 탐지 -------------------------------------------------
# 통화 맥락과 독립적으로, 평소 거래 프로필과 이번 이체를 대조해 이상 신호를 만든다.
# engine.ts의 detectTransactionAnomaly와 score-for-score 동일해야 한다.

TRANSACTION_BASELINE: dict[str, Any] = {
    "median_amount": 120_000,
    "p95_amount": 500_000,
    "known_payees": ("KB-1002-3355", "SHINHAN-110-4477", "NH-352-9910"),
    "usual_hour_start": 8,
    "usual_hour_end": 22,
}

TRANSACTION_RISK_CAP = 30


def _won(value: int) -> str:
    return f"{int(value):,}원"


def detect_transaction_anomaly(
    context: dict[str, Any] | None,
    baseline: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """평소 프로필 대비 이번 이체의 이상 신호를 만든다. 컨텍스트가 없으면 무점수."""
    if not context:
        return {"score": 0, "raw_score": 0, "signals": [], "observed": [], "in_call": False, "evaluated": False}
    profile = {**TRANSACTION_BASELINE, **(baseline or {})}
    amount = max(0, int(context.get("amount", 0)))
    payee = str(context.get("payee", "")).strip()
    hour = int(context.get("hour", 12))
    recent_transfers = int(context.get("recent_transfer_count", 0))
    signals: list[dict[str, Any]] = []

    def add(key: str, weight: int, label: str, value: str) -> None:
        signals.append({"key": key, "weight": weight, "label": label, "value": value})

    p95 = int(profile["p95_amount"])
    if amount > p95 * 2:
        add("amount_far_over_p95", 12, "평소 상위 5% 이체액의 2배 초과", f"{_won(amount)} · 평소 {_won(p95)}")
    elif amount > p95:
        add("amount_over_p95", 8, "평소 상위 5% 이체액 초과", f"{_won(amount)} · 평소 {_won(p95)}")
    if payee and payee not in tuple(profile["known_payees"]):
        add("first_time_payee", 10, "처음 보내는 수취인 계좌", payee)
    if not (int(profile["usual_hour_start"]) <= hour < int(profile["usual_hour_end"])):
        add("odd_hour", 6, "평소 이체하지 않는 시간대", f"{hour:02d}시")
    if context.get("in_call"):
        add("in_call_transfer", 12, "통화 중 이체 시도", "통화 연결 상태")
    if context.get("new_device_or_app"):
        add("new_device_or_app", 10, "신규 기기·앱 설치 직후 이체", "설치 24시간 이내")
    if recent_transfers >= 2:
        add("split_transfer", 8, "짧은 시간 내 분할 이체 반복", f"최근 1시간 {recent_transfers}건")
    if context.get("limit_raised"):
        add("limit_raised", 8, "이체 한도 상향 직후", "24시간 이내 상향")

    raw = sum(signal["weight"] for signal in signals)
    return {
        "score": min(raw, TRANSACTION_RISK_CAP),
        "raw_score": raw,
        "signals": signals,
        "observed": [f"{signal['label']} — {signal['value']}" for signal in signals],
        "in_call": bool(context.get("in_call")),
        "evaluated": True,
    }


# --- 경보 전달 계획 -----------------------------------------------------------
# 균일 팝업은 학습적으로 무시되고, 통화 중 푸시는 범인에게 화면을 노출시킨다.
# 위험도에 비례한 마찰과 채널만 사용하고, 통화 중에는 푸시·SMS를 억제한다.

ALERT_TIER_NAMES = ("무개입", "인라인 배너", "인터스티셜", "다채널 경보")
ALERT_HOLD_SECONDS = (0, 0, 15, 30)

ALERT_SELF_CHECK = (
    "지금 누군가 통화로 이 이체를 안내하고 있나요?",
    "상대가 알려준 번호가 아닌 공식 대표번호로 확인했나요?",
    "이 계좌로 이전에 이체한 적이 있나요?",
)

GOLDEN_TIME_SEQUENCE = (
    "해당 금융회사 콜센터에 지급정지 요청",
    "1394 신고·상담",
    "긴급 시 112 신고",
    "통화·문자·계좌 증거 보관",
)


def _text_tier(score: int) -> int:
    return 3 if score >= 75 else 2 if score >= 60 else 1 if score >= 40 else 0


def _transaction_tier(raw_score: int) -> int:
    return 2 if raw_score >= 30 else 1 if raw_score >= 18 else 0


def plan_alert(risk: dict[str, Any], anomaly: dict[str, Any] | None = None) -> dict[str, Any]:
    anomaly = anomaly or {}
    text_tier = _text_tier(int(risk.get("score", 0)))
    transaction_tier = _transaction_tier(int(anomaly.get("raw_score", 0)))
    tier = max(text_tier, transaction_tier)
    if text_tier >= 1 and transaction_tier >= 1:
        tier = min(3, tier + 1)
    if risk.get("already_transferred"):
        tier = 3

    in_call = bool(anomaly.get("in_call"))
    channels: list[str] = []
    suppressed: list[str] = []
    if tier >= 1:
        channels.append("인앱 인라인 배너" if tier == 1 else "인앱 인터스티셜")
    if tier >= 2:
        (suppressed if in_call else channels).append("푸시 알림")
    if tier >= 3:
        channels.append("ARS 콜백")
        (suppressed if in_call else channels).append("SMS")

    primary_action = (
        "해당 금융회사 콜센터에 지급정지 요청" if risk.get("already_transferred")
        else "통화 즉시 종료" if tier >= 3
        else "공식 대표번호·앱에서 사실 확인"
    )
    if primary_action not in POLICY_ACTION_ALLOWLIST:
        primary_action = "공식 대표번호·앱에서 사실 확인"

    evidence = risk.get("evidence") or []
    reason_keyword = (evidence[0].get("keywords") or ["평소와 다른 거래 패턴"])[0] if evidence else "평소와 다른 거래 패턴"

    return {
        "tier": tier,
        "tier_name": ALERT_TIER_NAMES[tier],
        "text_tier": text_tier,
        "transaction_tier": transaction_tier,
        "channels": channels,
        "suppressed_channels": suppressed,
        "suppression_reason": "통화 중에는 상대방이 화면을 함께 볼 수 있어 푸시·SMS를 억제한다." if suppressed else "",
        "hold_seconds": ALERT_HOLD_SECONDS[tier],
        "self_check": list(ALERT_SELF_CHECK) if tier >= 2 else [],
        "escalation_rule": "첫 문항에 '예'로 답하면 즉시 최고 단계로 승급한다." if tier >= 2 else "",
        "covert_mode": in_call and tier >= 2,
        "notify_trusted_contact": tier >= 3,
        "golden_time": (
            {"window_minutes": 30, "sequence": list(GOLDEN_TIME_SEQUENCE)}
            if risk.get("already_transferred") else None
        ),
        "message": {
            "observed": list(anomaly.get("observed", []))[:3],
            "reason": f"[{risk.get('risk_type', '정상 절차')}] {reason_keyword}",
            "primary_action": primary_action,
        },
        "external_action_executed": False,
    }


def guarded_policy_answer(risk: dict[str, Any], policy: dict[str, Any], documents: list[dict[str, Any]]) -> str:
    allowed_actions = [action for action in policy.get("actions", []) if action in POLICY_ACTION_ALLOWLIST]
    if not allowed_actions:
        allowed_actions = ["공식 대표번호·앱에서 사실 확인"]
    action_lines = "\n".join(f"- {action}" for action in allowed_actions)
    summary = (
        f"서버 위험 판정: {risk['level']} · {risk['risk_type']}."
        if risk["verdict"] == "사기"
        else "서버 위험 판정: 안전 · 강한 사기 징후 없음."
    )
    return (
        f"{summary}\n"
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


STRUCTURED_STATES = {"normal", "suspicious", "fraud", "victim"}
STRUCTURED_POLARITIES = {"requested", "refused", "completed", "self_action"}
STRUCTURED_DESTINATIONS = {"external", "self", "registered", "unknown"}


async def call_ollama_structured(context: str) -> str:
    schema = {
        "state": "normal|suspicious|fraud|victim", "risk_type": "한국어 위험유형",
        "completed_action": False, "external_actor": False,
        "requested_asset": {"financial_value": False, "credential": False, "remote_control": False, "identity": False},
        "action_polarity": "requested|refused|completed|self_action",
        "destination": "external|self|registered|unknown", "confidence": 0.0, "evidence_spans": [],
    }
    return await call_ollama([{ "role": "system", "content": "금융사기 분류기다. 설명 없이 엄격한 JSON 객체만 출력한다." }, {
        "role": "user", "content": f"스키마: {json.dumps(schema, ensure_ascii=False)}\n사건: {context}",
    }])


def parse_structured_risk(raw: str) -> dict[str, Any]:
    value = json.loads(raw)
    assets = value.get("requested_asset")
    if value.get("state") not in STRUCTURED_STATES or value.get("action_polarity") not in STRUCTURED_POLARITIES:
        raise ValueError("invalid structured enum")
    if value.get("destination") not in STRUCTURED_DESTINATIONS or not isinstance(assets, dict):
        raise ValueError("invalid destination/assets")
    required_assets = {"financial_value", "credential", "remote_control", "identity"}
    if set(assets) != required_assets or not all(isinstance(assets[key], bool) for key in required_assets):
        raise ValueError("invalid requested_asset")
    confidence = float(value.get("confidence"))
    if not 0 <= confidence <= 1 or not isinstance(value.get("evidence_spans"), list):
        raise ValueError("invalid confidence/evidence")
    return {**value, "confidence": confidence}


def fuse_risk(
    rule: dict[str, Any],
    structured: dict[str, Any],
    transaction: dict[str, Any] | None = None,
) -> dict[str, Any]:
    fused = {**rule, "fusion": "rule+structured"}
    state, confidence = structured["state"], structured["confidence"]
    victim = state == "victim" or (structured["completed_action"] and structured["external_actor"])
    if victim:
        fused.update(score=max(rule["score"], 75), level="위험", verdict="사기", risk_type="피해 발생", already_transferred=True)
    elif state == "fraud" and confidence >= 0.75:
        fused.update(score=max(rule["score"], 70), level="위험", verdict="사기", risk_type=structured["risk_type"] or rule["risk_type"])
    elif state == "suspicious" or confidence < 0.75 or ((state == "normal") != (rule["verdict"] == "정상")):
        fused.update(score=max(rule["score"], 40), level="주의", verdict="사기")
        if fused["risk_type"] == "정상 절차":
            fused["risk_type"] = structured["risk_type"] or "복합 의심"
    return _apply_transaction_signal(fused, transaction)


def _apply_transaction_signal(fused: dict[str, Any], transaction: dict[str, Any] | None) -> dict[str, Any]:
    """거래 이상신호는 점수·등급만 올린다. verdict는 통화 맥락 판정을 그대로 둔다."""
    contribution = int((transaction or {}).get("score", 0))
    fused["transaction_score"] = contribution
    if contribution <= 0:
        return fused
    fused["score"] = min(100, fused["score"] + contribution)
    fused["level"] = "위험" if fused["score"] >= 70 else "주의" if fused["score"] >= 40 else "안전"
    fused["fusion"] = f"{fused['fusion']}+transaction"
    return fused


def prepare_input(state: ChatState) -> dict[str, Any]:
    if not state.get("user_input", "").strip():
        raise ValueError("사용자 입력이 비어 있습니다.")
    current = state["user_input"].strip()
    closed = bool(re.search(
        r"(정정|예문|예시|가정|실제로는.{0,20}(아니|않|없)|송금하지않|보내지않|설치하지않|새주제|다른질문|별개)",
        re.sub(r"\s+", "", current.lower()),
    ))
    previous = state.get("incident_summary", "")
    analysis_input = current if closed or not previous else f"{previous}\n{current}"
    return {
        "user_input": current,
        "analysis_input": analysis_input,
        "incident_summary": current if closed else analysis_input[-1200:],
        "incident_status": "closed" if closed else "active",
        "provider": "ollama",
        "model": OLLAMA_MODEL,
        "trace": ["prepare_input"],
    }


def transaction_signal_agent(state: ChatState) -> dict[str, Any]:
    """백그라운드 이상거래 탐지. 통화 입력과 무관하게 거래 프로필만 본다."""
    return {"transaction_anomaly": detect_transaction_anomaly(state.get("transaction")), "trace": ["transaction_signal_agent"]}


async def structured_risk_agent(state: ChatState) -> dict[str, Any]:
    rule = analyze_risk(state["analysis_input"])
    anomaly = state.get("transaction_anomaly", {})
    try:
        structured = parse_structured_risk(await call_ollama_structured(state["analysis_input"]))
        return {"rule_risk": rule, "structured_risk": structured, "risk": fuse_risk(rule, structured, anomaly), "structured_fallback": False, "structured_error": None, "trace": ["structured_risk_agent", "conservative_fusion"]}
    except Exception as exc:
        return {"rule_risk": rule, "structured_risk": {}, "risk": _apply_transaction_signal({**rule, "fusion": "rule_fallback"}, anomaly), "structured_fallback": True, "structured_error": f"{type(exc).__name__}: {str(exc)[:180]}", "trace": ["structured_risk_agent_failed", "rule_risk_fallback"]}


def knowledge_agent(state: ChatState) -> dict[str, Any]:
    return {"documents": retrieve_documents(state["analysis_input"], state["risk"]["risk_type"]), "trace": ["knowledge_agent"]}


def policy_agent(state: ChatState) -> dict[str, Any]:
    return {"policy": recommend_policy(state["risk"]), "trace": ["policy_agent"]}


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
        "post_transfer_1394": (not transferred) or "1394" in answer,
        "post_transfer_emergency_112": (not transferred) or bool(re.search(r"긴급.{0,12}112|112.{0,12}긴급", answer)),
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


def alert_planner(state: ChatState) -> dict[str, Any]:
    return {"alert": plan_alert(state["risk"], state.get("transaction_anomaly", {})), "trace": ["alert_planner"]}


def finalize(state: ChatState) -> dict[str, Any]:
    return {
        "messages": [AIMessage(content=state["final_answer"])],
        "turn_count": int(state.get("turn_count", 0)) + 1,
        "trace": ["finalize"],
    }


workflow = StateGraph(ChatState)
workflow.add_node("prepare_input", prepare_input)
workflow.add_node("transaction_signal_agent", transaction_signal_agent)
workflow.add_node("structured_risk_agent", structured_risk_agent)
workflow.add_node("knowledge_agent", knowledge_agent)
workflow.add_node("policy_agent", policy_agent)
workflow.add_node("ollama_generate", generate_answer)
workflow.add_node("safety_verifier", safety_verifier)
workflow.add_node("alert_planner", alert_planner)
workflow.add_node("finalize", finalize)
workflow.add_edge(START, "prepare_input")
workflow.add_edge("prepare_input", "transaction_signal_agent")
workflow.add_edge("transaction_signal_agent", "structured_risk_agent")
workflow.add_edge("structured_risk_agent", "knowledge_agent")
workflow.add_edge("structured_risk_agent", "policy_agent")
workflow.add_edge(["knowledge_agent", "policy_agent"], "ollama_generate")
workflow.add_edge("ollama_generate", "safety_verifier")
workflow.add_edge("safety_verifier", "alert_planner")
workflow.add_edge("alert_planner", "finalize")
workflow.add_edge("finalize", END)

# Demo-only volatile memory: all sessions disappear when this process exits.
memory = InMemorySaver()
chat_graph = workflow.compile(checkpointer=memory)


async def run_chat(message: str, session_id: str, transaction: dict[str, Any] | None = None) -> dict[str, Any]:
    result = await chat_graph.ainvoke(
        {"messages": [HumanMessage(content=message)], "user_input": message, "transaction": transaction or {}},
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
        "structured_risk": result.get("structured_risk", {}),
        "structured_fallback": bool(result.get("structured_fallback")),
        "structured_error": result.get("structured_error"),
        "incident_status": result.get("incident_status", "active"),
        "transaction_anomaly": result.get("transaction_anomaly", {}),
        "alert": result.get("alert", {}),
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
