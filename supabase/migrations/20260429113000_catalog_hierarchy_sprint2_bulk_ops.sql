create index if not exists idx_group_brands_laboratory_bu on public.group_brands(laboratory_id, business_unit_id);
create index if not exists idx_managed_products_laboratory_parent on public.managed_products(laboratory_id, business_unit_id, group_brand_id);

create table if not exists public.catalog_bulk_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id),
  operation text not null,
  laboratory_id uuid not null references public.laboratories(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_catalog_bulk_audit_logs_laboratory on public.catalog_bulk_audit_logs(laboratory_id, created_at desc);

alter table public.catalog_bulk_audit_logs enable row level security;

create policy "admin all catalog_bulk_audit_logs" on public.catalog_bulk_audit_logs
for all using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create or replace function public.log_catalog_bulk_operation(
  p_operation text,
  p_laboratory_id uuid,
  p_payload jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.catalog_bulk_audit_logs(actor_user_id, operation, laboratory_id, payload)
  values (auth.uid(), p_operation, p_laboratory_id, coalesce(p_payload, '{}'::jsonb));
$$;

create or replace function public.catalog_products_bulk_move(
  p_laboratory_id uuid,
  p_product_ids uuid[],
  p_target_business_unit_id uuid default null,
  p_target_group_brand_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_count integer;
  parent_count integer;
  target_brand_bu_id uuid;
begin
  if coalesce(array_length(p_product_ids, 1), 0) = 0 then
    raise exception 'CATALOG_BULK_PRODUCTS_EMPTY: no product ids provided';
  end if;

  parent_count := (case when p_target_business_unit_id is null then 0 else 1 end)
    + (case when p_target_group_brand_id is null then 0 else 1 end);
  if parent_count <> 1 then
    raise exception 'CATALOG_BULK_PRODUCTS_INVALID_TARGET: exactly one destination is required';
  end if;

  if p_target_business_unit_id is not null then
    perform 1 from public.business_units bu where bu.id = p_target_business_unit_id and bu.laboratory_id = p_laboratory_id;
    if not found then
      raise exception 'CATALOG_BULK_PRODUCTS_INVALID_TARGET: target business unit does not belong to laboratory';
    end if;
  end if;

  if p_target_group_brand_id is not null then
    select g.business_unit_id into target_brand_bu_id
    from public.group_brands g
    where g.id = p_target_group_brand_id and g.laboratory_id = p_laboratory_id;

    if target_brand_bu_id is null then
      raise exception 'CATALOG_BULK_PRODUCTS_INVALID_TARGET: target group/brand does not belong to laboratory or is invalid';
    end if;
  end if;

  perform 1
  from unnest(p_product_ids) pid
  join public.managed_products p on p.id = pid
  where p.laboratory_id <> p_laboratory_id;
  if found then
    raise exception 'CATALOG_BULK_PRODUCTS_CROSS_LAB: all products must belong to the same laboratory';
  end if;

  select count(*) into affected_count
  from public.managed_products p
  where p.id = any(p_product_ids) and p.laboratory_id = p_laboratory_id;

  if affected_count <> cardinality(p_product_ids) then
    raise exception 'CATALOG_BULK_PRODUCTS_NOT_FOUND: some products are missing for this laboratory';
  end if;

  update public.managed_products p
  set business_unit_id = p_target_business_unit_id,
      group_brand_id = p_target_group_brand_id
  where p.id = any(p_product_ids)
    and p.laboratory_id = p_laboratory_id;

  perform public.log_catalog_bulk_operation(
    'products.bulk_move',
    p_laboratory_id,
    jsonb_build_object('product_count', cardinality(p_product_ids), 'target_business_unit_id', p_target_business_unit_id, 'target_group_brand_id', p_target_group_brand_id)
  );

  return jsonb_build_object('moved_count', cardinality(p_product_ids));
end;
$$;

create or replace function public.catalog_products_bulk_delete(
  p_laboratory_id uuid,
  p_product_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_count integer;
begin
  if coalesce(array_length(p_product_ids, 1), 0) = 0 then
    raise exception 'CATALOG_BULK_PRODUCTS_EMPTY: no product ids provided';
  end if;

  select count(*) into existing_count
  from public.managed_products p
  where p.id = any(p_product_ids)
    and p.laboratory_id = p_laboratory_id;

  if existing_count <> cardinality(p_product_ids) then
    raise exception 'CATALOG_BULK_PRODUCTS_NOT_FOUND: some products are missing for this laboratory';
  end if;

  delete from public.managed_products p
  where p.id = any(p_product_ids)
    and p.laboratory_id = p_laboratory_id;

  perform public.log_catalog_bulk_operation(
    'products.bulk_delete',
    p_laboratory_id,
    jsonb_build_object('product_count', cardinality(p_product_ids))
  );

  return jsonb_build_object('deleted_count', cardinality(p_product_ids));
end;
$$;

create or replace function public.catalog_group_brands_bulk_move(
  p_laboratory_id uuid,
  p_group_brand_ids uuid[],
  p_target_business_unit_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_count integer;
begin
  if coalesce(array_length(p_group_brand_ids, 1), 0) = 0 then
    raise exception 'CATALOG_BULK_BRANDS_EMPTY: no group/brand ids provided';
  end if;

  if p_target_business_unit_id is null then
    raise exception 'CATALOG_BULK_BRANDS_INVALID_TARGET: target business unit is required';
  end if;

  perform 1 from public.business_units bu where bu.id = p_target_business_unit_id and bu.laboratory_id = p_laboratory_id;
  if not found then
    raise exception 'CATALOG_BULK_BRANDS_INVALID_TARGET: target business unit does not belong to laboratory';
  end if;

  select count(*) into existing_count
  from public.group_brands g
  where g.id = any(p_group_brand_ids)
    and g.laboratory_id = p_laboratory_id;

  if existing_count <> cardinality(p_group_brand_ids) then
    raise exception 'CATALOG_BULK_BRANDS_NOT_FOUND: some group/brands are missing for this laboratory';
  end if;

  update public.group_brands g
  set business_unit_id = p_target_business_unit_id
  where g.id = any(p_group_brand_ids)
    and g.laboratory_id = p_laboratory_id;

  perform public.log_catalog_bulk_operation(
    'group_brands.bulk_move',
    p_laboratory_id,
    jsonb_build_object('group_brand_count', cardinality(p_group_brand_ids), 'target_business_unit_id', p_target_business_unit_id)
  );

  return jsonb_build_object('moved_count', cardinality(p_group_brand_ids));
end;
$$;

create or replace function public.catalog_group_brands_bulk_delete(
  p_laboratory_id uuid,
  p_group_brand_ids uuid[],
  p_mode text,
  p_relocate_to_business_unit_id uuid default null,
  p_relocate_to_group_brand_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_count integer;
  target_brand_bu_id uuid;
  deleted_products_count integer;
begin
  if coalesce(array_length(p_group_brand_ids, 1), 0) = 0 then
    raise exception 'CATALOG_BULK_BRANDS_EMPTY: no group/brand ids provided';
  end if;

  select count(*) into existing_count
  from public.group_brands g
  where g.id = any(p_group_brand_ids)
    and g.laboratory_id = p_laboratory_id;

  if existing_count <> cardinality(p_group_brand_ids) then
    raise exception 'CATALOG_BULK_BRANDS_NOT_FOUND: some group/brands are missing for this laboratory';
  end if;

  if p_mode not in ('delete_with_products', 'relocate_products') then
    raise exception 'CATALOG_BULK_BRANDS_INVALID_MODE: supported modes are delete_with_products and relocate_products';
  end if;

  if p_mode = 'delete_with_products' then
    delete from public.managed_products p
    where p.group_brand_id = any(p_group_brand_ids)
      and p.laboratory_id = p_laboratory_id;
    get diagnostics deleted_products_count = row_count;
  else
    if ((case when p_relocate_to_business_unit_id is null then 0 else 1 end)
      + (case when p_relocate_to_group_brand_id is null then 0 else 1 end)) <> 1 then
      raise exception 'CATALOG_BULK_BRANDS_INVALID_RELOCATION: exactly one relocation destination is required';
    end if;

    if p_relocate_to_business_unit_id is not null then
      perform 1 from public.business_units bu where bu.id = p_relocate_to_business_unit_id and bu.laboratory_id = p_laboratory_id;
      if not found then
        raise exception 'CATALOG_BULK_BRANDS_INVALID_RELOCATION: relocation business unit does not belong to laboratory';
      end if;
    end if;

    if p_relocate_to_group_brand_id is not null then
      select g.business_unit_id into target_brand_bu_id
      from public.group_brands g
      where g.id = p_relocate_to_group_brand_id and g.laboratory_id = p_laboratory_id and g.id <> all(p_group_brand_ids);
      if target_brand_bu_id is null then
        raise exception 'CATALOG_BULK_BRANDS_INVALID_RELOCATION: relocation group/brand is invalid';
      end if;
    end if;

    update public.managed_products p
    set business_unit_id = p_relocate_to_business_unit_id,
        group_brand_id = p_relocate_to_group_brand_id
    where p.group_brand_id = any(p_group_brand_ids)
      and p.laboratory_id = p_laboratory_id;
    get diagnostics deleted_products_count = row_count;
  end if;

  delete from public.group_brands g
  where g.id = any(p_group_brand_ids)
    and g.laboratory_id = p_laboratory_id;

  perform public.log_catalog_bulk_operation(
    'group_brands.bulk_delete',
    p_laboratory_id,
    jsonb_build_object('group_brand_count', cardinality(p_group_brand_ids), 'mode', p_mode, 'impacted_products_count', deleted_products_count,
      'relocate_to_business_unit_id', p_relocate_to_business_unit_id, 'relocate_to_group_brand_id', p_relocate_to_group_brand_id)
  );

  return jsonb_build_object('deleted_group_brand_count', cardinality(p_group_brand_ids), 'impacted_products_count', deleted_products_count);
end;
$$;

create or replace function public.delete_business_unit(p_business_unit_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  bu_lab_id uuid;
  has_products boolean;
  has_brands boolean;
begin
  select laboratory_id into bu_lab_id from public.business_units where id = p_business_unit_id;
  if bu_lab_id is null then
    raise exception 'BUSINESS_UNIT_NOT_FOUND: business unit does not exist';
  end if;

  select exists(select 1 from public.managed_products p where p.business_unit_id = p_business_unit_id and p.laboratory_id = bu_lab_id),
         exists(select 1 from public.group_brands g where g.business_unit_id = p_business_unit_id and g.laboratory_id = bu_lab_id)
  into has_products, has_brands;

  if has_products or has_brands then
    raise exception 'BUSINESS_UNIT_NOT_EMPTY: cannot delete a non-empty business unit';
  end if;

  delete from public.business_units where id = p_business_unit_id;
end;
$$;
