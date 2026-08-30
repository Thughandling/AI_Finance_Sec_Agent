# AI_Finance_Sec_Agent

**송금 전 마지막 판단을 돕는 AI 금융 보안 비서** — 2026 금융 AI Challenge 출품작

의심 통화의 맥락과 평소와 다른 거래 신호를 함께 보고, 위험한 이유와 지금 해야 할
행동을 한 화면에서 설명한다. 은행 모바일 앱의 송금 확인 단계에 탑재되는
B2B2C 고객보호 계층을 지향한다.

> 모든 통화·거래 데이터는 **합성 데이터**다.
> 1394 신고·상담, 112 신고, 지급정지 등 외부 조치는 **실제로 수행하지 않는다**.

---

## 저장소 구조

| 경로 | 내용 |
|---|---|
| `AI_Finance_Sec/` | 실행 가능한 MVP. Next 프론트 + FastAPI/LangGraph 백엔드 + 모델 라우터 |
| `submission/` | 공모전 제출본 — 기획서·기능명세서 (HWPX / Markdown), 데모 운영가이드 |
| `docs/` | 설계·조사 문서 — 모델 선정 근거, 데이터셋 조사, RAG·평가 설계, 블라인드 평가 결과, 소스코드 관리기준 |
| `presentation/` | 문제정의·시스템설계 컨설팅 장표 (PPTX) |
| `output/pdf/` | 전체 프로세스 플로우차트 · **데모 실행 매뉴얼 (12p PDF)** |
| `outputs/` | 파일관리목록대장 (XLSX) |
| `tmp/` | 산출물 생성 스크립트 (렌더 이미지는 ignore) |
| `.claude/agents/` | Claude Code 서브에이전트 5종 — 평가·동등성·안전·문서정합·형상관리 |
| `Edit.md` | 전체 작업 대화 기록 |

---

## 빠른 시작

### Windows (실시간 데모 + 공개 URL)

```powershell
cd AI_Finance_Sec
powershell -ExecutionPolicy Bypass -File .\scripts\start-demo.ps1
```

> ⚠️ Windows에서 `npm run start:win`(프로덕션 서버)으로는 시연하지 말 것.
> vinext 의존성의 경로 버그로 정적 자산이 404가 되어 화면이 깨진다.
> 원인과 대응은 [`AI_Finance_Sec/RUN_WINDOWS.md`](AI_Finance_Sec/RUN_WINDOWS.md) 참조.

Ollama(로컬 경량 모델) + FastAPI + Next를 한 번에 띄우고 Cloudflare Quick Tunnel로
공개 https URL을 발급한다. 상세 절차는 [`AI_Finance_Sec/RUN_WINDOWS.md`](AI_Finance_Sec/RUN_WINDOWS.md).

### macOS · Linux

[`AI_Finance_Sec/README.md`](AI_Finance_Sec/README.md) 참조.

---

## 실행 모드

| 모드 | 모델 | API 키 | 용도 |
|---|---|---|---|
| **Mock** | Deterministic Safety Engine | 불필요 | 기본값. 키 없이 전체 흐름 재현 |
| **Ollama Local** | `qwen2.5:3b` (오픈소스) | 불필요 | 이 PC에서 실제 추론. 실제 LangGraph 경로 |
| **Cloud BYOK** | OpenAI · DeepSeek · Claude · Gemini · Qwen | 사용자 키 | 사용자가 입력한 키로 실제 모델 호출 |

BYOK 키는 React state와 서버 프록시의 1회 요청에만 존재한다. DB·파일 저장 없음,
응답에 `Cache-Control: no-store`. 호스팅·Provider 로그 정책은 별도이므로
공개 시연에는 제한된 촬영용 키를 권장한다.

---

## 처리 흐름

```
사용자 입력
   ↓
prepare_input
   ↓
transaction_signal_agent      (백그라운드 이상거래 탐지 — 통화와 무관하게 거래만 본다)
   ↓
structured_risk_agent         (구조화 위험 판정 + 거래신호 융합)
   ├─ knowledge_agent         (소형 KB 검색 + RRF Top 3)   ← 병렬
   └─ policy_agent            (위험 수준별 허용 행동)
   ↓ conservative_fusion
ollama_generate  →  policy_guardrail  →  safety_verifier  →  alert_planner  →  finalize
```

