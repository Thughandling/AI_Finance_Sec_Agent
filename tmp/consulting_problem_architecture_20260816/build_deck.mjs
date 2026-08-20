import fs from "node:fs/promises";
import path from "node:path";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const OUT = "/Users/dongyoungko/Documents/AI_Hacker/tmp/consulting_problem_architecture_20260816/output";
const PPTX = "/Users/dongyoungko/Documents/AI_Hacker/presentation/AI_Finance_Sec_문제정의_시스템설계_컨설팅장표.pptx";
const W = 1280, H = 720;
const C = {
  ink: "#101828", sub: "#475467", muted: "#667085", line: "#D0D5DD",
  paper: "#F8FAFC", white: "#FFFFFF", teal: "#008C73", teal2: "#CDEFE7",
  navy: "#17324D", red: "#D64545", amber: "#F4B740", green: "#1E8E65",
  blue: "#3977D3", paleBlue: "#EAF1FB", paleRed: "#FDECEC", paleAmber: "#FFF4D6",
};
const FONT = "Noto Sans KR";

async function writeBlob(file, blob) { await fs.writeFile(file, new Uint8Array(await blob.arrayBuffer())); }

function addShape(slide, geometry, position, fill = C.white, line = C.line, radius = "rounded-lg") {
  const config = { geometry, position, fill, line: { style: "solid", fill: line, width: 1 } };
  if (radius && radius !== "none") config.borderRadius = radius;
  return slide.shapes.add(config);
}

function addText(slide, text, position, opts = {}) {
  const s = slide.shapes.add({ geometry: "textbox", position, fill: "none", line: { style: "solid", fill: "none", width: 0 } });
  s.text = text;
  s.text.style = {
    fontSize: opts.size ?? 20,
    bold: opts.bold ?? false,
    color: opts.color ?? C.ink,
    typeface: FONT,
    alignment: opts.align ?? "left",
    verticalAlignment: opts.vAlign ?? "top",
    autoFit: "shrinkText",
    wrap: "square",
    insets: opts.insets ?? { left: 2, right: 2, top: 2, bottom: 2 },
  };
  return s;
}

function boxText(slide, text, position, opts = {}) {
  const s = addShape(slide, opts.geometry ?? "roundRect", position, opts.fill ?? C.white, opts.line ?? C.line, opts.radius ?? "rounded-xl");
  s.text = text;
  s.text.style = {
    fontSize: opts.size ?? 18,
    bold: opts.bold ?? false,
    color: opts.color ?? C.ink,
    typeface: FONT,
    alignment: opts.align ?? "center",
    verticalAlignment: opts.vAlign ?? "middle",
    autoFit: "shrinkText",
    wrap: "square",
    insets: opts.insets ?? { left: 12, right: 12, top: 8, bottom: 8 },
  };
  return s;
}

function header(slide, no, title, kicker) {
  slide.background.fill = C.paper;
  addText(slide, String(no).padStart(2, "0"), { left: 52, top: 42, width: 48, height: 28 }, { size: 14, bold: true, color: C.teal });
  addText(slide, kicker, { left: 108, top: 42, width: 330, height: 28 }, { size: 13, bold: true, color: C.muted });
  addText(slide, title, { left: 52, top: 76, width: 1170, height: 62 }, { size: 31, bold: true, color: C.ink });
  const l = addShape(slide, "rect", { left: 52, top: 142, width: 1176, height: 2 }, C.line, C.line, "none");
  return l;
}

function foot(slide, text = "AI_Finance_Sec · 2026.08.16 · 문제정의/시스템설계") {
  addText(slide, text, { left: 52, top: 684, width: 900, height: 18 }, { size: 10, color: C.muted });
}

function notes(slide, lines, sources = []) {
  const body = [...lines, "", "[Sources]", ...sources.map(s => `- ${s}`), "[/Sources]"].join("\n");
  slide.speakerNotes.textFrame.setText(body);
  slide.speakerNotes.setVisible(true);
}

function connect(slide, a, b, opts = {}) {
  return slide.shapes.connect(a, b, {
    kind: opts.kind ?? "straight", fromSide: opts.from ?? "right", toSide: opts.to ?? "left",
    line: { style: opts.dashed ? "dashed" : "solid", fill: opts.color ?? C.muted, width: opts.width ?? 2 },
    tail: { type: "triangle", width: "sm", length: "sm" },
  });
}

