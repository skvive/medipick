'use client';

import { authClient } from '@/lib/auth/client';
import { useState } from 'react';

type Props = { callbackURL?: string; errorURL?: string };

export function OAuthButtons({ callbackURL = '/account', errorURL = '/auth/sign-in' }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInGoogle() {
    if (busy) return;
    setBusy(true);setError(null);
    try {
      const response = await authClient.signIn.social({
        provider: 'google',
        callbackURL,
        errorCallbackURL: errorURL,
      });
      if (response?.error) {
        setError(response.error.message || 'Google 로그인 연결을 확인해 주세요.');
        setBusy(false);
      }
    } catch {
      setError('Google 로그인 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      setBusy(false);
    }
  }

  return (
    <div className="auth-oauth">
      <button type="button" className="auth-oauth-btn google" disabled={busy} onClick={signInGoogle} aria-busy={busy}>
        <span className="auth-google-icon" aria-hidden="true">G</span>
        <span>{busy ? 'Google 계정에 연결 중…' : 'Google로 계속하기'}</span>
      </button>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      <p className="auth-oauth-note">
        Google 인증은 Neon Auth를 통해 진행됩니다. 메디픽이 Google 비밀번호를 수집하지 않습니다.
      </p>
    </div>
  );
}
