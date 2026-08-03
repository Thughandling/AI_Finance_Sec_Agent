# AI_Finance_Sec

보이스피싱 통화 문장과 거래 신호를 결합하고, 근거 검색·리랭킹·LLM 생성·안전 검증까지 한 화면에서 설명하는 금융 AI Challenge용 MVP입니다.

## 구현 범위

- API 키 없이 끝까지 재현되는 결정론적 Mock 데모
- OpenAI, DeepSeek, Claude, Gemini, Qwen BYOK 모델 라우터
- 기관 사칭·대출 사기·가족 빙자·정상 Hard Negative 합성 시나리오
- State → 병렬 탐지 → RAG → RRF 리랭킹 → 모델 생성 → 안전 검증 흐름
- 통화·거래 결합 위험도, 근거 Top 3, 정탐·오탐·미탐 표시
- 8개 회귀 검증셋과 Macro F1/Recall 요약

## 로컬 실행

Node.js 22.13 이상에서 다음 명령을 실행합니다.

```bash
npm install
npm run dev
```

브라우저에서 <http://localhost:3000>을 엽니다. 실제 모델을 사용하려면 우측 상단 `설정`에서 Provider와 본인의 API 키를 입력합니다. 키는 브라우저 메모리와 1회 서버 요청에만 사용하며 저장하지 않습니다.

## 검증

```bash
npm run build
npm test
```

주요 파일은 `app/page.tsx`(UI), `app/lib/engine.ts`(State·탐지·검색·평가), `app/api/chat/route.ts`(모델 라우터), `AI_Finance_Sec_Chatbot_Orchestration.ipynb`(전체 오케스트레이션 노트북)입니다.

## 데모 주의사항

모든 통화·거래 샘플은 합성 데이터입니다. 112 신고, 지급정지, 거래 차단 등 외부 금융 조치는 실제로 수행하지 않고 절차만 안내합니다.
