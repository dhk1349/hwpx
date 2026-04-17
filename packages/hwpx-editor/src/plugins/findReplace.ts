import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Transaction,
} from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';

export interface FindMatch {
  readonly from: number;
  readonly to: number;
}

export interface FindState {
  readonly query: string;
  readonly matches: readonly FindMatch[];
  readonly current: number;
}

const EMPTY: FindState = { query: '', matches: [], current: 0 };

export const findKey = new PluginKey<FindState>('hwpx-find');

export function findReplacePlugin(): Plugin<FindState> {
  return new Plugin<FindState>({
    key: findKey,
    state: {
      init: () => EMPTY,
      apply(tr, prev) {
        const meta = tr.getMeta(findKey) as Partial<FindState> | undefined;
        let next = prev;
        if (meta) {
          next = { ...prev, ...meta };
        }
        if (tr.docChanged && next.query) {
          const matches = scanDoc(tr.doc, next.query);
          const current = matches.length === 0 ? 0 : Math.min(next.current, matches.length - 1);
          next = { ...next, matches, current };
        }
        return next;
      },
    },
    props: {
      decorations(state) {
        const f = findKey.getState(state);
        if (!f || f.matches.length === 0) return DecorationSet.empty;
        return DecorationSet.create(
          state.doc,
          f.matches.map((m, i) =>
            Decoration.inline(m.from, m.to, {
              class: i === f.current ? 'hwpx-find-current' : 'hwpx-find-match',
            }),
          ),
        );
      },
    },
  });
}

export function getFindState(state: EditorState): FindState {
  return findKey.getState(state) ?? EMPTY;
}

export function setFindQuery(view: EditorView, query: string): void {
  const matches = scanDoc(view.state.doc, query);
  const meta: Partial<FindState> = { query, matches, current: 0 };
  view.dispatch(view.state.tr.setMeta(findKey, meta));
  if (matches.length > 0) {
    selectMatch(view, matches[0]!);
  }
}

export function findNext(view: EditorView, dir: 1 | -1 = 1): boolean {
  const f = getFindState(view.state);
  if (f.matches.length === 0) return false;
  const next = (f.current + dir + f.matches.length) % f.matches.length;
  const m = f.matches[next]!;
  const tr = view.state.tr.setMeta(findKey, { current: next });
  applySelection(tr, view.state, m);
  view.dispatch(tr.scrollIntoView());
  return true;
}

export function replaceCurrent(view: EditorView, replacement: string): boolean {
  const f = getFindState(view.state);
  if (f.matches.length === 0) return false;
  const m = f.matches[f.current]!;
  const tr = view.state.tr.replaceWith(
    m.from,
    m.to,
    replacement ? view.state.schema.text(replacement) : [],
  );
  view.dispatch(tr);
  // After replace, advance to next remaining match (re-scan via apply on docChanged).
  findNext(view, 1);
  return true;
}

export function replaceAll(view: EditorView, replacement: string): number {
  const f = getFindState(view.state);
  if (f.matches.length === 0) return 0;
  let tr = view.state.tr;
  for (let i = f.matches.length - 1; i >= 0; i--) {
    const m = f.matches[i]!;
    tr = tr.replaceWith(m.from, m.to, replacement ? view.state.schema.text(replacement) : []);
  }
  view.dispatch(tr);
  return f.matches.length;
}

function scanDoc(doc: PMNode, query: string): FindMatch[] {
  const out: FindMatch[] = [];
  if (!query) return out;
  const lower = query.toLowerCase();
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    const text = node.text ?? '';
    const lc = text.toLowerCase();
    let i = 0;
    while (true) {
      const found = lc.indexOf(lower, i);
      if (found < 0) break;
      out.push({ from: pos + found, to: pos + found + query.length });
      i = found + Math.max(query.length, 1);
    }
    return true;
  });
  return out;
}

function selectMatch(view: EditorView, m: FindMatch) {
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, m.from, m.to)).scrollIntoView(),
  );
}

function applySelection(tr: Transaction, state: EditorState, m: FindMatch): void {
  tr.setSelection(TextSelection.create(state.doc, m.from, m.to));
}
