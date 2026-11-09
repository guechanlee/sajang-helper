# 사장님 도우미 (sajang-helper)

자영업자용 웹앱: 지원금 찾기 · 메뉴 원가 · 월 정산 · 매입(거래명세서) · 재고/발주 · 알림.
Next.js 15 (App Router) + MySQL (mysql2). 로그인은 이메일 + 비밀번호.

## 가장 쉬운 실행 (Docker)
Docker Desktop이 있으면 DB까지 한 번에 뜬다.
```
git clone https://github.com/guechanlee/sajang-helper.git
cd sajang-helper
docker compose up --build
```
`http://localhost:3000`을 열고 "시작하기" → "처음이에요 (가입)". 데이터는 Docker 볼륨(`dbdata`)에 남고, `docker compose down -v`로 지운다. (이 설정은 문법 검증만 했고 실제 Docker로 띄워 보지는 못했다.)

## 직접 설치해서 실행
1. MySQL 8.0.16 이상(또는 MariaDB 10.5 이상)을 준비하고, 빈 데이터베이스와 사용자를 만든다.
   ```sql
   CREATE DATABASE sajang CHARACTER SET utf8mb4;
   CREATE USER 'sajang'@'localhost' IDENTIFIED BY '비밀번호';
   GRANT ALL ON sajang.* TO 'sajang'@'localhost';
   ```
2. `.env.example`을 `.env.local`로 복사해 `DATABASE_URL`을 채운다 (`mysql://sajang:비밀번호@localhost:3306/sajang`).
3. `npm install && npm run db:init && npm run dev` — `db:init`이 표를 만든다(여러 번 실행해도 안전).
4. `http://localhost:3000`에서 "시작하기" → "처음이에요 (가입)".

브라우저는 DB에 직접 붙지 않는다. 모든 요청은 `/api/db`·`/api/rpc`를 거치고, 서버가 로그인 세션을 확인한 뒤 **내 가게의 행만** 읽고 쓰게 조건을 붙인다(Postgres의 RLS를 서버 코드로 옮긴 것). 표·열 이름은 `src/lib/db/schema.ts`의 목록에 있는 것만 SQL에 들어가고, 값은 항상 `?`로 넘긴다.

## 계정 만들기·비밀번호 재설정
가입 화면 대신 터미널에서 계정을 만들 수 있고, 이미 있는 이메일이면 비밀번호만 바꾼다(재설정 기능이 없어서 이걸 쓴다).
```
docker compose exec app node scripts/create-user.mjs 이메일 비밀번호   # Docker
npm run user:create -- 이메일 비밀번호                                  # 직접 설치
```
이 계정도 일반 계정이라 자기 가게 데이터만 본다(관리자 권한 기능은 없다).

## 백업·복원 (Docker)

데이터는 `dbdata` 볼륨에 있어요. `docker compose down -v`를 하면 지워지니 주의하세요. 가끔 백업해 두세요.

```
docker compose exec db mysqldump -uroot -proot-local-only sajang > backup.sql
docker compose exec -T db mysql -uroot -proot-local-only sajang < backup.sql   # 복원
```

## 가게 등록·스마트플레이스·리뷰

- **더보기 탭**에서 가게 이름·주소·전화·사업자등록번호를 저장하고, 네이버 플레이스 주소를 넣어 두면 스마트플레이스와 내 플레이스 페이지를 바로 열어요.
- 네이버는 외부 앱이 스마트플레이스에 로그인하거나 리뷰를 자동으로 가져올 공개 API를 제공하지 않아요(제휴 업체용 연동만 있어요). 그래서 이 앱은 **로그인을 대신하지 않고**, 리뷰도 자동 수집하지 않아요. 스크래핑은 이용약관 위반이 될 수 있어 하지 않았어요.
- **리뷰 탭**: 리뷰를 직접 복사해 기록하면 평균 별점, 미답변 목록, 별점별 답글 초안을 보여줘요. 답글은 스마트플레이스에서 직접 등록해요.
- 이미 쓰던 DB는 `npm run db:init`(Docker는 재시작)이 새 열과 `reviews` 표를 자동으로 더해요.

## 명령
- `npm run dev` / `build` / `start`
- `npm run typecheck`
- `npm run db:init` — 표·트리거 생성
- `npm test` — 계산 로직 테스트. DB 테스트는 **빈 테스트용 DB**를 `TEST_DATABASE_URL`로 주면 같이 돈다(그 DB의 표를 비우고 시작하니 개발용 DB 주소는 넣지 말 것). 예: `TEST_DATABASE_URL=mysql://sajang:비밀번호@localhost/sajang_test npm test`

## 지금 되는 것 / 안 되는 것
- 이메일 + 비밀번호 로그인(비밀번호는 scrypt 해시, 세션은 DB 저장 + httpOnly 쿠키), 가게 1개(계정당), 서버 저장, 데이터 내려받기/전체 삭제
- 거래명세서는 직접 입력만. **사진 인식(OCR)은 없다.**
- 계정 자체 삭제 기능 없음(데이터 삭제만).
- 지원금 규칙(`src/lib/subsidy.ts`)은 뉴스·블로그 기반이라 **공식 공고로 확인 필요**. `RULES_CHECKED_ON` 참고.
- `/privacy`는 초안이다. 공개 전 검토가 필요하다.
- 비밀번호 재설정(메일 발송)은 없다. 비밀번호를 잊으면 운영자가 DB에서 직접 바꿔야 한다.
- 로그인 실패 횟수 제한은 서버 메모리 기준이라 서버를 여러 대 두면 DB/Redis로 옮겨야 한다.
- Supabase 시절의 스키마를 MySQL로 옮겼다(`mysql/schema.sql`). 기존 Supabase 데이터를 옮기는 스크립트는 없다.
- 자동 테스트와 화면 점검은 MariaDB 10.11에서 했다. MySQL 8 실서버에서는 아직 돌려 보지 않았다.

## 알려진 의존성 경고 (`npm audit`)
- `postcss`(next 내부): 빌드 시 CSS 처리 관련. 외부 CSS를 처리하지 않으므로 영향은 낮지만, Next 상위 버전이 안정되면 올린다.
- `vitest`/`tinypool`: 개발 전용(배포물에 없음).
- CSP는 Next 때문에 `script-src 'unsafe-inline'`을 쓴다. nonce 방식은 다음 강화 과제.
