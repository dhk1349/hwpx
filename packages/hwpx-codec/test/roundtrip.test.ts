import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { readHwpx, writeHwpx, type HwpxDocument } from '../src/index.js';
import { buildMinimalHwpx } from './fixtures.js';

/**
 * 라운드트립 등가성: parse ∘ write ∘ parse(x) === parse(x)
 * 텍스트 노드만 비교 (PreservedNode 의 raw 는 builder 가 정규화하므로 byte-equal 보장 X).
 */
function fingerprint(doc: HwpxDocument) {
  return {
    metadata: doc.metadata,
    sections: doc.sections.map((s) => ({
      id: s.id,
      paragraphs: s.body.map((p) => ({
        paraPrIDRef: p.paraPrIDRef,
        styleIDRef: p.styleIDRef,
        runs: p.runs.map((r) => ({
          charPrIDRef: r.charPrIDRef,
          inlines: r.inlines,
        })),
      })),
    })),
    header: {
      beginNum: doc.header.beginNum,
      fontFaces: doc.header.fontFaces,
      charProps: [...doc.header.charProps.entries()],
      paraProps: [...doc.header.paraProps.entries()],
      styles: [...doc.header.styles.entries()],
      borderFills: doc.header.borderFills,
      bullets: doc.header.bullets,
      numberings: doc.header.numberings,
    },
    binaryKeys: [...doc.binaries.keys()].sort(),
  };
}

describe('HWPX round-trip', () => {
  it('parse → write → parse is idempotent on the minimal fixture', async () => {
    const original = await readHwpx(await buildMinimalHwpx());
    const rewritten = await writeHwpx(original);
    const reparsed = await readHwpx(rewritten);
    expect(fingerprint(reparsed)).toEqual(fingerprint(original));
  });

  it('preserves Preview/ entries through round-trip', async () => {
    const original = await readHwpx(await buildMinimalHwpx({ withPreview: true }));
    const rewritten = await writeHwpx(original);
    const reparsed = await readHwpx(rewritten);
    expect(reparsed.preserved.nodes.get('Preview/PrvText.txt')?.raw).toBe('Hello World');
  });

  it('produces a valid mimetype on rewrite', async () => {
    const original = await readHwpx(await buildMinimalHwpx());
    const rewritten = await writeHwpx(original);
    // 다시 열 수 있으면 mimetype 검증을 통과한 것
    await expect(readHwpx(rewritten)).resolves.toBeDefined();
  });
});

describe('HWPX round-trip — new attr coverage', () => {
  it('preserves position (super/sub) through write→read', async () => {
    const original = await readHwpx(await buildMinimalHwpx());
    const mutated: HwpxDocument = {
      ...original,
      header: {
        ...original.header,
        charProps: new Map([
          ...original.header.charProps,
          ['10', { id: '10', position: 'superscript' as const }],
          ['11', { id: '11', position: 'subscript' as const }],
        ]),
      },
    };
    const rewritten = await writeHwpx(mutated);
    const reparsed = await readHwpx(rewritten);
    expect(reparsed.header.charProps.get('10')?.position).toBe('superscript');
    expect(reparsed.header.charProps.get('11')?.position).toBe('subscript');
  });

  it('preserves bgColor (shadeColor) and fontRefHangul through write→read', async () => {
    const original = await readHwpx(await buildMinimalHwpx());
    const mutated: HwpxDocument = {
      ...original,
      header: {
        ...original.header,
        charProps: new Map([
          ...original.header.charProps,
          [
            '5',
            {
              id: '5',
              height: 1400,
              textColor: '#ff0000',
              bgColor: '#ffff00',
              fontRefHangul: 0,
              bold: true,
              italic: true,
            },
          ],
        ]),
      },
    };
    const rewritten = await writeHwpx(mutated);
    const reparsed = await readHwpx(rewritten);
    const cp = reparsed.header.charProps.get('5');
    expect(cp).toBeDefined();
    expect(cp!.height).toBe(1400);
    expect(cp!.textColor).toBe('#ff0000');
    expect(cp!.bgColor).toBe('#ffff00');
    expect(cp!.fontRefHangul).toBe(0);
    expect(cp!.bold).toBe(true);
    expect(cp!.italic).toBe(true);
  });
});

describe('HWPX round-trip — property based', () => {
  // ASCII + 한글 음절 + 공백/문장부호 — fast-check 3.x stringMatching 은
  // Unicode property escape 미지원이라 명시적 코드포인트 풀로 구성.
  const allowedChars: string[] = [];
  for (let c = 0x20; c <= 0x7e; c++) {
    if (c !== 0x3c && c !== 0x3e && c !== 0x26 && c !== 0x22 && c !== 0x27) {
      allowedChars.push(String.fromCodePoint(c));
    }
  }
  for (let c = 0xac00; c <= 0xac00 + 200; c++) {
    allowedChars.push(String.fromCodePoint(c));
  }
  const arbText = fc
    .array(fc.constantFrom(...allowedChars), { minLength: 0, maxLength: 40 })
    .map((arr) => arr.join(''));

  it('arbitrary paragraph text survives round-trip', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(arbText, { minLength: 1, maxLength: 5 }), async (texts) => {
        const original = await readHwpx(await buildMinimalHwpx());
        const mutated: HwpxDocument = {
          ...original,
          sections: [
            {
              id: original.sections[0]!.id,
              body: texts.map((t, i) => ({
                id: String(i),
                paraPrIDRef: '0',
                styleIDRef: '0',
                runs: [
                  {
                    charPrIDRef: '0',
                    inlines: [{ kind: 'text' as const, value: t }],
                  },
                ],
              })),
            },
          ],
        };
        const rewritten = await writeHwpx(mutated);
        const reparsed = await readHwpx(rewritten);
        const out = reparsed.sections[0]!.body.map((p) => {
          const inline = p.runs[0]?.inlines[0];
          return inline?.kind === 'text' ? inline.value : '';
        });
        expect(out).toEqual(texts);
      }),
      { numRuns: 20 },
    );
  });
});
