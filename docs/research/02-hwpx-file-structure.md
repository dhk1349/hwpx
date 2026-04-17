# HWPX 파일 구조

HWPX는 ZIP 컨테이너에 여러 XML 파일과 바이너리 리소스를 담는 구조다. 아래는 대표적인 트리다.

```
sample.hwpx  (ZIP)
├── mimetype                     # 시그니처: application/hwp+zip
├── version.xml                  # OWPML 버전, 저장 환경 정보
├── settings.xml                 # 커서 위치, 환경 설정 등
├── Contents/
│   ├── content.hpf              # OPF: metadata / manifest / spine
│   ├── header.xml               # 서식 참조 테이블 (fontfaces, charPr, paraPr, style …)
│   ├── section0.xml             # 1번 구역 본문
│   ├── section1.xml             # 2번 구역 본문 (있을 때만)
│   └── …
├── BinData/
│   ├── image1.png
│   ├── image2.jpg
│   └── embed1.ole
├── META-INF/
│   ├── container.xml            # 루트 파일 지정 (Contents/content.hpf)
│   ├── manifest.xml             # 전체 파일 목록/무결성
│   └── (암호화 정보)
├── Scripts/                     # 문서 포함 스크립트 (자바스크립트 등)
└── Preview/
    ├── PrvImage.png             # 썸네일
    └── PrvText.txt              # 미리보기 텍스트
```

## 파일별 역할

| 경로                      | 역할                                                                                                                                              | 필수 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | :--: |
| `mimetype`                | 첫 바이트부터 `application/hwp+zip` 라는 시그니처 (ZIP의 첫 엔트리로 무압축 저장)                                                                 |  ✅  |
| `version.xml`             | OWPML 메이저/마이너/빌드 버전, 생성 애플리케이션, 저장 OS 등                                                                                      |  ✅  |
| `settings.xml`            | 가장 마지막 커서 위치(CaretPosition), 보기 설정                                                                                                   | 선택 |
| `Contents/content.hpf`    | OPF 표준(EPUB과 동일 규격). `metadata`(제목/작성자/일시), `manifest`(파일 목록), `spine`(본문 구역 순서)                                          |  ✅  |
| `Contents/header.xml`     | `refList`(fontfaces, borderFills, charProperties, paraProperties, styles, bullets, numberings …), `beginNum`(페이지/각주 시작번호), 변경추적 설정 |  ✅  |
| `Contents/section{N}.xml` | N번째 구역의 문단 트리. 구역은 1개 이상 필요                                                                                                      |  ✅  |
| `BinData/*`               | 이미지·OLE 등 바이너리. `content.hpf` 의 `manifest` 에 ID-경로 맵핑                                                                               | 선택 |
| `META-INF/container.xml`  | OCF 표준. `rootfiles` 엔트리로 `Contents/content.hpf` 위치 지정                                                                                   |  ✅  |
| `META-INF/manifest.xml`   | 전체 항목의 MIME/암호화 정보. HWPX 2019 이후                                                                                                      | 선택 |
| `Scripts/*`               | 문서에 임베드된 스크립트(보안상 웹 에디터는 실행하지 않고 보관만 권장)                                                                            | 선택 |
| `Preview/PrvImage.png`    | 썸네일(파일 탐색기 미리보기용)                                                                                                                    | 선택 |
| `Preview/PrvText.txt`     | 본문 앞부분 텍스트(검색 인덱스용)                                                                                                                 | 선택 |

## 논리 모델 (본문)

OWPML 본문은 3계층 구조다:

```
Document
 └── Section (hs:sec)                ← section{N}.xml 한 파일당 하나
      └── Paragraph (hp:p)           ← 문단
           └── Run (hp:run)          ← 같은 글자 속성을 공유하는 인라인 영역
                ├── Text (hp:t)      ← 실제 텍스트 (mixed content)
                ├── Tab (hp:tab)
                ├── LineBreak (hp:lineBreak)
                ├── Table (hp:tbl)
                ├── Picture (hp:pic)
                ├── Equation
                ├── Shape / ShapeObject / ConnectLine
                └── Footnote / Endnote / Bookmark / Hyperlink …
```

제약:

- 본문(Body)은 물리 파일로 존재하지 않음 — 각 구역이 별도 XML 파일
- 구역은 최소 1개, 문단은 구역당 최소 1개
- 표 셀도 내부에 `sub-paragraph` 를 가짐 (셀 = 미니 Body)

## ID 참조 모델

OWPML은 **인라인 속성이 아닌 ID 참조**로 서식을 관리한다. 서식 정의는 `header.xml` 에 모여 있고 본문은 ID만 참조한다.

```xml
<!-- section0.xml -->
<hp:p id="1" paraPrIDRef="20" styleIDRef="0">
  <hp:run charPrIDRef="7">
    <hp:t>안녕하세요</hp:t>
  </hp:run>
</hp:p>
```

```xml
<!-- header.xml 의 refList 내부 -->
<hh:charProperties>
  <hh:charPr id="7" height="1000" textColor="#000000"> … </hh:charPr>
</hh:charProperties>
<hh:paraProperties>
  <hh:paraPr id="20" align="justify" … />
</hh:paraProperties>
```

이 모델은:

- **장점**: 같은 서식이 반복될 때 중복 제거, 스타일 변경이 전파됨
- **단점**: 웹 에디터에서 렌더링하려면 header.xml을 먼저 파싱해 **스타일 맵**을 만들어야 함

## 네임스페이스 (대표)

| 접두어 | 용도                   | 네임스페이스 URI (예시)                           |
| ------ | ---------------------- | ------------------------------------------------- |
| `hp`   | paragraph / 본문 요소  | `http://www.hancom.co.kr/hwpml/2011/paragraph`    |
| `hh`   | header (서식 참조)     | `http://www.hancom.co.kr/hwpml/2011/head`         |
| `hs`   | section                | `http://www.hancom.co.kr/hwpml/2011/section`      |
| `ha`   | application / settings | `http://www.hancom.co.kr/hwpml/2011/app`          |
| `hc`   | core type (공통 타입)  | `http://www.hancom.co.kr/hwpml/2011/core`         |
| `opf`  | Open Packaging Format  | `http://www.idpf.org/2007/opf/`                   |
| `dc`   | Dublin Core (metadata) | `http://purl.org/dc/elements/1.1/`                |
| `ocf`  | Open Container Format  | `urn:oasis:names:tc:opendocument:xmlns:container` |

> 네임스페이스 URI는 OWPML 버전에 따라 `2011`, `2016`, `2021` 등으로 달라지므로 파서는 suffix 매칭을 권장.

## 참고자료

- [한컴테크 — HWPX 포맷 구조 살펴보기](https://tech.hancom.com/hwpxformat/)
- [한컴테크 — HWPX 파싱 1](https://tech.hancom.com/python-hwpx-parsing-1/)
- [OpenHWP (Rust) — HWPX 파서 구조](https://github.com/openhwp/openhwp)
- [hwpxlib (Java) — 읽기/쓰기 참조 구현](https://github.com/neolord0/hwpxlib)
