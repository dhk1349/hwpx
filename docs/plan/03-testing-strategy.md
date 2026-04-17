# 테스트 전략

## 1. 테스트 피라미드

```
                 ┌──────────────┐
                 │  Smoke (수동) │   ← 한컴오피스 오픈 확인 (릴리스 게이트)
                 └──────────────┘
              ┌────────────────────┐
              │   E2E (Playwright) │   ← 주요 시나리오 자동화
              └────────────────────┘
         ┌──────────────────────────────┐
         │ 컴포넌트 / 통합 (Vitest+RTL)  │   ← 툴바/다이얼로그/에디터
         └──────────────────────────────┘
  ┌──────────────────────────────────────────────┐
  │ 단위 테스트 (Vitest) + Property test(fast-check)│   ← 최대 볼륨
  └──────────────────────────────────────────────┘
```

## 2. 레이어별 테스트

### 2.1 hwpx-codec (최대 중점)

**단위 테스트**

- XML 파서 입력 → 모델 객체 정확 일치 (각 요소 최소 3개 변형)
- 엣지케이스: 빈 문서, 구역 여러 개, 중첩 표, 깊이 10+ 문단, 대용량

**Property tests (fast-check)**

- `roundtrip`: 임의 `HwpxDocument` 생성 → 직렬화 → 역파싱 → **의미 동일**
- `opaque preservation`: 미지원 요소를 랜덤 삽입해도 라운드트립에서 보존
- `id stability`: header.xml 의 ID 가 저장 간 안정 (또는 의도된 재할당 규칙 준수)

**통합 테스트**

- 실제 HWPX 픽스처 20+ 종 (공공 양식, 한컴 샘플, 자체 생성)
- 각 파일에 대해 `parse → assert invariants` 체크리스트

**한컴오피스 골든 테스트 (반자동)**

- CI 에서 ZIP 생성 → 수동 단계에서 한컴오피스 / 뷰어로 오픈 확인
- 릴리스 차단 게이트

### 2.2 hwpx-schema

**단위 테스트**

- `toPM`: 각 요소 HWPX → PM 변환 스냅샷
- `fromPM`: 각 PM 구조 → HWPX 변환 스냅샷
- 마크 조합이 새 charPr 로 upsert 되는지 검증
- 미사용 refID 정리 로직 검증

**Round-trip**

- `fromPM ∘ toPM` 및 `toPM ∘ fromPM` 안정성

### 2.3 hwpx-editor

**컴포넌트 테스트 (@testing-library)**

- 툴바 버튼 클릭 → PM transaction 발생
- 키보드 단축키 처리
- 선택 변경 시 활성 마크 반영

**E2E (Playwright)**
주요 시나리오 (각 시나리오는 실제 픽스처 로드로 시작):

1. 열기 → 텍스트 추가 → 저장 → 재업로드 → 추가된 텍스트 보임
2. 표 삽입 → 셀 편집 → 행 삽입 → 저장 → 다시 열어도 구조 유지
3. 이미지 드래그 삽입 → 크기 조정 → 저장 → 바이너리 포함 확인
4. 스타일 변경 → 저장 → 한컴오피스가 동일 스타일로 렌더 (수동)
5. 한글 IME 로 복잡한 문장 입력 → 조합 중 백스페이스/커서 이동
6. Undo / Redo 10단계 안정성
7. 오프로드 큰 파일(10MB) 열기 — 에디터가 응답

**시각적 회귀 (선택)**

- Playwright screenshot + pixel diff
- 기준 스냅샷 관리 필요 → 초반에는 생략, v0.9부터 도입

### 2.4 접근성

- `jest-axe` 또는 `@axe-core/playwright` 로 자동화
- 키보드 네비게이션: 툴바/메뉴/에디터 간 이동
- 스크린 리더 실제 테스트: NVDA, VoiceOver (수동)

### 2.5 성능

**벤치마크 (Vitest bench)**

- 파싱 벤치: 100KB / 1MB / 10MB HWPX
- 직렬화 벤치
- 커서 이동 / 타이핑 프레임 시간

