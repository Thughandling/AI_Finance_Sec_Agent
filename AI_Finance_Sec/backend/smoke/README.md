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

스크립트는 동일 `session_id`로 기관사칭 질문과 후속 질문을 보내고 다음을 assert합니다.

- 모델 `qwen2.5:7b`
- 두 응답 모두 `fallback=false`
- `turn_count` 1 → 2
- Safety 통과
- 필수 LangGraph trace 전체 포함

## 보존 결과

`actual_ollama_smoke_2026-08-04.json`은 2026-08-04 실제 실행 stdout을 그대로 구조화한 sanitised 결과입니다. API 키, 모델 원문 답변, 전체 프롬프트는 저장하지 않았습니다. 두 번째 짧은 질문에서도 첫 번째 턴의 기관사칭 위험 88점과 `FSS-ORG-001` Top1이 유지됐습니다.
