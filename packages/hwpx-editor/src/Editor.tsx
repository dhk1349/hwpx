import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { EditorState, type Command, type Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { fromProseMirror, hwpxSchema, toProseMirror } from '@hwpx/schema';
import type { HwpxDocument, PagePr, Style } from '@hwpx/codec';
import { emptyHwpxDocument } from './empty.js';
import { isMarkActive, toggleFormatMark, type FormatMark } from './commands/marks.js';
import {
  applyFormatSnapshot as applyFormatSnapshotCmd,
  captureFormatSnapshot as captureFormatSnapshotFn,
  type FormatSnapshot,
} from './commands/formatPainter.js';
import { getCurrentAlign, setAlign, type Align } from './commands/align.js';
import {
  createStyle as createStyleHelper,
  deleteStyle as deleteStyleHelper,
  getCurrentStyleIDRef,
  renameStyle as renameStyleHelper,
  setParagraphStyle,
} from './commands/styles.js';
import {
  insertImage as insertImageCmd,
  insertTable as insertTableCmd,
  insertFootnote as insertFootnoteCmd,
  insertEndnote as insertEndnoteCmd,
  insertBookmark as insertBookmarkCmd,
  insertComment as insertCommentCmd,
} from './commands/insert.js';
import {
  addCol as addColCmd,
  addRow as addRowCmd,
  deleteCol as deleteColCmd,
  deleteRow as deleteRowCmd,
  getCellText as getCellTextCmd,
  getSelectedTable,
  mergeCells as mergeCellsCmd,
  setCellText as setCellTextCmd,
  splitCell as splitCellCmd,
} from './commands/tableOps.js';
import {
  getSelectedImage,
  resizeSelectedImage as resizeSelectedImageCmd,
  setSelectedImageAlt as setSelectedImageAltCmd,
} from './commands/imageOps.js';
import {
  getCurrentBgColor,
  getCurrentFontFace,
  getCurrentFontSize,
  getCurrentTextColor,
  setBgColor as setBgColorCmd,
  setFontFace as setFontFaceCmd,
  setFontSize as setFontSizeCmd,
  setTextColor as setTextColorCmd,
} from './commands/attrMarks.js';
import {
  adjustIndent as adjustIndentCmd,
  getCurrentParagraphProps,
  patchParagraphProps,
  type ParagraphPropsSnapshot,
} from './commands/paragraphProps.js';
import {
  getCurrentListType,
  shiftListLevel as shiftListLevelCmd,
  toggleList as toggleListCmd,
  type ListType,
} from './commands/lists.js';
import {
  findNext as pmFindNext,
  findReplacePlugin,
  getFindState,
  replaceAll as pmReplaceAll,
  replaceCurrent as pmReplaceCurrent,
  setFindQuery as pmSetFindQuery,
} from './plugins/findReplace.js';

export interface EditorController {
  getDocument(): HwpxDocument;
  undo(): boolean;
  redo(): boolean;
  focus(): void;
  hasUnsavedChanges(): boolean;
  markSaved(): void;

  exec(command: Command): boolean;
  toggleMark(name: FormatMark): boolean;
  isMarkActive(name: FormatMark): boolean;
  setAlign(align: Align | null): boolean;
  getCurrentAlign(): Align | null;
  setStyle(styleIDRef: string | null): boolean;
  getCurrentStyleIDRef(): string | null;
  getAvailableStyles(): readonly Style[];
  /** 새 paragraph 스타일 생성. 반환: 생성된 style. */
  createStyle(opts: { name: string; type?: 'PARA' | 'CHAR'; basedOn?: string }): Style;
  /** 스타일 이름 변경. */
  renameStyle(id: string, name: string): boolean;
  /** 스타일 삭제. 참조하는 문단의 styleIDRef 는 자동으로 정리. */
  deleteStyle(id: string): boolean;

  /** 커서 위치의 글자 서식 스냅샷을 읽어 반환한다. 서식 복사용. */
  captureFormatSnapshot(): FormatSnapshot;
  /** 스냅샷을 현재 선택 영역에 적용한다. 선택이 비어 있으면 무시. */
  applyFormatSnapshot(snapshot: FormatSnapshot): boolean;

  /** 현재 커서 위치에 텍스트를 삽입. 특수 문자 등에 사용. */
  insertText(text: string): boolean;
  /** 현재 커서 바로 앞 한 글자를 주어진 문자열로 치환 (한자 변환용). */
  replacePrecedingChar(replacement: string): boolean;
  /** 커서 앞(있으면) 또는 선택 영역 첫 글자를 반환. 한자 변환 시 초기 음절. */
  getPrecedingChar(): string;
  /** contentEditable 의 spellcheck 속성을 토글. */
  setSpellcheck(on: boolean): void;

  setFontSize(size: number | null): boolean;
  setTextColor(color: string | null): boolean;
  setBgColor(color: string | null): boolean;
  setFontFace(face: string | null, faceIdx?: number | null): boolean;
  getCurrentFontSize(): number | null;
  getCurrentTextColor(): string | null;
  getCurrentBgColor(): string | null;
  getCurrentFontFace(): { face: string; faceIdx: number } | null;
  /** header.fontFaces 의 한글 폰트 목록(중복 제거된 name + idx). */
  getAvailableFontFaces(): readonly { face: string; faceIdx: number }[];

  /** 선택 영역에 링크 마크를 적용/해제. href=null 이면 제거. */
  setHyperlink(href: string | null): boolean;
  getCurrentHyperlink(): string | null;

  /**
   * 새 binary 를 문서에 등록한다. 반환되는 path 를 PictureInline.binaryRef 로 사용.
   * 표시용 src (보통 blob URL) 도 같이 보관한다.
   */
  addBinary(filename: string, bytes: Uint8Array): { path: string; src: string };
  insertImage(opts: { binaryRef: string; src?: string; width: number; height: number }): boolean;
  insertTable(rows: number, cols: number): boolean;
  insertFootnote(text: string): boolean;
  insertEndnote(text: string): boolean;
  insertBookmark(name: string): boolean;
  insertComment(text: string, author?: string): boolean;
  /** 문서 내 모든 책갈피의 (이름, 위치 라벨) 목록 — 네비게이션 UI 용. */
  listBookmarks(): { name: string }[];

  /** 선택된 이미지 정보. 이미지가 아닐 때 null. */
  getSelectedImage(): { width: number; height: number; alt: string } | null;
  /** 선택 이미지 크기 변경. width 만 주면 원래 비율 유지. */
  resizeSelectedImage(opts: { width?: number; height?: number }): boolean;
  /** 선택 이미지 alt 텍스트 설정. */
  setSelectedImageAlt(alt: string): boolean;

  /** 현재 NodeSelection 으로 선택된 표 정보. 표가 아닐 때 null. */
  getSelectedTable(): { rowCnt: number; colCnt: number } | null;
  addTableRow(rowIndex?: number): boolean;
  addTableCol(colIndex?: number): boolean;
  deleteTableRow(rowIndex?: number): boolean;
  deleteTableCol(colIndex?: number): boolean;
  setTableCellText(rowIndex: number, colIndex: number, text: string): boolean;
  getTableCellText(rowIndex: number, colIndex: number): string;
  mergeTableCells(r1: number, c1: number, r2: number, c2: number): boolean;
  splitTableCell(rowIndex: number, colIndex: number): boolean;

  /** 현재 문단의 서식(들여쓰기/줄간격/문단 여백) 스냅샷. */
  getCurrentParagraphProps(): ParagraphPropsSnapshot;
  /** 선택 문단들에 부분 패치 적용. */
  setParagraphProps(patch: Partial<ParagraphPropsSnapshot>): boolean;
  /** 들여쓰기 증감 (pt 단위). deltaPt < 0 이면 내어쓰기. */
  adjustParagraphIndent(deltaPt: number): boolean;

  /** 글머리(•) / 번호 목록 토글. */
  toggleList(type: ListType): boolean;
  /** 목록 수준 증감. delta=+1 들여쓰기, -1 내어쓰기. */
  shiftListLevel(delta: 1 | -1): boolean;
  getCurrentListType(): ListType | null;

  /** 첫 번째 섹션의 쪽 설정. 미설정이면 null. */
  getPagePr(): PagePr | null;
  /** 첫 번째 섹션의 쪽 설정을 업데이트. null 이면 제거. */
  setPagePr(next: PagePr | null): void;

  /** 첫 번째 섹션의 머리말/꼬리말 텍스트. */
  getHeaderFooter(): { headerText: string; footerText: string };
  setHeaderFooter(next: { headerText: string; footerText: string }): void;

  setFindQuery(query: string): void;
  findNext(direction?: 1 | -1): boolean;
  replaceCurrent(replacement: string): boolean;
  replaceAll(replacement: string): number;
  getFindCount(): number;
  getFindCurrent(): number;
  getFindQuery(): string;

  /** 문서 통계 (단어 수, 문자 수). 단어는 공백 기준. */
  getDocStats(): { chars: number; words: number; paragraphs: number };

  /** state/selection 변경 알림. cleanup 함수 반환. */
  subscribe(listener: () => void): () => void;
}

export interface EditorProps {
  document: HwpxDocument | null;
  onDirtyChange?: (dirty: boolean) => void;
}

export const Editor = forwardRef<EditorController, EditorProps>(function Editor(
  { document: doc, onDirtyChange },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const baseDocRef = useRef<HwpxDocument>(doc ?? emptyHwpxDocument());
  const binaryUrlsRef = useRef<Map<string, string>>(new Map());
  const dirtyRef = useRef<boolean>(false);
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;
  const listenersRef = useRef<Set<() => void>>(new Set());
  // useSyncExternalStore 의 getSnapshot 동일성을 위해 마지막 결과를 캐싱.
  const selectedTableCacheRef = useRef<{ rowCnt: number; colCnt: number } | null>(null);
  const selectedImageCacheRef = useRef<{ width: number; height: number; alt: string } | null>(null);
  const paraPropsCacheRef = useRef<ParagraphPropsSnapshot | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const baseDoc = doc ?? emptyHwpxDocument();
    baseDocRef.current = baseDoc;
    refreshBinaryUrls(baseDoc, binaryUrlsRef.current);
    const state = EditorState.create({
      schema: hwpxSchema,
      doc: toProseMirror(baseDoc, {
        // hp:pic@binaryItemIDRef 는 manifest ID 이므로 binaryMap 으로 path 변환 후 blob URL 조회.
        resolveBinarySrc: (ref) => {
          const direct = binaryUrlsRef.current.get(ref);
          if (direct) return direct;
          const path = baseDoc.binaryMap?.get(ref);
          return path ? binaryUrlsRef.current.get(path) : undefined;
        },
      }),
      plugins: [
        history(),
        findReplacePlugin(),
        keymap({
          'Mod-z': undo,
          'Mod-Shift-z': redo,
          'Mod-y': redo,
          'Mod-b': toggleFormatMark('bold'),
          'Mod-i': toggleFormatMark('italic'),
          'Mod-u': toggleFormatMark('underline'),
          'Mod-Shift-x': toggleFormatMark('strike'),
        }),
        keymap(baseKeymap),
      ],
    });
    const view = new EditorView(container, {
      state,
      dispatchTransaction(tr: Transaction) {
        const next = view.state.apply(tr);
        view.updateState(next);
        if (tr.docChanged && !dirtyRef.current) {
          dirtyRef.current = true;
          onDirtyChangeRef.current?.(true);
        }
        for (const l of listenersRef.current) l();
      },
    });
    viewRef.current = view;
    dirtyRef.current = false;
    onDirtyChangeRef.current?.(false);
    for (const l of listenersRef.current) l();
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [doc]);

  useEffect(() => {
    const urls = binaryUrlsRef.current;
    return () => {
      for (const url of urls.values()) {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      }
      urls.clear();
    };
  }, []);

  const markDirtyAndNotify = () => {
    if (!dirtyRef.current) {
      dirtyRef.current = true;
      onDirtyChangeRef.current?.(true);
    }
    for (const l of listenersRef.current) l();
  };

  useImperativeHandle(
    ref,
    (): EditorController => ({
      getDocument() {
        const view = viewRef.current;
        if (!view) return baseDocRef.current;
        return fromProseMirror(view.state.doc, baseDocRef.current);
      },
      undo() {
        const view = viewRef.current;
        if (!view) return false;
        return undo(view.state, view.dispatch);
      },
      redo() {
        const view = viewRef.current;
        if (!view) return false;
        return redo(view.state, view.dispatch);
      },
      focus() {
        viewRef.current?.focus();
      },
      hasUnsavedChanges() {
        return dirtyRef.current;
      },
      markSaved() {
        dirtyRef.current = false;
        onDirtyChangeRef.current?.(false);
      },
      exec(command: Command) {
        const view = viewRef.current;
        if (!view) return false;
        const ok = command(view.state, view.dispatch, view);
        if (ok) view.focus();
        return ok;
      },
      toggleMark(name: FormatMark) {
        return this.exec(toggleFormatMark(name));
      },
      isMarkActive(name: FormatMark) {
        const view = viewRef.current;
        if (!view) return false;
        return isMarkActive(view.state, name);
      },
      setAlign(align: Align | null) {
        return this.exec(setAlign(align));
      },
      getCurrentAlign() {
        const view = viewRef.current;
        if (!view) return null;
        return getCurrentAlign(view.state);
      },
      setStyle(styleIDRef: string | null) {
        return this.exec(setParagraphStyle(styleIDRef));
      },
      getCurrentStyleIDRef() {
        const view = viewRef.current;
        if (!view) return null;
        return getCurrentStyleIDRef(view.state);
      },
      getAvailableStyles() {
        return Array.from(baseDocRef.current.header.styles.values());
      },
      createStyle(opts) {
        const { doc: nextDoc, style } = createStyleHelper(baseDocRef.current, opts);
        baseDocRef.current = nextDoc;
        markDirtyAndNotify();
        return style;
      },
      renameStyle(id, name) {
        const next = renameStyleHelper(baseDocRef.current, id, name);
        if (!next) return false;
        baseDocRef.current = next;
        markDirtyAndNotify();
        return true;
      },
      deleteStyle(id) {
        const nextDoc = deleteStyleHelper(baseDocRef.current, id);
        if (!nextDoc) return false;
        baseDocRef.current = nextDoc;
        const view = viewRef.current;
        if (view) {
          let touched = false;
          const tr = view.state.tr;
          view.state.doc.descendants((node, pos) => {
            if (node.type.name !== 'paragraph') return true;
            if ((node.attrs['styleIDRef'] as string | null) !== id) return false;
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, styleIDRef: null });
            touched = true;
            return false;
          });
          if (touched) view.dispatch(tr);
        }
        markDirtyAndNotify();
        return true;
      },
      captureFormatSnapshot() {
        const view = viewRef.current;
        if (!view) return [];
        return captureFormatSnapshotFn(view.state);
      },
      applyFormatSnapshot(snapshot) {
        return this.exec(applyFormatSnapshotCmd(snapshot));
      },
      insertText(text) {
        const view = viewRef.current;
        if (!view || !text) return false;
        const tr = view.state.tr.insertText(text);
        view.dispatch(tr.scrollIntoView());
        view.focus();
        return true;
      },
      replacePrecedingChar(replacement) {
        const view = viewRef.current;
        if (!view || !replacement) return false;
        const { from, to, empty } = view.state.selection;
        const tr = view.state.tr;
        if (empty) {
          if (from === 0) return false;
          tr.replaceWith(from - 1, from, view.state.schema.text(replacement));
        } else {
          tr.replaceWith(from, to, view.state.schema.text(replacement));
        }
        view.dispatch(tr.scrollIntoView());
        view.focus();
        return true;
      },
      getPrecedingChar() {
        const view = viewRef.current;
        if (!view) return '';
        const { from, to, empty } = view.state.selection;
        if (!empty) {
          return view.state.doc.textBetween(from, to, '\n').slice(0, 1);
        }
        if (from === 0) return '';
        return view.state.doc.textBetween(from - 1, from, '\n');
      },
      setSpellcheck(on) {
        const view = viewRef.current;
        if (!view) return;
        view.dom.setAttribute('spellcheck', on ? 'true' : 'false');
      },
      setFontSize(size) {
        return this.exec(setFontSizeCmd(size));
      },
      setTextColor(color) {
        return this.exec(setTextColorCmd(color));
      },
      setBgColor(color) {
        return this.exec(setBgColorCmd(color));
      },
      setFontFace(face, faceIdx = null) {
        return this.exec(setFontFaceCmd(face, faceIdx ?? null));
      },
      getCurrentFontSize() {
        const view = viewRef.current;
        return view ? getCurrentFontSize(view.state) : null;
      },
      getCurrentTextColor() {
        const view = viewRef.current;
        return view ? getCurrentTextColor(view.state) : null;
      },
      getCurrentBgColor() {
        const view = viewRef.current;
        return view ? getCurrentBgColor(view.state) : null;
      },
      getCurrentFontFace() {
        const view = viewRef.current;
        return view ? getCurrentFontFace(view.state) : null;
      },
      getAvailableFontFaces() {
        const seen = new Set<string>();
        const out: { face: string; faceIdx: number }[] = [];
        baseDocRef.current.header.fontFaces.forEach((f, idx) => {
          if (!f.name || seen.has(f.name)) return;
          seen.add(f.name);
          out.push({ face: f.name, faceIdx: idx });
        });
        return out;
      },
      setHyperlink(href) {
        const view = viewRef.current;
        if (!view) return false;
        const type = hwpxSchema.marks['hyperlink']!;
        const { from, to, empty } = view.state.selection;
        if (empty) return false;
        const tr = view.state.tr;
        tr.removeMark(from, to, type);
        if (href) tr.addMark(from, to, type.create({ href }));
        view.dispatch(tr);
        view.focus();
        return true;
      },
      getCurrentHyperlink() {
        const view = viewRef.current;
        if (!view) return null;
        const type = hwpxSchema.marks['hyperlink']!;
        const { $from } = view.state.selection;
        const m = type.isInSet($from.marks());
        return m ? String(m.attrs['href'] ?? '') : null;
      },
      addBinary(filename: string, bytes: Uint8Array) {
        const ext = pickExtension(filename);
        const path = allocateBinaryPath(baseDocRef.current.binaries, ext);
        const newBinaries = new Map(baseDocRef.current.binaries);
        newBinaries.set(path, bytes);
        baseDocRef.current = { ...baseDocRef.current, binaries: newBinaries };
        const url = makeBlobUrl(bytes, ext);
        binaryUrlsRef.current.set(path, url);
        return { path, src: url };
      },
      insertImage(opts) {
        const src = opts.src ?? binaryUrlsRef.current.get(opts.binaryRef) ?? '';
        return this.exec(insertImageCmd({ ...opts, src }));
      },
      insertTable(rows: number, cols: number) {
        return this.exec(insertTableCmd(rows, cols));
      },
      insertFootnote(text: string) {
        return this.exec(insertFootnoteCmd(text));
      },
      insertEndnote(text: string) {
        return this.exec(insertEndnoteCmd(text));
      },
      insertBookmark(name: string) {
        return this.exec(insertBookmarkCmd(name));
      },
      insertComment(text: string, author?: string) {
        return this.exec(insertCommentCmd(text, author));
      },
      listBookmarks() {
        const view = viewRef.current;
        if (!view) return [];
        const out: { name: string }[] = [];
        view.state.doc.descendants((node) => {
          if (node.type.name === 'bookmark') {
            out.push({ name: String(node.attrs['name'] ?? '') });
          }
        });
        return out;
      },
      getSelectedTable() {
        const view = viewRef.current;
        const info = view ? getSelectedTable(view.state) : null;
        const prev = selectedTableCacheRef.current;
        if (!info) {
          if (prev !== null) selectedTableCacheRef.current = null;
          return selectedTableCacheRef.current;
        }
        if (prev && prev.rowCnt === info.rowCnt && prev.colCnt === info.colCnt) return prev;
        const next = { rowCnt: info.rowCnt, colCnt: info.colCnt };
        selectedTableCacheRef.current = next;
        return next;
      },
      getSelectedImage() {
        const view = viewRef.current;
        const info = view ? getSelectedImage(view.state) : null;
        const prev = selectedImageCacheRef.current;
        if (!info) {
          if (prev !== null) selectedImageCacheRef.current = null;
          return selectedImageCacheRef.current;
        }
        if (
          prev &&
          prev.width === info.width &&
          prev.height === info.height &&
          prev.alt === info.alt
        ) {
          return prev;
        }
        const next = { width: info.width, height: info.height, alt: info.alt };
        selectedImageCacheRef.current = next;
        return next;
      },
      resizeSelectedImage(opts) {
        return this.exec(resizeSelectedImageCmd(opts));
      },
      setSelectedImageAlt(alt) {
        return this.exec(setSelectedImageAltCmd(alt));
      },
      addTableRow(rowIndex) {
        return this.exec(addRowCmd(rowIndex));
      },
      addTableCol(colIndex) {
        return this.exec(addColCmd(colIndex));
      },
      deleteTableRow(rowIndex) {
        return this.exec(deleteRowCmd(rowIndex));
      },
      deleteTableCol(colIndex) {
        return this.exec(deleteColCmd(colIndex));
      },
      setTableCellText(rowIndex, colIndex, text) {
        return this.exec(setCellTextCmd(rowIndex, colIndex, text));
      },
      getTableCellText(rowIndex, colIndex) {
        const view = viewRef.current;
        if (!view) return '';
        return getCellTextCmd(view.state, rowIndex, colIndex);
      },
      mergeTableCells(r1, c1, r2, c2) {
        return this.exec(mergeCellsCmd(r1, c1, r2, c2));
      },
      splitTableCell(rowIndex, colIndex) {
        return this.exec(splitCellCmd(rowIndex, colIndex));
      },
      getCurrentParagraphProps() {
        const view = viewRef.current;
        const fallback: ParagraphPropsSnapshot = {
          indentLeft: null,
          indentRight: null,
          indentFirstLine: null,
          lineSpacingValue: null,
          lineSpacingType: null,
          marginPrev: null,
          marginNext: null,
        };
        const next = view ? getCurrentParagraphProps(view.state) : fallback;
        const prev = paraPropsCacheRef.current;
        if (
          prev &&
          prev.indentLeft === next.indentLeft &&
          prev.indentRight === next.indentRight &&
          prev.indentFirstLine === next.indentFirstLine &&
          prev.lineSpacingValue === next.lineSpacingValue &&
          prev.lineSpacingType === next.lineSpacingType &&
          prev.marginPrev === next.marginPrev &&
          prev.marginNext === next.marginNext
        ) {
          return prev;
        }
        paraPropsCacheRef.current = next;
        return next;
      },
      setParagraphProps(patch) {
        return this.exec(patchParagraphProps(patch));
      },
      adjustParagraphIndent(deltaPt) {
        return this.exec(adjustIndentCmd(deltaPt));
      },
      toggleList(type) {
        return this.exec(toggleListCmd(type));
      },
      shiftListLevel(delta) {
        return this.exec(shiftListLevelCmd(delta));
      },
      getCurrentListType() {
        const view = viewRef.current;
        return view ? getCurrentListType(view.state) : null;
      },
      getPagePr() {
        return baseDocRef.current.sections[0]?.pagePr ?? null;
      },
      setPagePr(next) {
        const base = baseDocRef.current;
        if (base.sections.length === 0) return;
        const updated = base.sections.map((sec, idx) => {
          if (idx !== 0) return sec;
          if (next === null) {
            const { pagePr: _drop, ...rest } = sec;
            return rest;
          }
          return { ...sec, pagePr: next };
        });
        baseDocRef.current = { ...base, sections: updated };
        if (!dirtyRef.current) {
          dirtyRef.current = true;
          onDirtyChangeRef.current?.(true);
        }
        for (const l of listenersRef.current) l();
      },
      getHeaderFooter() {
        const sec = baseDocRef.current.sections[0];
        return {
          headerText: sec?.headerText ?? '',
          footerText: sec?.footerText ?? '',
        };
      },
      setHeaderFooter(next) {
        const base = baseDocRef.current;
        if (base.sections.length === 0) return;
        const updated = base.sections.map((sec, idx) => {
          if (idx !== 0) return sec;
          const merged: typeof sec = { ...sec };
          if (next.headerText) merged.headerText = next.headerText;
          else delete merged.headerText;
          if (next.footerText) merged.footerText = next.footerText;
          else delete merged.footerText;
          return merged;
        });
        baseDocRef.current = { ...base, sections: updated };
        if (!dirtyRef.current) {
          dirtyRef.current = true;
          onDirtyChangeRef.current?.(true);
        }
        for (const l of listenersRef.current) l();
      },
      setFindQuery(query: string) {
        const view = viewRef.current;
        if (!view) return;
        pmSetFindQuery(view, query);
      },
      findNext(direction: 1 | -1 = 1) {
        const view = viewRef.current;
        if (!view) return false;
        return pmFindNext(view, direction);
      },
      replaceCurrent(replacement: string) {
        const view = viewRef.current;
        if (!view) return false;
        return pmReplaceCurrent(view, replacement);
      },
      replaceAll(replacement: string) {
        const view = viewRef.current;
        if (!view) return 0;
        return pmReplaceAll(view, replacement);
      },
      getFindCount() {
        const view = viewRef.current;
        if (!view) return 0;
        return getFindState(view.state).matches.length;
      },
      getFindCurrent() {
        const view = viewRef.current;
        if (!view) return 0;
        return getFindState(view.state).current;
      },
      getFindQuery() {
        const view = viewRef.current;
        if (!view) return '';
        return getFindState(view.state).query;
      },
      getDocStats() {
        const view = viewRef.current;
        if (!view) return { chars: 0, words: 0, paragraphs: 0 };
        let chars = 0;
        let paragraphs = 0;
        let text = '';
        view.state.doc.descendants((node) => {
          if (node.type.name === 'paragraph') paragraphs++;
          if (node.isText) {
            const t = node.text ?? '';
            chars += t.length;
            text += t + ' ';
          }
          return true;
        });
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        return { chars, words, paragraphs };
      },
      subscribe(listener: () => void) {
        listenersRef.current.add(listener);
        return () => {
          listenersRef.current.delete(listener);
        };
      },
    }),
    [],
  );

  return <div ref={containerRef} className="hwpx-editor" data-testid="hwpx-editor" />;
});

function refreshBinaryUrls(doc: HwpxDocument, urls: Map<string, string>) {
  for (const [path, bytes] of doc.binaries) {
    if (urls.has(path)) continue;
    urls.set(path, makeBlobUrl(bytes, pickExtension(path)));
  }
}

function makeBlobUrl(bytes: Uint8Array, ext: string): string {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return '';
  }
  const mime = mimeForExtension(ext);
  return URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
}

function pickExtension(filename: string): string {
  const m = /\.([a-zA-Z0-9]+)$/.exec(filename);
  return m ? m[1]!.toLowerCase() : 'bin';
}

function mimeForExtension(ext: string): string {
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'svg':
      return 'image/svg+xml';
    case 'bmp':
      return 'image/bmp';
    default:
      return 'application/octet-stream';
  }
}

function allocateBinaryPath(existing: ReadonlyMap<string, unknown>, ext: string): string {
  for (let n = existing.size + 1; n < existing.size + 10000; n++) {
    const path = `BinData/image${n}.${ext}`;
    if (!existing.has(path)) return path;
  }
  // 안전 fallback: 충돌 시 timestamp 사용.
  return `BinData/image${Date.now()}.${ext}`;
}
