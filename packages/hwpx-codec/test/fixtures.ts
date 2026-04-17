import JSZip from 'jszip';
import { HWPX_MIMETYPE } from '../src/zip/index.js';

/**
 * 합성 HWPX 최소 샘플. 실제 한컴오피스 샘플 확보 전까지 이 fixture 로 파서 회로를
 * 검증한다. 샘플 구조는 docs/research/02-hwpx-file-structure.md 를 따른다.
 */
export interface BuildOptions {
  readonly withVersion?: boolean;
  readonly withPreview?: boolean;
}

export async function buildMinimalHwpx(opts: BuildOptions = {}): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('mimetype', HWPX_MIMETYPE, { compression: 'STORE' });
  zip.file('META-INF/container.xml', CONTAINER_XML);
  zip.file('Contents/content.hpf', CONTENT_HPF);
  zip.file('Contents/header.xml', HEADER_XML);
  zip.file('Contents/section0.xml', SECTION_XML);
  zip.file('Contents/settings.xml', SETTINGS_XML);
  if (opts.withVersion !== false) {
    zip.file('version.xml', VERSION_XML);
  }
  if (opts.withPreview) {
    zip.file('Preview/PrvText.txt', 'Hello World');
  }
  return zip.generateAsync({ type: 'uint8array' });
}

const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container">
  <ocf:rootfiles>
    <ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/>
  </ocf:rootfiles>
</ocf:container>`;

const CONTENT_HPF = `<?xml version="1.0" encoding="UTF-8"?>
<opf:package xmlns:opf="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/" version="1.0">
  <opf:metadata>
    <dc:title>Minimal HWPX</dc:title>
    <dc:creator>Test</dc:creator>
    <dc:date>2026-04-17</dc:date>
    <dc:language>ko-KR</dc:language>
  </opf:metadata>
  <opf:manifest>
    <opf:item id="header" href="header.xml" media-type="application/xml"/>
    <opf:item id="section0" href="section0.xml" media-type="application/xml"/>
    <opf:item id="settings" href="settings.xml" media-type="application/xml"/>
  </opf:manifest>
  <opf:spine>
    <opf:itemref idref="section0"/>
  </opf:spine>
</opf:package>`;

const HEADER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head">
  <hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>
  <hh:refList>
    <hh:fontfaces>
      <hh:fontface lang="HANGUL">
        <hh:font name="함초롬바탕" type="TTF"/>
      </hh:fontface>
    </hh:fontfaces>
    <hh:borderFills>
      <hh:borderFill id="0"/>
    </hh:borderFills>
    <hh:charProperties>
      <hh:charPr id="0" height="1000" textColor="#000000"/>
      <hh:charPr id="1" height="1000">
        <hh:bold/>
      </hh:charPr>
    </hh:charProperties>
    <hh:paraProperties>
      <hh:paraPr id="0" align="LEFT"/>
    </hh:paraProperties>
    <hh:styles>
      <hh:style id="0" type="PARA" name="바탕글" paraPrIDRef="0" charPrIDRef="0"/>
    </hh:styles>
    <hh:bullets/>
    <hh:numberings/>
  </hh:refList>
</hh:head>`;

const SECTION_XML = `<?xml version="1.0" encoding="UTF-8"?>
<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">
  <hp:p id="0" paraPrIDRef="0" styleIDRef="0">
    <hp:run charPrIDRef="0">
      <hp:t>안녕하세요</hp:t>
    </hp:run>
  </hp:p>
  <hp:p id="1" paraPrIDRef="0" styleIDRef="0">
    <hp:run charPrIDRef="1">
      <hp:t>Bold 텍스트</hp:t>
    </hp:run>
  </hp:p>
</hs:sec>`;

const SETTINGS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app"/>`;

const VERSION_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ha:HCFVersion xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" targetApplication="WORDPROC" major="5" minor="1" micro="0" buildNumber="0" os="Windows"/>`;
