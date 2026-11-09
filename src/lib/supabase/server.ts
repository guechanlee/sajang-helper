import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAnonKey, supabaseUrl } from './env';

export async function sbServer() {
  const store = await cookies();
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* 서버 컴포넌트에서는 쿠키를 못 쓴다. 미들웨어가 갱신한다. */ }
      },
    },
  });
}
