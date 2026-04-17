import { useCallback, useEffect, useRef, useState } from 'react';
import { readHwpx, writeHwpx, type HwpxDocument } from '@hwpx/codec';
import type { PlatformAdapter } from '@hwpx/platform';
import { Editor, type EditorController } from './Editor.js';
import { Toolbar } from './toolbar/Toolbar.js';
import { useEditorObservable } from './useEditorObservable.js';
import type { FormatMark } from './commands/marks.js';
import type { LineSpacingType, ParagraphPropsSnapshot } from './commands/paragraphProps.js';
import { FindReplacePanel } from './findReplace/Panel.js';
import { StatusBar } from './StatusBar.js';
import { DEFAULT_PAGE_PR, PageSetupDialog } from './dialogs/PageSetupDialog.js';
import { HeaderFooterDialog } from './dialogs/HeaderFooterDialog.js';
import { StylesDialog } from './dialogs/StylesDialog.js';
import { SpecialCharDialog } from './dialogs/SpecialCharDialog.js';
import { HanjaDialog } from './dialogs/HanjaDialog.js';
import type { FormatSnapshot } from './commands/formatPainter.js';
import { registerEmbeddedFonts } from './commands/embeddedFonts.js';

const EMPTY_PARA_PROPS: ParagraphPropsSnapshot = {
  indentLeft: null,
  indentRight: null,
  indentFirstLine: null,
  lineSpacingValue: null,
  lineSpacingType: null,
  marginPrev: null,
  marginNext: null,
};

export interface HwpxAppProps {
  platform: PlatformAdapter;
  initialDocument?: HwpxDocument | null;
  initialFilename?: string;
}

