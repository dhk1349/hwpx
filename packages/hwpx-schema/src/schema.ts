import { Schema, type DOMOutputSpec, type NodeSpec, type MarkSpec } from 'prosemirror-model';

/**
 * HWPX → ProseMirror 매핑.
 *
 * 노드:
 *   doc      = section+
 *   section  = paragraph+
 *   paragraph= inline*  (paraPrIDRef, styleIDRef, align)
 *   text     = (charPrIDRef 마크와 결합되어 hp:run > hp:t 로 환원)
 *   hardBreak= hp:lineBreak
 *   tab      = hp:tab
 *   image    = hp:pic (atom)
 *   table    = hp:tbl (블록형 atom — Phase 6 에서 셀 편집)
 *   opaque   = OpaqueInline raw 보존 (atom)
 *
 * 마크:
 *   bold/italic/underline/strike — toggle 가능, charPrIDRef 와 합성
 *   charPr   — charPrIDRef 직접 보존 (HWPX 의 정확한 charPr 매핑 시 사용)
 *   hyperlink— href
 */

const paragraphSpec: NodeSpec = {
  content: 'inline*',
  group: 'block',
  attrs: {
    paraPrIDRef: { default: '0' },
    styleIDRef: { default: null },
    align: { default: null },
    pageBreak: { default: false },
    columnBreak: { default: false },
    indentLeft: { default: null },
    indentRight: { default: null },
    indentFirstLine: { default: null },
    lineSpacingValue: { default: null },
    lineSpacingType: { default: null },
    marginPrev: { default: null },
    marginNext: { default: null },
    listType: { default: null },
    listLevel: { default: null },
  },
  parseDOM: [{ tag: 'p' }],
  toDOM(node) {
    const a = node.attrs;
    const parts: string[] = [];
    if (a['align']) parts.push(`text-align:${a['align']}`);
    const indentLeft = numOrNull(a['indentLeft']);
    if (indentLeft !== null) parts.push(`padding-left:${hwpxUnitToPt(indentLeft)}pt`);
    const indentRight = numOrNull(a['indentRight']);
    if (indentRight !== null) parts.push(`padding-right:${hwpxUnitToPt(indentRight)}pt`);
    const firstLine = numOrNull(a['indentFirstLine']);
    if (firstLine !== null) parts.push(`text-indent:${hwpxUnitToPt(firstLine)}pt`);
    const lsValue = numOrNull(a['lineSpacingValue']);
    const lsType = a['lineSpacingType'] as string | null;
    if (lsValue !== null) {
      if (lsType === 'PERCENT' || lsType === null) {
        parts.push(`line-height:${lsValue / 100}`);
      } else {
        parts.push(`line-height:${hwpxUnitToPt(lsValue)}pt`);
      }
    }
    const mp = numOrNull(a['marginPrev']);
    if (mp !== null) parts.push(`margin-top:${hwpxUnitToPt(mp)}pt`);
    const mn = numOrNull(a['marginNext']);
    if (mn !== null) parts.push(`margin-bottom:${hwpxUnitToPt(mn)}pt`);
    const attrs: Record<string, string> = {};
    if (parts.length > 0) attrs['style'] = parts.join(';');
    if (a['pageBreak']) attrs['data-page-break'] = 'true';
    if (a['columnBreak']) attrs['data-column-break'] = 'true';
    if (a['listType']) {
      attrs['data-list-type'] = String(a['listType']);
      attrs['data-list-level'] = String(numOrNull(a['listLevel']) ?? 0);
    }
    return ['p', attrs, 0] as DOMOutputSpec;
  },
};

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function hwpxUnitToPt(n: number): number {
  return Math.round((n / 100) * 100) / 100;
}

/**
 * HWPX 의 section 은 "논리 구획" 이지 한 장의 종이가 아니다.
 * 한 section 에 hp:p@pageBreak="1" 이 여러 번 나오거나 내용 길이에 따라
 * 여러 물리 페이지가 생긴다. 우리는 toPM 단계에서 section → page+ 로 쪼갠다.
 * section 은 transparent wrapper 로 두고, page 가 종이 박스 역할.
 */
const sectionSpec: NodeSpec = {
  content: 'page+',
  group: 'block',
  attrs: {
    sectionId: { default: '0' },
  },
  parseDOM: [
    {
      tag: 'div[data-hwpx-section]',
      getAttrs(node: HTMLElement) {
        return { sectionId: node.getAttribute('data-section-id') ?? '0' };
      },
    },
    // 하위 호환: 과거 저장된 DOM 에서 <section> 태그 자체가 section 역할을 했던 경우도 파싱 가능하게
    {
      tag: 'section',
      getAttrs(node: HTMLElement) {
        return { sectionId: node.getAttribute('data-section-id') ?? '0' };
      },
    },
  ],
  toDOM(node) {
    return [
      'div',
      { 'data-hwpx-section': 'true', 'data-section-id': String(node.attrs['sectionId']) },
      0,
    ];
  },
};

/**
 * 한 장의 종이. pagePr (width/height/landscape/margins) 을 attr 로 갖고,
 * CSS 에서 종이 배경, 그림자, 페이지 간 여백 역할을 한다.
 */
