# 사장님 도우미 (sajang-helper)

자영업자용 웹앱: 지원금 찾기 · 메뉴 원가 · 월 정산 · 매입(거래명세서) · 재고/발주 · 알림.
Next.js 15 (App Router) + Supabase (Postgres, Auth, RLS).

## 처음 설정
1. [Supabase](https://supabase.com)에서 프로젝트를 만든다.
2. SQL Editor에서 `supabase/migrations/0001_init.sql`, 이어서 `0002_functions.sql`을 순서대로 실행한다.
3. Authentication → URL Configuration에 Site URL과 Redirect URL(`<SITE_URL>/auth/callback`)을 등록한다.
4. `.env.example`을 `.env.local`로 복사해 값을 채운다 (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`).
5. `npm install && npm run dev`

**`service_role` 키는 절대 브라우저/`NEXT_PUBLIC_*`에 넣지 않는다.** 모든 접근은 anon 키 + 로그인 사용자 + RLS로 막는다.

## 명령
- `npm run dev` / `build` / `start`
- `npm run typecheck`
- `npm test` — 계산 로직 + DB(PGlite)로 RLS·제약·함수 검증

## 지금 되는 것 / 안 되는 것
- 이메일 링크 로그인, 가게 1개(계정당), 서버 저장, 데이터 내려받기/전체 삭제
- 거래명세서는 직접 입력만. **사진 인식(OCR)은 없다.**
- 계정 자체 삭제 기능 없음(데이터 삭제만).
- 지원금 규칙(`src/lib/subsidy.ts`)은 뉴스·블로그 기반이라 **공식 공고로 확인 필요**. `RULES_CHECKED_ON` 참고.
- `/privacy`는 초안이다. 공개 전 검토가 필요하다.
- 실제 Supabase 인스턴스에 붙여 화면을 돌려 보지는 않았다(DB 로직은 PGlite로 검증).

## 알려진 의존성 경고 (`npm audit`)
- `postcss`(next 내부): 빌드 시 CSS 처리 관련. 외부 CSS를 처리하지 않으므로 영향은 낮지만, Next 상위 버전이 안정되면 올린다.
- `vitest`/`tinypool`: 개발 전용(배포물에 없음).
- CSP는 Next 때문에 `script-src 'unsafe-inline'`을 쓴다. nonce 방식은 다음 강화 과제.
