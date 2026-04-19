import { NodeSelection, type Command, type EditorState } from 'prosemirror-state';
import type { Transaction } from 'prosemirror-state';
import type { Cell, Paragraph, Row, Table } from '@hwpx/codec';

export interface SelectedTableInfo {
  pos: number;
  table: Table;
  rowCnt: number;
  colCnt: number;
}

export function getSelectedTable(state: EditorState): SelectedTableInfo | null {
  const sel = state.selection;
  if (!(sel instanceof NodeSelection)) return null;
  const node = sel.node;
  if (node.type.name !== 'table') return null;
  const table = parseTable(String(node.attrs['cellsJson'] ?? 'null'));
  if (!table) return null;
  return { pos: sel.from, table, rowCnt: table.rowCnt, colCnt: table.colCnt };
}

function parseTable(json: string): Table | null {
  try {
    const t = JSON.parse(json) as unknown;
    if (t && typeof t === 'object' && Array.isArray((t as Table).rows)) return t as Table;
  } catch {
    /* ignore */
  }
  return null;
}

function blankParagraph(): Paragraph {
  return {
    id: '0',
    paraPrIDRef: '0',
    styleIDRef: '0',
    runs: [{ charPrIDRef: '0', inlines: [] }],
  };
}

function blankCell(): Cell {
  return { rowSpan: 1, colSpan: 1, header: false, body: [blankParagraph()] };
}

function blankRow(colCnt: number): Row {
  const cells: Cell[] = [];
  for (let c = 0; c < colCnt; c++) cells.push(blankCell());
  return { cells };
}

function applyTable(state: EditorState, info: SelectedTableInfo, next: Table): Command {
  return (_s, dispatch) => {
    if (!dispatch) return true;
    const node = state.doc.nodeAt(info.pos);
    if (!node || node.type.name !== 'table') return false;
    const tr: Transaction = state.tr.setNodeMarkup(info.pos, undefined, {
      ...node.attrs,
      rowCnt: next.rowCnt,
      colCnt: next.colCnt,
      cellsJson: JSON.stringify(next),
    });
    // setNodeMarkup 은 inline atom 의 NodeSelection 을 보존하지 않으므로 재설정.
    tr.setSelection(NodeSelection.create(tr.doc, info.pos));
    dispatch(tr);
    return true;
  };
}

/** rowIndex 위치에 새 행을 끼워 넣는다. rowIndex == rowCnt 면 끝에 추가. */
export function addRow(rowIndex?: number): Command {
  return (state, dispatch) => {
    const info = getSelectedTable(state);
    if (!info) return false;
    const idx = clamp(rowIndex ?? info.rowCnt, 0, info.rowCnt);
    const newRow = blankRow(info.colCnt);
    const rows = [...info.table.rows];
    rows.splice(idx, 0, newRow);
    const next: Table = { ...info.table, rowCnt: rows.length, rows };
    return applyTable(state, info, next)(state, dispatch);
  };
}

export function addCol(colIndex?: number): Command {
  return (state, dispatch) => {
    const info = getSelectedTable(state);
    if (!info) return false;
    const idx = clamp(colIndex ?? info.colCnt, 0, info.colCnt);
    const rows: Row[] = info.table.rows.map((r) => {
      const cells = [...r.cells];
      cells.splice(idx, 0, blankCell());
      return { cells };
    });
    const next: Table = { ...info.table, colCnt: info.colCnt + 1, rows };
    return applyTable(state, info, next)(state, dispatch);
  };
}

export function deleteRow(rowIndex?: number): Command {
  return (state, dispatch) => {
    const info = getSelectedTable(state);
    if (!info || info.rowCnt <= 1) return false;
    const idx = clamp(rowIndex ?? info.rowCnt - 1, 0, info.rowCnt - 1);
    const rows = info.table.rows.filter((_, i) => i !== idx);
    const next: Table = { ...info.table, rowCnt: rows.length, rows };
    return applyTable(state, info, next)(state, dispatch);
  };
}

export function deleteCol(colIndex?: number): Command {
  return (state, dispatch) => {
    const info = getSelectedTable(state);
    if (!info || info.colCnt <= 1) return false;
    const idx = clamp(colIndex ?? info.colCnt - 1, 0, info.colCnt - 1);
    const rows: Row[] = info.table.rows.map((r) => ({
      cells: r.cells.filter((_, i) => i !== idx),
    }));
    const next: Table = { ...info.table, colCnt: info.colCnt - 1, rows };
    return applyTable(state, info, next)(state, dispatch);
  };
}

/** 단일 셀의 텍스트를 교체. body 를 단일 paragraph + 단일 text run 으로 정규화. */
export function setCellText(rowIndex: number, colIndex: number, text: string): Command {
  return (state, dispatch) => {
    const info = getSelectedTable(state);
    if (!info) return false;
    if (rowIndex < 0 || rowIndex >= info.rowCnt) return false;
    if (colIndex < 0 || colIndex >= info.colCnt) return false;
    const rows: Row[] = info.table.rows.map((r, ri) => {
      if (ri !== rowIndex) return r;
      const cells: Cell[] = r.cells.map((c, ci) => {
        if (ci !== colIndex) return c;
        const para: Paragraph = {
          id: '0',
          paraPrIDRef: '0',
          styleIDRef: '0',
          runs: [{ charPrIDRef: '0', inlines: text ? [{ kind: 'text', value: text }] : [] }],
        };
        return { ...c, body: [para] };
      });
      return { cells };
    });
    const next: Table = { ...info.table, rows };
    return applyTable(state, info, next)(state, dispatch);
  };
}

