import { NextRequest, NextResponse } from "next/server";

type Provider = "ollama" | "openai" | "deepseek" | "anthropic" | "gemini" | "qwen";

type ChatRequest = {
  provider?: Provider;
  apiKey?: string;
  model?: string;
  message?: string;
  context?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  sessionId?: string;
  transaction?: {
    amount?: number;
    payee?: string;
    hour?: number;
    in_call?: boolean;
    new_device_or_app?: boolean;
    limit_raised?: boolean;
    recent_transfer_count?: number;
  };
};

const defaults: Record<Provider, string> = {
  ollama: "qwen2.5:7b",
  openai: "gpt-5.6-terra",
  deepseek: "deepseek-v4-flash",
  anthropic: "claude-sonnet-4-5-20250929",
  gemini: "gemini-2.5-flash",
  qwen: "qwen-plus",
};

const CLOUD_TIMEOUT_MS = 60_000;

// The local path runs two CPU-bound Ollama calls (structured judgement, then
// generation), so it needs far more headroom than a hosted provider. Override
// with LOCAL_TIMEOUT_MS when demoing on slower hardware.
const LOCAL_TIMEOUT_MS = Number(process.env.LOCAL_TIMEOUT_MS ?? 180_000);

async function callLocalLangGraph(body: ChatRequest) {
  const baseUrl = (process.env.FASTAPI_BASE_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: String(body.message ?? "").slice(0, 2000),
      session_id: body.sessionId,
      transaction: body.transaction,
    }),
    signal: AbortSignal.timeout(LOCAL_TIMEOUT_MS),
  });
  const data = await response.json() as Record<string, unknown> & { error?: string; detail?: string };
  if (!response.ok) throw new Error(data.error ?? data.detail ?? `FastAPI error ${response.status}`);
  return data;
}

const SYSTEM_PROMPT = `당신은 AI_Finance_Sec 금융 보안 비서다.
반드시 한국어로 짧고 침착하게 답한다. 제공된 탐지 결과와 기관 가이드만 근거로 사용한다.
실제로 신고, 지급정지, 송금취소가 완료되었다고 주장하지 않는다.
위험한 경우 통화 종료, 송금·앱 설치 중단, 공식 대표번호 확인을 우선 안내한다.
정상 가능성이 높으면 단정하지 말고 재확인 방법을 안내한다.`;

function messages(body: ChatRequest) {
  return [
    { role: "system", content: `${SYSTEM_PROMPT}\n\n탐지·검색 컨텍스트:\n${String(body.context ?? "").slice(0, 6000)}` },
    ...(body.history ?? []).slice(-6),
    { role: "user", content: String(body.message ?? "").slice(0, 2000) },
  ];
}

async function callOpenAICompatible(url: string, apiKey: string, model: string, body: ChatRequest) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: messages(body), temperature: 0.1, max_tokens: 600 }),
    signal: AbortSignal.timeout(CLOUD_TIMEOUT_MS),
  });
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message ?? `Provider error ${response.status}`);
  return data.choices?.[0]?.message?.content ?? "";
}

async function callOpenAI(apiKey: string, model: string, body: ChatRequest) {
  const input = messages(body).map((message) => ({
    role: message.role,
    content: [{ type: "input_text", text: message.content }],
  }));
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, input, max_output_tokens: 600, reasoning: { effort: "low" } }),
    signal: AbortSignal.timeout(CLOUD_TIMEOUT_MS),
  });
  const data = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }>; error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message ?? `OpenAI error ${response.status}`);
  return data.output_text ?? data.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("") ?? "";
}

async function callAnthropic(apiKey: string, model: string, body: ChatRequest) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      system: `${SYSTEM_PROMPT}\n\n탐지·검색 컨텍스트:\n${String(body.context ?? "").slice(0, 6000)}`,
      messages: [...(body.history ?? []).slice(-6), { role: "user", content: String(body.message ?? "").slice(0, 2000) }],
      max_tokens: 600,
      temperature: 0.1,
    }),
    signal: AbortSignal.timeout(CLOUD_TIMEOUT_MS),
  });
  const data = await response.json() as { content?: Array<{ type: string; text?: string }>; error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message ?? `Anthropic error ${response.status}`);
  return data.content?.filter((item) => item.type === "text").map((item) => item.text ?? "").join("") ?? "";
}

async function callGemini(apiKey: string, model: string, body: ChatRequest) {
  const prompt = messages(body).map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n\n");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 600 } }),
    signal: AbortSignal.timeout(CLOUD_TIMEOUT_MS),
  });
  const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message ?? `Gemini error ${response.status}`);
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as ChatRequest;
    const provider = body.provider;
    const apiKey = String(body.apiKey ?? "").trim();
    const message = String(body.message ?? "").trim();
    if (!provider || !(provider in defaults)) return NextResponse.json({ error: "지원하지 않는 Provider입니다." }, { status: 400 });
    if (!message) return NextResponse.json({ error: "메시지가 비어 있습니다." }, { status: 400 });
    if (provider === "ollama") {
      try {
        const result = await callLocalLangGraph(body);
        return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
      } catch (error) {
        const detail = error instanceof Error ? error.message : "연결 실패";
        return NextResponse.json(
          { error: `로컬 FastAPI/Ollama에 연결할 수 없습니다. 공개 배포에서는 로컬 모델을 직접 호출할 수 없습니다. ${detail}`.slice(0, 400) },
          { status: 503, headers: { "cache-control": "no-store" } },
        );
      }
    }
    if (!apiKey || apiKey.length < 12) return NextResponse.json({ error: "유효한 API 키가 필요합니다." }, { status: 400 });
    const model = String(body.model || defaults[provider]).slice(0, 120);

    let answer = "";
    if (provider === "openai") answer = await callOpenAI(apiKey, model, body);
    if (provider === "deepseek") answer = await callOpenAICompatible("https://api.deepseek.com/chat/completions", apiKey, model, body);
    if (provider === "qwen") answer = await callOpenAICompatible("https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions", apiKey, model, body);
    if (provider === "anthropic") answer = await callAnthropic(apiKey, model, body);
    if (provider === "gemini") answer = await callGemini(apiKey, model, body);
    if (!answer.trim()) throw new Error("모델이 빈 응답을 반환했습니다.");

    return NextResponse.json({ answer, provider, model }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "모델 호출 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
