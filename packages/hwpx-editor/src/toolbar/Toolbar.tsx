import { useEffect, useState } from 'react';
import type { Style } from '@hwpx/codec';
import type { Align } from '../commands/align.js';
import type { FormatMark } from '../commands/marks.js';
import type {
  LineSpacingType,
  ParagraphPropsSnapshot,
} from '../commands/paragraphProps.js';
import type { ListType } from '../commands/lists.js';

export interface ToolbarProps {
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleMark: (name: FormatMark) => void;
  onSetAlign: (align: Align | null) => void;
  onSetStyle: (styleIDRef: string) => void;
  onInsertImage: () => void;
  onInsertTable: () => void;
  onSetFontSize: (size: number | null) => void;
  onSetTextColor: (color: string | null) => void;
  onSetBgColor: (color: string | null) => void;
  onSetFontFace: (face: string | null, faceIdx?: number | null) => void;
  onInsertHyperlink: () => void;
  onAddTableRow: () => void;
  onAddTableCol: () => void;
  onDeleteTableRow: () => void;
  onDeleteTableCol: () => void;
  onEditTableCell: () => void;
  onMergeTableCells: () => void;
  onSplitTableCell: () => void;
  onAdjustIndent: (deltaPt: number) => void;
  onSetLineSpacing: (value: number | null, type: LineSpacingType | null) => void;
  onSetParagraphSpaceBefore: (value: number | null) => void;
  onSetParagraphSpaceAfter: (value: number | null) => void;
  onToggleList: (type: ListType) => void;
  onShiftListLevel: (delta: 1 | -1) => void;
  onOpenPageSetup: () => void;
  onOpenHeaderFooter: () => void;
  onOpenStyles: () => void;
  onInsertFootnote: () => void;
  onInsertEndnote: () => void;
  onInsertBookmark: () => void;
  onInsertComment: () => void;
  onFormatPainter: () => void;
  onOpenSpecialChar: () => void;
  onOpenHanja: () => void;
  onToggleSpellcheck: () => void;
  formatPainterArmed: boolean;
  spellcheckOn: boolean;
  onResizeImage: (opts: { width?: number; height?: number }) => void;
  onSetImageAlt: () => void;
  currentListType: ListType | null;
  selectedTable: { rowCnt: number; colCnt: number } | null;
  selectedImage: { width: number; height: number; alt: string } | null;
  activeMarks: Readonly<Record<FormatMark, boolean>>;
  currentAlign: Align | null;
  currentStyleIDRef: string | null;
  currentFontSize: number | null;
  currentTextColor: string | null;
  currentBgColor: string | null;
  currentFontFace: string | null;
  currentParaProps: ParagraphPropsSnapshot;
  styles: readonly Style[];
  fontFaces: readonly { face: string; faceIdx: number }[];
  filename: string;
  dirty: boolean;
  platform?: string;
  busy?: boolean;
}

const FONT_SIZE_PRESETS = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];

const LINE_SPACING_PRESETS: ReadonlyArray<{
  label: string;
  value: number | null;
  type: LineSpacingType | null;
}> = [
  { label: '줄 간격…', value: null, type: null },
  { label: '100%', value: 100, type: 'PERCENT' },
  { label: '115%', value: 115, type: 'PERCENT' },
  { label: '130%', value: 130, type: 'PERCENT' },
  { label: '150%', value: 150, type: 'PERCENT' },
  { label: '180%', value: 180, type: 'PERCENT' },
  { label: '200%', value: 200, type: 'PERCENT' },
];

function spacingKey(props: ParagraphPropsSnapshot): string {
  if (props.lineSpacingValue == null) return '';
  return `${props.lineSpacingValue}|${props.lineSpacingType ?? 'PERCENT'}`;
}

const ALIGN_LABELS: Record<Align | 'none', string> = {
  left: '⇤',
  center: '↔',
  right: '⇥',
  justify: '⇿',
  distribute: '≣',
  none: '∅',
};

