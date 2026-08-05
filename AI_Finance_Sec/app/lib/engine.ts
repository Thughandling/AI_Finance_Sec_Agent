export type RiskLevel = "안전" | "주의" | "위험";
export type ExpectedLabel = "정상" | "사기";

export type ScenarioLine = {
  text: string;
  score: number;
  keywords: string[];
  category: string;
};

export type TransactionSignal = {
  label: string;
  value: string;
  risk: number;
};

export type Scenario = {
  id: string;
  tag: string;
  title: string;
  description: string;
  expectedLabel: ExpectedLabel;
  lines: ScenarioLine[];
  transactionSignals: TransactionSignal[];
};

export type KnowledgeDocument = {
  id: string;
  title: string;
  authority: string;
  riskTypes: string[];
  content: string;
  sourceUrl: string;
  status: "current" | "historical";
};

export type DetectionResult = {
  score: number;
  level: RiskLevel;
  verdict: ExpectedLabel;
  riskType: string;
  evidence: string[];
  actions: string[];
};

export type RetrievalResult = KnowledgeDocument & {
  lexicalRank: number;
  semanticRank: number;
  rerankScore: number;
};

export const providers = [
  { id: "mock", label: "Mock", model: "Deterministic Safety Engine", keyName: "", badge: "API 키 불필요" },
  { id: "ollama", label: "Ollama Local", model: "qwen2.5:7b", keyName: "", badge: "API 키 불필요 · 로컬" },
  { id: "openai", label: "OpenAI", model: "gpt-5.6-terra", keyName: "OPENAI_API_KEY", badge: "Responses API" },
  { id: "deepseek", label: "DeepSeek", model: "deepseek-v4-flash", keyName: "DEEPSEEK_API_KEY", badge: "권장·저비용" },
  { id: "anthropic", label: "Claude", model: "claude-sonnet-4-5-20250929", keyName: "ANTHROPIC_API_KEY", badge: "대안" },
  { id: "gemini", label: "Gemini", model: "gemini-2.5-flash", keyName: "GOOGLE_API_KEY", badge: "대안" },
  { id: "qwen", label: "Qwen Cloud (DashScope)", model: "qwen-plus", keyName: "DASHSCOPE_API_KEY", badge: "BYOK · Cloud" },
] as const;

export type ProviderId = (typeof providers)[number]["id"];

export const scenarios: Scenario[] = [
  {
    id: "prosecutor",
    tag: "기관 사칭",
    title: "검찰·금감원 사칭",
    description: "범죄 연루를 빌미로 안전계좌 이체를 요구합니다.",
    expectedLabel: "사기",
    lines: [
      { text: "서울중앙지검 수사관입니다. 본인 확인되시죠?", score: 24, keywords: ["검찰", "수사관"], category: "기관 사칭" },
      { text: "고객님 명의 계좌가 금융 범죄에 연루되었습니다.", score: 45, keywords: ["범죄 연루"], category: "불안 유도" },
      { text: "수사 보안상 가족에게도 절대 말하면 안 됩니다.", score: 67, keywords: ["비밀 유지"], category: "고립 유도" },
      { text: "지금 즉시 자금을 안전계좌로 이체하세요.", score: 94, keywords: ["즉시", "안전계좌", "이체"], category: "금전 요구" },
    ],
    transactionSignals: [
      { label: "신규 수취인", value: "개설 2일", risk: 18 },
      { label: "이체 금액", value: "평소 대비 8.4배", risk: 24 },
      { label: "통화 결합", value: "의심 통화 직후", risk: 28 },
    ],
  },
  {
    id: "loan",
    tag: "대출 사기",
    title: "저금리 대출 빙자",
    description: "대환대출을 약속하며 선입금 수수료를 요구합니다.",
    expectedLabel: "사기",
    lines: [
      { text: "정부지원 저금리 대환대출 대상자로 선정되셨습니다.", score: 22, keywords: ["정부지원", "저금리"], category: "대출 미끼" },
      { text: "오늘 안에 신청하시면 3% 금리로 승인 가능합니다.", score: 43, keywords: ["오늘 안에", "승인"], category: "긴급성 유도" },
      { text: "기존 대출을 먼저 상환해야 전산 처리가 됩니다.", score: 69, keywords: ["먼저 상환"], category: "선입금 요구" },
      { text: "수수료 120만 원을 지정 계좌로 보내주세요.", score: 90, keywords: ["수수료", "지정 계좌"], category: "금전 요구" },
    ],
    transactionSignals: [
      { label: "수취인 관계", value: "거래 이력 없음", risk: 20 },
      { label: "거래 속도", value: "10분 내 3회", risk: 18 },
      { label: "거래 메모", value: "대출 수수료", risk: 22 },
    ],
  },
  {
    id: "family",
    tag: "가족 빙자",
    title: "자녀 사고·납치 빙자",
    description: "가족의 위급 상황을 꾸며 현금 전달을 압박합니다.",
    expectedLabel: "사기",
    lines: [
      { text: "어머님, 따님이 지금 큰 사고를 당했습니다.", score: 25, keywords: ["자녀", "사고"], category: "가족 빙자" },
      { text: "상태가 위급해서 지금 바로 수술해야 합니다.", score: 50, keywords: ["위급", "지금 바로"], category: "긴급성 유도" },
      { text: "전화 끊으면 따님이 위험해질 수 있습니다.", score: 73, keywords: ["전화 통제"], category: "통제·협박" },
      { text: "현금 2천만 원을 준비해 직원에게 전달하세요.", score: 97, keywords: ["현금", "직원 전달"], category: "금전 요구" },
    ],
    transactionSignals: [
      { label: "거래 방식", value: "현금 인출", risk: 18 },
      { label: "인출 금액", value: "평소 대비 14.2배", risk: 26 },
      { label: "행동 결합", value: "통화 중 ATM 이동", risk: 30 },
    ],
  },
  {
    id: "normal",
    tag: "Hard Negative",
    title: "정상 은행 상담",
    description: "위험 단어가 등장하지만 고객이 시작한 정상 확인 절차입니다.",
    expectedLabel: "정상",
    lines: [
      { text: "고객님이 요청한 대출 상담 예약을 확인하겠습니다.", score: 7, keywords: ["고객 요청"], category: "정상 절차" },
      { text: "금리와 수수료는 공식 앱에서도 동일하게 확인할 수 있습니다.", score: 9, keywords: ["공식 앱"], category: "교차 확인" },
      { text: "지금 송금하거나 앱을 설치하실 필요는 없습니다.", score: 12, keywords: ["송금 불필요", "설치 불필요"], category: "위험 행동 부정" },
      { text: "상담을 원하지 않으면 대표번호로 다시 연락해주세요.", score: 10, keywords: ["대표번호"], category: "사용자 통제" },
    ],
    transactionSignals: [
      { label: "수취인", value: "등록 계좌", risk: 0 },
      { label: "금액", value: "평소 범위", risk: 0 },
      { label: "기기", value: "기존 기기", risk: 0 },
    ],
  },
];

