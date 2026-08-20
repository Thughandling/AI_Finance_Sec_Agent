# 2026 금융 AI Challenge MVP 기술명세서

> 서비스명: **AI_Finance_Sec**  
> 구현 상태: P0 공개 Mock 데모 + P1 로컬 Qwen/LangGraph 데모  
> 공개 데모: `https://ai-finance-sec.headonggumdo.chatgpt.site`  
> 문서 기준 구현: `afc5a8d44f2ad277f010d37bf3768b59dfa67550`

## 1. 구현 범위

### P0/P1 포함

- 합성 통화·거래 시나리오와 8개 회귀 검증셋
- 규칙 기반 위험탐지·거래 상관 점수·정상 Hard Negative
- 소형 지식베이스 경량 검색과 RRF 리랭킹, 서버 선택 근거 Top 3
- 공개 Mock, 로컬 Ollama Qwen, 5개 Cloud BYOK Provider 라우터
- Next `/api/chat` 프록시 → FastAPI → 실제 Python LangGraph → Ollama `qwen2.5:7b`
- LangGraph 병렬 fan-out/fan-in, `InMemorySaver`, `session_id` 멀티턴, actual trace
- Qwen 자유문 비노출, 서버 allowlist 기반 `guarded_policy`, 규칙 기반 Safety, 명시적 `mock_fallback`
- 독립 실행형 LangGraph 노트북과 실제 Ollama smoke 증적

### P2 제외

- 실시간 통화 STT·금융거래 스트림
- 실제 금융회사 레거시·FDS·1394/112 신고·지급정지 연동
- 실제 고객 개인정보 저장·처리
- 영속 세션, 운영자 계정·권한, 감사로그
- 기관별 규제·보존·승인 정책
- BGE-M3·cross-encoder·RAGAS의 운영 적용과 실제 성능 검증

## 2. 시스템 구성

```text
Browser UI
 ├─ Public P0: Mock + 합성 State/RAG/평가 흐름
 ├─ Cloud BYOK: OpenAI/DeepSeek/Claude/Gemini/Qwen Cloud
 └─ Local P1: Ollama Local 선택
          │ POST /api/chat
          ▼
Next server proxy
 ├─ Cloud Provider API 호출
 └─ Local request → FastAPI :8000
                         │
                         ▼
Python LangGraph
 prepare_input
   ├─ risk_agent
   ├─ knowledge_agent       (parallel fan-out/fan-in)
   └─ policy_agent
       → ollama_generate(qwen2.5:7b 호출 + guarded_policy 구성)
       → safety_verifier
        → finalize / InMemorySaver
```

공개 배포 서버는 사용자 PC의 localhost Ollama에 접근할 수 없다. 실제 Qwen 데모는 같은 PC에서 Ollama·FastAPI·Next를 실행하는 로컬 3프로세스 구성이다.

## 3. 주요 기능

| ID | 기능 | 입력 | 처리 | 출력 |
|---|---|---|---|---|
| F-01 | 시나리오 재생 | 합성 샘플 | 문장·거래 신호 순차 반영 | 통화 로그·단계 표시 |
| F-02 | 위험탐지 | 통화 문장 | 가중치·부정표현 분석 | 0~100, 안전/주의/위험, 정상/사기 |
| F-03 | 거래결합 | 거래 신호 | 신규성·금액·행동 상관 | 결합 위험 점수·이유 |
| F-04 | 경량 RAG | 질의·위험유형 | lexical/risk-type rank + RRF | 서버 선택 근거 Top 3 |
| F-05 | 모델 라우터 | Provider·질문 | Mock/Ollama/Cloud 분기 | Provider 호출 상태 |
| F-06 | 정책 보호 응답 | 위험·정책·문서 | allowlist로 `guarded_policy` 구성 | 안전 대응 안내 |
| F-07 | 안전검증 | 정책 응답 | 필수행동·금지행동 규칙 검사 | 통과 또는 Mock 폴백 |
| F-08 | 실제 오케스트레이션 | ChatState | 3개 분석 Node 병렬 실행·fan-in | 실제 trace |
| F-09 | 멀티턴 | `session_id` | `InMemorySaver` checkpoint | turn 증가·문맥 유지 |
| F-10 | 응답 투명성 | 실행 결과 | 모드·호출·가드·실패 이유 구분 | UI 상태 배지 |
| F-11 | 회귀평가 | 8개 합성셋 | TP/TN/FP/FN·검색 순위 | Macro F1·Recall 등 |

## 4. 실제 FastAPI LangGraph State·Node·Edge

