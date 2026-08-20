from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.pagesizes import A3, landscape
from reportlab.pdfbase.pdfmetrics import stringWidth
import os

OUT = "/Users/dongyoungko/Documents/AI_Hacker/output/pdf/AI_Finance_Sec_전체프로세스_플로우차트.pdf"
FONT = "/System/Library/Fonts/Supplemental/AppleGothic.ttf"
pdfmetrics.registerFont(TTFont("AppleGothic", FONT))

W, H = landscape(A3)
c = canvas.Canvas(OUT, pagesize=(W, H))
c.setTitle("AI_Finance_Sec 전체 프로세스 플로우차트")

INK = HexColor("#163832")
TEAL = HexColor("#009275")
TEAL_DARK = HexColor("#006B59")
MINT = HexColor("#EAF6F4")
PALE = HexColor("#F5F9F8")
LINE = HexColor("#B7D8D1")
BLUE = HexColor("#EAF2FF")
BLUE_LINE = HexColor("#5D8DD8")
CORAL = HexColor("#FFF0ED")
CORAL_LINE = HexColor("#E36B5D")
GRAY = HexColor("#667A75")
WHITE = HexColor("#FFFFFF")

def fit_lines(text, max_width, font_size, max_lines=3):
    lines = []
    for paragraph in text.split("\n"):
        words = paragraph.split(" ")
        cur = ""
        for word in words:
            trial = word if not cur else cur + " " + word
            if stringWidth(trial, "AppleGothic", font_size) <= max_width:
                cur = trial
            else:
                if cur:
                    lines.append(cur)
                cur = word
        if cur:
            lines.append(cur)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        while stringWidth(lines[-1] + "…", "AppleGothic", font_size) > max_width and lines[-1]:
            lines[-1] = lines[-1][:-1]
        lines[-1] += "…"
    return lines

def draw_text_center(text, x, y, w, h, size=10, color=INK, max_lines=3, leading=None):
    leading = leading or size * 1.35
    lines = fit_lines(text, w - 14, size, max_lines)
    block_h = len(lines) * leading
    ty = y + (h + block_h) / 2 - leading + 1
    c.setFont("AppleGothic", size)
    c.setFillColor(color)
    for line in lines:
        c.drawCentredString(x + w / 2, ty, line)
        ty -= leading

