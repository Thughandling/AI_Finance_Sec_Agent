# 상시 배포 — Cloudflare Workers (심사위원 상시 접속용)

심사 기간 내내 심사위원이 아무 때나 접속할 수 있는 **영구 URL**을 만드는 절차다.
PC를 켜 둘 필요가 없고, 무료 요금제로 충분하며, 재부팅·크래시의 영향을 받지 않는다.

## 왜 이 구성인가

이 앱의 기본값은 **Mock 모드**(설정 화면에 "심사용 권장 모드"로 표기)다.
State → 탐지 → RAG → 리랭킹 → 답변 → 안전검증 전 과정이 **외부 서비스 없이
클라이언트에서 결정론적으로** 재현된다. 따라서 프론트만 배포하면 심사에 필요한
경로가 전부 동작한다.

| 모드 | 배포본에서 | 비고 |
|---|---|---|
| **Mock** (기본, 심사 권장) | ✅ 완전 동작 | 백엔드·API 키 불필요 |
| **BYOK** (OpenAI/Claude/Gemini/DeepSeek/Qwen) | ✅ 동작 | 심사위원이 본인 키 입력, 프록시는 Worker에서 실행 |
| **Ollama Local** (실 LangGraph + 로컬 모델) | ❌ (자동 Mock 폴백) | 같은 PC의 FastAPI·Ollama가 필요 → 발표 당일 로컬 구성 전용. `RUN_WINDOWS.md` |

## 1회 인증 (사용자 작업 — 브라우저 필요)

둘 중 하나.

```powershell
# A. 대화형 (권장)
npx wrangler login          # 브라우저가 열리면 Cloudflare 계정 승인

# B. 비대화형 (CI/원격)
#    dash.cloudflare.com/profile/api-tokens 에서 "Edit Cloudflare Workers" 템플릿으로 토큰 생성
$env:CLOUDFLARE_API_TOKEN = "<토큰>"
```

계정이 여러 개면 계정 ID도 지정한다 (`wrangler whoami`로 확인, 또는 대시보드 URL `dash.cloudflare.com/<account-id>`).

```powershell
$env:CLOUDFLARE_ACCOUNT_ID = "<account-id>"
```

## 2. 배포

```powershell
cd AI_Finance_Sec
npm run deploy
```

`vinext deploy`가 빌드 후 Workers로 올린다. 끝나면 URL을 출력한다:

```
https://ai-finance-sec.<서브도메인>.workers.dev
```

이 주소가 **심사위원에게 줄 상시 링크**다. 재배포해도 주소는 바뀌지 않는다.

## 3. 변경분 반영

코드를 고친 뒤 다시:

```powershell
npm run deploy
```

## 확인 / 트러블슈팅

```powershell
npm run deploy:dry     # 인증 없이 빌드 + 번들까지만 검증 (업로드 안 함)
npx wrangler deployments list
npx wrangler tail      # 실시간 로그
```

| 증상 | 조치 |
|---|---|
| `You are not authenticated` | 1번 인증 다시 |
| `More than one account` | `$env:CLOUDFLARE_ACCOUNT_ID` 설정 |
| `workers.dev` 서브도메인 없음 | 대시보드 Workers & Pages → 서브도메인 1회 등록 후 재배포 |
| 배포는 됐는데 화면이 깨짐 | `npm run deploy:dry`로 자산 38개 읽히는지 확인, `wrangler tail`로 런타임 오류 확인 |
| Ollama 선택 시 503/Mock 폴백 | 정상. 배포본은 로컬 모델에 접근 불가 (위 표) |

## 커스텀 도메인 (선택)

`*.workers.dev`로 충분하지만 자체 도메인을 붙이려면 Cloudflare에 도메인을 두고
`wrangler.jsonc`에 `routes` 또는 대시보드에서 Custom Domain을 연결한다.

## 로컬 풀스택(실 LangGraph) 상시 운영 — 폴백

배포본으로 커버 안 되는 "실 LangGraph + 로컬 Qwen" 경로를 상시로 보여야 하면
`RUN_WINDOWS.md` 2절의 `start-demo.ps1 -Watch` + 작업 스케줄러 등록을 쓴다.
단 Quick Tunnel 주소는 재기동마다 바뀌므로, 고정 주소가 필요하면 Cloudflare
named tunnel(계정·도메인 필요)로 전환해야 한다.
