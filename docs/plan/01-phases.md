# 단계별 개발 계획 (Phased Plan)

총 10 단계, 약 16~19 주 (1인 기준, 병렬화 시 단축). 멀티 타깃(웹/데스크톱/모바일) 일정 포함.

## Phase 0 — 준비 (1주)

### 목표

개발 환경 세팅 + 공식 스펙 원본 확보 + 셸 빌드 사전 검증.

### 작업

- [ ] 저장소 생성 (GitHub, 라이선스 Apache-2.0 / MIT 혼합)
- [ ] pnpm 모노레포 스캐폴딩
  - `packages/hwpx-codec`, `hwpx-schema`, `hwpx-editor`, `hwpx-platform`
  - `apps/web`, `apps/desktop` (Tauri 2 init)
- [ ] Vite + TS + ESLint + Prettier + Vitest + Playwright + Husky 설정
- [ ] Rust 툴체인 설치, `cargo tauri init` 으로 데스크톱 셸 골격
- [ ] GitHub Actions (lint/test/build) — Mac+Win+Ubuntu matrix 포함 (Tauri 빌드까지)
- [ ] KS X 6101 PDF 확보 (e-나라표준 또는 한컴 다운로드 센터)
- [ ] 테스트 픽스처 최소 10종 수집/생성 (빈 문서, 표, 이미지, 리스트, 메모 등)
- [ ] 공식 한컴오피스 뷰어/에디터로 동작 참조 캡처
- [ ] **스파이크**: Tauri 데스크톱 빈 윈도우가 Mac/Win 양쪽에서 빌드/실행되는지 검증

### 산출물

- 실행 가능한 모노레포 (`pnpm dev:web`, `pnpm dev:desktop`, `pnpm test`)
- `tools/fixtures/` 하위에 픽스처 10종
- Mac `.dmg` 와 Windows `.msi` 빈 셸 빌드 아티팩트 (CI 통과)

### Exit criteria

- CI 녹색 (3 OS), 데모 앱 "Hello HWPX" 페이지 로딩
- 데스크톱 빈 셸이 양 OS 에서 실행됨

---

## Phase 1 — 코덱 v0 (읽기) (2~3주)

### 목표

HWPX 를 읽어 `HwpxDocument` 불변 모델로 반환.

### 작업

- [ ] JSZip 으로 ZIP 언팩, mimetype 시그니처 검증
- [ ] `META-INF/container.xml` → rootfile 경로 찾기
- [ ] `content.hpf` (OPF) metadata / manifest / spine 파싱
- [ ] `version.xml` 파싱
- [ ] `header.xml` 파싱: fontFaces, charPr, paraPr, style, borderFill, bullets, numberings, beginNum
- [ ] `section{N}.xml` 파싱: `hp:p` / `hp:run` / `hp:t` / `hp:lineBreak` / `hp:tab`
- [ ] `hp:hyperlink`, `hp:bookmark`, `hp:pic`, `hp:tbl` (행/열/병합) 파싱
- [ ] `BinData/*` 바이너리 로드
- [ ] 미지원 요소 `opaque` / `PreservedBag` 으로 보존
- [ ] XML 파서에 XXE 방지 설정
- [ ] 실패 시 `HwpxParseError`, 경고는 `warnings[]`

### 산출물

- `packages/hwpx-codec/src/reader.ts`
- 단위 테스트: 각 요소별 픽스처 → 모델 snapshot

### Exit criteria

- 10 종 픽스처가 모두 에러 없이 파싱
- 표/이미지/리스트 포함 문서의 텍스트 추출 정확도 100%

---

## Phase 2 — 코덱 v1 (쓰기 + 라운드트립) (2주)

### 목표

`HwpxDocument` → ZIP(.hwpx) 직렬화. **라운드트립 불변식** 성립.

### 작업

- [ ] `header.xml` 직렬화 (ID 재할당 옵션, 정렬 규칙)
- [ ] `section.xml` 직렬화 (mixed content 정확도)
- [ ] `content.hpf` 재생성 (manifest 최신화)
- [ ] `META-INF/container.xml` 재생성
- [ ] mimetype 무압축 첫 엔트리 규칙 준수
- [ ] 보존된 raw XML 을 **올바른 순서와 위치** 에 재주입
- [ ] BinData 재압축
- [ ] 네임스페이스 선언 일치 (원본과 동일 prefix/URI)

### 산출물

- `packages/hwpx-codec/src/writer.ts`
- Property test: `parse ∘ serialize ∘ parse === parse` (모델 동일성)

### Exit criteria

