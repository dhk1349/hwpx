import { useState } from 'react';

export interface HeaderFooterDialogProps {
  initial: { headerText: string; footerText: string };
  onApply: (next: { headerText: string; footerText: string }) => void;
  onClose: () => void;
}

export function HeaderFooterDialog({ initial, onApply, onClose }: HeaderFooterDialogProps) {
  const [headerText, setHeaderText] = useState(initial.headerText);
  const [footerText, setFooterText] = useState(initial.footerText);

  return (
    <div className="hwpx-modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="hwpx-modal" onClick={(e) => e.stopPropagation()}>
        <h3>머리말 / 꼬리말</h3>

        <div className="hwpx-form-row" style={{ alignItems: 'flex-start' }}>
          <label>머리말</label>
          <textarea
            rows={3}
            value={headerText}
            onChange={(e) => setHeaderText(e.target.value)}
            style={{
              flex: 1,
              resize: 'vertical',
              padding: '0.3rem 0.4rem',
              font: 'inherit',
            }}
          />
        </div>

        <div className="hwpx-form-row" style={{ alignItems: 'flex-start' }}>
          <label>꼬리말</label>
          <textarea
            rows={3}
            value={footerText}
            onChange={(e) => setFooterText(e.target.value)}
            style={{
              flex: 1,
              resize: 'vertical',
              padding: '0.3rem 0.4rem',
              font: 'inherit',
            }}
          />
        </div>

        <p className="hwpx-form-help">
          * 현재 버전은 단일 문단 평문만 저장합니다. 서식이 포함된 머리/꼬리말은 열릴 때 평문으로 변환됩니다.
        </p>

        <div className="hwpx-form-actions">
          <button type="button" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="hwpx-btn-primary"
            onClick={() => {
              onApply({ headerText, footerText });
              onClose();
            }}
          >
            적용
          </button>
        </div>
      </div>
    </div>
  );
}
