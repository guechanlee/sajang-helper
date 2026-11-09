-- 여러 표를 한 번에 바꾸는 저장은 DB 함수 한 번으로 처리한다(중간에 끊겨도 반쪽만 저장되지 않는다).
-- security invoker: 호출한 사용자의 권한(RLS)이 그대로 적용된다.

create or replace function public.save_invoice(
  p_store uuid, p_vendor text, p_date date, p_items jsonb, p_stock_in boolean default true
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid; it jsonb; v_ing uuid; v_price integer; v_qty numeric;
begin
  if not public.owns_store(p_store) then
    raise exception 'not your store' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 200 then
    raise exception 'invalid items' using errcode = '22023';
  end if;

  insert into public.invoices(store_id, vendor, issued_on) values (p_store, p_vendor, p_date) returning id into v_id;

  for it in select * from jsonb_array_elements(p_items) loop
    v_ing := nullif(it->>'ingredient_id', '')::uuid;
    v_price := (it->>'unit_price_won')::integer;
    v_qty := (it->>'qty')::numeric;
    insert into public.invoice_items(store_id, invoice_id, ingredient_id, name, unit_price_won, qty, taxed)
      values (p_store, v_id, v_ing, it->>'name', v_price, v_qty, coalesce((it->>'taxed')::boolean, false));
    if v_ing is not null then
      if v_price > 0 then
        update public.ingredients set price = v_price where id = v_ing and store_id = p_store;
      end if;
      if p_stock_in then
        update public.ingredients set stock = stock + v_qty, order_qty = 0 where id = v_ing and store_id = p_store;
      end if;
    end if;
  end loop;
  return v_id;
end $$;

create or replace function public.save_settlement(
  p_store uuid, p_ym text, p_s jsonb, p_purchases jsonb
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid; p jsonb;
  n bigint;
begin
  if not public.owns_store(p_store) then
    raise exception 'not your store' using errcode = '42501';
  end if;
  if jsonb_typeof(p_purchases) <> 'array' or jsonb_array_length(p_purchases) > 100 then
    raise exception 'invalid purchases' using errcode = '22023';
  end if;

  insert into public.settlements(store_id, ym, hall_won, deliv_won, receipts, days, open_stock_won, close_stock_won,
    theory_won, labor_won, ins_won, rent_won, util_won, waste_won, etc_won, tax_won, saved_at)
  values (p_store, p_ym,
    coalesce((p_s->>'hall_won')::bigint, 0), coalesce((p_s->>'deliv_won')::bigint, 0),
    coalesce((p_s->>'receipts')::integer, 0), coalesce((p_s->>'days')::integer, 30),
    coalesce((p_s->>'open_stock_won')::bigint, 0), coalesce((p_s->>'close_stock_won')::bigint, 0),
    coalesce((p_s->>'theory_won')::bigint, 0), coalesce((p_s->>'labor_won')::bigint, 0),
    coalesce((p_s->>'ins_won')::bigint, 0), coalesce((p_s->>'rent_won')::bigint, 0),
    coalesce((p_s->>'util_won')::bigint, 0), coalesce((p_s->>'waste_won')::bigint, 0),
    coalesce((p_s->>'etc_won')::bigint, 0), coalesce((p_s->>'tax_won')::bigint, 0), now())
  on conflict (store_id, ym) do update set
    hall_won = excluded.hall_won, deliv_won = excluded.deliv_won, receipts = excluded.receipts, days = excluded.days,
    open_stock_won = excluded.open_stock_won, close_stock_won = excluded.close_stock_won, theory_won = excluded.theory_won,
    labor_won = excluded.labor_won, ins_won = excluded.ins_won, rent_won = excluded.rent_won, util_won = excluded.util_won,
    waste_won = excluded.waste_won, etc_won = excluded.etc_won, tax_won = excluded.tax_won, saved_at = now()
  returning id into v_id;

  delete from public.settlement_purchases where settlement_id = v_id and store_id = p_store;
  for p in select * from jsonb_array_elements(p_purchases) loop
    insert into public.settlement_purchases(store_id, settlement_id, vendor, amount_won)
      values (p_store, v_id, p->>'vendor', coalesce((p->>'amount_won')::bigint, 0));
  end loop;
  return v_id;
end $$;

revoke all on function public.save_invoice(uuid, text, date, jsonb, boolean) from public, anon;
revoke all on function public.save_settlement(uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.save_invoice(uuid, text, date, jsonb, boolean) to authenticated;
grant execute on function public.save_settlement(uuid, text, jsonb, jsonb) to authenticated;
