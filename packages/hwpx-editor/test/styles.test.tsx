// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createRef } from 'react';
import { act, render } from '@testing-library/react';
import { Editor, type EditorController } from '../src/Editor.js';
import { emptyHwpxDocument } from '../src/empty.js';

function mount() {
  const ref = createRef<EditorController>();
  const doc = emptyHwpxDocument();
  render(<Editor ref={ref} document={doc} />);
  return ref.current!;
}

describe('style management', () => {
  it('createStyle adds a new style with a fresh id', () => {
    const c = mount();
    const before = c.getAvailableStyles().length;
    let created;
    act(() => {
      created = c.createStyle({ name: '강조 본문' });
    });
    const after = c.getAvailableStyles();
    expect(after).toHaveLength(before + 1);
    expect(after.find((s) => s.id === created!.id)?.name).toBe('강조 본문');
  });

  it('renameStyle updates the name', () => {
    const c = mount();
    let created;
    act(() => {
      created = c.createStyle({ name: 'old' });
    });
    let ok = false;
    act(() => {
      ok = c.renameStyle(created!.id, 'new');
    });
    expect(ok).toBe(true);
    expect(c.getAvailableStyles().find((s) => s.id === created!.id)?.name).toBe('new');
  });

  it('renameStyle returns false for unknown id', () => {
    const c = mount();
    let ok = true;
    act(() => {
      ok = c.renameStyle('does-not-exist', 'whatever');
    });
    expect(ok).toBe(false);
  });

  it('deleteStyle removes the style and clears references on paragraphs', () => {
    const c = mount();
    let created;
    act(() => {
      created = c.createStyle({ name: 'temp' });
    });
    act(() => {
      c.setStyle(created!.id);
    });
    expect(c.getCurrentStyleIDRef()).toBe(created!.id);
    let ok = false;
    act(() => {
      ok = c.deleteStyle(created!.id);
    });
    expect(ok).toBe(true);
    expect(c.getAvailableStyles().find((s) => s.id === created!.id)).toBeUndefined();
    expect(c.getCurrentStyleIDRef()).toBeNull();
  });

  it('createStyle with basedOn copies para/charPr refs', () => {
    const c = mount();
    let base;
    act(() => {
      base = c.createStyle({ name: 'base' });
    });
    let derived;
    act(() => {
      derived = c.createStyle({ name: 'derived', basedOn: base!.id });
    });
    expect(derived!.paraPrIDRef).toBe(base!.paraPrIDRef);
    expect(derived!.charPrIDRef).toBe(base!.charPrIDRef);
  });
});
