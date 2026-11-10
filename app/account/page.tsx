import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth/server';
import { signOutAction } from '@/app/auth/sign-in/actions';

export const dynamic = 'force-dynamic';

const modules = [
  { href:'/my-health', symbol:'♡', title:'내 건강노트', description:'내 기기에서 건강·복약 메모를 관리합니다.', label:'로컬 기록 · 서버 동기화 전' },
  { href:'/smart-store', symbol:'✚', title:'병원찾기', description:'내 주변 병원을 지도와 공식 정보로 검색합니다.', label:'지도 검색' },
  { href:'/pharmacy', symbol:'＋', title:'약국찾기', description:'주변 약국을 찾고 위치·영업정보를 확인합니다.', label:'Google 장소 검색' },
  { href:'/consult', symbol:'✧', title:'AI 건강상담', description:'진단이 아닌 참고용 건강안내를 살펴봅니다.', label:'의료진 진단 대체 불가' },
  { href:'/medical-center', symbol:'▤', title:'메디컬센터', description:'승인된 의료 저널·병원 Blogger·유튜브 콘텐츠를 봅니다.', label:'의료 콘텐츠' },
  { href:'/clinic-store', symbol:'▣', title:'병원 입점 · 관리', description:'병원 스마트스토어를 확인하고 운영자 입점을 신청합니다.', label:'별도 기관 승인 필요' },
] as const;

export default async function AccountPage() {
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect('/auth/sign-in');
  const user = session.user;
  const name = String(user.name || '메디픽 회원').slice(0, 120);
  const email = String(user.email || '').slice(0, 180);
  const initial = name.trim().slice(0, 1) || 'M';

  return (
    <main className="account-shell">
      <div className="account-breadcrumb"><Link href="/">홈</Link><span>›</span><span>마이페이지</span></div>
      <section className="account-hero" aria-labelledby="accountTitle">
        <div className="account-profile">
          <div className="account-avatar" aria-hidden="true">{initial}</div>
          <div className="account-identity">
            <span className="account-overline">MY MEDIPICK · NEON AUTH</span>
            <h1 id="accountTitle">{name}님의 마이페이지</h1>
            <p>{email}</p>
            <span className="account-verified">✓ Google 로그인 세션 확인됨</span>
          </div>
        </div>
        <form action={signOutAction}>
          <button className="account-signout" type="submit">로그아웃</button>
        </form>
      </section>
      <section className="account-summary" aria-label="계정 서비스 연동 상태">
        <div><span>로그인 계정</span><strong>Neon Auth 연동</strong><small>실제 세션 확인</small></div>
        <div><span>건강기록</span><strong>로컬 메모</strong><small>의료 기록 서버 자동 연동 없음</small></div>
        <div><span>병원·약국</span><strong>위치기반 검색</strong><small>위치 권한은 직접 허용</small></div>
      </section>
      <section className="account-services" aria-labelledby="accountServicesTitle">
        <div className="account-section-head">
          <div><span>MEDIPICK PERSONAL WORKSPACE</span><h2 id="accountServicesTitle">내 서비스 바로가기</h2></div>
          <Link href="/specialties">진료과목 전체보기 →</Link>
        </div>
        <div className="account-service-grid">
          {modules.map((module) => (
            <Link className="account-service-card" href={module.href} key={module.href}>
              <span className="account-service-symbol" aria-hidden="true">{module.symbol}</span>
              <strong>{module.title}</strong><p>{module.description}</p>
              <span className="account-service-meta">{module.label}</span>
              <span className="account-service-arrow" aria-hidden="true">↗</span>
            </Link>
          ))}
        </div>
      </section>
      <section className="account-help" aria-label="개인정보와 기관 관리">
        <div><h2>내 계정과 개인정보</h2><p>인증 상태는 Neon Auth에서 관리합니다. 병원 진료내역·보험기록·Google Health 데이터는 이 계정만으로 자동 수집되지 않습니다.</p></div>
        <div><h2>병원 운영자이신가요?</h2><p>일반 Google 로그인은 병원 관리자 권한을 자동 부여하지 않습니다. 기관 입점 검수와 운영 권한 확인 후 별도 관리자 기능을 사용할 수 있습니다.</p><Link href="/clinic-store">병원 스마트스토어 입점안내 →</Link></div>
      </section>
    </main>
  );
}
