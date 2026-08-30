# AI_Finance_Sec — Windows 실시간 데모 실행 가이드

로컬 오픈소스 경량 모델(Ollama + Qwen2.5)과 클라우드 BYOK 모델을 **동시에** 가동하고,
Cloudflare Quick Tunnel로 외부 접근 가능한 공개 URL을 발급하는 절차다.

기존 `README.md`는 macOS 기준이다. Windows에서는 이 문서를 사용한다.

---

## 0. 구성 이해

```
                       ┌─────────────────────────────┐
  외부 브라우저 ──────▶ │ Cloudflare Quick Tunnel     │
                       │ https://xxx.trycloudflare.com│
                       └──────────────┬──────────────┘
                                      ▼
                       ┌─────────────────────────────┐
                       │ Next 프론트 :3000            │
                       │  /api/chat 프록시            │
                       └───┬──────────────────────┬──┘
                           │ provider=ollama      │ provider=openai/deepseek/
                           ▼                      │ anthropic/gemini/qwen
              ┌────────────────────────┐          │ (+ 사용자 API 키)
              │ FastAPI :8000          │          ▼
              │ 실제 LangGraph         │   각 Provider 공식 API
              │  transaction_signal    │
              │  risk ∥ knowledge ∥ policy
              │  → ollama_generate     │
              │  → safety_verifier     │
              │  → alert_planner       │
              └──────────┬─────────────┘
                         ▼
              ┌────────────────────────┐
              │ Ollama :11434          │
              │ qwen2.5:3b (로컬 추론) │
              └────────────────────────┘
```

**중요:** 공개 배포 서버(`*.chatgpt.site`)는 사용자 PC의 localhost Ollama에 접근할 수 없다.
로컬 오픈소스 모델을 외부에 시연하려면 **이 문서의 로컬 풀스택 + 터널 구성**이 유일한 방법이다.

---

## 1. 최초 1회 설치

### 1.1 런타임

```powershell
winget install --id Python.Python.3.12 -e --scope user --accept-source-agreements --accept-package-agreements
winget install --id Ollama.Ollama -e --accept-source-agreements --accept-package-agreements
```

**cloudflared는 winget MSI가 관리자 권한을 요구해 무인 설치가 막힐 수 있다.**
관리자 권한이 필요 없는 독립 실행 바이너리를 프로젝트 안에 두는 방식을 권장한다.

```powershell
New-Item -ItemType Directory -Path tools -Force | Out-Null
Invoke-WebRequest -UseBasicParsing `
  -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" `
  -OutFile "tools\cloudflared.exe"
.\tools\cloudflared.exe --version
```

`start-demo.ps1`은 PATH → `tools\cloudflared.exe` → `Program Files` 순으로 찾는다.

설치 후 **새 PowerShell 창**을 열어 PATH를 갱신하고 확인한다.

```powershell
python --version        # Python 3.12.x
ollama --version
node --version          # v22.13 이상
```

> `python --version`이 아무 버전도 출력하지 않으면 Microsoft Store 스텁이 우선하는 상태다.
> `설정 > 앱 > 고급 앱 설정 > 앱 실행 별칭`에서 `python.exe` / `python3.exe`를 끄거나,
> 실제 경로(`$env:LOCALAPPDATA\Programs\Python\Python312\python.exe`)를 직접 사용한다.

### 1.2 백엔드 가상환경

```powershell
cd C:\Users\SOCSOFT\AI_fiannce_sec\AI_Hacker\AI_Finance_Sec
python -m venv backend\.venv
.\backend\.venv\Scripts\python.exe -m pip install --upgrade pip
.\backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

### 1.3 프론트 의존성

```powershell
npm install
```

> 저장소에 pnpm 레이아웃 `node_modules`가 남아 있으면 먼저 지운다:
> `Remove-Item node_modules -Recurse -Force`

### 1.4 로컬 모델

```powershell
ollama pull qwen2.5:3b
```

---

## 2. 기동

```powershell
cd C:\Users\SOCSOFT\AI_fiannce_sec\AI_Hacker\AI_Finance_Sec
powershell -ExecutionPolicy Bypass -File .\scripts\start-demo.ps1
```

스크립트가 순서대로 수행한다.

1. Ollama 서버 확인·기동
2. `qwen2.5:3b` 존재 확인, 없으면 pull
3. 환경변수 주입 (`OLLAMA_MODEL`, `OLLAMA_TIMEOUT_SECONDS=120`, `FASTAPI_BASE_URL`)
4. FastAPI 기동 후 `/health` 준비 대기
5. 프로덕션 빌드 후 Next 기동
6. Cloudflare Quick Tunnel 발급, 공개 URL 출력

