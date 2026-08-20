from __future__ import annotations

import copy
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path("/Users/dongyoungko/Documents/AI_Hacker")
DOWNLOADS = Path("/Users/dongyoungko/Downloads")
OUT = ROOT / "submission"


def build(source: Path, target: Path, replacements: dict[str, str], preview: str) -> None:
    with zipfile.ZipFile(source, "r") as src:
        infos = src.infolist()
        payloads = {info.filename: src.read(info.filename) for info in infos}

    xml = payloads["Contents/section0.xml"].decode("utf-8")
    for old, new in replacements.items():
        if old not in xml:
            raise RuntimeError(f"placeholder not found: {old}")
        xml = xml.replace(f">{old}<", f">{new}<", 1)
    payloads["Contents/section0.xml"] = xml.encode("utf-8")
    if "Preview/PrvText.txt" in payloads:
        payloads["Preview/PrvText.txt"] = preview.encode("utf-8")

    with zipfile.ZipFile(target, "w") as dst:
        for info in infos:
            clone = copy.copy(info)
            if info.filename == "mimetype":
                clone.compress_type = zipfile.ZIP_STORED
            dst.writestr(clone, payloads[info.filename])


TEAM = "[최종 입력 필요]"
MEMBERS = "[팀장·팀원 성명 최종 입력 필요]"

