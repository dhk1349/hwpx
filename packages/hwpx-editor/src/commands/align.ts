import type { Command, EditorState } from 'prosemirror-state';

export type Align = 'left' | 'right' | 'center' | 'justify' | 'distribute';

/**
 * 선택 영역에 걸친 모든 paragraph 노드의 align attr 를 일괄 변경한다.
 * align=null 이면 정렬 제거 (기본값).
 */
export function setAlign(align: Align | null): Command {
  return (state, dispatch) => {
    const { from, to } = state.selection;
    const tr = state.tr;
    let modified = false;
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type.name !== 'paragraph') return true;
      const current = (node.attrs['align'] as string | null) ?? null;
      if (current === align) return false;
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, align });
      modified = true;
      return false;
    });
    if (!modified) return false;
    if (dispatch) dispatch(tr);
    return true;
  };
}

export function getCurrentAlign(state: EditorState): Align | null {
  const { from } = state.selection;
  const $pos = state.doc.resolve(from);
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (node.type.name === 'paragraph') {
      return (node.attrs['align'] as Align | null) ?? null;
    }
  }
  return null;
}