function pill(slide, text, x, y, w, fill = C.teal2, color = C.teal) {
  return boxText(slide, text, { left: x, top: y, width: w, height: 30 }, { fill, line: fill, color, size: 14, bold: true, radius: "rounded-full" });
}

const deck = Presentation.create({ slideSize: { width: W, height: H } });

// 1 Cover
{
  const s = deck.slides.add(); s.background.fill = C.navy;
  addShape(s, "rect", { left: 0, top: 0, width: 18, height: H }, C.teal, C.teal, "none");
  pill(s, "2026 금융 AI Challenge · CONSULTING DECK", 74, 70, 325, "#24445F", C.teal2);
  addText(s, "송금 직전,\n고객은 왜 멈추지 못하는가", { left: 74, top: 150, width: 720, height: 190 }, { size: 52, bold: true, color: C.white });
  addText(s, "AI_Finance_Sec", { left: 74, top: 382, width: 480, height: 48 }, { size: 28, bold: true, color: C.teal2 });
  addText(s, "문제 정의와 시스템 설계", { left: 74, top: 430, width: 560, height: 44 }, { size: 23, color: "#D0DDE7" });
  const q = boxText(s, "위험 신호를\n‘멈춤·확인·신고’ 행동으로", { left: 850, top: 178, width: 330, height: 240 }, { fill: "#173B4B", line: C.teal, color: C.white, size: 28, bold: true });
  addText(s, "현재 합성 MVP와 목표 POC 구조를 구분해 설명합니다.", { left: 74, top: 602, width: 800, height: 36 }, { size: 16, color: "#B9C8D4" });
  notes(s, ["발표의 질문은 기술이 아니라 고객의 마지막 의사결정이다.", "이 자료는 문제정의와 시스템설계만 다룬다."], ["https://daker.ai/public/hackathons/2026-finance-ai-challenge"]);
}

// 2 Scale
{
  const s = deck.slides.add(); header(s, 2, "피해액은 줄었지만, 고객의 ‘마지막 판단’ 문제는 남아 있다", "01 · PROBLEM SCALE");
  addText(s, "보이스피싱 피해액", { left: 64, top: 180, width: 260, height: 30 }, { size: 17, bold: true, color: C.sub });
  const baseY = 552, barW = 235;
  const vals = [3243, 6421, 2225], max = 7000;
  const labels = ["2024 상반기", "2025 상반기", "2026년 1~4월"];
  const fills = [C.paleBlue, C.red, C.teal];
  const xs = [100, 390, 680];
  vals.forEach((v, i) => {
    const h = 280 * v / max;
    addShape(s, "roundRect", { left: xs[i], top: baseY - h, width: barW, height: h }, fills[i], fills[i], "rounded-lg");
    addText(s, `${v.toLocaleString()}억`, { left: xs[i], top: baseY - h - 44, width: barW, height: 36 }, { size: 27, bold: true, color: i === 1 ? C.red : C.ink, align: "center" });
    addText(s, labels[i], { left: xs[i], top: baseY + 14, width: barW, height: 30 }, { size: 15, color: C.sub, align: "center" });
  });
  boxText(s, "+98.1%", { left: 548, top: 208, width: 135, height: 42 }, { fill: C.paleRed, line: C.paleRed, color: C.red, size: 16, bold: true, radius: "rounded-full" });
  const insight = boxText(s, "핵심 해석\n\n범정부 대응으로 2026년 1~4월 피해액은 전년 동기 대비 48% 감소했습니다.\n\n그러나 공격자는 통화·문자·앱·거래를 조합하며, 고객은 압박 속에서 ‘지금 무엇을 해야 하는가’를 판단해야 합니다.", { left: 960, top: 180, width: 250, height: 390 }, { fill: C.white, line: C.line, color: C.ink, size: 18, align: "left", vAlign: "top", insets: { left: 22, right: 22, top: 22, bottom: 18 } });
  foot(s); notes(s, ["통계는 서비스 성과가 아니라 문제의 규모를 보여주는 근거다.", "2026 수치는 1~4월이므로 상반기 수치와 직접 비교하지 않는다."], ["https://www.police.go.kr/user/bbs/BD_selectBbs.do?q_bbsCode=1007&q_bbscttSn=20260526143737248&q_currPage=1&q_rowPerPage=12&q_sortName=&q_sortOrder=&q_tab="]);
}

