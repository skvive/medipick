import '../auth/auth.css';
import '../../web/assets/unified-navigation.css';

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="account-page">{children}</div>
      <script defer src="/assets/site-chrome.js" />
    </>
  );
}
