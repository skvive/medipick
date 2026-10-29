'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { OAuthButtons } from '../OAuthButtons';
import { signInWithEmail } from './actions';

export default function SignInPage() {
  const [state, formAction, pending] = useActionState(signInWithEmail, null);

  return (
    <div className="auth-card">
      <div className="auth-brand">
        <span className="auth-brand-mark">P</span>
        medipick
      </div>
      <h1>로그인</h1>
      <p className="sub">Neon Auth · Google·GitHub·Vercel OAuth 또는 이메일로 로그인합니다.</p>

      <OAuthButtons callbackURL="/" errorURL="/auth/sign-in" />

      <div className="auth-divider">또는 이메일</div>

      <form action={formAction}>
        <div className="auth-field">
          <label htmlFor="email">이메일</label>
          <input id="email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
        </div>
        <div className="auth-field">
          <label htmlFor="password">비밀번호</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
          />
        </div>
        {state?.error ? <p className="auth-error">{state.error}</p> : null}
        <button className="auth-submit" type="submit" disabled={pending}>
          {pending ? '로그인 중…' : '이메일로 로그인'}
        </button>
      </form>

      <p className="auth-foot">
        계정이 없으신가요? <Link href="/auth/sign-up">회원가입</Link>
      </p>
    </div>
  );
}
