import '../auth/auth.css';

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <div className="auth-page">{children}</div>;
}
