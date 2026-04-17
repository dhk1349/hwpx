import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { HwpxParseError, readHwpx } from '../src/index.js';
import { buildMinimalHwpx } from './fixtures.js';

describe('readHwpx — minimal synthetic fixture', () => {
  it('parses the minimal fixture end-to-end', async () => {
    const bytes = await buildMinimalHwpx();
    const doc = await readHwpx(bytes);

    expect(doc.version.major).toBe(5);
    expect(doc.version.targetApplication).toBe('WORDPROC');
    expect(doc.metadata.title).toBe('Minimal HWPX');
    expect(doc.metadata.creator).toBe('Test');
    expect(doc.metadata.language).toBe('ko-KR');
  });

  it('extracts header refLists', async () => {
    const doc = await readHwpx(await buildMinimalHwpx());
    expect(doc.header.beginNum.page).toBe(1);
    expect(doc.header.fontFaces).toHaveLength(1);
    expect(doc.header.fontFaces[0]?.name).toBe('함초롬바탕');
    expect(doc.header.charProps.get('0')?.height).toBe(1000);
    expect(doc.header.charProps.get('1')?.bold).toBe(true);
    expect(doc.header.paraProps.get('0')?.align).toBe('left');
    expect(doc.header.styles.get('0')?.name).toBe('바탕글');
  });

  it('parses sections, paragraphs, runs, and text', async () => {
    const doc = await readHwpx(await buildMinimalHwpx());
    expect(doc.sections).toHaveLength(1);
    const sec = doc.sections[0]!;
    expect(sec.body).toHaveLength(2);

    const [p0, p1] = sec.body;
    expect(p0!.runs[0]?.inlines[0]).toEqual({ kind: 'text', value: '안녕하세요' });
    expect(p1!.runs[0]?.charPrIDRef).toBe('1');
    expect(p1!.runs[0]?.inlines[0]).toEqual({ kind: 'text', value: 'Bold 텍스트' });
  });

  it('preserves settings.xml opaquely', async () => {
    const doc = await readHwpx(await buildMinimalHwpx());
    expect(doc.settings?.raw).toContain('HWPApplicationSetting');
  });

  it('works when version.xml is absent (defaults)', async () => {
    const bytes = await buildMinimalHwpx({ withVersion: false });
    const doc = await readHwpx(bytes);
    expect(doc.version).toEqual({ major: 0, minor: 0, micro: 0, build: 0 });
  });

  it('captures Preview/ entries in preserved bag', async () => {
    const bytes = await buildMinimalHwpx({ withPreview: true });
    const doc = await readHwpx(bytes);
    const preview = doc.preserved.nodes.get('Preview/PrvText.txt');
    expect(preview?.raw).toBe('Hello World');
  });
});

describe('readHwpx — real-world quirks', () => {
  async function buildQuirky(): Promise<Uint8Array> {
    const zip = new JSZip();
    zip.file('mimetype', 'application/hwp+zip', { compression: 'STORE' });
    zip.file(
      'META-INF/container.xml',
      `<?xml version="1.0"?><ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container"><ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/></ocf:rootfiles></ocf:container>`,
    );
    // Manifest hrefs are PACKAGE-ROOT-relative (not OPF-dir-relative). Spine
    // also lists the header item and a Scripts/.js item. Version uses an
    // alternate ns prefix (`hv:` instead of `ha:`).
    zip.file(
      'Contents/content.hpf',
      `<?xml version="1.0"?><opf:package xmlns:opf="http://www.idpf.org/2007/opf" version="1.0"><opf:metadata><opf:title>Quirky</opf:title></opf:metadata><opf:manifest><opf:item id="header" href="Contents/header.xml" media-type="application/xml"/><opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/><opf:item id="settings" href="settings.xml" media-type="application/xml"/><opf:item id="scripts" href="Scripts/x.js" media-type="application/x-javascript"/></opf:manifest><opf:spine><opf:itemref idref="header"/><opf:itemref idref="section0"/><opf:itemref idref="scripts"/></opf:spine></opf:package>`,
    );
    zip.file(
      'Contents/header.xml',
      `<?xml version="1.0"?><hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head"><hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/><hh:refList><hh:fontfaces/><hh:borderFills/><hh:charProperties/><hh:paraProperties/><hh:styles/><hh:bullets/><hh:numberings/></hh:refList></hh:head>`,
    );
    zip.file(
      'Contents/section0.xml',
      `<?xml version="1.0"?><hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"><hp:p id="0" paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0"><hp:t>hi</hp:t></hp:run></hp:p></hs:sec>`,
    );
    zip.file('settings.xml', `<?xml version="1.0"?><ha:s xmlns:ha="http://x"/>`);
    zip.file('Scripts/x.js', '// js');
    zip.file(
      'version.xml',
      `<?xml version="1.0"?><hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" major="5" minor="1" micro="0" buildNumber="0"/>`,
    );
    return zip.generateAsync({ type: 'uint8array' });
  }

  it('opens a file with package-root manifest hrefs and noisy spine', async () => {
    const doc = await readHwpx(await buildQuirky());
    expect(doc.metadata.title).toBe('Quirky');
    expect(doc.sections).toHaveLength(1);
    expect(doc.version.major).toBe(5);
  });
});

describe('readHwpx — failure modes', () => {
  it('rejects a non-ZIP payload', async () => {
    await expect(readHwpx(new TextEncoder().encode('not a zip'))).rejects.toBeInstanceOf(
      HwpxParseError,
    );
  });

  it('rejects a ZIP missing mimetype', async () => {
    const zip = new JSZip();
    zip.file('foo', 'bar');
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    await expect(readHwpx(bytes)).rejects.toThrow(/mimetype/);
  });

  it('rejects wrong mimetype content', async () => {
    const zip = new JSZip();
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    await expect(readHwpx(bytes)).rejects.toThrow(/Unexpected mimetype/);
  });
});
