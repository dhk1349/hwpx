# 기술 스택

## 의사결정 요약

클라이언트 측 처리로 설계 — **서버 의존도 최소화**. 핵심은 (1) 견고한 HWPX 코덱, (2) 확장 가능한 에디터 코어, (3) 예측 가능한 UI 상태 관리, (4) **웹 / 데스크톱(Win/Mac) / 모바일(iOS/Android) 단일 코드베이스**.

**플랫폼 전략**: 코덱·스키마·에디터는 모두 순수 TypeScript 로 작성하여 어디서든 재사용. 데스크톱과 모바일은 **Tauri 2** 로 동일한 React 에디터를 네이티브 웹뷰에 호스트한다. 웹은 그대로 브라우저에서 동작.

## 권장 스택

### 언어 / 런타임

- **TypeScript 5.x** — 코덱/에디터/UI 일관 타입
- **Node 20+** — 빌드/테스트/픽스처 생성
- **pnpm** 워크스페이스 (또는 npm workspaces) — 모노레포

### 빌드 / 번들

- **Vite 5.x** — 개발 서버 / 번들
- **tsup** — 라이브러리 패키지 번들 (CJS+ESM+d.ts)
- **Rollup** (라이브러리 최적화 번들이 필요한 경우)

### HWPX 코덱 (신규 자체 구현)

- **JSZip** — ZIP 읽기/쓰기 (mimetype 무압축 옵션 지원)
- **fast-xml-parser** (또는 **@xmldom/xmldom** + `xpath`) — XML 파싱/직렬화
  - 파싱: 순회 가능한 JS 객체 트리
  - 직렬화: 공백/속성 순서 보존을 위해 **커스텀 직렬화기** 작성 필요
- **fflate** (대안) — 더 작은 ZIP 라이브러리
- **buffer / Uint8Array** — BinData 처리 (브라우저 네이티브)

### 에디터 코어

- **ProseMirror** 를 강력 추천
  - 이유: 문서 트리 모델이 HWPX 의 계층(Section → P → Run → Inline)과 잘 매핑됨
  - 커스텀 **Schema** 를 정의하여 HWPX 요소를 노드/마크로 표현
  - `prosemirror-state`, `prosemirror-view`, `prosemirror-transform`, `prosemirror-commands`, `prosemirror-history`, `prosemirror-keymap`, `prosemirror-schema-list`, `prosemirror-tables`
- 대안: **TipTap** (ProseMirror 래퍼) — 생산성↑, 커스터마이즈에 제약↑
- 지양: **Slate.js** — 한글 IME 이슈 이력, 복잡한 블록 편집에 취약
- 지양: **Quill** — 확장성 제한 (블록 구조가 HWPX 에 잘 안 맞음)

### UI 프레임워크

- **React 18+**
- **Zustand** — 전역 UI 상태 (툴바, 다이얼로그, 선택 정보)
- **TanStack Query** — 서버 연동이 생겼을 때 (초기에는 미사용)
- **Radix UI** — 접근성 있는 다이얼로그/메뉴/툴팁
- **Tailwind CSS** — 유틸리티 클래스, 디자인 일관성
- **lucide-react** — 아이콘

### 폰트

- **Noto Sans KR**, **Noto Serif KR** 기본 제공 (weboff)
- HWPX 의 `fontface` 이름을 브라우저 폰트로 매핑하는 테이블 유지

### 테스트

- **Vitest** — 단위 테스트 + 컴포넌트 테스트 (jsdom)
- **Playwright** — E2E / 브라우저 자동화 (한국어 IME 포함 시나리오)
- **@testing-library/react** — 에디터 상호작용 테스트
- **fast-check** — 코덱 라운드트립 property-based test
- **xmldiff / xml-formatter** — XML diff 검증 유틸

### 품질 도구

- **ESLint** + **@typescript-eslint**
- **Prettier**
- **Husky + lint-staged** — pre-commit 검사
- **GitHub Actions** — CI
- **Codecov** — 커버리지

### 데스크톱 / 모바일 셸

