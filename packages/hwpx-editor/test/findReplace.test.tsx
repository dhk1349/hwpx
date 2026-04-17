// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createRef } from 'react';
import { act, render } from '@testing-library/react';
import type { HwpxDocument } from '@hwpx/codec';
import { Editor, type EditorController } from '../src/Editor.js';
import { emptyHwpxDocument } from '../src/empty.js';

function docWithText(text: string): HwpxDocument {
  const base = emptyHwpxDocument();
  return {
    ...base,
    sections: [
      {
        id: 'section0',
        body: [
          {
            id: '0',
            paraPrIDRef: '0',
            styleIDRef: '0',
            runs: [{ charPrIDRef: '0', inlines: [{ kind: 'text', value: text }] }],
          },
        ],
      },
    ],
  };
}

function mount(doc: HwpxDocument): EditorController {
  const ref = createRef<EditorController>();
  render(<Editor ref={ref} document={doc} />);
  return ref.current!;
}

describe('find', () => {
  it('counts case-insensitive matches', () => {
    const c = mount(docWithText('foo Foo FOO bar foo'));
    act(() => c.setFindQuery('foo'));
    expect(c.getFindCount()).toBe(4);
  });

  it('returns 0 for empty query', () => {
    const c = mount(docWithText('hello'));
    act(() => c.setFindQuery(''));
    expect(c.getFindCount()).toBe(0);
  });

  it('cycles through matches with findNext', () => {
    const c = mount(docWithText('a b a b a'));
    act(() => c.setFindQuery('a'));
    expect(c.getFindCount()).toBe(3);
    expect(c.getFindCurrent()).toBe(0);
    act(() => {
      c.findNext(1);
    });
    expect(c.getFindCurrent()).toBe(1);
    act(() => {
      c.findNext(1);
    });
    expect(c.getFindCurrent()).toBe(2);
    act(() => {
      c.findNext(1);
    });
    expect(c.getFindCurrent()).toBe(0);
    act(() => {
      c.findNext(-1);
    });
    expect(c.getFindCurrent()).toBe(2);
  });
});

describe('replace', () => {
  it('replaceAll replaces every match and returns count', () => {
    const c = mount(docWithText('cat cat cat'));
    act(() => c.setFindQuery('cat'));
    let count = 0;
    act(() => {
      count = c.replaceAll('dog');
    });
    expect(count).toBe(3);
    const after = c.getDocument();
    const text = after.sections[0]!.body[0]!.runs.flatMap((r) => r.inlines)
      .map((i) => (i.kind === 'text' ? i.value : ''))
      .join('');
    expect(text).toBe('dog dog dog');
  });

  it('replaceCurrent replaces only the active match', () => {
    const c = mount(docWithText('one one one'));
    act(() => c.setFindQuery('one'));
    expect(c.getFindCount()).toBe(3);
    act(() => {
      c.replaceCurrent('two');
    });
    const after = c.getDocument();
    const text = after.sections[0]!.body[0]!.runs.flatMap((r) => r.inlines)
      .map((i) => (i.kind === 'text' ? i.value : ''))
      .join('');
    expect(text).toBe('two one one');
  });
});

describe('docStats', () => {
  it('counts characters, words, paragraphs', () => {
    const c = mount(docWithText('Hello world'));
    const s = c.getDocStats();
    expect(s.chars).toBe(11);
    expect(s.words).toBe(2);
    expect(s.paragraphs).toBe(1);
  });
});
