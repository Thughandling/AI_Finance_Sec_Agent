import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const workspace = "/Users/dongyoungko/Documents/AI_Hacker";
const repo = path.join(workspace, "AI_Finance_Sec");
const outputDir = path.join(workspace, "outputs/019fc231-dd29-7ff2-bf0b-a2db2c8209ee");
const outputPath = path.join(outputDir, "AI_Finance_Sec_파일관리목록대장.xlsx");
const previewDir = path.join(workspace, "tmp/file_inventory_20260816/rendered");

const excludedNames = new Set([".DS_Store"]);
const excludedDirs = new Set([".git", "node_modules", ".next", ".vinext", "dist", "out", "coverage", ".venv", "__pycache__", ".pytest_cache", ".wrangler", ".pnpm-store"]);

async function walk(dir) {
  const results = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (excludedNames.has(entry.name) || excludedDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...await walk(full));
    else if (entry.isFile()) results.push(full);
  }
  return results;
}

const projectRoots = [
  repo,
  path.join(workspace, "docs"),
  path.join(workspace, "submission"),
  path.join(workspace, "presentation"),
  path.join(workspace, "output/pdf"),
];
let files = [];
for (const root of projectRoots) {
  try { files.push(...await walk(root)); } catch { /* optional folder */ }
}
for (const name of ["Edit.md", "AI_Finance_Sec_아키텍처_및_실행가이드_Notion.md", "(첨부1) 2026 금융 AI Challenge 공모전 기획서.hwpx", "(첨부2) 2026 금융 AI Challenge 기능명세서.hwpx"]) {
  const full = path.join(workspace, name);
  try { if ((await fs.stat(full)).isFile()) files.push(full); } catch { /* optional */ }
}

const gitStatus = new Map();
try {
  const lines = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: repo, encoding: "utf8" }).trim().split("\n").filter(Boolean);
  for (const line of lines) gitStatus.set(line.slice(3).normalize("NFC"), line.slice(0, 2).trim() || "변경");
} catch { /* non-fatal */ }

const exact = {
  "AI_Finance_Sec/backend/app/graph.py": ["핵심 실행", "Python AI 코어", "LangGraph 판정·오케스트레이션", "State, Node, Edge, Qwen 구조화 판정, 규칙 결합, RAG, 정책, Safety, 멀티턴 메모리의 실제 구현", "FastAPI run_chat", "단일 기준 소스", "유지", "P0"],
  "AI_Finance_Sec/backend/main.py": ["핵심 실행", "FastAPI", "백엔드 API 진입점", "/health와 /api/chat 요청·응답 스키마 및 LangGraph 호출", "uvicorn backend.main:app", "실행 진입점", "유지", "P0"],
  "AI_Finance_Sec/app/api/chat/route.ts": ["핵심 실행", "모델 라우터", "Cloud BYOK·Ollama 라우터", "OpenAI, Claude, Gemini, DeepSeek, Qwen Cloud 및 로컬 FastAPI 호출 경로", "Next POST /api/chat", "실행 진입점", "유지", "P0"],
  "AI_Finance_Sec/app/lib/engine.ts": ["핵심 실행", "브라우저 Mock", "Mock 판정·검색·안전 엔진", "API 키 없이 동작하는 규칙 판정, 평가, 검색, 정책 응답과 Safety 검증", "app/page.tsx·프론트 테스트", "병행 기준 소스", "유지", "P0"],
  "AI_Finance_Sec/app/page.tsx": ["핵심 실행", "웹 UI", "메인 데모 화면", "모델 선택, 시나리오, 채팅, 위험도, 근거 문서와 처리 Trace 표시", "Next/Vinext 브라우저", "실행 진입점", "유지", "P0"],
  "AI_Finance_Sec/AI_Finance_Sec_Chatbot_Orchestration.ipynb": ["문서·프로토타입", "Notebook", "오케스트레이션 설명·실험", "독립 프로토타입으로 최신 backend/app/graph.py를 import하지 않아 현재 구현과 차이가 있음", "Colab/Jupyter", "설명용 비기준", "동기화 필요", "P1"],
  "AI_Finance_Sec/README.md": ["문서·프로토타입", "개발 문서", "프로젝트 실행 안내", "설치·실행·아키텍처 개요. 최신 Qwen 2회 호출과 구조화 판정 기준으로 후속 동기화 필요", "개발자", "안내 문서", "동기화 필요", "P1"],
  "AI_Finance_Sec/public/data/demo_scenarios.json": ["데이터", "데모 데이터", "합성 시나리오 후보", "현재 화면은 인라인 시나리오를 사용하여 직접 참조되지 않는 별도 데이터", "현재 미참조", "보관 후보", "보관 검토", "P2"],
  "AI_Finance_Sec/public/data/evaluation_blind_round4.json": ["데이터", "블라인드 평가", "4차 블라인드 케이스", "현재 엔진·자동테스트에서 직접 참조되지 않아 QA 편입 여부를 결정해야 함", "현재 미참조", "보관 후보", "보관 검토", "P1"],
  "AI_Finance_Sec/package-lock.json": ["설정·의존성", "Lockfile", "npm 의존성 잠금", "pnpm-lock.yaml과 중복 관리 중. 기준 패키지 매니저 확정 후 단일화 검토", "npm", "중복 관리", "정리 검토", "P2"],
  "AI_Finance_Sec/pnpm-lock.yaml": ["설정·의존성", "Lockfile", "pnpm 의존성 잠금", "현재 설치·빌드 재현을 위한 pnpm 기준 잠금 파일", "pnpm", "재현성 기준", "유지", "P1"],
};

