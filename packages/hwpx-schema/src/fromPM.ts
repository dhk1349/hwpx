import type {
  CharPr,
  HwpxDocument,
  Inline,
  Paragraph,
  ParaPr,
  Run,
  Section,
} from '@hwpx/codec';
import type { Mark as PMMark, Node as PMNode } from 'prosemirror-model';

/**
 * ProseMirror doc → HwpxDocument.
 *
 * `previous` 는 마지막으로 파싱된 원본 모델. 우리는 PM 에서 표현되지 않은 부분
 * (header, binaries, settings, preserved bag) 을 그대로 가져다 쓴다. 변경이
 * 일어나는 곳은 sections 와 (필요 시) header.charProps / paraProps 의 신규 ID
 * 할당이다.
 */
export function fromProseMirror(pm: PMNode, previous: HwpxDocument): HwpxDocument {
  const ctx = new ConvertCtx(previous);
  const sections: Section[] = [];

  pm.forEach((sectionNode, _offset, index) => {
    if (sectionNode.type.name !== 'section') return;
    const id = String(sectionNode.attrs['sectionId'] ?? `section${index}`);
    const body: Paragraph[] = [];
    // New layout: section > page+ > paragraph+. Flatten pages back into a
    // single paragraph stream, marking the first paragraph of each non-first
    // page as a page break so the XML round-trip preserves the boundary.
    let paraCounter = 0;
    let pageIdx = 0;
    sectionNode.forEach((pageNode) => {
      if (pageNode.type.name === 'page') {
        let firstParaInPage = true;
        pageNode.forEach((paraNode) => {
          if (paraNode.type.name !== 'paragraph') return;
          const para = paragraphFromNode(paraNode, paraCounter++, ctx);
          if (firstParaInPage && pageIdx > 0) {
            para.pageBreak = true;
          }
          firstParaInPage = false;
          body.push(para);
        });
        pageIdx += 1;
      } else if (pageNode.type.name === 'paragraph') {
        // Back-compat: allow flat section > paragraph+ as before.
        body.push(paragraphFromNode(pageNode, paraCounter++, ctx));
      }
    });
    const prevSection = previous.sections.find((s) => s.id === id) ?? previous.sections[index];
    const next: Section = { id, body };
    if (prevSection?.pagePr) next.pagePr = prevSection.pagePr;
    if (prevSection?.headerText) next.headerText = prevSection.headerText;
    if (prevSection?.footerText) next.footerText = prevSection.footerText;
    sections.push(next);
  });

  const charProps = ctx.materializeCharProps();
  const paraProps = ctx.materializeParaProps();

  return {
    ...previous,
    sections,
    header: { ...previous.header, charProps, paraProps },
  };
}

function paragraphFromNode(node: PMNode, fallbackIndex: number, ctx: ConvertCtx): Paragraph {
  const paraPrIDRef = ctx.allocateParaPr({
    base: String(node.attrs['paraPrIDRef'] ?? '0'),
    align: (node.attrs['align'] as string | null) ?? null,
    indentLeft: optNum(node.attrs['indentLeft']),
    indentRight: optNum(node.attrs['indentRight']),
    indentFirstLine: optNum(node.attrs['indentFirstLine']),
    lineSpacingValue: optNum(node.attrs['lineSpacingValue']),
    lineSpacingType: (node.attrs['lineSpacingType'] as ParaPr['lineSpacingType']) ?? undefined,
    marginPrev: optNum(node.attrs['marginPrev']),
    marginNext: optNum(node.attrs['marginNext']),
    listType: (node.attrs['listType'] as ParaPr['listType']) ?? undefined,
    listLevel: optNum(node.attrs['listLevel']),
  });
  const styleIDRef = node.attrs['styleIDRef'] ? String(node.attrs['styleIDRef']) : undefined;
  const runs = collectRuns(node, ctx);
  return {
    id: String(node.attrs['id'] ?? fallbackIndex),
    paraPrIDRef,
    styleIDRef,
    pageBreak: Boolean(node.attrs['pageBreak']) || undefined,
    columnBreak: Boolean(node.attrs['columnBreak']) || undefined,
    runs,
  };
}

