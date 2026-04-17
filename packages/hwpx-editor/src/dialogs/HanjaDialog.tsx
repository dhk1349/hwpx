import { useMemo, useState } from 'react';
import { candidatesForSyllable } from '../commands/hanja.js';

export interface HanjaDialogProps {
  /** 변환 대상 한글 음절. 빈 문자열이면 dialog 는 수동 입력 안내 표시. */
  initialSyllable: string;
  onReplace: (hanja: string) => void;
  onClose: () => void;
}

export function HanjaDialog({ initialSyllable, onReplace, onClose }: HanjaDialogProps) {
  const [syllable, setSyllable] = useState<string>(initialSyllable);

  const candidates = useMemo(() => {
    const first = [...syllable][0] ?? '';
    return candidatesForSyllable(first);
  }, [syllable]);

  return (
    <div className="hwpx-modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="hwpx-modal" onClick={(e) => e.stopPropagation()}>
        <h3>한자 변환</h3>
        <div className="hwpx-form-row">
          <label>한글</label>
          <input
            type="text"
            value={syllable}
            onChange={(e) => setSyllable(e.target.value)}
            maxLength={2}
            autoFocus
            style={{ flex: 1 }}
          />
        </div>
        {candidates.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(8, 1fr)',
              gap: '0.2rem',
              maxHeight: '16rem',
              overflow: 'auto',
              padding: '0.25rem',
              border: '1px solid var(--hwpx-border)',
              borderRadius: 4,
              marginTop: '0.5rem',
            }}
          >
            {candidates.map((c) => (
              <button
                key={c}
                type="button"
                className="hwpx-toolbar-btn"
                onClick={() => {
                  onReplace(c);
                  onClose();
                }}
                style={{ fontSize: '1.3rem', aspectRatio: '1', textAlign: 'center' }}
              >
                {c}
              </button>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: '0.85rem', opacity: 0.7, margin: '0.75rem 0' }}>
            사전에 등록된 한자가 없습니다. 다른 음절을 입력해 보세요.
          </p>
        )}
        <div className="hwpx-form-actions">
          <button type="button" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
