import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "/Users/dongyoungko/Documents/AI_Hacker/outputs/019fc231-dd29-7ff2-bf0b-a2db2c8209ee";

const rows = [
  ["Edit.md", "요구사항·의사결정 기록", "사용자 요청, Codex 답변, 개발 범위와 우선순위 변경 내역을 누적 기록하는 프로젝트 대화 대장"],
  ["AI_Finance_Sec/README.md", "프로젝트 기본 안내", "초기 프로젝트 구조, 개발 환경, 실행 및 배포 관련 기본 설명"],
  ["AI_Finance_Sec/.gitignore", "형상관리 제외 규칙", "의존성, 빌드 결과물, 환경 변수 등 Git에 포함하지 않을 파일 패턴 정의"],
  ["AI_Finance_Sec/.openai/hosting.json", "Sites 배포 설정", "Codex Sites 프로젝트 ID와 D1·R2 논리 바인딩 설정"],
  ["AI_Finance_Sec/package.json", "프론트엔드 패키지 명세", "프로젝트 이름, 실행·빌드·테스트 명령어, 런타임 및 개발 의존성 정의"],
  ["AI_Finance_Sec/package-lock.json", "npm 의존성 잠금", "npm 기준 패키지 버전과 무결성 정보를 고정하여 동일 환경 재현"],
  ["AI_Finance_Sec/pnpm-lock.yaml", "pnpm 의존성 잠금", "pnpm 기준 패키지 버전과 의존성 트리를 고정하여 동일 환경 재현"],
  ["AI_Finance_Sec/pnpm-workspace.yaml", "pnpm 작업공간 설정", "pnpm 작업공간과 빌드 스크립트 승인 정책 등 패키지 관리 설정"],
  ["AI_Finance_Sec/tsconfig.json", "TypeScript 설정", "컴파일 대상, 모듈 해석, 경로 별칭, 타입 검사 범위 정의"],
  ["AI_Finance_Sec/next.config.ts", "Next.js 호환 설정", "Next.js/Vinext 애플리케이션의 프레임워크 설정 진입점"],
  ["AI_Finance_Sec/vite.config.ts", "Vite·Vinext 빌드 설정", "Sites 플러그인, React Server Components, Cloudflare 런타임 빌드 구성"],
  ["AI_Finance_Sec/postcss.config.mjs", "CSS 처리 설정", "Tailwind CSS를 포함한 PostCSS 처리 플러그인 설정"],
  ["AI_Finance_Sec/eslint.config.mjs", "코드 품질 설정", "TypeScript·React 코드의 정적 검사 규칙과 제외 경로 정의"],
  ["AI_Finance_Sec/drizzle.config.ts", "DB 마이그레이션 설정", "Drizzle ORM 스키마 위치와 마이그레이션 생성 설정"],
  ["AI_Finance_Sec/AI_Finance_Sec_Chatbot_Orchestration.ipynb", "챗봇 오케스트레이션 실행 소스", "Mock·OpenAI·Claude·Gemini·DeepSeek·Qwen 모델 선택, LangGraph State·병렬 Node·조건부 Edge·Tool binding·Compile·Memory·thread_id 멀티턴과 RAGAS 평가 입력을 한 파일에 구현"],
  ["AI_Finance_Sec/app/page.tsx", "메인 데모 화면", "사기 3종과 정상 Hard Negative, 모델 선택, 처리 단계, 통화·거래 결합, RAG 근거, 정탐·오탐, 멀티턴 채팅을 구현한 핵심 UI"],
  ["AI_Finance_Sec/app/lib/engine.ts", "탐지·검색·평가 엔진", "합성 시나리오, 규칙 탐지, 부정표현 처리, 거래결합, 경량 hybrid 검색·RRF, Mock 생성, Safety Verifier, 8개 회귀평가를 구현"],
  ["AI_Finance_Sec/app/api/chat/route.ts", "외부 모델 BYOK 라우터", "OpenAI Responses, DeepSeek·Qwen 호환 API, Anthropic Messages, Gemini API를 호출하고 키 비저장·no-store 응답을 적용"],
  ["AI_Finance_Sec/app/layout.tsx", "공통 레이아웃·메타데이터", "한국어 문서 구조, 폰트, 제목·설명, Open Graph 및 X 공유 메타데이터 설정"],
  ["AI_Finance_Sec/app/globals.css", "전역 디자인 스타일", "하나은행 CI 색감 기반 대시보드, 채팅, 위험 로그, 반응형 화면의 전체 CSS"],
  ["AI_Finance_Sec/app/chatgpt-auth.ts", "ChatGPT 인증 보조", "Sites 환경에서 ChatGPT 인증 컨텍스트를 처리하기 위한 스타터 인증 모듈"],
  ["AI_Finance_Sec/public/favicon.svg", "서비스 파비콘", "AI 금융 보안 비서를 나타내는 청록색 방패·체크 아이콘"],
  ["AI_Finance_Sec/public/og-ai-finance-sec.png", "소셜 공유 이미지", "금융 보안 방패와 거래 신호를 표현한 1200×630 Open Graph 대표 이미지"],
  ["AI_Finance_Sec/public/data/demo_scenarios.json", "합성 데모 데이터", "기관사칭·대출사기·가족빙자·정상 Hard Negative의 통화 및 거래 신호를 포함한 개인정보 없는 샘플"],
  ["AI_Finance_Sec/public/data/evaluation_cases.json", "회귀평가 데이터", "사기·정상 8개 합성 문장과 분류·RAGAS 평가 지표 정의"],
  ["AI_Finance_Sec/public/file.svg", "스타터 정적 아이콘", "현재 제품 UI에서는 사용하지 않는 초기 스타터 파일 아이콘"],
  ["AI_Finance_Sec/public/globe.svg", "스타터 정적 아이콘", "현재 제품 UI에서는 사용하지 않는 초기 스타터 지구본 아이콘"],
  ["AI_Finance_Sec/public/window.svg", "스타터 정적 아이콘", "현재 제품 UI에서는 사용하지 않는 초기 스타터 창 아이콘"],
  ["AI_Finance_Sec/build/sites-vite-plugin.ts", "Sites 빌드 플러그인", "Vinext 결과물을 Codex Sites/Cloudflare Worker 형식으로 패키징하는 빌드 지원 코드"],
  ["AI_Finance_Sec/worker/index.ts", "Cloudflare Worker 진입점", "배포 환경에서 애플리케이션 요청을 처리하는 서버 런타임 진입점"],
  ["AI_Finance_Sec/db/index.ts", "DB 연결 모듈", "Cloudflare D1과 Drizzle ORM을 연결하기 위한 데이터베이스 접근 진입점"],
  ["AI_Finance_Sec/db/schema.ts", "DB 스키마", "현재 기본 예제 테이블을 포함한 Drizzle 데이터 모델 정의"],
  ["AI_Finance_Sec/drizzle/meta/_journal.json", "DB 마이그레이션 이력", "Drizzle이 생성한 마이그레이션 순서와 메타정보 관리"],
  ["AI_Finance_Sec/examples/d1/app/api/notes/route.ts", "D1 API 예제", "D1 데이터베이스의 노트 생성·조회 방식을 보여주는 초기 참고용 API"],
  ["AI_Finance_Sec/examples/d1/db/schema.ts", "D1 스키마 예제", "D1과 Drizzle 스키마 작성 방식을 보여주는 초기 참고용 데이터 모델"],
  ["AI_Finance_Sec/tests/rendered-html.test.mjs", "렌더링·보안 회귀 테스트", "배포 HTML 핵심 기능, API 키 누락 거부, 브라우저 저장소·서버 로그 미사용을 검증하는 자동 테스트"],
  ["AI_Finance_Sec_아키텍처_및_실행가이드_Notion.md", "Notion 복붙용 기술 문서", "P0/P1 범위, 멀티 모델 선택, RAG·LLM·State·Graph 처리 과정, 샘플 거래 탐지, 목표 파일 구조와 실행 명령을 정리한 Markdown"],
  ["docs/데이터셋_조사_및_활용계획.md", "공개 데이터 조사", "금융보안원 AIxData, ULB, IEEE-CIS, PaySim, Fraud Detection Handbook 등 후보의 접근성·용도·주의점을 정리"],
  ["docs/모델_선정_근거.md", "모델 선정 의사결정", "Mock 기본, DeepSeek V4 Flash 실호출 권고, GPT-5.6 Terra 고신뢰 대안, Qwen 내부망 후보 및 임베딩·리랭커 선정 근거"],
  ["docs/RAG_평가_및_분석에이전트_설계.md", "RAG·평가 아키텍처", "hybrid 검색·RRF·cross-encoder 도입 기준, RAGAS 오프라인 평가, 런타임 Safety Verifier와 정탐·오탐 평가 구조"],
  ["submission/2026_금융_AI_Challenge_기획서_완성본.md", "제출용 상세 기획서", "문제·차별성·데이터·생성형 AI·평가·기대효과·한계를 심사 문맥에 맞춰 정리한 Markdown 제출본"],
  ["submission/2026_금융_AI_Challenge_MVP_기술명세서_완성본.md", "제출용 MVP 기술명세", "구현 범위, 기능목록, State·Node·Edge, 모델 라우터, RAG, 평가, 소스, 검증 방법과 한계를 정리"],
  ["submission/AI_Finance_Sec_데모_운영가이드.md", "심사·영상 데모 가이드", "Mock 및 실제 BYOK 시연 순서, 3분 영상 구성, 로컬 실행과 장애 대응 절차"],
  ["submission/(제출본) 2026 금융 AI Challenge 기획서_AI_Finance_Sec.hwpx", "공모전 양식 기획서", "주최측 HWPX 양식의 항목을 AI_Finance_Sec 내용으로 채운 제출본; 팀 정보와 URL 최종 확인 필요"],
  ["submission/(제출본) 2026 금융 AI Challenge 기능명세서_AI_Finance_Sec.hwpx", "공모전 양식 기능명세", "주최측 HWPX 양식에 실제 구현 기능·사용 흐름·AI 처리·검증 방법을 채운 제출본"],
  ["output/pdf/AI_Finance_Sec_전체프로세스_플로우차트.pdf", "전체 프로세스 도식", "1페이지 전체 챗봇 흐름과 2페이지 백그라운드 탐지 시스템을 구분해 표현한 2페이지 가로형 PDF"],
];

