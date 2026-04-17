import type { HwpxDocument } from '@hwpx/codec';

/**
 * 빈 HWPX 문서 한 개. 새 문서 생성 / 모델 미지정 시 fallback.
 * 한컴오피스 호환을 위해 최소한의 헤더 (charPr 0, paraPr 0, 바탕글 style) 를 갖춘다.
 */
export function emptyHwpxDocument(): HwpxDocument {
  const today = new Date().toISOString().slice(0, 10);
  return {
    version: { major: 5, minor: 1, micro: 0, build: 0, targetApplication: 'WORDPROC' },
    metadata: { title: '', creator: '', date: today, language: 'ko-KR' },
    header: {
      beginNum: { page: 1, footnote: 1, endnote: 1, pic: 1, tbl: 1, equation: 1 },
      fontFaces: [{ lang: 'HANGUL', name: '함초롬바탕' }],
      borderFills: [{ id: '0' }],
      charProps: new Map([['0', { id: '0', height: 1000 }]]),
      paraProps: new Map([['0', { id: '0', align: 'left' }]]),
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
            runs: [{ charPrIDRef: '0', inlines: [] }],
          },
        ],
      },
    ],
    binaries: new Map(),
    preserved: { nodes: new Map() },
  };
}
