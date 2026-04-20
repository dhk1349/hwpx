import type {
  BorderFill,
  Cell as HwpxCell,
  CharPr,
  FontFace,
  HwpxDocument,
  Inline,
  Paragraph as HwpxParagraph,
  ParaPr,
  Run,
  Section as HwpxSection,
  Table as HwpxTable,
} from '@hwpx/codec';
import type { Mark as PMMark, Node as PMNode } from 'prosemirror-model';
import { hwpxSchema } from './schema.js';

export interface ToProseMirrorOptions {
  /**
   * 바이너리(이미지 등) 의 표시용 src 를 해석한다. 미설정이면 빈 문자열.
   * 보통 호출 측이 `URL.createObjectURL(new Blob([bytes]))` 를 반환한다.
   */
  resolveBinarySrc?: (binaryRef: string) => string | undefined;
}

/**
 * preview 용 장식 필드. HwpxCell 원본 타입엔 없지만 JSON.stringify 로
 * cellsJson 에 실을 때만 쓴다 — `renderCell` 이 border 스타일 계산에 사용.
 */
interface PreviewBorderSide {
  type: string;
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

/**
 * HwpxDocument → ProseMirror doc 노드.
 *
 * 변환 규칙:
 *   - 섹션은 `section` 노드 (sectionId attr).
 *   - 문단은 `paragraph` 노드 (paraPrIDRef, styleIDRef, align attr).
 *   - 런의 charPrIDRef 는 `charPr` 마크에 보존.
 *   - charPr 의 bold/italic/underline/strike 는 별도 마크로도 동시 부여.
 *   - hp:t → text(node), hp:tab → tab, hp:lineBreak → hardBreak,
 *     hp:pic → image (옵션 resolveBinarySrc 로 src 주입),
 *     hp:tbl → table (atom, cellsJson 직렬화),
 *     hp:hyperlink → hyperlink 마크,
 *     opaque → opaque 노드.
 */
export function toProseMirror(doc: HwpxDocument, opts: ToProseMirrorOptions = {}): PMNode {
  const borderFillMap = new Map<string, BorderFill>();
  for (const bf of doc.header.borderFills) borderFillMap.set(bf.id, bf);
  const ctx: ConvertContext = {
    resolveBinarySrc: opts.resolveBinarySrc,
    borderFillMap,
    charProps: doc.header.charProps,
    paraProps: doc.header.paraProps,
    fontFaces: doc.header.fontFaces,
  };
  const sections =
    doc.sections.length > 0
      ? doc.sections.map((s) => sectionToNode(s, doc, ctx))
      : [emptySection()];
  return hwpxSchema.node('doc', null, sections);
}

interface ConvertContext {
  resolveBinarySrc: ((binaryRef: string) => string | undefined) | undefined;
  borderFillMap: ReadonlyMap<string, BorderFill>;
  /** 표 cellsJson preview 에서 run 별 charPr 스타일을 미리 해석해 주입할 때 사용. */
  charProps: ReadonlyMap<string, CharPr>;
  /** 표 cellsJson preview 에서 paragraph 별 paraPr (align/lineSpacing) 해석에 사용. */
  paraProps: ReadonlyMap<string, ParaPr>;
  fontFaces: readonly FontFace[];
}

/**
 * 표 preview 에서 paragraph 에 미리 계산해 주입하는 CSS 장식 필드.
 * schema 의 renderCell 이 <p style="…"> 로 감싸 텍스트 정렬과 줄간격을 구현한다.
 */
interface PreviewParaStyle {
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  lineHeight?: string;
  textIndent?: number;
  paddingLeft?: number;
  paddingRight?: number;
  marginTop?: number;
  marginBottom?: number;
}

/**
 * 표 preview 에서 run 에 미리 계산해 주입하는 CSS 장식 필드.
 * schema 의 renderCell walkInline 에서 <span style="..."> 로 번역한다.
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

function resolveRunStyle(charPrIDRef: string, ctx: ConvertContext): PreviewRunStyle | undefined {
  const cp = ctx.charProps.get(charPrIDRef);
  if (!cp) return undefined;
  const out: PreviewRunStyle = {};
  if (cp.height !== undefined) {
    const pt = Math.round(cp.height / 100);
    if (pt > 0) out.fontSize = pt;
  }
  if (cp.textColor) out.color = cp.textColor;
  if (cp.bgColor) out.backgroundColor = cp.bgColor;
  if (cp.bold) out.bold = true;
  if (cp.italic) out.italic = true;
  if (cp.underline) out.underline = true;
  if (cp.strikeout) out.strike = true;
  if (cp.position) out.position = cp.position;
  if (cp.fontRefHangul !== undefined) {
    // lang-scope 인덱스 해석 (toPM 의 runMarks 와 동일 로직).
    let n = 0;
    for (const f of ctx.fontFaces) {
      if (f.lang !== 'HANGUL') continue;
      if (n === cp.fontRefHangul) {
        if (f.name) out.fontFamily = f.name;
        break;
      }
      n++;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * 음수 첫 줄 들여쓰기(hanging indent) 를 클리핑 없이 표시하기 위해 left padding 을 보정.
 *
 * HWP/HWPX 본문은 종종 `<hc:intent value="-4172"/><hc:left value="0"/>` 같이
 * 음수 첫 줄 들여쓰기 + 좌측 padding 0 인 글머리표 단락을 사용한다. CSS 의
 * `text-indent: -41.72pt; padding-left: 0` 는 첫 글자(=글머리표) 를 박스 밖으로
 * 밀어내 잘리게 만든다. 보존된 indent 가 음수이고 indentLeft 가 부족할 때
 * indentLeft 를 |intent| 만큼 늘려 표준 hanging-indent CSS 패턴
 * (`padding-left: X; text-indent: -X`) 으로 만들어준다.
 *
 * 양수 첫 줄 들여쓰기나 이미 충분한 indentLeft 가 있을 때는 원본 값 그대로 둔다.
 */
function effectiveIndents(pp: ParaPr | undefined): {
  indentLeft?: number;
  indentFirstLine?: number;
  indentRight?: number;
} {
  if (!pp) return {};
  const il = pp.indentLeft;
  const ifl = pp.indentFirstLine;
  const ir = pp.indentRight;
  if (ifl !== undefined && ifl < 0) {
    const need = -ifl;
    const have = il ?? 0;
    if (have < need) {
      return { indentLeft: need, indentFirstLine: ifl, indentRight: ir };
    }
  }
  return { indentLeft: il, indentFirstLine: ifl, indentRight: ir };
}

/**
 * paraPrIDRef → PreviewParaStyle. 표 셀 안 단락에 적용할 정렬/줄간격/들여쓰기.
 * paraPr 가 없거나 의미있는 값이 없으면 undefined.
 */
function resolveParaStyle(paraPrIDRef: string, ctx: ConvertContext): PreviewParaStyle | undefined {
  const pp = ctx.paraProps.get(paraPrIDRef);
  if (!pp) return undefined;
  const out: PreviewParaStyle = {};
  switch (pp.align) {
    case 'center':
      out.textAlign = 'center';
      break;
    case 'right':
      out.textAlign = 'right';
      break;
    case 'justify':
    case 'distribute':
      out.textAlign = 'justify';
      break;
    case 'left':
      out.textAlign = 'left';
      break;
  }
  if (pp.lineSpacingValue !== undefined && pp.lineSpacingValue !== null) {
    if (pp.lineSpacingType === 'PERCENT' || pp.lineSpacingType === undefined) {
      out.lineHeight = String(pp.lineSpacingValue / 100);
    } else {
      // FIXED/AT_LEAST: HWPUNIT → pt
      out.lineHeight = `${pp.lineSpacingValue / 100}pt`;
    }
  }
  const eff = effectiveIndents(pp);
  if (eff.indentFirstLine !== undefined) {
    out.textIndent = eff.indentFirstLine;
  }
  if (eff.indentLeft !== undefined) {
    out.paddingLeft = eff.indentLeft;
  }
  if (eff.indentRight !== undefined) {
    out.paddingRight = eff.indentRight;
  }
  if (pp.marginPrev !== undefined && pp.marginPrev !== null) {
    out.marginTop = pp.marginPrev;
  }
  if (pp.marginNext !== undefined && pp.marginNext !== null) {
    out.marginBottom = pp.marginNext;
  }
  return Object.keys(out).length ? out : undefined;
}

function resolveBorderDecor(
  borderFillIDRef: string | undefined,
  borderFillMap: ReadonlyMap<string, BorderFill>,
): PreviewBorderDecor | undefined {
  if (!borderFillIDRef) return undefined;
  const bf = borderFillMap.get(borderFillIDRef);
  if (!bf) return undefined;
  const out: PreviewBorderDecor = {};
  if (bf.left) out.left = { ...bf.left };
  if (bf.right) out.right = { ...bf.right };
  if (bf.top) out.top = { ...bf.top };
  if (bf.bottom) out.bottom = { ...bf.bottom };
  if (bf.fillColor) out.fillColor = bf.fillColor;
  return out;
}

function sectionToNode(section: HwpxSection, doc: HwpxDocument, ctx: ConvertContext): PMNode {
  // HWPX 섹션 안의 paragraph 들을 pageBreak="1" 경계로 1차 분할 후, 각 버킷이
  // 페이지 본문 영역 (pageHeight − marginTop − marginBottom) 을 넘지 않도록
  // 본문 줄 수를 추정해 추가 분할한다. 추정은 보수적인 근사값이며 — 정확한
  // 페이지 분할은 브라우저 레이아웃에 의존하지만, 이 사전 분할만으로도 1410개
  // 단락이 1개 페이지에 쌓이는 비정상 상황은 막을 수 있다.
  //
  // 주의: 합성된 페이지 경계는 round-trip 시 pageBreak 마커로 저장되면 안 된다.
  // fromPM 은 page 경계가 아니라 paragraph.attrs.pageBreak 만 신뢰해야 한다.
  const pp = section.pagePr;
  const pageAttrs = (index: number): Record<string, unknown> => {
    const out: Record<string, unknown> = { pageIndex: index };
    if (pp) {
      out['pageWidth'] = pp.width ?? 0;
      out['pageHeight'] = pp.height ?? 0;
      out['pageLandscape'] = !!pp.landscape;
      out['marginLeft'] = pp.marginLeft ?? 0;
      out['marginRight'] = pp.marginRight ?? 0;
      out['marginTop'] = pp.marginTop ?? 0;
      out['marginBottom'] = pp.marginBottom ?? 0;
    }
    return out;
  };

  const bodyParas = section.body.length > 0 ? section.body : [];
  const explicitBuckets: HwpxParagraph[][] = [[]];
  for (let i = 0; i < bodyParas.length; i += 1) {
    const p = bodyParas[i]!;
    // 첫 paragraph 의 pageBreak 는 "섹션 시작도 곧 페이지 시작" 이라는 의미로 무시.
    if (p.pageBreak && i > 0) {
      explicitBuckets.push([p]);
    } else {
      explicitBuckets[explicitBuckets.length - 1]!.push(p);
    }
  }

  // 본문 영역 (pt). 미정 시 A4 기준 fallback.
  const A4_WIDTH_HWP = 59528;
  const A4_HEIGHT_HWP = 84189;
  const widthHwp = pp?.landscape ? (pp.height ?? A4_HEIGHT_HWP) : (pp?.width ?? A4_WIDTH_HWP);
  const heightHwp = pp?.landscape ? (pp.width ?? A4_WIDTH_HWP) : (pp?.height ?? A4_HEIGHT_HWP);
  const contentWidthPt = Math.max(
    100,
    (widthHwp - (pp?.marginLeft ?? 0) - (pp?.marginRight ?? 0)) / 100,
  );
  const contentHeightPt = Math.max(
    150,
    (heightHwp - (pp?.marginTop ?? 0) - (pp?.marginBottom ?? 0)) / 100,
  );

  const pageBuckets: HwpxParagraph[][] = [];
  for (const bucket of explicitBuckets) {
    if (bucket.length === 0) {
      pageBuckets.push(bucket);
      continue;
    }
    let curr: HwpxParagraph[] = [];
    let currHeight = 0;
    for (const para of bucket) {
      const ph = estimateParaHeightPt(para, ctx, contentWidthPt);
      if (curr.length > 0 && currHeight + ph > contentHeightPt) {
        pageBuckets.push(curr);
        curr = [];
        currHeight = 0;
      }
      curr.push(para);
      currHeight += ph;
    }
    pageBuckets.push(curr);
  }
  if (pageBuckets.length === 0) pageBuckets.push([]);

  const pageNodes: PMNode[] = pageBuckets.map((bucket, pi) => {
    const paragraphs =
      bucket.length > 0 ? bucket.map((p) => paragraphToNode(p, doc, ctx)) : [emptyParagraph()];
    return hwpxSchema.node('page', pageAttrs(pi), paragraphs);
  });

  return hwpxSchema.node('section', { sectionId: section.id || '0' }, pageNodes);
}

/**
 * 단락 한 개의 렌더 높이 (pt) 를 보수적으로 추정한다. 정확하지 않아도 되지만,
 * 실제 높이를 ±50% 안쪽으로 잡아야 페이지 분할이 자연스럽다.
 *
 * 추정 요소:
 *  - 텍스트 길이 / (본문 너비 / 한 글자 너비) → 줄 수
 *  - 폰트 높이 (CharPr.height, 1pt=100) × 줄 간격 배수
 *  - 인라인 표/그림 높이는 직접 더한다
 *  - paragraph 위/아래 margin
 */
function estimateParaHeightPt(
  p: HwpxParagraph,
  ctx: ConvertContext,
  contentWidthPt: number,
): number {
  const pp = ctx.paraProps.get(p.paraPrIDRef);
  // 첫 run 의 폰트 높이를 단락 대표 height 로 본다.
  let fontHeightPt = 10;
  const firstRun = p.runs[0];
  if (firstRun) {
    const cp = ctx.charProps.get(firstRun.charPrIDRef);
    if (cp && typeof cp.height === 'number' && cp.height > 0) fontHeightPt = cp.height / 100;
  }
  let lineMultiplier = 1.0;
  if (pp?.lineSpacingValue !== undefined && pp.lineSpacingValue !== null) {
    if (pp.lineSpacingType === 'PERCENT' || pp.lineSpacingType === undefined) {
      lineMultiplier = pp.lineSpacingValue / 100;
    } else {
      // FIXED/AT_LEAST: 값이 곧 줄 높이 (pt) 이므로 fontHeightPt 와 비교해 큰 쪽
      const lhPt = pp.lineSpacingValue / 100;
      lineMultiplier = Math.max(1.0, lhPt / fontHeightPt);
    }
  } else {
    lineMultiplier = 1.6; // HWP 기본 줄 간격 근사 (160%)
  }
  const lineHeightPt = fontHeightPt * lineMultiplier;

  let charCount = 0;
  let extraPt = 0;
  let forcedNewLines = 0;
  for (const r of p.runs) {
    for (const inl of r.inlines) {
      switch (inl.kind) {
        case 'text':
          charCount += inl.value.length;
          break;
        case 'tab':
          charCount += 4;
          break;
        case 'lineBreak':
          forcedNewLines += 1;
          break;
        case 'pageBreak':
          forcedNewLines += 1;
          break;
        case 'hyperlink':
          // 링크 안의 텍스트는 평문으로 근사
          for (const sub of inl.inlines) {
            if (sub.kind === 'text') charCount += sub.value.length;
          }
          break;
        case 'picture': {
          const hPt = (inl.height ?? 0) / 100;
          extraPt += Math.max(0, hPt);
          break;
        }
        case 'table': {
          const t = inl.table;
          if (typeof t.height === 'number' && t.height > 0) {
            extraPt += t.height / 100;
          } else {
            // 행당 ~36pt 근사 (실제 행 평균 높이는 셀 내용에 따라 24~80pt 범위).
            // 작은 표는 페이지에 채우고 큰 표는 자체 페이지로 격리되도록 보수 추정.
            const rowCount = t.rowCnt || t.rows.length || 1;
            extraPt += rowCount * 36;
          }
          break;
        }
        case 'shapeGroup': {
          const hPt = (inl.height ?? 0) / 100;
          extraPt += Math.max(20, hPt);
          break;
        }
        case 'footnote':
        case 'endnote':
        case 'comment':
          // 본문에는 작은 마커만 차지
          charCount += 2;
          break;
        default:
          charCount += 1;
      }
    }
  }
  // 한글/한자 폭 가정: 폰트 높이의 ~1.0배. 영문 혼용 보정 위해 0.85.
  const glyphWidthPt = Math.max(3, fontHeightPt * 0.85);
  const charsPerLine = Math.max(8, Math.floor(contentWidthPt / glyphWidthPt));
  const textLines = Math.max(1, Math.ceil(charCount / charsPerLine)) + forcedNewLines;
  const marginPt = ((pp?.marginPrev ?? 0) + (pp?.marginNext ?? 0)) / 100;
  return textLines * lineHeightPt + extraPt + marginPt;
}

function paragraphToNode(p: HwpxParagraph, doc: HwpxDocument, ctx: ConvertContext): PMNode {
  const pp = doc.header.paraProps.get(p.paraPrIDRef);
  const align = pp?.align ?? null;
  const inlines: PMNode[] = [];
  for (const run of p.runs) {
    inlines.push(...runToNodes(run, doc, ctx));
  }
  // 주의: indentLeft/indentFirstLine 은 원본 값을 그대로 보존한다.
  // 음수 첫 줄 들여쓰기 → 클리핑 보정은 render 시점 (schema.paragraphSpec.toDOM) 에서만
  // 적용해야 fromPM 라운드트립 시 원본 paraPr 값이 변형되지 않는다.
  return hwpxSchema.node(
    'paragraph',
    {
      paraPrIDRef: p.paraPrIDRef,
      styleIDRef: p.styleIDRef ?? null,
      align,
      pageBreak: p.pageBreak ?? false,
      columnBreak: p.columnBreak ?? false,
      indentLeft: pp?.indentLeft ?? null,
      indentRight: pp?.indentRight ?? null,
      indentFirstLine: pp?.indentFirstLine ?? null,
      lineSpacingValue: pp?.lineSpacingValue ?? null,
      lineSpacingType: pp?.lineSpacingType ?? null,
      marginPrev: pp?.marginPrev ?? null,
      marginNext: pp?.marginNext ?? null,
      listType: pp?.listType ?? null,
      listLevel: pp?.listLevel ?? null,
    },
    inlines,
  );
}

function runToNodes(run: Run, doc: HwpxDocument, ctx: ConvertContext): PMNode[] {
  const charPr = doc.header.charProps.get(run.charPrIDRef);
  const baseMarks = runMarks(run.charPrIDRef, charPr, doc.header.fontFaces);
  return run.inlines.flatMap((inline) => inlineToNodes(inline, baseMarks, ctx));
}

function runMarks(
  charPrIDRef: string,
  charPr: CharPr | undefined,
  fontFaces: readonly FontFace[],
): PMMark[] {
  const marks: PMMark[] = [hwpxSchema.marks['charPr']!.create({ charPrIDRef })];
  if (charPr?.bold) marks.push(hwpxSchema.marks['bold']!.create());
  if (charPr?.italic) marks.push(hwpxSchema.marks['italic']!.create());
  if (charPr?.underline) marks.push(hwpxSchema.marks['underline']!.create());
  if (charPr?.strikeout) marks.push(hwpxSchema.marks['strike']!.create());
  if (charPr?.position === 'superscript') marks.push(hwpxSchema.marks['superscript']!.create());
  if (charPr?.position === 'subscript') marks.push(hwpxSchema.marks['subscript']!.create());
  if (charPr?.height !== undefined) {
    const size = Math.round(charPr.height / 100);
    if (size > 0) marks.push(hwpxSchema.marks['fontSize']!.create({ size }));
  }
  if (charPr?.textColor) {
    marks.push(hwpxSchema.marks['textColor']!.create({ color: charPr.textColor }));
  }
  if (charPr?.bgColor) {
    marks.push(hwpxSchema.marks['bgColor']!.create({ color: charPr.bgColor }));
  }
  if (charPr?.fontRefHangul !== undefined) {
    // OWPML 의 `<hh:fontRef hangul="N">` 은 HANGUL 그룹 내부 순번이지
    // 전체 fontFaces 배열의 인덱스가 아니다. lang="HANGUL" 만 필터 후 N 번째를 잡는다.
    const face = getFaceByLangIdx(fontFaces, 'HANGUL', charPr.fontRefHangul);
    if (face?.name) {
      marks.push(
        hwpxSchema.marks['fontFace']!.create({
          face: face.name,
          faceIdx: charPr.fontRefHangul,
          // HWPX 원본이 지정한 대체 폰트. 첫 선택지(face) 다음 순위로 선호된다.
          substFace: face.substFace ?? '',
          // 'HANGUL' | 'LATIN' | 'HANJA' | 'JAPANESE' | 'OTHER' ...
          // schema 에서 폴백 체인 순서 결정에 사용.
          lang: face.lang ?? 'HANGUL',
        }),
      );
    }
  }
  return marks;
}

function getFaceByLangIdx(
  fontFaces: readonly FontFace[],
  lang: string,
  idx: number,
): FontFace | undefined {
  let n = 0;
  for (const f of fontFaces) {
    if (f.lang !== lang) continue;
    if (n === idx) return f;
    n++;
  }
  return undefined;
}

function inlineToNodes(inline: Inline, marks: PMMark[], ctx: ConvertContext): PMNode[] {
  switch (inline.kind) {
    case 'text': {
      if (!inline.value) return [];
      return [hwpxSchema.text(inline.value, marks)];
    }
    case 'tab':
      return [hwpxSchema.nodes['tab']!.create(undefined, undefined, marks)];
    case 'lineBreak':
      return [hwpxSchema.nodes['hardBreak']!.create(undefined, undefined, marks)];
    case 'pageBreak':
      return [];
    case 'bookmark':
      return [hwpxSchema.nodes['bookmark']!.create({ name: inline.name }, undefined, marks)];
    case 'hyperlink': {
      const hl = hwpxSchema.marks['hyperlink']!.create({ href: inline.href });
      const innerMarks = [...marks, hl];
      return inline.inlines.flatMap((i) => inlineToNodes(i, innerMarks, ctx));
    }
    case 'picture': {
      const src = ctx.resolveBinarySrc?.(inline.binaryRef) ?? '';
      return [
        hwpxSchema.nodes['image']!.create(
          {
            binaryRef: inline.binaryRef,
            width: inline.width,
            height: inline.height,
            src,
            alt: '',
          },
          undefined,
          marks,
        ),
      ];
    }
    case 'table':
      return [
        hwpxSchema.nodes['table']!.create(
          {
            rowCnt: inline.table.rowCnt,
            colCnt: inline.table.colCnt,
            borderFillIDRef: inline.table.borderFillIDRef ?? null,
            width: inline.table.width ?? null,
            height: inline.table.height ?? null,
            // 표 preview (atom toDOM) 에서 이미지 src 를 그대로 쓸 수 있도록 enrich.
            cellsJson: JSON.stringify(enrichTableForPreview(inline.table, ctx)),
          },
          undefined,
          marks,
        ),
      ];
    case 'footnote':
      return [hwpxSchema.nodes['footnote']!.create({ text: inline.text }, undefined, marks)];
    case 'endnote':
      return [hwpxSchema.nodes['endnote']!.create({ text: inline.text }, undefined, marks)];
    case 'comment':
      return [
        hwpxSchema.nodes['comment']!.create(
          { text: inline.text, author: inline.author ?? '' },
          undefined,
          marks,
        ),
      ];
    case 'shapeGroup':
      return [
        hwpxSchema.nodes['shapeGroup']!.create(
          {
            labels: inline.labels,
            width: inline.width ?? null,
            height: inline.height ?? null,
            raw: inline.raw.raw,
            path: inline.raw.path ?? null,
          },
          undefined,
          marks,
        ),
      ];
    case 'opaque':
      return [
        hwpxSchema.nodes['opaque']!.create(
          {
            raw: inline.raw.raw,
            path: inline.raw.path ?? null,
          },
          undefined,
          marks,
        ),
      ];
  }
}

function emptyParagraph(): PMNode {
  return hwpxSchema.node('paragraph', { paraPrIDRef: '0' }, []);
}

function emptySection(): PMNode {
  const emptyPage = hwpxSchema.node('page', { pageIndex: 0 }, [emptyParagraph()]);
  return hwpxSchema.node('section', { sectionId: '0' }, [emptyPage]);
}

/**
 * 표 atom 의 preview 렌더는 정적인 toDOM 안에서 일어나므로 런타임 resolver 를
 * 참조할 수 없다. 대신 toPM 시점에 picture inline 에 해석된 src 를 주입하고,
 * 셀 borderFillIDRef 를 실제 BorderFill 정의로 확장해 둔다. 중첩 표도 재귀.
 */
function enrichTableForPreview(table: HwpxTable, ctx: ConvertContext): HwpxTable {
  const decor = resolveBorderDecor(table.borderFillIDRef, ctx.borderFillMap);
  const enriched = {
    ...table,
    rows: table.rows.map((row) => ({
      cells: row.cells.map((cell) => enrichCell(cell, ctx)),
    })),
  } as HwpxTable;
  if (decor) {
    (enriched as unknown as { border?: PreviewBorderDecor }).border = decor;
  }
  return enriched;
}

function enrichCell(cell: HwpxCell, ctx: ConvertContext): HwpxCell {
  const decor = resolveBorderDecor(cell.borderFillIDRef, ctx.borderFillMap);
  const enriched: HwpxCell & { border?: PreviewBorderDecor } = {
    ...cell,
    body: cell.body.map((p) => {
      const paraStyle = resolveParaStyle(p.paraPrIDRef, ctx);
      const enrichedPara = {
        ...p,
        runs: p.runs.map((r) => {
          const style = resolveRunStyle(r.charPrIDRef, ctx);
          // style 필드는 HwpxRun 원본에 없는 장식 필드. cellsJson 에만 실림.
          const enrichedRun = {
            ...r,
            inlines: r.inlines.map((inl) => enrichInline(inl, ctx)),
          } as typeof r & { style?: PreviewRunStyle };
          if (style) enrichedRun.style = style;
          return enrichedRun;
        }),
      } as typeof p & { paraStyle?: PreviewParaStyle };
      if (paraStyle) enrichedPara.paraStyle = paraStyle;
      return enrichedPara;
    }),
  };
  if (decor) enriched.border = decor;
  return enriched;
}

function enrichInline(inl: Inline, ctx: ConvertContext): Inline {
  if (inl.kind === 'picture') {
    const src = ctx.resolveBinarySrc?.(inl.binaryRef) ?? '';
    // 원본 타입에 `src` 필드는 없지만, JSON.stringify 로 cellsJson 에 실릴 때만
    // 쓰는 장식 필드이므로 확장 객체로 캐스팅.
    return { ...inl, src } as unknown as Inline;
  }
  if (inl.kind === 'hyperlink') {
    return { ...inl, inlines: inl.inlines.map((i) => enrichInline(i, ctx)) };
  }
  if (inl.kind === 'table') {
    return { ...inl, table: enrichTableForPreview(inl.table, ctx) };
  }
  if (inl.kind === 'shapeGroup') {
    // cellsJson 에 실릴 때 raw XML 전체를 직렬화하면 용량이 크므로 preview 용으로는
    // labels/width/height 만 남긴 얇은 표현을 넣는다. 실제 raw 는 상위 ProseMirror
    // node attr 에 따로 보관돼 round-trip 에 영향 없음.
    return {
      kind: 'shapeGroup',
      labels: inl.labels,
      width: inl.width,
      height: inl.height,
      raw: { raw: '' },
    } as unknown as Inline;
  }
  return inl;
}