### State

`ChatState`는 `messages`, `analysis_input`, `risk`, `documents`, `policy`, `draft_answer`, `final_answer`, `initial_safety`, `safety`, `provider`, `model`, `response_mode`, `llm_invoked`, `policy_guardrail_applied`, `turn_count`, `trace`를 관리한다.

### Node와 Edge

```text
START → prepare_input
      ├→ risk_agent ─────┐
      ├→ knowledge_agent ├→ ollama_generate
      └→ policy_agent ───┘
          → safety_verifier → finalize → END
```

- `prepare_input`: 입력 정규화와 이전 세션 문맥 결합
- `risk_agent`: 규칙 기반 통화·거래 위험 분석
- `knowledge_agent`: 소형 KB 검색과 RRF Top 3 선택
- `policy_agent`: 위험 수준별 허용 행동 추천
- `ollama_generate`: Qwen을 실제 호출하지만 자유문을 State/API/UI에 저장·노출하지 않고 폐기하며, 내부 `policy_guardrail` 단계에서 서버 allowlist로 정상·위험·피해별 `guarded_policy` 구성
- `safety_verifier`: 필수행동과 위험 권고 금지 규칙 검사
- `finalize`: `turn_count` 증가 후 응답·trace·session·turn·fallback metadata 반환

`workflow.compile(checkpointer=InMemorySaver())`로 컴파일하며 동일 `session_id`가 멀티턴을 유지한다. 메모리는 프로세스 로컬·비영속이며 서버 재시작 시 사라진다. Provider나 시나리오를 변경하거나 새 분석을 시작하면 UI가 로컬 세션을 초기화한다.

독립 노트북의 ToolNode/오케스트레이터 예시는 확장 참고 구현이며, 현재 실제 웹 백엔드에는 ToolNode가 없다.

## 5. 모델 라우터

| Provider | 현재 기본 모델 | 키 | 실행 경로 |
|---|---|---|---|
| Mock | Deterministic Safety Engine | 없음 | 브라우저 합성 데모·장애 폴백 |
| Ollama Local | `qwen2.5:7b` | 없음 | 로컬 FastAPI/LangGraph/Ollama |
| OpenAI | `gpt-5.6-terra` | 필요 | Next → Responses API |
| DeepSeek | `deepseek-v4-flash` | 필요 | Next → OpenAI-compatible API |
| Claude | `claude-sonnet-4-5-20250929` | 필요 | Next → Messages API |
| Gemini | `gemini-2.5-flash` | 필요 | Next → generateContent |
| Qwen Cloud | `qwen-plus` | 필요 | Next → DashScope compatible API |

Cloud BYOK 키는 React state에만 유지되고 Next 서버 프록시의 1회 요청에 전달된다. 애플리케이션에 DB·파일 저장 기능은 없고 응답에 `Cache-Control: no-store`를 설정한다. 다만 호스팅 사업자와 외부 Provider의 로그 정책은 별도이므로 공개 시연에는 제한된 촬영용 키와 로컬 실행을 권장한다. 운영 전에는 기관 Secret Manager와 서버 전용 자격증명으로 교체한다.

## 6. RAG·리랭킹·Safety

P0/P1 RAG는 외부 벡터DB 없이 재현하도록 소형 코드 내 KB의 lexical overlap과 위험유형 점수를 독립 순위화하고 `1/(60+rank)` 기반 RRF로 결합한다. 기관 문서에는 순위를 뒤집지 않는 작은 tie-breaker만 적용한다. 화면의 문서는 “서버가 선택한 검색 근거”이며 의미적 grounding이나 공식 인용 정확성 검증을 주장하지 않는다.

로컬 Qwen은 실제 호출되지만 정상·위험·피해 모든 자유문을 최종 답변에 반영하지 않는다. 서버 allowlist가 `guarded_policy`를 구성하고 규칙 기반 Safety가 검사한다. 피해발생 사례는 1394 신고·상담, 긴급 시 112, 해당 금융회사 연락, 지급정지 요청을 모두 포함해야 한다. Ollama 호출 실패는 `response_mode=mock_fallback`, `fallback_reason=ollama_call_failure`로 표시한다.

P2의 BGE-M3 + cross-encoder 전환은 오프라인 `Recall@20`, `MRR@10`, `NDCG@10`과 생성 품질 개선이 확인될 때만 채택한다.

## 7. 분석 에이전트 결정

