# AI_Finance_Sec 데모 운영가이드

## 1. 가장 안전한 기본 시연(Mock)

1. 배포 URL `https://ai-finance-sec.headonggumdo.chatgpt.site`을 연다.
2. 우측 상단 모델이 `Mock`인지 확인한다.
3. `검찰·금감원 사칭`을 선택하고 `샘플 분석 시작`을 누른다.
4. 상단 State→탐지→RAG→리랭킹→생성→안전검증 진행, 우측 통화·거래 결합 위험도와 근거 Top 3를 설명한다.
5. `정상 은행 상담`도 실행해 위험 단어가 있어도 오탐을 줄이는 Hard Negative를 보여준다.
6. 채팅에 `이미 송금했어요. 무엇부터 해야 하나요?`를 입력해 피해 직후 대응 안내를 확인한다.

## 2. 실제 LLM 시연(BYOK)

1. 우측 상단 `설정`을 누른다.
2. OpenAI·DeepSeek·Claude·Gemini·Qwen 중 하나를 선택한다.
3. 본인의 해당 Provider API 키를 입력하고 적용한다.
4. 채팅 질문을 입력한다. 키는 페이지 메모리에만 있고 저장되지 않는다.
5. 호출 실패 또는 안전검증 실패 시 `Mock Safety Fallback` 표시와 함께 안전응답으로 전환된다.

ChatGPT Pro 구독은 OpenAI API 사용권·크레딧과 별개다. OpenAI를 실제 호출하려면 별도의 OpenAI API 키와 결제 설정이 필요하다.

## 3. 데모 영상 권장 순서(약 3분)

- 0:00 서비스 문제와 합성 데이터 고지
- 0:20 기관사칭 샘플 시작, 상단 처리 흐름 설명
- 0:55 거래결합 위험도·RAG 근거·정탐 표시
- 1:25 정상 Hard Negative로 오탐 대응 설명
- 1:55 모델 설정을 열고 본인의 API 키를 직접 입력
- 2:15 멀티턴 질문과 Safety Verifier/폴백 설명
- 2:45 P2의 실제 금융사 데이터·규제·레거시 연동 범위 고지

영상 편집 시 API 키 입력값이 프레임에 노출되지 않도록 비밀번호 마스킹을 유지하고 개발자도구 Network 화면은 촬영하지 않는다.

## 4. 로컬 실행

```bash
cd /Users/dongyoungko/Documents/AI_Hacker/AI_Finance_Sec
npm install
npm run dev
```

브라우저에서 <http://localhost:3000>을 연다. 제출 전에는 `npm run build && npm test`를 실행한다.

## 5. 장애 시 대응

- 외부 모델 호출 실패: Mock으로 전환해 시연을 계속한다.
- API 키 오류: Provider와 키 발급처가 일치하는지 확인한다.
- 모델 ID 미지원: 계정에서 허용된 모델명으로 `app/lib/engine.ts`와 환경 설정을 수정한다.
- 배포 URL 접속 실패: 로컬 Mock 데모와 녹화본을 백업으로 사용한다.
