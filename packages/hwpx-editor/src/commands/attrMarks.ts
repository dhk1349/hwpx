import type { Command, EditorState } from 'prosemirror-state';
import type { MarkType } from 'prosemirror-model';
import { hwpxSchema } from '@hwpx/schema';

type AttrMarkName = 'fontSize' | 'textColor' | 'bgColor' | 'fontFace';

const types: Record<AttrMarkName, MarkType> = {
  fontSize: hwpxSchema.marks['fontSize']!,
  textColor: hwpxSchema.marks['textColor']!,
  bgColor: hwpxSchema.marks['bgColor']!,
  fontFace: hwpxSchema.marks['fontFace']!,
};

/**
 * 지정 mark 를 선택 영역에 (재)적용하거나 clear 한다.
 * attrs=null 이면 mark 를 제거.
 * 선택이 비어 있으면 storedMarks 에 저장 (다음 타이핑에 적용).
 */
function setAttrMark(name: AttrMarkName, attrs: Record<string, unknown> | null): Command {
  const type = types[name];
  return (state, dispatch) => {
    const { from, to, empty } = state.selection;
    if (empty) {
      if (!dispatch) return true;
      const tr = state.tr;
      if (attrs == null) {
        tr.removeStoredMark(type);
      } else {
        tr.addStoredMark(type.create(attrs));
      }
      dispatch(tr);
      return true;
    }
    if (!dispatch) return true;
    const tr = state.tr;
    tr.removeMark(from, to, type);
    if (attrs != null) tr.addMark(from, to, type.create(attrs));
    dispatch(tr);
    return true;
  };
}

export function setFontSize(size: number | null): Command {
  if (size == null || !Number.isFinite(size) || size <= 0) return setAttrMark('fontSize', null);
  return setAttrMark('fontSize', { size });
}

export function setTextColor(color: string | null): Command {
  if (!color) return setAttrMark('textColor', null);
  return setAttrMark('textColor', { color });
}

export function setBgColor(color: string | null): Command {
  if (!color) return setAttrMark('bgColor', null);
  return setAttrMark('bgColor', { color });
}

export function setFontFace(face: string | null, faceIdx: number | null = null): Command {
  if (!face) return setAttrMark('fontFace', null);
  return setAttrMark('fontFace', { face, faceIdx: faceIdx ?? 0 });
}

export function getCurrentFontSize(state: EditorState): number | null {
  return readAttr(state, 'fontSize', (m) => {
    const size = Number(m.attrs['size']);
    return Number.isFinite(size) ? size : null;
  });
}

export function getCurrentTextColor(state: EditorState): string | null {
  return readAttr(state, 'textColor', (m) => String(m.attrs['color'] ?? '') || null);
}

export function getCurrentBgColor(state: EditorState): string | null {
  return readAttr(state, 'bgColor', (m) => String(m.attrs['color'] ?? '') || null);
}

export function getCurrentFontFace(state: EditorState): { face: string; faceIdx: number } | null {
  return readAttr(state, 'fontFace', (m) => {
    const face = String(m.attrs['face'] ?? '');
    if (!face) return null;
    return { face, faceIdx: Number(m.attrs['faceIdx'] ?? 0) };
  });
}

function readAttr<T>(
  state: EditorState,
  name: AttrMarkName,
  pick: (mark: import('prosemirror-model').Mark) => T | null,
): T | null {
  const type = types[name];
  const { from, to, empty, $from } = state.selection;
  const marks = empty ? (state.storedMarks ?? $from.marks()) : null;
  if (marks) {
    const m = type.isInSet(marks);
    return m ? pick(m) : null;
  }
  let result: T | null = null;
  state.doc.nodesBetween(from, to, (node) => {
    if (!node.isText) return true;
    const m = type.isInSet(node.marks);
    if (m) {
      const picked = pick(m);
      if (picked !== null) result = picked;
    }
    return true;
  });
  return result;
}
