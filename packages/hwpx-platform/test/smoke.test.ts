import { describe, it, expect } from 'vitest';
import { MemoryAdapter } from '../src/adapters/memory.js';

describe('hwpx-platform — MemoryAdapter', () => {
  it('saves bytes and returns them via getLastSaved()', async () => {
    const adapter = new MemoryAdapter();
    const bytes = new Uint8Array([1, 2, 3]);

    await adapter.saveFile(bytes, { suggestedName: 'test.hwpx' });

    expect(adapter.getLastSaved()?.bytes).toEqual(bytes);
    expect(adapter.getLastSaved()?.opts.suggestedName).toBe('test.hwpx');
  });

  it('returns the file queued via setNextOpen()', async () => {
    const adapter = new MemoryAdapter();
    adapter.setNextOpen({ name: 'a.hwpx', bytes: new Uint8Array() });

    const file = await adapter.openFile();

    expect(file?.name).toBe('a.hwpx');
  });

  it('storage round-trips a value', async () => {
    const adapter = new MemoryAdapter();
    await adapter.storage.set('k', new Uint8Array([42]));
    expect(await adapter.storage.get('k')).toEqual(new Uint8Array([42]));
  });
});
