# AI_Finance_Sec 아키텍처 및 실행 가이드

## 1. 문서 목적

이 문서는 `AI_Finance_Sec`의 데모 범위와 챗봇 답변 생성 과정을 설명하고, 개발자가 FastAPI 백엔드와 프론트엔드를 실행하는 방법을 안내한다.

현재 MVP는 실제 통화·거래 데이터를 실시간으로 수집하지 않는다. 미리 준비한 샘플데이터를 순서대로 재생하여 탐지, 판단, 챗봇 개입 과정을 시연한다.

---

## 2. 개발 범위

### P0 — MVP 필수 기능

- 샘플 통화 데이터 재생
- 샘플 거래 데이터 재생
- 규칙 기반 위험 점수 계산
- 탐지 근거와 점수 변화 표시
- 위험 임계치 초과 시 챗봇 선제 개입
- OpenAI·Claude·Gemini·DeepSeek·Qwen·목업 모드 중 하나 선택
- 사용자가 입력한 API 키로 선택 모델 호출
- API 연결 실패 시 목업 모드로 전환
- 시나리오 초기화와 반복 실행
- 인앱 데모 진행 가이드

### P1 — 데모 완성도 향상

- 통화와 거래 데이터를 결합한 위험 판단
- 사용자 답변에 따른 대응 단계 분기
- 신고 연결·지급정지·공식번호 확인 목업 액션
- 최근 탐지 세션 재생
- 발표용 자동 재생 모드
- 모델 연결 상태와 데모 준비 상태 점검
- 탐지 결과 설명 가능성 강화

### P2 — MVP 이후 검토

- 실제 통화·문자·거래 데이터 실시간 연동
- 금융회사별 레거시 시스템 연계
- 실제 신고·지급정지 API 연동
- 개인정보 처리·보관·삭제 정책
- 로그인·권한·감사 체계
- 금융 규제와 법률 검토
- 운영 모니터링과 장애 대응

---

## 3. 데모 시작 흐름

### 3.1 AI 모델 선택

사용자에게 다음 여섯 가지 실행 방식을 제공한다.

1. OpenAI
2. Claude
3. Gemini
4. DeepSeek V4-Flash
5. Qwen
6. API 없이 목업 테스트

### 3.2 API 키 입력

API 모델을 선택하면 해당 공급자의 API 키를 입력한다.

| 공급자 | 필요한 환경 변수 또는 키 종류 |
|---|---|
| OpenAI | `OPENAI_API_KEY` |
| Claude | `ANTHROPIC_API_KEY` |
| Gemini | `GEMINI_API_KEY` |
| DeepSeek V4-Flash | `DEEPSEEK_API_KEY` |
| Qwen | `DASHSCOPE_API_KEY` |
| 목업 | 필요 없음 |

DeepSeek 화면 표시명은 사용자가 요청한 `DeepSeek V4-Flash 0731`로 둘 수 있다. 다만 DeepSeek 공식 API에서 확인되는 실제 모델 ID는 날짜 접미사가 없는 `deepseek-v4-flash`이며, API Base URL은 `https://api.deepseek.com`이다. `0731`은 공식 모델 ID로 확인되지 않았으므로 코드에는 사용하지 않는다.

API 키 처리 원칙:

- 입력창은 비밀번호 형식을 사용한다.
- 키를 브라우저 로컬 저장소·쿠키·DB에 저장하지 않는다.
- 서버 로그에 키를 출력하지 않는다.
- 현재 데모 세션에서만 사용한다.
- 사용자가 `키 지우기`를 누르거나 세션이 끝나면 폐기한다.
- API 연결 실패 시 재입력 또는 목업 모드를 선택하게 한다.

### 3.3 시나리오 선택

- 통화 사기 탐지
- 거래 이상 탐지
- 통화·거래 결합 탐지

### 3.4 시연 시작

샘플데이터를 일정 간격으로 한 건씩 화면에 표시한다. 각 데이터가 입력될 때마다 탐지 엔진이 위험 점수를 계산하고, 임계치를 넘으면 챗봇이 먼저 개입한다.

---

## 4. 챗봇 답변 생성 전체 과정

