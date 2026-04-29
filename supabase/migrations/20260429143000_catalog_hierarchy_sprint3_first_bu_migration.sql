create table if not exists public.catalog_first_bu_migrations (
  id uuid primary key default gen_random_uuid(),
  laboratory_id uuid not null references public.laboratories(id) on delete cascade,
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  status text not null default 'initialized' check (status in ('initialized', 'committed', 'cancelled')),
  root_products_signature text not null,
  root_group_brands_signature text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  committed_at timestamptz
);

create unique index if not exists idx_catalog_first_bu_migrations_lab_active
  on public.catalog_first_bu_migrations(laboratory_id)
  where status = 'initialized';

alter table public.catalog_first_bu_migrations enable row level security;
create policy "admin all catalog_first_bu_migrations" on public.catalog_first_bu_migrations
for all using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create or replace function public.catalog_root_inventory(p_laboratory_id uuid)
returns jsonb
language sql
stable
as $$
  with root_products as (
    select p.id, p.designation
    from public.managed_products p
    where p.laboratory_id = p_laboratory_id
      and p.business_unit_id is null
      and p.group_brand_id is null
      and p.is_active = true
  ),
  root_brands as (
    select g.id, g.name,
      coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'designation', p.designation) order by p.designation)
        from public.managed_products p where p.group_brand_id = g.id and p.is_active = true), '[]'::jsonb) as products
    from public.group_brands g
    where g.laboratory_id = p_laboratory_id
      and g.business_unit_id is null
  )
  select jsonb_build_object(
    'root_products', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'designation', designation) order by designation) from root_products), '[]'::jsonb),
    'root_group_brands', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'products', products) order by name) from root_brands), '[]'::jsonb),
    'root_product_count', (select count(*) from root_products),
    'root_group_brand_count', (select count(*) from root_brands)
  );
$$;

