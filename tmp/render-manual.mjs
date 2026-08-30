// 데모 실행 매뉴얼 HTML -> PDF 렌더.
// playwright-core는 저장소에 두지 않고 임시 디렉터리에 설치해 쓴다.
//   npm install playwright-core --prefix <scratch>
//   node tmp/render-manual.mjs <playwright-core 경로>
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const coreDir = process.argv[2] ?? "playwright-core";
const isPath = coreDir.startsWith(".") || path.isAbsolute(coreDir) || /^[A-Za-z]:/.test(coreDir);
const { chromium } = await import(isPath ? pathToFileURL(path.join(coreDir, "index.mjs")).href : coreDir);

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.join(root, "tmp", "데모_실행매뉴얼.html");
const output = path.join(root, "output", "pdf", "AI_Finance_Sec_데모_실행매뉴얼.pdf");

const executablePath = process.env.CHROME_PATH
  ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage();
await page.goto(pathToFileURL(source).href, { waitUntil: "networkidle" });
await page.pdf({
  path: output,
  format: "A4",
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: "<div></div>",
  footerTemplate:
    '<div style="width:100%;font-size:7pt;color:#8a9693;padding:0 14mm;'
    + 'font-family:Malgun Gothic,sans-serif;display:flex;justify-content:space-between">'
    + "<span>AI_Finance_Sec 데모 실행 매뉴얼</span>"
    + '<span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
  margin: { top: "16mm", bottom: "18mm", left: "14mm", right: "14mm" },
});
await browser.close();
console.log(`PDF 생성 완료: ${output}`);
