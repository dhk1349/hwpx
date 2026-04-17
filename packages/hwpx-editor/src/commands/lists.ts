import type { Command, EditorState } from 'prosemirror-state';

export type ListType = 'bullet' | 'numbered';

/**
 * 선택 영역의 모든 paragraph 에 listType / listLevel 을 적용한다.
 * 이미 같은 타입이면 해제, 다른 타입이면 전환한다.
 */
export function toggleList(type: ListType): Command {
  return (state, dispatch) => {
    const { from, to } = state.selection;
    let allMatch = true;
    let any = false;
    state.doc.nodesBetween(from, to, (node) => {
      if (node.type.name !== 'paragraph') return true;
      any = true;
      if (node.attrs['listType'] !== type) allMatch = false;
      return false;
    });
    if (!any) return false;
    const tr = state.tr;
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type.name !== 'paragraph') return true;
      if (allMatch) {
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          listType: null,
          listLevel: null,
        });
      } else {
        const level = node.attrs['listLevel'] != null ? Number(node.attrs['listLevel']) : 0;
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          listType: type,
          listLevel: level,
        });
      }
      return false;
    });
    if (dispatch) dispatch(tr);
    return true;
  };
}

/** 목록 들여쓰기/내어쓰기. delta=+1 들여쓰기, -1 내어쓰기. 0 미만 클램프. */
export function shiftListLevel(delta: 1 | -1): Command {
  return (state, dispatch) => {
    const { from, to } = state.selection;
    const tr = state.tr;
    let modified = false;
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type.name !== 'paragraph') return true;
      if (!node.attrs['listType']) return false;
      const cur = Number(node.attrs['listLevel'] ?? 0);
      const next = Math.max(0, Math.min(8, cur + delta));
      if (cur === next) return false;
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, listLevel: next });
      modified = true;
      return false;
    });
    if (!modified) return false;
    if (dispatch) dispatch(tr);
    return true;
  };
}

export function getCurrentListType(state: EditorState): ListType | null {
  const { from } = state.selection;
  const $pos = state.doc.resolve(from);
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (node.type.name === 'paragraph') {
      const t = node.attrs['listType'] as ListType | null | undefined;
      return t ?? null;
    }
  }
  return null;
}