- **Tauri 2.x** — Rust 기반 셸. 데스크톱(Win/Mac/Linux)과 모바일(iOS/Android)을 단일 코드로 빌드
  - 바이너리 크기: ~3~10MB (Electron 의 1/15)
  - 네이티브 웹뷰 사용 (Win: WebView2 / Mac: WKWebView / iOS: WKWebView / Android: System WebView)
  - 파일 시스템 / 다이얼로그 / 메뉴 / 트레이 / 자동 업데이트 플러그인 제공
- **@tauri-apps/api** — JS ↔ Rust IPC
- **@tauri-apps/plugin-dialog**, **plugin-fs**, **plugin-window-state**, **plugin-updater** — 일반 플러그인
- **Rust toolchain** (rustup) — 셸 빌드용. 코덱은 여전히 TS
- 코드 사이닝:
  - macOS: Apple Developer 인증서 + notarization
  - Windows: EV/OV 코드 사이닝 인증서
- 자동 업데이트: Tauri Updater + GitHub Releases

> **대안 검토**: Electron(픽셀 완전 일치, +Chromium 무거움), Wails(Go 기반, 모바일 미지원), Flutter(전혀 다른 스택). Tauri 2 가 모바일까지 한 번에 잡히는 유일한 선택지.

### 문서

- **VitePress** 또는 **Docusaurus** — 사용자 / 개발자 문서
- **TypeDoc** — 코덱 API 레퍼런스

## 모노레포 구조 (제안)

```
hwpx-editor/
├── package.json
├── pnpm-workspace.yaml
├── packages/                    # 플랫폼-독립 라이브러리 (npm 배포 가능)
│   ├── hwpx-codec/              # 파서 + 직렬화기 + 모델 (순수 TS, DOM 무관)
│   │   ├── src/
│   │   │   ├── zip/             # JSZip 래퍼, mimetype 처리
│   │   │   ├── xml/             # 파서/직렬화기
│   │   │   ├── model/           # 타입: Document, Section, Para, Run, Table, Pic …
│   │   │   ├── header/          # header.xml 코덱
│   │   │   ├── section/         # section.xml 코덱
│   │   │   ├── opf/             # content.hpf 코덱
│   │   │   ├── container/       # META-INF/container.xml
│   │   │   ├── preservation/    # 미지원 요소 raw XML 보존
│   │   │   └── index.ts
│   │   └── test/
│   │       ├── fixtures/*.hwpx
│   │       └── roundtrip.spec.ts
│   ├── hwpx-schema/             # ProseMirror Schema + HWPX 변환 (순수 TS)
│   │   ├── src/
│   │   │   ├── schema.ts
│   │   │   ├── toPM.ts          # HWPX Document → PM doc
│   │   │   └── fromPM.ts        # PM doc → HWPX Document
│   │   └── test/
│   ├── hwpx-editor/             # React 에디터 컴포넌트 (브라우저 / 웹뷰 공용)
│   │   ├── src/
│   │   │   ├── Editor.tsx
│   │   │   ├── toolbar/
│   │   │   ├── commands/
│   │   │   ├── plugins/
│   │   │   ├── nodeViews/       # 표, 이미지, 수식 등 커스텀 뷰
│   │   │   └── index.ts
│   │   └── test/
│   ├── hwpx-platform/           # 플랫폼 추상화 (파일 I/O / 다이얼로그 / 메뉴)
│   │   ├── src/
│   │   │   ├── types.ts         # PlatformAdapter 인터페이스
│   │   │   ├── adapters/
│   │   │   │   ├── web.ts       # 브라우저 (File System Access API)
│   │   │   │   ├── tauri.ts     # Tauri (@tauri-apps/api)
│   │   │   │   └── memory.ts    # 테스트용 인메모리
│   │   │   └── index.ts
│   │   └── test/
│   └── hwpx-viewer/             # (선택) 읽기 전용 뷰어
├── apps/                        # 배포 단위
│   ├── web/                     # 브라우저용 (Vite, GH Pages / Vercel 배포)
│   │   ├── src/main.tsx         # PlatformAdapter = web
│   │   ├── index.html
│   │   └── vite.config.ts
│   ├── desktop/                 # Tauri 2 데스크톱 (Win/Mac/Linux)
│   │   ├── src/                 # 동일 React 진입점, PlatformAdapter = tauri
│   │   ├── src-tauri/           # Rust 셸
│   │   │   ├── Cargo.toml
│   │   │   ├── tauri.conf.json
│   │   │   ├── icons/
│   │   │   └── src/main.rs
│   │   └── package.json
│   └── mobile/                  # (v2) Tauri 2 모바일 (iOS/Android)
│       ├── src/
│       ├── src-tauri/
│       │   ├── gen/
│       │   │   ├── apple/
│       │   │   └── android/
│       │   └── ...
│       └── package.json
├── tools/
│   ├── fixtures/                # python-hwpx 로 생성한 테스트 파일 스크립트
│   └── ci/                      # 빌드/배포 보조 스크립트
└── docs/
```