function describe(rel) {
  if (exact[rel]) return exact[rel];
  const name = path.basename(rel);
  if (/public\/data\/evaluation_(cases|holdout|adversarial_round2|adversarial_round3)\.json$/.test(rel)) return ["데이터", "평가 데이터", "자동 회귀·홀드아웃 데이터", "분류, RAG, 피해대응, 경계·멀티턴 동작을 양 엔진 테스트에서 검증", "TS·Python 테스트", "검증 자산", "유지", "P0"];
  if (/backend\/tests|^AI_Finance_Sec\/tests\//.test(rel)) return ["검증", "자동 테스트", "회귀·품질 게이트", "분류·RAG·안전성·렌더링·TS/Python 동등성을 자동 검증", "npm test·pytest", "검증 자산", "유지", "P0"];
  if (/backend\/scripts|backend\/smoke/.test(rel)) return ["검증", "실호출 점검", "Ollama 스모크·증적", "로컬 Qwen과 FastAPI 실호출 상태 및 정책 응답을 확인", "수동 스모크", name.endsWith(".json") ? "생성 증적" : "검증 도구", "유지", "P1"];
  if (/^AI_Finance_Sec\/app\//.test(rel)) return ["지원 소스", name.endsWith(".css") ? "스타일" : "프론트 지원", "화면·메타데이터·인증 지원", "메인 UI 실행을 지원하는 레이아웃, 스타일 또는 인증 보조 코드", "Next/Vinext", "지원 소스", "유지", "P1"];
  if (/^AI_Finance_Sec\/backend\//.test(rel)) return ["지원 소스", name.includes("requirements") ? "의존성" : "Python 패키지", "백엔드 패키지·환경 지원", "FastAPI·LangGraph 실행에 필요한 패키지 경계 또는 의존성", "Python", "지원 소스", "유지", "P1"];
  if (/^AI_Finance_Sec\/(build|worker)\//.test(rel) || /hosting\.json|vite\.config\.ts|next\.config\.ts/.test(rel)) return ["배포·빌드", "배포 런타임", "Sites·Cloudflare 빌드/실행", "Vinext 결과물을 배포 런타임에 연결하는 설정 또는 진입점", "빌드·배포", "배포 필수", "유지", "P0"];
  if (/^AI_Finance_Sec\/(db|examples\/d1|drizzle)/.test(rel)) return ["배포·빌드", "DB 스캐폴드", "D1·Drizzle 참고/준비 코드", "현재 핵심 챗봇에서 직접 사용하지 않는 영속화 템플릿 또는 마이그레이션 메타정보", "향후 P2", "보관 후보", "보관 검토", "P2"];
  if (/^AI_Finance_Sec\/public\//.test(rel)) {
    const unused = ["file.svg", "globe.svg", "window.svg"].includes(name);
    return ["정적 자산", name.endsWith(".json") ? "데이터" : "이미지", unused ? "스타터 이미지" : "웹 정적 자산", unused ? "현재 UI에서 참조되지 않는 기본 스타터 SVG" : "파비콘 또는 Open Graph 등 웹 표시용 정적 자산", "브라우저", unused ? "보관 후보" : "지원 자산", unused ? "보관 검토" : "유지", "P2"];
  }
  if (/^AI_Finance_Sec\/(package\.json|pnpm-workspace|tsconfig|eslint|postcss|\.gitignore)/.test(rel)) return ["설정·의존성", "개발 설정", "개발·빌드 환경 설정", "패키지, 타입검사, 린트, CSS 처리 또는 형상관리 제외 규칙", "개발·CI", "환경 기준", "유지", "P1"];
  if (rel.startsWith("submission/")) {
    const integrated = rel.includes("통합수정본");
    const submitted = rel.includes("제출본");
    return ["제출 산출물", name.endsWith(".md") ? "제출 원고" : "HWPX 제출문서", name.includes("기획서") ? "공모전 기획서" : name.includes("기능명세") || name.includes("기술명세") ? "MVP 기술·기능명세서" : "데모 운영가이드", integrated ? "2026-08-05 기준 최신 통합수정본" : submitted ? "2026-08-03 제출본으로 통합수정본보다 이전 버전" : "제출용 Markdown 기준 원고", "심사 제출", integrated ? "최신 편집본" : submitted ? "이전 제출본" : "원본 문서", integrated ? "제출 후보" : submitted ? "보관" : "유지", integrated ? "P0" : "P1"];
  }
  if (rel.startsWith("docs/")) return ["문서·프로토타입", "설계·조사 문서", name.replace(/\.md$/, ""), "데이터, 모델, RAG, 평가, 에이전트 또는 소스 관리에 대한 근거와 기준", "기획·개발", "참조 문서", "유지", "P1"];
  if (rel.startsWith("presentation/")) return ["발표 산출물", name.endsWith(".pptx") ? "PPTX" : "검수 메타", "컨설팅 발표 장표", name.endsWith(".pptx") ? "문제정의와 시스템 설계 도식 중심 발표자료" : "장표 렌더·구조 검수 과정에서 생성된 메타정보", "발표·심사", name.endsWith(".pptx") ? "최종 산출물" : "생성 중간물", name.endsWith(".pptx") ? "유지" : "정리 검토", "P1"];
  if (rel.startsWith("output/pdf/")) return ["발표 산출물", "PDF", "전체 프로세스 플로우차트", "프론트 챗봇과 백그라운드 시스템 흐름을 가로형으로 도식화", "발표·설명", "최종 산출물", "유지", "P1"];
  if (rel === "Edit.md") return ["프로젝트 관리", "대화 기록", "요구사항·의사결정 대장", "사용자 질문, 답변, 우선순위와 산출물 변경 내용을 누적 기록", "프로젝트 전체", "관리 원본", "유지", "P0"];
  if (rel.includes("아키텍처_및_실행가이드")) return ["문서·프로토타입", "실행 가이드", "Notion 복붙용 아키텍처 안내", "MVP 실행과 RAG·LLM·State·Graph 처리 흐름을 설명", "Notion·교육", "참조 문서", "동기화 필요", "P1"];
  if (rel.startsWith("(첨부")) return ["원본 양식", "주최측 원본", "공모전 원본 양식", "사용자가 제공한 기획서 또는 기능명세서 원본 HWPX", "제출문서 작성", "보존 원본", "보관", "P0"];
  return ["기타", "미분류", name, "프로젝트 관련 파일", "프로젝트", "검토 필요", "분류 검토", "P2"];
}

const rows = [];
for (const full of [...new Set(files)].sort((a, b) => a.localeCompare(b, "ko"))) {
  const rawRel = path.relative(workspace, full);
  const rel = rawRel.normalize("NFC");
  if (rel.endsWith(".inspect.ndjson")) continue;
  const stat = await fs.stat(full);
  const [category, subcategory, purpose, detail, consumer, authority, status, priority] = describe(rel);
  let scm = "비형상관리";
  if (rel.startsWith("AI_Finance_Sec/")) {
    const repoRel = rel.slice("AI_Finance_Sec/".length);
    scm = gitStatus.get(repoRel) || "추적·변경없음";
  }
  rows.push([0, category, subcategory, path.basename(rel), rel, purpose, detail, consumer, authority, status, priority, scm, stat.mtime, stat.size / 1024, status === "보관 검토" ? "삭제 전 참조·빌드 재검증" : ""]);
}
rows.push([0, "프로젝트 관리", "형상관리 대장", "AI_Finance_Sec_파일관리목록대장.xlsx", path.relative(workspace, outputPath), "소스·문서·산출물 관리 대장", "전체 파일의 목적, 권위, 상태, 우선순위, 변경 여부를 추적", "프로젝트 전체", "관리 원본", "유지", "P0", "비형상관리", new Date(), 0, "본 파일"]);

const categoryOrder = ["핵심 실행", "지원 소스", "데이터", "검증", "설정·의존성", "배포·빌드", "정적 자산", "문서·프로토타입", "프로젝트 관리", "원본 양식", "제출 산출물", "발표 산출물", "기타"];
rows.sort((a, b) => categoryOrder.indexOf(a[1]) - categoryOrder.indexOf(b[1]) || a[4].localeCompare(b[4], "ko"));
rows.forEach((row, i) => { row[0] = i + 1; });

const workbook = Workbook.create();
const summary = workbook.worksheets.add("요약");
const ledger = workbook.worksheets.add("파일관리대장");
const rules = workbook.worksheets.add("관리기준");
for (const sheet of [summary, ledger, rules]) sheet.showGridLines = false;

const green = "#009275", dark = "#163832", pale = "#EAF6F4", blue = "#DDF1F8", border = "#C9DCD7";
const headerFormat = { fill: dark, font: { bold: true, color: "#FFFFFF" }, verticalAlignment: "center", wrapText: true };

summary.getRange("A1:H1").merge();
summary.getRange("A1").values = [["AI_Finance_Sec 소스·파일 관리 현황"]];
summary.getRange("A1:H1").format = { fill: green, font: { bold: true, color: "#FFFFFF", size: 18 }, verticalAlignment: "center", rowHeight: 34 };
summary.getRange("A2:H2").merge();
summary.getRange("A2").values = [["실행 기준 소스와 문서·평가·배포·제출 산출물을 역할과 관리 상태로 재분류한 최신 대장 (2026-08-16)"]];
summary.getRange("A2:H2").format = { fill: pale, font: { color: "#365F57", size: 10 }, rowHeight: 24 };
summary.getRange("A4:B4").values = [["관리 지표", "건수"]];
summary.getRange("A4:B4").format = headerFormat;
const summaryLabels = ["전체 관리 파일", "핵심 실행", "검증 자산", "동기화 필요", "보관·정리 검토", "Git 변경/신규"];
summary.getRange("A5:A10").values = summaryLabels.map(v => [v]);
const firstRow = 5, lastRow = firstRow + rows.length - 1;
summary.getRange("B5:B10").formulas = [
  [`=COUNTA('파일관리대장'!$A$${firstRow}:$A$${lastRow})`],
  [`=COUNTIF('파일관리대장'!$B$${firstRow}:$B$${lastRow},"핵심 실행")`],
  [`=COUNTIF('파일관리대장'!$I$${firstRow}:$I$${lastRow},"검증 자산")`],
  [`=COUNTIF('파일관리대장'!$J$${firstRow}:$J$${lastRow},"동기화 필요")`],
  [`=COUNTIF('파일관리대장'!$J$${firstRow}:$J$${lastRow},"보관 검토")+COUNTIF('파일관리대장'!$J$${firstRow}:$J$${lastRow},"정리 검토")`],
  [`=COUNTIF('파일관리대장'!$L$${firstRow}:$L$${lastRow},"M")+COUNTIF('파일관리대장'!$L$${firstRow}:$L$${lastRow},"??")`],
];
summary.getRange("A5:B10").format = { fill: "#FFFFFF", borders: { bottom: { style: "thin", color: border } }, verticalAlignment: "center" };
summary.getRange("B5:B10").format.numberFormat = "#,##0";
summary.getRange("D4:H4").merge();
summary.getRange("D4").values = [["현재 실행 기준 소스 (Single Source of Truth)"]];
summary.getRange("D4:H4").format = headerFormat;
summary.getRange("D5:H9").values = [
  ["Python AI 코어", "backend/app/graph.py", "State·Node·Edge·Qwen·RAG·Safety", "단일 기준 소스", "P0"],
  ["FastAPI", "backend/main.py", "API 요청·응답 및 graph 호출", "실행 진입점", "P0"],
  ["Cloud BYOK", "app/api/chat/route.ts", "외부 Provider·Ollama 라우팅", "실행 진입점", "P0"],
  ["브라우저 Mock", "app/lib/engine.ts", "API 없는 데모 판정·검색", "병행 기준 소스", "P0"],
  ["웹 화면", "app/page.tsx", "모델 선택·채팅·판정·근거 표시", "실행 진입점", "P0"],
];
summary.getRange("D5:H9").format = { fill: "#FFFFFF", wrapText: true, borders: { bottom: { style: "thin", color: border } }, verticalAlignment: "top" };
summary.getRange("D11:H11").merge();
summary.getRange("D11").values = [["핵심 관리 이슈"]];
summary.getRange("D11:H11").format = headerFormat;
summary.getRange("D12:H16").values = [
  ["Notebook", "최신 graph.py와 불일치", "설명·실험용으로만 사용", "동기화 필요", "P1"],
  ["README/Notion 가이드", "최신 구조화 Qwen·호출 순서 반영 필요", "코드 기준으로 갱신", "동기화 필요", "P1"],
  ["미참조 JSON", "demo_scenarios·evaluation_blind_round4", "테스트 편입 또는 archive 검토", "보관 검토", "P1"],
  ["Lockfile", "npm·pnpm 잠금파일 중복", "기준 패키지 매니저 확정", "정리 검토", "P2"],
  ["제출 문서", "통합수정본이 제출본보다 최신", "팀 정보·URL 확인 후 최종본 확정", "제출 확인", "P0"],
];
summary.getRange("D12:H16").format = { fill: blue, wrapText: true, borders: { bottom: { style: "thin", color: border } }, verticalAlignment: "top" };
summary.getRange("A:A").format.columnWidth = 24; summary.getRange("B:B").format.columnWidth = 14;
summary.getRange("C:C").format.columnWidth = 3; summary.getRange("D:D").format.columnWidth = 24;
summary.getRange("E:E").format.columnWidth = 34; summary.getRange("F:F").format.columnWidth = 43;
summary.getRange("G:G").format.columnWidth = 20; summary.getRange("H:H").format.columnWidth = 10;
summary.freezePanes.freezeRows(2);

ledger.getRange("A1:O1").merge();
ledger.getRange("A1").values = [["AI_Finance_Sec 파일 관리 목록 대장"]];
ledger.getRange("A1:O1").format = { fill: green, font: { bold: true, color: "#FFFFFF", size: 16 }, verticalAlignment: "center", rowHeight: 32 };
ledger.getRange("A2:O2").merge();
ledger.getRange("A2").values = [["파일명·목적·세부내용과 함께 권위 수준, 관리 상태, 우선순위, Git 상태를 추적합니다."]];
ledger.getRange("A2:O2").format = { fill: pale, font: { color: "#365F57", size: 10 }, rowHeight: 24 };
const headers = ["ID", "논리 분류", "세부 분류", "파일명", "상대 경로", "파일 목적", "세부내용", "실행·참조 주체", "권위 수준", "관리 상태", "우선순위", "Git 상태", "최종 수정일", "크기(KB)", "비고·조치"];
ledger.getRange("A4:O4").values = [headers];
ledger.getRange("A4:O4").format = headerFormat;
ledger.getRange(`A${firstRow}:O${lastRow}`).values = rows;
ledger.getRange(`A${firstRow}:O${lastRow}`).format = { font: { color: "#243E39", size: 9 }, verticalAlignment: "top", wrapText: true, borders: { bottom: { style: "thin", color: "#DDE9E6" } }, rowHeight: 42 };
ledger.getRange(`A${firstRow}:O${lastRow}`).conditionalFormats.addCustom(`=MOD($A${firstRow},2)=0`, { fill: "#F4FAF9" });
ledger.getRange(`J${firstRow}:J${lastRow}`).conditionalFormats.addCustom(`=OR($J${firstRow}="동기화 필요",$J${firstRow}="정리 검토",$J${firstRow}="보관 검토")`, { fill: "#FFF2CC", font: { color: "#7F6000", bold: true } });
ledger.getRange(`K${firstRow}:K${lastRow}`).conditionalFormats.addCustom(`=$K${firstRow}="P0"`, { fill: "#FCE4D6", font: { color: "#C00000", bold: true } });
ledger.getRange(`M${firstRow}:M${lastRow}`).format.numberFormat = "yyyy-mm-dd hh:mm";
ledger.getRange(`N${firstRow}:N${lastRow}`).format.numberFormat = "#,##0.0";
const widths = [6, 17, 18, 32, 48, 27, 64, 24, 19, 17, 10, 17, 18, 12, 32];
"ABCDEFGHIJKLMNO".split("").forEach((col, i) => { ledger.getRange(`${col}:${col}`).format.columnWidth = widths[i]; });
ledger.freezePanes.freezeRows(4);
const table = ledger.tables.add(`A4:O${lastRow}`, true, "SourceFileLedger");
table.style = "TableStyleMedium2";
table.showBandedColumns = false;
table.showFilterButton = true;

rules.getRange("A1:D1").merge();
rules.getRange("A1").values = [["소스 분류·형상관리 기준"]];
rules.getRange("A1:D1").format = { fill: green, font: { bold: true, color: "#FFFFFF", size: 16 }, verticalAlignment: "center", rowHeight: 32 };
rules.getRange("A3:D3").values = [["구분", "값", "의미", "관리 행동"]];
rules.getRange("A3:D3").format = headerFormat;
const ruleRows = [
  ["권위", "단일 기준 소스", "서비스 동작을 최종 결정하는 구현", "변경 시 테스트·문서 동기화"],
  ["권위", "병행 기준 소스", "Mock 등 별도 실행 경로의 기준 구현", "Python 코어와 parity 검증"],
  ["권위", "설명용 비기준", "Notebook·가이드 등 설명/실험 산출물", "배포 기준으로 인용 금지"],
  ["상태", "동기화 필요", "현재 코드보다 설명 또는 구조가 오래됨", "P1에서 기준 소스에 맞춰 갱신"],
  ["상태", "보관 검토", "직접 참조가 없거나 스캐폴드 성격", "삭제 전 참조·빌드·테스트 확인"],
  ["상태", "정리 검토", "중복 또는 생성 중간물", "기준 확정 후 별도 정리 커밋"],
  ["우선순위", "P0", "데모·제출·핵심 실행에 필수", "항상 테스트 및 형상관리"],
  ["우선순위", "P1", "운영·설명·검증 품질에 중요", "MVP 안정화 전 처리"],
  ["우선순위", "P2", "향후 연계·정리·고도화 범위", "현재 실행 경로 유지 우선"],
  ["변경 규칙", "위험 판정", "graph.py와 engine.ts의 양 경로", "양 테스트·평가 JSON 동시 수정"],
  ["변경 규칙", "API 응답", "FastAPI·Next 라우터·UI의 계약", "main.py·route.ts·page.tsx 함께 검토"],
  ["보안", "비밀정보", "API 키·토큰·개인정보·모델 파일", "Git·대장에 값 저장 금지"],
];
rules.getRange(`A4:D${3 + ruleRows.length}`).values = ruleRows;
rules.getRange(`A4:D${3 + ruleRows.length}`).format = { wrapText: true, verticalAlignment: "top", borders: { bottom: { style: "thin", color: border } }, rowHeight: 38 };
rules.getRange("A:A").format.columnWidth = 17; rules.getRange("B:B").format.columnWidth = 23;
rules.getRange("C:C").format.columnWidth = 46; rules.getRange("D:D").format.columnWidth = 48;
rules.freezePanes.freezeRows(3);

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });
for (const sheet of [summary, ledger, rules]) {
  const rendered = await workbook.render({ sheetName: sheet.name, autoCrop: "all", scale: sheet.name === "파일관리대장" ? 0.8 : 1.2, format: "png" });
  await fs.writeFile(path.join(previewDir, `${sheet.name}.png`), new Uint8Array(await rendered.arrayBuffer()));
}
const key = await workbook.inspect({ kind: "table", range: `요약!A1:H16`, include: "values,formulas", tableMaxRows: 20, tableMaxCols: 10, maxChars: 5000 });
console.log(key.ndjson);
const errors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 100 }, summary: "final formula error scan" });
console.log(errors.ndjson);
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(JSON.stringify({ outputPath, fileCount: rows.length, firstRow, lastRow }));
