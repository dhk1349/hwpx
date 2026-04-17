import type { Command } from 'prosemirror-state';
import { hwpxSchema } from '@hwpx/schema';
import type { Cell, Paragraph, Row, Table } from '@hwpx/codec';

export interface InsertImageOpts {
  binaryRef: string;
  width: number;
  height: number;
  src?: string;
  alt?: string;
}

export function insertImage(opts: InsertImageOpts): Command {
  return (state, dispatch) => {
    const node = hwpxSchema.nodes['image']!.create({
      binaryRef: opts.binaryRef,
      width: opts.width,
      height: opts.height,
      src: opts.src ?? '',
      alt: opts.alt ?? '',
    });
    if (dispatch) dispatch(state.tr.replaceSelectionWith(node, false).scrollIntoView());
    return true;
  };
}

export function insertTable(rows: number, cols: number): Command {
  if (rows < 1 || cols < 1) {
    return () => false;
  }
  const table = blankTable(rows, cols);
  return (state, dispatch) => {
    const node = hwpxSchema.nodes['table']!.create({
      rowCnt: rows,
      colCnt: cols,
      borderFillIDRef: null,
      cellsJson: JSON.stringify(table),
    });
    if (dispatch) dispatch(state.tr.replaceSelectionWith(node, false).scrollIntoView());
    return true;
  };
}

function blankTable(rowCnt: number, colCnt: number): Table {
  const rows: Row[] = [];
  for (let r = 0; r < rowCnt; r++) {
    const cells: Cell[] = [];
    for (let c = 0; c < colCnt; c++) {
      cells.push({
        rowSpan: 1,
        colSpan: 1,
        header: false,
        body: [blankParagraph()],
      });
    }
    rows.push({ cells });
  }
  return { rowCnt, colCnt, rows };
}

function blankParagraph(): Paragraph {
  return {
    id: '0',
    paraPrIDRef: '0',
    styleIDRef: '0',
    runs: [{ charPrIDRef: '0', inlines: [] }],
  };
}

export function insertFootnote(text: string): Command {
  return (state, dispatch) => {
    const node = hwpxSchema.nodes['footnote']!.create({ text });
    if (dispatch) dispatch(state.tr.replaceSelectionWith(node, false).scrollIntoView());
    return true;
  };
}

export function insertEndnote(text: string): Command {
  return (state, dispatch) => {
    const node = hwpxSchema.nodes['endnote']!.create({ text });
    if (dispatch) dispatch(state.tr.replaceSelectionWith(node, false).scrollIntoView());
    return true;
  };
}

export function insertBookmark(name: string): Command {
  return (state, dispatch) => {
    const node = hwpxSchema.nodes['bookmark']!.create({ name });
    if (dispatch) dispatch(state.tr.replaceSelectionWith(node, false).scrollIntoView());
    return true;
  };
}

export function insertComment(text: string, author?: string): Command {
  return (state, dispatch) => {
    const node = hwpxSchema.nodes['comment']!.create({ text, author: author ?? '' });
    if (dispatch) dispatch(state.tr.replaceSelectionWith(node, false).scrollIntoView());
    return true;
  };
}