const firstDataRow = 5;
const lastDataRow = firstDataRow + rows.length - 1;

const workbook = Workbook.create();
const sheet = workbook.worksheets.add("파일 관리 대장");
sheet.showGridLines = false;

sheet.getRange("A1:C1").merge();
sheet.getRange("A1").values = [["AI_Finance_Sec 파일 관리 목록 대장"]];
sheet.getRange("A1:C1").format = {
  fill: "#009275",
  font: { bold: true, color: "#FFFFFF", size: 16 },
  verticalAlignment: "center",
};
sheet.getRange("A2:C2").merge();
sheet.getRange("A2").values = [["형상관리 대상 파일의 목적과 세부내용을 확인하기 위한 기준 대장"]];
sheet.getRange("A2:C2").format = {
  fill: "#EAF6F4",
  font: { color: "#365F57", size: 10 },
  verticalAlignment: "center",
};

sheet.getRange("A4:C4").values = [["파일명", "파일 목적", "세부내용"]];
sheet.getRange(`A${firstDataRow}:C${lastDataRow}`).values = rows;

sheet.getRange("A4:C4").format = {
  fill: "#163832",
  font: { bold: true, color: "#FFFFFF" },
  verticalAlignment: "center",
  borders: { preset: "outside", style: "thin", color: "#163832" },
};
sheet.getRange(`A${firstDataRow}:C${lastDataRow}`).format = {
  font: { color: "#243E39", size: 10 },
  verticalAlignment: "top",
  wrapText: true,
  borders: { insideHorizontal: { style: "thin", color: "#DDE9E6" }, bottom: { style: "thin", color: "#C9DCD7" } },
};
sheet.getRange(`A${firstDataRow}:A${lastDataRow}`).format.font = { color: "#006B59", size: 10 };
sheet.getRange(`B${firstDataRow}:B${lastDataRow}`).format.font = { bold: true, color: "#243E39", size: 10 };

