# HWPX Editor — 자료조사 · 개발 스펙 · 계획

이 저장소는 **HWPX 문서를 웹 / 데스크톱(Mac, Win) / (v2) 모바일(iOS, Android) 에서 열고, 편집하고, 저장**하는 멀티플랫폼 에디터의 1차 산출물(자료조사, 개발 스펙, 계획)을 담는다. 본 단계에서는 **코드는 작성하지 않고**, 이어지는 실제 구현 단계의 청사진을 확정한다.

## 요약

- **HWPX** 는 한글(HWP) 워드프로세서의 XML 기반 개방형 포맷으로, 국가표준 **KS X 6101 (OWPML)** 을 따른다. ZIP 컨테이너 안에 `content.hpf`(OPF), `header.xml`(서식 참조), `section{N}.xml`(본문), `BinData/`(이미지 등)가 담긴 구조다.
- 기존 오픈소스(hwp.js, hwpxlib, python-hwpx, openhwp, hwpx-owpml-model)는 **읽기/쓰기 참조 구현** 은 있지만 브라우저 기반 **편집기** 는 빈자리다. 본 프로젝트가 그 간극을 메운다.
- 기술 스택: **TypeScript** + pnpm 모노레포 + JSZip + fast-xml-parser + ProseMirror + React + Tailwind. 셸은 **Tauri 2** 로 데스크톱 + 모바일을 단일 코드로 커버. Vitest / Playwright / fast-check 로 테스트.
- 코드 공유: `packages/`(코덱·스키마·에디터·플랫폼) 는 100% 공유, `apps/web|desktop|mobile` 은 시작점에서 PlatformAdapter 만 주입.
- 일정: 1인 기준 약 19주 (2인 병렬 시 15주). v1 범위는 텍스트/서식/스타일/표/이미지/리스트/하이퍼링크 + Mac/Win 데스크톱 인스톨러까지. 모바일은 v2.
- 핵심 원칙: **라운드트립 보존** — 에디터가 모르는 요소는 원본 XML 을 그대로 간직했다가 저장 시 재주입해 한컴오피스와의 호환을 지킨다.

## 문서 지도

### 자료조사 (`docs/research/`)

1. [HWPX 포맷 개요](docs/research/01-hwpx-overview.md)
2. [HWPX 파일 구조](docs/research/02-hwpx-file-structure.md)
3. [주요 XML 요소 참조](docs/research/03-hwpx-xml-elements.md)
4. [기존 라이브러리 조사](docs/research/04-existing-libraries.md)
5. [참고자료 목록](docs/research/05-references.md)

### 개발 스펙 (`docs/spec/`)

1. [프로젝트 범위 / 목표](docs/spec/01-project-scope.md)
2. [기능 명세 (v1 범위와 그 외)](docs/spec/02-features.md)
3. [기술 스택](docs/spec/03-tech-stack.md)
4. [아키텍처](docs/spec/04-architecture.md)

### 개발 계획 (`docs/plan/`)

1. [단계별 계획 (Phase 0~8)](docs/plan/01-phases.md)
2. [마일스톤 / 일정](docs/plan/02-milestones.md)
3. [테스트 전략](docs/plan/03-testing-strategy.md)

### 개발 환경

- [SETUP.md](SETUP.md) — Node / pnpm / Rust / Tauri CLI 설치 및 개발 서버 실행 방법

## 저장소 구조 (Phase 0 스캐폴드)

```
hwpx/
├── apps/
│   ├── web/           # Vite + React (브라우저 개발 / File System Access API)
│   └── desktop/       # Tauri 2 셸 (Mac / Win), 향후 Tauri Mobile
├── packages/
│   ├── hwpx-codec/    # HWPX ⇄ 도메인 모델 (JSZip + fast-xml-parser)
│   ├── hwpx-schema/   # ProseMirror 스키마 (HWPX → PM Node)
│   ├── hwpx-editor/   # React 에디터 컴포넌트
│   └── hwpx-platform/ # PlatformAdapter (web / tauri-desktop / tauri-mobile / memory)
├── tools/fixtures/    # HWPX 테스트 샘플 생성 스크립트 (Phase 1)
├── .github/workflows/ # CI (lint/typecheck/test + Tauri 빌드), Release
└── docs/              # 본 저장소의 자료조사·스펙·계획 문서
```

## 다음 액션 (제안)

1. **KS X 6101 PDF 확보** — 한컴 다운로드 센터 및 e-나라표준에서 원본 스펙 내려받아 `docs/spec-source/` 에 보관 (라이선스 확인).
2. **Apple Developer Program 등록** — 데스크톱 사이닝 사전 작업 ($99/년, 승인 1~2일).
3. **Phase 0 킥오프** — 저장소 생성, pnpm 모노레포 스캐폴딩(packages/+apps/), Tauri 빈 셸 Mac/Win 빌드, 픽스처 10종 수집.
4. **IME 스파이크** — ProseMirror × 한글 IME 안정성을 가장 먼저 검증, 특히 **WKWebView(Mac)** 와 **WebView2(Win)** 양쪽에서.
5. **코덱 Phase 1~2** — 읽기/쓰기/라운드트립을 먼저 견고히. 에디터는 그 위에 얹는다.

## 합의가 필요한 결정 사항

- 에디터 프레임워크: **ProseMirror (권장)** vs TipTap vs Lexical
- 데스크톱/모바일 셸: **Tauri 2 (권장)** vs Electron (픽셀 일치 필요 시)
- WASM 파서 사용 여부: v1 은 **TS only (권장)**, 성능 필요 시 openhwp(Rust) → WASM
- 모바일 시점: **v2 (권장)** vs v1 포함
- 협업(실시간) 지원 시점: v2 이후
- 라이선스: 코덱 **Apache-2.0**, UI **MIT** (권장)
- Windows 코드 사이닝 인증서 구매 여부: 미구매 시 SmartScreen 경고 동반 배포

위 항목들에 대해 피드백을 주시면 Phase 0 실행 계획을 상세화합니다.
