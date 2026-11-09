import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/db/auth';
import { isConfigured } from '@/lib/db/env';
import LoginForm from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function Login() {
  if (!isConfigured()) {
    return <div id="app"><div className="note">서비스 설정이 아직 끝나지 않았어요. README의 &quot;처음 설정&quot;을 확인해 주세요.</div></div>;
  }
  if (await getSessionUser()) redirect('/home');
  return (
    <div id="app">
      <div className="top"><span className="brand">사장님 도우미</span></div>
      <LoginForm />
      <div className="note">가입하면 <a href="/privacy">개인정보 처리 안내</a>를 읽은 것으로 봐요.</div>
    </div>
  );
}
