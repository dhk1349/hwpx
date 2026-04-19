import type {
  BeginNum,
  BorderFill,
  BorderSide,
  Bullet,
  CharPr,
  FontFace,
  Header,
  Numbering,
  ParaPr,
  Style,
} from '../model/index.js';
import { HwpxParseError } from '../errors.js';
import {
  attrs,
  buildDocument,
  children,
  elem,
  findChild,
  findRoot,
  parseXml,
  tagName,
} from '../xml/index.js';

const DEFAULT_BEGIN_NUM: BeginNum = {
  page: 1,
  footnote: 1,
  endnote: 1,
  pic: 1,
  tbl: 1,
  equation: 1,
};

/**
 * Contents/header.xml
 *
 *   <hh:head xmlns:hh="..." xmlns:hc="...">
 *     <hh:beginNum page="1" footnote="1" .../>
 *     <hh:refList>
 *       <hh:fontfaces>...</hh:fontfaces>
 *       <hh:borderFills>...</hh:borderFills>
 *       <hh:charProperties>...</hh:charProperties>
 *       <hh:paraProperties>...</hh:paraProperties>
 *       <hh:styles>...</hh:styles>
 *       <hh:bullets>...</hh:bullets>
 *       <hh:numberings>...</hh:numberings>
 *     </hh:refList>
 *   </hh:head>
 */
export function parseHeader(xml: string): Header {
  const doc = parseXml(xml);
  const head = findRoot(doc, 'hh:head') ?? findRoot(doc, 'head');
  if (!head) {
    throw new HwpxParseError('header.xml: missing <head> root');
  }

  const beginNumNode = findChild(head, 'hh:beginNum') ?? findChild(head, 'beginNum');
  const beginNum = beginNumNode ? parseBeginNum(beginNumNode) : DEFAULT_BEGIN_NUM;

  const refList = findChild(head, 'hh:refList') ?? findChild(head, 'refList') ?? head;

  const fontFaces = parseFontFaces(refList);
  const borderFills = parseBorderFills(refList);
  const charProps = parseCharProperties(refList);
  const paraProps = parseParaProperties(refList);
  const styles = parseStyles(refList);
  const bullets = parseBullets(refList);
  const numberings = parseNumberings(refList);

  return {
    beginNum,
    fontFaces,
    borderFills,
    charProps,
    paraProps,
    styles,
    bullets,
    numberings,
  };
}

function parseBeginNum(node: ReturnType<typeof findChild>): BeginNum {
  if (!node) return DEFAULT_BEGIN_NUM;
  const a = attrs(node);
  return {
    page: toInt(a['page'], DEFAULT_BEGIN_NUM.page),
    footnote: toInt(a['footnote'], DEFAULT_BEGIN_NUM.footnote),
    endnote: toInt(a['endnote'], DEFAULT_BEGIN_NUM.endnote),
    pic: toInt(a['pic'], DEFAULT_BEGIN_NUM.pic),
    tbl: toInt(a['tbl'], DEFAULT_BEGIN_NUM.tbl),
    equation: toInt(a['equation'], DEFAULT_BEGIN_NUM.equation),
  };
}

function container(
  refList: ReturnType<typeof findRoot>,
  ...names: string[]
): ReturnType<typeof findChild>[] {
  if (!refList) return [];
  for (const name of names) {
    const node = findChild(refList, name);
    if (node) return [node];
  }
  return [];
}

