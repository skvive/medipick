'use client';

import { authClient } from '@/lib/auth/client';
import { useState } from 'react';

type Props = {
  callbackURL?: string;
  errorURL?: string;
};

export function OAuthButtons({ callbackURL = '/', errorURL = '/auth/sign-in' }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function social(provider: 'google' | 'github' | 'vercel') {
    setErr(null);
    setBusy(provider);
    try {
      await authClient.signIn.social({
        provider,
        callbackURL,
        errorCallbackURL: errorURL,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'OAuth 로그인에 실패했습니다.');
      setBusy(null);
    }
  }

  return (
    <div className="auth-oauth">
      <button
        type="button"
        className="auth-oauth-btn google"
        disabled={!!busy}
        onClick={() => social('google')}
      >
        {busy === 'google' ? '연결 중…' : 'Google로 계속하기'}
      </button>
      <button
        type="button"
        className="auth-oauth-btn github"
        disabled={!!busy}
        onClick={() => social('github')}
      >
        {busy === 'github' ? '연결 중…' : 'GitHub로 계속하기'}
      </button>
      <button
        type="button"
        className="auth-oauth-btn vercel"
        disabled={!!busy}
        onClick={() => social('vercel')}
      >
        {busy === 'vercel' ? '연결 중…' : 'Vercel로 계속하기'}
      </button>
      {err ? <p className="auth-error">{err}</p> : null}
      <p className="auth-oauth-note">
        Google은 Neon 개발용 공유 OAuth로 바로 테스트할 수 있습니다. GitHub·Vercel은 Neon Console에서 OAuth
        앱을 등록해야 합니다.
      </p>
    </div>
  );
}
