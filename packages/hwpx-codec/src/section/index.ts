import type { Cell, Inline, PagePr, Paragraph, Row, Run, Section, Table } from '../model/index.js';
import { HwpxParseError } from '../errors.js';
import { preserveNode } from '../preservation/index.js';
import {
  attrs,
  buildDocument,
  children,
  elem,
  findRoot,
  parseXml,
  reparse,
  tagName,
  text,
  textOf,
  type OrderedNode,
} from '../xml/index.js';

/**
 * Contents/section{N}.xml
 *
 *   <hs:sec xmlns:hs="..." xmlns:hp="...">
 *     <hp:p id="0" paraPrIDRef="0" styleIDRef="0">
 *       <hp:run charPrIDRef="0">
 *         <hp:t>Hello</hp:t>
 *       </hp:run>
 *     </hp:p>
 *   </hs:sec>
 */
export function parseSection(xml: string, id: string): Section {
  const doc = parseXml(xml);
  const sec = findRoot(doc, 'hs:sec') ?? findRoot(doc, 'sec');
  if (!sec) {
    throw new HwpxParseError(`section "${id}": missing <sec> root`);
  }

  const body: Paragraph[] = [];
  let pagePr: PagePr | undefined;
  for (const child of children(sec)) {
    const n = tagName(child);
    if (n === 'hp:p' || n === 'p') {
      body.push(parseParagraph(child));
      if (!pagePr) pagePr = findPagePrInParagraph(child);
    } else if (n === 'hp:secPr' || n === 'secPr') {
      pagePr = parsePagePr(child);
    }
  }
  const headerText = findHeaderFooter(sec, 'header');
  const footerText = findHeaderFooter(sec, 'footer');
  const base: Section = { id, body };
  const out: Section = { ...base };
  if (pagePr) out.pagePr = pagePr;
  if (headerText) out.headerText = headerText;
  if (footerText) out.footerText = footerText;
  return out;
}

function findPagePrInParagraph(node: OrderedNode): PagePr | undefined {
  // hp:secPr 는 hp:p 의 임의 깊이 자손 (흔히 hp:run > hp:ctrl > hp:secPr) 로 들어올 수 있어
  // recursive 로 관통한다. 첫 번째 발견한 secPr 을 pagePr 로 사용.
  const seek = (n: OrderedNode): PagePr | undefined => {
    for (const c of children(n)) {
      const t = tagName(c);
      if (!t || t === '#text') continue;
      if (t === 'hp:secPr' || t === 'secPr') {
        const parsed = parsePagePr(c);
        if (parsed) return parsed;
      }
      const nested = seek(c);
      if (nested) return nested;
    }
    return undefined;
  };
  return seek(node);
}