function parseFontFaces(refList: ReturnType<typeof findRoot>): FontFace[] {
  const [bucket] = container(refList, 'hh:fontfaces', 'fontfaces');
  if (!bucket) return [];
  const out: FontFace[] = [];
  for (const group of children(bucket)) {
    const name = tagName(group);
    if (name !== 'hh:fontface' && name !== 'fontface') continue;
    const a = attrs(group);
    const lang = a['lang'] ?? 'HANGUL';
    for (const font of children(group)) {
      const fn = tagName(font);
      if (fn !== 'hh:font' && fn !== 'font') continue;
      const fa = attrs(font);
      const substNode = findChild(font, 'hh:substFont') ?? findChild(font, 'substFont');
      const sa = substNode ? attrs(substNode) : undefined;
      // OWPML 스펙은 `face=` 를 쓰지만 일부 구버전/파서는 `name=` 으로 표현하기도 한다.
      // 둘 다 허용하고, 어느 쪽도 없으면 빈 문자열.
      const faceName = fa['face'] ?? fa['name'] ?? '';
      const substName = sa?.['face'] ?? sa?.['name'];
      out.push({
        lang,
        name: faceName,
        type: fa['type'],
        isEmbedded: fa['isEmbedded'] === 'true' || fa['isEmbedded'] === '1' ? true : undefined,
        binaryItemIDRef: fa['binaryItemIDRef'] ?? fa['binaryItemIdRef'],
        substFace: substName,
        substType: sa?.['type'],
      });
    }
  }
  return out;
}

function parseBorderFills(refList: ReturnType<typeof findRoot>): BorderFill[] {
  const [bucket] = container(refList, 'hh:borderFills', 'borderFills');
  if (!bucket) return [];
  const out: BorderFill[] = [];
  for (const bf of children(bucket)) {
    const n = tagName(bf);
    if (n !== 'hh:borderFill' && n !== 'borderFill') continue;
    const id = attrs(bf)['id'];
    if (!id) continue;
    const entry: BorderFill = { id };
    for (const side of ['leftBorder', 'rightBorder', 'topBorder', 'bottomBorder'] as const) {
      const node = findChild(bf, `hh:${side}`) ?? findChild(bf, side);
      if (!node) continue;
      const a = attrs(node);
      const type = a['type'];
      if (!type) continue;
      const target =
        side === 'leftBorder'
          ? 'left'
          : side === 'rightBorder'
            ? 'right'
            : side === 'topBorder'
              ? 'top'
              : 'bottom';
      const sideRecord: { type: string; width?: string; color?: string } = { type };
      if (a['width']) sideRecord.width = a['width'];
      if (a['color']) sideRecord.color = a['color'];
      entry[target] = sideRecord;
    }
    // `<hc:fillBrush><hc:winBrush faceColor="#CCFFCC"/></hc:fillBrush>` — 채움색.
    const fillBrush = findChild(bf, 'hc:fillBrush') ?? findChild(bf, 'fillBrush');
    if (fillBrush) {
      const winBrush = findChild(fillBrush, 'hc:winBrush') ?? findChild(fillBrush, 'winBrush');
      if (winBrush) {
        const face = attrs(winBrush)['faceColor'];
        if (face && face.toLowerCase() !== 'none') entry.fillColor = face;
      }
    }
    out.push(entry);
  }
  return out;
}

function parseCharProperties(refList: ReturnType<typeof findRoot>): Map<string, CharPr> {
  const [bucket] = container(refList, 'hh:charProperties', 'charProperties');
  const out = new Map<string, CharPr>();
  if (!bucket) return out;
  for (const cp of children(bucket)) {
    const n = tagName(cp);
    if (n !== 'hh:charPr' && n !== 'charPr') continue;
    const a = attrs(cp);
    const id = a['id'];
    if (!id) continue;
    const height = toIntOpt(a['height']);
    const bgRaw = a['shadeColor'] ?? a['bgColor'];
    const bgColor = bgRaw && bgRaw.toLowerCase() !== 'none' ? bgRaw : undefined;
    const bold = findChild(cp, 'hh:bold') ?? findChild(cp, 'bold');
    const italic = findChild(cp, 'hh:italic') ?? findChild(cp, 'italic');
    const underline = findChild(cp, 'hh:underline') ?? findChild(cp, 'underline');
    const strikeout = findChild(cp, 'hh:strikeout') ?? findChild(cp, 'strikeout');
    const fontRef = findChild(cp, 'hh:fontRef') ?? findChild(cp, 'fontRef');
    const fontRefHangul = fontRef ? toIntOpt(attrs(fontRef)['hangul']) : undefined;
    const positionEl = findChild(cp, 'hh:position') ?? findChild(cp, 'position');
    const positionRaw = positionEl ? attrs(positionEl)['value']?.toUpperCase() : undefined;
    const position: 'superscript' | 'subscript' | undefined =
      positionRaw === 'SUPERSCRIPT'
        ? 'superscript'
        : positionRaw === 'SUBSCRIPT'
          ? 'subscript'
          : undefined;
    out.set(id, {
      id,
      height,
      textColor: a['textColor'],
      bgColor,
      fontRefHangul,
      bold: bold ? true : undefined,
      italic: italic ? true : undefined,
      underline: underline ? true : undefined,
      strikeout: strikeout ? true : undefined,
      position,
    });
  }
  return out;
}

