# AI_Finance_Sec RAG·평가·분석 에이전트 설계

작성일: 2026-08-03

## 1. 설계 결정 요약

- 리랭킹: 사용한다.
- RAGAS: 오프라인 회귀평가에 사용한다.
- 생성 결과 분석기: 런타임에 단일 안전 검증기를 사용한다.
- 정탐·오탐 분석: 라벨 평가셋을 사용하는 오프라인 평가기로 분리한다.
- 다중 LLM 합의: 기본 요청 경로에서는 사용하지 않고, 경계 사례 평가 배치에서만 선택적으로 사용한다.

## 2. RAG 검색 구조

```text
사용자 질문 + 탐지 위험유형
        ↓
메타데이터 필터
(기관·문서상태·게시일·위험유형)
        ↓
BM25 키워드 검색 + BGE-M3 Dense 검색
        ↓
RRF로 후보 결합(Top 20)
        ↓
BGE Reranker Cross-Encoder(Top 5)
        ↓
권위·최신성·중복 제거
        ↓
생성 모델 컨텍스트(Top 3)
```

### 리랭킹을 사용하는 이유

보이스피싱 안내에는 `검찰`, `안전계좌`, `지급정지`, `악성 앱`처럼 정확한 용어 일치가 중요하지만, 사용자는 같은 상황을 구어체로 표현한다. Dense 검색만 쓰면 구체적인 공식 안내보다 의미가 비슷한 일반 문서를 올릴 수 있고, BM25만 쓰면 구어체 표현을 놓칠 수 있다. Hybrid 후보를 만든 뒤 Cross-Encoder로 질문과 문서를 함께 읽어 순위를 조정하는 것이 적합하다.

다만 리랭커는 없는 문서를 만들어낼 수 없다. 먼저 Recall@20을 확보하고, 리랭킹 적용 전후의 MRR·nDCG·Context Precision 개선이 확인될 때만 운영에 유지한다.

## 3. 지식 문서 메타데이터

각 Chunk는 다음 필드를 가진다.

- `document_id`, `chunk_id`
- `title`, `content`
- `authority`: 경찰청, 금융감독원, 금융보안원 등
- `source_url`
- `published_at`, `reviewed_at`
- `status`: current, historical, experimental
- `risk_types`
- `supersedes`, `superseded_by`

`historical` 또는 폐기 문서는 기본 검색에서 제외한다. 게시일만으로 권위를 추론하지 않고 기관과 문서 상태를 명시적으로 필터링한다.

## 4. 생성 및 안전 검증 구조

```text
탐지기 병렬 실행
  ├─ 통화·문자 규칙/분류
  ├─ 거래 이상 탐지
  └─ 사용자 기준선 비교
        ↓
점수 보정·복합 위험 판단
        ↓
RAG 검색·리랭킹
        ↓
LLM 답변 생성
        ↓
Safety Verifier
  ├─ 근거 없는 주장
  ├─ 실제 신고·지급정지 실행 주장
  ├─ 필수 행동 누락
  ├─ 위험도와 문구 불일치
  └─ 개인정보 재노출
        ↓
통과 → 최종 답변
실패 → 안전 템플릿 또는 1회 재생성
```

### 왜 정탐·오탐·최종분석 LLM 세 개를 직렬 배치하지 않는가

- 동일 입력과 비슷한 프롬프트를 쓰면 오류가 상관되어 다수결 신뢰도가 과대평가될 수 있다.
- 위기 안내의 지연과 API 비용이 커진다.
- 정탐·오탐은 생성모델의 의견보다 실제 라벨과 임계값을 기준으로 계산해야 한다.

따라서 런타임에는 한 개의 안전 검증기만 두고, 배치 평가에서 TP·TN·FP·FN을 분석한다. 경계 사례만 서로 다른 Provider의 Judge 두 개와 사람 검토 대상으로 보낸다.

## 5. 평가 체계

### 5.1 탐지 평가

- Precision, Recall, F1, Macro F1, PR-AUC
- False Positive Rate, False Negative Rate
- 위험유형별 Recall
- 임계값별 비용 행렬
- 시간 순서 기반 평가와 시나리오군 단위 분할

### 5.2 검색 평가

- Recall@5, Recall@20
- MRR@10, nDCG@10
- 리랭킹 전후 Context Precision
- 권위 없는 문서가 Top 3에 포함된 비율

### 5.3 RAGAS 사용 범위

RAGAS는 다음 네 지표를 오프라인 회귀평가에 사용한다.

- Faithfulness: 답변의 주장이 검색 근거에 의해 지지되는가
- Answer Relevancy: 사용자 질문에 직접 답했는가
- Context Precision: 상위 검색 문서가 실제로 유용한가
- Context Recall: 정답에 필요한 근거가 검색되었는가

RAGAS는 LLM-as-a-Judge 변동성이 있으므로 다음 통제를 적용한다.

- 평가 모델과 프롬프트 버전을 고정한다.
- 동일 데이터에 2회 이상 반복하고 평균·분산을 기록한다.
- 라벨 기반 탐지 지표와 분리해 보고한다.
- 20개 이상의 핵심 사례는 사람이 근거·행동 정확성을 재검토한다.
- 모델 교체 시 동일 평가셋으로 회귀 테스트한다.

### 5.4 MVP 합격 기준

| 영역 | 기준 |
|---|---|
| 위험 탐지 | 데모 평가셋 Macro F1 ≥ 0.80 |
| 위험 누락 | 위험 시나리오 Recall ≥ 0.90 |
| 오탐 | Hard Negative FPR ≤ 0.15 |
| 검색 | Recall@5 ≥ 0.90 |
| 답변 근거 | RAGAS Faithfulness ≥ 0.85 또는 사람 평가 동등 기준 |
| 행동 정확성 | 위험유형별 필수 행동 포함률 ≥ 0.95 |
| 안전성 | 실제 신고·지급정지를 수행했다고 허위 주장하는 응답 0건 |

## 6. 구현 단계

- P0: 합성 시나리오, 결정적 탐지·답변, 실행 추적, 라벨 기반 혼동행렬
- P1: Hybrid 검색, RRF, 선택적 Cross-Encoder, 실제 Provider BYOK, 안전 검증기, RAGAS 배치
- P2: 금융사 데이터 어댑터, 실시간 이벤트, 영속 Checkpointer, 승인된 내부 지식베이스, 사람 검토 큐

## 7. 근거 자료

- RAGAS 원 논문: https://arxiv.org/abs/2309.15217
- RAGAS 공식 저장소: https://github.com/explodinggradients/ragas
- Fraud Detection Handbook: https://github.com/Fraud-Detection-Handbook/fraud-detection-handbook
- BGE-M3: https://huggingface.co/BAAI/bge-m3
- BGE Reranker v2 M3: https://huggingface.co/BAAI/bge-reranker-v2-m3

