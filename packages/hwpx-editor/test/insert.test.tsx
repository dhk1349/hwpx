// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createRef } from 'react';
import { act, render } from '@testing-library/react';
import { NodeSelection } from 'prosemirror-state';
import { Editor, type EditorController } from '../src/Editor.js';
import { emptyHwpxDocument } from '../src/empty.js';

function mount() {
  const ref = createRef<EditorController>();
  const doc = emptyHwpxDocument();
  render(<Editor ref={ref} document={doc} />);
  return ref.current!;
}

function selectFirstNode(c: EditorController, typeName: string) {
  c.exec((state, dispatch) => {
    let pos = -1;
    state.doc.descendants((node, p) => {
      if (pos !== -1) return false;
      if (node.type.name === typeName) {
        pos = p;
        return false;
      }
      return true;
    });
    if (pos < 0) return false;
    if (dispatch) dispatch(state.tr.setSelection(NodeSelection.create(state.doc, pos)));
    return true;
  });
}

describe('insertImage', () => {
  it('adds binary and inserts a picture inline', () => {
    const c = mount();
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG header bytes
    const { path } = c.addBinary('photo.png', bytes);
    expect(path).toMatch(/^BinData\/image\d+\.png$/);
    act(() => {
      c.insertImage({ binaryRef: path, width: 100, height: 50 });
    });

    const after = c.getDocument();
    const inlines = after.sections[0]!.body[0]!.runs.flatMap((r) => r.inlines);
    const pic = inlines.find((i) => i.kind === 'picture');
    expect(pic).toBeDefined();
    expect(pic!.kind).toBe('picture');
    if (pic!.kind === 'picture') {
      expect(pic.binaryRef).toBe(path);
      expect(pic.width).toBe(100);
      expect(pic.height).toBe(50);
    }
    expect(after.binaries.get(path)).toEqual(bytes);
  });
});

describe('insertTable', () => {
  it('rejects 0-size tables', () => {
    const c = mount();
    let ok = true;
    act(() => {
      ok = c.insertTable(0, 5);
    });
    expect(ok).toBe(false);
  });

  it('inserts an N×M table with empty cells', () => {
    const c = mount();
    act(() => {
      c.insertTable(2, 3);
    });
    const after = c.getDocument();
    const inlines = after.sections[0]!.body[0]!.runs.flatMap((r) => r.inlines);
    const tbl = inlines.find((i) => i.kind === 'table');
    expect(tbl).toBeDefined();
    if (tbl?.kind === 'table') {
      expect(tbl.table.rowCnt).toBe(2);
      expect(tbl.table.colCnt).toBe(3);
      expect(tbl.table.rows).toHaveLength(2);
      expect(tbl.table.rows[0]!.cells).toHaveLength(3);
    }
  });
});

describe('resizeSelectedImage', () => {
  it('resizes width and keeps aspect ratio when only width given', () => {
    const c = mount();
    const { path } = c.addBinary('p.png', new Uint8Array([1, 2, 3]));
    act(() => {
      c.insertImage({ binaryRef: path, width: 200, height: 100 });
    });
    act(() => selectFirstNode(c, 'image'));
    let resized = false;
    act(() => {
      resized = c.resizeSelectedImage({ width: 100 });
    });
    expect(resized).toBe(true);
    const inlines = c.getDocument().sections[0]!.body[0]!.runs.flatMap((r) => r.inlines);
    const pic = inlines.find((i) => i.kind === 'picture');
    if (pic?.kind === 'picture') {
      expect(pic.width).toBe(100);
      expect(pic.height).toBe(50);
    }
  });
});

describe('insertBookmark / insertComment', () => {
  it('inserts bookmark inline and lists it', () => {
    const c = mount();
    act(() => {
      c.insertBookmark('intro');
    });
    expect(c.listBookmarks()).toEqual([{ name: 'intro' }]);
    const inlines = c.getDocument().sections[0]!.body[0]!.runs.flatMap((r) => r.inlines);
    const bm = inlines.find((i) => i.kind === 'bookmark');
    if (bm?.kind === 'bookmark') expect(bm.name).toBe('intro');
  });

  it('inserts comment with author', () => {
    const c = mount();
    act(() => {
      c.insertComment('typo here', 'reviewer');
    });
    const inlines = c.getDocument().sections[0]!.body[0]!.runs.flatMap((r) => r.inlines);
    const cm = inlines.find((i) => i.kind === 'comment');
    if (cm?.kind === 'comment') {
      expect(cm.text).toBe('typo here');
      expect(cm.author).toBe('reviewer');
    }
  });
});

describe('insertFootnote / insertEndnote', () => {
  it('inserts footnote inline carrying the text attr', () => {
    const c = mount();
    act(() => {
      c.insertFootnote('각주 본문');
    });
    const inlines = c.getDocument().sections[0]!.body[0]!.runs.flatMap((r) => r.inlines);
    const fn = inlines.find((i) => i.kind === 'footnote');
    expect(fn).toBeDefined();
    if (fn?.kind === 'footnote') expect(fn.text).toBe('각주 본문');
  });

  it('inserts endnote inline', () => {
    const c = mount();
    act(() => {
      c.insertEndnote('미주 본문');
    });
    const inlines = c.getDocument().sections[0]!.body[0]!.runs.flatMap((r) => r.inlines);
    const en = inlines.find((i) => i.kind === 'endnote');
    expect(en).toBeDefined();
    if (en?.kind === 'endnote') expect(en.text).toBe('미주 본문');
  });
});