const pageSpec: NodeSpec = {
  content: 'paragraph+',
  group: 'block',
  attrs: {
    pageIndex: { default: 0 },
    // HWPUNIT = 1/100 pt. 0 = 미지정.
    pageWidth: { default: 0 },
    pageHeight: { default: 0 },
    pageLandscape: { default: false },
    marginLeft: { default: 0 },
    marginRight: { default: 0 },
    marginTop: { default: 0 },
    marginBottom: { default: 0 },
  },
  parseDOM: [
    {
      tag: 'section[data-hwpx-page]',
      getAttrs(node: HTMLElement) {
        return {
          pageIndex: Number(node.getAttribute('data-page-index')) || 0,
          pageWidth: Number(node.getAttribute('data-page-width')) || 0,
          pageHeight: Number(node.getAttribute('data-page-height')) || 0,
          pageLandscape: node.getAttribute('data-page-landscape') === 'true',
          marginLeft: Number(node.getAttribute('data-margin-left')) || 0,
          marginRight: Number(node.getAttribute('data-margin-right')) || 0,
          marginTop: Number(node.getAttribute('data-margin-top')) || 0,
          marginBottom: Number(node.getAttribute('data-margin-bottom')) || 0,
        };
      },
    },
  ],
  toDOM(node) {
    const a = node.attrs;
    const pageW = Number(a['pageWidth']) || 0;
    const pageH = Number(a['pageHeight']) || 0;
    const landscape = Boolean(a['pageLandscape']);
    const ml = Number(a['marginLeft']) || 0;
    const mr = Number(a['marginRight']) || 0;
    const mt = Number(a['marginTop']) || 0;
    const mb = Number(a['marginBottom']) || 0;
    const styleParts: string[] = [];
    // landscape=true 면 width/height 를 swap 한 실제 치수가 물리 페이지.
    if (pageW > 0 && pageH > 0) {
      const effW = landscape ? pageH : pageW;
      const effH = landscape ? pageW : pageH;
      styleParts.push(`width:${hwpxUnitToPt(effW)}pt`);
      styleParts.push(`min-height:${hwpxUnitToPt(effH)}pt`);
      styleParts.push('box-sizing:border-box');
    }
    if (ml + mr + mt + mb > 0) {
      const mlPt = hwpxUnitToPt(ml);
      const mrPt = hwpxUnitToPt(mr);
      const mtPt = hwpxUnitToPt(mt);
      const mbPt = hwpxUnitToPt(mb);
      styleParts.push(`padding:${mtPt}pt ${mrPt}pt ${mbPt}pt ${mlPt}pt`);
    }
    const domAttrs: Record<string, string> = {
      'data-hwpx-page': 'true',
      'data-page-index': String(a['pageIndex']),
    };
    if (pageW > 0) domAttrs['data-page-width'] = String(pageW);
    if (pageH > 0) domAttrs['data-page-height'] = String(pageH);
    if (landscape) domAttrs['data-page-landscape'] = 'true';
    if (ml > 0) domAttrs['data-margin-left'] = String(ml);
    if (mr > 0) domAttrs['data-margin-right'] = String(mr);
    if (mt > 0) domAttrs['data-margin-top'] = String(mt);
    if (mb > 0) domAttrs['data-margin-bottom'] = String(mb);
    if (styleParts.length > 0) domAttrs['style'] = styleParts.join(';');
    return ['section', domAttrs, 0];
  },
};

const docSpec: NodeSpec = { content: 'section+' };

const textSpec: NodeSpec = { group: 'inline' };

const hardBreakSpec: NodeSpec = {
  inline: true,
  group: 'inline',
  selectable: false,
  parseDOM: [{ tag: 'br' }],
  toDOM: () => ['br'] as DOMOutputSpec,
};

const tabSpec: NodeSpec = {
  inline: true,
  group: 'inline',
  selectable: false,
  toDOM: () => ['span', { class: 'hwpx-tab' }, '\u00a0\u00a0\u00a0\u00a0'] as DOMOutputSpec,
};

const imageSpec: NodeSpec = {
  inline: true,
  group: 'inline',
  atom: true,
  draggable: true,
  attrs: {
    binaryRef: { default: '' },
    width: { default: 0 },
    height: { default: 0 },
    src: { default: '' },
    alt: { default: '' },
  },
  parseDOM: [
    {
      tag: 'img[data-binary-ref]',
      getAttrs(node: HTMLElement) {
        return {
          binaryRef: node.getAttribute('data-binary-ref') ?? '',
          width: Number(node.getAttribute('width')) || 0,
          height: Number(node.getAttribute('height')) || 0,
          src: node.getAttribute('src') ?? '',
          alt: node.getAttribute('alt') ?? '',
        };
      },
    },
  ],
  toDOM(node) {
    const a = node.attrs;
    // HWPX hp:pic@width/height 는 HWPUNIT (1/100 pt) — parser 가 그대로 보존.
    // HTML width attribute 는 CSS px 이라 pt 값을 직접 쓰면 작아짐. style 로 pt 지정.
    const wHwp = Number(a['width']) || 0;
    const hHwp = Number(a['height']) || 0;
    const wPt = hwpxUnitToPt(wHwp);
    const hPt = hwpxUnitToPt(hHwp);
    const styleParts: string[] = [];
    if (wPt > 0) styleParts.push(`width:${wPt}pt`);
    if (hPt > 0) styleParts.push(`height:${hPt}pt`);
    styleParts.push('max-width:100%');
    return [
      'img',
      {
        'data-binary-ref': String(a['binaryRef']),
        src: String(a['src'] || ''),
        alt: String(a['alt'] || ''),
        style: styleParts.join(';'),
      },
    ] as DOMOutputSpec;
  },
};