생성 모델의 자유문은 고객 화면에 노출하지 않는다. 서버 allowlist가 구성한
`guarded_policy` 문장만 최종 안내로 사용하고, 규칙 기반 Safety가 이를 검사한다.
호출 실패나 검증 실패는 `mock_fallback`으로 명시된다.

---

## 검증

```powershell
# 프론트
cd AI_Finance_Sec; npm run test:win    # Windows
npm test                                # macOS · Linux

# 백엔드
.\backend\.venv\Scripts\python.exe -m pytest backend\tests -q
```

현재 기준: 백엔드 40/40, 프론트 20/20.

> 이 수치는 **알려진 실패의 재발을 막는 회귀 검사**이며 실사용 성능이 아니다.
> 독립 블라인드 40건 평가에서 확인된 일반화 한계와 후속 과제는
> [`docs/블라인드_40건_평가_방법과_지표_해설.md`](docs/블라인드_40건_평가_방법과_지표_해설.md)에 정리되어 있다.

---

## 백그라운드 이상거래 경보

평소 거래 프로필과 이번 이체를 대조해 이상 신호를 만들고(`transaction_signal_agent`),
통화 위험도와 합쳐 **경보 전달 방식**을 결정한다(`alert_planner`).

경보의 적은 무시가 아니라 **범인의 사전 코칭**이다. 균일한 팝업은 학습적으로
무시되고, 통화 중 푸시는 오히려 범인에게 화면을 노출시킨다. 그래서 위험도에
비례한 마찰만 주고, 통화 중에는 푸시·SMS를 억제한 뒤 통화를 끊는 채널을 쓴다.

| 티어 | 근거 | 채널 | 마찰 |
|---|---|---|---|
| T0 무개입 | 통화 40점 미만 · 거래신호 18점 미만 | 없음 | 0초 |
| T1 인라인 배너 | 한쪽 축만 낮게 반응 | 인앱 인라인 배너 | 0초 |
| T2 인터스티셜 | 통화 60+ 또는 거래신호 30+ | 인앱 인터스티셜 · 푸시 | 15초 + 셀프체크 3문항 |
| T3 다채널 경보 | 통화 75+ 또는 이미 송금 | 인앱 · ARS 콜백 · SMS · 신뢰인 알림 | 30초 |

- 두 축이 모두 반응하면 한 단계 승급하고, 이미 송금한 경우는 무조건 T3다.
- **통화 중이면 푸시·SMS를 억제**하고 은밀 모드로 전환한다. 화면을 함께 보고 있을 수 있기 때문이다.
- 고객 문구는 `① 무엇이 달랐나 · ② 왜 위험한가 · ③ 지금 할 일 1개` 3블록 고정이며,
  ③은 정책 허용목록 안의 **단일** 행동만 쓴다. 선택지를 늘리면 결정이 회피된다.
- 이미 송금한 경우 30분 골든타임 순서를 제시한다. **안내만 하며 실제 조치는 수행하지 않는다.**

거래 이상신호는 점수와 등급만 올리고 **`verdict`(정상/사기)는 바꾸지 않는다.**
통화 맥락 판정과 평가 지표를 오염시키지 않기 위한 제약이다.

---

## 범위

**포함 (P0/P1)** — 합성 통화·거래 시나리오, 규칙 기반 위험탐지와 거래 결합 점수,
백그라운드 이상거래 탐지와 티어별 경보 전달 계획, 경량 RAG와 RRF 리랭킹,
로컬/클라우드 모델 라우터, 정책 보호 응답과 Safety 검증, 멀티턴 세션, 회귀 평가셋.

**제외 (P2)** — 실시간 통화 STT·거래 스트림, 금융회사 레거시·FDS 연동,
실제 신고·지급정지 API, 고객 개인정보 처리, 영속 세션·권한·감사로그, 규제 검토.
