# 아키텍처

## 0. 플랫폼 다이어그램 (멀티 타깃)

```
                ┌───────────────────────────────────────────────┐
                │  공유 코어 (packages/, 100% TypeScript)         │
                │  hwpx-codec · hwpx-schema · hwpx-editor       │
                │  hwpx-platform (PlatformAdapter 인터페이스)    │
                └─────────────────────┬─────────────────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        ▼                             ▼                             ▼
┌──────────────────┐        ┌──────────────────┐         ┌──────────────────┐
│  apps/web        │        │  apps/desktop    │         │  apps/mobile (v2)│
│  Vite → 정적     │        │  Tauri 2         │         │  Tauri 2         │
│  브라우저        │        │  Win/Mac/Linux   │         │  iOS / Android   │
│                  │        │                  │         │                  │
│ Adapter: web     │        │ Adapter: tauri   │         │ Adapter: tauri   │
│  - File API      │        │  - plugin-fs     │         │  - plugin-fs     │
│  - Drag&Drop     │        │  - plugin-dialog │         │  - 시스템 메뉴   │
│                  │        │  - 시스템 메뉴   │         │  - 공유 시트     │
└──────────────────┘        └──────────────────┘         └──────────────────┘
```

같은 React 진입점이 세 타깃에서 동작하며, 차이는 **시작점에서 주입되는 PlatformAdapter** 뿐.

## 1. 전체 블록 다이어그램 (단일 타깃 내부)

````
┌────────────────────────────────────────────────────────────────────┐
│              Web Browser  /  Tauri WebView (Desktop, Mobile)        │
│                                                                     │
│  ┌────────────┐    ┌──────────────┐    ┌────────────────────────┐  │
│  │  File UI   │───▶│ hwpx-codec   │───▶│  Codec Model (immut.)  │  │
│  │ (drop/pick)│    │ (parse)      │    │  Document → Sections   │  │
│  └─────┬──────┘    └──────────────┘    └────────────┬───────────┘  │
│        │                                              │              │
│        │ 파일 I/O                                     ▼              │
│  ┌─────▼───────────┐                    ┌────────────────────────┐  │
│  │ PlatformAdapter │                    │  hwpx-schema (toPM)    │  │
│  │ web | tauri     │                    │  HWPX → PM doc         │  │
│  └─────────────────┘                    └────────────┬───────────┘  │
│                                                      ▼              │
│   ┌────────────┐      ┌─────────────────┐   ┌──────────────────┐   │
│   │  Toolbar   │◀────▶│  React UI       │◀─▶│ ProseMirror View │   │
│   │ (commands) │      │ (state, menus)  │   │ (editor kernel)  │   │
│   └────────────┘      └─────────────────┘   └────────┬─────────┘   │
│                                                      │              │
│                                                      ▼              │
│                                         ┌────────────────────────┐  │
│                                         │  hwpx-schema (fromPM)  │  │
│                                         │  PM doc → HWPX         │  │
│                                         └────────────┬───────────┘  │
│                                                      ▼              │
│   ┌────────────┐    ┌──────────────┐    ┌────────────────────────┐  │
│   │  Save UI   │◀───│ hwpx-codec   │◀───│  Codec Model (merged   │  │
│   │ (download/ │    │ (serialize)  │    │  with preserved raws)  │  │
│   │  fs.write) │    └──────────────┘    └────────────────────────┘  │
│   └─────┬──────┘                                                    │
│         │ PlatformAdapter                                           │
└─────────┼──────────────────────────────────────────────────────────┘
          ▼
   브라우저: <a download> / File System Access API
   데스크톱: tauri-plugin-fs (Recent Files, OS 다이얼로그)
   모바일: tauri-plugin-fs + Share Sheet

## 2. 코덱 모델 (hwpx-codec)

### 타입 스케치