const tableSpec: NodeSpec = {
  inline: true,
  group: 'inline',
  atom: true,
  attrs: {
    rowCnt: { default: 0 },
    colCnt: { default: 0 },
    borderFillIDRef: { default: null },
    /** 표 전체 너비 (HWPUNIT = 1/100 pt). */
    width: { default: null },
    /** 표 전체 높이 (HWPUNIT). */
    height: { default: null },
    cellsJson: { default: '[]' },
  },
  parseDOM: [{ tag: 'span[data-hwpx-table]' }],
  toDOM(node) {
    const rows = String(node.attrs['rowCnt']);
    const cols = String(node.attrs['colCnt']);
    const tableWidthHwp = numOrNull(node.attrs['width']) ?? undefined;
    const tableInner = renderTableSpec(String(node.attrs['cellsJson'] ?? ''), tableWidthHwp);
    return [
      'span',
      {
        'data-hwpx-table': 'true',
        'data-rows': rows,
        'data-cols': cols,
        class: 'hwpx-table-atom',
        title: `표 ${rows}×${cols} — 클릭해 선택 후 도구 모음에서 행/열 추가, 셀 편집`,
      },
      tableInner,
    ] as DOMOutputSpec;
  },
};

interface PreviewInline {
  kind?: string;
  value?: string;
  /** toPM 에서 enrichTableForPreview 가 주입한 표시용 src (blob URL). */
  src?: string;
  binaryRef?: string;
  width?: number;
  height?: number;
  table?: PreviewTable;
  /** kind === 'shapeGroup' 일 때 도형 안 콜아웃 라벨 (하이픈 조인). */
  labels?: string;
}
/**
 * toPM 의 `enrichCell` 이 run 별로 미리 계산해 주입하는 CSS 장식 필드.
 * schema 의 renderCell 은 런타임 charProps/fontFaces 에 접근할 수 없기 때문.
 */
interface PreviewRunStyle {
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  backgroundColor?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  position?: 'superscript' | 'subscript';
}

interface PreviewRun {
  inlines?: PreviewInline[];
  style?: PreviewRunStyle;
}

/**
 * toPM 의 `enrichCell` 이 paragraph 단위로 주입하는 CSS 장식 필드.
 * renderCell 은 paraStyle 이 있으면 단락을 <p> 로 감싼다.
 */
interface PreviewParaStyle {
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  lineHeight?: string;
  /** HWPUNIT = 1/100 pt. */
  textIndent?: number;
  paddingLeft?: number;
  paddingRight?: number;
  marginTop?: number;
  marginBottom?: number;
}

interface PreviewPara {
  runs?: PreviewRun[];
  paraStyle?: PreviewParaStyle;
}
interface PreviewBorderSide {
  type?: string;
  width?: string;
  color?: string;
}

interface PreviewBorderDecor {
  left?: PreviewBorderSide;
  right?: PreviewBorderSide;
  top?: PreviewBorderSide;
  bottom?: PreviewBorderSide;
  fillColor?: string;
}

interface PreviewCell {
  body?: PreviewPara[];
  /** 셀 너비 (HWPUNIT = 1/100 pt). 파서에서 <hp:cellSz> 로부터 채움. */
  width?: number;
  height?: number;
  marginLeft?: number;
  marginRight?: number;
  marginTop?: number;
  marginBottom?: number;
  colSpan?: number;
  rowSpan?: number;
  header?: boolean;
  /** 셀 내용 세로 정렬 — `<hp:subList vertAlign="…">` 에서 옴. 기본 TOP. */
  vertAlign?: 'TOP' | 'CENTER' | 'BOTTOM';
  /** toPM 에서 borderFillIDRef 를 해석해 주입한 실제 경계/채움 정의. */
  border?: PreviewBorderDecor;
}
interface PreviewRow {
  cells?: PreviewCell[];
}

interface PreviewTable {
  rows?: PreviewRow[];
  /** 표 전체 너비/높이 (HWPUNIT). */
  width?: number;
  height?: number;
  /** 표 전체 borderFillIDRef 해석 결과 (외곽선 / 배경). */
  border?: PreviewBorderDecor;
}

/**
 * HWPX border width 문자열(예: "0.12 mm") 을 CSS pt 값으로 변환.
 * 1 mm ≈ 2.83465 pt. 파싱 실패 시 기본값 0.5pt (뷰어 얇은 선에 가까움).
 */
function parseBorderWidthToPt(raw: string | undefined): number {
  if (!raw) return 0.5;
  const m = /^([\d.]+)\s*(mm|pt)?$/.exec(raw.trim());
  if (!m) return 0.5;
  const v = Number(m[1]);
  if (!Number.isFinite(v) || v <= 0) return 0.5;
  const unit = (m[2] ?? 'mm').toLowerCase();
  return unit === 'pt' ? v : v * 2.83465;
}

/**
 * HWPX 선 종류 → CSS border-style. 미지원 값은 solid 로 대체.
 */
function borderTypeToCss(type: string | undefined): string {
  switch ((type ?? '').toUpperCase()) {
    case 'NONE':
      return 'none';
    case 'DASH':
    case 'DASH_DOT':
    case 'DASH_DOT_DOT':
    case 'LONG_DASH':
      return 'dashed';
    case 'DOT':
    case 'CIRCLE':
      return 'dotted';
    case 'DOUBLE':
    case 'DOUBLE_SLIM':
    case 'SLIM_DOUBLE':
    case 'THICK_SLIM':
    case 'SLIM_THICK':
    case 'SLIM_THICK_SLIM':
      return 'double';
    case 'SOLID':
    case 'THICK':
    default:
      return 'solid';
  }
}

