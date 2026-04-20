import { describe, it, expect } from 'vitest';
import type { HwpxDocument } from '@hwpx/codec';
import { fromProseMirror, toProseMirror } from '../src/index.js';

const baseDoc: HwpxDocument = {
  version: { major: 5, minor: 1, micro: 0, build: 0, targetApplication: 'WORDPROC' },
  metadata: { title: 't', creator: 'c', date: '2026-04-17', language: 'ko-KR' },
  header: {
    beginNum: { page: 1, footnote: 1, endnote: 1, pic: 1, tbl: 1, equation: 1 },
    fontFaces: [{ lang: 'HANGUL', name: '함초롬바탕' }],
    borderFills: [{ id: '0' }],
    charProps: new Map([
      ['0', { id: '0', height: 1000 }],
      ['1', { id: '1', height: 1000, bold: true }],
    ]),
    paraProps: new Map([
      ['0', { id: '0', align: 'left' }],
      ['1', { id: '1', align: 'center' }],
    ]),
    styles: new Map([
      ['0', { id: '0', type: 'PARA', name: '바탕글', paraPrIDRef: '0', charPrIDRef: '0' }],
    ]),
    bullets: [],
    numberings: [],
  },
  sections: [
    {
      id: 'section0',
      body: [
        {
          id: '0',
          paraPrIDRef: '0',
          styleIDRef: '0',
          runs: [
            { charPrIDRef: '0', inlines: [{ kind: 'text', value: '안녕' }] },
            { charPrIDRef: '1', inlines: [{ kind: 'text', value: 'Bold' }] },
            { charPrIDRef: '0', inlines: [{ kind: 'lineBreak' }] },
          ],
        },
        {
          id: '1',
          paraPrIDRef: '1',
          styleIDRef: '0',
          runs: [{ charPrIDRef: '0', inlines: [{ kind: 'text', value: '센터' }] }],
        },
      ],
    },
  ],
  binaries: new Map(),
  preserved: { nodes: new Map() },
};

describe('hwpx-schema toPM/fromPM', () => {
  it('produces a valid PM doc with section/page/paragraph/text', () => {
    const pm = toProseMirror(baseDoc);
    expect(pm.type.name).toBe('doc');
    expect(pm.childCount).toBe(1);
    const sec = pm.firstChild!;
    expect(sec.type.name).toBe('section');
    // 새 구조: section > page+ > paragraph+.
    // baseDoc 는 pageBreak 가 없으니 단일 page 에 두 paragraph 가 들어간다.
    expect(sec.childCount).toBe(1);
    const page = sec.firstChild!;
    expect(page.type.name).toBe('page');
    expect(page.childCount).toBe(2);
  });

  it('applies bold mark for charPr with bold=true', () => {
    const pm = toProseMirror(baseDoc);
    const para0 = pm.firstChild!.firstChild!.firstChild!;
    let foundBold = false;
    para0.descendants((node) => {
      if (node.isText && node.text === 'Bold') {
        foundBold = node.marks.some((m) => m.type.name === 'bold');
      }
    });
    expect(foundBold).toBe(true);
  });

  it('preserves align via paraProps lookup', () => {
    const pm = toProseMirror(baseDoc);
    const page = pm.firstChild!.firstChild!;
    const para1 = page.child(1);
    expect(para1.attrs['align']).toBe('center');
  });

  it('round-trips through PM (text + marks)', () => {
    const pm = toProseMirror(baseDoc);
    const back = fromProseMirror(pm, baseDoc);
    expect(back.sections).toHaveLength(1);
    const sec = back.sections[0]!;
    const p0 = sec.body[0]!;
    const flat = p0.runs.flatMap((r) =>
      r.inlines.map((i) => (i.kind === 'text' ? i.value : i.kind)),
    );
    expect(flat).toEqual(['안녕', 'Bold', 'lineBreak']);
  });

  it('reuses existing charPr id when marks match unchanged content', () => {
    const pm = toProseMirror(baseDoc);
    const back = fromProseMirror(pm, baseDoc);
    const ids = back.sections[0]!.body[0]!.runs.map((r) => r.charPrIDRef);
    expect(ids).toEqual(['0', '1', '0']);
  });

  it('assigns continuous globalPageIndex + totalPages across multiple sections', () => {
    // 두 섹션 → 각 섹션 1 페이지 → 총 2 페이지.
    // 섹션 2 의 첫 페이지는 local pageIndex=0 이지만 globalPageIndex=1 이어야 한다.
    const multiSection: HwpxDocument = {
      ...baseDoc,
      sections: [
        {
          id: 'section0',
          body: [
            {
              id: '0',
              paraPrIDRef: '0',
              runs: [{ charPrIDRef: '0', inlines: [{ kind: 'text', value: 'first section' }] }],
            },
          ],
        },
        {
          id: 'section1',
          body: [
            {
              id: '1',
              paraPrIDRef: '0',
              runs: [{ charPrIDRef: '0', inlines: [{ kind: 'text', value: 'second section' }] }],
            },
          ],
        },
      ],
    };
    const pm = toProseMirror(multiSection);
    expect(pm.childCount).toBe(2);
    const sec0Page0 = pm.child(0).child(0);
    const sec1Page0 = pm.child(1).child(0);
    // Local index resets per section.
    expect(sec0Page0.attrs['pageIndex']).toBe(0);
    expect(sec1Page0.attrs['pageIndex']).toBe(0);
    // Global index continues across sections.
    expect(sec0Page0.attrs['globalPageIndex']).toBe(0);
    expect(sec1Page0.attrs['globalPageIndex']).toBe(1);
    // totalPages is the same on every page.
    expect(sec0Page0.attrs['totalPages']).toBe(2);
    expect(sec1Page0.attrs['totalPages']).toBe(2);
  });
});