export const knowledgeBase: KnowledgeDocument[] = [
  {
    id: "FSS-ORG-001",
    title: "기관사칭형 보이스피싱 대응",
    authority: "금융감독원",
    riskTypes: ["기관 사칭", "금전 요구"],
    content: "수사기관과 금융기관은 전화로 안전계좌 이체를 요구하지 않습니다. 통화를 종료하고 상대가 알려준 번호가 아닌 공식 대표번호로 사실을 확인합니다.",
    sourceUrl: "https://fine.fss.or.kr/",
    status: "current",
  },
  {
    id: "KNPA-1394-001",
    title: "보이스피싱 피해 직후 조치",
    authority: "경찰청",
    riskTypes: ["금전 요구", "피해 발생"],
    content: "이미 송금했다면 1394에 신고·상담하고, 긴급한 상황은 112에 신고하며, 해당 금융회사에 연락해 지급정지를 요청하고 이체내역·계좌번호·통화·문자 기록을 보관합니다.",
    sourceUrl: "https://www.police.go.kr/",
    status: "current",
  },
  {
    id: "FSS-LOAN-001",
    title: "대출빙자형 사기 예방",
    authority: "금융감독원",
    riskTypes: ["대출 미끼", "선입금 요구", "금전 요구"],
    content: "정상 금융회사는 대출 실행 전에 개인 계좌로 수수료나 상환금을 먼저 보내라고 요구하지 않습니다. 공식 앱과 대표번호로 상품 존재 여부를 확인합니다.",
    sourceUrl: "https://fine.fss.or.kr/",
    status: "current",
  },
  {
    id: "KNPA-FAMILY-001",
    title: "가족빙자형 사기 확인 절차",
    authority: "경찰청",
    riskTypes: ["가족 빙자", "통제·협박"],
    content: "상대와 통화를 종료한 뒤 가족 본인과 다른 가족에게 별도로 연락해 안전을 확인하고, 상대가 지정한 사람에게 현금을 전달하지 않습니다.",
    sourceUrl: "https://www.police.go.kr/",
    status: "current",
  },
  {
    id: "FSEC-APP-001",
    title: "악성 앱과 원격제어 대응",
    authority: "금융보안원",
    riskTypes: ["앱 설치", "원격제어"],
    content: "출처가 불분명한 앱과 원격제어 앱을 설치하지 않습니다. 이미 설치했다면 네트워크를 차단하고 다른 안전한 기기로 금융회사에 연락합니다.",
    sourceUrl: "https://www.fsec.or.kr/",
    status: "current",
  },
  {
    id: "SAFE-NORMAL-001",
    title: "정상 금융상담 확인 기준",
    authority: "AI_Finance_Sec 검증셋",
    riskTypes: ["정상 절차", "교차 확인"],
    content: "고객이 먼저 시작한 상담이고 송금·앱 설치를 요구하지 않으며 공식 대표번호 재확인을 허용한다면 위험 단어만으로 사기로 단정하지 않습니다.",
    sourceUrl: "https://www.fsec.or.kr/",
    status: "current",
  },
];