function parseParaProperties(refList: ReturnType<typeof findRoot>): Map<string, ParaPr> {
  const [bucket] = container(refList, 'hh:paraProperties', 'paraProperties');
  const out = new Map<string, ParaPr>();
  if (!bucket) return out;
  for (const pp of children(bucket)) {
    const n = tagName(pp);
    if (n !== 'hh:paraPr' && n !== 'paraPr') continue;
    const a = attrs(pp);
    const id = a['id'];
    if (!id) continue;
    // 자식 요소에서 실제 속성을 모은다. OWPML paraPr 는 대부분 값을
    // 자식 엘리먼트로 표현함: <hh:align>, <hh:margin>, <hh:lineSpacing>.
    // <hp:switch>/<hp:default> 안에 들어 있을 수 있으므로 평탄화해 접근.
    const alignNode = findDescendant(pp, 'hh:align', 'align');
    const alignRaw = alignNode ? attrs(alignNode)['horizontal'] : undefined;
    const marginNode = findDescendant(pp, 'hh:margin', 'margin');
    const indentFirstLine = marginNode
      ? (readSubValue(marginNode, 'hc:intent', 'intent') ??
        readSubValue(marginNode, 'hc:indent', 'indent'))
      : undefined;
    const indentLeft = marginNode ? readSubValue(marginNode, 'hc:left', 'left') : undefined;
    const indentRight = marginNode ? readSubValue(marginNode, 'hc:right', 'right') : undefined;
    const marginPrev = marginNode ? readSubValue(marginNode, 'hc:prev', 'prev') : undefined;
    const marginNext = marginNode ? readSubValue(marginNode, 'hc:next', 'next') : undefined;
    const lineSpacingNode = findDescendant(pp, 'hh:lineSpacing', 'lineSpacing');
    const lineSpacingType = lineSpacingNode
      ? normalizeLineSpacing(attrs(lineSpacingNode)['type'])
      : undefined;
    const lineSpacingValue = lineSpacingNode ? toNum(attrs(lineSpacingNode)['value']) : undefined;
    // listType/listLevel 은 아직 공식 샘플에서 확인 필요 — 기존처럼 속성으로도 시도.
    out.set(id, {
      id,
      align: normalizeAlign(alignRaw ?? a['align']),
      indentLeft,
      indentRight,
      indentFirstLine,
      lineSpacingValue,
      lineSpacingType,
      marginPrev,
      marginNext,
      listType: normalizeListType(a['listType']),
      listLevel: toNum(a['listLevel']),
    });
  }
  return out;
}

/**
 * paraPr 자식 중 name 을 찾되, <hp:switch>/<hp:case>/<hp:default> 래퍼를 투과한다.
 *
 * OWPML 의 `<hp:switch>` 는 feature-detection pattern — `<hp:case
 * required-namespace="…HwpUnitChar">` 가 "reader 가 이 네임스페이스를 지원하면
 * 이 블록을 쓰라", `<hp:default>` 가 그 외. 같은 paraPr 안에 두 hh:margin 이
 * 들어있고 값이 서로 다른 경우 (예: case=-1300, default=-2600) 모던 reader 는
 * case 를 써야 한다. 과거 구현은 DFS 스택 LIFO 때문에 default 를 먼저 읽어
 * 모든 들여쓰기가 2× 로 커졌다. 이를 고치기 위해 BFS + `hp:case` 우선순위.
 */
