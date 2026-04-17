# HWPX 주요 XML 요소 참조

본 문서는 웹 에디터가 처리해야 하는 OWPML 핵심 요소를 정리한다. 전체 스펙은 [KS X 6101 / 한컴 다운로드 센터](https://www.hancom.com/support/downloadCenter/hwpOwpml) 의 PDF 원본을 참조한다.

## 1. content.hpf (OPF 패키지 선언)

```xml
<opf:package xmlns:opf="http://www.idpf.org/2007/opf/" version="1.4">
  <opf:metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>샘플 문서</dc:title>
    <dc:creator>홍길동</dc:creator>
    <dc:date>2026-04-17T09:00:00</dc:date>
    <dc:language>ko</dc:language>
  </opf:metadata>
  <opf:manifest>
    <opf:item id="header"   href="Contents/header.xml"   media-type="application/xml"/>
    <opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>
    <opf:item id="image1"   href="BinData/image1.png"    media-type="image/png"/>
  </opf:manifest>
  <opf:spine>
    <opf:itemref idref="section0"/>
  </opf:spine>
</opf:package>
```

## 2. header.xml (서식 참조 테이블)

최상위 구조:

```xml
<hh:head xmlns:hh="...head" xmlns:hc="...core">
  <hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>
  <hh:refList>
    <hh:fontfaces itemCnt="...">
      <hh:fontface lang="HANGUL" fontCnt="..."> ... </hh:fontface>
      <hh:fontface lang="LATIN"  fontCnt="..."> ... </hh:fontface>
      ...
    </hh:fontfaces>
    <hh:borderFills itemCnt="...">
      <hh:borderFill id="0"> ... </hh:borderFill>
    </hh:borderFills>
    <hh:charProperties itemCnt="...">
      <hh:charPr id="0" height="1000" textColor="#000000" italic="0" bold="0"> ... </hh:charPr>
    </hh:charProperties>
    <hh:paraProperties itemCnt="...">
      <hh:paraPr id="0" align="left" ... />
    </hh:paraProperties>
    <hh:styles itemCnt="...">
      <hh:style id="0" type="PARA" name="바탕" paraPrIDRef="0" charPrIDRef="0"/>
    </hh:styles>
    <hh:bullets> ... </hh:bullets>
    <hh:numberings> ... </hh:numberings>
    <hh:memoProperties> ... </hh:memoProperties>
    <hh:trackChanges> ... </hh:trackChanges>
  </hh:refList>
</hh:head>
```

### 핵심 refList 항목

| 요소                         | ID로 참조됨                  | 주요 속성/자식                                                                              |
| ---------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------- |
| `hh:fontface`                | `hh:charPr`의 `fontRef` 자식 | `name`, `type`(TTF 등), `isEmbedded`                                                        |
| `hh:charPr`                  | `hp:run@charPrIDRef`         | `height`(1/100pt), `textColor`, `italic`, `bold`, `underline`, `strikeout`, `fontRef[lang]` |
| `hh:paraPr`                  | `hp:p@paraPrIDRef`           | `align`(left/right/center/justify), `margin`, `indent`, `lineSpacing`, `border`, `heading`  |
| `hh:borderFill`              | `hh:charPr`, `hh:tbl` 등     | `slash`, `leftBorder`, `fillBrush`                                                          |
| `hh:style`                   | `hp:p@styleIDRef`            | `type`(PARA/CHAR), `name`(제목1, 본문 등), `paraPrIDRef`, `charPrIDRef`                     |
| `hh:bullet` / `hh:numbering` | `hh:paraPr@headingIDRef`     | 글머리 기호 / 번호 매기기                                                                   |
| `hh:memoProperty`            | 본문 `hp:memo`               | 메모 스타일                                                                                 |
| `hh:trackChanges`            | 변경 추적 항목               | 작성자, 일시                                                                                |

## 3. section{N}.xml (본문)

```xml
<hs:sec xmlns:hs="...section" xmlns:hp="...paragraph">
  <hp:p id="1" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0">
    <hp:run charPrIDRef="0">
      <hp:secPr id="0" textDirection="HORIZONTAL" spaceColumns="708">
        <hp:pagePr width="59528" height="84188" landscape="NARROWLY" gutterType="LEFT_ONLY">
          <hp:margin header="4252" footer="4252" gutter="0"/>
        </hp:pagePr>
      </hp:secPr>
    </hp:run>
    <hp:run charPrIDRef="7">
      <hp:t>첫 번째 문단입니다.</hp:t>
    </hp:run>
  </hp:p>
  <hp:p id="2" paraPrIDRef="20" styleIDRef="0">
    <hp:run charPrIDRef="7">
      <hp:t>두 번째 문단</hp:t><hp:lineBreak/><hp:t>줄바꿈</hp:t>
    </hp:run>
  </hp:p>
</hs:sec>
```

### 본문의 인라인 / 블록 요소

| 요소                                             | 의미                         | 주요 속성                                                            |
| ------------------------------------------------ | ---------------------------- | -------------------------------------------------------------------- |
| `hp:p`                                           | 문단                         | `id`, `paraPrIDRef`, `styleIDRef`, `pageBreak`, `columnBreak`        |
| `hp:run`                                         | 같은 글자 속성의 인라인 영역 | `charPrIDRef`                                                        |
| `hp:t`                                           | 텍스트 (mixed content)       | —                                                                    |
| `hp:tab`                                         | 탭                           | —                                                                    |
| `hp:lineBreak`                                   | 강제 줄바꿈                  | —                                                                    |
| `hp:pageBreak`                                   | 페이지 나눔                  | —                                                                    |
| `hp:hyperlink`                                   | 하이퍼링크                   | `href`, `target`                                                     |
| `hp:bookmark`                                    | 북마크                       | `id`, `name`                                                         |
| `hp:footNote` / `hp:endNote`                     | 각주/미주                    | `id`                                                                 |
| `hp:ctrl`                                        | 기타 제어 (페이지 설정 등)   | —                                                                    |
| `hp:tbl`                                         | 표                           | `id`, `zOrder`, `rowCnt`, `colCnt`, `borderFillIDRef`, `cellSpacing` |
| `hp:pic`                                         | 그림                         | `binaryItemIDRef`, `width`, `height`, `offsetX`, `offsetY`           |
| `hp:equation`                                    | 수식 (HWP의 수식 언어)       | —                                                                    |
| `hp:shape` / `hp:shapeObject` / `hp:connectLine` | 도형 / 도형 그룹 / 연결선    | 위치/크기                                                            |
| `hp:memo`                                        | 메모                         | `memoShapeIDRef`, `ownerID`                                          |

### 표(`hp:tbl`) 세부

```xml
<hp:tbl id="1" zOrder="0" rowCnt="2" colCnt="2" borderFillIDRef="1">
  <hp:sz width="36000" widthRelTo="ABSOLUTE" height="18000" heightRelTo="ABSOLUTE"/>
  <hp:pos treatAsChar="0" affectLSpacing="0" ... />
  <hp:outMargin left="0" right="0" top="0" bottom="0"/>
  <hp:tr>  <!-- table row -->
    <hp:tc name="A1" header="0" hasMargin="0" borderFillIDRef="1" rowSpan="1" colSpan="1">
      <hp:subList id="0" textDirection="HORIZONTAL">
        <hp:p id="1" paraPrIDRef="0"> ... </hp:p>
      </hp:subList>
    </hp:tc>
    <hp:tc name="B1"> ... </hp:tc>
  </hp:tr>
  <hp:tr> ... </hp:tr>
</hp:tbl>
```

### 이미지(`hp:pic`) 세부

```xml
<hp:pic binaryItemIDRef="image1" width="10000" height="10000">
  <hp:sz width="10000" widthRelTo="ABSOLUTE" height="10000" heightRelTo="ABSOLUTE"/>
  <hp:pos treatAsChar="1"/>
  <hp:img binaryItemIDRef="image1" alpha="0" bright="0" contrast="0"/>
</hp:pic>
```

`binaryItemIDRef` 는 `content.hpf` 의 `manifest` 에서 ID로 매칭된 `BinData/…` 파일을 가리킨다.

## 4. settings.xml / version.xml 요약

```xml
<ha:HWPApplicationSetting xmlns:ha="...app" xmlns:hc="...core">
  <ha:CaretPosition listIDRef="0" paraIDRef="1" pos="3"/>
  <ha:ViewSetting ... />
</ha:HWPApplicationSetting>
```

```xml
<ha:HCFVersion xmlns:ha="...app"
               targetApplication="WORDPROCESSOR"
               major="5" minor="1" micro="0" buildNumber="0"
               osName="Windows" osVersion="10.0"/>
```

## 5. 단위 관례

- 길이: 대부분 **1/7200 inch (= 1 HWPUnit)**. `height="1000"` 은 10pt 글자 크기
- 색상: `#RRGGBB` 16진수 문자열
- 각도: 1/256도

## 6. 샘플 최소 HWPX

유효한 최소 구성:

```
mimetype
version.xml
META-INF/container.xml
Contents/content.hpf
Contents/header.xml
Contents/section0.xml
```

`mimetype` 은 ZIP 첫 엔트리이며 **무압축(STORE)** 이어야 한다 (EPUB 규칙과 동일).

## 참고자료

- [한컴테크 — HWPX 파싱 (1)](https://tech.hancom.com/python-hwpx-parsing-1/)
- [한컴테크 — HWPX 파싱 (2)](https://tech.hancom.com/python-hwpx-parsing-2/)
- [hwpxlib (Java)](https://github.com/neolord0/hwpxlib) — 요소 트리 참조
- [python-hwpx](https://github.com/airmang/python-hwpx) — Pure Python 구현
- [openhwp (Rust)](https://github.com/openhwp/openhwp) — 타입 모델 참조
