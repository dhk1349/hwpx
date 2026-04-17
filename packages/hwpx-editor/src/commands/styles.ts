import type { Command, EditorState } from 'prosemirror-state';
import type { HwpxDocument, Style } from '@hwpx/codec';

/**
 * 선택 영역의 paragraph 들에 styleIDRef 를 설정.
 * "" / null 이면 스타일 제거.
 */
export function setParagraphStyle(styleIDRef: string | null): Command {
  return (state, dispatch) => {
    const { from, to } = state.selection;
    const tr = state.tr;
    let modified = false;
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type.name !== 'paragraph') return true;
      const current = (node.attrs['styleIDRef'] as string | null) ?? null;
      const next = styleIDRef === '' ? null : styleIDRef;
      if (current === next) return false;
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, styleIDRef: next });
      modified = true;
      return false;
    });
    if (!modified) return false;
    if (dispatch) dispatch(tr);
    return true;
  };
}

export function getCurrentStyleIDRef(state: EditorState): string | null {
  const { from } = state.selection;
  const $pos = state.doc.resolve(from);
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (node.type.name === 'paragraph') {
      return (node.attrs['styleIDRef'] as string | null) ?? null;
    }
  }
  return null;
}

/**
 * 새 paragraph 스타일을 생성한다. id 는 기존과 충돌하지 않게 자동 할당.
 * 반환: 새 doc + 생성된 style.
 */
export function createStyle(
  doc: HwpxDocument,
  opts: { name: string; type?: 'PARA' | 'CHAR'; basedOn?: string },
): { doc: HwpxDocument; style: Style } {
  const styles = new Map(doc.header.styles);
  let i = 0;
  while (styles.has(String(i))) i++;
  const id = String(i);
  const base = opts.basedOn ? styles.get(opts.basedOn) : undefined;
  const style: Style = {
    id,
    type: opts.type ?? 'PARA',
    name: opts.name,
    paraPrIDRef: base?.paraPrIDRef,
    charPrIDRef: base?.charPrIDRef,
  };
  styles.set(id, style);
  return {
    doc: { ...doc, header: { ...doc.header, styles } },
    style,
  };
}

/** 기존 스타일의 name 을 변경. */
export function renameStyle(doc: HwpxDocument, id: string, name: string): HwpxDocument | null {
  const cur = doc.header.styles.get(id);
  if (!cur) return null;
  const styles = new Map(doc.header.styles);
  styles.set(id, { ...cur, name });
  return { ...doc, header: { ...doc.header, styles } };
}

/**
 * 스타일 삭제. 참조하는 문단들의 styleIDRef 는 null 로 정리한다.
 * 반환: 새 doc, 또는 id 가 없으면 null.
 */
export function deleteStyle(doc: HwpxDocument, id: string): HwpxDocument | null {
  if (!doc.header.styles.has(id)) return null;
  const styles = new Map(doc.header.styles);
  styles.delete(id);
  return { ...doc, header: { ...doc.header, styles } };
}