sheet.getRange("A1:C1").format.rowHeight = 32;
sheet.getRange("A2:C2").format.rowHeight = 24;
sheet.getRange("A4:C4").format.rowHeight = 28;
sheet.getRange(`A${firstDataRow}:C${lastDataRow}`).format.rowHeight = 38;
sheet.getRange("A:A").format.columnWidth = 42;
sheet.getRange("B:B").format.columnWidth = 25;
sheet.getRange("C:C").format.columnWidth = 76;
sheet.freezePanes.freezeRows(4);

const table = sheet.tables.add(`A4:C${lastDataRow}`, true, "FileManagementLedger");
table.style = "TableStyleMedium2";
table.showBandedColumns = false;
table.showFilterButton = true;

await fs.mkdir(outputDir, { recursive: true });
const preview = await workbook.render({ sheetName: "파일 관리 대장", range: `A1:C${lastDataRow}`, scale: 1, format: "png" });
await fs.writeFile(`${outputDir}/파일관리목록대장_미리보기.png`, new Uint8Array(await preview.arrayBuffer()));

const inspection = await workbook.inspect({
  kind: "table",
  range: `파일 관리 대장!A1:C${lastDataRow}`,
  include: "values,formulas",
  tableMaxRows: rows.length + 5,
  tableMaxCols: 3,
  maxChars: 10000,
});
console.log(inspection.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 50 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(`${outputDir}/AI_Finance_Sec_파일관리목록대장.xlsx`);