function parsePagePr(node: OrderedNode): PagePr | undefined {
  // OWPML: <hp:secPr> → <hp:pagePr width=.. height=.. landscape=..> → <hp:margin left=.. ..>
  // 이전 버전은 <hp:pageDef> 를 찾았지만 실제 스펙은 hp:pagePr. 마진도 자식 element 로 분리.
  const seekPagePr = (n: OrderedNode): OrderedNode | undefined => {
    for (const c of children(n)) {
      const t = tagName(c);
      if (!t) continue;
      if (t === 'hp:pagePr' || t === 'pagePr' || t === 'hp:pageDef' || t === 'pageDef') return c;
      // hp:switch/hp:case/hp:default wrappers (버전 분기) 관통
      if (
        t === 'hp:switch' ||
        t === 'switch' ||
        t === 'hp:case' ||
        t === 'case' ||
        t === 'hp:default' ||
        t === 'default'
      ) {
        const nested = seekPagePr(c);
        if (nested) return nested;
      }
    }
    return undefined;
  };
  const pagePr = seekPagePr(node);
  if (!pagePr) return undefined;
  const a = attrs(pagePr);

  // margin 은 자식 <hp:margin left=.. right=.. top=.. bottom=.. header=.. footer=.. gutter=../>
  // 호환성을 위해 pagePr 속성에 margin 이 직접 있는 경우도 fallback.
  let marginNode: OrderedNode | undefined;
  for (const c of children(pagePr)) {
    const t = tagName(c);
    if (t === 'hp:margin' || t === 'margin') {
      marginNode = c;
      break;
    }
  }
  const m = marginNode ? attrs(marginNode) : {};
  const pick = (child: string, legacyAttr: string, fallback: number): number =>
    toInt(m[child] ?? a[legacyAttr], fallback);
  const pickOpt = (child: string, legacyAttr: string): number | undefined => {
    const v = m[child] ?? a[legacyAttr];
    return v !== undefined ? toIntOpt(v) : undefined;
  };

  return {
    width: toInt(a['width'], 59528),
    height: toInt(a['height'], 84189),
    landscape: (a['landscape'] ?? '').toUpperCase() === 'WIDELY',
    marginLeft: pick('left', 'marginLeft', 8504),
    marginRight: pick('right', 'marginRight', 8504),
    marginTop: pick('top', 'marginTop', 5668),
    marginBottom: pick('bottom', 'marginBottom', 5668),
    marginHeader: pickOpt('header', 'marginHeader'),
    marginFooter: pickOpt('footer', 'marginFooter'),
    marginGutter: pickOpt('gutter', 'gutter'),
  };
}

function findHeaderFooter(sec: OrderedNode, kind: 'header' | 'footer'): string | undefined {
  const seek = (node: OrderedNode): string | undefined => {
    for (const child of children(node)) {
      const n = tagName(child);
      if (n === `hp:${kind}` || n === kind) return collectAllText(child);
      const nested = seek(child);
      if (nested !== undefined) return nested;
    }
    return undefined;
  };
  return seek(sec);
}

function collectAllText(node: OrderedNode): string {
  let out = '';
  for (const child of children(node)) {
    const t = textOf(child);
    if (t !== undefined) {
      out += t;
      continue;
    }
    out += collectAllText(child);
  }
  return out.trim();
}

function toIntOpt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

function parseParagraph(node: OrderedNode): Paragraph {
  const a = attrs(node);
  const runs: Run[] = [];
  for (const child of children(node)) {
    const n = tagName(child);
    if (n === 'hp:run' || n === 'run') {
      runs.push(parseRun(child));
    }
  }
  // HWPX 는 boolean 을 "1"/"0" 으로 쓰는 경우가 대부분이나 writer 에 따라 "true"/"false"
  // 도 혼재. 두 표기 모두 true 로 인정.
  const truthy = (v: string | undefined): boolean | undefined =>
    v === '1' || v === 'true' ? true : undefined;
  return {
    id: a['id'] ?? '',
    paraPrIDRef: a['paraPrIDRef'] ?? '0',
    styleIDRef: a['styleIDRef'],
    pageBreak: truthy(a['pageBreak']),
    columnBreak: truthy(a['columnBreak']),
    runs,
  };
}

function parseRun(node: OrderedNode): Run {
  const a = attrs(node);
  const inlines: Inline[] = [];
  for (const child of children(node)) {
    const inline = parseInline(child);
    if (inline) inlines.push(inline);
  }
  return {
    charPrIDRef: a['charPrIDRef'] ?? '0',
    inlines,
  };
}