// 3 Journey
{
  const s = deck.slides.add(); header(s, 3, "피해는 ‘행동 전환 실패’에서 완성된다", "01 · USER JOURNEY");
  const items = [
    ["01", "신뢰 획득", "기관·가족·금융사\n정교한 사칭", C.paleBlue, C.blue],
    ["02", "심리적 고립", "비밀·긴급성·처벌\n통화 유지 압박", C.paleAmber, "#9A6700"],
    ["03", "행동 요구", "송금·앱 설치·\n인증정보 전달", C.paleRed, C.red],
    ["04", "판단 공백", "경고 이유와\n확인 절차 부재", "#ECEAFE", "#5B4BB7"],
    ["05", "피해 인지", "이체 후 뒤늦게\n상담·지급정지", C.teal2, C.teal],
  ];
  const nodes=[];
  items.forEach((it,i)=>nodes.push(boxText(s, `${it[0]}\n${it[1]}\n\n${it[2]}`, { left: 62+i*240, top: 220, width: 190, height: 230 }, { fill: it[3], line: it[4], color: C.ink, size: 19, bold: i===3 })));
  for(let i=0;i<nodes.length-1;i++) connect(s,nodes[i],nodes[i+1],{color:C.sub});
  boxText(s, "개입 지점", { left: 760, top: 177, width: 150, height: 34 }, { fill: C.navy, line: C.navy, color: C.white, size: 14, bold: true });
  addText(s, "AI_Finance_Sec는 ④에서 위험 이유를 설명하고, ⑤ 이전에 공식 재확인 행동을 제안한다.", { left: 160, top: 520, width: 960, height: 56 }, { size: 25, bold: true, color: C.navy, align: "center" });
  foot(s); notes(s, ["핵심은 새로운 탐지기를 하나 더 만드는 것이 아니다.", "탐지 신호를 고객의 즉시 행동으로 바꾸는 접점이 서비스의 포지션이다."], ["https://daker.ai/public/hackathons/2026-finance-ai-challenge"]);
}

// 4 Root cause
{
  const s = deck.slides.add(); header(s, 4, "현재 대응은 강하지만, 고객 접점에서는 서로 분리되어 있다", "01 · ROOT CAUSE");
  const left = [
    ["통신·단말 탐지", "통화·문자·앱의 이상 징후"],
    ["금융회사 FDS", "거래·계좌·단말의 이상 징후"],
    ["예방 교육", "사전에 학습하는 일반 행동수칙"],
    ["기관 신고·조치", "피해 인지 후 상담·지급정지"],
  ];
  left.forEach((x,i)=>{
    boxText(s, x[0], { left: 66, top: 186+i*96, width: 220, height: 66 }, { fill:C.white,line:C.line,color:C.navy,size:18,bold:true });
    addText(s, x[1], { left: 310, top: 198+i*96, width: 350, height: 44 }, { size:16,color:C.sub });
  });
  const gap = boxText(s, "결정의 공백\n\n왜 위험한가?\n지금 무엇을 멈출까?\n어디서 다시 확인할까?", { left: 760, top: 190, width: 390, height: 350 }, { fill:C.paleRed,line:C.red,color:C.ink,size:25,bold:true });
  connect(s, boxText(s,"분리된 신호",{left:630,top:314,width:105,height:78},{fill:C.paper,line:C.line,color:C.sub,size:14,bold:true}), gap,{color:C.red});
  addText(s, "AI_Finance_Sec의 역할", { left: 760, top: 565, width: 390, height: 28 }, { size:16,bold:true,color:C.teal,align:"center" });
  addText(s, "기존 탐지·조치를 대체하지 않고, 설명과 재확인을 잇는 고객 행동 계층", { left: 700, top: 596, width: 510, height: 48 }, { size:20,bold:true,color:C.navy,align:"center" });
  foot(s); notes(s, ["FDS나 통신 탐지의 기능 부족을 주장하지 않는다.", "여러 시스템의 신호가 고객의 행동으로 번역되는 접점 공백을 문제로 정의한다."], []);
}

