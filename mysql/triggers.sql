-- 트리거는 본문 안에 ';'가 있어서 줄 하나가 '//' 인 곳을 기준으로 나눠 실행한다(scripts/db-init.mjs).
-- invoice_items.ingredient_id가 같은 가게의 재료인지 검사한다.
drop trigger if exists invoice_items_same_store_ins
//
drop trigger if exists invoice_items_same_store_upd
//
create trigger invoice_items_same_store_ins before insert on invoice_items
for each row begin
  if new.ingredient_id is not null and not exists (
    select 1 from ingredients where id = new.ingredient_id and store_id = new.store_id) then
    signal sqlstate '45000' set message_text = 'ingredient belongs to another store';
  end if;
end
//
create trigger invoice_items_same_store_upd before update on invoice_items
for each row begin
  if new.ingredient_id is not null and not exists (
    select 1 from ingredients where id = new.ingredient_id and store_id = new.store_id) then
    signal sqlstate '45000' set message_text = 'ingredient belongs to another store';
  end if;
end
