# HWPX Test Fixtures

이 디렉터리는 codec / 에디터 테스트에 사용될 HWPX 샘플을 보관한다.

## 구성

```
tools/fixtures/
  generate.py        # python-hwpx 기반 생성 스크립트 (Phase 1에서 추가)
  samples/           # 생성된 .hwpx 파일 (git LFS 또는 gitignore 대상)
    minimal.hwpx     # 빈 문서 (mimetype, version, 빈 섹션 1개)
    paragraphs.hwpx  # 단순 문단 + bold/italic/underline
    styles.hwpx      # 사용자 정의 CharPr / ParaPr / Style
    tables.hwpx      # 테이블 + 셀 병합
    images.hwpx      # BinData 이미지 / 도형
    unicode.hwpx     # 한글/한자/이모지/RTL
    malformed/       # 손상 입력 — 파서 fuzz 테스트용
  expected/          # 각 샘플을 파싱했을 때의 JSON 스냅샷
```

## 생성 방법 (Phase 1)

```bash
python -m venv .venv
source .venv/bin/activate
pip install python-hwpx
python tools/fixtures/generate.py
```

실제 한컴오피스에서 저장한 샘플(RTT — real round-trip)은 `samples/rtt/` 하위에
저장하되, 저작권 있는 원본은 커밋하지 않는다 (gitignore).

## 용도별 테스트 매핑

| 파일       | 검증 대상                                     |
| ---------- | --------------------------------------------- |
| minimal    | zip / OPF / mimetype 순서, 빈 문서 라운드트립 |
| paragraphs | hp:p, hp:run, hp:t 기본 파싱                  |
| styles     | refList ID 참조 해석, 스타일 상속             |
| tables     | hp:tbl, 셀 grid / span                        |
| images     | BinData 참조, MIME 매핑                       |
| unicode    | 한글 음절, 자모, 이모지, 한자 범위            |
| malformed  | 복구 가능한 오류 보고                         |

## 라이선스

`samples/` 하위의 파일은 합성 생성물(synthetic)이며 Apache-2.0으로 배포된다.
외부에서 기증받은 샘플은 별도 디렉터리(`samples/external/`)에 저작자 표기와
함께 보관하고, 각 서브디렉터리에 `LICENSE.md`를 둔다.
