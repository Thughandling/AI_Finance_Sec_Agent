import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function engine() {
  const source = await readFile(new URL("../app/lib/engine.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
}

test("detects the remote-control app sentence as fraud", async () => {
  const { analyzeText } = await engine();
  const result = analyzeText("링크를 눌러 원격제어 앱을 설치하세요.");
  assert.equal(result.verdict, "사기");
  assert.equal(result.riskType, "앱 설치");
});

test("treats an already-transferred report as a high-risk victim event", async () => {
  const { analyzeText } = await engine();
  const result = analyzeText("이미 송금했습니다. 무엇부터 해야 하나요?");
  assert.equal(result.verdict, "사기");
  assert.equal(result.riskType, "피해 발생");
  assert.ok(result.score >= 70);
});

test("returns the expected RAG Top1 for all four demo scenarios", async () => {
  const { analyzeText, retrieveAndRerank, scenarios } = await engine();
  const expected = {
    prosecutor: "FSS-ORG-001",
    loan: "FSS-LOAN-001",
    family: "KNPA-FAMILY-001",
    normal: "SAFE-NORMAL-001",
  };
  for (const scenario of scenarios) {
    const query = scenario.lines.map((line) => line.text).join(" ");
    const risk = analyzeText(query);
    assert.equal(retrieveAndRerank(query, risk.riskType)[0].id, expected[scenario.id], scenario.id);
  }
});

test("keeps free chat risk independent from selected scenario transactions", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /const currentDetection = analyzeText\(value, 0\)/);
  assert.doesNotMatch(page, /const currentDetection = analyzeText\(value, transactionRisk\)/);
});

test("renders actual graph state from the FastAPI response and resets local sessions", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /const \[lastGraphRun, setLastGraphRun\]/);
  assert.match(page, /setLastGraphRun\(data\)/);
  assert.match(page, /lastGraphRun\?\.risk\?\.score/);
  assert.match(page, /lastGraphRun\?\.documents/);
  assert.match(page, /lastGraphRun\?\.safety/);
  assert.match(page, /session \{lastGraphRun\.session_id\}/);
  assert.match(page, /turn \{lastGraphRun\.turn_count\}/);
  assert.match(page, /sessionId\.current = ""/);
  assert.match(page, /setLastGraphRun\(null\)/);
  assert.match(page, /actual-risk-panel/);
  assert.match(page, /data-testid="actual-safety-detail"/);
  assert.match(page, /규칙 기반 Safety 검사/);
  assert.match(page, /서버가 선택한 검색 근거/);
  assert.match(page, /정책 보호 응답\(Qwen 분석 \+ 서버 허용행동\)/);
  assert.match(page, /response_mode/);
  assert.match(page, /policy_guardrail_applied/);
  assert.match(page, /llm_invoked/);
  assert.doesNotMatch(page, /RAG 근거 Top 3/);
});

test("distinguishes local Qwen from Qwen Cloud and times out cloud providers", async () => {
  const [engineSource, route] = await Promise.all([
    readFile(new URL("../app/lib/engine.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/chat/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(engineSource, /Qwen Cloud \(DashScope\)/);
  assert.match(engineSource, /BYOK · Cloud/);
  assert.match(engineSource, /Ollama Local/);
  assert.match(route, /CLOUD_TIMEOUT_MS/);
  assert.ok((route.match(/AbortSignal\.timeout\(CLOUD_TIMEOUT_MS\)/g) ?? []).length >= 4);
});
