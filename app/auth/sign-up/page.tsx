import Link from 'next/link';
import { OAuthButtons } from '../OAuthButtons';
import { auth } from '@/lib/auth/server';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export default async function SignUpPage() {
  const { data: session } = await auth.getSession();
  if (session?.user) redirect('/account');
  return (
    <div className="auth-card">
      <div className="auth-brand"><span className="auth-brand-mark">✚</span>MediPick <span className="auth-brand-sub">메디픽</span></div>
      <span className="auth-eyebrow">ONE ACCOUNT · GOOGLE</span>
      <h1>Google 계정으로 시작하기</h1>
      <p className="sub">회원가입 양식을 입력할 필요 없이 Google로 계속하기만 선택하세요.</p>
      <OAuthButtons callbackURL="/account" errorURL="/auth/sign-in" />
      <p className="auth-foot">이미 가입한 Google 계정이라면 같은 버튼으로 로그인됩니다.</p>
      <p className="auth-links"><Link href="/">메디픽 홈</Link></p>
    </div>
  );
}
