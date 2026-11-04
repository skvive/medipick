# MEDIPICK 건강정보·블로그·유튜브 / 보험·약제비 통합 작업 감사 (2026-11-05)

## 1. 소스 검증과 재사용
- 운영 원본: `skvive/medipick`, Next.js 15·Neon·Vercel. 원본 branch main은 PR로 보호 후 병합.
- 비교 사이트: `https://live.lexid.site`의 Vercel 프로젝트 `live` (production deployment `dpl_FCJfJhQX6vAWD6SrVxYoCCu2eWBU`), 직접 HTTP 200 확인.
- `https://live.lexid.site/gblog`는 구글블로그 제작·운영 **마케팅 소개 페이지**이고 Blogger 원문 검색 엔진으로 확인되지 않았다.
- 실사용 UI 소스: `https://live.lexid.site/js/open-content.js` (~10KB)과 `js/pagination.js` (~4KB). 카드·원문 링크·블로그/영상 구분·페이지네이션·관심 저장 패턴을 검토하고 메디픽 전용 독립 코드로 이식했다.
- Linkr의 패션/라이브커머스 콘텐츠, 의류 썸네일, 쇼핑 광고/가격표 및 브랜드 문구는 복사하지 않았다.
- Google Drive의 `ChatGPT_Library`, `렉시드개발자료/공통개발스킬` 접근 확인. 과거 MEDIPICK v4.3 원본 ZIP의 `doctor-finance` 기능과 GitHub 운영 웹 코드도 확인.
- 특정 Drive 프로젝트명 `내 보험 약국` 또는 `건강보험 자동 청구`는 이름과 기능이 일치하는 원본 코드·인증 API를 확보하지 못했다. 개인 보험약관 PDF·건강보험 일반 양식을 프로젝트 코드로 오인하지 않았다.

## 2. 이식한 화면과 기존 서비스 연결
| 메디픽 화면 | 기능 | 근거 |
|---|---|---|
| `/health-content` | 공식 병원·약국·건강·보험정보 확인처, 기존 공개 의료 안내 샘플 목록, 검색·분류·페이지네이션·제목정렬·임시 보관·링크 복사 | `live.lexid.site/js/open-content.js`, `js/pagination.js` 화면 패턴 |
| 구글블로그 검색 | 병원·약국 키워드를 추가한 `site:blogspot.com` 검색을 Google에서 새 탭으로 연다 | Blogger API 키 없음, 원문 메타데이터 자동 수집·게시 불가 |
| 유튜브 검색 | 병원·약국·건강정보 키워드를 포함한 YouTube 검색 결과를 새 탭에서 연다 | YouTube Data API 인증키 없음, 메디픽 내 실시간 영상 목록 조회 아님 |
| 메디픽 내부 콘텐츠 | `GET /api/content`의 공개 `approved=1` 자료 중 의료 키워드가 있는 콘텐츠만 제공, 비검증 임상 가이드 시연용 표시 | Neon 실쿼리: 총 68건 중 Linkr 비의료 60건 제외, 남은 안내 샘플 8건 |
| `/insurance-claims` 개인 | 공식 실손24에서 병원/약국 전산청구, 본인인증·청구이력·참여기관 확인 절차 안내 | `https://www.silson24.or.kr/claim/web/`, 금융위 2026-10 실손청구전산화 설명 |
| `/insurance-claims?mode=clinic` 의료기관 | 기존 `/doctor-finance` 청구초안·수가·사전점검·수기 심사·입금 대사·Excel 링크 | 기존 `web/doctor-finance.html`, `lib/medipick/extended-api.ts` |
| 메뉴·지도·메인 | 건강정보·영상과 보험·약제비 메뉴 통일, PWA 바로가기 2종 추가 | 공통 `web/assets/site-chrome.js`, `web/smart-store.html`, `web/index.html` |

## 3. 중요한 보안·품질 조치
- 기존 Linkr 라이브커머스 행 60건은 원본 DB에서 삭제하지 않고 공개 건강정보 API에서 제외한다.
- 빌드 시 반복 실행되는 `scripts/import-livelinkr-content.mjs`은 파괴적 SQL을 포함했다. 해당 삭제 쿼리를 제거하고 기본 실행을 안전하게 건너뛰도록 가드를 추가했다. Vercel 프로젝트 설정에만 변경을 요청한 초기 배포에는 기존 명령이 남아 있었다. 원인은 저장소의 `vercel.json`이 동일한 구형 `buildCommand`를 명시적으로 오버라이드한 것이었다. `vercel.json`을 `npm run db:migrate && npm run build`로 수정했고, 비의료 importer는 더 이상 빌드에서 실행하지 않는다. importer 내부의 기본 차단과 삭제 SQL 제거도 별도로 유지한다. 최종 배포 로그에서 확인한다.
- 내부 콘텐츠 8건은 **의료진 검증 자료가 아닌 데모 안내**. 자료 제목만 소개하며 의료 효능·치료 결과를 생성하지 않는다.
- 공식기관/외부 서비스 정보는 메디픽의 공식 청구·진단·처방 서비스로 표현하지 않는다.
- 실손보험 민간 보험금 청구와 의료기관 건강보험 요양급여 청구는 서로 다르다.
- 실손24는 실제 공적 청구 인프라이나 메디픽 서버의 실손24/보험사/건보공단/HIRA 자동 제출 API는 연결되어 있지 않다. 메디픽 화면에는 이름·주민번호·진료기록·처방전/영수증 업로드 폼을 만들지 않았다.
- 기존 `doctor-finance`의 `mpdoc_` 권한·감사·기관별 분리 기능을 그대로 사용한다. 새 브라우저에 의료정보 자동 캐시를 만들지 않는다.
- 주소록 후보 30,391건과 검증 좌표 0건, 검색결과 페이지 5,067건 제외라는 원본 지도 정확도 경고를 유지한다.

## 4. 검증·한계
- 건강콘텐츠 검색은 메디픽 내부의 승인된 자료 및 공식 출처 카드만 표시한다. 외부 YouTube/Blogger 실시간 결과는 각각 외부 서비스에서 열리며, 현재 API 키가 없어 메디픽 내부 검색으로 가장하지 않는다.
- 사용자가 선택한 분야·검색어를 Google/YouTube로 전송하는 경우 새 탭 이동이므로 사용자에게 외부 서비스 검색임을 고지한다.
- 개별 보험계약 보장 여부·실제 보험금 지급·실제 병원/약국 전산청구 참여 여부는 공식 사이트에서 확인해야 한다.
- 브라우저 렌더링 실제 모바일/계정 로그인/기관별 내부 청구 API 송수신 E2E는 별도 증빙 없이는 완료로 주장하지 않는다.