**Lighthouse CI**

- 에디터 페이지 성능 ≥ 80, 접근성 ≥ 95

## 3. 테스트 픽스처 전략

### 필수 픽스처 (초기 10종)

1. `empty.hwpx` — 빈 문서 (문단 1)
2. `text-only.hwpx` — 다국어 텍스트 (한글/영문/숫자/이모지)
3. `formatting.hwpx` — bold/italic/underline/color/size 조합
4. `paragraphs.hwpx` — 정렬/들여쓰기/줄간격 다양
5. `lists.hwpx` — 순서/비순서/중첩
6. `tables.hwpx` — 간단/병합/중첩
7. `images.hwpx` — PNG/JPG, 크기 다양, 정렬 다양
8. `hyperlinks-bookmarks.hwpx` — 링크/북마크/각주
9. `multi-section.hwpx` — 3개 구역, 페이지 설정 다름
10. `edge-cases.hwpx` — 긴 문서, 깊은 중첩, 미지원 요소 (메모/수식/도형)

### 생성 파이프라인

- **python-hwpx** 스크립트로 프로그래밍적 생성 → `tools/fixtures/*.py`
- 또는 한컴오피스에서 수동 생성 → 저장소 등록
- 각 픽스처에 `meta.yaml` (설명, 기대 모델 요약, 왕복 기대값)

### 외부 샘플

- 공공 기관 HWPX 샘플 (라이선스 확인 후) 별도 저장소
- 민감 정보 제거 검수 필수

## 4. CI 파이프라인

```yaml
# 개념적 흐름
lint: pnpm eslint . && pnpm prettier --check .
typecheck: pnpm tsc -b
unit: pnpm vitest run --coverage
property: pnpm vitest run --run fast-check  (taglabel)
e2e: pnpm playwright test
a11y: pnpm playwright test --grep @a11y
bench: pnpm vitest bench  (PR comment 에 결과)
build: pnpm build
release: (tag push) → npm publish + GH Pages deploy
```

- PR 단위: lint, typecheck, unit, property, e2e (빠른 서브셋), a11y
- main 병합: 전체 E2E, 성능 벤치
- 릴리스 태그: 빌드 + 배포

## 5. 수동 테스트 체크리스트 (릴리스 전)

### 기능

- [ ] 10종 픽스처 모두 열림
- [ ] 에디터에서 10분 이상 작업해도 크래시 없음
- [ ] 저장한 파일을 한컴오피스 2022 최신 빌드에서 오픈 (오류/경고 없음)
- [ ] 저장한 파일을 한컴오피스 Viewer (iOS/Android)에서 오픈
- [ ] 한글 IME 로 2페이지 분량 타이핑 후 저장

### 호환성

- [ ] Chrome, Edge, Firefox, Safari 최신 2버전
- [ ] macOS / Windows / Linux
- [ ] 반응형: 데스크톱 기준 (모바일은 v2)

### 보안

- [ ] 악성 SVG 포함 문서 → sanitize 경로 확인
- [ ] 외부 엔티티 포함 XML → 거부
- [ ] 임베드 스크립트 → 실행 안 됨

### 접근성

- [ ] 마우스 없이 모든 기능 사용 가능
- [ ] 스크린 리더가 주요 요소를 읽음
- [ ] 대비 AA 이상

## 6. 버그 트래킹

- GitHub Issues (라벨: `bug`, `codec`, `editor`, `a11y`, `perf`)
- 심각도 4단계 (S0 차단 / S1 릴리스 차단 / S2 / S3)
- S0/S1 은 핫픽스, 나머지는 다음 마일스톤

## 7. 테스트 관련 책임자 (제안)

| 영역          | 오너            | 리뷰어     |
| ------------- | --------------- | ---------- |
| hwpx-codec    | Codec Dev       | Full Stack |
| hwpx-schema   | Codec Dev       | Editor Dev |
| hwpx-editor   | Editor Dev      | UX         |
| 픽스처        | QA              | Codec Dev  |
| E2E           | QA / Editor Dev | —          |
| 접근성 / 성능 | UX / QA         | —          |
