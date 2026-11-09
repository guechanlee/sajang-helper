'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// 장부 탭 안의 세 화면(명세서·재고·월 정산)을 오가는 위쪽 버튼.
const ITEMS: [string, string][] = [['/invoices', '명세서'], ['/stock', '재고·발주'], ['/month', '월 정산']];

export function LedgerNav() {
  const path = usePathname();
  return (
    <div className="seg" role="navigation" aria-label="장부">
      {ITEMS.map(([href, label]) => <Link key={href} href={href} aria-current={path === href ? 'page' : undefined}>{label}</Link>)}
    </div>
  );
}