```ts
export interface HwpxDocument {
  version: { major: number; minor: number; micro: number; build: number };
  metadata: Metadata;                    // from content.hpf
  header: Header;                        // from header.xml
  sections: Section[];                   // section0.xml, section1.xml, ...
  binaries: Map<string, Uint8Array>;     // href -> bytes
  preserved: PreservedBag;               // 미지원 요소 raw 보관
  container: ContainerMeta;              // META-INF/container.xml 등
  settings?: SettingsRaw;
  scripts?: Map<string, string>;
  preview?: { text?: string; image?: Uint8Array };
}

export interface Metadata {
  title?: string; creator?: string; date?: string; language?: string;
  subject?: string; description?: string; publisher?: string;
  raw?: XmlNode;  // 보존
}

export interface Header {
  beginNum: { page: number; footnote: number; endnote: number; pic: number; tbl: number; equation: number };
  fontFaces: FontFace[];
  borderFills: BorderFill[];
  charProps: Map<string, CharPr>;
  paraProps: Map<string, ParaPr>;
  styles: Map<string, Style>;
  bullets: Bullet[];
  numberings: Numbering[];
  raw?: XmlNode;   // 알 수 없는 하위 요소 보존
}

export interface Section {
  id: string;
  body: ParaNode[];
  raw?: XmlNode;
}

export type ParaNode = Paragraph;

export interface Paragraph {
  id: string;
  paraPrIDRef: string;
  styleIDRef?: string;
  pageBreak?: boolean;
  columnBreak?: boolean;
  runs: Run[];
  opaqueChildren?: OpaqueNode[];  // 보존
}

export interface Run {
  charPrIDRef: string;
  inlines: Inline[];
}

export type Inline =
  | { kind: 'text'; value: string }
  | { kind: 'tab' }
  | { kind: 'lineBreak' }
  | { kind: 'pageBreak' }
  | { kind: 'hyperlink'; href: string; inlines: Inline[] }
  | { kind: 'bookmark'; name: string }
  | { kind: 'picture'; binaryRef: string; width: number; height: number; /* … */ }
  | { kind: 'table'; table: Table }
  | { kind: 'footnote'; id: string; body: ParaNode[] }
  | { kind: 'opaque'; raw: XmlNode };

export interface Table {
  rowCnt: number; colCnt: number;
  borderFillIDRef?: string;
  rows: Row[];
}

export interface Row { cells: Cell[]; }
export interface Cell {
  rowSpan: number; colSpan: number; header: boolean;
  body: ParaNode[];  // 셀은 mini-body
}
````

### 파싱 파이프라인

1. `unzip(file)` → Map<path, bytes>
2. `readContainer(META-INF/container.xml)` → rootfile 경로
3. `readOpf(Contents/content.hpf)` → metadata + manifest + spine
4. `readHeader(Contents/header.xml)` → Header
5. spine 순회 → `readSection(href)` → Section[]
6. 누락되거나 모르는 요소는 `preserved` 로 수집
7. 결과: `HwpxDocument` (불변)

### 직렬화 파이프라인

1. `HwpxDocument + 편집된 PM doc 반영본`
2. header.xml 생성 (참조 ID 재배치 / 중복 제거)
3. 각 section.xml 생성
4. content.hpf (manifest/spine) 재생성 — 바이너리 목록 최신화
5. BinData 폴더 출력
6. mimetype (무압축 첫 엔트리) + META-INF + 나머지 → ZIP
7. `Blob` 반환 → 다운로드

## 3. 스키마 브릿지 (hwpx-schema)

### ProseMirror 스키마 매핑 (요약)

| PM 노드 / 마크                               | HWPX 요소                                             | 비고                             |
| -------------------------------------------- | ----------------------------------------------------- | -------------------------------- |
| `doc`                                        | HwpxDocument                                          | 최상위                           |
| `section` (block)                            | `hs:sec`                                              |                                  |
| `paragraph` (block)                          | `hp:p`                                                | `attrs: paraPrIDRef, styleIDRef` |
| `text` (inline)                              | `hp:t`                                                |                                  |
| `hard_break` (inline)                        | `hp:lineBreak`                                        |                                  |
| `page_break` (block)                         | `hp:pageBreak`                                        |                                  |
| `hyperlink` (mark)                           | `hp:hyperlink`                                        |                                  |
| `bookmark` (inline)                          | `hp:bookmark`                                         |                                  |
| `image` (inline/block)                       | `hp:pic`                                              | nodeView: 리사이즈 핸들          |
| `table` / `table_row` / `table_cell`         | `hp:tbl` / `hp:tr` / `hp:tc`                          | prosemirror-tables 기반          |
| `footnote` (inline)                          | `hp:footNote`                                         | nodeView: 팝오버                 |
| `bullet_list` / `ordered_list` / `list_item` | `hp:paraPr` 의 `headingIDRef` + bullet/numbering 참조 | 번역 규칙 필요                   |
| `opaque_block` / `opaque_inline`             | 그대로 보존                                           | 렌더링은 placeholder             |

### 마크 매핑 (글자 속성)

| PM mark       | HWPX charPr 속성            |
| ------------- | --------------------------- |
| `bold`        | `bold="1"`                  |
| `italic`      | `italic="1"`                |
| `underline`   | `underline.type != NONE`    |
| `strike`      | `strikeout.shape != NONE`   |
| `color`       | `textColor`                 |
| `background`  | `shadeColor`                |
| `font_family` | `fontRef[lang].faceNameRef` |
| `font_size`   | `height` (1pt = 100)        |

여러 마크 조합 → 새 charPr ID 생성 및 header.xml 에 upsert.

### 라운드트립 전략

- PM doc 의 각 문단/런에 **원본 refID** 를 attr 로 보존
- 편집 시 서식이 바뀌면 새 ID 를 생성 (기존 ID 재사용은 충돌 위험)
- 저장 시 header.xml 의 refList 를 새 스냅샷으로 재구성 (미사용 ID 정리)

## 4. 에디터 (hwpx-editor)

### 컴포넌트 트리

```
<HwpxEditorProvider document={hwpxDoc}>
  <TopBar>
    <FileMenu />    // 열기 / 저장 / 내보내기
    <EditMenu />    // 되돌리기 / 찾기
    <InsertMenu />  // 표 / 이미지 / 하이퍼링크
  </TopBar>
  <Toolbar>
    <StylePalette /> <FontControls /> <InlineMarks />
    <ParagraphControls /> <ListControls /> <InsertControls />
  </Toolbar>
  <EditorCanvas>
    <ProseMirrorView />   // 핵심 편집 영역
  </EditorCanvas>
  <StatusBar />
