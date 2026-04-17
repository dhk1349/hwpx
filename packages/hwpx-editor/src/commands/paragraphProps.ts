import type { Command, EditorState } from 'prosemirror-state';

export type LineSpacingType = 'PERCENT' | 'FIXED' | 'ATLEAST' | 'BETWEEN_LINES';

export interface ParagraphPropsSnapshot {
  indentLeft: number | null;
  indentRight: number | null;
  indentFirstLine: number | null;
  lineSpacingValue: number | null;
  lineSpacingType: LineSpacingType | null;
  marginPrev: number | null;
  marginNext: number | null;
}

const KEYS: ReadonlyArray<keyof ParagraphPropsSnapshot> = [
  'indentLeft',
  'indentRight',
  'indentFirstLine',
  'lineSpacingValue',
  'lineSpacingType',
  'marginPrev',
  'marginNext',
];

/**
 * 선택 영역에 걸친 모든 paragraph 노드에 주어진 attr 패치를 병합한다.
 * 값을 `null` 로 설정하면 해당 attr 를 제거한다.
 */
export function patchParagraphProps(patch: Partial<ParagraphPropsSnapshot>): Command {
  return (state, dispatch) => {
    const { from, to } = state.selection;
    const tr = state.tr;
    let modified = false;
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type.name !== 'paragraph') return true;
      const nextAttrs = { ...node.attrs };
      let changed = false;
      for (const k of KEYS) {
        if (!(k in patch)) continue;
        const current = (node.attrs[k] as ParagraphPropsSnapshot[typeof k]) ?? null;
        const wanted = patch[k] ?? null;
        if (current !== wanted) {
          nextAttrs[k] = wanted;
          changed = true;
        }
      }
      if (!changed) return false;
      tr.setNodeMarkup(pos, undefined, nextAttrs);
      modified = true;
      return false;
    });
    if (!modified) return false;
    if (dispatch) dispatch(tr);
    return true;
  };
}

export function getCurrentParagraphProps(state: EditorState): ParagraphPropsSnapshot {
  const blank: ParagraphPropsSnapshot = {
    indentLeft: null,
    indentRight: null,
    indentFirstLine: null,
    lineSpacingValue: null,
    lineSpacingType: null,
    marginPrev: null,
    marginNext: null,
  };
  const { from } = state.selection;
  const $pos = state.doc.resolve(from);
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (node.type.name !== 'paragraph') continue;
    return {
      indentLeft: (node.attrs['indentLeft'] as number | null) ?? null,
      indentRight: (node.attrs['indentRight'] as number | null) ?? null,
      indentFirstLine: (node.attrs['indentFirstLine'] as number | null) ?? null,
      lineSpacingValue: (node.attrs['lineSpacingValue'] as number | null) ?? null,
      lineSpacingType: (node.attrs['lineSpacingType'] as LineSpacingType | null) ?? null,
      marginPrev: (node.attrs['marginPrev'] as number | null) ?? null,
      marginNext: (node.attrs['marginNext'] as number | null) ?? null,
    };
  }
  return blank;
}

/** 1pt 단위의 변화를 HWPX 단위(1/100pt)로 변환해 왼쪽 들여쓰기를 증감. */
export function adjustIndent(deltaPt: number): Command {
  return (state, dispatch) => {
    const { from, to } = state.selection;
    const tr = state.tr;
    let modified = false;
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type.name !== 'paragraph') return true;
      const current = Number((node.attrs['indentLeft'] as number | null) ?? 0);
      const next = Math.max(0, current + deltaPt * 100);
      if (current === next) return false;
      tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        indentLeft: next === 0 ? null : next,
      });
      modified = true;
      return false;
    });
    if (!modified) return false;
    if (dispatch) dispatch(tr);
    return true;
  };
}
