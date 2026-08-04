# AI_Finance_Sec

보이스피싱 통화 문장과 거래 신호를 결합하고, 근거 검색·리랭킹·LLM 생성·안전 검증까지 한 화면에서 설명하는 금융 AI Challenge용 MVP입니다.

## 구현 범위

- API 키 없이 끝까지 재현되는 결정론적 Mock 데모
- Ollama Local(Qwen 2.5 7B)과 OpenAI, DeepSeek, Claude, Gemini, Qwen Cloud BYOK 모델 라우터
- 기관 사칭·대출 사기·가족 빙자·정상 Hard Negative 합성 시나리오
- State → 병렬 탐지 → RAG → RRF 리랭킹 → 모델 생성 → 규칙 기반 Safety 검사 흐름
- 통화·거래 결합 위험도, 서버가 선택한 검색 근거 Top 3, 정탐·오탐·미탐 표시
- 8개 회귀 검증셋과 Macro F1/Recall 요약

## 로컬 실행

Node.js 22.13 이상에서 다음 명령을 실행합니다.

```bash
npm install
npm run dev
```

브라우저에서 <http://localhost:3000>을 엽니다. 실제 모델을 사용하려면 우측 상단 `설정`에서 Provider와 본인의 API 키를 입력합니다. Cloud BYOK 키는 Next 서버 프록시를 경유하며 애플리케이션 저장 기능은 없지만 호스팅 사업자의 로그 정책은 별도입니다.

## Ollama Local + 실제 LangGraph 데모

Ollama Local은 Qwen Cloud(DashScope)와 다른 실행 경로입니다. API 키 없이 사용자의 Mac에서 `qwen2.5:7b`를 실행하며, FastAPI 내부의 실제 LangGraph가 입력 → 병렬 위험분석·지식검색·정책 → Qwen 로컬 호출 → 정책 보호/규칙 기반 Safety 검사 → finalize를 수행합니다. 정상·위험·피해 모든 판정에서 Qwen 원문을 State·API·UI에 노출하지 않고 서버 허용행동만으로 결정론적 `guarded_policy` 응답을 구성합니다. 호출 실패만 `mock_fallback`입니다.

UI의 **Qwen 로컬 호출 확인 + 서버 정책 엔진 응답**은 모델 호출 성공 여부와 서버 정책 응답을 구분해 표시합니다. 현재 Qwen 자유문은 최종 답변에 반영되지 않으며 모델은 추후 구조화 분석 확장 후보입니다. 응답의 `documents`와 UI 패널은 서버가 선택한 검색 근거를 보여주며, 답변 문장과 문서 사이의 의미적 함의나 공식 인용 정확성을 검증했다는 뜻도 아닙니다. API 응답은 `response_mode`, `llm_invoked`, `policy_guardrail_applied`로 이 구분을 명시합니다.

최초 한 번 모델을 준비합니다.

Python 3.11 이상이 필요합니다. 먼저 `python3 --version`으로 확인하고, macOS 시스템 Python이 3.9라면 Homebrew Python 등 최신 Python 명령으로 가상환경을 만듭니다.

```bash
ollama pull qwen2.5:7b
python3.14 -m venv backend/.venv
source backend/.venv/bin/activate
python -m pip install -r backend/requirements.txt
```

터미널 1에서 Ollama를 실행합니다.

```bash
ollama serve
```

터미널 2에서 FastAPI를 실행합니다.

```bash
cd /Users/dongyoungko/Documents/AI_Hacker/AI_Finance_Sec
source backend/.venv/bin/activate
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

터미널 3에서 웹을 실행합니다.

```bash
cd /Users/dongyoungko/Documents/AI_Hacker/AI_Finance_Sec
npm run dev
```

- 홈페이지: <http://localhost:3000>
- FastAPI 상태: <http://127.0.0.1:8000/health>
- FastAPI 문서: <http://127.0.0.1:8000/docs>

웹 설정에서 `Ollama Local`을 선택합니다. 기본값은 `OLLAMA_BASE_URL=http://127.0.0.1:11434`, `OLLAMA_MODEL=qwen2.5:7b`, timeout 45초이며 필요하면 FastAPI 실행 전에 환경변수로 변경할 수 있습니다. 프론트 프록시의 백엔드 주소는 `FASTAPI_BASE_URL`로 변경합니다.

FastAPI의 `InMemorySaver`는 데모용 프로세스 메모리입니다. `session_id`별 멀티턴은 지원하지만 서버를 재시작하면 사라집니다. 112 신고나 지급정지는 실제 실행하지 않습니다. Ollama가 중단되거나 규칙 기반 Safety 검사에 실패하면 응답과 UI에 `Mock Safety Fallback`을 표시합니다.

공개 배포 서버는 사용자 PC의 localhost Ollama에 접근할 수 없습니다. Ollama 시연은 위 로컬 3개 프로세스 구성으로 실행하고, 공개 URL에서는 Mock 또는 클라우드 BYOK를 사용합니다. 클라우드 키는 저장하지 않지만 Next 서버 프록시를 경유하므로 제한된 촬영용 키를 이용한 로컬 시연을 권장합니다.

## 검증

```bash
npm run build
npm test
source backend/.venv/bin/activate
python -m pytest backend/tests -q
```

실제 로컬 Ollama 선택 smoke test는 Ollama와 FastAPI를 실행한 뒤 별도로 수행합니다. 동일 세션 2턴을 검증하는 재현 스크립트와 최근 sanitised 결과는 `backend/scripts/smoke_ollama.py`, `backend/smoke/`에 있습니다.

```bash
backend/.venv/bin/python backend/scripts/smoke_ollama.py
```

주요 파일은 다음과 같습니다.

- `app/page.tsx`: UI와 actual/simulated 결과 분리
- `app/lib/engine.ts`: 샘플 State·탐지·검색·평가
- `app/api/chat/route.ts`: Ollama·Cloud Provider 프록시
- `backend/main.py`: FastAPI 엔드포인트와 입력 검증
- `backend/app/graph.py`: 실제 LangGraph·Ollama·Safety·멀티턴 메모리
- `backend/tests/test_api.py`: 백엔드 회귀 검증
- `tests/engine.test.mjs`, `tests/rendered-html.test.mjs`: 프론트 회귀 검증
- `AI_Finance_Sec_Chatbot_Orchestration.ipynb`: 독립 실행형 오케스트레이션 노트북

## 데모 주의사항

모든 통화·거래 샘플은 합성 데이터입니다. 112 신고, 지급정지, 거래 차단 등 외부 금융 조치는 실제로 수행하지 않고 절차만 안내합니다.
