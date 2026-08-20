from __future__ import annotations

import json
import os
import statistics
import sys
import time
import urllib.request

URL = "http://127.0.0.1:11434/api/chat"
MODEL = sys.argv[1] if len(sys.argv) > 1 else os.getenv("OLLAMA_BENCHMARK_MODEL", "deepseek-r1:7b")
PAYLOAD = {
    "model": MODEL,
    "messages": [
        {
            "role": "user",
            "content": (
                "금융 보안 비서로 답하세요. 검찰 수사관이 안전계좌로 즉시 송금하라고 "
                "요구하는 전화를 받았습니다. 위험 판단과 지금 할 일을 한국어로 간결하게 안내하세요."
            ),
        }
    ],
    "stream": True,
    "keep_alive": "10m",
    "options": {"temperature": 0, "num_ctx": 2048, "num_predict": 96},
}


def run_once(index: int) -> dict[str, float | int | str]:
    request = urllib.request.Request(
        URL,
        data=json.dumps(PAYLOAD, ensure_ascii=False).encode("utf-8"),
        headers={"content-type": "application/json"},
        method="POST",
    )
    started = time.perf_counter()
    first_token_at = None
    final: dict = {}
    text_parts: list[str] = []
    with urllib.request.urlopen(request, timeout=180) as response:
        for raw_line in response:
            line = raw_line.decode("utf-8").strip()
            if not line:
                continue
            chunk = json.loads(line)
            message = chunk.get("message", {})
            token_text = str(message.get("thinking") or message.get("content") or "")
            if token_text and first_token_at is None:
                first_token_at = time.perf_counter()
            if token_text:
                text_parts.append(token_text)
            if chunk.get("done"):
                final = chunk
    ended = time.perf_counter()
    eval_count = int(final.get("eval_count", 0))
    eval_seconds = float(final.get("eval_duration", 0)) / 1_000_000_000
    result = {
        "run": index,
        "wall_seconds": round(ended - started, 3),
        "ttft_seconds": round((first_token_at or ended) - started, 3),
        "load_seconds": round(float(final.get("load_duration", 0)) / 1_000_000_000, 3),
        "prompt_tokens": int(final.get("prompt_eval_count", 0)),
        "generated_tokens": eval_count,
        "tokens_per_second": round(eval_count / eval_seconds, 2) if eval_seconds else 0,
        "sample": "".join(text_parts).replace("\n", " ")[:120],
    }
    print(json.dumps(result, ensure_ascii=False), flush=True)
    return result


results = [run_once(index) for index in range(1, 5)]
warm = results[1:]
summary = {
    "model": MODEL,
    "cold": results[0],
    "warm_average": {
        "wall_seconds": round(statistics.mean(float(row["wall_seconds"]) for row in warm), 3),
        "ttft_seconds": round(statistics.mean(float(row["ttft_seconds"]) for row in warm), 3),
        "tokens_per_second": round(statistics.mean(float(row["tokens_per_second"]) for row in warm), 2),
    },
}
print("SUMMARY " + json.dumps(summary, ensure_ascii=False), flush=True)