/**
 * Phase 4 의 파일 메뉴 + Phase 5 의 포맷 / 정렬 / 스타일 컨트롤.
 * 포맷 버튼은 현재 선택의 활성 상태를 [data-active] 로 시각 표시한다.
 */
export function Toolbar(props: ToolbarProps) {
  const paraStyles = props.styles.filter((s) => s.type === 'PARA');
  return (
    <div className="hwpx-toolbar" role="toolbar" aria-label="HWPX editor toolbar">
      <ToolbarGroup>
        <ToolbarButton onClick={props.onOpen} disabled={props.busy} title="열기 (Ctrl+O)">
          열기
        </ToolbarButton>
        <ToolbarButton onClick={props.onSave} disabled={props.busy} title="저장 (Ctrl+S)">
          저장
        </ToolbarButton>
        <ToolbarButton onClick={props.onSaveAs} disabled={props.busy}>
          다른 이름으로 저장…
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup>
        <ToolbarButton onClick={props.onUndo} title="되돌리기 (Ctrl+Z)">
          ↶
        </ToolbarButton>
        <ToolbarButton onClick={props.onRedo} title="다시 실행 (Ctrl+Shift+Z)">
          ↷
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup>
        <MarkButton
          name="bold"
          active={props.activeMarks.bold}
          onClick={props.onToggleMark}
          label="B"
          title="굵게 (Ctrl+B)"
          style={{ fontWeight: 700 }}
        />
        <MarkButton
          name="italic"
          active={props.activeMarks.italic}
          onClick={props.onToggleMark}
          label="I"
          title="기울임 (Ctrl+I)"
          style={{ fontStyle: 'italic' }}
        />
        <MarkButton
          name="underline"
          active={props.activeMarks.underline}
          onClick={props.onToggleMark}
          label="U"
          title="밑줄 (Ctrl+U)"
          style={{ textDecoration: 'underline' }}
        />
        <MarkButton
          name="strike"
          active={props.activeMarks.strike}
          onClick={props.onToggleMark}
          label="S"
          title="취소선 (Ctrl+Shift+X)"
          style={{ textDecoration: 'line-through' }}
        />
        <MarkButton
          name="superscript"
          active={props.activeMarks.superscript}
          onClick={props.onToggleMark}
          label="X²"
          title="위첨자"
          style={{ fontSize: '0.85em' }}
        />
        <MarkButton
          name="subscript"
          active={props.activeMarks.subscript}
          onClick={props.onToggleMark}
          label="X₂"
          title="아래첨자"
          style={{ fontSize: '0.85em' }}
        />
        <ToolbarButton
          active={props.formatPainterArmed}
          onClick={props.onFormatPainter}
          title={
            props.formatPainterArmed
              ? '서식 적용 — 선택 영역에 복사된 서식을 입힌다'
              : '서식 복사 — 커서 위치의 글자 서식을 저장'
          }
        >
          🖌
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup>
        <AlignButton align="left" current={props.currentAlign} onClick={props.onSetAlign} />
        <AlignButton align="center" current={props.currentAlign} onClick={props.onSetAlign} />
        <AlignButton align="right" current={props.currentAlign} onClick={props.onSetAlign} />
        <AlignButton align="justify" current={props.currentAlign} onClick={props.onSetAlign} />
      </ToolbarGroup>

      <ToolbarGroup>
        <ToolbarButton
          onClick={() => props.onAdjustIndent(-10)}
          title="내어쓰기 (왼쪽 들여쓰기 감소)"
        >
          ⇤⟍
        </ToolbarButton>
        <ToolbarButton onClick={() => props.onAdjustIndent(10)} title="들여쓰기 (왼쪽 들여쓰기 증가)">
          ⟌⇥
        </ToolbarButton>
        <select
          className="hwpx-toolbar-select"
          aria-label="줄 간격"
          value={spacingKey(props.currentParaProps)}
          onChange={(e) => {
            const key = e.target.value;
            if (!key) {
              props.onSetLineSpacing(null, null);
              return;
            }
            const [v, t] = key.split('|');
            props.onSetLineSpacing(Number(v), (t as LineSpacingType) ?? 'PERCENT');
          }}
          title="줄 간격"
        >
          {LINE_SPACING_PRESETS.map((p) => (
            <option
              key={p.label}
              value={p.value == null ? '' : `${p.value}|${p.type ?? 'PERCENT'}`}
            >
              {p.label}
            </option>
          ))}
        </select>
        <ToolbarButton
          onClick={() => {
            const current = props.currentParaProps.marginPrev ?? 0;
            const before =
              globalThis.prompt?.('문단 위 여백(pt)', String(current / 100)) ?? null;
            if (before === null) return;
            const n = Number(before.trim());
            if (!Number.isFinite(n) || n < 0) return;
            props.onSetParagraphSpaceBefore(n === 0 ? null : Math.round(n * 100));
          }}
          title="문단 위 여백"
        >
          ↑pt
        </ToolbarButton>
        <ToolbarButton
          onClick={() => {
            const current = props.currentParaProps.marginNext ?? 0;
            const after =
              globalThis.prompt?.('문단 아래 여백(pt)', String(current / 100)) ?? null;
            if (after === null) return;
            const n = Number(after.trim());
            if (!Number.isFinite(n) || n < 0) return;
            props.onSetParagraphSpaceAfter(n === 0 ? null : Math.round(n * 100));
          }}
          title="문단 아래 여백"
        >
          ↓pt
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup>
        <ToolbarButton
          active={props.currentListType === 'bullet'}
          onClick={() => props.onToggleList('bullet')}
          title="글머리 기호 목록"
        >
          • 목록
        </ToolbarButton>
        <ToolbarButton
          active={props.currentListType === 'numbered'}
          onClick={() => props.onToggleList('numbered')}
          title="번호 매기기 목록"
        >
          1. 목록
        </ToolbarButton>
        <ToolbarButton
          onClick={() => props.onShiftListLevel(-1)}
          title="목록 수준 내리기"
          disabled={!props.currentListType}
        >
          ⇤≡
        </ToolbarButton>
        <ToolbarButton
          onClick={() => props.onShiftListLevel(1)}
          title="목록 수준 올리기"
          disabled={!props.currentListType}
        >
          ≡⇥
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup>
        <select
          className="hwpx-toolbar-select"
          aria-label="문단 스타일"
          value={props.currentStyleIDRef ?? ''}
          onChange={(e) => props.onSetStyle(e.target.value)}
        >
          <option value="">스타일 없음</option>
          {paraStyles.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </ToolbarGroup>

      <ToolbarGroup>
        <select
          className="hwpx-toolbar-select"
          aria-label="글꼴"
          value={props.currentFontFace ?? ''}
          onChange={(e) => {
            const face = e.target.value;
            const idx = props.fontFaces.find((f) => f.face === face)?.faceIdx ?? null;
            props.onSetFontFace(face || null, idx);
          }}
          title="글꼴"
        >
          <option value="">글꼴…</option>
          {props.fontFaces.map((f) => (
            <option key={`${f.face}-${f.faceIdx}`} value={f.face}>
              {f.face}
            </option>
          ))}
        </select>
        <select
          className="hwpx-toolbar-select"
          aria-label="글자 크기"
          value={props.currentFontSize ?? ''}
          onChange={(e) => {
            const v = e.target.value ? Number(e.target.value) : null;
            props.onSetFontSize(v);
          }}
          title="글자 크기 (pt)"
        >
          <option value="">크기</option>
          {FONT_SIZE_PRESETS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <ColorButton
          label="A"
          color={props.currentTextColor ?? '#000000'}
          title="글자색"
          onChange={(c) => props.onSetTextColor(c)}
          underline
        />
        <ColorButton
          label="🖍"
          color={props.currentBgColor ?? '#FFFF00'}
          title="형광펜 / 배경색"
          onChange={(c) => props.onSetBgColor(c)}
        />
      </ToolbarGroup>

      <ToolbarGroup>
        <ToolbarButton onClick={props.onInsertImage} title="그림 삽입">
          🖼️ 그림
        </ToolbarButton>
        <ToolbarButton onClick={props.onInsertTable} title="표 삽입">
          ⊞ 표
        </ToolbarButton>
        <ToolbarButton onClick={props.onInsertHyperlink} title="하이퍼링크 삽입/편집 (Ctrl+K)">
          🔗 링크
        </ToolbarButton>
        <ToolbarButton onClick={props.onOpenPageSetup} title="쪽 설정">
          📄 쪽
        </ToolbarButton>
        <ToolbarButton onClick={props.onOpenHeaderFooter} title="머리말/꼬리말">
          ═ 머리/꼬리
        </ToolbarButton>
        <ToolbarButton onClick={props.onInsertFootnote} title="각주 삽입">
          † 각주
        </ToolbarButton>
        <ToolbarButton onClick={props.onInsertEndnote} title="미주 삽입">
          ‡ 미주
        </ToolbarButton>
        <ToolbarButton onClick={props.onInsertBookmark} title="책갈피 삽입">
          ⚑ 책갈피
        </ToolbarButton>
        <ToolbarButton onClick={props.onInsertComment} title="메모 삽입">
          💬 메모
        </ToolbarButton>
        <ToolbarButton onClick={props.onOpenStyles} title="스타일 관리">
          🎨 스타일
        </ToolbarButton>
        <ToolbarButton onClick={props.onOpenSpecialChar} title="특수 문자 삽입">
          Ω 특수
        </ToolbarButton>
        <ToolbarButton onClick={props.onOpenHanja} title="한자 변환">
          漢 한자
        </ToolbarButton>
        <ToolbarButton
          active={props.spellcheckOn}
          onClick={props.onToggleSpellcheck}
          title={props.spellcheckOn ? '맞춤법 검사 끄기' : '맞춤법 검사 켜기'}
        >
          ✓ 맞춤법
        </ToolbarButton>
      </ToolbarGroup>

      {props.selectedTable ? (
        <ToolbarGroup>
          <span className="hwpx-toolbar-label" aria-live="polite">
            표 {props.selectedTable.rowCnt}×{props.selectedTable.colCnt}
          </span>
          <ToolbarButton onClick={props.onAddTableRow} title="아래에 행 추가">
            행+
          </ToolbarButton>
          <ToolbarButton
            onClick={props.onDeleteTableRow}
            title="마지막 행 삭제"
            disabled={props.selectedTable.rowCnt <= 1}
          >
            행−
          </ToolbarButton>
          <ToolbarButton onClick={props.onAddTableCol} title="오른쪽에 열 추가">
            열+
          </ToolbarButton>
          <ToolbarButton
            onClick={props.onDeleteTableCol}
            title="마지막 열 삭제"
            disabled={props.selectedTable.colCnt <= 1}
          >
            열−
          </ToolbarButton>
          <ToolbarButton onClick={props.onEditTableCell} title="셀 텍스트 편집">
            셀…
          </ToolbarButton>
          <ToolbarButton onClick={props.onMergeTableCells} title="셀 병합 (사각 영역)">
            ⊟ 병합
          </ToolbarButton>
          <ToolbarButton onClick={props.onSplitTableCell} title="셀 분할">
            ⊞ 분할
          </ToolbarButton>
        </ToolbarGroup>
      ) : null}

      {props.selectedImage ? (
        <ToolbarGroup>
          <span className="hwpx-toolbar-label" aria-live="polite">
            그림 {props.selectedImage.width}×{props.selectedImage.height}
          </span>
          <ImageSizeInput
            label="W"
            value={props.selectedImage.width}
            onCommit={(w) => props.onResizeImage({ width: w })}
            title="너비 (px). 비율 유지"
          />
          <ImageSizeInput
            label="H"
            value={props.selectedImage.height}
            onCommit={(h) => props.onResizeImage({ height: h })}
            title="높이 (px). 비율 유지"
          />
          <ToolbarButton
            onClick={() =>
              props.onResizeImage({
                width: Math.round(props.selectedImage!.width * 1.25),
              })
            }
            title="125% 확대"
          >
            ＋
          </ToolbarButton>
          <ToolbarButton
            onClick={() =>
              props.onResizeImage({
                width: Math.max(8, Math.round(props.selectedImage!.width * 0.8)),
              })
            }
            title="80% 축소"
          >
            －
          </ToolbarButton>
          <ToolbarButton onClick={props.onSetImageAlt} title="대체 텍스트(alt)">
            alt…
          </ToolbarButton>
        </ToolbarGroup>
      ) : null}

      <div className="hwpx-toolbar-flex" />
      <span className="hwpx-toolbar-filename" data-dirty={props.dirty}>
        {props.dirty ? '● ' : ''}
        {props.filename}
      </span>
      {props.platform ? <span className="hwpx-toolbar-platform">{props.platform}</span> : null}
    </div>
  );
}

function ToolbarGroup({ children }: { children: React.ReactNode }) {
  return <div className="hwpx-toolbar-group">{children}</div>;
}

interface ImageSizeInputProps {
  label: string;
  value: number;
  onCommit: (n: number) => void;
  title?: string;
}

function ImageSizeInput({ label, value, onCommit, title }: ImageSizeInputProps) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);
  const commit = () => {
    const n = Number.parseInt(draft, 10);
    if (Number.isFinite(n) && n > 0 && n !== value) onCommit(n);
    else setDraft(String(value));
  };
  return (
    <label className="hwpx-toolbar-numinput" title={title}>
      <span style={{ marginRight: '0.25rem' }}>{label}</span>
      <input
        type="number"
        min={1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
        style={{ width: '4.5rem' }}
      />
    </label>
  );
}

interface ToolbarButtonProps {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  active?: boolean;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

function ToolbarButton({ onClick, disabled, title, active, style, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className="hwpx-toolbar-btn"
      onMouseDown={(e) => e.preventDefault() /* 에디터 selection 보존 */}
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-active={active ? 'true' : undefined}
      style={style}
    >
      {children}
    </button>
  );
}

interface MarkButtonProps {
  name: FormatMark;
  active: boolean;
  onClick: (name: FormatMark) => void;
  label: string;
  title: string;
  style: React.CSSProperties;
}

function MarkButton({ name, active, onClick, label, title, style }: MarkButtonProps) {
  return (
    <ToolbarButton active={active} onClick={() => onClick(name)} title={title} style={style}>
      {label}
    </ToolbarButton>
  );
}

interface AlignButtonProps {
  align: Align;
  current: Align | null;
  onClick: (align: Align | null) => void;
}

function AlignButton({ align, current, onClick }: AlignButtonProps) {
  const active = current === align;
  return (
    <ToolbarButton
      active={active}
      onClick={() => onClick(active ? null : align)}
      title={`정렬: ${align}`}
    >
      {ALIGN_LABELS[align]}
    </ToolbarButton>
  );
}

interface ColorButtonProps {
  label: string;
  color: string;
  title: string;
  onChange: (color: string | null) => void;
  underline?: boolean;
}

function ColorButton({ label, color, title, onChange, underline }: ColorButtonProps) {
  return (
    <label
      className="hwpx-toolbar-btn hwpx-toolbar-color"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      style={
        underline
          ? { borderBottom: `3px solid ${color}`, paddingBottom: 0 }
          : { background: color, color: contrastFor(color) }
      }
    >
      <span aria-hidden>{label}</span>
      <input
        type="color"
        value={normalizeHex(color)}
        onChange={(e) => onChange(e.target.value)}
        aria-label={title}
        style={{
          opacity: 0,
          position: 'absolute',
          width: 1,
          height: 1,
          pointerEvents: 'none',
        }}
      />
    </label>
  );
}

function normalizeHex(c: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c;
  return '#000000';
}

function contrastFor(hex: string): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return 'inherit';
  const n = Number.parseInt(m[1]!, 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? '#000' : '#fff';
}
