import { useReducer, useState } from 'react';
import type { EditorController } from '../Editor.js';

export interface StylesDialogProps {
  controller: EditorController;
  currentStyleIDRef: string | null;
  onClose: () => void;
}

export function StylesDialog({ controller, currentStyleIDRef, onClose }: StylesDialogProps) {
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  const styles = controller.getAvailableStyles();
  const [selId, setSelId] = useState<string | null>(currentStyleIDRef);
  const initialName = currentStyleIDRef
    ? (styles.find((s) => s.id === currentStyleIDRef)?.name ?? '')
    : '';
  const [renameValue, setRenameValue] = useState<string>(initialName);
  const [newName, setNewName] = useState<string>('');

  const sorted = [...styles].sort((a, b) => {
    const an = Number.parseInt(a.id, 10);
    const bn = Number.parseInt(b.id, 10);
    if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
    return a.id.localeCompare(b.id);
  });
  const selected = selId ? (sorted.find((s) => s.id === selId) ?? null) : null;

  return (
    <div className="hwpx-modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="hwpx-modal" onClick={(e) => e.stopPropagation()}>
        <h3>스타일 관리</h3>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
          <div style={{ flex: '0 0 14rem' }}>
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                maxHeight: '20rem',
                overflow: 'auto',
                border: '1px solid var(--hwpx-border)',
                borderRadius: 4,
              }}
            >
              {sorted.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="hwpx-toolbar-btn"
                    data-active={selId === s.id ? 'true' : 'false'}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      borderRadius: 0,
                      border: 'none',
                      borderBottom: '1px solid var(--hwpx-border)',
                    }}
                    onClick={() => {
                      setSelId(s.id);
                      setRenameValue(s.name);
                    }}
                    title={`id=${s.id} · ${s.type}`}
                  >
                    {s.name}
                    <span style={{ marginLeft: 6, opacity: 0.55, fontSize: '0.75rem' }}>
                      {s.type}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div style={{ flex: 1, minWidth: '18rem' }}>
            {selected ? (
              <fieldset className="hwpx-form-fieldset">
                <legend>선택한 스타일</legend>
                <div className="hwpx-form-row">
                  <label>ID</label>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{selected.id}</span>
                </div>
                <div className="hwpx-form-row">
                  <label>유형</label>
                  <span>{selected.type}</span>
                </div>
                <div className="hwpx-form-row">
                  <label>이름</label>
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const name = renameValue.trim();
                      if (!name) return;
                      controller.renameStyle(selected.id, name);
                      refresh();
                    }}
                  >
                    이름 바꾸기
                  </button>
                </div>
                <div className="hwpx-form-row">
                  <button
                    type="button"
                    onClick={() => {
                      controller.setStyle(selected.id);
                      onClose();
                    }}
                  >
                    문단에 적용
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!globalThis.confirm(`"${selected.name}" 스타일을 삭제할까요?`)) return;
                      controller.deleteStyle(selected.id);
                      setSelId(null);
                      setRenameValue('');
                      refresh();
                    }}
                    style={{ color: '#b91d36' }}
                  >
                    삭제
                  </button>
                </div>
              </fieldset>
            ) : (
              <p style={{ opacity: 0.7, fontSize: '0.85rem' }}>
                왼쪽에서 스타일을 선택하거나 새로 만드세요.
              </p>
            )}

            <fieldset className="hwpx-form-fieldset">
              <legend>새 스타일</legend>
              <div className="hwpx-form-row">
                <label>이름</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="예: 본문 강조"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="hwpx-btn-primary"
                  onClick={() => {
                    const name = newName.trim();
                    if (!name) return;
                    const created = controller.createStyle({ name, basedOn: selId ?? undefined });
                    setNewName('');
                    setSelId(created.id);
                    setRenameValue(created.name);
                    refresh();
                  }}
                >
                  만들기
                </button>
              </div>
              <p style={{ fontSize: '0.75rem', opacity: 0.7, margin: '0.25rem 0 0 5rem' }}>
                {selId
                  ? '선택된 스타일의 글자/문단 속성을 기반으로 만듭니다.'
                  : '기본 속성으로 새 스타일을 만듭니다.'}
              </p>
            </fieldset>
          </div>
        </div>

        <div className="hwpx-form-actions">
          <button
            type="button"
            onClick={() => {
              controller.setStyle(null);
              onClose();
            }}
          >
            스타일 제거
          </button>
          <button type="button" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
