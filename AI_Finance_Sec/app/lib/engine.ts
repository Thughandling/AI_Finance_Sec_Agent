import evaluationDataset from "../../public/data/evaluation_cases.json";

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

/** 백그라운드 이상거래 탐지 입력. 모두 합성 데이터다. */
export type TransactionContext = {
  amount: number;
  payee: string;
  hour: number;
  inCall?: boolean;
  newDeviceOrApp?: boolean;
  limitRaised?: boolean;
  recentTransferCount?: number;
};

export type Scenario = {
  id: string;
  tag: string;
  title: string;
  description: string;
  expectedLabel: ExpectedLabel;
  lines: ScenarioLine[];
  transactionSignals: TransactionSignal[];
  transactionContext: TransactionContext;
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
  retrievalMode: "hybrid" | "policy_fallback";
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
    transactionContext: { amount: 9_800_000, payee: "WOORI-777-0001", hour: 21, inCall: true, limitRaised: true },
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
    transactionContext: { amount: 1_200_000, payee: "KAKAO-3333-77", hour: 15, inCall: true, recentTransferCount: 3 },
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
    transactionContext: { amount: 20_000_000, payee: "ATM-CASH-0002", hour: 20, inCall: true, recentTransferCount: 2 },
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
    transactionContext: { amount: 150_000, payee: "KB-1002-3355", hour: 14 },
  },
];