def box(x, y, w, h, title, subtitle="", fill=WHITE, stroke=LINE, title_color=INK, number=None):
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(1.2)
    c.roundRect(x, y, w, h, 8, fill=1, stroke=1)
    if number:
        c.setFillColor(stroke)
        c.circle(x + 14, y + h - 14, 9, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont("AppleGothic", 7.5)
        c.drawCentredString(x + 14, y + h - 17, str(number))
    if subtitle:
        draw_text_center(title, x + 5, y + h * 0.46, w - 10, h * 0.40, 10.5, title_color, 2, 13)
        draw_text_center(subtitle, x + 8, y + 3, w - 16, h * 0.38, 7.2, GRAY, 4, 9)
    else:
        draw_text_center(title, x + 5, y + 4, w - 10, h - 8, 11, title_color, 3, 14)

def arrow(x1, y1, x2, y2, color=TEAL_DARK, width=1.8, dashed=False):
    c.setStrokeColor(color)
    c.setFillColor(color)
    c.setLineWidth(width)
    if dashed:
        c.setDash(4, 3)
    else:
        c.setDash()
    c.line(x1, y1, x2, y2)
    import math
    ang = math.atan2(y2-y1, x2-x1)
    a = 7
    pts = [
        (x2, y2),
        (x2-a*math.cos(ang-0.55), y2-a*math.sin(ang-0.55)),
        (x2-a*math.cos(ang+0.55), y2-a*math.sin(ang+0.55)),
    ]
    p = c.beginPath()
    p.moveTo(*pts[0]); p.lineTo(*pts[1]); p.lineTo(*pts[2]); p.close()
    c.drawPath(p, fill=1, stroke=0)
    c.setDash()

def lane(y, h, label, fill):
    c.setFillColor(fill)
    c.setStrokeColor(HexColor("#D9E7E3"))
    c.roundRect(22, y, W-44, h, 10, fill=1, stroke=1)
    c.setFillColor(TEAL_DARK)
    c.setFont("AppleGothic", 9)
    c.drawString(36, y+h-18, label)

# Header
c.setFillColor(INK)
c.setFont("AppleGothic", 24)
c.drawString(28, H-38, "AI_Finance_Sec 전체 프로세스")
c.setFillColor(GRAY)
c.setFont("AppleGothic", 10)
c.drawString(28, H-57, "샘플데이터 기반 MVP | 사용자 입력 → RAG → LLM → State → 최종 채팅 응답")

c.setFillColor(MINT)
c.roundRect(W-350, H-63, 322, 34, 8, fill=1, stroke=0)
c.setFillColor(TEAL_DARK)
c.setFont("AppleGothic", 8.5)
c.drawCentredString(W-189, H-49, "P0/P1: 사전 배치 샘플데이터  ·  P2: 실제 실시간 연동")

# Lanes
lane(650, 112, "A. 데모 설정 및 입력", PALE)
lane(414, 220, "B. 컴파일된 Graph 실행", MINT)
lane(226, 172, "C. 예외 처리 및 안전 분기", HexColor("#FFFDFC"))
lane(86, 124, "D. 응답 반환 및 화면 표시", PALE)

# Setup row
setup = [
    (42, "모델 선택", "OpenAI · Claude · Gemini · DeepSeek · Mock"),
    (250, "API 키 확인", "세션 전용 · 저장/로그 금지"),
    (458, "시나리오 선택", "통화 · 거래 · 결합"),
    (666, "샘플데이터 재생", "JSON/Markdown을 순서대로 입력"),
    (874, "사용자 쿼리", "상황 확인 · 질문 · 빠른 응답"),
]
for i,(x,t,s) in enumerate(setup,1):
    box(x, 674, 168, 60, t, s, WHITE, LINE, number=i)
    if i < len(setup): arrow(x+168,704,setup[i][0]-8,704)

# Compile rail
box(42, 552, 164, 48, "Node 정의", "검증 · State · RAG · LLM", BLUE, BLUE_LINE)
box(236, 552, 164, 48, "Edge 정의", "성공/실패 조건과 다음 단계", BLUE, BLUE_LINE)
box(430, 552, 164, 48, "Graph Compile", "실행 가능한 workflow 생성", BLUE, BLUE_LINE)
arrow(206,576,228,576,BLUE_LINE)
arrow(400,576,422,576,BLUE_LINE)

# Main process row
xs = [42, 170, 298, 426, 554, 682, 810, 938]
nodes = [
    ("FastAPI 수신", "POST /api/chat · 입력 검증"),
    ("State 조회", "세션 · 대화 · 현재 단계"),
    ("위험 탐지", "규칙 점수 · 근거 · 임계치"),
    ("RAG 검색", "검증된 대응 지식 Top-K"),
    ("Prompt 조립", "역할 + 이벤트 + 지식 + 이력"),
    ("LLM Router", "4개 API 모델 또는 Mock"),
    ("응답 검증", "형식 · 안전 · 금지 표현"),
    ("액션 결정", "종료 · 확인 · 신고 · 지급정지"),
]
for i,(x,(t,s)) in enumerate(zip(xs,nodes),6):
    box(x, 458, 112, 64, t, s, WHITE, TEAL, number=i)
for i in range(len(xs)-1):
    arrow(xs[i]+112,490,xs[i+1]-7,490)
arrow(512,552,512,530,BLUE_LINE,1.5,True)

# Router adapters callout
box(1060, 450, 98, 80, "모델 어댑터", "OpenAI · Claude\nGemini · DeepSeek\nV4-Flash · Mock", BLUE, BLUE_LINE)
c.setStrokeColor(BLUE_LINE); c.setLineWidth(1.3); c.setDash(4,3)
c.line(738,458,738,440); c.line(738,440,1109,440); c.line(1109,440,1109,450)
c.setDash()
arrow(1109,440,1109,450,BLUE_LINE,1.3,True)

# Exceptions
box(682, 282, 180, 72, "API 호출 실패", "키 오류 · 한도 초과 · 타임아웃", CORAL, CORAL_LINE)
box(892, 282, 180, 72, "Mock Fallback", "결정론적 안전 답변으로 전환", CORAL, CORAL_LINE)
arrow(738,458,738,362,CORAL_LINE,1.5,True)
arrow(862,318,884,318,CORAL_LINE)
arrow(982,282,982,244,CORAL_LINE)

box(364, 282, 180, 72, "응답 검증 실패", "JSON 오류 · 금지 안내 · 과도한 공포", CORAL, CORAL_LINE)
box(154, 282, 180, 72, "안전 기본 응답", "통화 종료 · 공식번호 확인 안내", CORAL, CORAL_LINE)
arrow(866,458,866,378,CORAL_LINE,1.5,True)
c.setStrokeColor(CORAL_LINE); c.setDash(4,3); c.line(866,378,454,378); c.line(454,378,454,362); c.setDash()
arrow(364,318,342,318,CORAL_LINE)
arrow(244,282,244,244,CORAL_LINE)

# Output row
outs = [
    (42, "State 저장", "답변 · 단계 · 추천 액션"),
    (270, "FastAPI 응답", "message · score · evidence · actions"),
    (498, "프론트 상태 갱신", "채팅 · 위험도 · 탐지 근거"),
    (726, "사용자 화면 표시", "답변 말풍선 + 후속 버튼"),
    (954, "다음 입력 대기", "사용자 응답 또는 다음 샘플"),
]
for x,t,s in outs:
    box(x, 112, 188, 64, t, s, WHITE, LINE)
for i in range(len(outs)-1):
    arrow(outs[i][0]+188,144,outs[i+1][0]-8,144)

# Link main to output and fallback merges
arrow(994,458,994,406)
c.setStrokeColor(TEAL_DARK); c.setLineWidth(1.8); c.line(994,406,1138,406); c.line(1138,406,1138,194); c.line(1138,194,136,194)
arrow(136,194,136,184)
c.setStrokeColor(CORAL_LINE); c.setLineWidth(1.5); c.setDash(4,3)
c.line(244,244,244,194); c.line(982,244,982,194)
c.setDash()

# Feedback loop
c.setStrokeColor(TEAL_DARK); c.setLineWidth(1.2); c.setDash(5,3)
c.line(1142,144,1170,144); c.line(1170,144,1170,640); c.line(1170,640,958,640); c.line(958,640,958,666)
c.setDash()
arrow(958,650,958,666,TEAL_DARK,1.2,True)
c.setFillColor(GRAY); c.setFont("AppleGothic",7.5); c.drawRightString(1164,220,"대화/시나리오 반복")

# Footer / legend / sources
c.setFillColor(TEAL); c.circle(30,45,4,fill=1,stroke=0)
c.setFillColor(GRAY); c.setFont("AppleGothic",7.5)
c.drawString(40,42,"청록: 정상 처리")
c.setFillColor(BLUE_LINE); c.circle(132,45,4,fill=1,stroke=0)
c.setFillColor(GRAY); c.drawString(142,42,"파랑: Graph 준비/모델 어댑터")
c.setFillColor(CORAL_LINE); c.circle(315,45,4,fill=1,stroke=0)
c.setFillColor(GRAY); c.drawString(325,42,"주황: 오류·안전 대체 경로")
c.setFont("AppleGothic",6.5)
c.drawRightString(W-28,46,"DeepSeek 공식 API 모델 ID: deepseek-v4-flash")
c.drawRightString(W-28,34,"출처: https://api-docs.deepseek.com/updates/ · https://api-docs.deepseek.com/api/list-models")
c.drawRightString(W-28,22,"AI_Finance_Sec · 2026-08-03")

c.showPage()

# ---------------------------------------------------------------------------
# Page 2: background system
# ---------------------------------------------------------------------------
c.setFillColor(INK)
c.setFont("AppleGothic", 24)
c.drawString(28, H-38, "백그라운드 탐지 시스템")
c.setFillColor(GRAY)
c.setFont("AppleGothic", 10)
c.drawString(28, H-57, "샘플데이터를 화면과 독립적으로 재생·탐지하고, 위험 이벤트를 UI와 챗봇에 전달하는 과정")
c.setFillColor(MINT)
c.roundRect(W-350, H-63, 322, 34, 8, fill=1, stroke=0)
c.setFillColor(TEAL_DARK)
c.setFont("AppleGothic", 8.5)
c.drawCentredString(W-189, H-49, "MVP: FastAPI 내부 Background Task  ·  P2: 외부 실시간 이벤트 수집")

lane(666, 100, "A. 샘플데이터 및 실행 제어", PALE)
lane(390, 258, "B. 백그라운드 탐지 엔진", MINT)
lane(224, 148, "C. 이벤트·상태·로그", HexColor("#F8FBFA"))
lane(78, 128, "D. 소비 화면 및 후속 동작", PALE)

# Control/data source row
top_nodes = [
    (42, "시나리오 저장소", "call_scenarios.json\ntransaction_scenarios.json"),
    (264, "사용자 기준정보", "평균 금액 · 활동 시간 · 기존 수취인"),
    (486, "제어 API", "start · pause · reset · status"),
    (708, "Playback Controller", "시나리오 선택 · 속도 · 현재 위치"),
    (930, "Background Task", "asyncio 루프 · 세션별 독립 실행"),
]
for x,t,s in top_nodes:
    box(x, 690, 190, 56, t, s, WHITE, LINE)
# Scenario data routes below the other control boxes into the playback controller.
c.setStrokeColor(TEAL_DARK); c.setLineWidth(1.3)
c.line(137,690,137,676); c.line(137,676,803,676); c.line(803,676,803,682)
arrow(803,676,803,682,TEAL_DARK,1.3)
arrow(676,718,700,718,TEAL_DARK,1.4)
arrow(898,718,922,718,TEAL_DARK,1.4)
# User baseline feeds the session context without crossing detector nodes.
c.setStrokeColor(BLUE_LINE); c.setLineWidth(1.1); c.setDash(4,3)
c.line(359,690,359,655); c.line(359,655,392,655); c.line(392,655,392,486); c.line(392,486,379,486)
c.setDash(); arrow(392,486,379,486,BLUE_LINE,1.1,True)

# Background engine flow
engine_nodes = [
    (42, 548, 150, 62, "샘플 스트리머", "한 건씩 시간 간격을 두고 발행"),
    (226, 548, 150, 62, "입력 정규화", "call/transaction 공통 Event 변환"),
    (590, 548, 150, 62, "결합 탐지", "통화 직후 거래 · 금액 일치"),
    (774, 548, 150, 62, "위험 점수", "규칙 가중치 · 그룹별 상한"),
    (958, 548, 150, 62, "임계치 판단", "0-39 정상 · 40-69 주의\n70+ 위험 이벤트"),
]
for x,y,w,h,t,s in engine_nodes:
    box(x,y,w,h,t,s,WHITE,TEAL)
arrow(192,579,218,579)
arrow(376,579,582,579)
arrow(740,579,766,579)
arrow(924,579,950,579)

# Feed background task down into streamer
c.setStrokeColor(TEAL_DARK); c.setLineWidth(1.5); c.setDash(4,3)
c.line(1025,690,1025,632); c.line(1025,632,117,632); c.line(117,632,117,618)
c.setDash(); arrow(117,632,117,618,TEAL_DARK,1.5,True)

# Parallel detectors (between normalizer and correlation)
box(408, 557, 150, 48, "통화 규칙 탐지", "기관 사칭 · 긴급성 · 금전 요구", BLUE, BLUE_LINE)
box(408, 472, 150, 48, "거래 규칙 탐지", "신규 수취인 · 속도 · 금액 급증", BLUE, BLUE_LINE)
c.setStrokeColor(BLUE_LINE); c.setLineWidth(1.4); c.setDash(4,3)
c.line(376,579,400,579); c.line(400,579,400,496); c.line(400,581,408,581); c.line(400,496,408,496)
c.line(558,581,576,581); c.line(558,496,576,496); c.line(576,496,576,581); c.line(576,581,582,581)
c.setDash()
arrow(400,581,408,581,BLUE_LINE,1.3,True)
arrow(400,496,408,496,BLUE_LINE,1.3,True)
arrow(576,581,582,581,BLUE_LINE,1.3,True)

# Rules/config control rail
box(42, 424, 206, 54, "탐지 규칙 설정", "키워드 · 가중치 · 임계치 · 중복 억제", BLUE, BLUE_LINE)
box(276, 424, 206, 54, "세션 Context", "최근 통화·거래 · 누적 점수 · 진행 위치", BLUE, BLUE_LINE)
box(510, 424, 206, 54, "상태 머신", "idle → playing → alerted → completed", BLUE, BLUE_LINE)
c.setStrokeColor(BLUE_LINE); c.setLineWidth(1.2); c.setDash(4,3)
c.line(145,478,145,535); c.line(379,478,379,535); c.line(613,478,613,535)
c.setDash()

# Events/state/log lane
box(42, 270, 188, 62, "Detection Event", "score · level · category · evidence", WHITE, TEAL)
box(270, 270, 188, 62, "Event Broker", "세션 이벤트를 UI/Chat과 분리", WHITE, TEAL)
box(498, 270, 188, 62, "Session State", "현재 점수 · 진행 단계 · 최근 이벤트", WHITE, LINE)
box(726, 270, 188, 62, "Detection Log", "입력 · 규칙 적중 · 점수 변화 기록", WHITE, LINE)
box(954, 270, 188, 62, "Push Channel", "WebSocket/SSE 또는 데모 폴링", WHITE, TEAL)

# Threshold to event; event flow
c.setStrokeColor(TEAL_DARK); c.setLineWidth(1.5)
c.line(1033,548,1033,352); c.line(1033,352,136,352); c.line(136,352,136,340)
arrow(136,352,136,340)
arrow(230,301,262,301)
arrow(458,301,490,301)
c.setStrokeColor(TEAL_DARK); c.setLineWidth(1.3); c.setDash(4,3)
c.line(364,270,364,252); c.line(364,252,820,252)
c.line(592,252,592,262); c.line(820,252,820,262)
c.setDash(); arrow(592,252,592,262,TEAL_DARK,1.2,True); arrow(820,252,820,262,TEAL_DARK,1.2,True)
arrow(914,301,946,301)

# Normal events also update state/log without alert
c.setFillColor(GRAY); c.setFont("AppleGothic",7.2)
c.drawString(926,518,"임계치 미만: State/Log만 갱신")
c.setStrokeColor(GRAY); c.setLineWidth(1.0); c.setDash(3,3)
c.line(1002,548,1002,382); c.line(1002,382,592,382); c.line(592,382,592,340)
c.setDash(); arrow(592,382,592,340,GRAY,1.0,True)

# Consumer lane
consumers = [
    (42, "위험 모니터", "점수 · 근거 · 거래 타임라인"),
    (278, "선제 챗봇", "위험 이벤트 수신 후 먼저 질문"),
    (514, "대응 액션 UI", "통화 종료 · 확인 · 신고 · 지급정지"),
    (750, "세션 이력", "최근 탐지 흐름 재생 · 초기화"),
    (986, "데모 제어", "재생 상태 · 진행률 · 오류 표시"),
]
for x,t,s in consumers:
    box(x, 108, 196, 62, t, s, WHITE, LINE)

# Push branches to consumers, connectors routed above boxes
c.setStrokeColor(TEAL_DARK); c.setLineWidth(1.3)
c.line(1048,270,1048,192); c.line(140,192,1084,192)
for center in [140,376,612,848,1084]:
    c.line(center,192,center,178)
    arrow(center,192,center,178,TEAL_DARK,1.2)

# Feedback control from consumers to control API
c.setStrokeColor(TEAL_DARK); c.setLineWidth(1.1); c.setDash(5,3)
c.line(1084,108,1084,62); c.line(1084,62,1168,62); c.line(1168,62,1168,654); c.line(1168,654,581,654); c.line(581,654,581,682)
c.setDash(); arrow(581,666,581,682,TEAL_DARK,1.1,True)
c.setFillColor(GRAY); c.setFont("AppleGothic",7.3); c.drawRightString(1162,74,"시작·일시정지·초기화 요청")

# Bottom scope note
c.setFillColor(MINT); c.roundRect(28,24,W-56,34,7,fill=1,stroke=0)
c.setFillColor(TEAL_DARK); c.setFont("AppleGothic",8.2)
c.drawString(42,38,"P0/P1 데모")
c.setFillColor(GRAY)
c.drawString(111,38,"사전 배치 JSON/Markdown을 FastAPI Background Task가 재생 - 외부 금융 API 없이 동일 시나리오를 반복 재현")
c.setFillColor(CORAL_LINE); c.drawString(730,38,"P2 실제 서비스")
c.setFillColor(GRAY)
c.drawString(810,38,"통화 전사·문자·금융사 거래 스트림을 외부 이벤트 브로커로 수집")

c.setFillColor(GRAY); c.setFont("AppleGothic",6.5)
c.drawRightString(W-28,12,"AI_Finance_Sec · Background Detection System · 2026-08-03")

c.showPage()
c.save()
print(OUT)
