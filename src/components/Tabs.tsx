'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS: [string, string, string][] = [
  ['/subsidy', '지원금', 'M12 3v18M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3 2 2.7 4.5 3 4.5 1.3 4.5 3-2 3-4.5 3-4.5-1.3-4.5-3'],
  ['/cost', '원가', 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 7h8M8 11h2M12 11h2M8 15h2M12 15h2'],
  ['/month', '월 정산', 'M4 20V10M10 20V4M16 20v-8M22 20H2'],
  ['/invoices', '매입', 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6'],
  ['/stock', '재고', 'M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8'],
  ['/alerts', '알림', 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4'],
];

export function Tabs() {
  const path = usePathname();
  return (
    <nav className="tabs" aria-label="메뉴">
      <div id="tabs">
        {TABS.map(([href, label, d]) => (
          <Link key={href} href={href} className="tab" aria-current={path === href ? 'page' : undefined}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
