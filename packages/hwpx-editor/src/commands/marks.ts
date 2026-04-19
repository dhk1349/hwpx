import { toggleMark } from 'prosemirror-commands';
import type { Command, EditorState } from 'prosemirror-state';
import type { MarkType } from 'prosemirror-model';
import { hwpxSchema } from '@hwpx/schema';

export type FormatMark = 'bold' | 'italic' | 'underline' | 'strike' | 'superscript' | 'subscript';

const markTypes: Record<FormatMark, MarkType> = {
  bold: hwpxSchema.marks['bold']!,
  italic: hwpxSchema.marks['italic']!,
  underline: hwpxSchema.marks['underline']!,
  strike: hwpxSchema.marks['strike']!,
  superscript: hwpxSchema.marks['superscript']!,
  subscript: hwpxSchema.marks['subscript']!,
};

export function toggleFormatMark(name: FormatMark): Command {
  return toggleMark(markTypes[name]);
}

export function isMarkActive(state: EditorState, name: FormatMark): boolean {
  const type = markTypes[name];
  const { from, $from, to, empty } = state.selection;
  if (empty) return Boolean(type.isInSet(state.storedMarks ?? $from.marks()));
  return state.doc.rangeHasMark(from, to, type);
}
