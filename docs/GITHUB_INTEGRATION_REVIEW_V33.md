# MEDIPICK v3.3 — 연결된 비공개 GitHub 저장소 코드 대조·통합 보고서

작성: 2026-10-29. 기준: 사용자 계정에 연결된 GitHub 두 연결(shinkang888-code 및 skvive 연결의 shinkangteam 협업 저장소). **확인한 저장소의 코드를 원격에서 임의 수정하지 않았습니다.**

## 검색 및 정확한 구분

두 연결에서 접근 가능한 저장소 목록을 조회하고 이름·README 및 일부 원본 코드를 대조했습니다. 특정한 `MEDIPICK` 이름의 저장소는 제공된 접근 범위의 저장소 목록에서 확인하지 못했습니다. 따라서 현재 대화에서 만든 **MEDIPICK v3.2 ZIP을 기준 코드**로 유지했습니다.

1. **[shinkangteam/helloapp](https://github.com/shinkangteam/helloapp)** — **비공개**. README상 학원 관리 시스템이며 Next.js/Prisma/PostgreSQL/NextAuth/FullCalendar/카카오 알림 구현. 실제로 다음 파일을 확인함:
   - `src/app/api/admin/schedules/route.ts`: 기관별 소유권 확인 및 일정 겹침 검증.
   - `src/app/api/admin/notifications/send/route.ts`: 기관 범위의 대상자 조회 및 알림 처리.
   - `src/services/kakao.ts`: 개인 카카오 메시지·동의 범위 및 토큰 갱신 구조. **카카오 나에게 보내기를 의료기관 알림톡으로 혼동하여 사용하지 않음.**
   - `saas-academy/src/lib/services/notification.service.ts`: 영속 알림 큐, 재시도 횟수 및 오류 상태 관리.
   - `saas-academy/src/lib/auth/csrf.ts` 및 `rate-limit.ts`: CSRF 검증 및 인메모리 호출 제한 접근.
2. **[shinkang888-code/repo-health](https://github.com/shinkang888-code/repo-health)** — **비공개**. 이름과 달리 건강보험·병원 프로젝트가 아니라 로컬 Git 저장소 무결성/미러 상태 비교 PowerShell 프로그램. 제품 소스 병합 제외.
3. **[shinkangteam/ma](https://github.com/shinkangteam/ma)** — **비공개**. 대한에이전트협회 M&A 플랫폼(Next.js). 의료 서비스 업무코드가 아니므로 병합 제외.
4. **[shinkang888-code/plan-hub](https://github.com/shinkang888-code/plan-hub)** — **비공개**. Windows Google Drive 동기화 폴더의 파일 스냅샷 백업 기법 참고. 원본의 PC 고정 경로 또는 사용자 비밀 설정은 가져오지 않음. 이번 ZIP은 연결된 사용자 Google Drive를 통해 별도 업로드 가능 여부 확인.

이 보고서의 링크는 계정에 액세스 권한이 있는 경우에만 열립니다. 사용자가 허용한 GitHub 연결을 통해 조회한 내용을 설명하는 문서이므로 타 계정에는 비공개입니다.

## 병합 내역 (개념·워크플로우 이식, 소스 단순 덮어쓰기 없음)

| 원본 검토 항목 | MEDIPICK v3.2 문제 | v3.3 조치 | 검증 |
|---|---|---|---|
| 학원별 일정 조회 스코프 | 운영자 전체 예약 관리만 제공 | 신규 `clinic_ops.py` 병원별 읽기/변경 권한별 API | 타 기관 예약 404 및 미노출 |
| 일정 중복 검증 | 여러 예약을 같은 날짜·시간에 확정 가능 | 확정예약 SQL 부분 고유 인덱스 + 원자적 상태 전환 | 두 번째 확정 차단 |
| 예약 현황 UI | 관리자 목록 및 ICS 중심 | `/clinic-ops`, `/clinic-access` 신규 PC/모바일 | 실제 HTTP GET 및 오프라인 Chromium |
| 알림 대기열 | 예약 요청 메시지만 존재, 상태 변경 안내 불명확 | `event_type` 마이그레이션, 상태별 템플릿 코드, 발송 대기 | 중복 이벤트 방지 및 미설정시 발송 차단 |
| 역할·키 회수 | `mpdoc_` 재무 열람권한과 예약 관리가 함께 주어질 위험 | `mpclinic_` 독립 HMAC 접근키, 조회/관리 권한, 30일 만료·회수 | 미인증 401, 조회키 POST 403, 폐기 후 401 |
| 개인정보 | 관리자 예약 목록에는 암호화된 PII 복호화 필요 | 병원 예약 API는 주민번호·증상·이름·전화번호 **미반환**; 예약 ID 및 일정/상태만 전달 | 테스트에서 필드 부재 확인 |
| 소유권 검증/CSRF | 관리자 보호와는 별개 병원 직원 권한 필요 | 전용 Bearer 키 + 변경 전용 헤더 + 기관/키 스코프 | CSRF 관련 헤더 미사용 시 차단 |

## 선별적으로 제외한 구현 및 이유

- Next.js/Prisma/NextAuth/Kakao 개인 메시지 발송 코드를 Python/SQLite 서버에 **직접 복사하지 않음**. 의존성·세션 체계가 달라 안정성에 불리하며 개인 카카오 전송 API는 광고성/사업자 승인 알림톡과 같지 않음.
- `helloapp`의 학생 실명·결제정보 로직을 환자 데이터로 변환하지 않음. 의료정보 보안 요구가 높아 예약 운영 API에 실명과 증상은 제공하지 않는 것이 안전.
- 예약 결과가 'confirmed'라고 해도 실제 병원 EMR과 연동된 자동 확정은 아님. **기관 직원이 수동 확정한 상태**.
- 병원 영업 광고 우선노출 시스템과 의료정보 중립 표시를 그대로 유지.

## 새 관리자 메뉴

`/clinic-access`: 기존 관리자 암호 로그인 → 병원 ID 지정 → 조회 전용/예약변경 키 생성 → `/clinic-ops`에서 직원 키 사용 → 불필요한 키 폐기. 비밀 키는 발급 시 한 번만 표시.

## 외부 서비스 및 상용화 미검증 목록

Google/Blogger 실계정 OAuth, 결제사 실사업자 토스 결제, HIRA 전자청구, 카카오 알림톡·SMS 실제 발송, 실병원 예약 확정, 실환자 의료정보, 운영망 HTTPS/MFA/침투테스트는 실제 서비스 이용승인·계정 및 법률 검증 없이는 완료될 수 없습니다. **이 패키지는 로컬 MVP로만 검증되었습니다.**
