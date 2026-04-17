import { useState } from 'react';
import type { PagePr } from '@hwpx/codec';

export interface PageSetupDialogProps {
  initial: PagePr;
  onApply: (next: PagePr) => void;
  onClose: () => void;
}

const DEFAULT_PAGEPR: PagePr = {
  width: 59528,
  height: 84189,
  landscape: false,
  marginLeft: 8504,
  marginRight: 8504,
  marginTop: 5668,
  marginBottom: 5668,
  marginHeader: 4252,
  marginFooter: 4252,
};

const PRESETS: ReadonlyArray<{ name: string; width: number; height: number }> = [
  { name: 'A4 (210×297mm)', width: 59528, height: 84189 },
  { name: 'A5 (148×210mm)', width: 41953, height: 59528 },
  { name: 'B5 (176×250mm)', width: 49890, height: 70866 },
  { name: 'Letter (8.5×11in)', width: 61200, height: 79200 },
  { name: 'Legal (8.5×14in)', width: 61200, height: 100800 },
];

export function PageSetupDialog({ initial, onApply, onClose }: PageSetupDialogProps) {
  const [pp, setPp] = useState<PagePr>(initial ?? DEFAULT_PAGEPR);

  const matchedPreset = PRESETS.find(
    (p) => Math.abs(p.width - pp.width) < 5 && Math.abs(p.height - pp.height) < 5,
  );

  return (
    <div className="hwpx-modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="hwpx-modal" onClick={(e) => e.stopPropagation()}>
        <h3>쪽 설정</h3>

        <div className="hwpx-form-row">
          <label>용지</label>
          <select
            value={matchedPreset?.name ?? ''}
            onChange={(e) => {
              const found = PRESETS.find((p) => p.name === e.target.value);
              if (found) setPp({ ...pp, width: found.width, height: found.height });
            }}
          >
            <option value="">사용자 정의</option>
            {PRESETS.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="hwpx-form-row">
          <label>너비 (1/100pt)</label>
          <input
            type="number"
            value={pp.width}
            onChange={(e) => setPp({ ...pp, width: Number(e.target.value) || 0 })}
          />
          <label>높이</label>
          <input
            type="number"
            value={pp.height}
            onChange={(e) => setPp({ ...pp, height: Number(e.target.value) || 0 })}
          />
        </div>

        <div className="hwpx-form-row">
          <label>방향</label>
          <label>
            <input
              type="radio"
              checked={!pp.landscape}
              onChange={() => setPp({ ...pp, landscape: false })}
            />
            세로
          </label>
          <label>
            <input
              type="radio"
              checked={pp.landscape}
              onChange={() => setPp({ ...pp, landscape: true })}
            />
            가로
          </label>
        </div>

        <fieldset className="hwpx-form-fieldset">
          <legend>여백 (1/100pt)</legend>
          <div className="hwpx-form-row">
            <label>왼쪽</label>
            <input
              type="number"
              value={pp.marginLeft}
              onChange={(e) => setPp({ ...pp, marginLeft: Number(e.target.value) || 0 })}
            />
            <label>오른쪽</label>
            <input
              type="number"
              value={pp.marginRight}
              onChange={(e) => setPp({ ...pp, marginRight: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="hwpx-form-row">
            <label>위</label>
            <input
              type="number"
              value={pp.marginTop}
              onChange={(e) => setPp({ ...pp, marginTop: Number(e.target.value) || 0 })}
            />
            <label>아래</label>
            <input
              type="number"
              value={pp.marginBottom}
              onChange={(e) => setPp({ ...pp, marginBottom: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="hwpx-form-row">
            <label>머리말</label>
            <input
              type="number"
              value={pp.marginHeader ?? 0}
              onChange={(e) =>
                setPp({ ...pp, marginHeader: Number(e.target.value) || 0 })
              }
            />
            <label>꼬리말</label>
            <input
              type="number"
              value={pp.marginFooter ?? 0}
              onChange={(e) =>
                setPp({ ...pp, marginFooter: Number(e.target.value) || 0 })
              }
            />
          </div>
        </fieldset>

        <div className="hwpx-form-actions">
          <button type="button" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="hwpx-btn-primary"
            onClick={() => {
              onApply(pp);
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

export const DEFAULT_PAGE_PR = DEFAULT_PAGEPR;
