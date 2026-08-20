import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "/Users/dongyoungko/Documents/AI_Hacker/outputs/019fc231-dd29-7ff2-bf0b-a2db2c8209ee/AI_Finance_Sec_파일관리목록대장.xlsx";
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
const summary = await workbook.inspect({ kind: "workbook,sheet,table", maxChars: 12000, tableMaxRows: 12, tableMaxCols: 12, tableMaxCellChars: 120 });
console.log(summary.ndjson);
for (const sheet of workbook.worksheets.items) {
  const preview = await workbook.render({ sheetName: sheet.name, autoCrop: "all", scale: 1.4, format: "png" });
  await fs.writeFile(`/Users/dongyoungko/Documents/AI_Hacker/tmp/file_inventory_20260816/existing-${sheet.name}.png`, new Uint8Array(await preview.arrayBuffer()));
}
