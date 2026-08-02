"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Scenario = {
  id: string;
  tag: string;
  title: string;
  description: string;
  lines: { text: string; score: number; keywords: string[]; category: string }[];
  alert: string;
  guide: string;
};

type Message = { role: "assistant" | "user"; text: string; actions?: boolean };

const scenarios: Scenario[] = [
  {
    id: "prosecutor",
    tag: "기관 사칭",
    title: "검찰·금감원 사칭",
    description: "범죄 연루를 빌미로 안전계좌 이체를 요구합니다.",
    lines: [
      { text: "서울중앙지검 수사관입니다. 본인 확인되시죠?", score: 26, keywords: ["검찰", "수사관"], category: "기관 사칭" },
      { text: "고객님 명의 계좌가 금융 범죄에 연루되었습니다.", score: 48, keywords: ["범죄 연루"], category: "불안 유도" },
      { text: "수사 보안상 가족에게도 절대 말하면 안 됩니다.", score: 66, keywords: ["비밀 유지"], category: "고립 유도" },
      { text: "지금 즉시 자금을 안전계좌로 이체하세요.", score: 92, keywords: ["즉시", "안전계좌", "이체"], category: "금전 요구" },
    ],
    alert: "방금 통화에서 검찰을 사칭해 이체를 유도하는 정황이 감지됐어요. 지금도 통화 중이신가요?",
    guide: "검찰·금융감독원은 전화로 ‘안전계좌’ 이체를 요구하지 않아요. 통화를 즉시 종료하고, 상대가 알려준 번호가 아닌 공식 대표번호로 직접 확인하세요.",
  },
  {
    id: "loan",
    tag: "대출 사기",
    title: "저금리 대출 빙자",
    description: "대환대출을 약속하며 선입금 수수료를 요구합니다.",
    lines: [
      { text: "정부지원 저금리 대환대출 대상자로 선정되셨습니다.", score: 24, keywords: ["정부지원", "저금리"], category: "대출 미끼" },
      { text: "오늘 안에 신청하시면 3% 금리로 승인 가능합니다.", score: 46, keywords: ["오늘 안에", "승인"], category: "긴급성 유도" },
      { text: "기존 대출을 먼저 상환해야 전산 처리가 됩니다.", score: 68, keywords: ["먼저 상환"], category: "선입금 요구" },
      { text: "수수료 120만 원을 지정 계좌로 보내주세요.", score: 89, keywords: ["수수료", "지정 계좌"], category: "금전 요구" },
    ],
    alert: "대출 승인 전 수수료를 먼저 요구하는 위험 패턴이 감지됐어요. 아직 송금하지 않으셨나요?",
    guide: "정상 금융회사는 대출 실행 전 개인 계좌로 수수료나 상환금을 보내라고 하지 않아요. 송금을 멈추고 해당 금융회사 공식 앱이나 대표번호로 상품 존재 여부를 확인하세요.",
  },
  {
    id: "family",
    tag: "가족 빙자",
    title: "자녀 사고·납치 빙자",
    description: "가족의 위급 상황을 꾸며 현금 전달을 압박합니다.",
    lines: [
      { text: "어머님, 따님이 지금 큰 사고를 당했습니다.", score: 27, keywords: ["자녀", "사고"], category: "가족 빙자" },
      { text: "상태가 위급해서 지금 바로 수술해야 합니다.", score: 51, keywords: ["위급", "지금 바로"], category: "긴급성 유도" },
      { text: "전화 끊으면 따님이 위험해질 수 있습니다.", score: 72, keywords: ["전화 끊으면 위험"], category: "통제·협박" },
      { text: "현금 2천만 원을 준비해 직원에게 전달하세요.", score: 96, keywords: ["현금", "직원 전달"], category: "금전 요구" },
    ],
    alert: "가족의 사고를 빌미로 현금 전달을 압박하는 정황이 감지됐어요. 우선 숨을 천천히 쉬어도 괜찮아요.",
    guide: "상대와 통화를 끊은 뒤 자녀 본인과 다른 가족에게 직접 연락해 안전을 확인하세요. 연결되지 않으면 112에 신고하고, 상대가 지정한 사람에게 돈을 전달하지 마세요.",
  },
];