function sideToCss(side: PreviewBorderSide | undefined): string | null {
  if (!side) return null;
  const style = borderTypeToCss(side.type);
  if (style === 'none') return '0 none';
  const widthPt = parseBorderWidthToPt(side.width);
  const color = side.color && /^#/.test(side.color) ? side.color : '#000000';
  return `${widthPt}pt ${style} ${color}`;
}

/**
 * 표 셀 JSON 과 선택적 표 너비를 받아 `<table>` DOMOutputSpec 을 만든다.
 * colgroup 을 써서 뷰어와 유사한 열 폭 레이아웃을 재현하고, 셀 내부의
 * 텍스트·이미지·중첩 표를 재귀적으로 확장한다.
 * 이미지는 toPM 에서 picture inline 에 `src` 를 주입해 두면 `<img>` 로 출력된다.
 */
function renderTableSpec(json: string, tableWidthHwp?: number): DOMOutputSpec {
  let t: PreviewTable | null = null;
  try {
    t = JSON.parse(json) as PreviewTable;
  } catch {
    t = null;
  }
  const rows = t?.rows ?? [];
  const children: DOMOutputSpec[] = [];
  // colgroup — 첫 행 셀들의 width 를 사용 (colSpan 고려).
  const firstRow = rows[0];
  if (firstRow?.cells?.length) {
    const cols: DOMOutputSpec[] = [];
    for (const cell of firstRow.cells) {
      const span = Math.max(1, Number(cell.colSpan ?? 1));
      const perCol = (cell.width ?? 0) / span;
      for (let i = 0; i < span; i++) {
        const attrs: Record<string, string> = {};
        if (perCol > 0) attrs['style'] = `width:${hwpxUnitToPt(perCol)}pt`;
        cols.push(['col', attrs] as DOMOutputSpec);
      }
    }
    if (cols.length > 0) children.push(['colgroup', {}, ...cols] as DOMOutputSpec);
  }
  for (const row of rows) {
    children.push([
      'tr',
      {},
      ...(row.cells ?? []).map((cell) => renderCell(cell)),
    ] as DOMOutputSpec);
  }
  const tableAttrs: Record<string, string> = { class: 'hwpx-table-preview' };
  const styleParts: string[] = [];
  if (tableWidthHwp && tableWidthHwp > 0) {
    styleParts.push(`width:${hwpxUnitToPt(tableWidthHwp)}pt`);
  }
  // 외곽 4면 경계선. 내부 셀은 renderCell 이 개별로 설정.
  const b = t?.border;
  if (b) {
    const sides: Array<[keyof PreviewBorderDecor, string]> = [
      ['top', 'border-top'],
      ['right', 'border-right'],
      ['bottom', 'border-bottom'],
      ['left', 'border-left'],
    ];
    for (const [key, css] of sides) {
      const side = b[key] as PreviewBorderSide | undefined;
      const rule = sideToCss(side);
      if (rule) styleParts.push(`${css}:${rule}`);
    }
    if (b.fillColor) styleParts.push(`background-color:${b.fillColor}`);
  }
  if (styleParts.length > 0) tableAttrs['style'] = styleParts.join(';');
  return ['table', tableAttrs, ...children] as DOMOutputSpec;
}

/**
 * PreviewRunStyle → CSS style string + wrapping span attrs.
 * 한글 폰트는 buildFontStack 으로 스마트 폴백 체인 생성.
 */
function runStyleToAttrs(style: PreviewRunStyle | undefined): Record<string, string> {
  if (!style) return {};
  const parts: string[] = [];
  const attrs: Record<string, string> = {};
  if (typeof style.fontSize === 'number' && style.fontSize > 0) {
    parts.push(`font-size:${style.fontSize}pt`);
  }
  if (style.fontFamily) {
    parts.push(`font-family:${buildFontStack(style.fontFamily, undefined, 'HANGUL')}`);
    attrs['data-font-face'] = style.fontFamily;
  }
  if (style.color) parts.push(`color:${style.color}`);
  if (style.backgroundColor) parts.push(`background-color:${style.backgroundColor}`);
  if (style.bold) parts.push('font-weight:700');
  if (style.italic) parts.push('font-style:italic');
  const decos: string[] = [];
  if (style.underline) decos.push('underline');
  if (style.strike) decos.push('line-through');
  if (decos.length > 0) parts.push(`text-decoration:${decos.join(' ')}`);
  if (style.position === 'superscript') {
    parts.push('vertical-align:super', 'font-size:smaller');
  } else if (style.position === 'subscript') {
    parts.push('vertical-align:sub', 'font-size:smaller');
  }
  if (parts.length > 0) attrs['style'] = parts.join(';');
  return attrs;
}

