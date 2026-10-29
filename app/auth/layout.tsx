import './auth.css';
import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-page">
      <div>
        <Link href="/" className="auth-back">
          ← 메디픽 홈
        </Link>
        {children}
      </div>
    </div>
  );
}
