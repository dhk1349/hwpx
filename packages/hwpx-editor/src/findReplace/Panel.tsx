import { useEffect, useRef, useState } from 'react';
import type { EditorController } from '../Editor.js';
import { useEditorObservable } from '../useEditorObservable.js';

export interface FindReplacePanelProps {
  controller: EditorController | null;
  onClose: () => void;
}

/**
 * 찾기 / 바꾸기 패널. Enter 로 다음 매치, Cmd-Shift-Enter 로 이전 매치.
 * 닫으면 query 가 비워져 매치 하이라이트도 사라진다.
 */
export function FindReplacePanel({ controller, onClose }: FindReplacePanelProps) {
  const [find, setFind] = useState('');
  const [repl, setRepl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const total = useEditorObservable(controller, (c) => c.getFindCount(), 0);
  const current = useEditorObservable(controller, (c) => c.getFindCurrent(), 0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    controller?.setFindQuery(find);
    return () => controller?.setFindQuery('');
  }, [controller, find]);

  return (
    <div className="hwpx-find-panel" role="dialog" aria-label="찾기/바꾸기">
      <input
        ref={inputRef}
        type="text"
        placeholder="찾기"
        value={find}
        onChange={(e) => setFind(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          if (e.key === 'Enter') {
            e.preventDefault();
            controller?.findNext(e.shiftKey ? -1 : 1);
          }
        }}
      />
      <span className="hwpx-find-count" aria-label="매치 수">
        {total > 0 ? `${current + 1}/${total}` : '0/0'}
      </span>
      <button type="button" onClick={() => controller?.findNext(-1)} title="이전 (Shift+Enter)">
        ↑
      </button>
      <button type="button" onClick={() => controller?.findNext(1)} title="다음 (Enter)">
        ↓
      </button>
      <input
        type="text"
        placeholder="바꾸기"
        value={repl}
        onChange={(e) => setRepl(e.target.value)}
      />
      <button type="button" onClick={() => controller?.replaceCurrent(repl)}>
        바꾸기
      </button>
      <button type="button" onClick={() => controller?.replaceAll(repl)}>
        모두
      </button>
      <button type="button" onClick={onClose} aria-label="닫기">
        ✕
      </button>
    </div>
  );
}
