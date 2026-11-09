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

## 정부 지원사업 공고 연동 (기업마당)
지원금 화면 아래에 기업마당의 정부·지자체 공고를 내 가게(업종·상황·지역)에 맞게 걸러 보여준다. 공고는 DB의 `programs` 표에 저장해 두고 쓴다.
1. [기업마당](https://www.bizinfo.go.kr)에서 **정책정보 개방(Open API) 사용 신청**을 하고 인증키를 받는다(무료). 신청서의 시스템 URL에는 `https://localhost`를 써도 된다고 안내돼 있다.
2. 키를 넣는다. 직접 설치: `.env.local`에 `BIZINFO_API_KEY=키`. Docker: `docker-compose.yml`과 같은 폴더에 `.env` 파일을 만들어 `BIZINFO_API_KEY=키`.
3. 공고를 가져온다. 직접 설치: `npm run programs:sync` / Docker: `docker compose exec app node scripts/sync-programs.mjs`. 하루 한 번쯤 cron 등으로 돌리면 충분하다. 마감 후 60일이 지난 공고는 동기화할 때 지운다.
4. 지원금 화면에서 "가게가 있는 지역"을 고르면 우리 지역 공고도 보인다(안 고르면 전국 공고만).

걸러 내는 기준은 `src/lib/programs.ts`에 있다: 마감 지난 공고 제외, 다른 지역 공고 제외, 소상공인·외식 관련 키워드로 점수, 연구개발·수출 등은 감점, 폐업 전용 공고는 운영 중인 가게에서 제외. **자격 판정이 아니라 찾아볼 만한 목록**이고, 목록에는 원문 링크와 "원문에서 조건 확인" 안내를 함께 보여준다.

## 계정 만들기·비밀번호 재설정
가입 화면 대신 터미널에서 계정을 만들 수 있고, 이미 있는 이메일이면 비밀번호만 바꾼다(재설정 기능이 없어서 이걸 쓴다).
```
docker compose exec app node scripts/create-user.mjs 이메일 비밀번호   # Docker
npm run user:create -- 이메일 비밀번호                                  # 직접 설치
```
이 계정도 일반 계정이라 자기 가게 데이터만 본다(관리자 권한 기능은 없다).

## 명령
- `npm run dev` / `build` / `start`
- `npm run typecheck`
- `npm run db:init` — 표·트리거 생성
- `npm test` — 계산 로직 테스트. DB 테스트는 **빈 테스트용 DB**를 `TEST_DATABASE_URL`로 주면 같이 돈다(그 DB의 표를 비우고 시작하니 개발용 DB 주소는 넣지 말 것). 예: `TEST_DATABASE_URL=mysql://sajang:비밀번호@localhost/sajang_test npm test`

## 지금 되는 것 / 안 되는 것
- 이메일 + 비밀번호 로그인(비밀번호는 scrypt 해시, 세션은 DB 저장 + httpOnly 쿠키), 가게 1개(계정당), 서버 저장, 데이터 내려받기/전체 삭제
- 거래명세서는 직접 입력만. **사진 인식(OCR)은 없다.**
- 계정 자체 삭제 기능 없음(데이터 삭제만).
- 공고 연동은 가짜 API 서버로만 검증했다. 기업마당 응답 항목 이름은 공개된 예제 코드 기준이라, **실제 키로 처음 돌릴 때 `programs:sync` 결과를 확인**해야 한다. K-Startup(창업 지원) 공고는 아직 연동하지 않았다.
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
