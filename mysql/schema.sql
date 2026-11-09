-- 사장님 도우미 MySQL 스키마 (MySQL 8.0.16+ / MariaDB 10.5+)
-- 원칙: 모든 데이터는 store_id를 가지며, 서버(API)가 로그인한 사장님의 가게 행만 읽고 쓰게 한다.
-- (MySQL에는 Postgres의 RLS가 없어서 소유권 검사는 src/lib/db/query.ts 가 맡는다.)
-- 하위 테이블은 (부모 id, store_id) 복합 외래키로 묶어서, 다른 가게의 행을 참조하는 것을 DB가 막는다.
-- 금액은 모두 원 단위 정수로 저장한다. 화면에서 만원으로 바꿔 보여준다.

create table if not exists users (
  id char(36) primary key,
  email varchar(254) not null,
  password_hash varchar(255) not null,
  created_at datetime(3) not null default current_timestamp(3),
  unique key users_email (email)
) engine=InnoDB default charset=utf8mb4;

create table if not exists sessions (
  token_hash char(64) primary key,
  user_id char(36) not null,
  expires_at datetime(3) not null,
  created_at datetime(3) not null default current_timestamp(3),
  key sessions_user (user_id),
  key sessions_exp (expires_at),
  foreign key (user_id) references users(id) on delete cascade
) engine=InnoDB default charset=utf8mb4;

create table if not exists stores (
  id char(36) primary key,
  owner_id char(36) not null,
  name varchar(60) not null default '내 가게' check (char_length(name) between 1 and 60),
  biz_type varchar(10) null check (biz_type in ('cafe','food','pub')),
  status varchar(10) not null default 'run' check (status in ('run','think','closed')),
  opened_before_2025 boolean null,
  annual_sales_man int null check (annual_sales_man >= 0),
  sales_dropped boolean null,
  is_rent boolean null,
  income_tier varchar(10) null check (income_tier in ('low','mid','high','unk')),
  profile_done boolean not null default false,
  created_at datetime(3) not null default current_timestamp(3),
  -- v1은 사장님 1명당 가게 1개. 여러 가게를 지원할 때 이 유니크 키만 제거하면 된다.
  unique key stores_one_per_owner (owner_id),
  foreign key (owner_id) references users(id) on delete cascade
) engine=InnoDB default charset=utf8mb4;

create table if not exists ingredients (
  id char(36) primary key,
  store_id char(36) not null,
  category varchar(30) not null default '공산품',
  vendor varchar(60) not null default '',
  name varchar(80) not null check (char_length(name) between 1 and 80),
  spec_g decimal(14,3) not null check (spec_g > 0),
  price int not null check (price >= 0),
  loss_pct decimal(7,3) not null default 0 check (loss_pct >= 0 and loss_pct < 100),
  stock decimal(14,3) not null default 0 check (stock >= 0),
  order_qty decimal(14,3) not null default 0 check (order_qty >= 0),
  created_at datetime(3) not null default current_timestamp(3),
  unique key ingredients_id_store (id, store_id),
  key ingredients_store (store_id),
  foreign key (store_id) references stores(id) on delete cascade
) engine=InnoDB default charset=utf8mb4;

create table if not exists preps (
  id char(36) primary key,
  store_id char(36) not null,
  name varchar(80) not null check (char_length(name) between 1 and 80),
  yield_g decimal(14,3) not null check (yield_g > 0),
  unique key preps_id_store (id, store_id),
  foreign key (store_id) references stores(id) on delete cascade
) engine=InnoDB default charset=utf8mb4;

create table if not exists prep_rows (
  id char(36) primary key,
  store_id char(36) not null,
  prep_id char(36) not null,
  ingredient_id char(36) not null,
  qty_g decimal(14,3) not null check (qty_g >= 0),
  key prep_rows_store_prep (store_id, prep_id),
  foreign key (store_id) references stores(id) on delete cascade,
  foreign key (prep_id, store_id) references preps(id, store_id) on delete cascade,
  foreign key (ingredient_id, store_id) references ingredients(id, store_id) on delete cascade
) engine=InnoDB default charset=utf8mb4;

create table if not exists menus (
  id char(36) primary key,
  store_id char(36) not null,
  category varchar(20) not null default '식사류' check (category in ('식사류','요리류','사이드·음료')),
  name varchar(80) not null check (char_length(name) between 1 and 80),
  price int not null default 0 check (price >= 0),
  created_at datetime(3) not null default current_timestamp(3),
  unique key menus_id_store (id, store_id),
  key menus_store (store_id),
  foreign key (store_id) references stores(id) on delete cascade
) engine=InnoDB default charset=utf8mb4;

