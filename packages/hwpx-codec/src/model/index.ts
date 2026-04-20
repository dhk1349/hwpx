/**
 * HWPX 도메인 모델. 모든 타입은 immutable 로 다룬다.
 * 미지원 요소는 PreservedNode 로 보관해 라운드트립을 보장한다.
 */

export interface HwpxDocument {
  readonly version: VersionInfo;
  readonly metadata: Metadata;
  readonly header: Header;
  readonly sections: readonly Section[];
  readonly binaries: ReadonlyMap<string, Uint8Array>;
  /**
   * manifest id → binary path. `hp:pic@binaryItemIDRef` 는 manifest ID 이고
   * 실제 파일은 `binaries` map 의 키로 저장되므로 이 매핑이 있어야 이미지/폰트를 찾는다.
   */
  readonly binaryMap?: ReadonlyMap<string, string>;
  readonly preserved: PreservedBag;
  readonly settings?: PreservedNode;
  readonly scripts?: ReadonlyMap<string, string>;
  readonly preview?: { text?: string; image?: Uint8Array };
}

export interface VersionInfo {
  major: number;
  minor: number;
  micro: number;
  build: number;
  targetApplication?: string;
}

export interface Metadata {
  title?: string;
  creator?: string;
  date?: string;
  language?: string;
  subject?: string;
  description?: string;
  publisher?: string;
}

export interface Header {
  beginNum: BeginNum;
  fontFaces: readonly FontFace[];
  borderFills: readonly BorderFill[];
  charProps: ReadonlyMap<string, CharPr>;
  paraProps: ReadonlyMap<string, ParaPr>;
  styles: ReadonlyMap<string, Style>;
  bullets: readonly Bullet[];
  numberings: readonly Numbering[];
}

export interface BeginNum {
  page: number;
  footnote: number;
  endnote: number;
  pic: number;
  tbl: number;
  equation: number;
}

export interface FontFace {
  lang: string;
  name: string;
  type?: string;
  isEmbedded?: boolean;
  /** 임베딩된 폰트 바이너리의 BinData 참조 (manifest id or 파일명 일부). */
  binaryItemIDRef?: string;
  /** 대체 폰트 이름. 원본 폰트가 없을 때 사용하도록 원본 파일이 지정한 값. */
  substFace?: string;
  /** substFont 의 type (ttf/otf 등). */
  substType?: string;
}

/**
 * 표 셀/경계선 정의. 네 방향의 선 종류/두께/색 + 내부 채움색.
 * 뷰어 재현을 위해 최소한의 필드만 보존한다 — diagonal 이나 gradient, 이미지 brush 등은 MVP 범위 밖.
 */
export interface BorderFill {
  id: string;
  left?: BorderSide;
  right?: BorderSide;
  top?: BorderSide;
  bottom?: BorderSide;
  /** `<hc:winBrush faceColor>` — "none" 이면 undefined. `#RRGGBB` 또는 `#AARRGGBB`. */
  fillColor?: string;
}

export interface BorderSide {
  /** "NONE" | "SOLID" | "DASH" | "DOT" | "DOUBLE" | "DASH_DOT" | "THICK" 등. */
  type: string;
  /** 원본 표현식 (예: "0.12 mm"). 렌더 시 mm/pt 변환에 사용. */
  width?: string;
  /** `#RRGGBB`. */
  color?: string;
}

export interface CharPr {
  id: string;
  /** HWPX height 단위(1pt = 100). 예: 10pt = 1000 */
  height?: number;
  textColor?: string;
  /** 형광펜/배경색 (#RRGGBB). 값이 "none" 이면 undefined. */
  bgColor?: string;
  /** header.fontFaces 에서 한글 폰트의 인덱스 (0-based). */
  fontRefHangul?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikeout?: boolean;
  /** 위첨자/아래첨자. 미설정이면 일반(NORMAL). */
  position?: 'superscript' | 'subscript';
}

export interface ParaPr {
  id: string;
  align?: 'left' | 'right' | 'center' | 'justify' | 'distribute';
  /** 왼쪽 들여쓰기 (HWPX 단위 = 1/100 pt). */
  indentLeft?: number;
  /** 오른쪽 들여쓰기. */
  indentRight?: number;
  /** 첫 줄 들여쓰기 (음수면 내어쓰기). */
  indentFirstLine?: number;
  /** 줄 간격 값 — type 에 따라 해석: PERCENT (백분율), FIXED (1/100pt), ATLEAST (1/100pt) */
  lineSpacingValue?: number;
  lineSpacingType?: 'PERCENT' | 'FIXED' | 'ATLEAST' | 'BETWEEN_LINES';
  /** 문단 위 여백 (1/100 pt). */
  marginPrev?: number;
  /** 문단 아래 여백 (1/100 pt). */
  marginNext?: number;
  /** 목록 표시 종류. */
  listType?: 'bullet' | 'numbered';
  /** 목록 중첩 수준 (0-based). */
  listLevel?: number;
}

export interface Style {
  id: string;
  type: 'PARA' | 'CHAR';
  name: string;
  paraPrIDRef?: string;
  charPrIDRef?: string;
}

export interface Bullet {
  id: string;
}

export interface Numbering {
  id: string;
}

