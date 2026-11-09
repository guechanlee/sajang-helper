'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const TABS: { href: string; label: string; icon: string; match: string[] }[] = [
  { href: '/home', label: '홈', icon: 'M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z', match: ['/home'] },
  { href: '/cost', label: '원가', icon: 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 7h8M8 11h2M12 11h2M8 15h2M12 15h2', match: ['/cost'] },
  { href: '/invoices', label: '장부', icon: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6', match: ['/invoices', '/stock', '/month'] },
  { href: '/more', label: '더보기', icon: 'M6 12m-1.3 0a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0 -2.6 0 M12 12m-1.3 0a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0 -2.6 0 M18 12m-1.3 0a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0 -2.6 0', match: ['/more', '/subsidy', '/reviews'] },
];

export function Tabs() {
  const path = usePathname();
  // 숫자 칸에서 마우스 휠을 돌리면 값이 바뀌는 것을 막는다.
  useEffect(() => {
    const h = () => { const a = document.activeElement; if (a instanceof HTMLInputElement && a.type === 'number') a.blur(); };
    document.addEventListener('wheel', h, { passive: true }); return () => document.removeEventListener('wheel', h);
  }, []);
  return (
    <nav className="tabs" aria-label="메뉴">
      <div id="tabs">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className="tab" aria-current={t.match.includes(path) ? 'page' : undefined}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={t.icon} /></svg>
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
