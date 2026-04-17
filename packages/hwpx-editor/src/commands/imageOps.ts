import { NodeSelection, type Command, type EditorState } from 'prosemirror-state';

export interface SelectedImageInfo {
  pos: number;
  binaryRef: string;
  width: number;
  height: number;
  alt: string;
  src: string;
}

export function getSelectedImage(state: EditorState): SelectedImageInfo | null {
  const sel = state.selection;
  if (!(sel instanceof NodeSelection)) return null;
  const node = sel.node;
  if (node.type.name !== 'image') return null;
  return {
    pos: sel.from,
    binaryRef: String(node.attrs['binaryRef'] ?? ''),
    width: Number(node.attrs['width'] ?? 0),
    height: Number(node.attrs['height'] ?? 0),
    alt: String(node.attrs['alt'] ?? ''),
    src: String(node.attrs['src'] ?? ''),
  };
}

/**
 * 선택된 이미지의 크기를 바꾼다. width/height 중 하나만 넣으면 원래 비율 유지.
 */
export function resizeSelectedImage(opts: { width?: number; height?: number }): Command {
  return (state, dispatch) => {
    const info = getSelectedImage(state);
    if (!info) return false;
    let { width, height } = info;
    if (opts.width !== undefined && opts.height !== undefined) {
      width = Math.max(1, Math.round(opts.width));
      height = Math.max(1, Math.round(opts.height));
    } else if (opts.width !== undefined) {
      const w = Math.max(1, Math.round(opts.width));
      const ratio = info.width > 0 ? info.height / info.width : 1;
      width = w;
      height = Math.max(1, Math.round(w * ratio));
    } else if (opts.height !== undefined) {
      const h = Math.max(1, Math.round(opts.height));
      const ratio = info.height > 0 ? info.width / info.height : 1;
      height = h;
      width = Math.max(1, Math.round(h * ratio));
    } else {
      return false;
    }

    if (dispatch) {
      const tr = state.tr.setNodeMarkup(info.pos, undefined, {
        binaryRef: info.binaryRef,
        width,
        height,
        src: info.src,
        alt: info.alt,
      });
      tr.setSelection(NodeSelection.create(tr.doc, info.pos));
      dispatch(tr);
    }
    return true;
  };
}

export function setSelectedImageAlt(alt: string): Command {
  return (state, dispatch) => {
    const info = getSelectedImage(state);
    if (!info) return false;
    if (dispatch) {
      const tr = state.tr.setNodeMarkup(info.pos, undefined, {
        binaryRef: info.binaryRef,
        width: info.width,
        height: info.height,
        src: info.src,
        alt,
      });
      tr.setSelection(NodeSelection.create(tr.doc, info.pos));
      dispatch(tr);
    }
    return true;
  };
}
