// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createRef } from 'react';
import { act, render } from '@testing-library/react';
import { Editor, type EditorController } from '../src/Editor.js';
import { emptyHwpxDocument } from '../src/empty.js';
import { TextSelection } from 'prosemirror-state';

function mount(): EditorController {
  const ref = createRef<EditorController>();
  render(<Editor ref={ref} document={emptyHwpxDocument()} />);
  return ref.current!;
}

function selectAllFirstPara(c: EditorController) {
  c.exec((state, dispatch) => {
    let pos = -1;
    state.doc.descendants((node, p) => {
      if (pos !== -1) return false;
      if (node.type.name === 'paragraph') {
        pos = p + 1;
        return false;
      }
      return true;
    });
    if (pos < 0) return false;
    if (dispatch) {
      dispatch(state.tr.setSelection(TextSelection.create(state.doc, pos)));
    }
    return true;
  });
}

describe('paragraph props commands', () => {
  it('adjustParagraphIndent increments indentLeft in 1/100pt units', () => {
    const c = mount();
    act(() => selectAllFirstPara(c));
    act(() => {
      c.adjustParagraphIndent(10);
    });
    expect(c.getCurrentParagraphProps().indentLeft).toBe(1000);
    act(() => {
      c.adjustParagraphIndent(5);
    });
    expect(c.getCurrentParagraphProps().indentLeft).toBe(1500);
    act(() => {
      c.adjustParagraphIndent(-50);
    });
    // Clamped at 0, and zero becomes null.
    expect(c.getCurrentParagraphProps().indentLeft).toBeNull();
  });

  it('setParagraphProps writes line spacing and paragraph space', () => {
    const c = mount();
    act(() => selectAllFirstPara(c));
    act(() => {
      c.setParagraphProps({ lineSpacingValue: 150, lineSpacingType: 'PERCENT' });
    });
    const snap = c.getCurrentParagraphProps();
    expect(snap.lineSpacingValue).toBe(150);
    expect(snap.lineSpacingType).toBe('PERCENT');
    act(() => {
      c.setParagraphProps({ marginPrev: 500, marginNext: 300 });
    });
    const snap2 = c.getCurrentParagraphProps();
    expect(snap2.marginPrev).toBe(500);
    expect(snap2.marginNext).toBe(300);
  });

  it('paragraph props survive fromProseMirror round-trip', () => {
    const c = mount();
    act(() => selectAllFirstPara(c));
    act(() => {
      c.setParagraphProps({
        indentFirstLine: 2000,
        lineSpacingValue: 200,
        lineSpacingType: 'PERCENT',
        marginPrev: 400,
      });
    });
    const out = c.getDocument();
    const pp = out.header.paraProps.get(out.sections[0]!.body[0]!.paraPrIDRef)!;
    expect(pp.indentFirstLine).toBe(2000);
    expect(pp.lineSpacingValue).toBe(200);
    expect(pp.lineSpacingType).toBe('PERCENT');
    expect(pp.marginPrev).toBe(400);
  });
});
