import { redirect } from 'next/navigation';
import { StoreProvider } from '@/components/StoreProvider';
import { Tabs } from '@/components/Tabs';
import { getSessionUser } from '@/lib/db/auth';
import { isConfigured } from '@/lib/db/env';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!isConfigured()) redirect('/');
  if (!(await getSessionUser())) redirect('/login');
  return (
    <>
      <div id="app">
        <div className="top">
          <span className="brand">사장님 도우미</span>
          <form action="/auth/signout" method="post"><button className="xbtn" style={{ fontSize: 13 }} type="submit">로그아웃</button></form>
        </div>
        <main><StoreProvider>{children}</StoreProvider></main>
      </div>
      <Tabs />
    </>
  );
}