function parseInline(node: OrderedNode): Inline | undefined {
  const name = tagName(node);
  if (!name) return undefined;
  // 요소 사이 공백/개행 텍스트 노드는 무시
  if (name === '#text') return undefined;

  // 섹션 메타데이터 — <hp:ctrl> 이 감싸는 <hp:secPr>/<hp:colPr>/<hp:header>/<hp:footer>/<hp:pageNum>/<hp:pageHiding>/<hp:autoNum>
  // 등은 page-level 설정이지 본문 inline 이 아니다. 뷰어에도 보이지 않는다.
  // round-trip 보존을 위해 opaque 로 유지하되 preview 가 display:none 으로 숨김.
  // (opaque.raw.path 가 'structural' 접두사를 가지면 schema.ts 의 toDOM 이 CSS 로 hide)
  if (name === 'hp:ctrl' || name === 'ctrl') {
    if (isStructuralCtrl(node)) {
      const preserved = preserveNode(node);
      return {
        kind: 'opaque',
        raw: { ...preserved, path: `structural:${preserved.path ?? 'ctrl'}` },
      };
    }
    return { kind: 'opaque', raw: preserveNode(node) };
  }
  // secPr / colPr 가 ctrl 없이 바로 run 자식으로 나오는 경우 — 마찬가지로 보존 + 숨김.
  if (
    name === 'hp:secPr' ||
    name === 'secPr' ||
    name === 'hp:colPr' ||
    name === 'colPr' ||
    name === 'hp:pageHiding' ||
    name === 'pageHiding'
  ) {
    const preserved = preserveNode(node);
    return {
      kind: 'opaque',
      raw: { ...preserved, path: `structural:${preserved.path ?? name}` },
    };
  }

  if (name === 'hp:t' || name === 't') {
    return { kind: 'text', value: collectRunText(node) };
  }
  if (name === 'hp:tab' || name === 'tab') {
    return { kind: 'tab' };
  }
  if (name === 'hp:lineBreak' || name === 'lineBreak') {
    return { kind: 'lineBreak' };
  }
  if (name === 'hp:pageBreak' || name === 'pageBreak') {
    return { kind: 'pageBreak' };
  }
  if (name === 'hp:bookmark' || name === 'bookmark') {
    const a = attrs(node);
    return { kind: 'bookmark', name: a['name'] ?? '' };
  }
  if (name === 'hp:fieldBegin' || name === 'fieldBegin') {
    const a = attrs(node);
    if ((a['type'] ?? '').toUpperCase() === 'HYPERLINK') {
      return {
        kind: 'hyperlink',
        href: a['command'] ?? a['name'] ?? '',
        inlines: [],
      };
    }
    return { kind: 'opaque', raw: preserveNode(node) };
  }
  if (name === 'hp:pic' || name === 'pic') {
    return parsePicture(node);
  }
  if (name === 'hp:tbl' || name === 'tbl') {
    return { kind: 'table', table: parseTable(node) };
  }
  if (name === 'hp:footNote' || name === 'footNote') {
    return { kind: 'footnote', text: extractNoteText(node) };
  }
  if (name === 'hp:endNote' || name === 'endNote') {
    return { kind: 'endnote', text: extractNoteText(node) };
  }
  if (name === 'hp:memo' || name === 'memo') {
    const a = attrs(node);
    return {
      kind: 'comment',
      text: extractNoteText(node),
      author: a['author'] ?? undefined,
    };
  }
  if (name === 'hp:container' || name === 'container') {
    const a = attrs(node);
    const numType = (a['numberingType'] ?? '').toUpperCase();
    // 다른 numberingType (NONE 등) 은 더 큰 컨텍스트가 필요하므로 opaque 유지.
    if (numType === 'PICTURE') {
      return parseShapeGroup(node);
    }
  }
  return { kind: 'opaque', raw: preserveNode(node) };
}

function parseShapeGroup(node: OrderedNode): Inline {
  // <hp:curSz width height> (직계 자식). HWPUNIT = 1/100 pt.
  let width: number | undefined;
  let height: number | undefined;
  for (const child of children(node)) {
    const n = tagName(child);
    if (n === 'hp:curSz' || n === 'curSz') {
      const a = attrs(child);
      width = toIntOpt(a['width']);
      height = toIntOpt(a['height']);
      break;
    }
  }
  // drawText 하위의 모든 <hp:t> 텍스트를 모은다 — 도형에 들어간 콜아웃 라벨.
  const labels = collectDrawTextLabels(node);
  return {
    kind: 'shapeGroup',
    labels,
    width,
    height,
    raw: preserveNode(node),
  };
}