function renderCell(cell: PreviewCell): DOMOutputSpec {
  const kids: DOMOutputSpec[] = [];
  // 각 paragraph 별로 별도 <p> 를 만들어 정렬·줄간격을 따로 적용한다.
  // 이전엔 모든 inline 을 셀 자식으로 평탄화해 td 에 직접 붙였는데,
  // 그러면 paragraph 가 가진 align/lineHeight 가 사라져 표 안 본문이 항상
  // 좌측 정렬로 보이는 버그가 있었다.
  for (const para of cell.body ?? []) {
    const paraKids: DOMOutputSpec[] = [];
    let textBuffer = '';
    let currentStyleAttrs: Record<string, string> = {};
    const flushText = () => {
      if (textBuffer.length > 0) {
        paraKids.push(['span', { ...currentStyleAttrs }, textBuffer] as DOMOutputSpec);
        textBuffer = '';
      }
    };
    const walkInline = (inl: PreviewInline) => {
      if (inl.kind === 'text') {
        textBuffer += inl.value ?? '';
        return;
      }
      if (inl.kind === 'picture' && inl.src) {
        flushText();
        const w = hwpxUnitToPt(typeof inl.width === 'number' ? inl.width : 0);
        const h = hwpxUnitToPt(typeof inl.height === 'number' ? inl.height : 0);
        const attrs: Record<string, string> = {
          src: String(inl.src),
          class: 'hwpx-table-cell-img',
          loading: 'lazy',
        };
        const styleParts: string[] = [];
        if (w > 0) styleParts.push(`width:${w}pt`);
        if (h > 0) styleParts.push(`height:${h}pt`);
        styleParts.push('max-width:100%');
        attrs['style'] = styleParts.join(';');
        if (typeof inl.binaryRef === 'string') attrs['data-binary-ref'] = inl.binaryRef;
        paraKids.push(['img', attrs] as DOMOutputSpec);
        return;
      }
      if (inl.kind === 'table' && inl.table) {
        flushText();
        paraKids.push(renderTableSpec(JSON.stringify(inl.table), inl.table.width));
        return;
      }
      if (inl.kind === 'shapeGroup') {
        flushText();
        const labels = String(inl.labels ?? '').trim();
        const styleParts: string[] = [];
        if (typeof inl.width === 'number' && inl.width > 0) {
          styleParts.push(`min-width:${Math.min(320, hwpxUnitToPt(inl.width))}pt`);
        }
        if (typeof inl.height === 'number' && inl.height > 0) {
          styleParts.push(`min-height:${Math.min(200, hwpxUnitToPt(inl.height))}pt`);
        }
        const shapeAttrs: Record<string, string> = {
          class: 'hwpx-shape-group',
          title: `도형 그룹 (${labels || '라벨 없음'})`,
          'data-kind': 'shape-group',
        };
        if (styleParts.length > 0) shapeAttrs['style'] = styleParts.join(';');
        paraKids.push(['span', shapeAttrs, labels || '◌ 도형'] as DOMOutputSpec);
        return;
      }
      // tab/lineBreak/bookmark 등은 무시 (MVP).
    };
    for (const run of para.runs ?? []) {
      const nextAttrs = runStyleToAttrs(run.style);
      const sameStyle = JSON.stringify(nextAttrs) === JSON.stringify(currentStyleAttrs);
      if (!sameStyle) {
        flushText();
        currentStyleAttrs = nextAttrs;
      }
      for (const inl of run.inlines ?? []) walkInline(inl);
    }
    flushText();
    const ps = para.paraStyle;
    const paraStyleParts: string[] = [];
    if (ps?.textAlign) paraStyleParts.push(`text-align:${ps.textAlign}`);
    if (ps?.lineHeight) paraStyleParts.push(`line-height:${ps.lineHeight}`);
    if (ps?.textIndent !== undefined && ps.textIndent !== 0) {
      paraStyleParts.push(`text-indent:${hwpxUnitToPt(ps.textIndent)}pt`);
    }
    if (ps?.paddingLeft !== undefined && ps.paddingLeft > 0) {
      paraStyleParts.push(`padding-left:${hwpxUnitToPt(ps.paddingLeft)}pt`);
    }
    if (ps?.paddingRight !== undefined && ps.paddingRight > 0) {
      paraStyleParts.push(`padding-right:${hwpxUnitToPt(ps.paddingRight)}pt`);
    }
    if (ps?.marginTop !== undefined && ps.marginTop > 0) {
      paraStyleParts.push(`margin-top:${hwpxUnitToPt(ps.marginTop)}pt`);
    }
    if (ps?.marginBottom !== undefined && ps.marginBottom > 0) {
      paraStyleParts.push(`margin-bottom:${hwpxUnitToPt(ps.marginBottom)}pt`);
    }
    // 마진 0 기본값. paragraphs 사이 자동 띄어쓰기를 줄여 hwp 와 동일한 간격.
    if (
      ps?.marginTop === undefined ||
      ps.marginTop === 0 ||
      ps?.marginBottom === undefined ||
      ps.marginBottom === 0
    ) {
      if (ps?.marginTop === undefined || ps.marginTop === 0) paraStyleParts.push('margin-top:0');
      if (ps?.marginBottom === undefined || ps.marginBottom === 0)
        paraStyleParts.push('margin-bottom:0');
    }
    const paraAttrs: Record<string, string> = {};
    if (paraStyleParts.length > 0) paraAttrs['style'] = paraStyleParts.join(';');
    if (paraKids.length === 0) {
      kids.push(['p', paraAttrs, '\u00a0'] as DOMOutputSpec);
    } else {
      kids.push(['p', paraAttrs, ...paraKids] as DOMOutputSpec);
    }
  }
  // 셀 폭/padding/rowspan/colspan/vertical-align 을 td 속성에 반영.
  const tdAttrs: Record<string, string> = {};
  const styleParts: string[] = [];
  if (cell.width && cell.width > 0) styleParts.push(`width:${hwpxUnitToPt(cell.width)}pt`);
  if (cell.height && cell.height > 0) styleParts.push(`height:${hwpxUnitToPt(cell.height)}pt`);
  // <hp:subList vertAlign> → CSS vertical-align. CENTER 가 가장 흔함 (제목 셀 등).
  if (cell.vertAlign === 'CENTER') styleParts.push('vertical-align:middle');
  else if (cell.vertAlign === 'BOTTOM') styleParts.push('vertical-align:bottom');
  else if (cell.vertAlign === 'TOP') styleParts.push('vertical-align:top');
  const ml = cell.marginLeft,
    mr = cell.marginRight,
    mt = cell.marginTop,
    mb = cell.marginBottom;
  if (
    (ml !== undefined && ml > 0) ||
    (mr !== undefined && mr > 0) ||
    (mt !== undefined && mt > 0) ||
    (mb !== undefined && mb > 0)
  ) {
    styleParts.push(
      `padding:${hwpxUnitToPt(mt ?? 0)}pt ${hwpxUnitToPt(mr ?? 0)}pt ${hwpxUnitToPt(
        mb ?? 0,
      )}pt ${hwpxUnitToPt(ml ?? 0)}pt`,
    );
  }
  // 셀 4면 경계선 + 배경색. border 가 있으면 지정된 면만 override, 나머지는 기본 CSS 유지.
  const b = cell.border;
  if (b) {
    const sides: Array<[keyof PreviewBorderDecor, string]> = [
      ['top', 'border-top'],
      ['right', 'border-right'],
      ['bottom', 'border-bottom'],
      ['left', 'border-left'],
    ];
    for (const [key, css] of sides) {
      const side = b[key] as PreviewBorderSide | undefined;
      const rule = sideToCss(side);
      if (rule) styleParts.push(`${css}:${rule}`);
    }
    if (b.fillColor) styleParts.push(`background-color:${b.fillColor}`);
  }
  if (styleParts.length > 0) tdAttrs['style'] = styleParts.join(';');
  if (cell.colSpan && cell.colSpan > 1) tdAttrs['colspan'] = String(cell.colSpan);
  if (cell.rowSpan && cell.rowSpan > 1) tdAttrs['rowspan'] = String(cell.rowSpan);
  if (cell.header) tdAttrs['scope'] = 'col';
  if (kids.length === 0) {
    return ['td', tdAttrs, ['p', { style: 'margin:0' }, '\u00a0']] as DOMOutputSpec;
  }
  return ['td', tdAttrs, ...kids] as DOMOutputSpec;
}

