// Windows 전용 vinext 패치 — `npm install` 후 postinstall로 자동 실행된다.
//
// 문제: `vinext start`(프로덕션 서버)가 Windows에서 하위 디렉터리 정적 자산을
//       전부 404로 응답한다. `/assets/*.js`, `/data/*.json`, `/assets/*.css`가
//       모두 안 붙어 화면이 통째로 깨진다.
//
// 원인: node_modules/vinext/dist/server/static-file-cache.js 의 walkFilesWithStats가
//       `path.relative(base, file)` 결과를 그대로 URL 키로 쓴다. Windows에서는
//       "assets\\index.js" 처럼 역슬래시가 섞여 "/assets\\index.js" 로 색인되고,
//       요청 경로 "/assets/index.js"(슬래시)와 영원히 매칭되지 않는다.
//       구분자가 없는 루트 파일만 우연히 맞아 통과한다.
//       (prod-server.js 요청 측은 이미 `replaceAll("\\","/")`로 정규화한다.)
//
// 조치: 색인 시 경로 구분자를 POSIX 슬래시로 정규화한다. 한 줄이면 되고
//       ".vite/" 스킵, "assets/" 해시자산 판별, "/index.html" 처리까지 함께 고쳐진다.
//       node_modules 직접 수정은 재설치 시 사라지므로 이 스크립트를 postinstall에 건다.
//
// macOS·Linux에서는 path.sep === "/" 라 replace가 no-op이고, 이미 패치돼 있으면
// 아무것도 하지 않는다(멱등). 실패해도 설치를 막지 않도록 exit 0.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const target = path.join(
  root,
  "node_modules",
  "vinext",
  "dist",
  "server",
  "static-file-cache.js",
);

const NEEDLE = "relativePath: path.relative(base, batch[j]),";
const PATCHED = 'relativePath: path.relative(base, batch[j]).split(path.sep).join("/"),';

function main() {
  let src;
  try {
    src = readFileSync(target, "utf8");
  } catch {
    console.log("[patch-vinext] vinext 미설치 — 건너뜀");
    return;
  }

  if (src.includes(PATCHED)) {
    console.log("[patch-vinext] 이미 적용됨");
    return;
  }

  if (!src.includes(NEEDLE)) {
    console.warn(
      "[patch-vinext] 대상 코드를 찾지 못함 — vinext 버전이 바뀌었을 수 있다. " +
        "static-file-cache.js 의 walkFilesWithStats 경로 정규화를 직접 확인하라.",
    );
    return;
  }

  writeFileSync(target, src.replace(NEEDLE, PATCHED), "utf8");
  console.log("[patch-vinext] Windows 정적 자산 경로 버그 패치 적용 완료");
}

main();
