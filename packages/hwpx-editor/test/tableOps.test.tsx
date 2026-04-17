// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createRef } from 'react';
import { act, render } from '@testing-library/react';
import { Editor, type EditorController } from '../src/Editor.js';
import { emptyHwpxDocument } from '../src/empty.js';
import { NodeSelection } from 'prosemirror-state';
import type { TableInline } from '@hwpx/codec';

function mount(): { c: EditorController; selectFirstTable: () => void } {
  const ref = createRef<EditorController>();
  const doc = emptyHwpxDocument();
  render(<Editor ref={ref} document={doc} />);
  const c = ref.current!;
  // Reach into the underlying view to set NodeSelection on the inserted table.
  const selectFirstTable = () => {
    // The editor exposes no direct view handle; we round-trip via getDocument
    // and re-open with the inserted table position. Instead we use act() and
    // dispatch via exec: a no-op that just wraps the closure scope.
    c.exec((state, dispatch) => {
      let pos = -1;
      state.doc.descendants((node, p) => {
        if (pos !== -1) return false;
        if (node.type.name === 'table') {
          pos = p;
          return false;
        }
        return true;
      });
      if (pos < 0) return false;
      if (dispatch) {
        const tr = state.tr.setSelection(NodeSelection.create(state.doc, pos));
        dispatch(tr);
      }
      return true;
    });
  };
  return { c, selectFirstTable };
}

function getTable(c: EditorController): TableInline['table'] | null {
  const after = c.getDocument();
  for (const sec of after.sections) {
    for (const para of sec.body) {
      for (const run of para.runs) {
        for (const inl of run.inlines) {
          if (inl.kind === 'table') return inl.table;
        }
      }
    }
  }
  return null;
}

describe('table mutation ops', () => {
  it('addTableRow appends a blank row', () => {
    const { c, selectFirstTable } = mount();
    act(() => c.insertTable(2, 3));
    act(() => selectFirstTable());
    expect(c.getSelectedTable()).toEqual({ rowCnt: 2, colCnt: 3 });
    act(() => {
      c.addTableRow();
    });
    const t = getTable(c)!;
    expect(t.rowCnt).toBe(3);
    expect(t.rows).toHaveLength(3);
    expect(t.rows[2]!.cells).toHaveLength(3);
  });

  it('addTableCol inserts a column on every row', () => {
    const { c, selectFirstTable } = mount();
    act(() => c.insertTable(2, 2));
    act(() => selectFirstTable());
    act(() => {
      c.addTableCol();
    });
    const t = getTable(c)!;
    expect(t.colCnt).toBe(3);
    expect(t.rows.every((r) => r.cells.length === 3)).toBe(true);
  });

  it('deleteTableRow refuses to drop the last remaining row', () => {
    const { c, selectFirstTable } = mount();
    act(() => c.insertTable(1, 2));
    act(() => selectFirstTable());
    let ok = true;
    act(() => {
      ok = c.deleteTableRow();
    });
    expect(ok).toBe(false);
    expect(getTable(c)!.rowCnt).toBe(1);
  });

  it('deleteTableCol refuses to drop the last remaining column', () => {
    const { c, selectFirstTable } = mount();
    act(() => c.insertTable(2, 1));
    act(() => selectFirstTable());
    let ok = true;
    act(() => {
      ok = c.deleteTableCol();
    });
    expect(ok).toBe(false);
    expect(getTable(c)!.colCnt).toBe(1);
  });

  it('setTableCellText writes and getTableCellText reads back', () => {
    const { c, selectFirstTable } = mount();
    act(() => c.insertTable(2, 2));
    act(() => selectFirstTable());
    act(() => {
      c.setTableCellText(0, 1, 'hello');
    });
    expect(c.getTableCellText(0, 1)).toBe('hello');
    const t = getTable(c)!;
    const cell = t.rows[0]!.cells[1]!;
    const text = cell.body[0]!.runs[0]!.inlines[0];
    expect(text!.kind).toBe('text');
    if (text!.kind === 'text') expect(text.value).toBe('hello');
  });

  it('returns null from getSelectedTable when no table selection', () => {
    const { c } = mount();
    act(() => c.insertTable(2, 2));
    expect(c.getSelectedTable()).toBeNull();
  });

  it('mergeTableCells collapses a rectangular area into a single top-left cell', () => {
    const { c, selectFirstTable } = mount();
    act(() => c.insertTable(3, 3));
    act(() => selectFirstTable());
    act(() => c.setTableCellText(0, 0, 'A'));
    act(() => c.setTableCellText(0, 1, 'B'));
    act(() => c.setTableCellText(1, 0, 'C'));
    act(() => c.setTableCellText(1, 1, 'D'));
    act(() => selectFirstTable());
    act(() => {
      c.mergeTableCells(0, 0, 1, 1);
    });
    const t = getTable(c)!;
    // Row 0 now has 2 cells (merged + col 2), row 1 has 1 cell (col 2 only).
    expect(t.rows[0]!.cells).toHaveLength(2);
    expect(t.rows[1]!.cells).toHaveLength(1);
    const top = t.rows[0]!.cells[0]!;
    expect(top.rowSpan).toBe(2);
    expect(top.colSpan).toBe(2);
  });

  it('splitTableCell restores a merged cell to its occupied area', () => {
    const { c, selectFirstTable } = mount();
    act(() => c.insertTable(3, 3));
    act(() => selectFirstTable());
    act(() => {
      c.mergeTableCells(0, 0, 1, 1);
    });
    act(() => selectFirstTable());
    act(() => {
      c.splitTableCell(0, 0);
    });
    const t = getTable(c)!;
    expect(t.rows[0]!.cells).toHaveLength(3);
    expect(t.rows[1]!.cells).toHaveLength(3);
    expect(t.rows[0]!.cells[0]!.rowSpan).toBe(1);
    expect(t.rows[0]!.cells[0]!.colSpan).toBe(1);
  });
});