export function HwpxApp({
  platform,
  initialDocument = null,
  initialFilename = '새 문서.hwpx',
}: HwpxAppProps) {
  const editorRef = useRef<EditorController | null>(null);
  const [controller, setController] = useState<EditorController | null>(null);
  const [doc, setDoc] = useState<HwpxDocument | null>(initialDocument);
  const [handle, setHandle] = useState<unknown>(undefined);
  const [filename, setFilename] = useState<string>(initialFilename);
  const [dirty, setDirty] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showFind, setShowFind] = useState<boolean>(false);
  const [showPageSetup, setShowPageSetup] = useState<boolean>(false);
  const [showHeaderFooter, setShowHeaderFooter] = useState<boolean>(false);
  const [showStyles, setShowStyles] = useState<boolean>(false);
  const [showSpecialChar, setShowSpecialChar] = useState<boolean>(false);
  const [showHanja, setShowHanja] = useState<boolean>(false);
  const [hanjaInitial, setHanjaInitial] = useState<string>('');
  const [painterSnapshot, setPainterSnapshot] = useState<FormatSnapshot | null>(null);
  const [spellcheckOn, setSpellcheckOn] = useState<boolean>(false);

  // Editor mount 후 controller 를 노출하기 위해 ref + state 두 채널을 모두 사용한다.
  const setEditorRef = useCallback((c: EditorController | null) => {
    editorRef.current = c;
    setController(c);
  }, []);

  // 문서가 바뀔 때마다 임베딩 폰트를 @font-face 로 등록한다. 실패해도 본문은 폴백 체인으로 렌더.
  useEffect(() => {
    if (!doc) return;
    void registerEmbeddedFonts(doc);
  }, [doc]);

  // DEV: 자동화된 QA 에서 쓰이는 바이트 주입 훅. 프로덕션 빌드에서는 단순히
  // window 전역에 함수를 얹을 뿐이며, 호출하지 않으면 아무 동작도 하지 않는다.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    (window as unknown as { __hwpxLoadBytes?: unknown }).__hwpxLoadBytes = async (
      bytes: Uint8Array,
      name?: string,
    ) => {
      const parsed = await readHwpx(bytes);
      setDoc(parsed);
      setHandle(undefined);
      setFilename(name ?? 'dev-loaded.hwpx');
      setDirty(false);
      // DEV: 최근 파싱된 document 를 콘솔 디버그용으로 노출
      (window as unknown as { __hwpxDoc?: unknown }).__hwpxDoc = parsed;
      return true;
    };
    return () => {
      delete (window as unknown as { __hwpxLoadBytes?: unknown }).__hwpxLoadBytes;
      delete (window as unknown as { __hwpxDoc?: unknown }).__hwpxDoc;
    };
  }, []);

  const onOpen = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const f = await platform.openFile({ accept: ['.hwpx'] });
      if (!f) return;
      const parsed = await readHwpx(f.bytes);
      setDoc(parsed);
      setHandle(f.handle);
      setFilename(f.name);
      setDirty(false);
    } catch (e) {
      setError(formatErr(e));
    } finally {
      setBusy(false);
    }
  }, [platform]);

  const doSave = useCallback(
    async (mode: 'save' | 'saveAs') => {
      const current = editorRef.current?.getDocument();
      if (!current) return;
      setError(null);
      setBusy(true);
      try {
        const bytes = await writeHwpx(current);
        const result =
          mode === 'saveAs'
            ? await platform.saveAs(bytes, { suggestedName: filename })
            : await platform.saveFile(bytes, { suggestedName: filename, handle });
        if (!result) return;
        if (result.handle !== undefined) setHandle(result.handle);
        editorRef.current?.markSaved();
      } catch (e) {
        setError(formatErr(e));
      } finally {
        setBusy(false);
      }
    },
    [platform, filename, handle],
  );

  useEffect(() => {
    platform.setMenuHandlers?.({
      onOpen,
      onSave: () => void doSave('save'),
      onSaveAs: () => void doSave('saveAs'),
      onUndo: () => editorRef.current?.undo(),
      onRedo: () => editorRef.current?.redo(),
    });
  }, [platform, onOpen, doSave]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setShowFind(true);
      }
      if (e.key === 'Escape' && showFind) {
        e.preventDefault();
        setShowFind(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showFind]);

  useEffect(() => {
    const title = `${dirty ? '• ' : ''}${filename} — HWPX Editor`;
    platform.setWindowTitle?.(title);
    if (typeof globalThis.document !== 'undefined') {
      globalThis.document.title = title;
    }
  }, [platform, filename, dirty]);

  const bold = useEditorObservable(controller, (c) => c.isMarkActive('bold'), false);
  const italic = useEditorObservable(controller, (c) => c.isMarkActive('italic'), false);
  const underline = useEditorObservable(controller, (c) => c.isMarkActive('underline'), false);
  const strike = useEditorObservable(controller, (c) => c.isMarkActive('strike'), false);
  const superscript = useEditorObservable(
    controller,
    (c) => c.isMarkActive('superscript'),
    false,
  );
  const subscript = useEditorObservable(controller, (c) => c.isMarkActive('subscript'), false);
  const activeMarks: Readonly<Record<FormatMark, boolean>> = {
    bold,
    italic,
    underline,
    strike,
    superscript,
    subscript,
  };
  const currentAlign = useEditorObservable(controller, (c) => c.getCurrentAlign(), null);
  const currentStyleIDRef = useEditorObservable(controller, (c) => c.getCurrentStyleIDRef(), null);
  const currentFontSize = useEditorObservable(controller, (c) => c.getCurrentFontSize(), null);
  const currentTextColor = useEditorObservable(controller, (c) => c.getCurrentTextColor(), null);
  const currentBgColor = useEditorObservable(controller, (c) => c.getCurrentBgColor(), null);
  const currentFontFace = useEditorObservable(
    controller,
    (c) => c.getCurrentFontFace()?.face ?? null,
    null,
  );

  const onInsertImage = useCallback(async () => {
    const c = editorRef.current;
    if (!c) return;
    const file = await pickImageFile();
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const dim = await readImageDims(bytes, file.type);
    const { path, src } = c.addBinary(file.name, bytes);
    c.insertImage({ binaryRef: path, src, width: dim.width, height: dim.height });
  }, []);

  const onInsertTable = useCallback(() => {
    const c = editorRef.current;
    if (!c) return;
    const input = globalThis.prompt?.('표 크기 (행x열)', '3x3') ?? null;
    if (!input) return;
    const m = /^(\d+)\s*[xX×]\s*(\d+)$/.exec(input.trim());
    if (!m) return;
    const r = Number(m[1]);
    const cl = Number(m[2]);
    if (r > 0 && cl > 0) c.insertTable(r, cl);
  }, []);

  const onInsertHyperlink = useCallback(() => {
    const c = editorRef.current;
    if (!c) return;
    const url = globalThis.prompt?.('링크 URL (빈 값이면 제거)', 'https://') ?? null;
    if (url === null) return;
    c.setHyperlink(url || null);
  }, []);

  const selectedTable = useEditorObservable(controller, (c) => c.getSelectedTable(), null);
  const selectedImage = useEditorObservable(controller, (c) => c.getSelectedImage(), null);
  const currentParaProps = useEditorObservable(
    controller,
    (c) => c.getCurrentParagraphProps(),
    EMPTY_PARA_PROPS,
  );

  const onAdjustIndent = useCallback(
    (deltaPt: number) => editorRef.current?.adjustParagraphIndent(deltaPt),
    [],
  );
  const onSetLineSpacing = useCallback(
    (value: number | null, type: LineSpacingType | null) => {
      editorRef.current?.setParagraphProps({
        lineSpacingValue: value,
        lineSpacingType: type,
      });
    },
    [],
  );
  const onSetParagraphSpaceBefore = useCallback((value: number | null) => {
    editorRef.current?.setParagraphProps({ marginPrev: value });
  }, []);
  const onSetParagraphSpaceAfter = useCallback((value: number | null) => {
    editorRef.current?.setParagraphProps({ marginNext: value });
  }, []);

  const currentListType = useEditorObservable(controller, (c) => c.getCurrentListType(), null);
  const onOpenPageSetup = useCallback(() => setShowPageSetup(true), []);
  const onOpenHeaderFooter = useCallback(() => setShowHeaderFooter(true), []);
  const onOpenStyles = useCallback(() => setShowStyles(true), []);
  const onOpenSpecialChar = useCallback(() => setShowSpecialChar(true), []);
  const onOpenHanja = useCallback(() => {
    const c = editorRef.current;
    setHanjaInitial(c?.getPrecedingChar() ?? '');
    setShowHanja(true);
  }, []);
  const onFormatPainter = useCallback(() => {
    const c = editorRef.current;
    if (!c) return;
    if (painterSnapshot === null) {
      const snap = c.captureFormatSnapshot();
      setPainterSnapshot(snap);
      return;
    }
    c.applyFormatSnapshot(painterSnapshot);
    setPainterSnapshot(null);
  }, [painterSnapshot]);
  const onToggleSpellcheck = useCallback(() => {
    const next = !spellcheckOn;
    setSpellcheckOn(next);
    editorRef.current?.setSpellcheck(next);
  }, [spellcheckOn]);
  const onInsertFootnote = useCallback(() => {
    const t = globalThis.prompt?.('각주 내용') ?? '';
    if (!t.trim()) return;
    editorRef.current?.insertFootnote(t);
  }, []);
  const onInsertEndnote = useCallback(() => {
    const t = globalThis.prompt?.('미주 내용') ?? '';
    if (!t.trim()) return;
    editorRef.current?.insertEndnote(t);
  }, []);
  const onInsertBookmark = useCallback(() => {
    const name = globalThis.prompt?.('책갈피 이름') ?? '';
    if (!name.trim()) return;
    editorRef.current?.insertBookmark(name.trim());
  }, []);
  const onInsertComment = useCallback(() => {
    const text = globalThis.prompt?.('메모 내용') ?? '';
    if (!text.trim()) return;
    const author = globalThis.prompt?.('작성자(선택)') ?? '';
    editorRef.current?.insertComment(text, author.trim() || undefined);
  }, []);
  const onResizeImage = useCallback(
    (opts: { width?: number; height?: number }) => editorRef.current?.resizeSelectedImage(opts),
    [],
  );
  const onSetImageAlt = useCallback(() => {
    const c = editorRef.current;
    const cur = c?.getSelectedImage();
    if (!c || !cur) return;
    const next = globalThis.prompt?.('대체 텍스트 (alt)', cur.alt ?? '') ?? null;
    if (next === null) return;
    c.setSelectedImageAlt(next);
  }, []);
  const onToggleList = useCallback(
    (type: 'bullet' | 'numbered') => editorRef.current?.toggleList(type),
    [],
  );
  const onShiftListLevel = useCallback(
    (delta: 1 | -1) => editorRef.current?.shiftListLevel(delta),
    [],
  );

  const onAddTableRow = useCallback(() => editorRef.current?.addTableRow(), []);
  const onAddTableCol = useCallback(() => editorRef.current?.addTableCol(), []);
  const onDeleteTableRow = useCallback(() => editorRef.current?.deleteTableRow(), []);
  const onDeleteTableCol = useCallback(() => editorRef.current?.deleteTableCol(), []);
  const onMergeTableCells = useCallback(() => {
    const c = editorRef.current;
    const t = c?.getSelectedTable();
    if (!c || !t) return;
    const input =
      globalThis.prompt?.(`병합 영역 (r1,c1-r2,c2) 예: 1,1-2,3`, `1,1-${t.rowCnt},${t.colCnt}`) ??
      null;
    if (!input) return;
    const m = /^(\d+)\s*,\s*(\d+)\s*-\s*(\d+)\s*,\s*(\d+)$/.exec(input.trim());
    if (!m) return;
    c.mergeTableCells(Number(m[1]) - 1, Number(m[2]) - 1, Number(m[3]) - 1, Number(m[4]) - 1);
  }, []);

  const onSplitTableCell = useCallback(() => {
    const c = editorRef.current;
    const t = c?.getSelectedTable();
    if (!c || !t) return;
    const input = globalThis.prompt?.('분할할 셀 좌표 (행,열)', '1,1') ?? null;
    if (!input) return;
    const m = /^(\d+)\s*,\s*(\d+)$/.exec(input.trim());
    if (!m) return;
    c.splitTableCell(Number(m[1]) - 1, Number(m[2]) - 1);
  }, []);

  const onEditTableCell = useCallback(() => {
    const c = editorRef.current;
    const t = c?.getSelectedTable();
    if (!c || !t) return;
    const coord = globalThis.prompt?.(`셀 좌표 (행,열) — 1~${t.rowCnt}, 1~${t.colCnt}`, '1,1') ?? null;
    if (!coord) return;
    const m = /^(\d+)\s*,\s*(\d+)$/.exec(coord.trim());
    if (!m) return;
    const r = Number(m[1]) - 1;
    const cl = Number(m[2]) - 1;
    if (r < 0 || r >= t.rowCnt || cl < 0 || cl >= t.colCnt) return;
    const current = c.getTableCellText(r, cl);
    const next = globalThis.prompt?.(`(${r + 1},${cl + 1}) 셀 텍스트`, current) ?? null;
    if (next === null) return;
    c.setTableCellText(r, cl, next);
  }, []);

  return (
    <div className="hwpx-app">
      <Toolbar
        onOpen={onOpen}
        onSave={() => void doSave('save')}
        onSaveAs={() => void doSave('saveAs')}
        onUndo={() => editorRef.current?.undo()}
        onRedo={() => editorRef.current?.redo()}
        onToggleMark={(name) => editorRef.current?.toggleMark(name)}
        onSetAlign={(a) => editorRef.current?.setAlign(a)}
        onSetStyle={(id) => editorRef.current?.setStyle(id || null)}
        onInsertImage={onInsertImage}
        onInsertTable={onInsertTable}
        onSetFontSize={(s) => editorRef.current?.setFontSize(s)}
        onSetTextColor={(c) => editorRef.current?.setTextColor(c)}
        onSetBgColor={(c) => editorRef.current?.setBgColor(c)}
        onSetFontFace={(face, idx) => editorRef.current?.setFontFace(face, idx ?? null)}
        onInsertHyperlink={onInsertHyperlink}
        onAddTableRow={onAddTableRow}
        onAddTableCol={onAddTableCol}
        onDeleteTableRow={onDeleteTableRow}
        onDeleteTableCol={onDeleteTableCol}
        onEditTableCell={onEditTableCell}
        onMergeTableCells={onMergeTableCells}
        onSplitTableCell={onSplitTableCell}
        onAdjustIndent={onAdjustIndent}
        onSetLineSpacing={onSetLineSpacing}
        onSetParagraphSpaceBefore={onSetParagraphSpaceBefore}
        onSetParagraphSpaceAfter={onSetParagraphSpaceAfter}
        onToggleList={onToggleList}
        onShiftListLevel={onShiftListLevel}
        onOpenPageSetup={onOpenPageSetup}
        onOpenHeaderFooter={onOpenHeaderFooter}
        onOpenStyles={onOpenStyles}
        onInsertFootnote={onInsertFootnote}
        onInsertEndnote={onInsertEndnote}
        onInsertBookmark={onInsertBookmark}
        onInsertComment={onInsertComment}
        onFormatPainter={onFormatPainter}
        onOpenSpecialChar={onOpenSpecialChar}
        onOpenHanja={onOpenHanja}
        onToggleSpellcheck={onToggleSpellcheck}
        formatPainterArmed={painterSnapshot !== null}
        spellcheckOn={spellcheckOn}
        currentListType={currentListType}
        currentParaProps={currentParaProps}
        selectedTable={selectedTable}
        selectedImage={selectedImage}
        onResizeImage={onResizeImage}
        onSetImageAlt={onSetImageAlt}
        activeMarks={activeMarks}
        currentAlign={currentAlign}
        currentStyleIDRef={currentStyleIDRef}
        currentFontSize={currentFontSize}
        currentTextColor={currentTextColor}
        currentBgColor={currentBgColor}
        currentFontFace={currentFontFace}
        styles={controller?.getAvailableStyles() ?? []}
        fontFaces={controller?.getAvailableFontFaces() ?? []}
        filename={filename}
        dirty={dirty}
        platform={platform.name}
        busy={busy}
      />
      {error ? (
        <div className="hwpx-error" role="alert">
          {error}
          <button type="button" onClick={() => setError(null)} aria-label="dismiss">
            ✕
          </button>
        </div>
      ) : null}
      {showFind ? (
        <FindReplacePanel controller={controller} onClose={() => setShowFind(false)} />
      ) : null}
      {showPageSetup ? (
        <PageSetupDialog
          initial={editorRef.current?.getPagePr() ?? DEFAULT_PAGE_PR}
          onApply={(next) => editorRef.current?.setPagePr(next)}
          onClose={() => setShowPageSetup(false)}
        />
      ) : null}
      {showHeaderFooter ? (
        <HeaderFooterDialog
          initial={
            editorRef.current?.getHeaderFooter() ?? { headerText: '', footerText: '' }
          }
          onApply={(next) => editorRef.current?.setHeaderFooter(next)}
          onClose={() => setShowHeaderFooter(false)}
        />
      ) : null}
      {showStyles && controller ? (
        <StylesDialog
          controller={controller}
          currentStyleIDRef={currentStyleIDRef}
          onClose={() => setShowStyles(false)}
        />
      ) : null}
      {showSpecialChar ? (
        <SpecialCharDialog
          onPick={(ch) => editorRef.current?.insertText(ch)}
          onClose={() => setShowSpecialChar(false)}
        />
      ) : null}
      {showHanja ? (
        <HanjaDialog
          initialSyllable={hanjaInitial}
          onReplace={(hj) => editorRef.current?.replacePrecedingChar(hj)}
          onClose={() => setShowHanja(false)}
        />
      ) : null}
      <Editor ref={setEditorRef} document={doc} onDirtyChange={setDirty} />
      <StatusBar controller={controller} />
    </div>
  );
}

function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') return resolve(null);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

async function readImageDims(
  bytes: Uint8Array,
  mime: string,
): Promise<{ width: number; height: number }> {
  if (typeof Image === 'undefined' || typeof URL === 'undefined') {
    return { width: 0, height: 0 };
  }
  return new Promise((resolve) => {
    const blob = new Blob([bytes as BlobPart], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const dim = { width: img.naturalWidth, height: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(dim);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 0, height: 0 });
    };
    img.src = url;
  });
}

function formatErr(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  return String(e);
}