/**
 * hp:container 하위 도형의 drawText 안의 `<hp:t>` 을 순서대로 수집해 공백으로 연결.
 * `hp:t` 자체는 요소 노드이므로 그 내부 #text 자식을 모아야 한다 (`collectRunText` 참고).
 */
function collectDrawTextLabels(root: OrderedNode): string {
  const chunks: string[] = [];
  const extractElementText = (node: OrderedNode): string => {
    let out = '';
    for (const c of children(node)) {
      const t = textOf(c);
      if (t !== undefined) out += t;
    }
    return out;
  };
  const walk = (node: OrderedNode, inDrawText: boolean) => {
    const n = tagName(node);
    const isDrawText = n === 'hp:drawText' || n === 'drawText';
    for (const c of children(node)) {
      const cn = tagName(c);
      if ((cn === 'hp:t' || cn === 't') && (inDrawText || isDrawText)) {
        const t = extractElementText(c);
        if (t) chunks.push(t);
        continue;
      }
      walk(c, inDrawText || isDrawText);
    }
  };
  walk(root, false);
  return chunks
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join(' ');
}

function extractNoteText(node: OrderedNode): string {
  // footNote/endNote → subList → p → run → t.  본문과 동일하지만 MVP 는 평문.
  return collectAllText(node);
}

/**
 * <hp:ctrl> 안이 페이지/섹션 메타데이터 (secPr, colPr, pageNum, header/footer, pageHiding, autoNum…) 면 true.
 * 이런 ctrl 은 본문 표현이 아니므로 opaque 로 남기지 말고 드롭해야 사용자에게 ⟨?⟩ 가 보이지 않는다.
 */
function isStructuralCtrl(node: OrderedNode): boolean {
  const STRUCTURAL = new Set([
    'hp:secPr',
    'secPr',
    'hp:colPr',
    'colPr',
    'hp:header',
    'header',
    'hp:footer',
    'footer',
    'hp:pageNum',
    'pageNum',
    'hp:pageHiding',
    'pageHiding',
    'hp:pageNumCtrl',
    'pageNumCtrl',
    'hp:autoNum',
    'autoNum',
    'hp:newNum',
    'newNum',
    'hp:indexMark',
    'indexMark',
  ]);
  for (const c of children(node)) {
    const n = tagName(c);
    if (!n || n === '#text') continue;
    if (STRUCTURAL.has(n)) return true;
    // 첫 의미 있는 자식만 확인하면 충분.
    return false;
  }
  return false;
}

function collectRunText(node: OrderedNode): string {
  let out = '';
  for (const child of children(node)) {
    const text = textOf(child);
    if (text !== undefined) {
      out += text;
      continue;
    }
    const n = tagName(child);
    if (n === 'hp:tab' || n === 'tab') out += '\t';
    else if (n === 'hp:lineBreak' || n === 'lineBreak') out += '\n';
  }
  return out;
}

function parsePicture(node: OrderedNode): Inline {
  const a = attrs(node);
  let binaryRef = a['binaryItemIDRef'] ?? '';
  let width = toInt(a['width'], 0);
  let height = toInt(a['height'], 0);

  for (const child of children(node)) {
    const n = tagName(child);
    if (n === 'hc:img' || n === 'img') {
      const ca = attrs(child);
      binaryRef = ca['binaryItemIDRef'] ?? binaryRef;
    } else if (n === 'hp:sz' || n === 'sz' || n === 'hc:sz') {
      const ca = attrs(child);
      width = toInt(ca['width'], width);
      height = toInt(ca['height'], height);
    }
  }
  return { kind: 'picture', binaryRef, width, height };
}