- 원본 → 파싱 → 직렬화 후 **한컴오피스에서 오류 없이 열림**
- 라운드트립 성공률 ≥ 95%
- XML diff 로그 수준 이상 차이 없음 (공백/속성 순서는 화이트리스트)

---

## Phase 3 — 스키마 브릿지 (1~2주)

### 목표

HWPX Document ↔ ProseMirror doc 상호 변환.

### 작업

- [ ] ProseMirror Schema 정의 (nodes, marks)
- [ ] `toPM(HwpxDocument) → PMNode`
- [ ] `fromPM(PMNode, headerSnapshot) → HwpxDocument`
- [ ] charPr/paraPr upsert 로직 (새 서식 조합 ID 생성, 미사용 정리)
- [ ] `opaque` 노드 타입으로 미지원 요소 표현
- [ ] 픽스처를 PM doc 으로 변환 → 다시 HWPX 로 → 라운드트립 확인

### 산출물

- `packages/hwpx-schema/src/{schema.ts,toPM.ts,fromPM.ts}`

### Exit criteria

- toPM → fromPM 라운드트립 일치율 100% (단, 의미 보존 diff 허용)

---

## Phase 4 — 에디터 MVP + PlatformAdapter (읽기 + 기본 편집) (2주)

### 목표

문서를 로드해 렌더링하고, 텍스트 타이핑/삭제/복붙/되돌리기. 웹과 데스크톱 양쪽에서 동시 동작.

### 작업

- [ ] `<Editor>` 컴포넌트 + ProseMirror 뷰
- [ ] **PlatformAdapter 인터페이스** 정의 + `web` / `tauri` / `memory` 구현
- [ ] 파일 열기 UI (드래그앤드롭, 버튼) — 어댑터 위임
- [ ] 저장 UI — 어댑터 위임 (web=다운로드, desktop=네이티브 다이얼로그)
- [ ] 기본 단축키 (`Ctrl+B/I/U`, `Ctrl+C/V/X`, `Ctrl+Z/Y`, `Ctrl+S`)
- [ ] IME (한글) 안정성 확인 (키다운 vs composition 이벤트) — Mac WKWebView, Win WebView2 양쪽
- [ ] 페이지 레이아웃 스타일 (A4, 여백)
- [ ] 미지원 요소 플레이스홀더 렌더링
- [ ] 데스크톱 시스템 메뉴 (열기/저장/되돌리기/도움말) 최소 셋

### 산출물

- `packages/hwpx-editor/src/Editor.tsx`
- `packages/hwpx-platform/` 어댑터 3종
- `apps/web` 와 `apps/desktop` 양쪽에서 열기/편집/저장 가능

### Exit criteria

- 브라우저 / Mac / Win 3개 환경에서 hwpx 파일 열어 텍스트 편집 → 저장 → 한컴오피스 오픈 OK
- 한글 IME 로 100자 이상 입력해도 뒤집힘/누락 없음 (3개 환경 모두)

---

## Phase 5 — 서식 툴바 & 스타일 (2주)

### 목표

글자/문단 서식, 스타일 적용, 리스트, 하이퍼링크.

### 작업

- [ ] 툴바: bold/italic/underline/strike, color, bgColor, 폰트, 크기
- [ ] 문단: 정렬, 들여쓰기, 줄 간격
- [ ] 스타일 팔레트 (제목1~3, 본문, 인용 등 — 기본 스타일 세트)
- [ ] 순서/비순서 리스트 전환
- [ ] 하이퍼링크 삽입/편집/제거
- [ ] 페이지 나눔 삽입

### Exit criteria

- 주요 한컴오피스 기본 스타일이 동일하게 렌더되고 라운드트립 보존

---

## Phase 6 — 표 & 이미지 (2주)

### 목표

표 삽입/편집, 이미지 삽입/리사이즈.

### 작업

- [ ] prosemirror-tables 기반 표 편집 (행/열 추가·삭제, 병합·분할)
- [ ] 표 경계선/서식 반영
- [ ] 이미지 업로드 (input + drop + clipboard paste)
- [ ] 이미지 리사이즈 핸들
- [ ] 이미지 정렬/플로팅

### Exit criteria

- 10x10 표 조작 1000회에도 상태 정합
- 대형 이미지(5MB+) 삽입 후 저장 성공

---

## Phase 7 — 품질 강화 & 접근성 & 문서 (2주)

### 목표

성능 최적화, 접근성, 사용자/개발자 문서 작성.

### 작업