### 4.1 전체 흐름

```text
사용자 쿼리 입력
    ↓
FastAPI 요청 수신
    ↓
입력 검증 및 세션 조회
    ↓
State 업데이트
    ↓
RAG 검색
    ↓
탐지 이벤트·검색 문서·대화 이력 결합
    ↓
LLM 프롬프트 생성
    ↓
선택 모델 호출
    ↓
응답 검증 및 후속 액션 결정
    ↓
State 저장
    ↓
프론트엔드 응답 반환
    ↓
채팅 화면에 답변 표시
```

### 4.2 사용자 쿼리 입력

사용자가 채팅 입력창에 현재 상황이나 질문을 입력한다.

예시:

```text
검찰이라고 전화가 왔는데 제 계좌가 범죄에 연루됐다고 합니다.
```

프론트엔드는 다음 정보를 FastAPI에 전달한다.

```json
{
  "session_id": "demo-session-001",
  "provider": "openai",
  "message": "검찰이라고 전화가 왔는데 제 계좌가 범죄에 연루됐다고 합니다.",
  "scenario_id": "prosecutor-scam"
}
```

### 4.3 FastAPI 요청 수신

FastAPI의 채팅 엔드포인트가 요청을 받는다.

목표 엔드포인트:

```text
POST /api/chat
```

처리 항목:

- 필수 값 확인
- 메시지 길이 확인
- 모델 공급자 확인
- 세션 존재 여부 확인
- 현재 탐지 이벤트 조회

### 4.4 State 조회 및 업데이트

`State`는 한 번의 대화와 시나리오가 현재 어느 단계에 있는지 보관한다.

예시 State:

```json
{
  "session_id": "demo-session-001",
  "scenario_id": "prosecutor-scam",
  "provider": "openai",
  "messages": [],
  "risk_score": 92,
  "risk_level": "danger",
  "detected_categories": ["기관 사칭", "금전 요구"],
  "evidence": ["검찰", "안전계좌", "지금 즉시"],
  "current_step": "user_confirmation",
  "recommended_actions": []
}
```

State의 역할:

- 이전 대화 내용 유지
- 현재 위험 점수 유지
- 시나리오 진행 단계 유지
- 이미 안내한 내용을 반복하지 않도록 제어
- 다음에 실행할 Node 결정

### 4.5 RAG 검색

RAG는 사용자의 질문과 현재 위험 유형에 맞는 검증된 대응 지식을 검색한다.

검색 대상 예시:

- 기관 사칭 보이스피싱 행동요령
- 대출 사기 선입금 요구 대응법
- 가족 납치·사고 빙자 대응법
- 지급정지 요청 절차
- 공식 대표번호 확인 방법
- 신고기관별 역할

RAG 입력:

```json
{
  "query": "검찰 사칭 안전계좌 이체 요구 대응",
  "categories": ["기관 사칭", "금전 요구"],
  "top_k": 3
}
```

RAG 출력:

```json
{
  "documents": [
    {
      "title": "기관 사칭형 보이스피싱 대응",
      "content": "수사기관은 전화로 안전계좌 이체를 요구하지 않는다.",
      "source": "verified-guide-001"
    }
  ]
}
```

MVP에서는 사전에 검토한 문서를 JSON 또는 Markdown 파일로 배치한다. 실제 벡터 데이터베이스는 필요할 때 P1 후반 또는 P2에서 도입할 수 있다.

### 4.6 프롬프트 조립

다음 정보를 하나의 모델 입력으로 결합한다.

1. 시스템 역할
2. 안전 원칙
3. 현재 탐지 이벤트
4. 위험 점수와 근거
5. RAG 검색 결과
6. 최근 대화 이력
7. 사용자 질문

시스템 역할 예시:

```text
당신은 침착한 AI 금융 보안 비서다.
사용자를 겁주지 말고 현재 상황을 짧게 설명한다.
송금, 앱 설치, 개인정보 제공을 권유하지 않는다.
검증된 대응 지식 안에서 즉시 실행 가능한 행동을 순서대로 안내한다.
```

### 4.7 LLM 호출

공급자별 코드를 공통 인터페이스로 감싼다.