function parseTable(node: OrderedNode): Table {
  const a = attrs(node);
  const rowCnt = toInt(a['rowCnt'], 0);
  const colCnt = toInt(a['colCnt'], 0);
  const borderFillIDRef = a['borderFillIDRef'];
  const rows: Row[] = [];
  let width: number | undefined;
  let height: number | undefined;
  for (const child of children(node)) {
    const n = tagName(child);
    if (n === 'hp:tr' || n === 'tr') {
      rows.push(parseRow(child));
    } else if (n === 'hp:sz' || n === 'sz') {
      const ca = attrs(child);
      width = toIntOpt(ca['width']);
      height = toIntOpt(ca['height']);
    }
  }
  const out: Table = { rowCnt, colCnt, borderFillIDRef, rows };
  if (width !== undefined) out.width = width;
  if (height !== undefined) out.height = height;
  return out;
}

function parseRow(node: OrderedNode): Row {
  const cells: Cell[] = [];
  for (const child of children(node)) {
    const n = tagName(child);
    if (n === 'hp:tc' || n === 'tc') {
      cells.push(parseCell(child));
    }
  }
  return { cells };
}

function parseCell(node: OrderedNode): Cell {
  const a = attrs(node);
  const body: Paragraph[] = [];
  let rowSpan = 1;
  let colSpan = 1;
  let width: number | undefined;
  let height: number | undefined;
  let marginLeft: number | undefined;
  let marginRight: number | undefined;
  let marginTop: number | undefined;
  let marginBottom: number | undefined;
  let colAddr: number | undefined;
  let rowAddr: number | undefined;
  let vertAlign: 'TOP' | 'CENTER' | 'BOTTOM' | undefined;

  for (const child of children(node)) {
    const n = tagName(child);
    if (n === 'hp:subList' || n === 'subList') {
      const sa = attrs(child);
      const va = (sa['vertAlign'] ?? '').toUpperCase();
      if (va === 'TOP' || va === 'CENTER' || va === 'BOTTOM') {
        vertAlign = va;
      }
      for (const sub of children(child)) {
        const sn = tagName(sub);
        if (sn === 'hp:p' || sn === 'p') body.push(parseParagraph(sub));
      }
    } else if (n === 'hp:cellSpan' || n === 'cellSpan') {
      const ca = attrs(child);
      rowSpan = toInt(ca['rowSpan'], rowSpan);
      colSpan = toInt(ca['colSpan'], colSpan);
    } else if (n === 'hp:cellSz' || n === 'cellSz') {
      const ca = attrs(child);
      width = toIntOpt(ca['width']);
      height = toIntOpt(ca['height']);
    } else if (n === 'hp:cellMargin' || n === 'cellMargin') {
      const ca = attrs(child);
      marginLeft = toIntOpt(ca['left']);
      marginRight = toIntOpt(ca['right']);
      marginTop = toIntOpt(ca['top']);
      marginBottom = toIntOpt(ca['bottom']);
    } else if (n === 'hp:cellAddr' || n === 'cellAddr') {
      const ca = attrs(child);
      colAddr = toIntOpt(ca['colAddr']);
      rowAddr = toIntOpt(ca['rowAddr']);
    } else if (n === 'hp:p' || n === 'p') {
      body.push(parseParagraph(child));
    }
  }

  const out: Cell = {
    rowSpan: toInt(a['rowSpan'], rowSpan),
    colSpan: toInt(a['colSpan'], colSpan),
    header: a['header'] === 'true',
    body,
  };
  if (a['borderFillIDRef']) out.borderFillIDRef = a['borderFillIDRef'];
  if (width !== undefined) out.width = width;
  if (height !== undefined) out.height = height;
  if (marginLeft !== undefined) out.marginLeft = marginLeft;
  if (marginRight !== undefined) out.marginRight = marginRight;
  if (marginTop !== undefined) out.marginTop = marginTop;
  if (marginBottom !== undefined) out.marginBottom = marginBottom;
  if (colAddr !== undefined) out.colAddr = colAddr;
  if (rowAddr !== undefined) out.rowAddr = rowAddr;
  if (vertAlign !== undefined) out.vertAlign = vertAlign;
  return out;
}

function toInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

const HS_NS = 'http://www.hancom.co.kr/hwpml/2011/section';
const HP_NS = 'http://www.hancom.co.kr/hwpml/2011/paragraph';

export function serializeSection(s: Section): string {
  const body = s.body.map(serializeParagraph);
  const preface: OrderedNode[] = [];
  const hasHeader = s.headerText && s.headerText.length > 0;
  const hasFooter = s.footerText && s.footerText.length > 0;
  if (s.pagePr || hasHeader || hasFooter) {
    preface.push(serializeSecPr(s));
  }
  const root = elem('hs:sec', { 'xmlns:hs': HS_NS, 'xmlns:hp': HP_NS }, [...preface, ...body]);
  return buildDocument(root);
}

function serializeSecPr(s: Section): OrderedNode {
  const ch: OrderedNode[] = [];
  if (s.pagePr) {
    ch.push(serializePageDef(s.pagePr));
  }
  if (s.headerText) {
    ch.push(
      elem('hp:header', { applyPageType: 'BOTH' }, [
        elem('hp:subList', {}, [buildPlainParagraph(s.headerText)]),
      ]),
    );
  }
  if (s.footerText) {
    ch.push(
      elem('hp:footer', { applyPageType: 'BOTH' }, [
        elem('hp:subList', {}, [buildPlainParagraph(s.footerText)]),
      ]),
    );
  }
  return elem('hp:secPr', {}, ch);
}

function serializePageDef(pp: PagePr): OrderedNode {
  return elem('hp:pageDef', {
    width: String(pp.width),
    height: String(pp.height),
    landscape: pp.landscape ? 'WIDELY' : 'NARROWLY',
    marginLeft: String(pp.marginLeft),
    marginRight: String(pp.marginRight),
    marginTop: String(pp.marginTop),
    marginBottom: String(pp.marginBottom),
    marginHeader: pp.marginHeader !== undefined ? String(pp.marginHeader) : undefined,
    marginFooter: pp.marginFooter !== undefined ? String(pp.marginFooter) : undefined,
    gutter: pp.marginGutter !== undefined ? String(pp.marginGutter) : undefined,
  });
}

function buildPlainParagraph(text: string): OrderedNode {
  return elem('hp:p', { id: '0', paraPrIDRef: '0' }, [
    elem('hp:run', { charPrIDRef: '0' }, [elem('hp:t', {}, [serializeText(text)])]),
  ]);
}

function serializeText(s: string) {
  return text(s);
}

function serializeParagraph(p: Paragraph): OrderedNode {
  const runs = p.runs.map(serializeRun);
  return elem(
    'hp:p',
    {
      id: p.id,
      paraPrIDRef: p.paraPrIDRef,
      styleIDRef: p.styleIDRef,
      // HWP Office 는 boolean 을 "1"/"0" 으로 직렬화. reader 는 둘 다 허용하지만 writer 는
      // 표준 표기를 따른다.
      pageBreak: p.pageBreak ? '1' : undefined,
      columnBreak: p.columnBreak ? '1' : undefined,
    },
    runs,
  );
}

function serializeRun(r: Run): OrderedNode {
  const inlines = r.inlines.flatMap(serializeInline);
  return elem('hp:run', { charPrIDRef: r.charPrIDRef }, inlines);
}

