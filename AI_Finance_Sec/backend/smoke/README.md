# 실제 Ollama smoke 증거

## 실행 환경

- 실행일: 2026-08-04
- 장비: Apple Silicon arm64, macOS 26.5.1
- Ollama: 로컬 `qwen2.5:7b`
- API: `http://127.0.0.1:8000`

## 재현 명령

```bash
ollama serve
source backend/.venv/bin/activate
uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

다른 터미널에서 실행합니다.

```bash
backend/.venv/bin/python backend/scripts/smoke_ollama.py
```

스크립트는 동일 `session_id`로 기관사칭 질문과 후속 질문을 보내고, 별도 피해발생 사례를 추가해 다음을 assert합니다.

- 모델 `qwen2.5:7b`
- 두 응답 모두 `fallback=false`
- 정상·위험·피해 응답 `response_mode=guarded_policy`
- `llm_invoked=true`, `policy_guardrail_applied=true`
- `turn_count` 1 → 2
- Safety 통과
- 위험행동 권고 없음 규칙 통과
- 필수 LangGraph trace 전체 포함
- 피해발생 최종 답변의 `1394`, `긴급 시 112`, `금융회사`, `지급정지` 의미가 모두 존재
- 정상 입력도 Qwen 원문 대신 `guarded_policy` 응답 사용

## 보존 결과

`actual_ollama_smoke_2026-08-04.json`은 2026-08-04 실제 실행 stdout을 구조화하고 민감정보를 제거한 결과입니다. API 키와 모델 원문 답변은 저장하지 않았습니다. 두 번째 짧은 질문에서도 첫 번째 턴의 기관사칭 위험과 검색 근거가 유지됩니다. 모든 판정은 Qwen을 실제 호출하지만 자유문을 노출하지 않고 서버 허용행동으로 구성한 `guarded_policy`를 반환하며, 이는 호출 실패 폴백이 아닙니다.
