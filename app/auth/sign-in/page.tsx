import Link from 'next/link';
import { OAuthButtons } from '../OAuthButtons';
import { auth } from '@/lib/auth/server';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export default async function SignInPage() {
  const { data: session } = await auth.getSession();
  if (session?.user) redirect('/account');
  return (
    <div className="auth-card">
      <div className="auth-brand">
        <span className="auth-brand-mark">✚</span>
        MediPick <span className="auth-brand-sub">메디픽</span>
      </div>
      <span className="auth-eyebrow">SIMPLE & SECURE SIGN IN</span>
      <h1>메디픽에 오신 것을 환영합니다.</h1>
      <p className="sub">Google 계정 하나로 로그인하고 내 건강노트와 병원·약국 검색을 한곳에서 이용하세요.</p>
      <OAuthButtons callbackURL="/account" errorURL="/auth/sign-in" />
      <p className="auth-foot">별도 이메일 비밀번호 없이 Google 계정으로 가입과 로그인이 가능합니다.</p>
      <p className="auth-links"><Link href="/">메디픽 홈으로 돌아가기</Link></p>
    </div>
  );
}