### 옵션

| 옵션 | 용도 |
|---|---|
| `-Model qwen2.5:1.5b` | 더 가벼운 모델로 전환 (발표 중 응답이 느릴 때) |
| `-Dev` | 프로덕션 빌드 대신 `vinext dev` 개발 서버 |
| `-SkipBuild` | 이미 빌드되어 있을 때 빌드 생략 |
| `-SkipTunnel` | 공개 URL 없이 로컬만 기동 |
| `-WebPort 3100` / `-ApiPort 8100` | 포트 충돌 회피 |

---

## 3. 시연 방법

### 3.1 로컬 오픈소스 모델 (Ollama / qwen2.5:3b)

1. 우측 상단 `설정` → **`Ollama Local`** 선택
2. 채팅에 질문 입력 (예: `검찰이라고 전화가 왔는데 제 계좌가 범죄에 연루됐다고 합니다.`)
3. 응답 메타데이터 확인
   - `llm_invoked=true` → 이 PC의 Qwen이 **실제로 호출됨**
   - `response_mode=guarded_policy` → 모델 자유문은 폐기되고 서버 허용 정책 문장만 출력
   - `policy_guardrail_applied=true`

> 설계상 Qwen 자유문은 화면에 노출되지 않는다. 이는 버그가 아니라 안전 경계다.

#### 실측 응답 시간 (i7-8565U, CPU 전용, dGPU 없음)

그래프는 Ollama를 **2회** 호출한다 — `structured_risk_agent`(구조화 위험 판정) + `ollama_generate`(정책 응답).

| 모델 | 생성 속도 | 1회 호출 | 채팅 1턴 전체 |
|---|---:|---:|---:|
| `qwen2.5:3b` (기본) | 8.9 tok/s | 약 21초 | **40~55초** |
| `qwen2.5:1.5b` | 16.7 tok/s | 약 4~10초 | **20~25초** |

발표에서 대기 시간이 부담되면 `-Model qwen2.5:1.5b`로 재기동한다.
프론트의 로컬 호출 타임아웃은 `LOCAL_TIMEOUT_MS`(기본 180초)로 조정할 수 있다.

### 3.2 BYOK (클라우드 모델)

1. `설정` → OpenAI / DeepSeek / Claude / Gemini / Qwen 중 선택
2. 본인 API 키 입력 (비밀번호 형식, 저장되지 않음)
3. 질문 입력 → 해당 Provider의 실제 응답

키는 React state와 Next 서버 프록시의 1회 요청에만 존재한다.
DB·파일 저장 없음, 응답에 `Cache-Control: no-store`.
단 호스팅·Provider 측 로그 정책은 별도이므로 **촬영용 저한도 키를 쓰고 촬영 후 폐기**한다.

### 3.3 Mock (API 키 불필요)

기본값. 시나리오 재생, 위험도, RAG 근거 Top 3, 정탐·오탐 표시가 전부 결정론적으로 동작한다.

---

## 4. 검증

```powershell
# 백엔드 상태
Invoke-RestMethod http://127.0.0.1:8000/health

# 로컬 모델 실호출 + 멀티턴
$b = @{ message = "검찰이라고 전화가 왔는데 계좌가 범죄에 연루됐대요."; session_id = "verify-1" } | ConvertTo-Json
Invoke-RestMethod -Uri http://127.0.0.1:8000/api/chat -Method Post -ContentType "application/json" -Body $b

# BYOK 키 거부 경로 (400 기대)
$c = @{ provider = "openai"; message = "테스트" } | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:3000/api/chat -Method Post -ContentType "application/json" -Body $c

# 회귀 테스트
.\backend\.venv\Scripts\python.exe -m pytest backend\tests -q
npm run test:win

# Ollama 실호출 smoke
.\backend\.venv\Scripts\python.exe backend\scripts\smoke_ollama.py
```

기대 결과: 백엔드 29/29, 프론트 11/11, smoke에서 `turn_count` 1→2 유지.

---

## 5. 종료

```powershell
.\scripts\stop-demo.ps1              # 터널·프론트·백엔드 정리 (Ollama 유지)
.\scripts\stop-demo.ps1 -StopOllama  # Ollama까지 종료
```

**공개 URL은 인터넷에 노출된다. 시연이 끝나면 반드시 종료한다.**

