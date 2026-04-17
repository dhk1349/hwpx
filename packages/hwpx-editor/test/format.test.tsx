// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createRef } from 'react';
import { act, render } from '@testing-library/react';
import { Editor, type EditorController } from '../src/Editor.js';
import { emptyHwpxDocument } from '../src/empty.js';

function mount(): { ref: React.RefObject<EditorController | null> } {
  const ref = createRef<EditorController>();
  const doc = emptyHwpxDocument();
  render(<Editor ref={ref} document={doc} />);
  return { ref };
}

describe('marks', () => {
  it('toggleMark sets storedMarks (no selection text)', () => {
    const { ref } = mount();
    const c = ref.current!;
    expect(c.isMarkActive('bold')).toBe(false);
    act(() => {
      c.toggleMark('bold');
    });
    expect(c.isMarkActive('bold')).toBe(true);
    act(() => {
      c.toggleMark('bold');
    });
    expect(c.isMarkActive('bold')).toBe(false);
  });

  it('isMarkActive distinguishes between marks', () => {
    const { ref } = mount();
    const c = ref.current!;
    act(() => {
      c.toggleMark('italic');
    });
    expect(c.isMarkActive('italic')).toBe(true);
    expect(c.isMarkActive('bold')).toBe(false);
  });
});

describe('align', () => {
  it('setAlign updates the current paragraph', () => {
    const { ref } = mount();
    const c = ref.current!;
    expect(c.getCurrentAlign()).toBe('left');
    act(() => {
      c.setAlign('center');
    });
    expect(c.getCurrentAlign()).toBe('center');
  });

  it('setAlign(null) clears alignment', () => {
    const { ref } = mount();
    const c = ref.current!;
    act(() => {
      c.setAlign('right');
    });
    expect(c.getCurrentAlign()).toBe('right');
    act(() => {
      c.setAlign(null);
    });
    expect(c.getCurrentAlign()).toBe(null);
  });
});

describe('styles', () => {
  it('lists styles from current document', () => {
    const { ref } = mount();
    const c = ref.current!;
    const styles = c.getAvailableStyles();
    expect(styles.length).toBeGreaterThan(0);
    expect(styles.find((s) => s.name === '바탕글')).toBeDefined();
  });

  it('setStyle updates paragraph styleIDRef', () => {
    const { ref } = mount();
    const c = ref.current!;
    expect(c.getCurrentStyleIDRef()).toBe('0');
    act(() => {
      c.setStyle(null);
    });
    expect(c.getCurrentStyleIDRef()).toBe(null);
    act(() => {
      c.setStyle('0');
    });
    expect(c.getCurrentStyleIDRef()).toBe('0');
  });
});

describe('subscribe', () => {
  it('notifies listeners on transactions', () => {
    const { ref } = mount();
    const c = ref.current!;
    let calls = 0;
    const cleanup = c.subscribe(() => calls++);
    act(() => {
      c.toggleMark('bold');
    });
    expect(calls).toBeGreaterThan(0);
    cleanup();
    const before = calls;
    act(() => {
      c.toggleMark('bold');
    });
    expect(calls).toBe(before);
  });
});