function findDescendant(
  root: ReturnType<typeof findRoot>,
  nsName: string,
  bareName: string,
): ReturnType<typeof findRoot> {
  if (!root) return undefined;
  // 1 차: case 우선으로 탐색 (switch 를 만나면 case children 먼저).
  const fromCase = seek(root, nsName, bareName, 'case');
  if (fromCase) return fromCase;
  // 2 차: default 허용.
  return seek(root, nsName, bareName, 'default');
}

type OwpmlNode = ReturnType<typeof findRoot>;

function seek(
  node: OwpmlNode,
  nsName: string,
  bareName: string,
  prefer: 'case' | 'default',
): OwpmlNode {
  if (!node) return undefined;
  for (const c of children(node)) {
    const t = tagName(c);
    if (t === nsName || t === bareName) return c;
    if (t === 'hp:switch' || t === 'switch') {
      // switch 는 case/default 순서로 children 을 가짐. 우리가 원하는 분기만 먼저 탐색.
      const primary = prefer === 'case' ? ['hp:case', 'case'] : ['hp:default', 'default'];
      const secondary = prefer === 'case' ? ['hp:default', 'default'] : ['hp:case', 'case'];
      for (const sc of children(c)) {
        const st = tagName(sc) ?? '';
        if (!primary.includes(st)) continue;
        const found = seek(sc, nsName, bareName, prefer);
        if (found) return found;
      }
      // 지정된 분기에 없으면 반대 분기에도 시도하지 않는다 (다른 fallback 경로가 처리).
      // 단 단일 case 만 있는 경우엔 secondary 빈 분기. 안전하게 이어 본다.
      for (const sc of children(c)) {
        const st = tagName(sc) ?? '';
        if (!secondary.includes(st)) continue;
        const found = seek(sc, nsName, bareName, prefer);
        if (found) return found;
      }
    } else if (t === 'hp:case' || t === 'case' || t === 'hp:default' || t === 'default') {
      // 직계 case/default 도 그냥 내부로 내려간다 (상위 switch 호출에서 이미 필터됨).
      const found = seek(c, nsName, bareName, prefer);
      if (found) return found;
    }
  }
  return undefined;
}

/** <hh:margin> 하위 `<hc:left value="123" unit="HWPUNIT"/>` 같은 sub-element 값 읽기. */
function readSubValue(
  parent: ReturnType<typeof findRoot>,
  nsName: string,
  bareName: string,
): number | undefined {
  if (!parent) return undefined;
  for (const c of children(parent)) {
    const t = tagName(c);
    if (t === nsName || t === bareName) {
      return toNum(attrs(c)['value']);
    }
  }
  return undefined;
}