const opaqueSpec: NodeSpec = {
  inline: true,
  group: 'inline',
  atom: true,
  attrs: { raw: { default: '' }, path: { default: null } },
  toDOM: (node) => {
    // 섹션/페이지 메타 (secPr, colPr, pageNum 등) — raw 보존은 유지하되 DOM 에선 안 보이게.
    const path = String(node.attrs['path'] ?? '');
    const isStructural = path.startsWith('structural:');
    if (isStructural) {
      return [
        'span',
        {
          class: 'hwpx-opaque hwpx-opaque-structural',
          'data-opaque-path': path,
          style: 'display:none',
          'aria-hidden': 'true',
        },
      ] as DOMOutputSpec;
    }
    return [
      'span',
      { class: 'hwpx-opaque', title: 'preserved opaque XML' },
      '⟨?⟩',
    ] as DOMOutputSpec;
  },
};

/**
 * `<hp:container numberingType="PICTURE">` — 도형 그룹 (콜아웃/화살표/도형 레이블 등).
 * 실제 SVG 렌더는 미구현이고, 현재는 내부 drawText 라벨을 사각 박스 안에 표시한다.
 * raw 는 저장 시 원본 XML 을 그대로 복원하기 위한 보존 필드.
 */
const shapeGroupSpec: NodeSpec = {
  inline: true,
  group: 'inline',
  atom: true,
  selectable: true,
  attrs: {
    labels: { default: '' },
    /** HWPUNIT = 1/100 pt. */
    width: { default: null },
    height: { default: null },
    raw: { default: '' },
    path: { default: null },
  },
  toDOM(node) {
    const labels = String(node.attrs['labels'] ?? '').trim();
    const w = numOrNull(node.attrs['width']);
    const h = numOrNull(node.attrs['height']);
    const styleParts: string[] = [];
    if (w && w > 0) styleParts.push(`min-width:${Math.min(320, hwpxUnitToPt(w))}pt`);
    if (h && h > 0) styleParts.push(`min-height:${Math.min(200, hwpxUnitToPt(h))}pt`);
    const attrs: Record<string, string> = {
      class: 'hwpx-shape-group',
      title: `도형 그룹 (${labels || '라벨 없음'})`,
      'data-kind': 'shape-group',
    };
    if (styleParts.length > 0) attrs['style'] = styleParts.join(';');
    return ['span', attrs, labels || '◌ 도형'] as DOMOutputSpec;
  },
};

const footnoteSpec: NodeSpec = {
  inline: true,
  group: 'inline',
  atom: true,
  attrs: { text: { default: '' } },
  toDOM(node) {
    const t = String(node.attrs['text'] ?? '');
    return [
      'sup',
      {
        class: 'hwpx-footnote',
        'data-kind': 'footnote',
        'data-text': t,
        title: `각주: ${t}`,
      },
      '[각]',
    ] as DOMOutputSpec;
  },
};

const endnoteSpec: NodeSpec = {
  inline: true,
  group: 'inline',
  atom: true,
  attrs: { text: { default: '' } },
  toDOM(node) {
    const t = String(node.attrs['text'] ?? '');
    return [
      'sup',
      {
        class: 'hwpx-endnote',
        'data-kind': 'endnote',
        'data-text': t,
        title: `미주: ${t}`,
      },
      '[미]',
    ] as DOMOutputSpec;
  },
};