---

## 6. 장애 대응

| 증상 | 원인 | 조치 |
|---|---|---|
| 모델 응답이 너무 느림 | CPU 전용 추론 + Ollama 2회 호출 | `-Model qwen2.5:1.5b`로 재기동 (약 2배) |
| `llm_invoked=false`, `mock_fallback` | Ollama 미기동 또는 타임아웃 | `ollama serve` 확인, `-OllamaTimeoutSeconds 180` |
| 프론트가 로컬 호출 중 끊김 | `LOCAL_TIMEOUT_MS` 초과 | `$env:LOCAL_TIMEOUT_MS=300000` 후 재기동 |
| `test:win`의 503 테스트 실패 | (해결됨) 예전엔 :8000이 살아 있으면 실패 | 테스트가 discard 포트를 쓰도록 수정됨 |
| cloudflared MSI가 멈춤 | 관리자 권한 프롬프트 대기 | `tools\cloudflared.exe` 독립 바이너리 사용 (1.1절) |
| 공개 URL에서 BYOK 오류가 `error code: 502`로만 보임 | Cloudflare가 origin 5xx 본문을 자체 페이지로 교체 | 정상 동작. 상세 원문은 `http://localhost:3000`에서 확인 (예: `Authentication Fails, Your api key ... is invalid`) |
| `npm run dev`가 파서 오류 | 스크립트가 bash 전용 문법 | Windows에서는 `dev:win` / `build:win` / `start:win` / `test:win` 사용 |
| `python`이 버전 미출력 | Store 앱 실행 별칭 | 앱 실행 별칭 해제 또는 절대경로 사용 |
| 포트 충돌 | 3000/8000 점유 | `-WebPort` / `-ApiPort` 변경, 또는 `stop-demo.ps1` |
| 터널 URL 미발급 | cloudflared 미설치·네트워크 차단 | `.demo-logs\tunnel.log` 확인, `-SkipTunnel`로 로컬 시연 |
| 빌드 실패 | node_modules 레이아웃 충돌 | `Remove-Item node_modules -Recurse -Force; npm install` |
| 공개 URL에서 Ollama 선택 시 503 | 정상 동작 아님 — 터널은 같은 PC를 가리키므로 동작해야 함 | 백엔드 `/health` 확인 후 재기동 |

로그 위치: `.demo-logs\` (ollama / backend / web / tunnel)

---

## 7. 주의사항

- 모든 통화·거래 데이터는 **합성 데이터**다.
- 1394 신고·상담, 112 신고, 지급정지 등 외부 조치는 **실제로 수행하지 않는다**.
- Quick Tunnel URL은 임시이며 재기동 시 매번 바뀐다. 발표 직전 발급받아 사용한다.

---

## 알려진 문제 — `npm run start:win` 으로는 시연하지 말 것

Windows에서 `vinext start`(프로덕션 서버)는 **하위 디렉터리의 정적 자산을 전부 404로
응답한다.** `/og.png` 같은 루트 파일은 200이지만 `/assets/*.js`, `/assets/*.css`,
`/data/*.json` 이 모두 404가 되어 CSS와 JS가 붙지 않는다. 화면이 통째로 깨져 보이고
버튼도 동작하지 않는다.

원인은 vinext 의존성의 Windows 경로 처리다.
`node_modules/vinext/dist/server/static-file-cache.js` 가 파일을 색인할 때
`path.relative()` 결과를 URL로 변환하지 않고 그대로 쓴다.

```js
relativePath: path.relative(base, fullPath)   // Windows: "assets\index.js"
const pathname = "/" + relativePath;          // "/assets\index.js" 로 등록됨
```

요청 경로는 `/assets/index.js`(슬래시)이므로 영원히 매칭되지 않는다. 구분자가 없는
루트 파일만 우연히 맞아떨어진다. macOS·Linux에서는 `path.relative`가 슬래시를
반환하므로 발생하지 않는다.

**대응**

| 용도 | 사용할 명령 |
|---|---|
| 시연·개발 | `npm run dev:win` (http://localhost:3000) |
| 전체 스택 시연 | `.\scripts\start-demo.ps1` |
| 회귀 검증 | `npm run test:win` — 빌드 산출물을 worker로 직접 import하므로 이 버그의 영향을 받지 않는다 |

> `dev:win` 서버는 IPv6(`[::1]:3000`)에만 바인딩된다. `127.0.0.1:3000` 이 아니라
> **`localhost:3000`** 으로 접속해야 한다.