function toNum(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeListType(v: string | undefined): ParaPr['listType'] {
  if (v === 'bullet' || v === 'numbered') return v;
  return undefined;
}

function normalizeLineSpacing(v: string | undefined): ParaPr['lineSpacingType'] {
  switch (v) {
    case 'PERCENT':
      return 'PERCENT';
    case 'FIXED':
      return 'FIXED';
    case 'ATLEAST':
      return 'ATLEAST';
    case 'BETWEEN_LINES':
      return 'BETWEEN_LINES';
    default:
      return undefined;
  }
}

function normalizeAlign(value: string | undefined): ParaPr['align'] {
  switch (value) {
    case 'LEFT':
    case 'left':
      return 'left';
    case 'RIGHT':
    case 'right':
      return 'right';
    case 'CENTER':
    case 'center':
      return 'center';
    case 'JUSTIFY':
    case 'justify':
      return 'justify';
    case 'DISTRIBUTE':
    case 'distribute':
      return 'distribute';
    default:
      return undefined;
  }
}

function parseStyles(refList: ReturnType<typeof findRoot>): Map<string, Style> {
  const [bucket] = container(refList, 'hh:styles', 'styles');
  const out = new Map<string, Style>();
  if (!bucket) return out;
  for (const s of children(bucket)) {
    const n = tagName(s);
    if (n !== 'hh:style' && n !== 'style') continue;
    const a = attrs(s);
    const id = a['id'];
    if (!id) continue;
    const typeAttr = (a['type'] ?? 'PARA').toUpperCase();
    const type: Style['type'] = typeAttr === 'CHAR' ? 'CHAR' : 'PARA';
    out.set(id, {
      id,
      type,
      name: a['name'] ?? '',
      paraPrIDRef: a['paraPrIDRef'],
      charPrIDRef: a['charPrIDRef'],
    });
  }
  return out;
}

function parseBullets(refList: ReturnType<typeof findRoot>): Bullet[] {
  const [bucket] = container(refList, 'hh:bullets', 'bullets');
  if (!bucket) return [];
  const out: Bullet[] = [];
  for (const b of children(bucket)) {
    const n = tagName(b);
    if (n !== 'hh:bullet' && n !== 'bullet') continue;
    const id = attrs(b)['id'];
    if (id) out.push({ id });
  }
  return out;
}

function parseNumberings(refList: ReturnType<typeof findRoot>): Numbering[] {
  const [bucket] = container(refList, 'hh:numberings', 'numberings');
  if (!bucket) return [];
  const out: Numbering[] = [];
  for (const n of children(bucket)) {
    const tn = tagName(n);
    if (tn !== 'hh:numbering' && tn !== 'numbering') continue;
    const id = attrs(n)['id'];
    if (id) out.push({ id });
  }
  return out;
}

function toInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function toIntOpt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

const HH_NS = 'http://www.hancom.co.kr/hwpml/2011/head';
const HC_NS = 'http://www.hancom.co.kr/hwpml/2011/core';

const ALIGN_OUT: Record<NonNullable<ParaPr['align']>, string> = {
  left: 'LEFT',
  right: 'RIGHT',
  center: 'CENTER',
  justify: 'JUSTIFY',
  distribute: 'DISTRIBUTE',
};

export function serializeHeader(h: Header): string {
  const fontfaces = serializeFontFaces(h.fontFaces);
  const borderFills = elem(
    'hh:borderFills',
    {},
    h.borderFills.map((bf) => {
      const sides = [
        serializeBorderSide('hh:leftBorder', bf.left),
        serializeBorderSide('hh:rightBorder', bf.right),
        serializeBorderSide('hh:topBorder', bf.top),
        serializeBorderSide('hh:bottomBorder', bf.bottom),
      ].filter((n): n is ReturnType<typeof elem> => n !== null);
      if (bf.fillColor) {
        sides.push(
          elem('hc:fillBrush', {}, [
            elem('hc:winBrush', { faceColor: bf.fillColor, hatchColor: '#000000', alpha: '0' }),
          ]),
        );
      }
      return elem('hh:borderFill', { id: bf.id }, sides);
    }),
  );
  const charPropsArr = [...h.charProps.values()].map(serializeCharPr);
  const charProperties = elem('hh:charProperties', {}, charPropsArr);
  const paraPropsArr = [...h.paraProps.values()].map(serializeParaPr);
  const paraProperties = elem('hh:paraProperties', {}, paraPropsArr);
  const stylesArr = [...h.styles.values()].map(serializeStyle);
  const styles = elem('hh:styles', {}, stylesArr);
  const bullets = elem(
    'hh:bullets',
    {},
    h.bullets.map((b) => elem('hh:bullet', { id: b.id })),
  );
  const numberings = elem(
    'hh:numberings',
    {},
    h.numberings.map((n) => elem('hh:numbering', { id: n.id })),
  );

  const refList = elem('hh:refList', {}, [
    fontfaces,
    borderFills,
    charProperties,
    paraProperties,
    styles,
    bullets,
    numberings,
  ]);

  const beginNum = elem('hh:beginNum', {
    page: String(h.beginNum.page),
    footnote: String(h.beginNum.footnote),
    endnote: String(h.beginNum.endnote),
    pic: String(h.beginNum.pic),
    tbl: String(h.beginNum.tbl),
    equation: String(h.beginNum.equation),
  });

  const root = elem('hh:head', { 'xmlns:hh': HH_NS, 'xmlns:hc': HC_NS }, [beginNum, refList]);
  return buildDocument(root);
}

function serializeBorderSide(name: string, side: BorderSide | undefined) {
  if (!side) return null;
  return elem(name, {
    type: side.type,
    width: side.width ?? '0.1 mm',
    color: side.color ?? '#000000',
  });
}

function serializeFontFaces(faces: readonly FontFace[]) {
  const byLang = new Map<string, FontFace[]>();
  for (const f of faces) {
    const list = byLang.get(f.lang) ?? [];
    list.push(f);
    byLang.set(f.lang, list);
  }
  const groups = [...byLang.entries()].map(([lang, fs]) =>
    elem(
      'hh:fontface',
      { lang },
      fs.map((f) => {
        const children: ReturnType<typeof elem>[] = [];
        if (f.substFace) {
          children.push(
            elem('hh:substFont', {
              name: f.substFace,
              type: f.substType,
            }),
          );
        }
        return elem(
          'hh:font',
          {
            name: f.name,
            type: f.type,
            isEmbedded: f.isEmbedded ? 'true' : undefined,
            binaryItemIDRef: f.binaryItemIDRef,
          },
          children,
        );
      }),
    ),
  );
  return elem('hh:fontfaces', {}, groups);
}

function serializeCharPr(cp: CharPr) {
  const children: ReturnType<typeof elem>[] = [];
  if (cp.fontRefHangul !== undefined) {
    const idx = String(cp.fontRefHangul);
    children.push(
      elem('hh:fontRef', {
        hangul: idx,
        latin: idx,
        hanja: idx,
        japanese: idx,
        other: idx,
        symbol: idx,
        user: idx,
      }),
    );
  }
  if (cp.bold) children.push(elem('hh:bold'));
  if (cp.italic) children.push(elem('hh:italic'));
  if (cp.underline) children.push(elem('hh:underline'));
  if (cp.strikeout) children.push(elem('hh:strikeout'));
  if (cp.position) {
    children.push(
      elem('hh:position', {
        value: cp.position === 'superscript' ? 'SUPERSCRIPT' : 'SUBSCRIPT',
      }),
    );
  }
  return elem(
    'hh:charPr',
    {
      id: cp.id,
      height: cp.height !== undefined ? String(cp.height) : undefined,
      textColor: cp.textColor,
      shadeColor: cp.bgColor,
    },
    children,
  );
}

function serializeParaPr(pp: ParaPr) {
  return elem('hh:paraPr', {
    id: pp.id,
    align: pp.align ? ALIGN_OUT[pp.align] : undefined,
    indentLeft: pp.indentLeft !== undefined ? String(pp.indentLeft) : undefined,
    indentRight: pp.indentRight !== undefined ? String(pp.indentRight) : undefined,
    indentFirstLine: pp.indentFirstLine !== undefined ? String(pp.indentFirstLine) : undefined,
    lineSpacingValue: pp.lineSpacingValue !== undefined ? String(pp.lineSpacingValue) : undefined,
    lineSpacingType: pp.lineSpacingType,
    marginPrev: pp.marginPrev !== undefined ? String(pp.marginPrev) : undefined,
    marginNext: pp.marginNext !== undefined ? String(pp.marginNext) : undefined,
    listType: pp.listType,
    listLevel: pp.listLevel !== undefined ? String(pp.listLevel) : undefined,
  });
}

function serializeStyle(s: Style) {
  return elem('hh:style', {
    id: s.id,
    type: s.type,
    name: s.name,
    paraPrIDRef: s.paraPrIDRef,
    charPrIDRef: s.charPrIDRef,
  });
}
