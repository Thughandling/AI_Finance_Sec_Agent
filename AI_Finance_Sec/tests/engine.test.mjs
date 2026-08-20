import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

// `python3` does not exist on Windows, where it resolves to a Microsoft Store
// stub. Prefer an explicit override, then the project venv, then the platform
// default so the parity check runs identically on macOS, Linux and Windows.
function pythonBin() {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  const venv = process.platform === "win32"
    ? new URL("../backend/.venv/Scripts/python.exe", import.meta.url)
    : new URL("../backend/.venv/bin/python", import.meta.url);
  const venvPath = fileURLToPath(venv);
  if (existsSync(venvPath)) return venvPath;
  return process.platform === "win32" ? "python" : "python3";
}

async function engine() {
  const source = await readFile(new URL("../app/lib/engine.ts", import.meta.url), "utf8");
  const dataset = JSON.parse(await readFile(new URL("../public/data/evaluation_cases.json", import.meta.url), "utf8"));
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace(
    /import evaluationDataset from "\.\.\/\.\.\/public\/data\/evaluation_cases\.json";?/,
    `const evaluationDataset = ${JSON.stringify(dataset)};`,
  );
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
}

async function evaluationDataset() {
  return JSON.parse(await readFile(new URL("../public/data/evaluation_cases.json", import.meta.url), "utf8"));
}

async function holdoutDataset() {
  return JSON.parse(await readFile(new URL("../public/data/evaluation_holdout.json", import.meta.url), "utf8"));
}

test("shared regression set passes confusion, category, risk-type and RAG gates", async () => {
  const [{ analyzeText, retrieveAndRerank, calculateEvaluation }, dataset] = await Promise.all([engine(), evaluationDataset()]);
  assert.ok(dataset.cases.length >= 38);
  assert.equal(new Set(dataset.cases.map((item) => item.id)).size, dataset.cases.length);

  const result = calculateEvaluation();
  const falsePositiveRate = result.fp / Math.max(result.fp + result.tn, 1);
  assert.ok(result.macroF1 >= dataset.quality_gates.min_macro_f1, JSON.stringify(result));
  assert.ok(result.recall >= dataset.quality_gates.min_fraud_recall, JSON.stringify(result));
  assert.ok(falsePositiveRate <= dataset.quality_gates.max_false_positive_rate, JSON.stringify(result));

  const categoryRows = new Map();
  for (const item of dataset.cases) {
    const risk = analyzeText(item.text);
    const predicted = risk.verdict === "사기" ? "fraud" : "normal";
    const rows = categoryRows.get(item.category) ?? [];
    rows.push(predicted === item.label);
    categoryRows.set(item.category, rows);
    assert.equal(predicted, item.label, `${item.id}: ${item.failure_mode}`);
    assert.equal(risk.riskType, item.expected_risk_type, item.id);
    assert.equal(retrieveAndRerank(item.text, risk.riskType)[0].id, item.expected_top1, item.id);
  }
  for (const [category, rows] of categoryRows) {
    const recall = rows.filter(Boolean).length / rows.length;
    assert.ok(recall >= dataset.quality_gates.min_category_recall, `${category}: ${recall}`);
  }
});

test("TypeScript and Python detectors stay score-for-score equivalent on the shared set", async () => {
  const [{ analyzeText }, dataset] = await Promise.all([engine(), evaluationDataset()]);
  const pythonProgram = String.raw`
import ast, json, re, sys
from typing import Any
graph_path, dataset_path = sys.argv[1:]
source = open(graph_path, encoding="utf-8").read()
tree = ast.parse(source)
wanted_assignments = {"RISK_PATTERNS", "NORMAL_CLAUSE_PATTERNS", "COMPLETED_ACTION_PATTERNS", "SUSPICIOUS_TRANSFER_CONTEXT", "SAFE_COMPLETED_CONTEXT"}
nodes = []
for node in tree.body:
    if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id in wanted_assignments for target in node.targets):
        nodes.append(node)
    elif isinstance(node, ast.FunctionDef) and node.name == "analyze_risk":
        nodes.append(node)
module = ast.Module(body=nodes, type_ignores=[])
scope = {"re": re, "Any": Any}
exec(compile(ast.fix_missing_locations(module), graph_path, "exec"), scope)
dataset = json.load(open(dataset_path, encoding="utf-8"))
print(json.dumps([scope["analyze_risk"](case["text"]) for case in dataset["cases"]], ensure_ascii=False))
`;
  const pythonResults = JSON.parse(execFileSync(pythonBin(), [
    "-c",
    pythonProgram,
    fileURLToPath(new URL("../backend/app/graph.py", import.meta.url)),
    fileURLToPath(new URL("../public/data/evaluation_cases.json", import.meta.url)),
  ], { encoding: "utf8" }));

  dataset.cases.forEach((item, index) => {
    const tsResult = analyzeText(item.text);
    const pyResult = pythonResults[index];
    assert.deepEqual(
      { score: tsResult.score, level: tsResult.level, verdict: tsResult.verdict, riskType: tsResult.riskType },
      { score: pyResult.score, level: pyResult.level, verdict: pyResult.verdict, riskType: pyResult.risk_type },
      item.id,
    );
  });
});