</HwpxEditorProvider>
```

### 상태 관리

- **에디터 상태**: `EditorState` (ProseMirror) — 소스 오브 트루스
- **UI 상태**: Zustand store — 모달, 선택 메타, 저장 진행도
- **파일 상태**: React context — 원본 `HwpxDocument`, 변경 여부

### 커스텀 nodeView

- **Image**: 드래그 리사이즈 + 정렬 옵션 (left/right/center/inline/float)
- **Table**: prosemirror-tables 기반 + 한컴 스타일 선택/병합 UX
- **Footnote**: 본문 내 앵커 + 하단/사이드 팝오버
- **OpaqueBlock**: 회색 플레이스홀더 + "지원되지 않는 요소 (보존됨)" 툴팁

## 5. 에러 처리 / 복원력

- 파싱 단계에서 **회복 불가능 오류**: `HwpxParseError` throw → UI 에 원인 표시
- 파싱 단계에서 **회복 가능 경고**: `warnings[]` 누적 → UI 배너
- 직렬화 단계에서 유효성 검증 실패 → 저장 차단 + 디버그 덤프(다운로드)
- 자동 저장(IndexedDB)으로 크래시 복구

## 6. 보안

- XML 파서는 **external entity 비활성** (XXE 방지)
- 붙여넣기 HTML 은 sanitize (DOMPurify) 후 PM transform
- 업로드 이미지 MIME 재검증, SVG 는 sanitize
- CSP: `script-src 'self'`, `object-src 'none'`
- Scripts/ 폴더는 문자열로만 보관, 실행 없음

## 7. 성능 고려

- section 단위 lazy 파싱 (10MB+ 문서)
- PM 의 **decoration** 으로 오버레이 렌더 (리사이즈 핸들, 협업 캐럿 등)
- 가상 스크롤링: 매우 긴 문서일 때 `prosemirror-virtual-scroll`(커스텀) 옵션
- XML 직렬화 시 fragment 단위 작업 → 문자열 O(n²) 회피 (array join)
- Web Worker: 파싱/직렬화를 off-main-thread (초기 로드 > 500KB 일 때)

## 8. 확장 포인트

- `registerNode()` — 커스텀 HWPX 요소 지원 추가 (예: 차트 플러그인)
- `registerExporter()` — PDF/DOCX 내보내기 어댑터
- `registerTransport()` — 서버 저장소 어댑터
- `PlatformAdapter` 구현 추가 — 새로운 셸 (예: VS Code Webview, Electron) 호스팅

## 9. PlatformAdapter 인터페이스 (요약)

```ts
export interface PlatformAdapter {
  // 파일 I/O
  openFile(opts?: {
    accept?: string[];
  }): Promise<{ name: string; bytes: Uint8Array; handle?: unknown } | null>;
  saveFile(
    bytes: Uint8Array,
    opts: { suggestedName: string; handle?: unknown },
  ): Promise<{ handle?: unknown } | null>;
  saveAs(bytes: Uint8Array, opts: { suggestedName: string }): Promise<{ handle?: unknown } | null>;