plan_source = DOWNLOADS / "(첨부1) 2026 금융 AI Challenge 공모전 기획서.hwpx"
plan_target = OUT / "(통합수정본) 2026 금융 AI Challenge 기획서_AI_Finance_Sec.hwpx"
plan_replacements = {
    "·": " ",
    "등록된 팀명과 동일하게 작성": TEAM,
    "팀장, 팀원 순으로 작성": MEMBERS,
    "- 제안하는 AI 금융 서비스의 직관적인 명칭 기재": "AI_Finance_Sec — 송금 전 마지막 판단을 돕는 AI 금융 보안 비서",
    "전체 기획의 핵심 내용을 요약하여 개조식으로 간략히 작성": "• 의심 통화와 평소와 다른 거래 정황을 함께 살펴 위험 이유와 다음 행동을 설명\n• 1차 고객은 모바일뱅킹 이용자, 도입 주체는 금융회사 소비자보호·이상거래탐지·디지털 조직\n• 은행 앱 송금 확인 단계에서 시작해 상담원과 이상거래 운영 화면으로 확장하는 B2B2C 서비스",
    "아이디어가 해결하고자 하는 현재 금융 서비스의 구체적인 문제점 기술": "경찰청에 따르면 보이스피싱 피해액은 2024년 상반기 3,243억 원에서 2025년 상반기 6,421억 원으로 98.1% 증가했고, 2026년 1~4월에도 2,225억 원의 피해가 발생했다. 고객은 통화 경고와 거래 경고를 따로 받아 복합 위험을 이해하기 어렵고, 심리적 압박 속에서 송금 중단·공식 확인·피해 대응의 우선순위를 놓친다.",
    "특정 금융 고객(예: 사회 초년생, 카드 이용 고객 등) 및 채널(모바일 앱, 오프라인 영업점 등)을 선택한 배경과 이유 설명": "첫 고객은 의심 통화 직후 송금하려는 모바일뱅킹 이용자다. 송금 확인 화면은 손실 전 마지막 개입 접점이다. 소비자보호 조직이 사업·정책을 총괄하고 디지털·FDS·준법·상담 조직이 제품, 임계값, 중단 승인, 이의제기를 분담한다.",
    "- 서비스의 핵심 컨셉과 기존 금융 앱 대비 확실한 독창성": "‘위험합니다’라는 단순 경고 대신 통화 정황과 거래 정황이 왜 함께 위험한지, 지금 무엇을 멈추고 어디에 확인해야 하는지를 한 화면에서 설명한다. 탐지 결과를 고객의 이해와 행동으로 바꾸는 서비스 계층이며 기존 이상거래탐지·통화 탐지·예방 교육을 대체하지 않고 연결한다.",
    "차별성 기술": "갤럭시·SKT 에이닷은 온디바이스 통화 위험 경고, 금융권 ASAP은 기관 정보공유·계좌조치에 강점이 있다. 본 서비스는 이 신호와 거래 정황을 송금 확인 화면에서 이유·재확인·공식 행동으로 연결한다. 정상 상담 반례를 포함해 과도한 경고가 실제로 줄어드는지는 POC에서 검증한다.",
    "- 해당 아이디어를 위해 사용한 데이터 종류와 데이터 수집·활용 방안 설명": "MVP는 합성 통화·거래, 정상 반례, 공식기관 안내를 요약한 데모 지식을 사용한다. POC 우선안은 고객 동의 아래 단말·통신 파트너가 기기 내 분석 후 위험유형·신뢰도·시각만 은행에 전달하는 방식이며 원문 음성·전사문은 기본 전송하지 않는다. 미동의·미연계 시 거래 신호만 사용한다. 실제 데이터와 지식은 준법·정보보호 검수 후 최소수집한다.",
    "- 생성형 AI 모델을 서비스 내에서 어떻게 활용했고, 어떤 역할을 수행하는지 구체적으로 제시": "현재 MVP는 Qwen을 실제 호출해 오케스트레이션과 안전 경계를 검증하지만 모델 자유문은 폐기하고 서버의 허용된 정책 문장만 표시한다. POC에서는 구조화된 위험 분석이 오프라인 정확성·안전성 기준을 통과한 경우에만 설명 보조에 반영한다. 위험 확정, 거래 차단, 신고·지급정지는 수행하지 않는다.",
    "- 제안 아이디어를 통해 해결할 수 있는 구체적인 문제와 기대 효과 명확히 설명": "고객이 송금 전에 멈추고 공식 채널로 재확인하도록 돕는 것을 목표로 한다. POC 잠정 가설은 단순 경고 대비 모의 재확인 선택 +20%p, 이해도 80% 이상, 정상 오경보 비열등 한계 +2%p, 상담 검토시간 20% 단축이며 기준선 확인 후 사전등록한다.",
    "- 실제 금융 고객 또는 서비스 제공자가 받을 수 있는 실질적인 혜택 기술": "고객은 ‘왜 위험한지·지금 무엇을 해야 하는지’를 이해하고, 피해가 발생한 경우 24시간 통합신고·상담 1394, 긴급 시 112, 해당 금융회사 연락과 지급정지 요청 순서를 안내받는다. 금융회사는 고객 행동과 근거를 연결해 상담·민원·오경보 개선에 활용할 수 있다.",
    "- 향후 시장 확대 가능성, 추가 기능 및 서비스로의 확장 방안 제안": "8주 실증은 최소 사용자 60명, 상담·FDS 담당자 10명, 정상·위험 각 12개 균형 시나리오로 탐색하고 파일럿 분산에 따라 표본을 재산정한다. 통과 시 모바일 앱에서 상담센터·FDS로 확대하고 승인된 단말·통신·기관 신호 연계를 검토한다. 기관 연간 라이선스를 우선 과금 단위로 제안한다.",
    "- 금융 서비스 외 타 영역으로 확장 가능한 응용 가능성 등 명시": "같은 ‘정황 결합→이유 설명→안전 행동’ 방식은 스미싱, 중고거래 사기, 보험사기, 전자상거래 계정탈취 등 디지털 사기 예방으로 확장할 수 있다.",
    "7. (자유타이틀 기재)": "7. 책임 있는 운영과 실증 기준",
    "- 출품작에 대한 기타 추가 내용이 있을 경우 해당 란을 활용하여 작성": "현재 MVP는 합성 데이터 의사결정 보조이며 실제 기관과 연결되지 않는다. 사기 확정·거래 차단·신고·지급정지는 고객·기관 절차에 둔다. 위험한 금융행동 권고·개인정보 노출·필수행동 누락은 허용 0건이다. 근거: 경찰청 피해·대응(2026-05-26, bbscttSn=20260526143737248), 경찰청 1394(2026-02-09, bbscttSn=20260209152732394), 삼성 갤럭시 보이스피싱 알림(2025-08-21), SKT 에이닷 탐지(2025-12-01). URL: https://ai-finance-sec.headonggumdo.chatgpt.site",
}

