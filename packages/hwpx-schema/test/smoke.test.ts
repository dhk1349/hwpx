import { describe, it, expect } from 'vitest';
import { hwpxSchema } from '../src/schema.js';

describe('hwpx-schema scaffold', () => {
  it('schema exposes doc/section/page/paragraph nodes', () => {
    expect(hwpxSchema.nodes.doc).toBeDefined();
    expect(hwpxSchema.nodes.section).toBeDefined();
    expect(hwpxSchema.nodes.page).toBeDefined();
    expect(hwpxSchema.nodes.paragraph).toBeDefined();
  });

  it('creates a minimal doc with doc > section > page > paragraph', () => {
    const doc = hwpxSchema.node('doc', null, [
      hwpxSchema.node('section', null, [
        hwpxSchema.node('page', null, [hwpxSchema.node('paragraph', null, [])]),
      ]),
    ]);
    expect(doc.childCount).toBe(1);
    expect(doc.firstChild!.firstChild!.type.name).toBe('page');
  });
});