  // 최근 파일
  recentFiles(): Promise<RecentFile[]>;
  addRecentFile(handle: unknown): Promise<void>;

  // 시스템 통합
  setMenuHandlers?(handlers: MenuHandlers): void; // 데스크톱 시스템 메뉴
  setWindowTitle?(title: string): void;
  registerShortcut?(combo: string, fn: () => void): () => void;
  notify?(opts: { title: string; body?: string }): Promise<void>;

  // 자동 저장 / 복구
  storage: KVStore; // web: IndexedDB / tauri: FS 기반

  // 메타
  readonly name: 'web' | 'tauri-desktop' | 'tauri-mobile' | 'memory';
  readonly capabilities: {
    nativeMenu: boolean;
    fileHandle: boolean;
    filesystem: boolean;
    autoUpdate: boolean;
  };
}
```

각 어댑터의 책임:

| 어댑터          | 파일 I/O                                         | 메뉴                                     | 자동 업데이트 | 비고                                 |
| --------------- | ------------------------------------------------ | ---------------------------------------- | ------------- | ------------------------------------ |
| `web`           | File System Access API (지원 시) + 다운로드 폴백 | 인앱 메뉴                                | —             | Chrome/Edge 우선, Safari 는 다운로드 |
| `tauri-desktop` | `@tauri-apps/plugin-fs` + 네이티브 다이얼로그    | 네이티브 메뉴바 (Mac top, Win in-window) | Tauri Updater | macOS notarization 필요              |
| `tauri-mobile`  | `plugin-fs` + Share Sheet                        | 인앱 메뉴                                | 스토어 경유   | Files.app / SAF 통합                 |
| `memory`        | 인메모리                                         | —                                        | —             | 테스트용                             |

## 10. 데스크톱 셸 세부 (apps/desktop)

### 디렉토리

```
apps/desktop/
├── package.json
├── src/                          # React (apps/web 와 거의 동일)
│   ├── main.tsx                  # createTauriAdapter() 주입
│   └── App.tsx                   # 공유 컴포넌트 import
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json           # 앱 ID, 윈도우, 번들 설정
    ├── icons/                    # .icns / .ico / .png
    ├── capabilities/             # Tauri 2 권한 모델
    │   └── default.json
    └── src/
        ├── main.rs               # 셸 진입점
        ├── menu.rs               # 시스템 메뉴 정의
        ├── commands.rs           # IPC 핸들러 (필요 시)
        └── lib.rs
```

### 주요 OS 통합

| 기능                | Mac                                               | Windows                               |
| ------------------- | ------------------------------------------------- | ------------------------------------- |
| 시스템 메뉴         | 상단 메뉴바 (네이티브)                            | 윈도우 내 메뉴바                      |
| 파일 연결 (`.hwpx`) | `tauri.conf.json` `bundle.macOS.fileAssociations` | `bundle.windows.fileAssociations`     |
| 다이얼로그          | `NSOpenPanel` / `NSSavePanel`                     | `IFileOpenDialog` / `IFileSaveDialog` |
| 자동 업데이트       | Sparkle 호환 (Tauri Updater)                      | 직접 다운로드/실행                    |
| 코드 사이닝         | Apple Developer 인증서 + notarytool               | EV/OV 인증서 + signtool               |
| 윈도우 상태 저장    | `tauri-plugin-window-state`                       | 동일                                  |
| 다크 모드           | `NSAppearance` 추적                               | `WM_SETTINGCHANGE` 추적               |

### IPC 최소화 원칙

모든 무거운 작업(파싱/직렬화)은 **JS 측에서 처리**하고, Rust 셸은 OS API 위임에만 사용. 향후 성능이 필요하면 Rust 측에 `hwpx-codec` WASM 빌드 또는 네이티브 크레이트로 옮길 수 있다 (openhwp 활용 가능).

## 11. 모바일 셸 세부 (apps/mobile, v2)

- Tauri 2 의 `cargo tauri ios init` / `android init` 으로 프로젝트 생성
- 입력: 모바일 한글 IME 검증 필요 (별도 스파이크)
- UI: 데스크톱 툴바를 모바일 친화적으로 (Bottom Sheet, 컨텍스트 액션)
- 파일: iOS 는 `Files.app` (`UIDocumentPickerViewController` 위임), Android 는 SAF
- 한 단계 더 떨어진 변경이 필요하므로 v2 에 별도 마일스톤