```text
LLMAdapter
├── OpenAIAdapter
├── AnthropicAdapter
├── GeminiAdapter
├── DeepSeekAdapter
├── QwenAdapter
└── MockAdapter
```

공통 호출 형식:

```python
response = adapter.generate(
    system_prompt=system_prompt,
    messages=state.messages,
    context=rag_documents,
    event=detection_event,
)
```

공통 응답 형식:

```json
{
  "message": "통화를 즉시 종료하고 공식 대표번호로 다시 확인하세요.",
  "urgency": "high",
  "recommended_actions": [
    "end_call",
    "verify_official_number"
  ]
}
```

### 4.8 응답 검증

모델 응답을 그대로 화면에 출력하지 않는다.

검증 항목:

- 필수 필드 존재 여부
- 허용된 액션인지 확인
- 송금·앱 설치·개인정보 제공 권유 여부
- 과도한 공포 표현 여부
- 응답 길이 제한
- JSON 파싱 가능 여부

검증 실패 시 안전한 기본 안내를 반환한다.

```text
의심되는 요청을 진행하지 말고 통화를 종료하세요.
상대가 알려준 번호가 아닌 공식 대표번호로 직접 확인하세요.
```

### 4.9 State 저장

검증된 답변과 다음 단계를 State에 반영한다.

```json
{
  "current_step": "action_guidance",
  "recommended_actions": [
    "end_call",
    "verify_official_number"
  ]
}
```

### 4.10 프론트엔드 표시

FastAPI가 프론트엔드에 최종 결과를 반환한다.

```json
{
  "message": "통화를 즉시 종료하고 공식 대표번호로 다시 확인하세요.",
  "risk_score": 92,
  "risk_level": "danger",
  "actions": [
    {
      "id": "end_call",
      "label": "통화 종료"
    },
    {
      "id": "verify_official_number",
      "label": "공식번호 확인"
    }
  ]
}
```

프론트엔드는 다음 요소를 갱신한다.

- 챗봇 답변 말풍선
- 위험 점수
- 탐지 근거
- 후속 액션 버튼
- 현재 시나리오 단계

---

## 5. Node·Edge·Graph·Compile 개념

### 5.1 Node

Node는 전체 처리 과정의 한 단계를 의미한다.

권장 Node:

| Node | 역할 |
|---|---|
| `validate_input` | 사용자 입력 검증 |
| `load_state` | 세션 State 조회 |
| `detect_risk` | 통화·거래 위험 점수 계산 |
| `retrieve_guidance` | RAG 지식 검색 |
| `build_prompt` | 모델 입력 조립 |
| `call_llm` | 선택 모델 호출 |
| `validate_response` | 모델 응답 안전성·형식 검증 |
| `select_actions` | 후속 액션 결정 |
| `save_state` | State 저장 |
| `return_response` | 프론트엔드 응답 반환 |

### 5.2 Edge

Edge는 Node에서 다음 Node로 이동하는 조건이다.

예시:

```text
validate_input
├── 정상 → load_state
└── 오류 → return_error

call_llm
├── 성공 → validate_response
└── 실패 → mock_fallback

validate_response
├── 통과 → select_actions
└── 실패 → safe_default_response
```

### 5.3 Graph

Node와 Edge를 연결하면 챗봇 처리 흐름이 Graph가 된다.

```text
START
  ↓
validate_input
  ↓
load_state
  ↓
detect_risk
  ↓
retrieve_guidance
  ↓
build_prompt
  ↓
call_llm ──실패──→ mock_fallback
  ↓ 성공
validate_response ──실패──→ safe_default_response
  ↓ 통과
select_actions
  ↓
save_state
  ↓
return_response
  ↓
END
```

### 5.4 Compile

Compile은 정의한 Node와 Edge를 실제로 실행할 수 있는 Graph 객체로 만드는 단계다.

개념 예시:

```python
workflow = StateGraph(ChatState)

workflow.add_node("validate_input", validate_input)
workflow.add_node("load_state", load_state)
workflow.add_node("retrieve_guidance", retrieve_guidance)
workflow.add_node("call_llm", call_llm)
workflow.add_node("validate_response", validate_response)
workflow.add_node("save_state", save_state)

workflow.add_edge("validate_input", "load_state")
workflow.add_edge("load_state", "retrieve_guidance")
workflow.add_edge("retrieve_guidance", "call_llm")
workflow.add_edge("call_llm", "validate_response")
workflow.add_edge("validate_response", "save_state")

chat_graph = workflow.compile()
```

FastAPI에서는 컴파일된 `chat_graph`를 호출한다.

```python
result = await chat_graph.ainvoke(initial_state)
```

---

## 6. 샘플 거래 데이터 탐지

### 6.1 샘플 거래 데이터

```json
[
  {
    "time": "10:03:10",
    "beneficiary": "신규계좌-A",
    "amount": 100000,
    "is_new_beneficiary": true
  },
  {
    "time": "10:04:40",
    "beneficiary": "신규계좌-A",
    "amount": 200000,
    "is_new_beneficiary": true
  },
  {
    "time": "10:06:05",
    "beneficiary": "신규계좌-A",
    "amount": 5000000,
    "is_new_beneficiary": true
  }
]
```

### 6.2 위험 판단 규칙

| 규칙 | 조건 | 점수 |
|---|---|---:|
| 신규 수취인 | 과거 거래 이력 없음 | +15 |
| 거래 집중 | 5분 내 3건 이상 | +20 |
| 큰 금액 변화 | 평소 평균의 5배 이상 | +15 |
| 매우 큰 금액 변화 | 평소 평균의 10배 이상 | +30 |
| 잔액 소진 | 잔액의 70% 이상 이체 | +25 |
| 소액 후 고액 | 테스트 송금 후 10배 이상 | +25 |
| 위험 통화 직후 | 위험 통화 후 30분 이내 | +20 |
| 통화 금액 일치 | 통화 언급 금액과 거래액 일치 | +20 |

점수 구간:

- `0~39`: 정상
- `40~69`: 주의
- `70~84`: 높은 위험
- `85~100`: 매우 높은 위험

### 6.3 화면 시각화

MVP에서는 다음 요소를 사용한다.

- 거래가 한 건씩 나타나는 타임라인
- 현재 잔액 변화
- 위험 점수 누적 그래프
- 점수 상승 이유를 보여주는 탐지 근거 패널
- 정상·주의·위험 색상 구분
- 통화 위험과 거래 위험이 연결되면 `결합 위험` 표시

---

## 7. 목표 프로젝트 구조

아래 구조는 FastAPI 백엔드가 추가된 이후의 목표 구조다. 현재 저장소에는 프론트엔드 중심 데모만 구현되어 있으므로 `backend/` 파일은 다음 개발 단계에서 생성해야 한다.

```text
AI_Hacker/
├── AI_Finance_Sec/
│   ├── app/
│   │   ├── page.tsx
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── public/
│   ├── package.json
│   └── vite.config.ts
│
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   ├── .env.example
│   ├── app/
│   │   ├── api/
│   │   │   ├── chat.py
│   │   │   ├── scenarios.py
│   │   │   └── providers.py
│   │   ├── graph/
│   │   │   ├── state.py
│   │   │   ├── nodes.py
│   │   │   ├── edges.py
│   │   │   └── workflow.py
│   │   ├── llm/
│   │   │   ├── base.py
│   │   │   ├── openai_adapter.py
│   │   │   ├── anthropic_adapter.py
│   │   │   ├── gemini_adapter.py
│   │   │   ├── deepseek_adapter.py
│   │   │   └── mock_adapter.py
│   │   ├── rag/
│   │   │   ├── retriever.py
│   │   │   └── knowledge/
│   │   ├── detection/
│   │   │   ├── call_detector.py
│   │   │   ├── transaction_detector.py
│   │   │   └── scoring.py
│   │   └── schemas/
│   │       ├── chat.py
│   │       └── detection.py
│   └── tests/
│
├── sample_data/
│   ├── call_scenarios.json
│   └── transaction_scenarios.json
│
└── Edit.md
```

---

## 8. FastAPI 백엔드 실행 방법

> 아래 명령은 `backend/` 구현이 완료된 후 사용한다.