실시간 경로에 정탐·오탐·최종분석 LLM 세 개를 직렬 배치하지 않는다. 비용·지연과 상관된 오류가 증가하기 때문이다. 런타임에는 결정론적 탐지·검색·정책 Node와 한 번의 로컬 Qwen 호출, 서버 정책 보호·Safety를 사용한다. 정탐·오탐·미탐은 라벨이 존재하는 오프라인 평가에서 계산하고 경계 사례만 복수 모델 judge 또는 사람 검토 대상으로 보낸다.

## 8. 평가와 현재 검증 결과

- 분류 계획: Macro F1, 사기 Recall, Precision, FPR, confusion matrix
- 검색 계획: Recall@K, MRR, NDCG@K
- 생성 계획: RAGAS faithfulness, answer relevancy, context precision, context recall
- 안전 기준: 위험 응답의 통화종료·송금중단 포함, 피해발생 1394·긴급 시 112·해당 금융회사·지급정지 요청 AND 조건, 위험 권고·허위 조치 완료 주장 금지
- 현재 자동검사: ESLint 통과, Vinext production build 통과, 프론트 11/11, 백엔드 29/29
- 현재 smoke: 동일 session 2턴의 turn 1→2, `llm_invoked=true`, `response_mode=guarded_policy`, `policy_guardrail_applied=true`, `fallback=false`
- 내장 합성셋: 위험 Recall 100%, 4개 시나리오와 피해 사례의 기대 문서 Top 1

현재 수치는 작고 합성된 회귀 검사용 기준선이며 실사용 성능 주장이 아니다. RAGAS는 평가 계획·입력 샘플 수준이며 실제 완료 점수는 없다.

## 9. 소스 및 증적

- `app/page.tsx`: UI, 실제/합성 결과 구분, 세션 초기화
- `app/lib/engine.ts`: 합성 시나리오, 탐지, 검색, 평가
- `app/api/chat/route.ts`: Ollama·Cloud Provider 프록시
- `backend/main.py`: FastAPI 엔드포인트와 입력 검증
- `backend/app/graph.py`: 실제 LangGraph·Ollama·정책 보호·멀티턴
- `backend/tests/test_api.py`: 백엔드 안전·세션 회귀검사
- `backend/scripts/smoke_ollama.py`: 실제 Ollama smoke 실행기
- `backend/smoke/actual_ollama_smoke_2026-08-04.json`: 민감정보 제거 smoke 증적
- `tests/engine.test.mjs`, `tests/rendered-html.test.mjs`: 프론트 회귀검사
- `AI_Finance_Sec_Chatbot_Orchestration.ipynb`: 독립 실행형 전체 프로세스 노트북

## 10. 실행과 검증 명령

### 최초 준비

```bash
cd /Users/dongyoungko/Documents/AI_Hacker/AI_Finance_Sec
ollama pull qwen2.5:7b
python3.14 -m venv backend/.venv
source backend/.venv/bin/activate
python -m pip install -r backend/requirements.txt
npm install
```

### 로컬 실제 Qwen 데모

터미널 1:

```bash
ollama serve
```

터미널 2:

```bash
cd /Users/dongyoungko/Documents/AI_Hacker/AI_Finance_Sec
source backend/.venv/bin/activate
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

터미널 3:

```bash
cd /Users/dongyoungko/Documents/AI_Hacker/AI_Finance_Sec
npm run dev
```

- 홈페이지: `http://localhost:3000`
- FastAPI 상태: `http://127.0.0.1:8000/health`
- FastAPI 문서: `http://127.0.0.1:8000/docs`

UI 설정에서 `Ollama Local`을 선택한다.

### 자동검증

```bash
npm run build
npm test
source backend/.venv/bin/activate
python -m pytest backend/tests -q
backend/.venv/bin/python backend/scripts/smoke_ollama.py
```

## 11. 알려진 한계

- 공개 URL에서는 사용자 PC의 localhost Ollama에 접근할 수 없다.
- 데모 데이터가 작고 합성이므로 실사용 성능을 대표하지 않는다.
- P0/P1 리랭킹은 실제 임베딩/cross-encoder가 아닌 재현 가능한 경량 검색이다.
- 로컬 Qwen 자유문은 최종 답변에 기여하지 않으며 구조화 분석 활용은 후속 범위다.
- `InMemorySaver`는 비영속이며 서버 재시작 시 세션이 사라진다.
- Cloud 모델명·가용성은 사용자 API 계정·지역·Provider 정책에 따라 달라질 수 있다.
- 실시간 거래·통화 연동, 인증, 감사, 개인정보, 금융기관별 규제는 P2 범위다.
- 실제 신고·지급정지·거래 차단은 수행하지 않는다.
