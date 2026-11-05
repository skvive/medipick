# 메디픽 안전 배포 — 2026-11-05

## 안전성 확인
- 운영 도메인: https://medipick.lexid.site
- 운영 GitHub 소스: skvive/medipick main
- 기존 Vercel 배포 명령 `npm run db:migrate && npm run build` 은 빌드시 운영 DB SQL을 실행하므로 위험하다.
- 변경된 Vercel 빌드 명령: `npm run build` (정적파일 동기화 및 Next.js 빌드만 수행).
- GitHub Actions `Safe Vercel build gate` 가 배포 명령에 DB migration/import/seed 명령이 포함되는지 차단한다.

## DB 스키마 변경 프로토콜
1. schema diff와 영향 테이블을 검토하고 백업/복구 절차 확보.
2. 별도 검증 DB 브랜치에서 `npm run db:migrate` 실행 및 데이터 무손실 테스트.
3. 운영 변경 승인 이후, 운영 중단/되돌리기 계획과 함께 별도 migration 작업 실행.
4. 빌드/배포 시 `npm run db:migrate`를 다시 자동 실행하지 않는다.

## 릴리스 절차
1. `main`에 검증된 PR만 병합하고 CI 검사 결과 확인.
2. Vercel 프로젝트 medipick-lexid 에서 Git 소스 연결이 실제로 올바른지 확인.
3. 가능한 경우 preview 배포를 빌드해 14개 HTML 화면과 public catalog API, 매니페스트, PWA 업데이트 흐름 QA.
4. 인증・지도・신청/예약・Android는 실제 장치/계정의 E2E 승인 필요. 별도 승인 없는 운영 DB 변경 금지.
5. production 배포 후 승인한 SHA와 실제 Vercel READY 커밋, 도메인 HTTP 응답을 비교 확인한다.

## 병원 위치
HIRA 원본 기준일/좌표계/공식 다운로드 증거 없이 `exact` 좌표 갱신하지 않는다. 기존 29,386개의 추정 좌표는 추정 상태를 유지한다.