// 5 Position
{
  const s = deck.slides.add(); header(s, 5, "해결 가설: ‘통합 판단 → 짧은 설명 → 승인된 행동’", "02 · SERVICE POSITION");
  const xs=[70,370,670,970], titles=["SIGNAL","DECISION","EXPLANATION","ACTION"], subs=["통화·거래 정황","보수적 위험판정","이유·근거 표시","중단·확인·신고 안내"], colors=[C.paleBlue,C.paleAmber,C.teal2,C.paleRed], lines=[C.blue,C.amber,C.teal,C.red];
  const ns=[];
  for(let i=0;i<4;i++) ns.push(boxText(s, `${titles[i]}\n\n${subs[i]}`, { left:xs[i],top:230,width:220,height:190 }, { fill:colors[i],line:lines[i],color:C.ink,size:23,bold:true }));
  for(let i=0;i<3;i++) connect(s,ns[i],ns[i+1],{color:C.navy});
  addText(s,"검증할 사업 가설",{left:80,top:500,width:220,height:28},{size:17,bold:true,color:C.teal});
  addText(s,"단순 경고보다 ‘왜 위험한지 + 무엇을 할지’를 함께 제시하면 모의 송금 중단과 공식 재확인 행동이 개선된다.",{left:80,top:540,width:1110,height:66},{size:28,bold:true,color:C.navy});
  foot(s); notes(s,["효과를 이미 달성했다고 주장하지 않는다.","현재 합성 MVP와 향후 POC에서 이 행동 가설을 검증한다."],[]);
}

// 6 Principles/scope
{
  const s = deck.slides.add(); header(s, 6, "설계의 출발점은 ‘정확도’만이 아니라 안전 경계다", "02 · DESIGN PRINCIPLES");
  const cards=[
    ["01","보수적 판정","규칙·모델 불일치나 저신뢰는 ‘안전’이 아니라 최소 ‘주의’"],
    ["02","역할 분리","위험판정·근거선택·행동정책·안전검증을 별도 Node로"],
    ["03","허용 문구","최종 답변은 서버 행동 allowlist로 제한"],
    ["04","외부조치 경계","신고·지급정지는 안내만 하며 자동 실행하지 않음"],
  ];
  cards.forEach((c,i)=>{
    pill(s,c[0],70+i*300,190,58,C.navy,C.white);
    boxText(s,`${c[1]}\n\n${c[2]}`,{left:70+i*300,top:232,width:260,height:250},{fill:C.white,line:i===0?C.teal:C.line,color:C.ink,size:20,bold:true,align:"left",vAlign:"top",insets:{left:18,right:18,top:20,bottom:12}});
  });
  const y=548;
  boxText(s,"현재 MVP",{left:70,top:y,width:220,height:46},{fill:C.teal,line:C.teal,color:C.white,size:17,bold:true});
  addText(s,"합성 입력 · 로컬 Qwen · 정적 KB · 프로세스 메모리",{left:310,top:y+4,width:840,height:36},{size:18,color:C.sub});
  boxText(s,"POC / P2",{left:70,top:y+58,width:220,height:46},{fill:C.white,line:C.line,color:C.navy,size:17,bold:true});
  addText(s,"동의 기반 실제 신호 · 금융회사 연계 · 승인 지식 · 영속/감사 체계",{left:310,top:y+62,width:840,height:36},{size:18,color:C.sub});
  foot(s); notes(s,["현재와 미래 구조를 한 그림에서 혼합하지 않는다.","현재 MVP에는 실제 개인정보·실시간 거래 스트림이 없다."],[]);
}