const quickReplies = ["네, 아직 통화 중이에요", "통화는 끊었어요", "이미 송금했어요"];

function ShieldIcon() {
  return <span className="shield" aria-hidden="true"><span>✓</span></span>;
}

export default function Home() {
  const [selectedId, setSelectedId] = useState(scenarios[0].id);
  const [playing, setPlaying] = useState(false);
  const [lineIndex, setLineIndex] = useState(-1);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", text: "안녕하세요. 저는 이상금융거래 징후를 조용히 살피는 AI 금융 보안 비서예요. 왼쪽에서 시나리오를 선택해 탐지를 시작해보세요." },
  ]);
  const [input, setInput] = useState("");
  const [toast, setToast] = useState("");
  const chatEnd = useRef<HTMLDivElement>(null);
  const scenario = useMemo(() => scenarios.find((item) => item.id === selectedId) ?? scenarios[0], [selectedId]);
  const score = lineIndex >= 0 ? scenario.lines[lineIndex]?.score ?? 0 : 0;
  const threatLevel = score >= 70 ? "위험" : score >= 40 ? "주의" : "안전";

  useEffect(() => {
    if (!playing) return;
    if (lineIndex >= scenario.lines.length - 1) {
      setPlaying(false);
      setMessages((prev) => [...prev, { role: "assistant", text: scenario.alert }, { role: "assistant", text: scenario.guide, actions: true }]);
      return;
    }
    const timer = window.setTimeout(() => setLineIndex((value) => value + 1), lineIndex < 0 ? 450 : 1450);
    return () => window.clearTimeout(timer);
  }, [playing, lineIndex, scenario]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function selectScenario(id: string) {
    setSelectedId(id);
    setPlaying(false);
    setLineIndex(-1);
    setMessages([{ role: "assistant", text: "시나리오가 준비됐어요. ‘실시간 탐지 시작’을 누르면 통화가 한 줄씩 재생됩니다." }]);
  }

  function togglePlay() {
    if (lineIndex >= scenario.lines.length - 1) {
      setLineIndex(-1);
      setMessages([{ role: "assistant", text: "새 탐지를 시작할게요. 위험 신호를 발견하면 먼저 알려드리겠습니다." }]);
    }
    setPlaying((value) => !value);
  }

  function reply(text: string) {
    setMessages((prev) => [...prev, { role: "user", text }, {
      role: "assistant",
      text: text.includes("송금") ? "괜찮아요. 지금부터 빠르게 대응하면 됩니다. 즉시 112와 해당 금융회사 콜센터에 연락해 지급정지를 요청하고, 이체 내역과 통화 기록을 보관하세요." : text.includes("통화는") ? "잘하셨어요. 다시 걸려와도 받지 말고 번호를 차단하세요. 공식 대표번호로 사실 여부를 확인하는 단계까지 함께 진행해볼게요." : "가능하면 즉시 통화를 종료하세요. 상대의 지시에 따라 앱을 설치하거나 송금하지 말고, 안전한 장소에서 아래 대응 버튼을 눌러주세요.",
      actions: true,
    }]);
  }

  function sendMessage(event: FormEvent) {
    event.preventDefault();
    const value = input.trim();
    if (!value) return;
    setInput("");
    reply(value);
  }

  function mockAction(label: string) {
    setToast(`${label} 요청이 안전하게 접수된 것으로 시뮬레이션했습니다.`);
    window.setTimeout(() => setToast(""), 3600);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><ShieldIcon /><div><strong>AI_Finance_Sec</strong><span>AI 금융 보안 비서</span></div></div>
        <div className="system-status"><span className="pulse-dot" /> 실시간 보호 작동 중</div>
      </header>

      <section className="workspace">
        <aside className="sidebar">
          <div className="eyebrow">DEMO SCENARIOS</div>
          <h1>위험 상황을<br />직접 재생해보세요</h1>
          <p className="intro">통화 문장이 입력될 때마다 AI가 위험 신호를 분석하고 먼저 개입합니다.</p>
          <div className="scenario-list">
            {scenarios.map((item, index) => (
              <button key={item.id} className={`scenario-card ${selectedId === item.id ? "active" : ""}`} onClick={() => selectScenario(item.id)}>
                <span className="scenario-number">0{index + 1}</span>
                <span className="scenario-copy"><small>{item.tag}</small><strong>{item.title}</strong><span>{item.description}</span></span>
                <span className="arrow">↗</span>
              </button>
            ))}
          </div>
          <button className={`play-button ${playing ? "paused" : ""}`} onClick={togglePlay}>
            <span>{playing ? "Ⅱ" : "▶"}</span>{playing ? "탐지 일시정지" : lineIndex >= scenario.lines.length - 1 ? "다시 재생하기" : "실시간 탐지 시작"}
          </button>
          <p className="demo-note">데모 전용 · 실제 금융기관에 연결되지 않습니다</p>
        </aside>

        <section className="conversation-panel">
          <div className="panel-heading">
            <div><span className="live-label">LIVE CONVERSATION</span><h2>{scenario.title}</h2></div>
            <div className="call-state"><span className={playing ? "wave active" : "wave"}>▮▮▮</span>{playing ? "통화 분석 중" : "분석 대기"}</div>
          </div>
          <div className="transcript">
            {lineIndex < 0 ? (
              <div className="empty-state"><div className="sound-ring">⌁</div><strong>아직 통화가 시작되지 않았어요</strong><span>왼쪽 하단의 탐지 시작 버튼을 눌러주세요.</span></div>
            ) : scenario.lines.slice(0, lineIndex + 1).map((line, index) => (
              <div className="transcript-row" key={`${line.text}-${index}`}>
                <span className="time">00:{String(index * 4 + 2).padStart(2, "0")}</span>
                <p>{line.text}</p>
                {line.keywords.map((keyword) => <span className="keyword" key={keyword}>{keyword}</span>)}
              </div>
            ))}
          </div>
          <div className="chat-header"><div className="assistant-avatar"><ShieldIcon /></div><div><strong>보안 비서</strong><span><i /> 지금 함께 확인하고 있어요</span></div></div>
          <div className="chat-body">
            {messages.map((message, index) => (
              <div className={`message-wrap ${message.role}`} key={`${message.text}-${index}`}>
                <div className="message">{message.text}</div>
                {message.actions && <div className="action-row"><button onClick={() => mockAction("112 신고 연결")}>☎ 112 신고 연결</button><button onClick={() => mockAction("계좌 지급정지")}>⊘ 계좌 지급정지</button></div>}
              </div>
            ))}
            {score >= 70 && messages.length < 3 && <div className="quick-replies">{quickReplies.map((text) => <button key={text} onClick={() => reply(text)}>{text}</button>)}</div>}
            <div ref={chatEnd} />
          </div>
          <form className="chat-input" onSubmit={sendMessage}>
            <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="상황을 직접 입력해도 좋아요" aria-label="챗봇 메시지" />
            <button aria-label="메시지 보내기">↑</button>
          </form>
        </section>

        <aside className="risk-panel">
          <div className="risk-heading"><span>RISK MONITOR</span><i className={playing ? "active" : ""} /></div>
          <div className={`score-card level-${threatLevel}`}>
            <div className="score-top"><span>실시간 위험도</span><strong>{threatLevel}</strong></div>
            <div className="score-value"><b>{score}</b><span>/ 100</span></div>
            <div className="meter"><i style={{ width: `${score}%` }} /></div>
            <div className="meter-labels"><span>안전</span><span>주의</span><span>위험</span></div>
          </div>
          <div className="log-title"><h3>탐지 로그</h3><span>{Math.max(lineIndex + 1, 0)} signals</span></div>
          <div className="log-list">
            {lineIndex < 0 ? <div className="log-empty">위험 신호가 감지되면<br />여기에 근거가 표시됩니다.</div> : scenario.lines.slice(0, lineIndex + 1).reverse().map((line, index) => (
              <div className="log-item" key={`${line.category}-${index}`}>
                <div className="log-meta"><span>{line.category}</span><b>+{index === 0 ? line.score - (scenario.lines[lineIndex - 1]?.score ?? 0) : 12}</b></div>
                <p>{line.keywords.join(" · ")}</p>
                <small>방금 전</small>
              </div>
            ))}
          </div>
          <div className="safety-tip"><span>TIP</span><p>수사기관과 금융기관은 전화로 앱 설치나 안전계좌 이체를 요구하지 않습니다.</p></div>
        </aside>
      </section>
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </main>
  );
}
