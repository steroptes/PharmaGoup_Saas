-- Product creation must be independent from catalog arrangement.
-- A managed product can be created with laboratory_id only (root), then arranged later in BU/brand.
create or replace function public.validate_catalog_hierarchy()
returns trigger
language plpgsql
as $$
declare
  bu_count integer;
  gb_bu_id uuid;
begin
  select count(*) into bu_count from public.business_units where laboratory_id = new.laboratory_id;

  if tg_table_name = 'group_brands' then
    if bu_count > 0 and new.business_unit_id is null then
      raise exception 'group/brand at root is forbidden when laboratory has business units';
    end if;

    if new.business_unit_id is not null then
      perform 1 from public.business_units bu where bu.id = new.business_unit_id and bu.laboratory_id = new.laboratory_id;
      if not found then
        raise exception 'group/brand business unit must belong to same laboratory';
      end if;
    end if;
    return new;
  end if;

  if (case when new.business_unit_id is null then 0 else 1 end)
     + (case when new.group_brand_id is null then 0 else 1 end) > 1 then
    raise exception 'product can only have one logical parent';
  end if;

  -- Root product is explicitly allowed even if BU exist.

  if new.group_brand_id is not null then
    select business_unit_id into gb_bu_id from public.group_brands where id = new.group_brand_id and laboratory_id = new.laboratory_id;
    if gb_bu_id is null then
      raise exception 'product group/brand must belong to same laboratory and be attached to a business unit';
    end if;
  end if;

  if new.business_unit_id is not null then
    perform 1 from public.business_units bu where bu.id = new.business_unit_id and bu.laboratory_id = new.laboratory_id;
    if not found then
      raise exception 'product business unit must belong to same laboratory';
    end if;
  end if;

  return new;
end;
$$;
