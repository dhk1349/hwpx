import type { EditorController } from './Editor.js';
import { useEditorObservable } from './useEditorObservable.js';

export interface StatusBarProps {
  controller: EditorController | null;
}

const EMPTY = { chars: 0, words: 0, paragraphs: 0 };

export function StatusBar({ controller }: StatusBarProps) {
  const chars = useEditorObservable(controller, (c) => c.getDocStats().chars, EMPTY.chars);
  const words = useEditorObservable(controller, (c) => c.getDocStats().words, EMPTY.words);
  const paragraphs = useEditorObservable(
    controller,
    (c) => c.getDocStats().paragraphs,
    EMPTY.paragraphs,
  );
  return (
    <div className="hwpx-statusbar" role="status">
      <span>문자 {chars.toLocaleString()}</span>
      <span>단어 {words.toLocaleString()}</span>
      <span>문단 {paragraphs.toLocaleString()}</span>
    </div>
  );
}
