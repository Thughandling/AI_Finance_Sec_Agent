import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
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
  ], { encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } }));

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

test("returns the expected RAG Top1 for every demo scenario", async () => {
  const { analyzeText, retrieveAndRerank, scenarios } = await engine();
  const expected = {
    prosecutor: "FSS-ORG-001",
    loan: "FSS-LOAN-001",
    family: "KNPA-FAMILY-001",
    // 완곡 표현 사칭은 통화 탐지가 실패해 정상 절차로 분류된다(의도된 미탐 시연).
    evasive: "SAFE-NORMAL-001",
    normal: "SAFE-NORMAL-001",
  };
  assert.equal(scenarios.length, Object.keys(expected).length, "expected 맵에 없는 시나리오가 있다");
  for (const scenario of scenarios) {
    const query = scenario.lines.map((line) => line.text).join(" ");
    const risk = analyzeText(query);
    assert.equal(retrieveAndRerank(query, risk.riskType)[0]?.id, expected[scenario.id], scenario.id);
  }
});

test("keeps the known-limitation scenario an honest miss that transaction signals still catch", async () => {
  const { analyzeText, detectTransactionAnomaly, planAlert, scenarios } = await engine();
  const evasive = scenarios.find((scenario) => scenario.id === "evasive");
  assert.ok(evasive, "evasive 시나리오가 있어야 한다");
  assert.equal(evasive.expectedLabel, "사기");

  const anomaly = detectTransactionAnomaly(evasive.transactionContext);
  const transcript = evasive.lines.map((line) => line.text).join(" ");
  const detection = analyzeText(transcript, anomaly.score);
  // 통화 탐지는 실패해야 한다. 이 시나리오의 목적이 규칙 어휘 회피에 대한 한계 시연이다.
  assert.equal(detection.verdict, "정상", "완곡 표현이 탐지되면 시연 의도가 사라진다");
  // 그러나 백그라운드 거래 신호만으로 경보는 발동해야 한다(이중 트랙 방어).
  assert.ok(anomaly.rawScore >= 30, `이상거래 rawScore ${anomaly.rawScore} < 30`);
  const alert = planAlert(detection, anomaly);
  assert.ok(alert.tier >= 2, `통화 미탐 시에도 경보 티어는 2 이상이어야 한다 (실제 ${alert.tier})`);
  assert.ok(alert.suppressedChannels.includes("푸시 알림"), "통화 중 푸시는 억제되어야 한다");
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

const ALERT_CONTEXTS = [
  null,
  { amount: 150000, payee: "KB-1002-3355", hour: 14 },
  { amount: 600000, payee: "KB-1002-3355", hour: 10 },
  { amount: 9800000, payee: "WOORI-777-0001", hour: 23, in_call: true, new_device_or_app: true, limit_raised: true },
  { amount: 1200000, payee: "KAKAO-3333-77", hour: 15, in_call: true, recent_transfer_count: 3 },
  { amount: 2000000, payee: "X-1", hour: 3, recent_transfer_count: 3 },
];

const ALERT_RISKS = [
  { score: 0, riskType: "정상 절차", keyword: "" },
  { score: 45, riskType: "기관 사칭", keyword: "수사·감독기관 사칭 맥락" },
  { score: 68, riskType: "대출 미끼", keyword: "정부지원 대출 미끼" },
  { score: 94, riskType: "금전 요구", keyword: "즉시 이체 요구" },
  { score: 80, riskType: "피해 발생", keyword: "송금·이체 완료 표현" },
];

function toCamelContext(context) {
  if (!context) return null;
  return {
    amount: context.amount,
    payee: context.payee,
    hour: context.hour,
    inCall: context.in_call ?? false,
    newDeviceOrApp: context.new_device_or_app ?? false,
    limitRaised: context.limit_raised ?? false,
    recentTransferCount: context.recent_transfer_count ?? 0,
  };
}

function toDetectionResult(risk) {
  return {
    score: risk.score,
    level: risk.score >= 70 ? "위험" : risk.score >= 40 ? "주의" : "안전",
    verdict: risk.score >= 40 ? "사기" : "정상",
    riskType: risk.riskType,
    evidence: risk.keyword ? [`${risk.riskType}: ${risk.keyword}`] : [],
    actions: [],
  };
}

test("background transaction detector and alert planner stay equivalent across engines", async () => {
  const { detectTransactionAnomaly, planAlert } = await engine();
  const pythonProgram = String.raw`
import ast, json, re, sys
from typing import Any
graph_path, payload_path = sys.argv[1:]
tree = ast.parse(open(graph_path, encoding="utf-8").read())
wanted_names = {
    "TRANSACTION_BASELINE", "TRANSACTION_RISK_CAP", "ALERT_TIER_NAMES", "ALERT_HOLD_SECONDS",
    "ALERT_SELF_CHECK", "GOLDEN_TIME_SEQUENCE", "POLICY_ACTION_ALLOWLIST",
}
wanted_functions = {"_won", "detect_transaction_anomaly", "_text_tier", "_transaction_tier", "plan_alert"}
nodes = []
for node in tree.body:
    if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id in wanted_names for t in node.targets):
        nodes.append(node)
    elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and node.target.id in wanted_names:
        nodes.append(node)
    elif isinstance(node, ast.FunctionDef) and node.name in wanted_functions:
        nodes.append(node)
module = ast.Module(body=nodes, type_ignores=[])
scope = {"re": re, "Any": Any}
exec(compile(ast.fix_missing_locations(module), graph_path, "exec"), scope)
payload = json.load(open(payload_path, encoding="utf-8"))
out = []
for context in payload["contexts"]:
    anomaly = scope["detect_transaction_anomaly"](context)
    for item in payload["risks"]:
        risk = {
            "score": item["score"],
            "risk_type": item["riskType"],
            "evidence": [{"type": item["riskType"], "keywords": [item["keyword"]], "score_added": 0}] if item["keyword"] else [],
            "already_transferred": item["riskType"] == "피해 발생",
        }
        out.append({"anomaly": anomaly, "alert": scope["plan_alert"](risk, anomaly)})
print(json.dumps(out, ensure_ascii=False))
`;
  const payloadPath = fileURLToPath(new URL("../.alert-parity-payload.json", import.meta.url));
  await writeFile(payloadPath, JSON.stringify({ contexts: ALERT_CONTEXTS, risks: ALERT_RISKS }), "utf8");
  let pythonResults;
  try {
    pythonResults = JSON.parse(execFileSync(pythonBin(), [
      "-c",
      pythonProgram,
      fileURLToPath(new URL("../backend/app/graph.py", import.meta.url)),
      payloadPath,
    ], { encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } }));
  } finally {
    await rm(payloadPath, { force: true });
  }

  let index = 0;
  for (const context of ALERT_CONTEXTS) {
    const anomaly = detectTransactionAnomaly(toCamelContext(context));
    for (const item of ALERT_RISKS) {
      const label = `${JSON.stringify(context)} / ${item.riskType} ${item.score}`;
      const expected = pythonResults[index];
      index += 1;
      assert.deepEqual(
        { score: anomaly.score, rawScore: anomaly.rawScore, observed: anomaly.observed },
        { score: expected.anomaly.score, rawScore: expected.anomaly.raw_score, observed: expected.anomaly.observed },
        label,
      );
      const alert = planAlert(toDetectionResult(item), anomaly);
      assert.deepEqual(
        {
          tier: alert.tier,
          tierName: alert.tierName,
          channels: alert.channels,
          suppressed: alert.suppressedChannels,
          hold: alert.holdSeconds,
          covert: alert.covertMode,
          trusted: alert.notifyTrustedContact,
          selfCheck: alert.selfCheck,
          message: alert.message,
        },
        {
          tier: expected.alert.tier,
          tierName: expected.alert.tier_name,
          channels: expected.alert.channels,
          suppressed: expected.alert.suppressed_channels,
          hold: expected.alert.hold_seconds,
          covert: expected.alert.covert_mode,
          trusted: expected.alert.notify_trusted_contact,
          selfCheck: expected.alert.self_check,
          message: {
            observed: expected.alert.message.observed,
            reason: expected.alert.message.reason,
            primaryAction: expected.alert.message.primary_action,
          },
        },
        label,
      );
    }
  }
  assert.equal(index, ALERT_CONTEXTS.length * ALERT_RISKS.length);
});

test("alert delivery never pushes during a call and never claims an executed external action", async () => {
  const { detectTransactionAnomaly, planAlert, policyActionAllowlist } = await engine();
  const inCall = detectTransactionAnomaly({ amount: 9800000, payee: "NEW-1", hour: 23, inCall: true, limitRaised: true });
  const offCall = detectTransactionAnomaly({ amount: 9800000, payee: "NEW-1", hour: 23, limitRaised: true });
  const fraud = { score: 94, level: "위험", verdict: "사기", riskType: "금전 요구", evidence: ["금전 요구: 즉시 이체 요구"], actions: [] };

  const duringCall = planAlert(fraud, inCall);
  assert.equal(duringCall.channels.some((channel) => /푸시|SMS/.test(channel)), false);
  assert.deepEqual(duringCall.suppressedChannels, ["푸시 알림", "SMS"]);
  assert.equal(duringCall.covertMode, true);
  assert.ok(duringCall.channels.includes("ARS 콜백"));

  const withoutCall = planAlert(fraud, offCall);
  assert.ok(withoutCall.channels.includes("푸시 알림"));
  assert.equal(withoutCall.covertMode, false);

  // 단일 CTA는 정책 허용목록 안에서만 나온다.
  for (const anomaly of [inCall, offCall]) {
    for (const score of [0, 45, 68, 94]) {
      const plan = planAlert({ ...fraud, score }, anomaly);
      assert.ok(policyActionAllowlist.includes(plan.message.primaryAction), `${score}: ${plan.message.primaryAction}`);
      assert.equal(plan.externalActionExecuted, false);
    }
  }

  // 조용한 고객에게는 개입하지 않는다.
  const quiet = planAlert({ ...fraud, score: 12, level: "안전", verdict: "정상", riskType: "정상 절차" }, detectTransactionAnomaly(null));
  assert.equal(quiet.tier, 0);
  assert.deepEqual(quiet.channels, []);
  assert.equal(quiet.holdSeconds, 0);

  // 송금 후에는 골든타임 순서를 제시한다.
  const victim = planAlert({ ...fraud, riskType: "피해 발생" }, offCall);
  assert.equal(victim.tier, 3);
  assert.equal(victim.message.primaryAction, "해당 금융회사 콜센터에 지급정지 요청");
  assert.equal(victim.goldenTime?.windowMinutes, 30);
  for (const step of victim.goldenTime?.sequence ?? []) assert.ok(policyActionAllowlist.includes(step), step);
});

test("scenario transaction contexts keep the fused score unchanged", async () => {
  const { scenarios, detectTransactionAnomaly } = await engine();
  // evasive는 통화 탐지가 실패하는 미탐 시나리오지만 거래 신호는 상한까지 차야 한다.
  const expected = { prosecutor: 30, loan: 30, family: 30, evasive: 30, normal: 0 };
  assert.equal(scenarios.length, Object.keys(expected).length, "expected 맵에 없는 시나리오가 있다");
  for (const scenario of scenarios) {
    assert.equal(detectTransactionAnomaly(scenario.transactionContext).score, expected[scenario.id], scenario.id);
  }
});

test("renders the background alert panel instead of the static signal table", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /백그라운드 이상거래 신호/);
  assert.match(page, /경보 전달 계획/);
  assert.match(page, /data-testid="alert-message"/);
  assert.match(page, /detectTransactionAnomaly\(scenario\.transactionContext\)/);
  assert.doesNotMatch(page, /scenario\.transactionSignals\.reduce/);
  // 이상거래 신호는 Mock과 Ollama 두 모드 모두에서 보여야 한다. Ollama 모드에서는
  // FastAPI가 계산한 값을 그대로 쓴다.
  assert.match(page, /data-testid="anomaly-signals"/);
  assert.match(page, /lastGraphRun\.transaction_anomaly\.signals/);
  assert.doesNotMatch(page, /isOllamaActual \? <>[\s\S]{0,400}백그라운드 이상거래 신호/);
});