spec_source = DOWNLOADS / "(첨부2) 2026 금융 AI Challenge 기능명세서.hwpx"
spec_target = OUT / "(통합수정본) 2026 금융 AI Challenge 기능명세서_AI_Finance_Sec.hwpx"
spec_replacements = {
    "등록된 팀명과 동일하게 작성": TEAM,
    "팀장, 팀원 순으로 작성": MEMBERS,
    "- 제출한 예선 MVP 산출물에서 구현한 기능 범위 작성": "합성 시나리오·통화/거래 탐지·경량 RAG/RRF·정탐/오탐·Mock/Ollama Local/5개 Cloud Provider를 구현했다. 로컬 P1은 Next→FastAPI→실제 LangGraph 병렬 fan-out/fan-in→Ollama qwen2.5:7b→guarded_policy/Safety→InMemorySaver 멀티턴을 지원한다.",
    "- 미구현 또는 향후 구현 예정 기능은 제외": "실시간 STT·거래 스트림·금융사 레거시·실제 신고/지급정지·개인정보 저장은 구현 범위가 아니다.",
    "실제 동작하는 기능을 기능 단위로 작성": "F01 샘플재생, F02 위험탐지, F03 거래결합, F04 경량 RAG/RRF Top3, F05 Provider 라우터, F06 allowlist guarded_policy, F07 규칙 Safety/폴백, F08 실제 LangGraph trace, F09 session 멀티턴, F10 응답 투명성, F11 합성 회귀평가 — 모두 구현 완료",
    "기능명, 기능 설명, 관련 화면, 구현 상태 작성": "공개 P0는 배포 URL에서 Mock·Cloud BYOK를 실행한다. 로컬 P1은 localhost의 Ollama·FastAPI·Next 3개 프로세스에서 실행하며 공개 서버는 사용자 PC Ollama에 접근할 수 없다.",
    "사용자가 배포 URL 접속 후 주요 기능을 사용하는 순서 작성": "공개: URL→Mock→합성 시나리오→simulated flow·위험·거래·검색 근거 확인. 로컬: ollama serve→FastAPI :8000→Next :3000→Ollama Local 선택→질문→actual trace·session·turn·guarded_policy 확인.",
    "- AI가 수행하는 역할 작성": "FastAPI ChatState 저장 후 risk_agent·knowledge_agent·policy_agent를 병렬 실행하고 ollama_generate로 fan-in한다. Qwen은 실제 호출되지만 자유문은 폐기하며 서버 allowlist가 guarded_policy를 구성해 규칙 Safety 후 반환한다.",
    "- 사용 데이터와 입력·출력 데이터 작성": "입력은 합성 통화 문장·거래 신호·질문이다. 출력은 위험도·이유·서버 선택 검색 근거·정책 행동·response_mode·trace다. 8개 합성셋은 회귀평가 기준선이며 실사용 성능 주장이 아니다.",
    "- (필요시) 개인정보 또는 민감정보 처리 여부 작성": "실제 개인정보·계좌정보를 저장하지 않는다. 로컬 Qwen 자유문은 State·API·UI에 남기지 않는다. Cloud BYOK는 React state와 Next 1회 요청을 경유하며 앱 저장 기능은 없지만 호스팅·Provider 로그 정책은 별도다.",
    "- 심사자가 제출한 배포 URL에서 주요 기능을 확인하는 절차 작성": "공개 URL에서 Mock 기관사칭과 정상 Hard Negative를 실행해 위험·거래·검색 근거를 비교한다. 실제 Qwen은 로컬에서 Ollama→FastAPI→Next를 실행하고 Ollama Local 선택 후 actual trace와 guarded_policy를 확인한다.",
    "- 테스트에 필요한 계정, 샘플 입력값, 예상 결과 등 작성": "Mock은 계정 불필요. ‘안전계좌로 즉시 이체’는 위험, ‘지금 송금할 필요 없음’은 정상이다. 피해발생 응답은 1394·긴급 시 112·해당 금융회사 연락·지급정지 요청을 모두 포함한다. Cloud만 사용자 API 키가 필요하다.",
    "- 실행 환경 또는 브라우저 제한사항 작성": "최신 Chrome·Edge·Safari를 권장한다. 로컬 P1은 Ollama qwen2.5:7b·Python FastAPI :8000·Next :3000이 필요하다. 검증은 npm test, pytest, smoke_ollama.py로 수행한다.",
    "- MVP 단계의 제한사항 작성": "프론트·백엔드 자동검사와 동일 session 2턴 smoke를 통과했다. 모든 데이터·수치는 소형 합성 회귀 기준선이다. 실제 사기 확정·거래차단·1394/112 신고·금융회사 지급정지는 수행하지 않고, 실시간·개인정보·감사·기관 연동은 P2다.",
}

build(plan_source, plan_target, plan_replacements, "AI_Finance_Sec 2026 금융 AI Challenge 기획서 통합수정본\n공개 P0 Mock + 로컬 P1 Ollama Qwen/LangGraph\n팀명·구성원 최종 입력 필요")
build(spec_source, spec_target, spec_replacements, "AI_Finance_Sec 2026 금융 AI Challenge 기능명세서 통합수정본\nNext → FastAPI → LangGraph → Ollama qwen2.5:7b → guarded_policy\nhttps://ai-finance-sec.headonggumdo.chatgpt.site")
print(plan_target)
print(spec_target)