test("separate holdout passes classification, critical and non-self-fulfilling RAG gates", async () => {
  const [{ analyzeText, retrieveAndRerank }, dataset] = await Promise.all([engine(), holdoutDataset()]);
  assert.ok(dataset.cases.length >= 40);
  assert.equal(dataset.cases.filter((item) => item.critical).length, 8);
  assert.equal(new Set(dataset.cases.map((item) => item.family_id)).size, dataset.cases.length);
  let tp = 0; let tn = 0; let fp = 0; let fn = 0; let ragHits = 0; let ragTotal = 0; let criticalHits = 0;
  for (const item of dataset.cases) {
    const risk = analyzeText(item.text);
    const predicted = risk.verdict === "사기" ? "fraud" : "normal";
    tp += Number(item.label === "fraud" && predicted === "fraud");
    tn += Number(item.label === "normal" && predicted === "normal");
    fp += Number(item.label === "normal" && predicted === "fraud");
    fn += Number(item.label === "fraud" && predicted === "normal");
    if (item.critical && predicted === item.label) criticalHits += 1;
    assert.equal(predicted, item.label, item.id);
    assert.equal(risk.riskType, item.expected_risk_type, item.id);
    const retrieved = retrieveAndRerank(item.text, risk.riskType);
    if (item.expected_top1 === null) {
      assert.deepEqual(retrieved, [], item.id);
    } else {
      ragTotal += 1;
      ragHits += Number(retrieved[0]?.id === item.expected_top1);
      assert.equal(retrieved[0]?.id, item.expected_top1, item.id);
    }
  }
  const fraudPrecision = tp / Math.max(tp + fp, 1);
  const fraudRecall = tp / Math.max(tp + fn, 1);
  const fraudF1 = 2 * fraudPrecision * fraudRecall / Math.max(fraudPrecision + fraudRecall, Number.EPSILON);
  const normalPrecision = tn / Math.max(tn + fn, 1);
  const normalRecall = tn / Math.max(tn + fp, 1);
  const normalF1 = 2 * normalPrecision * normalRecall / Math.max(normalPrecision + normalRecall, Number.EPSILON);
  assert.ok((fraudF1 + normalF1) / 2 >= dataset.quality_gates.min_macro_f1);
  assert.ok(fraudRecall >= dataset.quality_gates.min_fraud_recall);
  assert.ok(fp / Math.max(fp + tn, 1) <= dataset.quality_gates.max_false_positive_rate);
  assert.ok(criticalHits / 8 >= dataset.quality_gates.min_critical_recall);
  assert.ok(ragHits / ragTotal >= dataset.quality_gates.min_rag_top1_accuracy);
});

test("adversarial round2 and round3 single-turn cases are fixed regressions", async () => {
  const [{ analyzeText, retrieveAndRerank }, round2, round3] = await Promise.all([
    engine(),
    readFile(new URL("../public/data/evaluation_adversarial_round2.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../public/data/evaluation_adversarial_round3.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  for (const item of [...round2.cases, ...round3.single_turn]) {
    const risk = analyzeText(item.text);
    assert.equal(risk.verdict === "사기" ? "fraud" : "normal", item.label, item.id);
    assert.equal(risk.riskType, item.expected_risk_type, item.id);
    if (item.expected_top1) assert.equal(retrieveAndRerank(item.text, risk.riskType)[0]?.id, item.expected_top1, item.id);
  }
  for (const item of round3.rag) {
    const docs = retrieveAndRerank(item.query, item.risk_type);
    assert.equal(docs[0]?.id ?? null, item.expected, item.id);
    assert.equal(docs[0]?.retrievalMode ?? null, item.mode, item.id);
  }
});

test("detects the remote-control app sentence as fraud", async () => {
  const { analyzeText } = await engine();
  const result = analyzeText("링크를 눌러 원격제어 앱을 설치하세요.");
  assert.equal(result.verdict, "사기");
  assert.equal(result.riskType, "앱 설치");
});

test("treats an already-transferred report as a high-risk victim event", async () => {
  const { analyzeText, retrieveAndRerank } = await engine();
  const result = analyzeText("이미 송금했습니다. 무엇부터 해야 하나요?");
  assert.equal(result.verdict, "사기");
  assert.equal(result.riskType, "피해 발생");
  assert.ok(result.score >= 70);
  assert.equal(retrieveAndRerank("이미 송금했습니다.", result.riskType)[0].id, "KNPA-1394-001");
});

test("shows the current victim-response guidance without claiming external execution", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /1394 피해 신고·상담/);
  assert.match(page, /긴급한 상황은 112/);
  assert.match(page, /해당 금융회사 지급정지 요청/);
  assert.match(page, /실제 신고는 수행되지 않습니다/);
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
  assert.match(page, /Qwen 로컬 호출 확인 \+ 서버 정책 엔진 응답/);
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

test("does not expose a verified raw LLM response mode in product code", async () => {
  const [page, graph, readme] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../backend/app/graph.py", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(`${page}\n${graph}\n${readme}`, /llm_verified/);
  assert.match(page, /Qwen 로컬 호출 확인 \+ 서버 정책 엔진 응답/);
});
