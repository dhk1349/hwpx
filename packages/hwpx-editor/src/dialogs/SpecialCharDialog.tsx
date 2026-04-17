import { useState } from 'react';

export interface SpecialCharDialogProps {
  onPick: (ch: string) => void;
  onClose: () => void;
}

const CATEGORIES: ReadonlyArray<{ id: string; label: string; chars: readonly string[] }> = [
  {
    id: 'punct',
    label: '부호',
    chars: [
      '「', '」', '『', '』', '《', '》', '〈', '〉', '【', '】', '〔', '〕',
      '‘', '’', '“', '”', '·', '…', '—', '–', '・', '※', '◆', '◇', '○', '●',
      '□', '■', '△', '▲', '▽', '▼', '☆', '★', '♠', '♣', '♥', '♦',
    ],
  },
  {
    id: 'math',
    label: '수학',
    chars: [
      '±', '×', '÷', '≠', '≈', '≤', '≥', '∞', '∑', '∏', '√', '∫', '∂',
      '∈', '∉', '⊂', '⊃', '∩', '∪', '∠', '°', '′', '″', 'π', 'µ', 'Δ', 'Σ',
      '∧', '∨', '¬', '→', '←', '↑', '↓', '↔',
    ],
  },
  {
    id: 'currency',
    label: '통화',
    chars: ['₩', '$', '€', '£', '¥', '₹', '¢', '₽', '₪', '฿'],
  },
  {
    id: 'greek',
    label: '그리스',
    chars: [
      'α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ', 'ι', 'κ', 'λ', 'μ', 'ν', 'ξ',
      'ο', 'π', 'ρ', 'σ', 'τ', 'υ', 'φ', 'χ', 'ψ', 'ω',
      'Α', 'Β', 'Γ', 'Δ', 'Ε', 'Ζ', 'Η', 'Θ', 'Ι', 'Κ', 'Λ', 'Μ', 'Ν', 'Ξ',
      'Ο', 'Π', 'Ρ', 'Σ', 'Τ', 'Υ', 'Φ', 'Χ', 'Ψ', 'Ω',
    ],
  },
  {
    id: 'circled',
    label: '기타',
    chars: [
      '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩',
      '㉠', '㉡', '㉢', '㉣', '㉤', '㉥', '㉦', '㉧', '㉨', '㉩',
      'ⓐ', 'ⓑ', 'ⓒ', 'ⓓ', 'ⓔ', '㈜', '℡', '№', '℃', '℉', '㎏', '㎎', '㎡', '㎥',
      '✓', '✗', '♪', '♫', '☀', '☁', '☂', '☃',
    ],
  },
];

export function SpecialCharDialog({ onPick, onClose }: SpecialCharDialogProps) {
  const [cat, setCat] = useState<string>(CATEGORIES[0]!.id);
  const current = CATEGORIES.find((c) => c.id === cat) ?? CATEGORIES[0]!;

  return (
    <div className="hwpx-modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="hwpx-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ minWidth: '32rem' }}
      >
        <h3>특수 문자</h3>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className="hwpx-toolbar-btn"
              data-active={cat === c.id ? 'true' : 'false'}
              onClick={() => setCat(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(12, 1fr)',
            gap: '0.2rem',
            maxHeight: '20rem',
            overflow: 'auto',
            padding: '0.25rem',
            border: '1px solid var(--hwpx-border)',
            borderRadius: 4,
          }}
        >
          {current.chars.map((ch) => (
            <button
              key={ch}
              type="button"
              className="hwpx-toolbar-btn"
              onClick={() => {
                onPick(ch);
                onClose();
              }}
              title={`U+${ch.codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0')}`}
              style={{
                fontSize: '1.1rem',
                lineHeight: 1.6,
                textAlign: 'center',
                aspectRatio: '1',
              }}
            >
              {ch}
            </button>
          ))}
        </div>
        <div className="hwpx-form-actions">
          <button type="button" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
