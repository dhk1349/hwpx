// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createRef } from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryAdapter } from '@hwpx/platform/memory';
import { readHwpx, writeHwpx } from '@hwpx/codec';
import { Editor, type EditorController } from '../src/Editor.js';
import { HwpxApp } from '../src/HwpxApp.js';
import { emptyHwpxDocument } from '../src/empty.js';

describe('hwpx-editor — <Editor>', () => {
  it('mounts an editor div with empty document', () => {
    const { getByTestId } = render(<Editor document={null} />);
    const node = getByTestId('hwpx-editor');
    expect(node).toBeInstanceOf(HTMLElement);
    expect(node.querySelector('.ProseMirror')).not.toBeNull();
  });

  it('renders an existing HwpxDocument as PM content', () => {
    const ref = createRef<EditorController>();
    const doc = emptyHwpxDocument();
    const { getByTestId } = render(<Editor ref={ref} document={doc} />);
    const pm = getByTestId('hwpx-editor').querySelector('.ProseMirror');
    expect(pm).not.toBeNull();
    expect(ref.current).not.toBeNull();
    const back = ref.current!.getDocument();
    expect(back.sections).toHaveLength(1);
  });
});

describe('hwpx-editor — <HwpxApp>', () => {
  it('renders toolbar buttons', () => {
    const platform = new MemoryAdapter();
    const { getByText } = render(<HwpxApp platform={platform} />);
    expect(getByText('열기')).toBeInstanceOf(HTMLButtonElement);
    expect(getByText('저장')).toBeInstanceOf(HTMLButtonElement);
  });

  it('opens a file via adapter and round-trips through save', async () => {
    const platform = new MemoryAdapter();
    const sourceDoc = emptyHwpxDocument();
    const sourceBytes = await writeHwpx(sourceDoc);
    platform.setNextOpen({ name: 'sample.hwpx', bytes: sourceBytes });

    const { getByText } = render(<HwpxApp platform={platform} />);

    await act(async () => {
      fireEvent.click(getByText('열기'));
      await flushMicrotasks();
    });
    await waitFor(() => expect(document.title).toContain('sample.hwpx'));

    await act(async () => {
      fireEvent.click(getByText('저장'));
      await flushMicrotasks();
    });
    await waitFor(() => expect(platform.getLastSaved()).not.toBeNull());

    const saved = platform.getLastSaved()!;
    const reparsed = await readHwpx(saved.bytes);
    expect(reparsed.sections).toHaveLength(1);
    expect(reparsed.sections[0]!.body[0]!.runs).toBeDefined();
    expect(saved.opts.suggestedName).toBe('sample.hwpx');
  });
});

async function flushMicrotasks() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

describe('hwpx-editor — controller', () => {
  it('round-trips a doc through getDocument()', () => {
    const ref = createRef<EditorController>();
    const doc = emptyHwpxDocument();
    render(<Editor ref={ref} document={doc} />);
    const back = ref.current!.getDocument();
    expect(back.sections).toHaveLength(doc.sections.length);
    expect(back.binaries).toBe(doc.binaries);
  });
});
