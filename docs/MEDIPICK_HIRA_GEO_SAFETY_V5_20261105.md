# MEDIPICK HIRA 좌표 검증 안전 절차 (2026-11-05)

## 현재 운영 근거
- skvive/medipick Next.js/Neon 운영 DB 읽기 전용 재조회: 원본 35,458 / 공개 후보 30,391 / 검색결과 오인 5,067 / 추정좌표 29,386 / 검증된 정확좌표 0.
- 최신 HIRA 실원본 CSV/XLSX는 확보되지 않았으며 DB 좌표를 변경하지 않았다.
- 공식 원천 후보: https://www.data.go.kr/data/15051059/fileData.do 및 https://opendata.hira.or.kr/op/opc/selectOpenData.do?sno=11925

## 이번 보호 수정
1. 이전의 이름+도로명+구군 3요소 매칭은 서울 중구와 부산 중구를 혼동할 수 있었으므로, 시도 및 시/군/구가 포함된 주소를 필수로 비교한다.
2. 같은 공식 자료에 동명의 동일 매칭 키가 2회 나타나면 위치가 같아도 후보에서 제외한다.
3. --apply에는 검수한 원본의 SHA-256, 공식 설명 페이지 주소, 사전에 사람이 검수한 드라이런 JSONL 및 그 SHA-256이 모두 필요하다.
4. 승인 전후 DB나 원본이 바뀌어 후보 행들이 달라지면 리뷰 JSONL과 재계산 결과가 일치하지 않으므로 업데이트를 차단한다.
5. 단순히 HIRA로 보이는 이름이나 공식 페이지 URL을 입력하는 것만으로 원본 파일이 진본이라는 증명은 아니다. 운영자 직접 다운로드 이력과 기준일 및 좌표계(WGS84) 확인이 필수다.

## 실행 순서
- 공식 HIRA 페이지에서 실원본을 다운로드하고 날짜, 페이지 URL, 파일 SHA-256을 기록한다.
- Google Drive에 보관된 MEDIPICK_HIRA_INSPECT_V1_20261104.py로 ZIP/CSV/XLSX의 병원명, 주소, X/Y 좌표와 헤더 구조를 확인한다. 이것은 사전 샘플 검사일 뿐 좌표계/기관 진본을 인증하지 않는다.
- 정당한 자료를 추출한 후 읽기 전용 DB 자격으로 드라이런한다.

    export DATABASE_URL='READ_ONLY_DATABASE_URL'
    python scripts/import-hira-coordinate-csv.py /path/to/hira.csv --source-tag HIRA-YYYYMMDD --report /path/to/dryrun-new.jsonl

- 작성된 DRY_RUN JSONL을 사람이 표본 검수하고 파일 SHA-256을 따로 보존한다.
- 명시적 운영 승인과 DB 복구 계획이 갖추어진 경우에만 소량 반영한다.

    export DATABASE_URL='APPROVED_PRODUCTION_DATABASE_URL'
    python scripts/import-hira-coordinate-csv.py /path/to/hira.csv --source-tag HIRA-YYYYMMDD \
      --source-sha256 '<official-original-sha256>' \
      --official-source-page 'https://www.data.go.kr/data/15051059/fileData.do' \
      --reviewed-report /path/to/dryrun-new.jsonl \
      --reviewed-report-sha256 '<reviewed-jsonl-sha256>' \
      --max-updates 50 --apply

## QA
    python -m unittest discover -s tests -p 'test_hira_coordinate_safety.py' -v
    python -m py_compile scripts/hira_coordinate_safety.py scripts/import-hira-coordinate-csv.py

위 샘플 테스트는 합성 자료이며 실제 병원 현행 운영상태, 좌표 정확성 또는 공공기관 인증을 입증하지 않는다. 추정좌표를 exact로 일괄 변환하지 않으며 원본 DB는 삭제하지 않는다.