function serializeInline(inline: Inline): OrderedNode[] {
  switch (inline.kind) {
    case 'text':
      return [elem('hp:t', {}, [text(inline.value)])];
    case 'tab':
      return [elem('hp:tab')];
    case 'lineBreak':
      return [elem('hp:lineBreak')];
    case 'pageBreak':
      return [elem('hp:pageBreak')];
    case 'bookmark':
      return [elem('hp:bookmark', { name: inline.name })];
    case 'hyperlink':
      return [
        elem('hp:fieldBegin', { type: 'HYPERLINK', command: inline.href }),
        ...inline.inlines.flatMap(serializeInline),
        elem('hp:fieldEnd', { type: 'HYPERLINK' }),
      ];
    case 'picture':
      return [
        elem('hp:pic', {
          binaryItemIDRef: inline.binaryRef,
          width: String(inline.width),
          height: String(inline.height),
        }),
      ];
    case 'table':
      return [serializeTable(inline.table)];
    case 'footnote':
      return [
        elem('hp:footNote', {}, [elem('hp:subList', {}, [buildPlainParagraph(inline.text)])]),
      ];
    case 'endnote':
      return [elem('hp:endNote', {}, [elem('hp:subList', {}, [buildPlainParagraph(inline.text)])])];
    case 'comment':
      return [
        elem('hp:memo', inline.author ? { author: inline.author } : {}, [
          elem('hp:subList', {}, [buildPlainParagraph(inline.text)]),
        ]),
      ];
    case 'shapeGroup':
      // 도형 그룹은 preview 에서 라벨만 뽑고, 저장 시 원본 XML 을 그대로 복원한다.
      return reparse(inline.raw.raw);
    case 'opaque':
      return reparse(inline.raw.raw);
  }
}

function serializeTable(t: Table): OrderedNode {
  const kids: OrderedNode[] = [];
  if (t.width !== undefined || t.height !== undefined) {
    kids.push(
      elem('hp:sz', {
        width: t.width !== undefined ? String(t.width) : undefined,
        widthRelTo: 'ABSOLUTE',
        height: t.height !== undefined ? String(t.height) : undefined,
        heightRelTo: 'ABSOLUTE',
        protect: '0',
      }),
    );
  }
  for (const row of t.rows) kids.push(serializeRow(row));
  return elem(
    'hp:tbl',
    {
      rowCnt: String(t.rowCnt),
      colCnt: String(t.colCnt),
      borderFillIDRef: t.borderFillIDRef,
    },
    kids,
  );
}

function serializeRow(r: Row): OrderedNode {
  return elem('hp:tr', {}, r.cells.map(serializeCell));
}

function serializeCell(c: Cell): OrderedNode {
  const subListAttrs: Record<string, string | undefined> = {};
  if (c.vertAlign) subListAttrs['vertAlign'] = c.vertAlign;
  const subList = elem('hp:subList', subListAttrs, c.body.map(serializeParagraph));
  const kids: OrderedNode[] = [subList];
  if (c.colAddr !== undefined || c.rowAddr !== undefined) {
    kids.push(
      elem('hp:cellAddr', {
        colAddr: c.colAddr !== undefined ? String(c.colAddr) : undefined,
        rowAddr: c.rowAddr !== undefined ? String(c.rowAddr) : undefined,
      }),
    );
  }
  kids.push(
    elem('hp:cellSpan', {
      colSpan: String(c.colSpan),
      rowSpan: String(c.rowSpan),
    }),
  );
  if (c.width !== undefined || c.height !== undefined) {
    kids.push(
      elem('hp:cellSz', {
        width: c.width !== undefined ? String(c.width) : undefined,
        height: c.height !== undefined ? String(c.height) : undefined,
      }),
    );
  }
  if (
    c.marginLeft !== undefined ||
    c.marginRight !== undefined ||
    c.marginTop !== undefined ||
    c.marginBottom !== undefined
  ) {
    kids.push(
      elem('hp:cellMargin', {
        left: c.marginLeft !== undefined ? String(c.marginLeft) : undefined,
        right: c.marginRight !== undefined ? String(c.marginRight) : undefined,
        top: c.marginTop !== undefined ? String(c.marginTop) : undefined,
        bottom: c.marginBottom !== undefined ? String(c.marginBottom) : undefined,
      }),
    );
  }
  return elem(
    'hp:tc',
    {
      header: c.header ? '1' : undefined,
      borderFillIDRef: c.borderFillIDRef,
    },
    kids,
  );
}
