#!/usr/bin/env -S tsx
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import JSZip from 'jszip';
import { readHwpx, writeHwpx } from '@hwpx/codec';
import type { Inline } from '@hwpx/codec';

const cmd = process.argv[2];

const HELP = `hwpx-demo — Phase 1/2 codec exerciser

USAGE
  pnpm --filter @hwpx/demo inspect <file.hwpx>
      → 메타데이터, 섹션 수, 문단 텍스트, 보존 엔트리 출력
  pnpm --filter @hwpx/demo roundtrip <input.hwpx> <output.hwpx>
      → read → write → read 후 모델 동등성 확인 + output 저장
  pnpm --filter @hwpx/demo make-sample <output.hwpx>
      → 코드만으로 최소 HWPX 한 개 생성 (한컴오피스에서 열어볼 수 있는지 시험)
`;

async function main() {
  switch (cmd) {
    case 'inspect':
      await inspect(process.argv[3]);
      break;
    case 'roundtrip':
      await roundtrip(process.argv[3], process.argv[4]);
      break;
    case 'make-sample':
      await makeSample(process.argv[3]);
      break;
    default:
      process.stdout.write(HELP);
      process.exit(cmd ? 1 : 0);
  }
}

async function inspect(path: string | undefined) {
  if (!path) die('inspect <file.hwpx>');
  const bytes = await readFile(resolve(path));
  const doc = await readHwpx(new Uint8Array(bytes));

  console.log('# version');
  console.log(' ', doc.version);
  console.log('# metadata');
  console.log(' ', doc.metadata);
  console.log(`# sections (${doc.sections.length})`);
  doc.sections.forEach((sec, i) => {
    console.log(`  [${i}] ${sec.id} — ${sec.body.length} paragraphs`);
    sec.body.slice(0, 5).forEach((p, pi) => {
      const text = p.runs.map((r) => r.inlines.map(inlineSummary).join('')).join('');
      const preview = text.length > 60 ? text.slice(0, 60) + '…' : text;
      console.log(`     p${pi}: ${JSON.stringify(preview)}`);
    });
    if (sec.body.length > 5) console.log(`     … (+${sec.body.length - 5} more)`);
  });
  console.log(`# header.refList`);
  console.log(`  fontFaces: ${doc.header.fontFaces.length}`);
  console.log(`  charProps: ${doc.header.charProps.size}`);
  console.log(`  paraProps: ${doc.header.paraProps.size}`);
  console.log(`  styles:    ${doc.header.styles.size}`);
  console.log(`# binaries (${doc.binaries.size})`);
  for (const k of doc.binaries.keys()) console.log('  ' + k);
  console.log(`# preserved (${doc.preserved.nodes.size})`);
  for (const k of doc.preserved.nodes.keys()) console.log('  ' + k);
}

function inlineSummary(i: Inline): string {
  switch (i.kind) {
    case 'text':
      return i.value;
    case 'tab':
      return '\\t';
    case 'lineBreak':
      return '\\n';
    case 'pageBreak':
      return '⏎';
    case 'hyperlink':
      return `[link:${i.href}]`;
    case 'bookmark':
      return `[mark:${i.name}]`;
    case 'picture':
      return `[pic:${i.binaryRef}]`;
    case 'table':
      return `[table:${i.table.rowCnt}×${i.table.colCnt}]`;
    case 'opaque':
      return '⟨?⟩';
    default:
      return '';
  }
}

async function roundtrip(input: string | undefined, output: string | undefined) {
  if (!input || !output) die('roundtrip <input.hwpx> <output.hwpx>');
  const inBytes = await readFile(resolve(input));
  const docA = await readHwpx(new Uint8Array(inBytes));
  const written = await writeHwpx(docA);
  await writeFile(resolve(output), written);
  const docB = await readHwpx(written);
  const equal = JSON.stringify(fingerprint(docA)) === JSON.stringify(fingerprint(docB));
  console.log(`written ${written.byteLength} bytes → ${output}`);
  console.log(`model equality: ${equal ? 'OK' : 'MISMATCH'}`);
  if (!equal) process.exit(2);
}

function fingerprint(doc: Awaited<ReturnType<typeof readHwpx>>) {
  return {
    metadata: doc.metadata,
    sections: doc.sections.map((s) => ({
      id: s.id,
      paragraphs: s.body.map((p) => ({
        runs: p.runs.map((r) => ({
          charPrIDRef: r.charPrIDRef,
          inlines: r.inlines,
        })),
      })),
    })),
    binaryKeys: [...doc.binaries.keys()].sort(),
  };
}

async function makeSample(output: string | undefined) {
  if (!output) die('make-sample <output.hwpx>');
  const zip = new JSZip();
  zip.file('mimetype', 'application/hwp+zip', { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container">
 <ocf:rootfiles>
  <ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/>
 </ocf:rootfiles>
</ocf:container>`,
  );
  zip.file(
    'Contents/content.hpf',
    `<?xml version="1.0" encoding="UTF-8"?>
<opf:package xmlns:opf="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/" version="1.0">
 <opf:metadata>
  <dc:title>샘플</dc:title>
  <dc:creator>hwpx-demo</dc:creator>
  <dc:date>2026-04-17</dc:date>
  <dc:language>ko-KR</dc:language>
 </opf:metadata>
 <opf:manifest>
  <opf:item id="header" href="header.xml" media-type="application/xml"/>
  <opf:item id="section0" href="section0.xml" media-type="application/xml"/>
  <opf:item id="settings" href="settings.xml" media-type="application/xml"/>
 </opf:manifest>
 <opf:spine><opf:itemref idref="section0"/></opf:spine>
</opf:package>`,
  );
  zip.file(
    'Contents/header.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head">
 <hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>
 <hh:refList>
  <hh:fontfaces><hh:fontface lang="HANGUL"><hh:font name="함초롬바탕" type="TTF"/></hh:fontface></hh:fontfaces>
  <hh:borderFills><hh:borderFill id="0"/></hh:borderFills>
  <hh:charProperties><hh:charPr id="0" height="1000"/></hh:charProperties>
  <hh:paraProperties><hh:paraPr id="0" align="LEFT"/></hh:paraProperties>
  <hh:styles><hh:style id="0" type="PARA" name="바탕글" paraPrIDRef="0" charPrIDRef="0"/></hh:styles>
  <hh:bullets/><hh:numberings/>
 </hh:refList>
</hh:head>`,
  );
  zip.file(
    'Contents/section0.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">
 <hp:p id="0" paraPrIDRef="0" styleIDRef="0">
  <hp:run charPrIDRef="0"><hp:t>안녕, 세계!</hp:t></hp:run>
 </hp:p>
 <hp:p id="1" paraPrIDRef="0" styleIDRef="0">
  <hp:run charPrIDRef="0"><hp:t>HWPX demo from @hwpx/demo</hp:t></hp:run>
 </hp:p>
</hs:sec>`,
  );
  zip.file(
    'Contents/settings.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app"/>`,
  );
  zip.file(
    'version.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<ha:HCFVersion xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" targetApplication="WORDPROC" major="5" minor="1" micro="0" buildNumber="0" os="Windows"/>`,
  );
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  await writeFile(resolve(output), bytes);
  console.log(`wrote ${bytes.byteLength} bytes → ${output}`);
}

function die(usage: string): never {
  console.error(`usage: hwpx-demo ${usage}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
