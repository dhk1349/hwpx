import type { Mark, MarkType } from 'prosemirror-model';
import type { Command, EditorState } from 'prosemirror-state';
import { hwpxSchema } from '@hwpx/schema';

/**
 * 서식 복사(Format Painter). 현재 커서 위치의 charPr 관련 마크들을 스냅샷으로
 * 모아두고, 다른 선택 영역에 그대로 붙여 넣는다.
 *
 * 스냅샷에 포함하는 마크: bold, italic, underline, strike, superscript, subscript,
 * fontSize, textColor, bgColor, fontFace. (charPr 와 hyperlink 는 제외 — 링크는
 * 의미상 따로, charPr 는 ID 매핑이라 복사 시 의도와 다를 수 있음.)
 */
const PAINTER_MARK_NAMES = [
  'bold',
  'italic',
  'underline',
  'strike',
  'superscript',
  'subscript',
  'fontSize',
  'textColor',
  'bgColor',
  'fontFace',
] as const;

export type FormatSnapshot = readonly Mark[];

function painterMarkTypes(): MarkType[] {
  return PAINTER_MARK_NAMES.map((n) => hwpxSchema.marks[n]).filter((m): m is MarkType =>
    Boolean(m),
  );
}

export function captureFormatSnapshot(state: EditorState): FormatSnapshot {
  const { $from, empty } = state.selection;
  const source: readonly Mark[] = empty
    ? (state.storedMarks ?? $from.marks())
    : (state.doc.nodeAt($from.pos)?.marks ?? $from.marks());
  const wanted = new Set(PAINTER_MARK_NAMES as readonly string[]);
  return source.filter((m) => wanted.has(m.type.name));
}

export function applyFormatSnapshot(snapshot: FormatSnapshot): Command {
  const marks = snapshot;
  return (state, dispatch) => {
    const { from, to, empty } = state.selection;
    if (empty) return false;
    if (!dispatch) return true;
    let tr = state.tr;
    for (const type of painterMarkTypes()) {
      tr = tr.removeMark(from, to, type);
    }
    for (const m of marks) {
      tr = tr.addMark(from, to, m);
    }
    dispatch(tr.scrollIntoView());
    return true;
  };
}