export interface Section {
  id: string;
  body: readonly Paragraph[];
  pagePr?: PagePr;
  /** 머리말 — MVP: 단일 텍스트. 불러올 때 rich content 는 평문으로 손실된다. */
  headerText?: string;
  /** 꼬리말 — MVP: 단일 텍스트. */
  footerText?: string;
}

/**
 * 쪽 설정. HWPX 단위는 1/100 pt (= 1/7200 inch).
 * landscape=true 이면 가로 방향. 기본 페이지(A4 세로): width=59528, height=84189.
 */
export interface PagePr {
  width: number;
  height: number;
  landscape: boolean;
  marginLeft: number;
  marginRight: number;
  marginTop: number;
  marginBottom: number;
  /** 머리말 여백 (1/100 pt). */
  marginHeader?: number;
  /** 꼬리말 여백 (1/100 pt). */
  marginFooter?: number;
  /** 제본(gutter) 여백. */
  marginGutter?: number;
}

export interface Paragraph {
  id: string;
  paraPrIDRef: string;
  styleIDRef?: string;
  pageBreak?: boolean;
  columnBreak?: boolean;
  runs: readonly Run[];
}

export interface Run {
  charPrIDRef: string;
  inlines: readonly Inline[];
}

export type Inline =
  | TextInline
  | TabInline
  | LineBreakInline
  | PageBreakInline
  | HyperlinkInline
  | BookmarkInline
  | PictureInline
  | TableInline
  | FootnoteInline
  | EndnoteInline
  | CommentInline
  | ShapeGroupInline
  | OpaqueInline;

export interface TextInline {
  kind: 'text';
  value: string;
}
export interface TabInline {
  kind: 'tab';
}
export interface LineBreakInline {
  kind: 'lineBreak';
}
export interface PageBreakInline {
  kind: 'pageBreak';
}
export interface HyperlinkInline {
  kind: 'hyperlink';
  href: string;
  inlines: readonly Inline[];
}
export interface BookmarkInline {
  kind: 'bookmark';
  name: string;
}
export interface PictureInline {
  kind: 'picture';
  binaryRef: string;
  width: number;
  height: number;
}
export interface TableInline {
  kind: 'table';
  table: Table;
}
/**
 * 각주. MVP: body 를 단일 평문으로 저장. 본문과 같은 run 구조는 아직 미지원.
 */
export interface FootnoteInline {
  kind: 'footnote';
  text: string;
}
/**
 * 미주. 각주와 동일한 모델.
 */
export interface EndnoteInline {
  kind: 'endnote';
  text: string;
}
/**
 * 메모/코멘트. MVP: text + author 단일 평문.
 */
export interface CommentInline {
  kind: 'comment';
  text: string;
  author?: string;
}
/**
 * `<hp:container numberingType="PICTURE">` — 플로팅 이미지/도형 그룹.
 * 실제 SVG 렌더는 향후 과제이며, 현재는 내부 `<hp:t>` 텍스트를 콜아웃 라벨로 모아
 * preview 에서 박스로 표시한다. raw 원본은 라운드트립을 위해 보존한다.
 */
export interface ShapeGroupInline {
  kind: 'shapeGroup';
  /** 내부 하위 도형에 들어있는 모든 drawText 라벨의 평문 (줄바꿈으로 구분). */
  labels: string;
  /** `<hp:curSz width height>` — HWPUNIT. 미지정이면 undefined. */
  width?: number;
  height?: number;
  raw: PreservedNode;
}

export interface OpaqueInline {
  kind: 'opaque';
  raw: PreservedNode;
}

export interface Table {
  rowCnt: number;
  colCnt: number;
  borderFillIDRef?: string;
  rows: readonly Row[];
  /** 표 전체 너비 (HWPUNIT = 1/100 pt). */
  width?: number;
  /** 표 전체 높이. */
  height?: number;
}

export interface Row {
  cells: readonly Cell[];
}

export interface Cell {
  rowSpan: number;
  colSpan: number;
  header: boolean;
  body: readonly Paragraph[];
  /** 셀 자체의 너비/높이 (HWPUNIT). 뷰어와 동일한 레이아웃 재현에 쓰임. */
  width?: number;
  height?: number;
  /** 셀 내부 패딩 (HWPUNIT). */
  marginLeft?: number;
  marginRight?: number;
  marginTop?: number;
  marginBottom?: number;
  /** 셀 주소 — 병합 처리 복구용. */
  colAddr?: number;
  rowAddr?: number;
  /** 셀별 테두리 ID — 셀마다 다른 테두리 스타일을 가질 수 있음. */
  borderFillIDRef?: string;
  /**
   * 셀 내용의 세로 정렬 — `<hp:subList vertAlign="…">` 에서 옴.
   * 기본은 TOP. CENTER/BOTTOM 일 때만 명시적 표시.
   */
  vertAlign?: 'TOP' | 'CENTER' | 'BOTTOM';
}

/**
 * 미지원 요소를 보존하기 위한 노드. fast-xml-parser 결과 또는 raw XML 문자열.
 */
export interface PreservedNode {
  readonly raw: string;
  readonly path?: string;
}

export interface PreservedBag {
  readonly nodes: ReadonlyMap<string, PreservedNode>;
}