### 8.1 macOS·Linux

프로젝트 폴더로 이동한다.

```bash
cd /Users/dongyoungko/Documents/AI_Hacker/backend
```

Python 가상환경을 만든다.

```bash
python3 -m venv .venv
```

가상환경을 활성화한다.

```bash
source .venv/bin/activate
```

의존성을 설치한다.

```bash
pip install -r requirements.txt
```

FastAPI를 실행한다.

```bash
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

정상 실행 확인:

```text
API 상태: http://127.0.0.1:8000/health
API 문서: http://127.0.0.1:8000/docs
```

### 8.2 Windows PowerShell

```powershell
cd C:\path\to\AI_Hacker\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

---

## 9. 프론트엔드 실행 방법

### 9.1 프로젝트 폴더 이동

```bash
cd /Users/dongyoungko/Documents/AI_Hacker/AI_Finance_Sec
```

### 9.2 의존성 설치

npm 사용:

```bash
npm install
```

또는 pnpm 사용:

```bash
pnpm install
```

하나의 패키지 도구만 선택해서 사용한다.

### 9.3 개발 서버 실행

npm 사용:

```bash
npm run dev
```

pnpm 사용:

```bash
pnpm run dev
```

정상 실행 후 홈페이지 주소:

```text
http://localhost:3000
```

현재 배포된 비공개 데모 주소:

```text
https://ai-finance-sec.headonggumdo.chatgpt.site
```

---

## 10. 전체 서비스 실행 순서

터미널을 두 개 사용한다.

### 터미널 1 — FastAPI

```bash
cd /Users/dongyoungko/Documents/AI_Hacker/backend
source .venv/bin/activate
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

### 터미널 2 — 프론트엔드

```bash
cd /Users/dongyoungko/Documents/AI_Hacker/AI_Finance_Sec
pnpm run dev
```

### 브라우저

```text
http://localhost:3000
```

실행 순서:

1. FastAPI 실행
2. `http://127.0.0.1:8000/health` 확인
3. 프론트엔드 실행
4. `http://localhost:3000` 접속
5. AI 모델 또는 목업 모드 선택
6. 샘플 시나리오 선택
7. 데모 시작

---

## 11. 데모 영상 촬영 순서

1. 데모 설정 화면을 연다.
2. OpenAI·Claude·Gemini·DeepSeek·Qwen 중 하나를 선택한다.
3. 비밀번호 형식 입력창에 API 키를 붙여 넣는다.
4. 화면에는 `••••••••••••`만 표시되게 한다.
5. `연결 테스트`를 누른다.
6. 모델 연결 성공 상태를 보여준다.
7. 통화 시나리오를 실행한다.
8. 위험 점수와 탐지 근거 상승을 보여준다.
9. 챗봇의 선제 개입과 실제 모델 답변을 보여준다.
10. 거래 시나리오를 실행한다.
11. 거래 타임라인과 결합 위험 판단을 보여준다.
12. 대응 액션 버튼을 실행한다.
13. 촬영 종료 전에 `API 키 지우기`를 누른다.
14. 촬영용 API 키는 사용량 한도를 낮게 설정하고 촬영 후 폐기한다.

---

## 12. MVP 완료 기준

- 3개 이상의 통화 샘플 시나리오가 반복 실행된다.
- 3개 이상의 거래 샘플 시나리오가 반복 실행된다.
- 위험 점수와 탐지 근거가 데이터 순서에 맞춰 변한다.
- 위험 임계치 초과 시 챗봇이 먼저 개입한다.
- OpenAI·Claude·Gemini·DeepSeek·Qwen·목업 모드를 선택할 수 있다.
- API 키 오류와 API 장애를 화면에서 처리한다.
- 통화와 거래의 결합 위험을 설명할 수 있다.
- 모든 시나리오가 초기화 후 동일하게 재현된다.
- 발표용 자동 재생이 중단 없이 완료된다.
- API 키가 화면·로그·저장소에 남지 않는다.

MVP가 위 기준을 충족하고 실행 구조가 동결된 뒤 정식 `README`, 데모 매뉴얼, 운영 매뉴얼을 작성한다.