// 7 Context diagram
{
  const s = deck.slides.add(); header(s, 7, "현재 MVP는 세 가지 실행 경로를 명확히 분리한다", "03 · SYSTEM CONTEXT");
  const ui=boxText(s,"브라우저 UI\nNext.js",{left:70,top:285,width:190,height:120},{fill:C.navy,line:C.navy,color:C.white,size:23,bold:true});
  const mock=boxText(s,"Mock 경로\nTS 규칙·정적 RAG\n네트워크 없음",{left:365,top:165,width:245,height:130},{fill:C.paleBlue,line:C.blue,color:C.ink,size:19,bold:true});
  const local=boxText(s,"Local Ollama 경로\nNext API → FastAPI\nCompiled LangGraph",{left:365,top:330,width:245,height:150},{fill:C.teal2,line:C.teal,color:C.ink,size:19,bold:true});
  const cloud=boxText(s,"Cloud BYOK 경로\nProvider API 직접 프록시\nLangGraph 미사용",{left:365,top:515,width:245,height:125},{fill:C.paleAmber,line:C.amber,color:C.ink,size:19,bold:true});
  const graph=boxText(s,"FastAPI :8000\nLangGraph\nQwen2.5:7b × 최대 2회",{left:760,top:322,width:260,height:165},{fill:C.white,line:C.teal,color:C.navy,size:22,bold:true});
  const ollama=boxText(s,"Ollama :11434",{left:1080,top:360,width:145,height:90},{fill:C.navy,line:C.navy,color:C.white,size:18,bold:true});
  connect(s,ui,mock,{kind:"elbow",from:"right",to:"left",color:C.blue}); connect(s,ui,local,{color:C.teal}); connect(s,ui,cloud,{kind:"elbow",from:"right",to:"left",color:C.amber}); connect(s,local,graph,{color:C.teal}); connect(s,graph,ollama,{color:C.navy});
  pill(s,"합성 데이터",70,205,140,C.paleRed,C.red);
  foot(s); notes(s,["Cloud BYOK는 FastAPI/LangGraph와 다른 경로다.","공개 배포 URL에서 사용자의 localhost Ollama에는 접근할 수 없어 Mock fallback이 발생한다."],["/Users/dongyoungko/Documents/AI_Hacker/AI_Finance_Sec/app/api/chat/route.ts","/Users/dongyoungko/Documents/AI_Hacker/AI_Finance_Sec/backend/main.py"]);
}

// 8 Full flow
{
  const s = deck.slides.add(); header(s, 8, "전체 플로우: 입력부터 안전 응답까지 하나의 State로 연결", "03 · END-TO-END FLOW");
  const topY=190, h=72, w=135, gap=22, x0=42;
  const a=boxText(s,"사용자 입력\n+ session_id",{left:x0,top:topY,width:w,height:h},{fill:C.navy,line:C.navy,color:C.white,size:16,bold:true});
  const b=boxText(s,"Next API\n/api/chat",{left:x0+(w+gap),top:topY,width:w,height:h},{fill:C.white,line:C.line,color:C.ink,size:16,bold:true});
  const c=boxText(s,"FastAPI\nvalidation",{left:x0+2*(w+gap),top:topY,width:w,height:h},{fill:C.white,line:C.line,color:C.ink,size:16,bold:true});
  const d=boxText(s,"prepare_input\n사건 State",{left:x0+3*(w+gap),top:topY,width:w,height:h},{fill:C.teal2,line:C.teal,color:C.ink,size:16,bold:true});
  const e=boxText(s,"structured\nrisk agent",{left:x0+4*(w+gap),top:topY,width:w,height:h},{fill:C.paleAmber,line:C.amber,color:C.ink,size:16,bold:true});
  const f=boxText(s,"내부 처리\nQwen JSON + fusion",{left:x0+5*(w+gap),top:topY,width:w,height:h},{fill:C.paleRed,line:C.red,color:C.ink,size:15,bold:true});
  const g=boxText(s,"finalize\nUI 응답",{left:1120,top:565,width:115,height:72},{fill:C.navy,line:C.navy,color:C.white,size:15,bold:true});
  [ [a,b],[b,c],[c,d],[d,e],[e,f] ].forEach(([p,q])=>connect(s,p,q,{color:C.sub}));
  const know=boxText(s,"knowledge_agent\nTop3 / fallback",{left:660,top:350,width:190,height:90},{fill:C.paleBlue,line:C.blue,color:C.ink,size:17,bold:true});
  const policy=boxText(s,"policy_agent\naction allowlist",{left:660,top:480,width:190,height:90},{fill:C.teal2,line:C.teal,color:C.ink,size:17,bold:true});
  const gen=boxText(s,"ollama_generate\nQwen 자유문 검사\n→ 자유문 폐기",{left:915,top:380,width:190,height:120},{fill:C.paleAmber,line:C.amber,color:C.ink,size:17,bold:true});
  const safe=boxText(s,"guarded_policy\n+ safety_verifier",{left:915,top:540,width:190,height:96},{fill:C.paleRed,line:C.red,color:C.ink,size:17,bold:true});
  connect(s,f,know,{kind:"elbow",from:"bottom",to:"top",color:C.blue}); connect(s,f,policy,{kind:"elbow",from:"bottom",to:"top",color:C.teal}); connect(s,know,gen,{kind:"elbow",color:C.sub}); connect(s,policy,gen,{kind:"elbow",color:C.sub}); connect(s,gen,safe,{from:"bottom",to:"top",color:C.red}); connect(s,safe,g,{color:C.navy});
  addText(s,"LangGraph compiled workflow · knowledge와 policy만 병렬",{left:70,top:615,width:720,height:30},{size:16,bold:true,color:C.teal});
  foot(s); notes(s,["실제 Edge: START→prepare_input→structured_risk_agent→(knowledge_agent ∥ policy_agent)→ollama_generate→safety_verifier→finalize→END.","Qwen 자유문은 초기 안전성 측정에만 쓰고 최종 노출 문구에는 사용하지 않는다."],["/Users/dongyoungko/Documents/AI_Hacker/AI_Finance_Sec/backend/app/graph.py"]);
}

