'use server';

import { auth } from '@/lib/auth/server';
import { redirect } from 'next/navigation';

export async function signInWithEmail(
  _prev: { error: string } | null,
  formData: FormData,
): Promise<{ error: string } | null> {
  const { error } = await auth.signIn.email({
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
  });

  if (error) {
    return { error: error.message || '로그인에 실패했습니다.' };
  }

  redirect('/');
}

export async function signOutAction() {
  await auth.signOut();
  redirect('/');
}