- [ ] 성능 프로파일링 (1MB 로드 < 1초 달성)
- [ ] Web Worker 로 파싱 오프로드
- [ ] 가상 스크롤 (10,000 문단 케이스)
- [ ] 접근성 감사 (axe) — AA 준수
- [ ] 자동 저장 / 복구 (web: IndexedDB, desktop: FS 캐시)
- [ ] 에디터 API 문서 (TypeDoc)
- [ ] 사용자 가이드 (VitePress) 작성

### Exit criteria

- 성능/접근성 KPI 달성
- 공개용 사용 가능한 문서

---

## Phase 8 — 데스크톱 패키징 & 코드 사이닝 (2주)

### 목표

배포 가능한 데스크톱 인스톨러 (Mac/Win) + 자동 업데이트.

### 작업

- [ ] `tauri.conf.json` 번들 메타데이터 (앱 ID, 카테고리, 아이콘, 버전)
- [ ] `.hwpx` 파일 연결 (Mac LSItemContentTypes, Win FileAssociation)
- [ ] 시스템 메뉴 정식화 (Mac top menu, Win in-window menu)
- [ ] 윈도우 상태 저장 플러그인 (`tauri-plugin-window-state`)
- [ ] 자동 업데이트 (Tauri Updater + GitHub Releases endpoint)
- [ ] Mac 코드 사이닝 + notarization (Apple Developer 인증서)
- [ ] Windows 코드 사이닝 (인증서 보유 시) — 미보유 시 SmartScreen 우회 안내문 작성
- [ ] CI 매트릭스에서 `.dmg` (Universal: arm64+x86_64), `.msi`, `.exe` 빌드
- [ ] 설치 / 실행 / 업데이트 수동 테스트 시나리오

### Exit criteria

- Mac/Win 사용자가 인스톨러 다운로드 → 설치 → `.hwpx` 더블클릭 → 에디터 실행
- 자동 업데이트 1회 성공 (테스트 채널)

---

## Phase 9 — 공개 준비 (1주)

### 작업

- [ ] 예시 데이터셋 정리 (공개 배포 가능한 HWPX)
- [ ] 릴리스 노트, 버저닝, 패키지 배포 (npm public — codec/schema/editor/platform)
- [ ] 데모 웹사이트 배포 (Vercel / Cloudflare Pages)
- [ ] 데스크톱 인스톨러 GitHub Releases 게시
- [ ] README / CONTRIBUTING / CODE_OF_CONDUCT
- [ ] 이슈 템플릿, PR 템플릿

### Exit criteria

- v1.0.0 태그, 웹 데모 URL + Mac/Win 인스톨러 공개

---

## (v2) Phase 10 — 모바일 (4~6주, 별도 사이클)

### 목표

iOS / Android 앱.

### 작업

- [ ] `apps/mobile` 스캐폴딩 (`cargo tauri ios init`, `android init`)
- [ ] 모바일용 툴바 / Bottom Sheet UI
- [ ] 모바일 한글 IME 검증 (특히 iOS WKWebView composition)
- [ ] 파일 입출력: iOS Files.app, Android SAF
- [ ] App Store / Play Store 메타데이터, 스크린샷
- [ ] TestFlight / Internal Testing 배포

### Exit criteria

- App Store / Play Store 첫 심사 통과

---

## 위험 요소 & 대응

| 위험                                   | 영향            | 대응                                                          |
| -------------------------------------- | --------------- | ------------------------------------------------------------- |
| OWPML 스펙의 미공개 요소               | 라운드트립 실패 | 보존 전략(opaque) + 한컴오피스 왕복 테스트                    |
| 한글 IME × ProseMirror 이슈            | 입력 불안정     | Phase 0에 IME 테스트 스냅샷 확보, 초기 스파이크               |
| Mac WKWebView ↔ Win WebView2 렌더 차이 | UX 불일치       | Phase 4에서 양 OS 동시 검증, CSS 분기 또는 폴리필 적용        |
| Mac 코드 사이닝/notarization 운영      | 배포 차단       | Phase 0에 Apple Developer 가입 시작, Phase 8 전까지 자격 확보 |
| 대용량 문서 성능                       | UX 저하         | Worker 오프로드 + section lazy load                           |
| 복잡한 표 병합 / 중첩                  | 편집 버그       | prosemirror-tables 커스터마이즈, 픽스처 강화                  |
| 도형/차트/수식                         | 렌더/편집 불가  | v1에서는 "보존만", v2에서 단계적 지원                         |
| 폰트 차이                              | 레이아웃 불일치 | fontFaces 매핑 테이블, Noto 기본, 경고 UI                     |
| 모바일 IME 안정성 (v2)                 | 입력 불가       | v2 Phase 10 시작 시 별도 스파이크                             |
