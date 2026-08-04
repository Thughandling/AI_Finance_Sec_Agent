"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  analyzeText,
  buildMockAnswer,
  calculateEvaluation,
  pipelineSteps,
  providers,
  retrieveAndRerank,
  scenarios,
  verifyAnswer,
  type DetectionResult,
  type ProviderId,
} from "./lib/engine";

type Message = {
  role: "assistant" | "user";
  text: string;
  model?: string;
  actions?: boolean;
  fallback?: boolean;
};

type LocalGraphResponse = {
  answer?: string;
  error?: string;
  model?: string;
  trace?: string[];
  fallback?: boolean;
  safety?: { passed?: boolean };
  turn_count?: number;
};

function ShieldIcon() {
  return <span className="shield" aria-hidden="true"><span>✓</span></span>;
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export default function Home() {
  const [selectedId, setSelectedId] = useState(scenarios[0].id);
  const [playing, setPlaying] = useState(false);
  const [lineIndex, setLineIndex] = useState(-1);
  const [providerId, setProviderId] = useState<ProviderId>("mock");
  const [apiKey, setApiKey] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [toast, setToast] = useState("");
  const [actualTrace, setActualTrace] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", text: "안녕하세요. 합성 통화·거래 시나리오를 분석하고, 공식 대응 지식을 근거로 다음 행동을 안내합니다.", model: "Mock Safety Engine" },
  ]);
  const chatEnd = useRef<HTMLDivElement>(null);
  const sessionId = useRef("");

  const scenario = useMemo(() => scenarios.find((item) => item.id === selectedId) ?? scenarios[0], [selectedId]);
  const provider = providers.find((item) => item.id === providerId) ?? providers[0];
  const evaluation = useMemo(() => calculateEvaluation(), []);
  const transcript = lineIndex >= 0 ? scenario.lines.slice(0, lineIndex + 1).map((line) => line.text).join(" ") : "";
  const transactionRisk = lineIndex >= 2 ? scenario.transactionSignals.reduce((sum, item) => sum + item.risk, 0) : 0;
  const baseDetection = analyzeText(transcript, transactionRisk);
  const curatedScore = lineIndex >= 0 ? scenario.lines[lineIndex]?.score ?? 0 : 0;
  const score = Math.max(baseDetection.score, curatedScore);
  const level: DetectionResult["level"] = score >= 70 ? "위험" : score >= 40 ? "주의" : "안전";
  const detection: DetectionResult = { ...baseDetection, score, level, verdict: score >= 40 ? "사기" : "정상" };
  const retrieved = retrieveAndRerank(transcript || scenario.description, detection.riskType);
  const finalVerification = messages.filter((message) => message.role === "assistant").at(-1);
  const hasChatTurn = messages.some((message) => message.role === "user");
  const verification = (lineIndex >= 0 || hasChatTurn) && finalVerification ? verifyAnswer(finalVerification.text, detection) : null;

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      if (lineIndex >= scenario.lines.length - 1) {
        setPlaying(false);
        const answer = buildMockAnswer(detection, retrieved, transcript);
        setMessages((previous) => [...previous, { role: "assistant", text: answer, model: "Mock Safety Engine", actions: detection.verdict === "사기" }]);
        return;
      }
      setLineIndex((value) => value + 1);
    }, lineIndex >= scenario.lines.length - 1 ? 0 : lineIndex < 0 ? 450 : 1250);
    return () => window.clearTimeout(timer);
  }, [playing, lineIndex, scenario]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function selectScenario(id: string) {
    setSelectedId(id);
    setPlaying(false);
    setLineIndex(-1);
    setActualTrace([]);
    setMessages([{ role: "assistant", text: "시나리오가 준비됐습니다. 탐지 시작을 누르면 State와 분석 결과가 단계별로 갱신됩니다.", model: "Mock Safety Engine" }]);
  }

  function togglePlay() {
    if (lineIndex >= scenario.lines.length - 1) {
      setLineIndex(-1);
      setMessages([{ role: "assistant", text: "새 분석 세션을 시작합니다. 위험 신호와 정상성 근거를 함께 확인하겠습니다.", model: "Mock Safety Engine" }]);
    }
    setPlaying((value) => !value);
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3600);
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const value = input.trim();
    if (!value || loading) return;
    if (providerId !== "mock" && providerId !== "ollama" && !apiKey) {
      setSettingsOpen(true);
      showToast("실제 모델 호출에는 선택한 Provider의 API 키가 필요합니다.");
      return;
    }

    setInput("");
    setMessages((previous) => [...previous, { role: "user", text: value }]);
    // 자유 채팅은 선택된 샘플 거래 State와 분리해 교차 오염을 막는다.
    const currentDetection = analyzeText(value, 0);
    const documents = retrieveAndRerank(value, currentDetection.riskType);
    const mockAnswer = buildMockAnswer(currentDetection, documents, value);

    if (providerId === "mock") {
      setActualTrace([]);
      setMessages((previous) => [...previous, { role: "assistant", text: mockAnswer, model: provider.model, actions: currentDetection.verdict === "사기" }]);
      return;
    }

    setActualTrace([]);
    setLoading(true);
    try {
      if (!sessionId.current) sessionId.current = `web-${crypto.randomUUID()}`;
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: providerId,
          apiKey,
          model: provider.model,
          sessionId: sessionId.current,
          message: value,
          history: messages.slice(-6).map((message) => ({ role: message.role, content: message.text })),
          context: JSON.stringify({ detection: currentDetection, documents }, null, 2),
        }),
      });
      const data = await response.json() as LocalGraphResponse;
      if (!response.ok || !data.answer) throw new Error(data.error || "모델 응답을 확인할 수 없습니다.");
      const check = providerId === "ollama" && data.safety ? { passed: Boolean(data.safety.passed), checks: [] } : verifyAnswer(data.answer, currentDetection);
      const safeAnswer = check.passed ? data.answer : mockAnswer;
      setActualTrace(providerId === "ollama" ? data.trace ?? [] : []);
      setMessages((previous) => [...previous, {
        role: "assistant",
        text: safeAnswer,
        model: data.fallback || !check.passed ? "Mock Safety Fallback" : data.model ?? provider.model,
        actions: currentDetection.verdict === "사기",
        fallback: Boolean(data.fallback) || !check.passed,
      }]);
    } catch (error) {
      setActualTrace([]);
      setMessages((previous) => [...previous, { role: "assistant", text: mockAnswer, model: "Mock Safety Fallback", actions: currentDetection.verdict === "사기", fallback: true }]);
      const reason = error instanceof Error ? error.message : "모델 연결 실패";
      showToast(`${providerId === "ollama" ? "로컬 FastAPI/Ollama" : "외부 모델"} 호출에 실패해 Mock 안전응답으로 전환했습니다. ${reason}`.slice(0, 180));
    } finally {
      setLoading(false);
    }
  }

  const completedStep = actualTrace.length > 0 ? actualTrace.length : lineIndex < 0 ? 0 : lineIndex < 1 ? 2 : lineIndex < 3 ? 4 : 7;
  const displayedPipeline = actualTrace.length > 0 ? actualTrace : pipelineSteps;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><ShieldIcon /><div><strong>AI_Finance_Sec</strong><span>근거 기반 AI 금융 보안 비서</span></div></div>
        <button className="provider-button" onClick={() => setSettingsOpen(true)} aria-label="AI 모델 설정 열기">
          <span className={`provider-dot ${providerId}`} />
          <span><small>ACTIVE MODEL</small><strong>{provider.label}</strong></span>
          <b>설정</b>
        </button>
      </header>

      <section className="pipeline" aria-label="AI 처리 단계">
        <div className="pipeline-title"><span>{actualTrace.length > 0 ? "LANGGRAPH ACTUAL TRACE" : "SIMULATED DEMO FLOW"}</span><strong>{actualTrace.length > 0 ? "FastAPI 실행 결과" : "샘플 처리 과정"}</strong></div>
        <div className="pipeline-steps">
          {displayedPipeline.map((step, index) => (
            <div className={`pipeline-step ${index < completedStep ? "done" : index === completedStep ? "active" : ""}`} key={step}>
              <i>{index < completedStep ? "✓" : index + 1}</i><span>{step}</span>{index < displayedPipeline.length - 1 && <b>→</b>}
            </div>
          ))}
        </div>
      </section>

      <section className="workspace">
        <aside className="sidebar">
          <div className="eyebrow">DEMO SCENARIOS · SYNTHETIC</div>
          <h1>정상과 위험을<br />함께 검증합니다</h1>
          <p className="intro">위험 사례만 보여주지 않고 Hard Negative를 포함해 오탐 가능성도 확인합니다.</p>
          <div className="scenario-list">
            {scenarios.map((item, index) => (
              <button key={item.id} className={`scenario-card ${selectedId === item.id ? "active" : ""}`} onClick={() => selectScenario(item.id)}>
                <span className="scenario-number">0{index + 1}</span>
                <span className="scenario-copy"><small>{item.tag}</small><strong>{item.title}</strong><span>{item.description}</span></span>
                <span className={`expected ${item.expectedLabel}`}>{item.expectedLabel}</span>
              </button>
            ))}
          </div>
          <button className={`play-button ${playing ? "paused" : ""}`} onClick={togglePlay}>
            <span>{playing ? "Ⅱ" : "▶"}</span>{playing ? "분석 일시정지" : lineIndex >= scenario.lines.length - 1 ? "다시 분석하기" : "샘플 분석 시작"}
          </button>
          <div className="eval-summary">
            <div><span>검증셋</span><strong>{evaluation.total}</strong></div>
            <div><span>Macro F1</span><strong>{percent(evaluation.macroF1)}</strong></div>
            <div><span>위험 Recall</span><strong>{percent(evaluation.recall)}</strong></div>
          </div>
          <p className="demo-note">데모 전용 합성 데이터 · 실제 금융기관 조치 없음</p>
        </aside>

        <section className="conversation-panel">
          <div className="panel-heading">
            <div><span className="live-label">CALL & TRANSACTION CORRELATION</span><h2>{scenario.title}</h2></div>
            <div className="state-badge"><span className={playing ? "wave active" : "wave"}>▮▮▮</span>{playing ? "State 갱신 중" : lineIndex >= scenario.lines.length - 1 ? "분석 완료" : "분석 대기"}</div>
          </div>

          <div className="transcript">
            {lineIndex < 0 ? (
              <div className="empty-state"><div className="sound-ring">⌁</div><strong>분석할 샘플이 준비되었습니다</strong><span>왼쪽의 샘플 분석 시작 버튼을 눌러주세요.</span></div>
            ) : scenario.lines.slice(0, lineIndex + 1).map((line, index) => (
              <div className="transcript-row" key={`${line.text}-${index}`}>
                <span className="time">00:{String(index * 4 + 2).padStart(2, "0")}</span>
                <p>{line.text}</p>
                <span className="category">{line.category}</span>
                {line.keywords.map((keyword) => <span className="keyword" key={keyword}>{keyword}</span>)}
              </div>
            ))}
          </div>

          <div className="chat-header">
            <div className="assistant-avatar"><ShieldIcon /></div>
            <div><strong>보안 비서</strong><span><i /> {provider.label} · 멀티턴 세션</span></div>
            <span className={`verifier ${verification?.passed ? "passed" : ""}`}>{verification?.passed ? "Safety 검증 통과" : "Safety 검증 대기"}</span>
          </div>
          <div className="chat-body">
            {messages.map((message, index) => (
              <div className={`message-wrap ${message.role}`} key={`${message.text}-${index}`}>
                <div className="message">{message.text}</div>
                {message.model && <small className="model-trace">{message.model}{message.fallback ? " · fallback" : ""}</small>}
                {message.actions && <div className="action-row"><button onClick={() => showToast("112 연결 절차를 시뮬레이션했습니다. 실제 신고는 수행되지 않습니다.")}>☎ 112 대응 안내</button><button onClick={() => showToast("금융회사 지급정지 요청 절차를 시뮬레이션했습니다.")}>⊘ 지급정지 절차</button></div>}
              </div>
            ))}
            {loading && <div className="thinking"><span /><span /><span /> 선택 모델이 근거를 확인하고 있습니다</div>}
            <div ref={chatEnd} />
          </div>
          <form className="chat-input" onSubmit={sendMessage}>
            <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="예: 이미 송금했어요. 무엇부터 해야 하나요?" aria-label="챗봇 메시지" />
            <button disabled={loading} aria-label="메시지 보내기">↑</button>
          </form>
        </section>

        <aside className="risk-panel">
          <div className="risk-heading"><span>EXPLAINABLE RISK</span><i className={playing ? "active" : ""} /></div>
          <div className={`score-card level-${level}`}>
            <div className="score-top"><span>통합 위험도</span><strong>{level}</strong></div>
            <div className="score-value"><b>{score}</b><span>/ 100</span></div>
            <div className="meter"><i style={{ width: `${score}%` }} /></div>
            <div className="meter-labels"><span>안전</span><span>주의</span><span>위험</span></div>
            <div className="verdict-row"><span>기대 라벨 {scenario.expectedLabel}</span><strong className={detection.verdict === scenario.expectedLabel ? "correct" : "wrong"}>{lineIndex < 0 ? "대기" : detection.verdict === scenario.expectedLabel ? "정탐" : scenario.expectedLabel === "정상" ? "오탐" : "미탐"}</strong></div>
          </div>

          <div className="section-title"><h3>거래 결합 신호</h3><span>{lineIndex >= 2 ? "활성" : "대기"}</span></div>
          <div className="signal-list">
            {scenario.transactionSignals.map((signal) => <div className="signal-item" key={signal.label}><span>{signal.label}<small>{signal.value}</small></span><b className={lineIndex >= 2 && signal.risk > 0 ? "risk" : ""}>+{lineIndex >= 2 ? signal.risk : 0}</b></div>)}
          </div>

          <div className="section-title"><h3>RAG 근거 Top 3</h3><span>RRF reranked</span></div>
          <div className="source-list">
            {retrieved.map((document, index) => <a href={document.sourceUrl} target="_blank" rel="noreferrer" className="source-item" key={document.id}><i>{index + 1}</i><span><strong>{document.title}</strong><small>{document.authority} · {document.id}</small></span><b>↗</b></a>)}
          </div>
        </aside>
      </section>

      {settingsOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setSettingsOpen(false)}>
        <section className="model-modal" role="dialog" aria-modal="true" aria-label="AI 모델 설정">
          <div className="modal-heading"><div><span>BYOK MODEL ROUTER</span><h2>시연 모델을 선택하세요</h2><p>API 키는 현재 브라우저 메모리와 1회 요청에만 사용하며 저장하지 않습니다.</p></div><button onClick={() => setSettingsOpen(false)} aria-label="설정 닫기">×</button></div>
          <div className="provider-grid">
            {providers.map((item) => <button key={item.id} className={providerId === item.id ? "selected" : ""} onClick={() => { setProviderId(item.id); setApiKey(""); setActualTrace([]); }}><span className={`provider-dot ${item.id}`} /><span><strong>{item.label}</strong><small>{item.model}</small></span><b>{item.badge}</b></button>)}
          </div>
          {providerId !== "mock" && providerId !== "ollama" ? <label className="key-field"><span>{provider.keyName}</span><input type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="API 키를 붙여 넣으세요" /><small>키는 서버 프록시를 경유합니다. 저장하지 않지만 공개 시연보다 로컬 실행과 제한된 촬영용 키를 권장합니다.</small></label> : providerId === "ollama" ? <div className="mock-notice"><strong>로컬 LangGraph 권장 모드</strong><span>FastAPI와 Ollama가 같은 PC에서 실행되어야 합니다. 공개 배포 URL에서는 사용자 PC의 localhost에 접근할 수 없어 Mock으로 폴백합니다.</span></div> : <div className="mock-notice"><strong>심사용 권장 모드</strong><span>외부 서비스 없이 State, 탐지, RAG, 리랭킹, 답변, 안전검증 전 과정을 재현합니다.</span></div>}
          <button className="apply-model" onClick={() => setSettingsOpen(false)}>{providerId === "mock" || providerId === "ollama" || apiKey ? `${provider.label} 적용` : "API 키 입력 후 적용"}</button>
        </section>
      </div>}
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </main>
  );
}
