#!/usr/bin/env python3
"""Run a sanitised, same-session two-turn Ollama/FastAPI smoke test."""

from __future__ import annotations

import json
import os
import platform
from datetime import datetime, timezone

import httpx


BASE_URL = os.getenv("AI_FINANCE_SEC_API_URL", "http://127.0.0.1:8000").rstrip("/")
TIMEOUT_SECONDS = float(os.getenv("AI_FINANCE_SEC_SMOKE_TIMEOUT", "90"))
REQUIRED_TRACE = {
    "prepare_input",
    "risk_agent",
    "knowledge_agent",
    "policy_agent",
    "ollama_generate",
    "safety_verifier",
    "finalize",
}


def sanitise(payload: dict) -> dict:
    documents = payload.get("documents") or []
    checks = payload.get("safety", {}).get("checks", {})
    return {
        "session_id": payload.get("session_id"),
        "turn_count": payload.get("turn_count"),
        "provider": payload.get("provider"),
        "model": payload.get("model"),
        "fallback": payload.get("fallback"),
        "fallback_reason": payload.get("fallback_reason"),
        "risk": {
            "score": payload.get("risk", {}).get("score"),
            "level": payload.get("risk", {}).get("level"),
            "verdict": payload.get("risk", {}).get("verdict"),
            "risk_type": payload.get("risk", {}).get("risk_type"),
        },
        "top1_document": {"id": documents[0].get("id"), "title": documents[0].get("title")} if documents else None,
        "safety": {
            "passed": payload.get("safety", {}).get("passed"),
            "initial_passed": payload.get("safety", {}).get("initial_passed"),
            "no_dangerous_action_recommendation": checks.get("no_dangerous_action_recommendation"),
        },
        "required_actions": {
            "police_112": checks.get("post_transfer_police_112"),
            "financial_company": checks.get("post_transfer_financial_company"),
            "payment_stop": checks.get("post_transfer_payment_stop"),
        },
        "trace": payload.get("trace"),
    }


def main() -> None:
    generated_at = datetime.now(timezone.utc).replace(microsecond=0)
    session_id = generated_at.strftime("smoke-%Y%m%dT%H%M%SZ")
    prompts = [
        "검찰 수사관이 안전계좌로 지금 즉시 송금하라고 합니다. 어떻게 해야 하나요?",
        "그 계좌로 보내도 돼요?",
    ]

    with httpx.Client(timeout=TIMEOUT_SECONDS) as client:
        health = client.get(f"{BASE_URL}/health")
        health.raise_for_status()
        turns = []
        for expected_turn, prompt in enumerate(prompts, start=1):
            response = client.post(f"{BASE_URL}/api/chat", json={"message": prompt, "session_id": session_id})
            response.raise_for_status()
            payload = response.json()
            assert payload["model"] == "qwen2.5:7b", payload
            assert payload["fallback"] is False, payload
            assert payload["turn_count"] == expected_turn, payload
            assert REQUIRED_TRACE.issubset(payload["trace"]), payload
            assert payload["safety"]["passed"] is True, payload
            assert payload["safety"]["checks"]["no_dangerous_action_recommendation"] is True, payload
            turns.append({"request": {"message": prompt}, "response": sanitise(payload)})

        victim_response = client.post(
            f"{BASE_URL}/api/chat",
            json={"message": "이미 송금했습니다. 무엇부터 해야 하나요?", "session_id": f"{session_id}-victim"},
        )
        victim_response.raise_for_status()
        victim_payload = victim_response.json()
        victim_result = sanitise(victim_payload)
        assert victim_payload["risk"]["already_transferred"] is True, victim_payload
        assert victim_payload["safety"]["passed"] is True, victim_payload
        assert victim_payload["safety"]["checks"]["no_dangerous_action_recommendation"] is True, victim_payload
        assert all(victim_result["required_actions"].values()), victim_payload

    result = {
        "generated_at_utc": generated_at.isoformat(),
        "environment": {
            "platform": platform.platform(),
            "machine": platform.machine(),
            "api_base_url": BASE_URL,
            "health": health.json(),
        },
        "commands": [
            "ollama serve",
            "uvicorn backend.main:app --host 127.0.0.1 --port 8000",
            "backend/.venv/bin/python backend/scripts/smoke_ollama.py",
        ],
        "assertions": "same session 2-turn fallback=false, full trace, no dangerous action recommendation; victim final safety has 112+financial company+payment stop",
        "turns": turns,
        "victim_case": {
            "request": {"message": "이미 송금했습니다. 무엇부터 해야 하나요?"},
            "response": victim_result,
        },
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