export const knowledgeBase: KnowledgeDocument[] = [
  {
    id: "FSS-ORG-001",
    title: "기관사칭형 보이스피싱 대응",
    authority: "금융감독원",
    riskTypes: ["기관 사칭", "금전 요구"],
    content: "수사기관과 금융기관은 안전계좌·임시보관계좌 이체나 자금 집행을 요구하지 않습니다. 통화를 종료하고 상대가 알려준 번호가 아닌 공식 대표번호로 사실을 확인합니다.",
    sourceUrl: "https://fine.fss.or.kr/",
    status: "current",
  },
  {
    id: "KNPA-1394-001",
    title: "보이스피싱 피해 직후 조치",
    authority: "경찰청",
    riskTypes: ["금전 요구", "피해 발생"],
    content: "이미 송금하거나 상품권 코드·OTP·신분증·통장사본·공동인증서·금괴·가상자산을 전달했다면 1394에 신고·상담하고, 긴급한 상황은 112에 신고하며 금융회사에 지급정지를 요청합니다.",
    sourceUrl: "https://www.police.go.kr/",
    status: "current",
  },
  {
    id: "FSS-LOAN-001",
    title: "대출빙자형 사기 예방",
    authority: "금융감독원",
    riskTypes: ["대출 미끼", "선입금 요구", "금전 요구"],
    content: "정상 금융회사는 대출·신용복구 실행 전에 예탁금·보증료·작업비를 개인 계좌로 먼저 보내라고 요구하지 않습니다. 공식 앱과 대표번호로 확인합니다.",
    sourceUrl: "https://fine.fss.or.kr/",
    status: "current",
  },
  {
    id: "KNPA-FAMILY-001",
    title: "가족빙자형 사기 확인 절차",
    authority: "경찰청",
    riskTypes: ["가족 빙자", "통제·협박"],
    content: "엄마·아들·딸을 사칭해 휴대폰 고장이나 친구 폰·새 번호라며 병원비와 돈을 요구하면 가족의 기존 번호로 확인하고 현금을 전달하지 않습니다.",
    sourceUrl: "https://www.police.go.kr/",
    status: "current",
  },
  {
    id: "FSEC-APP-001",
    title: "악성 앱과 원격제어 대응",
    authority: "금융보안원",
    riskTypes: ["앱 설치", "원격제어"],
    content: "출처가 불분명한 APK와 보안 프로그램을 실행하거나 팀뷰어·애니데스크 원격제어 앱과 연결 숫자를 제공하지 않습니다. 설치했다면 네트워크를 차단합니다.",
    sourceUrl: "https://www.fsec.or.kr/",
    status: "current",
  },
  {
    id: "FSEC-SMISH-001",
    title: "택배·환급 사칭 스미싱 대응",
    authority: "금융보안원",
    riskTypes: ["택배·환급", "개인정보 요구"],
    content: "택배 주소 수정이나 환급금을 빌미로 문자 링크 접속과 금융정보 입력을 요구하면 링크를 열지 말고 해당 기관의 공식 앱과 대표번호에서 직접 확인합니다.",
    sourceUrl: "https://www.fsec.or.kr/",
    status: "current",
  },
  {
    id: "FSS-INVEST-001",
    title: "리딩방·가상자산 투자사기 대응",
    authority: "금융감독원",
    riskTypes: ["투자 사기", "금전 요구"],
    content: "원금·고수익 보장, 손실 복구, 출금 전 세금이나 증거금 선입금 요구를 신뢰하지 말고 추가 입금을 중단한 뒤 제도권 금융회사 여부를 확인합니다.",
    sourceUrl: "https://fine.fss.or.kr/",
    status: "current",
  },
  {
    id: "KNPA-MESSENGER-001",
    title: "지인·메신저 사칭 확인 절차",
    authority: "경찰청",
    riskTypes: ["지인·메신저", "가족 빙자"],
    content: "새 번호, 통화 곤란을 이유로 돈이나 상품권을 요구하면 송금하지 말고 기존에 알던 번호로 당사자에게 직접 연락해 사실을 확인합니다.",
    sourceUrl: "https://www.police.go.kr/",
    status: "current",
  },
  {
    id: "FSEC-BEC-001",
    title: "기업 이메일·임원 사칭 BEC 대응",
    authority: "금융보안원",
    riskTypes: ["기업 사칭 BEC"],
    content: "대표·사장·임원·재무이사 사칭으로 변경된 협력사 계좌에 대금 집행을 요구하거나 쿠폰·상품권 코드를 회신하라고 하면 기존 연락처와 승인 절차로 재확인합니다.",
    sourceUrl: "https://www.fsec.or.kr/",
    status: "current",
  },
  {
    id: "FSEC-AUTH-001",
    title: "OTP·인증정보 탈취 대응",
    authority: "금융보안원",
    riskTypes: ["개인정보 요구"],
    content: "OTP·일회용암호·인증번호·공동인증서 비밀번호·선불카드 뒷면 숫자를 전화나 메신저로 읽어주거나 회신하지 않습니다.",
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

type RiskPattern = { pattern: RegExp; weight: number; type: string; evidence: string };

// 띄어쓰기 회피를 막기 위해 공백을 제거한 문장에 적용한다. 단일 위험 단어가
// 아니라 맥락 조합을 점수화하여 정상 상담·뉴스 인용의 오탐을 줄인다.
const riskPatterns: RiskPattern[] = [
  { pattern: /(검찰|검사|수사관|금감원|금융감독원|금융감독언|법원|구속영장).{0,35}(범죄|연루|혐의|영장|계좌|자금|돈|소명)/, weight: 42, type: "기관 사칭", evidence: "수사·감독기관 사칭 맥락" },
  { pattern: /(안전|보호|보안|검수|별도|임시보관)계좌.{0,24}(이체|송금|옮겨|보내|입금|넘기|넘겨|집행)|(?:이체|송금|옮겨|보내|입금|넘기|넘겨|집행).{0,24}(안전|보호|보안|검수|별도|임시보관)계좌/, weight: 42, type: "기관 사칭", evidence: "보호 명목 계좌 이동 요구" },
  { pattern: /(대출|대환|신용점수|신용복구|한도|3퍼센트상품).{0,45}(수수료|선입금|먼저상환|작업비|보증료|예탁금|처리)|(?:수수료|선입금|작업비|보증료|예탁금).{0,35}(대출|한도|상품|승인|실행|신용복구)/, weight: 50, type: "대출 미끼", evidence: "대출 실행 전 비용 요구" },
  { pattern: /(원격제어|보안프로그램|보안앱|apk|팀뷰어|애니데스크|연결숫자).{0,32}(설치|깔아|받아|실행|인증|읽어|회신|알려)|(?:설치|깔아|받아|실행).{0,24}(원격제어|보안프로그램|보안앱|apk|팀뷰어|애니데스크)/, weight: 52, type: "앱 설치", evidence: "원격제어·비공식 앱 실행 요구" },
  { pattern: /(택배|배송|소포|환급|과오납|국세).{0,55}(링크|주소|페이지|bit점ly|카드번호|계좌비밀번호|인증|결제)/, weight: 48, type: "택배·환급", evidence: "택배·환급 미끼 정보입력 요구" },
  { pattern: /(리딩방|코인|가상자산|거래소|손실복구|증거금).{0,55}(원금|수익|보장|입금|송금|세금|먼저|보태|회수|출금)/, weight: 50, type: "투자 사기", evidence: "투자수익·출금 명목 선입금" },
  { pattern: /(재무이사|대표|사장|임원).{0,65}(변경된?협력사계좌|협력사계좌변경|대금집행|쿠폰|상품권|코드).{0,25}(송금|이체|집행|회신|보내|알려)|(?:변경된?협력사계좌|대금집행).{0,45}(대표|사장|임원|재무이사)/, weight: 55, type: "기업 사칭 BEC", evidence: "임원 사칭 결제·코드 요구" },
  { pattern: /(부장님|사장님|친구|지인|새번호|친구폰|회의중|통화못|전화는안돼).{0,55}(상품권|핀번호|돈|병원비|빌려|보내|결제|회신)/, weight: 48, type: "지인·메신저", evidence: "지인 사칭 비대면 금전 요구" },
  { pattern: /(따님|자녀|아들|딸|엄마나|아빠나).{0,55}(사고|수술|잡혀|납치|휴대폰.*고장|친구폰|돈|현금|계좌|보내)|(?:사고|수술|잡혀|납치).{0,45}(현금|돈|전달|넘기)/, weight: 52, type: "가족 빙자", evidence: "가족 위급상황·금전 요구" },
  { pattern: /(계좌비밀번호|카드번호|인증번호|인증코드|otp|일회용암호|공동인증서|선불카드뒷면숫자).{0,25}(입력|알려|보내|인증|읽어|회신|넘기)/, weight: 45, type: "개인정보 요구", evidence: "금융 인증정보 요구" },
  { pattern: /(지금|오늘|즉시|바로|전화끊지|비밀|말하지).{0,35}(보내|송금|이체|입금|전달|준비|옮겨)/, weight: 18, type: "긴급성", evidence: "긴급·고립 압박" },
  { pattern: /(돈|자금|현금|금액|수수료|보증료|작업비).{0,24}(보내|송금|이체|입금|전달|넘기|준비)|(?:송금|이체|입금).{0,15}(하세요|해라|해주세요|해야|부탁)/, weight: 24, type: "금전 요구", evidence: "금전 이동 요구" },
];

const normalClausePatterns = [
  /(?:뉴스|기사|보도).{0,30}(사건|사례|보도)/,
  /(?:교육|예방|예방법).{0,45}(배웠|의심|하지말|누르지말|설치하지말|입금하지말)/,
  /(?:신고|제보).{0,35}(가져왔|하려고).{0,30}(보내지않|입금하지않|이체하지않)/,
  /(?:제가|직접).{0,25}(신청|요청).{0,35}(공식앱|대표번호).{0,35}(필요없|요구하지않|확인)/,
  /(?:고객|제가).{0,40}(요청|신청).{0,80}(송금|설치).{0,18}(필요없|필요는없)/,
  /(?:은행|직원|상담원).{0,35}(요구하지않|보내지않|링크를보내지않).{0,35}(대표번호|공식앱|다시확인|확인)/,
  /(?:등록된|평소쓰던).{0,25}(아들|딸|부모님|가족|계좌).{0,35}(생활비|학원비|병원비|송금|이체|입금)/,
  /(?:앱스토어|공식스토어).{0,25}(은행)?공식앱.{0,25}(설치|검색)/,
  /택배사공식앱.{0,35}(배송주소|주소).{0,35}(수정|변경)/,
  /제가.{0,20}(신청|요청).{0,20}(대출|상담)/,
  /(?:신고|제보).{0,30}(하려고|가져왔)/,
  /공식앱.{0,35}(필요없|필요는없|요구하지않|확인)/,
  /(?:세미나|교육|뉴스|기사|자료).{0,55}(읽었|배웠|나왔|사례)/,
  /본인이연공식앱.{0,35}(otp|일회용암호).{0,20}(직접입력)/,
  /본인명의거래소.{0,35}(인증된본인계좌|본인개인지갑).{0,20}(출금|전송)/,
  /업무용법인카드.{0,20}(직원|동료).{0,15}(전달|건넸)/,
];

const completedActionPatterns = [
  /이미.{0,15}(송금|이체)|(?:돈|자금).{0,12}(보냈|입금했|송금했|이체했|전송했)|알려준곳에입금했|요구한대로.{0,15}(보냈|입금했|송금했|이체했)/,
  /(?:상품권|기프트카드).{0,20}(핀번호|pin|번호).{0,20}(보냈|알려|전달)/,
  /(?:현금|카드).{0,20}(전달했|건넸|줬|넘겼)/,
  /(?:otp|인증번호|인증코드|비밀번호).{0,20}(알려|보냈|제공|입력)/,
  /(?:원격제어|팀뷰어|보안앱|apk).{0,20}(설치했|깔았|실행했)/,
  /(?:코인|가상자산|비트코인|테더).{0,25}(보냈|전송했|출금했)/,
  /(?:신분증).{0,15}(통장사본).{0,20}(보냈|제공|넘겼)|(?:통장사본).{0,15}(신분증).{0,20}(보냈|제공|넘겼)/,
  /(?:공동인증서).{0,20}(비밀번호).{0,20}(알려|보냈|제공|넘겼)/,
  /(?:금괴|골드바|문화상품권).{0,25}(전달했|건넸|보냈|번호를알려)/,
];
const suspiciousTransferContext = /(이미송금|이미이체|검찰|검사|수사관|금감원|법원|모르는사람|요구한대로|그쪽|알려준곳|사기|연락이끊|새번호|직원에게|상담원|리딩방|출금잠금|대표가|임원이|재무이사)/;
const safeCompletedContext = /업무용법인카드.{0,20}(직원|동료).{0,15}(전달|건넸)|본인명의거래소.{0,35}(인증된본인계좌|본인개인지갑).{0,20}(출금|전송)|본인이연공식앱.{0,35}(otp|일회용암호).{0,20}(직접입력)/;

function compactClauses(value: string): string[] {
  return value
    .split(/[.!?。！？\n]|(?:하지만|지만|그런데|그러나|다만|지금은)/g)
    .map((clause) => clause.replace(/\s+/g, ""))
    .filter(Boolean);
}

export function analyzeText(text: string, transactionRisk = 0): DetectionResult {
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
  const compact = normalized.replace(/\s+/g, "");
  const evidence: string[] = [];
  const typeScores = new Map<string, number>();
  let score = Math.min(transactionRisk, 30);

  const clauses = compactClauses(normalized);
  const unsafeClauses = clauses.map((clause) => normalClausePatterns.some((pattern) => pattern.test(clause)) && !/(하지만|그런데|그러나|다만)/.test(clause) ? "" : clause);
  const detectionUnits = [...unsafeClauses.filter(Boolean)];
  for (let index = 0; index < unsafeClauses.length - 1; index += 1) {
    if (unsafeClauses[index] && unsafeClauses[index + 1]) detectionUnits.push(`${unsafeClauses[index]}${unsafeClauses[index + 1]}`);
  }
  for (const signal of riskPatterns) {
    if (detectionUnits.some((clause) => signal.pattern.test(clause))) {
      score += signal.weight;
      typeScores.set(signal.type, (typeScores.get(signal.type) ?? 0) + signal.weight);
      evidence.push(`${signal.type}: ${signal.evidence}`);
    }
  }
  if (unsafeClauses.some((clause) => !clause)) evidence.push("정상성 근거: 해당 절의 공식 확인·교육·일상거래 맥락");

  const alreadyTransferred = completedActionPatterns.some((pattern) => pattern.test(compact))
    && suspiciousTransferContext.test(compact)
    && !safeCompletedContext.test(compact);
  if (alreadyTransferred) {
    score = Math.max(score, 75);
    typeScores.set("피해 발생", 75);
    evidence.push("피해 발생: 송금·이체 완료 표현");
  }

  score = Math.max(0, Math.min(100, score));
  const level: RiskLevel = score >= 70 ? "위험" : score >= 40 ? "주의" : "안전";
  const verdict: ExpectedLabel = score >= 40 ? "사기" : "정상";
  const riskType = alreadyTransferred ? "피해 발생" : score < 40 ? "정상 절차" : [...typeScores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "정상 절차";
  const actions = verdict === "정상"
    ? ["공식 대표번호·앱에서 상담 내용 재확인", "불필요한 개인정보는 제공하지 않기"]
    : ["통화 즉시 종료", "추가 송금·앱 설치 중단", "증거 보관", "1394 신고·상담", "긴급 시 112 신고", "해당 금융회사에 지급정지 요청"];

  return { score, level, verdict, riskType, evidence, actions };
}

function tokenize(value: string): string[] {
  const stopTokens = new Set(["하라고", "하라", "라고"]);
  const words = value
    .toLowerCase()
    .replace(/[^0-9a-z가-힣\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);
  const koreanBigrams = words.flatMap((word) => /[가-힣]/.test(word)
    ? [...word].slice(0, -1).map((character, index) => `${character}${word[index + 1]}`)
    : []);
  return [...new Set([...words, ...koreanBigrams])].filter((token) => !stopTokens.has(token));
}

function rankByScore<T>(items: T[], scorer: (item: T) => number): Map<T, number> {
  return new Map([...items].sort((a, b) => scorer(b) - scorer(a)).map((item, index) => [item, index + 1]));
}

export function retrieveAndRerank(query: string, riskType: string): RetrievalResult[] {
  const currentDocs = knowledgeBase.filter((doc) => doc.status === "current" && doc.riskTypes.includes(riskType));
  if (currentDocs.length === 0) return [];
  const queryTokens = new Set(tokenize(query));
  const lexicalScore = (doc: KnowledgeDocument) => tokenize(`${doc.title} ${doc.content}`).filter((token) => queryTokens.has(token)).length;
  const lexicalScores = new Map(currentDocs.map((doc) => [doc, lexicalScore(doc)]));
  if (Math.max(...lexicalScores.values()) === 0) {
    if (riskType === "정상 절차") return [];
    return currentDocs.filter((doc) => doc.riskTypes.includes(riskType)).slice(0, 3).map((doc, index) => ({
      ...doc, lexicalRank: currentDocs.length, semanticRank: index + 1, rerankScore: 0, retrievalMode: "policy_fallback" as const,
    }));
  }
  const semanticScore = (doc: KnowledgeDocument) => doc.riskTypes.includes(riskType) ? 3 : doc.riskTypes.some((type) => query.includes(type)) ? 2 : 0;
  const lexicalRanks = rankByScore(currentDocs, lexicalScore);
  const semanticRanks = rankByScore(currentDocs, semanticScore);

  return currentDocs
    .map((doc) => {
      const lexicalRank = lexicalRanks.get(doc) ?? currentDocs.length;
      const semanticRank = semanticRanks.get(doc) ?? currentDocs.length;
      // RRF 순위를 뒤집지 않는 작은 tie-breaker만 적용한다.
      const authorityBonus = ["금융감독원", "경찰청", "금융보안원"].includes(doc.authority) ? 0.000001 : 0;
      const riskTypeBonus = doc.riskTypes.includes(riskType) && (lexicalScores.get(doc) ?? 0) > 0 ? 0.007 : 0;
      const rerankScore = 1 / (60 + lexicalRank) + 1 / (60 + semanticRank) + riskTypeBonus + authorityBonus + (lexicalScores.get(doc) ?? 0) * 0.001;
      return { ...doc, lexicalRank, semanticRank, rerankScore, retrievalMode: "hybrid" as const };
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

export function calculateEvaluation() {
  const rows = evaluationDataset.cases.map((item) => ({
    ...item,
    label: item.label === "fraud" ? "사기" as const : "정상" as const,
    predicted: analyzeText(item.text).verdict,
  }));
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

/* --- 백그라운드 이상거래 탐지 ------------------------------------------------
 * 통화 맥락과 독립적으로, 평소 거래 프로필과 이번 이체를 대조해 이상 신호를 만든다.
 * backend/app/graph.py의 detect_transaction_anomaly와 score-for-score 동일해야 한다.
 */

export const transactionBaseline = {
  medianAmount: 120_000,
  p95Amount: 500_000,
  knownPayees: ["KB-1002-3355", "SHINHAN-110-4477", "NH-352-9910"],
  usualHourStart: 8,
  usualHourEnd: 22,
};

export const TRANSACTION_RISK_CAP = 30;

export type AnomalySignal = { key: string; weight: number; label: string; value: string };

export type TransactionAnomaly = {
  score: number;
  rawScore: number;
  signals: AnomalySignal[];
  observed: string[];
  inCall: boolean;
  evaluated: boolean;
};

const won = (value: number) => `${Math.trunc(value).toLocaleString("en-US")}원`;

export const emptyAnomaly: TransactionAnomaly = { score: 0, rawScore: 0, signals: [], observed: [], inCall: false, evaluated: false };

export function detectTransactionAnomaly(context?: TransactionContext | null): TransactionAnomaly {
  if (!context) return emptyAnomaly;
  const amount = Math.max(0, Math.trunc(context.amount ?? 0));
  const payee = (context.payee ?? "").trim();
  const hour = context.hour ?? 12;
  const recentTransfers = context.recentTransferCount ?? 0;
  const p95 = transactionBaseline.p95Amount;
  const signals: AnomalySignal[] = [];
  const add = (key: string, weight: number, label: string, value: string) => signals.push({ key, weight, label, value });

  if (amount > p95 * 2) add("amount_far_over_p95", 12, "평소 상위 5% 이체액의 2배 초과", `${won(amount)} · 평소 ${won(p95)}`);
  else if (amount > p95) add("amount_over_p95", 8, "평소 상위 5% 이체액 초과", `${won(amount)} · 평소 ${won(p95)}`);
  if (payee && !transactionBaseline.knownPayees.includes(payee)) add("first_time_payee", 10, "처음 보내는 수취인 계좌", payee);
  if (hour < transactionBaseline.usualHourStart || hour >= transactionBaseline.usualHourEnd) {
    add("odd_hour", 6, "평소 이체하지 않는 시간대", `${String(hour).padStart(2, "0")}시`);
  }
  if (context.inCall) add("in_call_transfer", 12, "통화 중 이체 시도", "통화 연결 상태");
  if (context.newDeviceOrApp) add("new_device_or_app", 10, "신규 기기·앱 설치 직후 이체", "설치 24시간 이내");
  if (recentTransfers >= 2) add("split_transfer", 8, "짧은 시간 내 분할 이체 반복", `최근 1시간 ${recentTransfers}건`);
  if (context.limitRaised) add("limit_raised", 8, "이체 한도 상향 직후", "24시간 이내 상향");

  const rawScore = signals.reduce((sum, signal) => sum + signal.weight, 0);
  return {
    score: Math.min(rawScore, TRANSACTION_RISK_CAP),
    rawScore,
    signals,
    observed: signals.map((signal) => `${signal.label} — ${signal.value}`),
    inCall: Boolean(context.inCall),
    evaluated: true,
  };
}

/* --- 경보 전달 계획 ----------------------------------------------------------
 * 균일 팝업은 학습적으로 무시되고, 통화 중 푸시는 범인에게 화면을 노출시킨다.
 * 위험도에 비례한 마찰과 채널만 사용하고, 통화 중에는 푸시·SMS를 억제한다.
 */

export const alertTierNames = ["무개입", "인라인 배너", "인터스티셜", "다채널 경보"] as const;
const alertHoldSeconds = [0, 0, 15, 30];

export const alertSelfCheck = [
  "지금 누군가 통화로 이 이체를 안내하고 있나요?",
  "상대가 알려준 번호가 아닌 공식 대표번호로 확인했나요?",
  "이 계좌로 이전에 이체한 적이 있나요?",
];

export const goldenTimeSequence = [
  "해당 금융회사 콜센터에 지급정지 요청",
  "1394 신고·상담",
  "긴급 시 112 신고",
  "통화·문자·계좌 증거 보관",
];

export const policyActionAllowlist = [
  "통화 즉시 종료",
  "추가 송금·앱 설치 중단",
  "통화·문자·계좌 증거 보관",
  "공식 대표번호·앱에서 사실 확인",
  "1394 신고·상담",
  "긴급 시 112 신고",
  "해당 금융회사 콜센터에 지급정지 요청",
  "새로운 송금·앱 설치 요구 시 중단",
  "불필요한 개인정보 제공 금지",
];

export type AlertPlan = {
  tier: number;
  tierName: string;
  textTier: number;
  transactionTier: number;
  channels: string[];
  suppressedChannels: string[];
  suppressionReason: string;
  holdSeconds: number;
  selfCheck: string[];
  escalationRule: string;
  covertMode: boolean;
  notifyTrustedContact: boolean;
  goldenTime: { windowMinutes: number; sequence: string[] } | null;
  message: { observed: string[]; reason: string; primaryAction: string };
  externalActionExecuted: false;
};

const textTierOf = (score: number) => (score >= 75 ? 3 : score >= 60 ? 2 : score >= 40 ? 1 : 0);
const transactionTierOf = (rawScore: number) => (rawScore >= 30 ? 2 : rawScore >= 18 ? 1 : 0);

export function planAlert(result: DetectionResult, anomaly: TransactionAnomaly = emptyAnomaly): AlertPlan {
  // engine.ts의 DetectionResult에는 alreadyTransferred가 없다. riskType이 "피해 발생"인
  // 경우와 동치이므로 graph.py의 already_transferred 자리에 그대로 대응시킨다.
  const alreadyTransferred = result.riskType === "피해 발생";
  const textTier = textTierOf(result.score);
  const transactionTier = transactionTierOf(anomaly.rawScore);
  let tier = Math.max(textTier, transactionTier);
  if (textTier >= 1 && transactionTier >= 1) tier = Math.min(3, tier + 1);
  if (alreadyTransferred) tier = 3;

  const inCall = anomaly.inCall;
  const channels: string[] = [];
  const suppressedChannels: string[] = [];
  if (tier >= 1) channels.push(tier === 1 ? "인앱 인라인 배너" : "인앱 인터스티셜");
  if (tier >= 2) (inCall ? suppressedChannels : channels).push("푸시 알림");
  if (tier >= 3) {
    channels.push("ARS 콜백");
    (inCall ? suppressedChannels : channels).push("SMS");
  }

  let primaryAction = alreadyTransferred
    ? "해당 금융회사 콜센터에 지급정지 요청"
    : tier >= 3
      ? "통화 즉시 종료"
      : "공식 대표번호·앱에서 사실 확인";
  if (!policyActionAllowlist.includes(primaryAction)) primaryAction = "공식 대표번호·앱에서 사실 확인";

  const reasonKeyword = (result.evidence[0] ?? "").split(": ").slice(1).join(": ") || "평소와 다른 거래 패턴";

  return {
    tier,
    tierName: alertTierNames[tier],
    textTier,
    transactionTier,
    channels,
    suppressedChannels,
    suppressionReason: suppressedChannels.length ? "통화 중에는 상대방이 화면을 함께 볼 수 있어 푸시·SMS를 억제한다." : "",
    holdSeconds: alertHoldSeconds[tier],
    selfCheck: tier >= 2 ? [...alertSelfCheck] : [],
    escalationRule: tier >= 2 ? "첫 문항에 '예'로 답하면 즉시 최고 단계로 승급한다." : "",
    covertMode: inCall && tier >= 2,
    notifyTrustedContact: tier >= 3,
    goldenTime: alreadyTransferred ? { windowMinutes: 30, sequence: [...goldenTimeSequence] } : null,
    message: {
      observed: anomaly.observed.slice(0, 3),
      reason: `[${result.riskType}] ${reasonKeyword}`,
      primaryAction,
    },
    externalActionExecuted: false,
  };
}

export const pipelineSteps = ["입력 검증", "State", "이상거래 탐지", "병렬 탐지", "RAG 검색", "RRF 리랭킹", "Qwen 분석", "정책 보호·Safety", "경보 전달 계획"];