function optNum(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

interface RunBuilder {
  charPrIDRef: string;
  inlines: Inline[];
}

function collectRuns(paragraph: PMNode, ctx: ConvertCtx): Run[] {
  const out: RunBuilder[] = [];

  paragraph.forEach((child) => {
    const inlines = inlineFromNode(child, ctx);
    if (inlines.length === 0) return;
    const charPrIDRef = ctx.allocateCharPr(child.marks);
    const last = out[out.length - 1];
    if (last && last.charPrIDRef === charPrIDRef && canMerge(last.inlines, inlines)) {
      last.inlines.push(...inlines);
    } else {
      out.push({ charPrIDRef, inlines: [...inlines] });
    }
  });

  if (out.length === 0) {
    out.push({ charPrIDRef: '0', inlines: [] });
  }
  return out.map((r) => ({ charPrIDRef: r.charPrIDRef, inlines: r.inlines }));
}

function canMerge(_existing: Inline[], _next: Inline[]): boolean {
  return true;
}

function inlineFromNode(node: PMNode, _ctx: ConvertCtx): Inline[] {
  if (node.isText) {
    const value = node.text ?? '';
    if (!value) return [];
    const hl = node.marks.find((m) => m.type.name === 'hyperlink');
    const text: Inline = { kind: 'text', value };
    if (hl) {
      return [{ kind: 'hyperlink', href: String(hl.attrs['href'] ?? ''), inlines: [text] }];
    }
    return [text];
  }
  switch (node.type.name) {
    case 'tab':
      return [{ kind: 'tab' }];
    case 'hardBreak':
      return [{ kind: 'lineBreak' }];
    case 'image':
      return [
        {
          kind: 'picture',
          binaryRef: String(node.attrs['binaryRef'] ?? ''),
          width: Number(node.attrs['width'] ?? 0),
          height: Number(node.attrs['height'] ?? 0),
        },
      ];
    case 'table': {
      try {
        const tbl = JSON.parse(String(node.attrs['cellsJson'] ?? 'null'));
        if (tbl && typeof tbl === 'object') {
          return [{ kind: 'table', table: tbl }];
        }
      } catch {
        /* fall through */
      }
      return [];
    }
    case 'footnote':
      return [{ kind: 'footnote', text: String(node.attrs['text'] ?? '') }];
    case 'endnote':
      return [{ kind: 'endnote', text: String(node.attrs['text'] ?? '') }];
    case 'bookmark':
      return [{ kind: 'bookmark', name: String(node.attrs['name'] ?? '') }];
    case 'comment': {
      const author = String(node.attrs['author'] ?? '');
      const next: Inline = {
        kind: 'comment',
        text: String(node.attrs['text'] ?? ''),
      };
      if (author) (next as { author?: string }).author = author;
      return [next];
    }
    case 'shapeGroup': {
      const labels = String(node.attrs['labels'] ?? '');
      const widthAttr = node.attrs['width'];
      const heightAttr = node.attrs['height'];
      const out: Inline = {
        kind: 'shapeGroup',
        labels,
        raw: {
          raw: String(node.attrs['raw'] ?? ''),
          path: (node.attrs['path'] as string | null) ?? undefined,
        },
      };
      if (typeof widthAttr === 'number') out.width = widthAttr;
      if (typeof heightAttr === 'number') out.height = heightAttr;
      return [out];
    }
    case 'opaque':
      return [
        {
          kind: 'opaque',
          raw: {
            raw: String(node.attrs['raw'] ?? ''),
            path: (node.attrs['path'] as string | null) ?? undefined,
          },
        },
      ];
    default:
      return [];
  }
}

class ConvertCtx {
  private readonly charProps: Map<string, CharPr>;
  private readonly paraProps: Map<string, ParaPr>;
  private nextCharPrId: number;
  private nextParaPrId: number;
  private readonly markCache = new Map<string, string>();
  private readonly paraCache = new Map<string, string>();

  constructor(previous: HwpxDocument) {
    this.charProps = new Map(previous.header.charProps);
    this.paraProps = new Map(previous.header.paraProps);
    this.nextCharPrId = nextNumericId(this.charProps);
    this.nextParaPrId = nextNumericId(this.paraProps);
  }

  allocateCharPr(marks: readonly PMMark[]): string {
    const charPrMark = marks.find((m) => m.type.name === 'charPr');
    const baseId = charPrMark ? String(charPrMark.attrs['charPrIDRef'] ?? '0') : '0';
    const wantBold = marks.some((m) => m.type.name === 'bold');
    const wantItalic = marks.some((m) => m.type.name === 'italic');
    const wantUnderline = marks.some((m) => m.type.name === 'underline');
    const wantStrike = marks.some((m) => m.type.name === 'strike');
    const wantSuperscript = marks.some((m) => m.type.name === 'superscript');
    const wantSubscript = marks.some((m) => m.type.name === 'subscript');
    const wantPosition: 'superscript' | 'subscript' | undefined = wantSuperscript
      ? 'superscript'
      : wantSubscript
        ? 'subscript'
        : undefined;

    const fontSizeMark = marks.find((m) => m.type.name === 'fontSize');
    const wantHeight = fontSizeMark
      ? Math.round(Number(fontSizeMark.attrs['size'] ?? 10) * 100)
      : undefined;
    const textColorMark = marks.find((m) => m.type.name === 'textColor');
    const wantTextColor = textColorMark ? String(textColorMark.attrs['color']) : undefined;
    const bgColorMark = marks.find((m) => m.type.name === 'bgColor');
    const wantBgColor = bgColorMark ? String(bgColorMark.attrs['color']) : undefined;
    const fontFaceMark = marks.find((m) => m.type.name === 'fontFace');
    const wantFaceIdx =
      fontFaceMark && fontFaceMark.attrs['faceIdx'] !== undefined
        ? Number(fontFaceMark.attrs['faceIdx'])
        : undefined;

    const base = this.charProps.get(baseId);
    const matches =
      base &&
      Boolean(base.bold) === wantBold &&
      Boolean(base.italic) === wantItalic &&
      Boolean(base.underline) === wantUnderline &&
      Boolean(base.strikeout) === wantStrike &&
      (base.position ?? undefined) === wantPosition &&
      (base.height ?? undefined) === wantHeight &&
      (base.textColor ?? undefined) === wantTextColor &&
      (base.bgColor ?? undefined) === wantBgColor &&
      (base.fontRefHangul ?? undefined) === wantFaceIdx;
    if (matches) return baseId;

    const cacheKey = [
      baseId,
      wantBold ? 1 : 0,
      wantItalic ? 1 : 0,
      wantUnderline ? 1 : 0,
      wantStrike ? 1 : 0,
      wantPosition ?? '_',
      wantHeight ?? '_',
      wantTextColor ?? '_',
      wantBgColor ?? '_',
      wantFaceIdx ?? '_',
    ].join('|');
    const cached = this.markCache.get(cacheKey);
    if (cached) return cached;

    const id = String(this.nextCharPrId++);
    const next: CharPr = {
      ...(base ?? { id }),
      id,
      bold: wantBold || undefined,
      italic: wantItalic || undefined,
      underline: wantUnderline || undefined,
      strikeout: wantStrike || undefined,
      position: wantPosition,
      height: wantHeight,
      textColor: wantTextColor,
      bgColor: wantBgColor,
      fontRefHangul: wantFaceIdx,
    };
    this.charProps.set(id, next);
    this.markCache.set(cacheKey, id);
    return id;
  }

  allocateParaPr(opts: {
    base: string;
    align: string | null;
    indentLeft?: number;
    indentRight?: number;
    indentFirstLine?: number;
    lineSpacingValue?: number;
    lineSpacingType?: ParaPr['lineSpacingType'];
    marginPrev?: number;
    marginNext?: number;
    listType?: ParaPr['listType'];
    listLevel?: number;
  }): string {
    const base = this.paraProps.get(opts.base);
    const wantAlign = opts.align ?? undefined;
    const matches =
      base &&
      (base.align ?? undefined) === wantAlign &&
      (base.indentLeft ?? undefined) === opts.indentLeft &&
      (base.indentRight ?? undefined) === opts.indentRight &&
      (base.indentFirstLine ?? undefined) === opts.indentFirstLine &&
      (base.lineSpacingValue ?? undefined) === opts.lineSpacingValue &&
      (base.lineSpacingType ?? undefined) === opts.lineSpacingType &&
      (base.marginPrev ?? undefined) === opts.marginPrev &&
      (base.marginNext ?? undefined) === opts.marginNext &&
      (base.listType ?? undefined) === opts.listType &&
      (base.listLevel ?? undefined) === opts.listLevel;
    if (matches) return opts.base;
    const cacheKey = [
      opts.base,
      wantAlign ?? '_',
      opts.indentLeft ?? '_',
      opts.indentRight ?? '_',
      opts.indentFirstLine ?? '_',
      opts.lineSpacingValue ?? '_',
      opts.lineSpacingType ?? '_',
      opts.marginPrev ?? '_',
      opts.marginNext ?? '_',
      opts.listType ?? '_',
      opts.listLevel ?? '_',
    ].join('|');
    const cached = this.paraCache.get(cacheKey);
    if (cached) return cached;
    const id = String(this.nextParaPrId++);
    const align = wantAlign as 'left' | 'right' | 'center' | 'justify' | 'distribute' | undefined;
    this.paraProps.set(id, {
      ...(base ?? { id }),
      id,
      align,
      indentLeft: opts.indentLeft,
      indentRight: opts.indentRight,
      indentFirstLine: opts.indentFirstLine,
      lineSpacingValue: opts.lineSpacingValue,
      lineSpacingType: opts.lineSpacingType,
      marginPrev: opts.marginPrev,
      marginNext: opts.marginNext,
      listType: opts.listType,
      listLevel: opts.listLevel,
    });
    this.paraCache.set(cacheKey, id);
    return id;
  }

  materializeCharProps(): Map<string, CharPr> {
    return new Map(this.charProps);
  }
  materializeParaProps(): Map<string, ParaPr> {
    return new Map(this.paraProps);
  }
}

function nextNumericId(map: ReadonlyMap<string, unknown>): number {
  let max = -1;
  for (const k of map.keys()) {
    const n = Number.parseInt(k, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}