`apps/web`, `apps/desktop`, `apps/mobile` 의 React 코드는 사실상 동일하며, 차이는 **시작점에서 어떤 PlatformAdapter 를 주입하는가** 뿐이다.

## 핵심 설계 원칙

1. **계층 분리**: codec ↔ schema ↔ editor. codec 는 PM 을 모르고, editor 는 XML 을 직접 다루지 않는다.
2. **미지원 요소 보존**: codec 는 모델에 없는 요소를 `opaque: { raw: string }` 로 보관 → 라운드트립에서 그대로 재출력
3. **Command 패턴**: 편집 동작은 반드시 PM transform 으로 — Undo 가능한 단위 유지
4. **불변 데이터**: codec 모델은 불변 (readonly), 편집은 PM doc 에만. 저장 시 PM → HWPX 변환
5. **테스트 핵심**: codec 의 **round-trip** 불변식을 property-based test 로 검증
6. **플랫폼 어댑터 패턴**: 파일 열기/저장/다이얼로그/메뉴 등 플랫폼 의존 동작은 모두 `PlatformAdapter` 인터페이스 뒤로. 에디터 코어는 어댑터를 주입받아 동작하므로 web/desktop/mobile 모두 동일 코드

## 선택지: WebAssembly 백엔드?

- **장점**: openhwp (Rust) 의 `hwpx` 크레이트를 `wasm-pack` 으로 컴파일하면 파싱 성능/정합성 ↑
- **단점**: 브라우저 번들 크기 증가, 빌드 체인 복잡도 ↑, 세밀한 보존 제어 어려움
- **결정**: v1 은 **순수 TypeScript** 로. 성능 벤치마크에서 목표 미달 시 v2 에서 WASM 백엔드 옵션 추가

## 배포 / 호스팅

### 웹 (`apps/web`)

- v1: 정적 파일 (Vite build → GitHub Pages / Vercel / Cloudflare Pages)
- 예제 도메인: `hwpx.example.dev` (결정 필요)

### 데스크톱 (`apps/desktop`)

- 빌드: `pnpm tauri build` → 플랫폼별 인스톨러 생성
  - macOS: `.dmg` (Universal Binary: arm64 + x86_64)
  - Windows: `.msi` / `.exe` (NSIS)
  - Linux: `.deb` / `.AppImage` / `.rpm` (선택)
- 배포: GitHub Releases + Tauri Updater 로 자동 업데이트
- CI 빌드: GitHub Actions matrix (`macos-latest`, `windows-latest`, `ubuntu-latest`)
- 코드 사이닝:
  - macOS: Apple Developer 멤버십 ($99/년) + notarization (필수, 미인증 시 사용자가 실행 차단)
  - Windows: 코드 사이닝 인증서 ($200~600/년) — 미서명 시 SmartScreen 경고
  - 초기엔 미서명으로 배포 가능 (사용자가 우회 동의 필요 — 명시적 안내)

### 모바일 (`apps/mobile`, v2)

- iOS: App Store (Apple Developer Program $99/년)
- Android: Google Play Store ($25 일회성)
- Tauri 2 의 `tauri ios build` / `tauri android build` 사용

## 라이선스 / 오픈소스 정책

- 코덱: **Apache-2.0** (특허 조항 포함, 한컴 공식 라이브러리와 동일)
- 에디터 / 데모: **MIT**
- 외부 라이선스 고지 자동 수집 (`license-checker`)
