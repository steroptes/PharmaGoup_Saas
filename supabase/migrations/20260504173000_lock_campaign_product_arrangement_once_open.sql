create or replace function public.lock_campaign_product_arrangement_once_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_id uuid;
  v_campaign_status public.campaign_status;
begin
  v_campaign_id := coalesce(new.campaign_id, old.campaign_id);

  if v_campaign_id is null then
    return coalesce(new, old);
  end if;

  select c.status
  into v_campaign_status
  from public.campaigns c
  where c.id = v_campaign_id;

  if v_campaign_status = 'open' then
    raise exception 'CAMPAIGN_PRODUCT_ARRANGEMENT_LOCKED_ON_OPEN';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_lock_campaign_products_once_open on public.campaign_products;
create trigger trg_lock_campaign_products_once_open
before insert or update or delete on public.campaign_products
for each row execute function public.lock_campaign_product_arrangement_once_open();

drop trigger if exists trg_lock_campaign_product_arrangements_once_open on public.campaign_product_arrangements;
create trigger trg_lock_campaign_product_arrangements_once_open
before insert or update or delete on public.campaign_product_arrangements
for each row execute function public.lock_campaign_product_arrangement_once_open();

drop trigger if exists trg_lock_campaign_product_settings_once_open on public.campaign_product_settings;
create trigger trg_lock_campaign_product_settings_once_open
before insert or update or delete on public.campaign_product_settings
for each row execute function public.lock_campaign_product_arrangement_once_open();

drop trigger if exists trg_lock_campaign_business_units_once_open on public.campaign_business_units;
create trigger trg_lock_campaign_business_units_once_open
before insert or update or delete on public.campaign_business_units
for each row execute function public.lock_campaign_product_arrangement_once_open();

drop trigger if exists trg_lock_campaign_group_brands_once_open on public.campaign_group_brands;
create trigger trg_lock_campaign_group_brands_once_open
before insert or update or delete on public.campaign_group_brands
for each row execute function public.lock_campaign_product_arrangement_once_open();
