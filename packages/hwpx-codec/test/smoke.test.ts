import { describe, it, expect } from 'vitest';
import { HWPX_MIMETYPE } from '../src/zip/index.js';
import { HwpxParseError, readHwpx } from '../src/index.js';

describe('hwpx-codec scaffold', () => {
  it('exports the correct mimetype constant', () => {
    expect(HWPX_MIMETYPE).toBe('application/hwp+zip');
  });

  it('reader rejects empty input', async () => {
    await expect(readHwpx(new Uint8Array())).rejects.toBeInstanceOf(HwpxParseError);
  });
});
