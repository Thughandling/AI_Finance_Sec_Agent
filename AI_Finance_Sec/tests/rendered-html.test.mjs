import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function worker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

const env = {
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
};

const context = { waitUntil() {}, passThroughOnException() {} };

test("renders the complete financial-safety demo", async () => {
  const response = await (await worker()).fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    env,
    context,
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /AI_Finance_Sec/);
  assert.match(html, /근거 기반 AI 금융 보안 비서/);
  assert.match(html, /SIMULATED DEMO FLOW/);
  assert.match(html, /Hard Negative/);
  assert.match(html, /RRF reranked/);
  assert.match(html, /Mock/);
  assert.match(html, /SIMULATED DEMO FLOW/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});

test("rejects an external-model call without a key", async () => {
  const response = await (await worker()).fetch(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "openai", message: "테스트" }),
    }),
    env,
    context,
  );
  assert.equal(response.status, 400);
  assert.match(await response.text(), /API 키/);
});

test("returns a clear error when the local FastAPI proxy is unavailable", async () => {
  const response = await (await worker()).fetch(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "ollama", message: "테스트", sessionId: "test-session" }),
    }),
    env,
    context,
  );
  assert.equal(response.status, 503);
  assert.match(await response.text(), /로컬 FastAPI\/Ollama/);
});

test("keeps BYOK credentials ephemeral in application source", async () => {
  const [page, route] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/chat/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /type="password"/);
  assert.match(page, /Ollama Local|providerId === "ollama"/);
  assert.match(route, /cache-control.*no-store/i);
  assert.doesNotMatch(page, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(route, /console\.(log|info|debug)/);
});
