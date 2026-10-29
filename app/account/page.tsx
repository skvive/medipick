import { auth } from '@/lib/auth/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { signOutAction } from '@/app/auth/sign-in/actions';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const { data: session } = await auth.getSession();

  if (!session?.user) {
    redirect('/auth/sign-in');
  }

  const user = session.user;

  return (
    <div className="auth-card">
      <div className="auth-brand">
        <span className="auth-brand-mark">P</span>
        medipick
      </div>
      <h1>내 계정</h1>
      <p className="sub">
        <strong>{user.name || '이용자'}</strong>
        <br />
        {user.email}
      </p>
      <form action={signOutAction}>
        <button className="auth-submit" type="submit">
          로그아웃
        </button>
      </form>
      <p className="auth-foot">
        <Link href="/">홈으로</Link>
      </p>
    </div>
  );
}