const fraudSignals: Array<{ terms: string[]; weight: number; type: string }> = [
  { terms: ["안전계좌", "검찰", "수사관", "금감원"], weight: 28, type: "기관 사칭" },
  { terms: ["지금 즉시", "오늘 안에", "전화 끊으면", "비밀"], weight: 20, type: "긴급성" },
  { terms: ["이체", "송금", "수수료", "현금", "지정 계좌"], weight: 30, type: "금전 요구" },
  { terms: ["대출", "대환대출", "선입금"], weight: 34, type: "대출 미끼" },
  { terms: ["앱 설치", "앱을 설치", "원격제어", "apk", "링크", "설치하세요"], weight: 42, type: "앱 설치" },
  { terms: ["자녀", "따님", "아들", "사고", "납치"], weight: 30, type: "가족 빙자" },
];

const negations = ["필요는 없습니다", "요구하지 않습니다", "하지 마세요", "불필요", "대표번호로 다시"];

export function analyzeText(text: string, transactionRisk = 0): DetectionResult {
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
  const evidence: string[] = [];
  const typeScores = new Map<string, number>();
  let score = Math.min(transactionRisk, 30);

  for (const signal of fraudSignals) {
    const hits = signal.terms.filter((term) => normalized.includes(term.toLowerCase()));
    if (hits.length > 0) {
      const added = Math.min(signal.weight + (hits.length - 1) * 5, 45);
      score += added;
      typeScores.set(signal.type, (typeScores.get(signal.type) ?? 0) + added);
      evidence.push(`${signal.type}: ${hits.join("·")}`);
    }
  }

  const negationHits = negations.filter((term) => normalized.includes(term.toLowerCase()));
  if (negationHits.length > 0) {
    score -= Math.min(90, 35 + negationHits.length * 25);
    evidence.push(`정상성 근거: ${negationHits.join("·")}`);
  }

  const alreadyTransferred = /이미.*(송금|이체)|보냈|입금했/.test(normalized);
  if (alreadyTransferred) {
    score = Math.max(score, 75);
    typeScores.set("피해 발생", 75);
    evidence.push("피해 발생: 송금·이체 완료 표현");
  }

  score = Math.max(0, Math.min(100, score));
  const level: RiskLevel = score >= 70 ? "위험" : score >= 40 ? "주의" : "안전";
  const verdict: ExpectedLabel = score >= 40 ? "사기" : "정상";
  const riskType = score < 40 ? "정상 절차" : [...typeScores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "정상 절차";
  const actions = verdict === "정상"
    ? ["공식 대표번호·앱에서 상담 내용 재확인", "불필요한 개인정보는 제공하지 않기"]
    : ["통화 즉시 종료", "추가 송금·앱 설치 중단", "증거 보관", "1394 신고·상담", "긴급 시 112 신고", "해당 금융회사에 지급정지 요청"];

  return { score, level, verdict, riskType, evidence, actions };
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^0-9a-z가-힣\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function rankByScore<T>(items: T[], scorer: (item: T) => number): Map<T, number> {
  return new Map([...items].sort((a, b) => scorer(b) - scorer(a)).map((item, index) => [item, index + 1]));
}

export function retrieveAndRerank(query: string, riskType: string): RetrievalResult[] {
  const currentDocs = knowledgeBase.filter((doc) => doc.status === "current");
  const queryTokens = new Set(tokenize(query));
  const lexicalScore = (doc: KnowledgeDocument) => tokenize(`${doc.title} ${doc.content}`).filter((token) => queryTokens.has(token)).length;
  const semanticScore = (doc: KnowledgeDocument) => doc.riskTypes.includes(riskType) ? 3 : doc.riskTypes.some((type) => query.includes(type)) ? 2 : 0;
  const lexicalRanks = rankByScore(currentDocs, lexicalScore);
  const semanticRanks = rankByScore(currentDocs, semanticScore);

  return currentDocs
    .map((doc) => {
      const lexicalRank = lexicalRanks.get(doc) ?? currentDocs.length;
      const semanticRank = semanticRanks.get(doc) ?? currentDocs.length;
      // RRF 순위를 뒤집지 않는 작은 tie-breaker만 적용한다.
      const authorityBonus = ["금융감독원", "경찰청", "금융보안원"].includes(doc.authority) ? 0.000001 : 0;
      const riskTypeBonus = doc.riskTypes.includes(riskType) ? 0.01 : 0;
      const rerankScore = 1 / (60 + lexicalRank) + 1 / (60 + semanticRank) + riskTypeBonus + authorityBonus;
      return { ...doc, lexicalRank, semanticRank, rerankScore };
    })
    .sort((a, b) => b.rerankScore - a.rerankScore)
    .slice(0, 3);
}

export function buildMockAnswer(result: DetectionResult, _documents: RetrievalResult[], userText: string): string {
  const transferred = /이미.*(송금|이체)|보냈|입금했/.test(userText);
  if (transferred) {
    return "이미 송금하셨다면 지금은 속도가 중요합니다. 추가 송금을 멈추고 1394에 신고·상담하세요. 긴급한 상황은 112에 신고하고, 해당 금융회사에 직접 연락해 지급정지를 요청하세요. 이체내역·계좌번호·통화와 문자 기록도 보관해 주세요.";
  }
  if (result.verdict === "정상") {
    return "현재 문장에서는 강한 사기 징후가 확인되지 않았습니다. 다만 상대가 송금이나 앱 설치를 새로 요구하면 중단하고, 공식 대표번호로 상담 내용을 다시 확인하세요.";
  }
  return `현재 ${result.level} 단계입니다. ${result.evidence[0] ?? "복합 위험 신호"}가 확인됐습니다. 통화를 종료하고 송금·앱 설치를 중단한 뒤, 상대가 알려준 번호가 아닌 공식 대표번호로 확인하세요.`;
}

export function verifyAnswer(answer: string, result: DetectionResult): { passed: boolean; checks: string[] } {
  const checks = [
    answer.length >= 40 ? "구체적 안내 포함" : "안내 부족",
    /확인|대표번호/.test(answer) ? "공식 확인 절차 포함" : "공식 확인 절차 누락",
    result.verdict === "정상" || /중단|종료|지급정지/.test(answer) ? "필수 행동 포함" : "필수 행동 누락",
    !/신고가 완료|지급정지 완료|처리되었습니다/.test(answer) ? "외부조치 허위 주장 없음" : "외부조치 허위 주장 감지",
  ];
  return { passed: checks.every((check) => !/부족|누락|감지$/.test(check)), checks };
}

const evaluationCases = [
  { text: "검찰 수사관입니다. 안전계좌로 지금 즉시 이체하세요.", label: "사기" as const },
  { text: "대출 수수료를 지정 계좌에 오늘 안에 보내주세요.", label: "사기" as const },
  { text: "따님이 사고를 당했으니 현금을 직원에게 전달하세요.", label: "사기" as const },
  { text: "링크를 눌러 원격제어 앱을 설치하세요.", label: "사기" as const },
  { text: "제가 요청한 대출 상담이고 지금 송금할 필요는 없습니다.", label: "정상" as const },
  { text: "공식 앱에서 금리와 수수료를 확인했습니다.", label: "정상" as const },
  { text: "가족에게 생활비를 송금했어요.", label: "정상" as const },
  { text: "상담을 원하지 않으면 대표번호로 다시 연락해주세요.", label: "정상" as const },
];

export function calculateEvaluation() {
  const rows = evaluationCases.map((item) => ({ ...item, predicted: analyzeText(item.text).verdict }));
  const tp = rows.filter((row) => row.label === "사기" && row.predicted === "사기").length;
  const tn = rows.filter((row) => row.label === "정상" && row.predicted === "정상").length;
  const fp = rows.filter((row) => row.label === "정상" && row.predicted === "사기").length;
  const fn = rows.filter((row) => row.label === "사기" && row.predicted === "정상").length;
  const precision = tp / Math.max(tp + fp, 1);
  const recall = tp / Math.max(tp + fn, 1);
  const f1 = (2 * precision * recall) / Math.max(precision + recall, Number.EPSILON);
  const specificity = tn / Math.max(tn + fp, 1);
  const normalF1 = (2 * specificity * (tn / Math.max(tn + fn, 1))) / Math.max(specificity + (tn / Math.max(tn + fn, 1)), Number.EPSILON);
  return { total: rows.length, tp, tn, fp, fn, precision, recall, f1, macroF1: (f1 + normalF1) / 2, rows };
}

export const pipelineSteps = ["입력 검증", "State", "병렬 탐지", "RAG 검색", "RRF 리랭킹", "Qwen 분석", "정책 보호·Safety"];