/**
 * (r1..r2, c1..c2) 사각 영역을 하나의 셀로 병합. 좌상 셀만 남기고 덮인 셀은
 * 제거. rowSpan/colSpan 이 이미 1 이상인 겹침 상황에서도 정상 동작하도록
 * 영역 안의 모든 텍스트를 좌상 셀 body 에 이어붙인다.
 */
export function mergeCells(r1: number, c1: number, r2: number, c2: number): Command {
  return (state, dispatch) => {
    const info = getSelectedTable(state);
    if (!info) return false;
    const rLo = Math.min(r1, r2);
    const rHi = Math.max(r1, r2);
    const cLo = Math.min(c1, c2);
    const cHi = Math.max(c1, c2);
    if (rLo < 0 || cLo < 0 || rHi >= info.rowCnt || cHi >= info.colCnt) return false;
    if (rLo === rHi && cLo === cHi) return false;

    const texts: string[] = [];
    for (let r = rLo; r <= rHi; r++) {
      const row = info.table.rows[r];
      if (!row) continue;
      for (let c = cLo; c <= cHi; c++) {
        const cell = row.cells[c];
        if (!cell) continue;
        if (r === rLo && c === cLo) continue;
        for (const p of cell.body) {
          for (const run of p.runs) {
            for (const inl of run.inlines) {
              if (inl.kind === 'text' && inl.value) texts.push(inl.value);
            }
          }
        }
      }
    }

    const rows: Row[] = info.table.rows.map((row, r) => {
      if (r < rLo || r > rHi) return row;
      const cells: Cell[] = [];
      for (let c = 0; c < row.cells.length; c++) {
        const cell = row.cells[c]!;
        if (c >= cLo && c <= cHi) {
          if (r === rLo && c === cLo) {
            const mergedBody: Paragraph[] = texts.length
              ? [
                  {
                    id: '0',
                    paraPrIDRef: '0',
                    styleIDRef: '0',
                    runs: [
                      ...(cell.body[0]?.runs ?? []),
                      {
                        charPrIDRef: '0',
                        inlines: texts.map((value) => ({ kind: 'text', value })),
                      },
                    ],
                  },
                ]
              : [...cell.body];
            cells.push({
              ...cell,
              rowSpan: rHi - rLo + 1,
              colSpan: cHi - cLo + 1,
              body: mergedBody,
            });
          }
          // 영역 안의 다른 셀은 제거 (rendering 은 rowSpan/colSpan 이 덮음)
          continue;
        }
        cells.push(cell);
      }
      return { cells };
    });
    const next: Table = { ...info.table, rows };
    return applyTable(state, info, next)(state, dispatch);
  };
}

/** (r,c) 셀의 병합을 풀어 빈 셀들로 복원. rowSpan/colSpan 이 1 이면 no-op. */
export function splitCell(rowIndex: number, colIndex: number): Command {
  return (state, dispatch) => {
    const info = getSelectedTable(state);
    if (!info) return false;
    const row = info.table.rows[rowIndex];
    if (!row) return false;
    const cell = row.cells[colIndex];
    if (!cell) return false;
    if (cell.rowSpan <= 1 && cell.colSpan <= 1) return false;

    const rSpan = cell.rowSpan;
    const cSpan = cell.colSpan;
    const rows: Row[] = info.table.rows.map((r, ri) => {
      if (ri < rowIndex || ri > rowIndex + rSpan - 1) return r;
      const cells: Cell[] = [];
      // 원래 행을 순회하면서 분할 대상 셀 위치 앞뒤로 일반 셀은 그대로 둠.
      // 병합 전 상태 복원: 각 (ri, ci) 위치에 빈 셀 생성.
      let insertedAt = -1;
      for (let i = 0; i < r.cells.length; i++) {
        const cc = r.cells[i]!;
        if (ri === rowIndex && i === colIndex) {
          insertedAt = cells.length;
          // span 을 1×1 로 축소한 셀을 대체로 배치
          cells.push({ ...cc, rowSpan: 1, colSpan: 1 });
          continue;
        }
        cells.push(cc);
      }
      // 같은 행에서 colSpan>1 이었다면 오른쪽에 빈 셀 추가
      if (ri === rowIndex && insertedAt >= 0) {
        for (let cc = 1; cc < cSpan; cc++) cells.splice(insertedAt + cc, 0, blankCell());
      } else if (ri > rowIndex && ri <= rowIndex + rSpan - 1) {
        // 아래 병합되었던 행에 colIndex 위치에 cSpan 개 셀 삽입
        const insertPos = Math.min(colIndex, cells.length);
        for (let cc = 0; cc < cSpan; cc++) cells.splice(insertPos + cc, 0, blankCell());
      }
      return { cells };
    });
    const next: Table = { ...info.table, rows };
    return applyTable(state, info, next)(state, dispatch);
  };
}

/** 셀 (r,c) 의 첫 paragraph 의 모든 text inline 을 이어붙여 반환. */
export function getCellText(state: EditorState, rowIndex: number, colIndex: number): string {
  const info = getSelectedTable(state);
  if (!info) return '';
  const row = info.table.rows[rowIndex];
  if (!row) return '';
  const cell = row.cells[colIndex];
  if (!cell || cell.body.length === 0) return '';
  const para = cell.body[0]!;
  let out = '';
  for (const run of para.runs) {
    for (const inl of run.inlines) {
      if (inl.kind === 'text') out += inl.value;
    }
  }
  return out;
}

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}