create or replace function public.create_business_unit_or_require_migration(
  p_laboratory_id uuid,
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_bu_count integer;
  inventory jsonb;
  root_total integer;
  bu_id uuid;
begin
  perform 1 from public.laboratories l where l.id = p_laboratory_id for update;
  if not found then
    raise exception 'LAB_NOT_FOUND: laboratory does not exist';
  end if;

  select count(*) into existing_bu_count from public.business_units where laboratory_id = p_laboratory_id;

  if existing_bu_count > 0 then
    insert into public.business_units(laboratory_id, name) values (p_laboratory_id, p_name) returning id into bu_id;
    return jsonb_build_object('status', 'created', 'business_unit', jsonb_build_object('id', bu_id, 'name', p_name));
  end if;

  inventory := public.catalog_root_inventory(p_laboratory_id);
  root_total := coalesce((inventory->>'root_product_count')::int, 0) + coalesce((inventory->>'root_group_brand_count')::int, 0);

  if root_total > 0 then
    return jsonb_build_object(
      'status', 'migration_required',
      'business_unit_draft', jsonb_build_object('name', p_name),
      'inventory', inventory
    );
  end if;

  insert into public.business_units(laboratory_id, name) values (p_laboratory_id, p_name) returning id into bu_id;
  return jsonb_build_object('status', 'created', 'business_unit', jsonb_build_object('id', bu_id, 'name', p_name));
end;
$$;

create or replace function public.catalog_first_bu_migration_init(
  p_laboratory_id uuid,
  p_business_unit_name text
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  existing_bu_count integer;
  inv jsonb;
  bu_id uuid;
  session_id uuid;
  root_products_sig text;
  root_brands_sig text;
begin
  perform 1 from public.laboratories l where l.id = p_laboratory_id for update;
  if not found then raise exception 'LAB_NOT_FOUND: laboratory does not exist'; end if;

  select count(*) into existing_bu_count from public.business_units where laboratory_id = p_laboratory_id;
  if existing_bu_count > 0 then raise exception 'MIGRATION_NOT_ALLOWED: laboratory already has business units'; end if;

  if exists(select 1 from public.catalog_first_bu_migrations m where m.laboratory_id = p_laboratory_id and m.status = 'initialized') then
    raise exception 'MIGRATION_ALREADY_IN_PROGRESS: an active migration already exists';
  end if;

  inv := public.catalog_root_inventory(p_laboratory_id);
  if coalesce((inv->>'root_product_count')::int, 0) + coalesce((inv->>'root_group_brand_count')::int, 0) = 0 then
    raise exception 'MIGRATION_NOT_REQUIRED: laboratory has no root catalog elements';
  end if;

  select coalesce(string_agg(id::text, ',' order by id), '') into root_products_sig
  from public.managed_products p
  where p.laboratory_id = p_laboratory_id and p.business_unit_id is null and p.group_brand_id is null and p.is_active = true;

  select coalesce(string_agg(id::text, ',' order by id), '') into root_brands_sig
  from public.group_brands g
  where g.laboratory_id = p_laboratory_id and g.business_unit_id is null;

  insert into public.business_units(laboratory_id, name) values (p_laboratory_id, p_business_unit_name) returning id into bu_id;
  insert into public.catalog_first_bu_migrations(laboratory_id, business_unit_id, root_products_signature, root_group_brands_signature, created_by)
  values (p_laboratory_id, bu_id, root_products_sig, root_brands_sig, auth.uid()) returning id into session_id;

  perform public.log_catalog_bulk_operation('catalog.first_bu_migration.init', p_laboratory_id, jsonb_build_object('migration_id', session_id, 'business_unit_id', bu_id));
  return jsonb_build_object('migration_id', session_id, 'business_unit_id', bu_id, 'inventory', inv);
end;
$$;
create or replace function public.catalog_first_bu_migration_preview(
  p_laboratory_id uuid,
  p_migration_id uuid,
  p_plan jsonb
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  rec record;
  product_count integer := 0;
  brand_count integer := 0;
begin
  select * into rec from public.catalog_first_bu_migrations m
  where m.id = p_migration_id and m.laboratory_id = p_laboratory_id and m.status = 'initialized';
  if rec.id is null then raise exception 'MIGRATION_NOT_FOUND: active migration not found'; end if;

  if jsonb_typeof(p_plan->'products') = 'array' then
    select count(*) into product_count from jsonb_array_elements(p_plan->'products') x;
  end if;
  if jsonb_typeof(p_plan->'group_brands') = 'array' then
    select count(*) into brand_count from jsonb_array_elements(p_plan->'group_brands') x;
  end if;

  return jsonb_build_object(
    'migration_id', rec.id,
    'business_unit_id', rec.business_unit_id,
    'product_moves', product_count,
    'group_brand_moves', brand_count,
    'status', 'preview_ready'
  );
end;
$$;

create or replace function public.catalog_first_bu_migration_commit(
  p_laboratory_id uuid,
  p_migration_id uuid,
  p_plan jsonb
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  rec record;
  current_products_sig text;
  current_brands_sig text;
  item jsonb;
  moved_products integer := 0;
  moved_brands integer := 0;
  created_brands integer := 0;
  target_brand_id uuid;
  target_bu_id uuid;
begin
  select * into rec from public.catalog_first_bu_migrations m
  where m.id = p_migration_id and m.laboratory_id = p_laboratory_id and m.status = 'initialized' for update;
  if rec.id is null then raise exception 'MIGRATION_NOT_FOUND: active migration not found'; end if;

  target_bu_id := rec.business_unit_id;

  select coalesce(string_agg(id::text, ',' order by id), '') into current_products_sig
  from public.managed_products p
  where p.laboratory_id = p_laboratory_id and p.business_unit_id is null and p.group_brand_id is null and p.is_active = true;

  select coalesce(string_agg(id::text, ',' order by id), '') into current_brands_sig
  from public.group_brands g
  where g.laboratory_id = p_laboratory_id and g.business_unit_id is null;

  if current_products_sig <> rec.root_products_signature or current_brands_sig <> rec.root_group_brands_signature then
    raise exception 'MIGRATION_PLAN_STALE: root catalog changed between init and commit';
  end if;

  for item in select * from jsonb_array_elements(coalesce(p_plan->'group_brands', '[]'::jsonb))
  loop
    if item->>'target_type' = 'business_unit' then
      update public.group_brands g set business_unit_id = target_bu_id
      where g.id = (item->>'group_brand_id')::uuid and g.laboratory_id = p_laboratory_id and g.business_unit_id is null;
      if not found then raise exception 'MIGRATION_BRAND_NOT_FOUND: group/brand missing or outside lab'; end if;
    elsif item->>'target_type' = 'new_brand' then
      insert into public.group_brands(laboratory_id, business_unit_id, name)
      values (p_laboratory_id, target_bu_id, item->>'target_brand_name')
      returning id into target_brand_id;
      created_brands := created_brands + 1;
      update public.managed_products p
      set group_brand_id = target_brand_id, business_unit_id = null
      where p.group_brand_id = (item->>'group_brand_id')::uuid and p.laboratory_id = p_laboratory_id;
      update public.group_brands g set business_unit_id = target_bu_id
      where g.id = (item->>'group_brand_id')::uuid and g.laboratory_id = p_laboratory_id and g.business_unit_id is null;
      if not found then raise exception 'MIGRATION_BRAND_NOT_FOUND: group/brand missing or outside lab'; end if;
    else
      raise exception 'MIGRATION_INVALID_DESTINATION: unsupported group/brand destination';
    end if;
    moved_brands := moved_brands + 1;
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p_plan->'products', '[]'::jsonb))
  loop
    if item->>'target_type' = 'business_unit' then
      update public.managed_products p
      set business_unit_id = target_bu_id,
          group_brand_id = null
      where p.id = (item->>'product_id')::uuid and p.laboratory_id = p_laboratory_id and p.business_unit_id is null and p.group_brand_id is null;
      if not found then raise exception 'MIGRATION_PRODUCT_NOT_FOUND: root product missing or outside lab'; end if;
    elsif item->>'target_type' = 'existing_brand' then
      select g.id into target_brand_id
      from public.group_brands g
      where g.id = (item->>'target_group_brand_id')::uuid and g.laboratory_id = p_laboratory_id and g.business_unit_id is not null;
      if target_brand_id is null then raise exception 'MIGRATION_INVALID_DESTINATION: target brand is invalid'; end if;
      update public.managed_products p
      set business_unit_id = null,
          group_brand_id = target_brand_id
      where p.id = (item->>'product_id')::uuid and p.laboratory_id = p_laboratory_id and p.business_unit_id is null and p.group_brand_id is null;
      if not found then raise exception 'MIGRATION_PRODUCT_NOT_FOUND: root product missing or outside lab'; end if;
    elsif item->>'target_type' = 'new_brand' then
      insert into public.group_brands(laboratory_id, business_unit_id, name)
      values (p_laboratory_id, target_bu_id, item->>'target_brand_name')
      returning id into target_brand_id;
      created_brands := created_brands + 1;
      update public.managed_products p
      set business_unit_id = null,
          group_brand_id = target_brand_id
      where p.id = (item->>'product_id')::uuid and p.laboratory_id = p_laboratory_id and p.business_unit_id is null and p.group_brand_id is null;
      if not found then raise exception 'MIGRATION_PRODUCT_NOT_FOUND: root product missing or outside lab'; end if;
    else
      raise exception 'MIGRATION_INVALID_DESTINATION: unsupported product destination';
    end if;
    moved_products := moved_products + 1;
  end loop;

  if exists(select 1 from public.managed_products p where p.laboratory_id = p_laboratory_id and p.business_unit_id is null and p.group_brand_id is null and p.is_active = true)
     or exists(select 1 from public.group_brands g where g.laboratory_id = p_laboratory_id and g.business_unit_id is null) then
    raise exception 'MIGRATION_STRUCTURE_VIOLATION: root elements remain while business units exist';
  end if;

  update public.catalog_first_bu_migrations set status = 'committed', committed_at = now() where id = rec.id;

  perform public.log_catalog_bulk_operation('catalog.first_bu_migration.commit', p_laboratory_id,
    jsonb_build_object('migration_id', rec.id, 'business_unit_id', target_bu_id, 'moved_products', moved_products, 'moved_group_brands', moved_brands, 'created_brands', created_brands));

  return jsonb_build_object('status', 'committed', 'migration_id', rec.id, 'business_unit_id', target_bu_id,
    'moved_products', moved_products, 'moved_group_brands', moved_brands, 'created_brands', created_brands);
end;
$$;

create or replace function public.catalog_first_bu_migration_cancel(
  p_laboratory_id uuid,
  p_migration_id uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare rec record;
begin
  select * into rec from public.catalog_first_bu_migrations m where m.id = p_migration_id and m.laboratory_id = p_laboratory_id and m.status = 'initialized' for update;
  if rec.id is null then raise exception 'MIGRATION_NOT_FOUND: active migration not found'; end if;

  delete from public.business_units where id = rec.business_unit_id;
  update public.catalog_first_bu_migrations set status = 'cancelled' where id = rec.id;
  perform public.log_catalog_bulk_operation('catalog.first_bu_migration.cancel', p_laboratory_id, jsonb_build_object('migration_id', rec.id));
  return jsonb_build_object('status', 'cancelled', 'migration_id', rec.id);
end;
$$;