// 9 State/Node/Edge
{
  const s = deck.slides.add(); header(s, 9, "State·Node·Edge·Compile이 멀티턴 실행을 만든다", "03 · LANGGRAPH DESIGN");
  const state=boxText(s,"ChatState\n\nmessages / user_input\nincident_summary / status\nrule_risk / structured_risk\ndocuments / policy\ndraft / final / safety\ntrace / turn_count",{left:65,top:185,width:315,height:390},{fill:C.navy,line:C.navy,color:C.white,size:20,bold:true,align:"left",vAlign:"top",insets:{left:24,right:16,top:22,bottom:14}});
  const nodes=boxText(s,"Nodes\n\nprepare_input\nstructured_risk_agent\nknowledge_agent ∥ policy_agent\nollama_generate\nsafety_verifier\nfinalize",{left:455,top:185,width:335,height:300},{fill:C.white,line:C.teal,color:C.ink,size:21,bold:true,align:"left",vAlign:"top",insets:{left:24,right:16,top:22,bottom:14}});
  const comp=boxText(s,"Compile + Memory\n\nworkflow.compile(\n  checkpointer=InMemorySaver()\n)\n\nthread_id = session_id\n프로세스 종료 시 소멸",{left:860,top:185,width:350,height:300},{fill:C.teal2,line:C.teal,color:C.ink,size:21,bold:true,align:"left",vAlign:"top",insets:{left:24,right:16,top:22,bottom:14}});
  connect(s,state,nodes,{color:C.teal}); connect(s,nodes,comp,{color:C.teal});
  boxText(s,"정정·예문·새 주제 → incident closed/reset",{left:455,top:520,width:335,height:62},{fill:C.paleAmber,line:C.amber,color:C.ink,size:16,bold:true});
  boxText(s,"DB 영속화·사용자 계정 연결·암호화는 P2",{left:860,top:520,width:350,height:62},{fill:C.paleRed,line:C.red,color:C.ink,size:16,bold:true});
  foot(s); notes(s,["조건부 Edge나 ToolNode는 없다.","멀티턴은 session_id 기반 프로세스 내 체크포인트이며 영구 메모리가 아니다."],["/Users/dongyoungko/Documents/AI_Hacker/AI_Finance_Sec/backend/app/graph.py"]);
}

