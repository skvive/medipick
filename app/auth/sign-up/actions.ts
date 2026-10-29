'use server';

import { auth } from '@/lib/auth/server';
import { redirect } from 'next/navigation';

export async function signUpWithEmail(
  _prev: { error: string } | null,
  formData: FormData,
): Promise<{ error: string } | null> {
  const email = String(formData.get('email') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !name || password.length < 8) {
    return { error: '이름·이메일·비밀번호(8자 이상)를 확인해 주세요.' };
  }

  const { error } = await auth.signUp.email({ email, name, password });

  if (error) {
    return { error: error.message || '회원가입에 실패했습니다.' };
  }

  redirect('/');
}
