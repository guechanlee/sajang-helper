-- 사장님 도우미 v1 스키마
-- 원칙: 모든 데이터는 store_id를 가지며, 가게 주인(auth.uid())만 읽고 쓸 수 있다.
-- 하위 테이블은 (부모 id, store_id) 복합 외래키로 묶어서, 다른 가게의 행을 참조하는 것을 DB가 막는다.
-- 금액은 모두 원(bigint/integer) 단위로 저장한다. 화면에서 만원으로 바꿔 보여준다.

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '내 가게' check (char_length(name) between 1 and 60),
  biz_type text check (biz_type in ('cafe','food','pub')),
  status text not null default 'run' check (status in ('run','think','closed')),
  opened_before_2025 boolean,
  annual_sales_man integer check (annual_sales_man >= 0),
  sales_dropped boolean,
  is_rent boolean,
  income_tier text check (income_tier in ('low','mid','high','unk')),
  profile_done boolean not null default false,
  created_at timestamptz not null default now()
);
-- v1은 사장님 1명당 가게 1개. 여러 가게를 지원할 때 이 인덱스만 제거하면 된다.
create unique index stores_one_per_owner on public.stores(owner_id);

create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  category text not null default '공산품' check (char_length(category) <= 30),
  vendor text not null default '' check (char_length(vendor) <= 60),
  name text not null check (char_length(name) between 1 and 80),
  spec_g numeric not null check (spec_g > 0),          -- 한 포장 무게(g)
  price integer not null check (price >= 0),            -- 한 포장 가격(원)
  loss_pct numeric not null default 0 check (loss_pct >= 0 and loss_pct < 100),
  stock numeric not null default 0 check (stock >= 0),  -- 남은 수량(포장 단위)
  order_qty numeric not null default 0 check (order_qty >= 0),
  created_at timestamptz not null default now(),
  unique (id, store_id)
);

create table public.preps (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  yield_g numeric not null check (yield_g > 0),
  unique (id, store_id)
);

create table public.prep_rows (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  prep_id uuid not null,
  ingredient_id uuid not null,
  qty_g numeric not null check (qty_g >= 0),
  foreign key (prep_id, store_id) references public.preps(id, store_id) on delete cascade,
  foreign key (ingredient_id, store_id) references public.ingredients(id, store_id) on delete cascade
);

create table public.menus (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  category text not null default '식사류' check (category in ('식사류','요리류','사이드·음료')),
  name text not null check (char_length(name) between 1 and 80),
  price integer not null default 0 check (price >= 0),
  created_at timestamptz not null default now(),
  unique (id, store_id)
);

create table public.menu_rows (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  menu_id uuid not null,
  ingredient_id uuid,
  prep_id uuid,
  qty_g numeric not null check (qty_g >= 0),
  check ((ingredient_id is not null)::int + (prep_id is not null)::int = 1),
  foreign key (menu_id, store_id) references public.menus(id, store_id) on delete cascade,
  foreign key (ingredient_id, store_id) references public.ingredients(id, store_id) on delete cascade,
  foreign key (prep_id, store_id) references public.preps(id, store_id) on delete cascade
);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  ym text not null check (ym ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  hall_won bigint not null default 0 check (hall_won >= 0),
  deliv_won bigint not null default 0 check (deliv_won >= 0),
  receipts integer not null default 0 check (receipts >= 0),
  days integer not null default 30 check (days between 1 and 31),
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
  saved_at timestamptz,
  unique (store_id, ym),
  unique (id, store_id)
);

create table public.settlement_purchases (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  settlement_id uuid not null,
  vendor text not null check (char_length(vendor) between 1 and 60),
  amount_won bigint not null default 0 check (amount_won >= 0),
  foreign key (settlement_id, store_id) references public.settlements(id, store_id) on delete cascade
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  vendor text not null check (char_length(vendor) between 1 and 60),
  issued_on date not null,
  created_at timestamptz not null default now(),
  unique (id, store_id)
);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  invoice_id uuid not null,
  ingredient_id uuid,
  name text not null check (char_length(name) between 1 and 80),
  unit_price_won integer not null check (unit_price_won >= 0),
  qty numeric not null check (qty > 0),
  taxed boolean not null default false,
  foreign key (invoice_id, store_id) references public.invoices(id, store_id) on delete cascade,
  foreign key (ingredient_id, store_id) references public.ingredients(id, store_id) on delete set null (ingredient_id)
);

create table public.checklist_checks (
  store_id uuid not null references public.stores(id) on delete cascade,
  ym text not null check (ym ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  idx smallint not null check (idx between 0 and 19),
  checked boolean not null default true,
  primary key (store_id, ym, idx)
);

create index on public.ingredients(store_id);
create index on public.menus(store_id);
create index on public.menu_rows(store_id, menu_id);
create index on public.prep_rows(store_id, prep_id);
create index on public.invoices(store_id, issued_on);
create index on public.invoice_items(store_id, invoice_id);
create index on public.settlements(store_id, ym);

-- 가게 주인 확인 함수. RLS 정책에서 재귀 없이 쓰려고 security definer.
create or replace function public.owns_store(sid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.stores s where s.id = sid and s.owner_id = (select auth.uid()));
$$;
revoke all on function public.owns_store(uuid) from public, anon;
grant execute on function public.owns_store(uuid) to authenticated;

-- RLS: 켜고, 가게 주인만 모든 행에 접근
alter table public.stores enable row level security;
create policy stores_owner on public.stores for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['ingredients','preps','prep_rows','menus','menu_rows','settlements',
                           'settlement_purchases','invoices','invoice_items','checklist_checks']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.owns_store(store_id)) with check (public.owns_store(store_id))', t || '_owner', t);
  end loop;
end $$;

-- 로그인하지 않은 사용자(anon)에게는 아무 권한도 주지 않는다.
revoke all on all tables in schema public from anon;

-- 가입하면 빈 가게를 하나 만든다.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.stores (owner_id) values (new.id) on conflict do nothing;
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
