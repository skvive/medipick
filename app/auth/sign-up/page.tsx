'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { OAuthButtons } from '../OAuthButtons';
import { signUpWithEmail } from './actions';

export default function SignUpPage() {
  const [state, formAction, pending] = useActionState(signUpWithEmail, null);

  return (
    <div className="auth-card">
      <div className="auth-brand">
        <span className="auth-brand-mark">P</span>
        medipick
      </div>
      <h1>회원가입</h1>
      <p className="sub">후기·예약·건강노트 등 개인 기능을 위해 계정을 만듭니다.</p>

      <OAuthButtons callbackURL="/" errorURL="/auth/sign-in" />

      <div className="auth-divider">또는 이메일</div>

      <form action={formAction}>
        <div className="auth-field">
          <label htmlFor="name">이름</label>
          <input id="name" name="name" type="text" required autoComplete="name" placeholder="홍길동" />
        </div>
        <div className="auth-field">
          <label htmlFor="email">이메일</label>
          <input id="email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
        </div>
        <div className="auth-field">
          <label htmlFor="password">비밀번호 (8자 이상)</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="••••••••"
          />
        </div>
        {state?.error ? <p className="auth-error">{state.error}</p> : null}
        <button className="auth-submit" type="submit" disabled={pending}>
          {pending ? '가입 중…' : '이메일로 가입하기'}
        </button>
      </form>

      <p className="auth-foot">
        이미 계정이 있으신가요? <Link href="/auth/sign-in">로그인</Link>
      </p>
    </div>
  );
}