const bookmarkSpec: NodeSpec = {
  inline: true,
  group: 'inline',
  atom: true,
  selectable: true,
  attrs: { name: { default: '' } },
  toDOM(node) {
    const n = String(node.attrs['name'] ?? '');
    return [
      'span',
      {
        class: 'hwpx-bookmark',
        'data-bookmark-name': n,
        title: `책갈피: ${n}`,
      },
      '⚑',
    ] as DOMOutputSpec;
  },
};

const commentSpec: NodeSpec = {
  inline: true,
  group: 'inline',
  atom: true,
  attrs: { text: { default: '' }, author: { default: '' } },
  toDOM(node) {
    const t = String(node.attrs['text'] ?? '');
    const author = String(node.attrs['author'] ?? '');
    return [
      'span',
      {
        class: 'hwpx-comment',
        'data-text': t,
        'data-author': author,
        title: author ? `${author}: ${t}` : `메모: ${t}`,
      },
      '💬',
    ] as DOMOutputSpec;
  },
};

const boldSpec: MarkSpec = {
  parseDOM: [{ tag: 'strong' }, { tag: 'b' }],
  toDOM: () => ['strong', 0] as DOMOutputSpec,
};
const italicSpec: MarkSpec = {
  parseDOM: [{ tag: 'em' }, { tag: 'i' }],
  toDOM: () => ['em', 0] as DOMOutputSpec,
};
const underlineSpec: MarkSpec = {
  parseDOM: [{ tag: 'u' }],
  toDOM: () => ['u', 0] as DOMOutputSpec,
};
const strikeSpec: MarkSpec = {
  parseDOM: [{ tag: 's' }, { tag: 'del' }],
  toDOM: () => ['s', 0] as DOMOutputSpec,
};
const superscriptSpec: MarkSpec = {
  excludes: 'superscript subscript',
  parseDOM: [{ tag: 'sup' }],
  toDOM: () => ['sup', 0] as DOMOutputSpec,
};
const subscriptSpec: MarkSpec = {
  excludes: 'superscript subscript',
  parseDOM: [{ tag: 'sub' }],
  toDOM: () => ['sub', 0] as DOMOutputSpec,
};
const charPrSpec: MarkSpec = {
  attrs: { charPrIDRef: { default: '0' } },
  excludes: '',
  toDOM: (mark) =>
    ['span', { 'data-charpr-id': String(mark.attrs['charPrIDRef']) }, 0] as DOMOutputSpec,
};
const hyperlinkSpec: MarkSpec = {
  attrs: { href: { default: '' } },
  inclusive: false,
  parseDOM: [
    {
      tag: 'a[href]',
      getAttrs(node: HTMLElement) {
        return { href: node.getAttribute('href') ?? '' };
      },
    },
  ],
  toDOM: (mark) =>
    ['a', { href: String(mark.attrs['href']), rel: 'noopener noreferrer' }, 0] as DOMOutputSpec,
};

const fontSizeSpec: MarkSpec = {
  attrs: { size: { default: 10 } },
  toDOM: (mark) =>
    ['span', { style: `font-size:${Number(mark.attrs['size'])}pt` }, 0] as DOMOutputSpec,
};

const textColorSpec: MarkSpec = {
  attrs: { color: { default: '#000000' } },
  toDOM: (mark) => ['span', { style: `color:${String(mark.attrs['color'])}` }, 0] as DOMOutputSpec,
};

const bgColorSpec: MarkSpec = {
  attrs: { color: { default: '#FFFF00' } },
  toDOM: (mark) =>
    ['span', { style: `background-color:${String(mark.attrs['color'])}` }, 0] as DOMOutputSpec,
};

/**
 * 한글 계열 서체 폴백. 브라우저는 font-family 목록에서 글리프가 없는 폰트를 건너뛰며
 * 문자 단위로 매칭하므로, 한글 폰트는 Hangul 전용 폰트를 앞에 두는 편이 뷰어 재현에 가깝다.
 * 임베딩된 폰트는 Editor 에서 `@font-face` 로 주입되면 같은 face 이름으로 최우선 매칭된다.
 */
const HANGUL_SANS_FALLBACK = [
  'Pretendard',
  'Apple SD Gothic Neo',
  'Malgun Gothic',
  'Noto Sans KR',
  'NanumGothic',
  'sans-serif',
];
const HANGUL_SERIF_FALLBACK = ['Noto Serif KR', 'AppleMyungjo', 'Batang', 'NanumMyeongjo', 'serif'];
const LATIN_SANS_FALLBACK = [
  'system-ui',
  '-apple-system',
  'Segoe UI',
  'Helvetica',
  'Arial',
  'sans-serif',
];
const LATIN_SERIF_FALLBACK = ['Iowan Old Style', 'Palatino', 'Georgia', 'Times New Roman', 'serif'];
const MONO_FALLBACK = ['ui-monospace', 'SF Mono', 'Menlo', 'Consolas', 'D2Coding', 'monospace'];

/**
 * 한컴 오피스 전용 폰트 이름을 가장 가까운 범용/웹폰트로 치환한다.
 * 값은 "앞쪽이 더 가까운 대체" 순으로 우선순위 배열.
 * 원본 이름을 지우는 게 아니라 그 뒤에 추가되어 글리프 단위 폴백에 활용됨.
 */