create table if not exists menu_rows (
  id char(36) primary key,
  store_id char(36) not null,
  menu_id char(36) not null,
  ingredient_id char(36) null,
  prep_id char(36) null,
  qty_g decimal(14,3) not null check (qty_g >= 0),
  check ((ingredient_id is not null) + (prep_id is not null) = 1),
  key menu_rows_store_menu (store_id, menu_id),
  foreign key (store_id) references stores(id) on delete cascade,
  foreign key (menu_id, store_id) references menus(id, store_id) on delete cascade,
  foreign key (ingredient_id, store_id) references ingredients(id, store_id) on delete cascade,
  foreign key (prep_id, store_id) references preps(id, store_id) on delete cascade
) engine=InnoDB default charset=utf8mb4;

create table if not exists settlements (
  id char(36) primary key,
  store_id char(36) not null,
  ym char(7) not null check (ym regexp '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  hall_won bigint not null default 0 check (hall_won >= 0),
  deliv_won bigint not null default 0 check (deliv_won >= 0),
  receipts int not null default 0 check (receipts >= 0),
  days int not null default 30 check (days between 1 and 31),
  open_stock_won bigint not null default 0 check (open_stock_won >= 0),
  close_stock_won bigint not null default 0 check (close_stock_won >= 0),
  theory_won bigint not null default 0 check (theory_won >= 0),
  labor_won bigint not null default 0 check (labor_won >= 0),
  ins_won bigint not null default 0 check (ins_won >= 0),
  rent_won bigint not null default 0 check (rent_won >= 0),
  util_won bigint not null default 0 check (util_won >= 0),
  waste_won bigint not null default 0 check (waste_won >= 0),
  etc_won bigint not null default 0 check (etc_won >= 0),
  tax_won bigint not null default 0 check (tax_won >= 0),
  saved_at datetime(3) null,
  unique key settlements_store_ym (store_id, ym),
  unique key settlements_id_store (id, store_id),
  foreign key (store_id) references stores(id) on delete cascade
) engine=InnoDB default charset=utf8mb4;

create table if not exists settlement_purchases (
  id char(36) primary key,
  store_id char(36) not null,
  settlement_id char(36) not null,
  vendor varchar(60) not null check (char_length(vendor) between 1 and 60),
  amount_won bigint not null default 0 check (amount_won >= 0),
  foreign key (store_id) references stores(id) on delete cascade,
  foreign key (settlement_id, store_id) references settlements(id, store_id) on delete cascade
) engine=InnoDB default charset=utf8mb4;

create table if not exists invoices (
  id char(36) primary key,
  store_id char(36) not null,
  vendor varchar(60) not null check (char_length(vendor) between 1 and 60),
  issued_on date not null,
  created_at datetime(3) not null default current_timestamp(3),
  unique key invoices_id_store (id, store_id),
  key invoices_store_date (store_id, issued_on),
  foreign key (store_id) references stores(id) on delete cascade
) engine=InnoDB default charset=utf8mb4;

-- 재료를 지워도 명세서 줄은 남아야 해서 ingredient_id만 null로 만든다.
-- MySQL은 복합 외래키의 일부 열만 SET NULL 할 수 없으므로, 외래키는 ingredient_id 하나로 걸고
-- "같은 가게의 재료인지"는 서버 코드(query.ts, rpc.ts)가 검사한다.
-- (트리거로 막을 수도 있지만, MySQL 기본 설정에서는 SUPER 권한이 없는 사용자가 트리거를 만들 수 없다.)
create table if not exists invoice_items (
  id char(36) primary key,
  store_id char(36) not null,
  invoice_id char(36) not null,
  ingredient_id char(36) null,
  name varchar(80) not null check (char_length(name) between 1 and 80),
  unit_price_won int not null check (unit_price_won >= 0),
  qty decimal(14,3) not null check (qty > 0),
  taxed boolean not null default false,
  key invoice_items_store_invoice (store_id, invoice_id),
  foreign key (store_id) references stores(id) on delete cascade,
  foreign key (invoice_id, store_id) references invoices(id, store_id) on delete cascade,
  foreign key (ingredient_id) references ingredients(id) on delete set null
) engine=InnoDB default charset=utf8mb4;

create table if not exists checklist_checks (
  store_id char(36) not null,
  ym char(7) not null check (ym regexp '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  idx smallint not null check (idx between 0 and 19),
  checked boolean not null default true,
  primary key (store_id, ym, idx),
  foreign key (store_id) references stores(id) on delete cascade
) engine=InnoDB default charset=utf8mb4;
