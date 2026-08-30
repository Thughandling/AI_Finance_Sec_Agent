# AI_Finance_Sec_Agent

2026 금융 AI Challenge 출품작. 송금 확인 단계에서 보이스피싱 위험을 설명하는 B2B2C 고객보호 계층.
모든 통화·거래 데이터는 합성이며, 1394·112 신고나 지급정지 등 외부 조치는 실제로 수행하지 않는다.

## 구조

| 경로 | 내용 |
|---|---|
| `AI_Finance_Sec/app/` | Next 프론트. `lib/engine.ts` = TS 탐지엔진, `api/chat` = 프록시 |
| `AI_Finance_Sec/backend/app/graph.py` | FastAPI + LangGraph 실제 추론 경로 (risk ∥ knowledge ∥ policy → generate → safety) |
| `AI_Finance_Sec/tests/` | `engine.test.mjs`, `rendered-html.test.mjs` |
| `AI_Finance_Sec/backend/tests/` | `test_api.py` |
| `submission/` `docs/` `presentation/` | 제출본·설계문서·장표 |
| `Edit.md` | 작업 대화 전체 기록 (110KB) |

## 실행

```powershell
cd AI_Finance_Sec
powershell -ExecutionPolicy Bypass -File .\scripts\start-demo.ps1   # Ollama + FastAPI + Next + Cloudflare Tunnel
```

테스트: `npm run test:win` (프론트) / `npm run test:backend` (백엔드). 상세는 `AI_Finance_Sec/RUN_WINDOWS.md`.

## 규칙

- **엔진 동등성**: `graph.py`와 `engine.ts`는 score-for-score 동일해야 한다. 수정 순서는 `graph.py` → `engine.ts` → 테스트 → 평가 JSON.
- **Safety**: 모델 자유문 노출 금지, 금지 행동 권고 금지, 피해대응 필수행동 누락 금지, 조치 완료를 사실처럼 말하지 말 것.
- **BYOK 키**: React state와 서버 프록시 1회 요청에만 존재. DB·파일 저장 금지, 응답에 `Cache-Control: no-store`.

## 토큰 절약 (중요)

- `Edit.md`는 절대 통으로 읽지 말 것 — `grep`만 사용. 큰 파일은 `sed -n 'A,Bp'` 구간 읽기.
- 서브에이전트(`.claude/agents/`)는 콜드 스타트라 비싸다. 인라인으로 가능한 일은 직접 처리하고, 사용자가 명시할 때만 호출.
- 작업 단위(수정 / 평가 / 문서)마다 새 세션 + `/clear`.
- 단순 수정·조회는 Sonnet, 설계·리뷰만 Opus.
- 짧은 작업에 plan mode·광범위 탐색 생략.