const FACE_ALIAS: Record<string, string[]> = {
  함초롬바탕: ['Noto Serif KR', 'AppleMyungjo', 'Batang', 'serif'],
  함초롬돋움: ['Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', 'sans-serif'],
  '맑은 고딕': ['Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', 'sans-serif'],
  돋움: ['Dotum', 'Noto Sans KR', 'Apple SD Gothic Neo', 'sans-serif'],
  바탕: ['Batang', 'AppleMyungjo', 'Noto Serif KR', 'serif'],
  굴림: ['Gulim', 'Noto Sans KR', 'Apple SD Gothic Neo', 'sans-serif'],
  궁서: ['Gungsuh', 'AppleMyungjo', 'Noto Serif KR', 'serif'],
  HY헤드라인M: ['Noto Sans KR', 'Apple SD Gothic Neo', 'sans-serif'],
  HY견고딕: ['Noto Sans KR', 'Apple SD Gothic Neo', 'sans-serif'],
  HY신명조: ['Noto Serif KR', 'AppleMyungjo', 'serif'],
  HY중고딕: ['Noto Sans KR', 'Apple SD Gothic Neo', 'sans-serif'],
  한양신명조: ['Noto Serif KR', 'AppleMyungjo', 'serif'],
  한양헤드라인M: ['Noto Sans KR', 'Apple SD Gothic Neo', 'sans-serif'],
};

/**
 * 휴리스틱: 폰트 이름만으로 serif/sans/mono 분류. 이름에 "명조"/"바탕"/"Serif" 류는 serif,
 * "고딕"/"돋움"/"굴림"/"Sans"/"Gothic" 은 sans, "Mono"/"Consolas"/"D2Coding" 은 mono.
 */
function classifyFace(face: string): 'serif' | 'sans' | 'mono' {
  const f = face.toLowerCase();
  if (/(mono|consolas|menlo|courier|d2coding)/.test(f)) return 'mono';
  if (/(명조|바탕|궁서|myungjo|batang|serif|gungsuh|myeongjo|hy신명조|한양신명조)/i.test(face))
    return 'serif';
  return 'sans';
}

/**
 * fontFace 마크 → CSS font-family 값. 원본 face 를 최우선으로 두고, 그 다음
 * HWPX substFace (원본이 지정한 대체), 한컴 alias, lang 에 맞는 한글 폴백,
 * 마지막으로 라틴 폴백을 이어 붙인다. 중복은 제거.
 */
function buildFontStack(face: string, substFace?: string, lang?: string): string {
  const stack: string[] = [];
  const push = (name: string | undefined) => {
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!stack.includes(trimmed)) stack.push(trimmed);
  };
  push(face);
  push(substFace);
  const alias = FACE_ALIAS[face.trim()];
  if (alias) for (const a of alias) push(a);
  const kind = classifyFace(face);
  const isLatin = (lang ?? '').toUpperCase() === 'LATIN';
  const isMono = kind === 'mono';
  const isSerif = kind === 'serif';

  const hangulChain = isSerif ? HANGUL_SERIF_FALLBACK : HANGUL_SANS_FALLBACK;
  const latinChain = isSerif ? LATIN_SERIF_FALLBACK : LATIN_SANS_FALLBACK;

  if (isMono) {
    for (const n of MONO_FALLBACK) push(n);
    return stack.map((n) => (/\s|^[\d-]/.test(n) ? JSON.stringify(n) : n)).join(', ');
  }
  if (isLatin) {
    for (const n of latinChain) push(n);
    for (const n of hangulChain) push(n); // 한글 글리프 fallback 을 보장
  } else {
    for (const n of hangulChain) push(n);
    for (const n of latinChain) push(n);
  }
  return stack.map((n) => (/\s|^[\d-]/.test(n) ? JSON.stringify(n) : n)).join(', ');
}

const fontFaceSpec: MarkSpec = {
  attrs: {
    face: { default: '' },
    faceIdx: { default: 0 },
    substFace: { default: '' },
    lang: { default: 'HANGUL' },
  },
  toDOM: (mark) => {
    const face = String(mark.attrs['face'] ?? '');
    const subst = String(mark.attrs['substFace'] ?? '') || undefined;
    const lang = String(mark.attrs['lang'] ?? '') || undefined;
    return [
      'span',
      {
        'data-font-face': face,
        'data-font-lang': lang ?? 'HANGUL',
        style: face ? `font-family:${buildFontStack(face, subst, lang)}` : '',
      },
      0,
    ] as DOMOutputSpec;
  },
};

export const hwpxSchema = new Schema({
  nodes: {
    doc: docSpec,
    section: sectionSpec,
    page: pageSpec,
    paragraph: paragraphSpec,
    text: textSpec,
    hardBreak: hardBreakSpec,
    tab: tabSpec,
    image: imageSpec,
    table: tableSpec,
    footnote: footnoteSpec,
    endnote: endnoteSpec,
    bookmark: bookmarkSpec,
    comment: commentSpec,
    shapeGroup: shapeGroupSpec,
    opaque: opaqueSpec,
  },
  marks: {
    charPr: charPrSpec,
    bold: boldSpec,
    italic: italicSpec,
    underline: underlineSpec,
    strike: strikeSpec,
    superscript: superscriptSpec,
    subscript: subscriptSpec,
    hyperlink: hyperlinkSpec,
    fontSize: fontSizeSpec,
    textColor: textColorSpec,
    bgColor: bgColorSpec,
    fontFace: fontFaceSpec,
  },
});
