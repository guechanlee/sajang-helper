import { redirect } from 'next/navigation';
import { StoreProvider } from '@/components/StoreProvider';
import { Tabs } from '@/components/Tabs';
import { isConfigured } from '@/lib/supabase/env';
import { sbServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!isConfigured()) redirect('/');
  const { data } = await (await sbServer()).auth.getUser();
  if (!data.user) redirect('/login');
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