// 10 decision
{
  const s = deck.slides.add(); header(s, 10, "위험판정은 규칙과 Qwen 구조화 결과를 보수적으로 결합한다", "03 · DECISION LOGIC");
  const rule=boxText(s,"결정론 규칙\n\nknown-pattern\n완료 행동·정상 맥락\n점수·위험유형",{left:75,top:210,width:260,height:220},{fill:C.paleBlue,line:C.blue,color:C.ink,size:21,bold:true});
  const llm=boxText(s,"Qwen JSON\n\nstate / risk_type\naction / destination\nconfidence / evidence",{left:75,top:460,width:260,height:180},{fill:C.paleAmber,line:C.amber,color:C.ink,size:20,bold:true});
  const fusion=boxText(s,"Conservative Fusion\n\n피해완료 → 위험 75+\nfraud & conf≥.75 → 위험 70+\n저신뢰·불일치 → 최소 주의 40+",{left:500,top:285,width:350,height:260},{fill:C.teal2,line:C.teal,color:C.ink,size:22,bold:true});
  const out=boxText(s,"최종 Risk State\n\nscore · level · verdict\nrisk_type · evidence\nalready_transferred",{left:965,top:310,width:250,height:210},{fill:C.navy,line:C.navy,color:C.white,size:21,bold:true});
  connect(s,rule,fusion,{kind:"elbow",color:C.blue}); connect(s,llm,fusion,{kind:"elbow",color:C.amber}); connect(s,fusion,out,{color:C.teal});
  boxText(s,"Qwen 실패/JSON 오류 → rule_fallback",{left:470,top:584,width:410,height:44},{fill:C.paleRed,line:C.paleRed,color:C.red,size:16,bold:true,radius:"rounded-full"});
  foot(s); notes(s,["Qwen은 자유문이 아니라 엄격한 JSON 스키마로 위험판정에 기여한다.","이 구조는 오분류를 제거하지 않는다. 불확실성을 안전 판정으로 내리는 위험을 줄이는 설계다."],["/Users/dongyoungko/Documents/AI_Hacker/AI_Finance_Sec/backend/app/graph.py"]);
}

// 11 RAG/safety
{
  const s = deck.slides.add(); header(s, 11, "근거 선택과 최종 행동문을 분리해 생성 위험을 제한한다", "03 · RAG & SAFETY");
  addText(s,"근거 선택",{left:70,top:180,width:200,height:30},{size:18,bold:true,color:C.blue});
  const q=boxText(s,"query + risk_type",{left:70,top:230,width:190,height:70},{fill:C.paleBlue,line:C.blue,color:C.ink,size:16,bold:true});
  const kb=boxText(s,"정적 요약 KB 11건\n위험유형 필터",{left:320,top:230,width:210,height:70},{fill:C.white,line:C.line,color:C.ink,size:16,bold:true});
  const rr=boxText(s,"lexical/bigram\n+ RRF 유사 결합",{left:590,top:230,width:210,height:70},{fill:C.white,line:C.line,color:C.ink,size:16,bold:true});
  const top=boxText(s,"Top3\n또는 policy_fallback",{left:860,top:230,width:220,height:70},{fill:C.paleBlue,line:C.blue,color:C.ink,size:16,bold:true});
  connect(s,q,kb,{color:C.blue}); connect(s,kb,rr,{color:C.blue}); connect(s,rr,top,{color:C.blue});
  addText(s,"최종 응답",{left:70,top:365,width:200,height:30},{size:18,bold:true,color:C.teal});
  const pol=boxText(s,"서버 policy\naction allowlist",{left:70,top:415,width:220,height:88},{fill:C.teal2,line:C.teal,color:C.ink,size:17,bold:true});
  const guard=boxText(s,"guarded_policy_answer\n허용 문구만 구성",{left:380,top:415,width:260,height:88},{fill:C.white,line:C.teal,color:C.ink,size:17,bold:true});
  const verify=boxText(s,"Safety checks\n위험행동·허위완료 금지",{left:730,top:415,width:260,height:88},{fill:C.paleRed,line:C.red,color:C.ink,size:17,bold:true});
  const response=boxText(s,"사용자 안내\n중단·확인·신고",{left:1070,top:415,width:150,height:88},{fill:C.navy,line:C.navy,color:C.white,size:16,bold:true});
  connect(s,pol,guard,{color:C.teal}); connect(s,guard,verify,{color:C.red}); connect(s,verify,response,{color:C.navy});
  boxText(s,"외부 조치 실행 = FALSE",{left:805,top:552,width:270,height:44},{fill:C.paleRed,line:C.paleRed,color:C.red,size:16,bold:true,radius:"rounded-full"});
  addText(s,"피해 발생 시: 1394 신고·상담 + 긴급 시 112 + 해당 금융회사 연락·지급정지 요청",{left:145,top:610,width:980,height:38},{size:20,bold:true,color:C.navy,align:"center"});
  foot(s); notes(s,["현재 검색은 벡터 임베딩이나 cross-encoder가 아니다.","KB는 공식기관 안내를 요약한 데모 지식이며 기관 승인 지식저장소가 아니다."],["/Users/dongyoungko/Documents/AI_Hacker/AI_Finance_Sec/backend/app/graph.py","https://www.police.go.kr/user/bbs/BD_selectBbs.do?q_bbsCode=1007&q_bbscttSn=20260209152732394"]);
}

// 12 Now vs future
{
  const s = deck.slides.add(); header(s, 12, "현재는 ‘안전한 합성 MVP’, 다음은 ‘기관 승인형 POC’", "04 · ROAD TO POC");
  addText(s,"CURRENT MVP",{left:76,top:180,width:330,height:34},{size:18,bold:true,color:C.teal});
  const now=boxText(s,"구현됨\n\n• 합성 통화 문장·합성 거래 신호 UI\n• Mock + Local FastAPI/LangGraph\n• 규칙 + Qwen 구조화 JSON fusion\n• 정적 KB 11건 + 경량 재순위\n• allowlist 응답 + Safety\n• session 기반 휘발성 멀티턴\n• 합성 회귀·holdout 테스트",{left:70,top:225,width:500,height:360},{fill:C.teal2,line:C.teal,color:C.ink,size:21,bold:true,align:"left",vAlign:"top",insets:{left:28,right:20,top:24,bottom:16}});
  addText(s,"POC / P2",{left:720,top:180,width:330,height:34},{size:18,bold:true,color:C.red});
  const future=boxText(s,"미구현·기관 합의 필요\n\n• 동의 기반 통화 위험 특징값 / STT\n• 실제 거래·FDS·은행 레거시 연계\n• 승인 지식·버전·검수 워크플로\n• Vector DB·embedding·reranker\n• RAGAS·실데이터 calibration·drift\n• 영속 DB·인증·권한·감사로그\n• Human review·이의제기 운영",{left:710,top:225,width:500,height:360},{fill:C.white,line:C.red,color:C.ink,size:21,bold:true,align:"left",vAlign:"top",insets:{left:28,right:20,top:24,bottom:16}});
  const arrow=addShape(s,"rightArrow",{left:590,top:350,width:100,height:80},C.navy,C.navy,"none");
  addText(s,"POC의 성공 기준은 실사용 정확도 주장보다 ‘행동 개선·안전 위반 0·운영 가능성’을 검증하는 것이다.",{left:140,top:620,width:1000,height:44},{size:21,bold:true,color:C.navy,align:"center"});
  foot(s); notes(s,["합성 회귀셋 통과는 구현 안정성 증거일 뿐 실사용 일반화 성능이 아니다.","다음 단계는 실제 통화 원문 수집보다 최소 위험 특징값 기반 POC 입력 경로를 우선 검토한다."],["/Users/dongyoungko/Documents/AI_Hacker/AI_Finance_Sec/backend/app/graph.py","/Users/dongyoungko/Documents/AI_Hacker/AI_Finance_Sec/app/lib/engine.ts"]);
}

await fs.mkdir(OUT,{recursive:true});
for (const [i,s] of deck.slides.items.entries()) {
  const stem=`slide-${String(i+1).padStart(2,"0")}`;
  await writeBlob(path.join(OUT,`${stem}.png`), await deck.export({slide:s,format:"png",scale:1}));
  const layout=await s.export({format:"layout"});
  await fs.writeFile(path.join(OUT,`${stem}.layout.json`),await layout.text());
}
await writeBlob(path.join(OUT,"deck-montage.webp"),await deck.export({format:"webp",montage:true,scale:1}));
const pptx=await PresentationFile.exportPptx(deck); await pptx.save(PPTX);
console.log(PPTX);
