create table if not exists public.business_units (
  id uuid primary key default gen_random_uuid(),
  laboratory_id uuid not null references public.laboratories(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (laboratory_id, name)
);

create table if not exists public.group_brands (
  id uuid primary key default gen_random_uuid(),
  laboratory_id uuid not null references public.laboratories(id) on delete cascade,
  business_unit_id uuid references public.business_units(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (laboratory_id, business_unit_id, name)
);

alter table public.managed_products
  add column if not exists business_unit_id uuid references public.business_units(id) on delete restrict,
  add column if not exists group_brand_id uuid references public.group_brands(id) on delete restrict;

create index if not exists idx_business_units_laboratory on public.business_units(laboratory_id);
create index if not exists idx_group_brands_laboratory on public.group_brands(laboratory_id);
create index if not exists idx_group_brands_bu on public.group_brands(business_unit_id);
create index if not exists idx_managed_products_laboratory on public.managed_products(laboratory_id);
create index if not exists idx_managed_products_bu on public.managed_products(business_unit_id);
create index if not exists idx_managed_products_brand on public.managed_products(group_brand_id);

alter table public.business_units enable row level security;
alter table public.group_brands enable row level security;

create policy "admin all business_units" on public.business_units
for all using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create policy "pharmacy user sees business_units" on public.business_units
for select using (true);

create policy "admin all group_brands" on public.group_brands
for all using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create policy "pharmacy user sees group_brands" on public.group_brands
for select using (true);

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

  if bu_count > 0 and new.business_unit_id is null and new.group_brand_id is null then
    raise exception 'root product is forbidden when laboratory has business units';
  end if;

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

drop trigger if exists trg_validate_group_brand_hierarchy on public.group_brands;
create trigger trg_validate_group_brand_hierarchy
before insert or update on public.group_brands
for each row execute function public.validate_catalog_hierarchy();

drop trigger if exists trg_validate_product_hierarchy on public.managed_products;
create trigger trg_validate_product_hierarchy
before insert or update on public.managed_products
for each row execute function public.validate_catalog_hierarchy();

create or replace function public.get_laboratory_catalog_tree(target_laboratory_id uuid)
returns jsonb
language sql
stable
as $$
  with bu as (
    select b.id, b.name
    from public.business_units b
    where b.laboratory_id = target_laboratory_id
    order by b.name
  ),
  brands as (
    select g.id, g.name, g.business_unit_id
    from public.group_brands g
    where g.laboratory_id = target_laboratory_id
  ),
  products as (
    select p.id, p.designation, p.nature, p.business_unit_id, p.group_brand_id
    from public.managed_products p
    where p.laboratory_id = target_laboratory_id and p.is_active = true
  )
  select jsonb_build_object(
    'laboratory_id', target_laboratory_id,
    'business_units', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', bu.id,
        'name', bu.name,
        'products', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'designation', p.designation, 'nature', p.nature) order by p.designation)
                              from products p where p.business_unit_id = bu.id and p.group_brand_id is null), '[]'::jsonb),
        'group_brands', coalesce((select jsonb_agg(jsonb_build_object(
          'id', g.id,
          'name', g.name,
          'products', coalesce((select jsonb_agg(jsonb_build_object('id', p2.id, 'designation', p2.designation, 'nature', p2.nature) order by p2.designation)
                                from products p2 where p2.group_brand_id = g.id), '[]'::jsonb)
        ) order by g.name) from brands g where g.business_unit_id = bu.id), '[]'::jsonb)
      ) order by bu.name)
      from bu
    ), '[]'::jsonb),
    'root_group_brands', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name,
        'products', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'designation', p.designation, 'nature', p.nature) order by p.designation)
        from products p where p.group_brand_id = g.id), '[]'::jsonb)
      ) order by g.name)
      from brands g where g.business_unit_id is null
    ), '[]'::jsonb),
    'root_products', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'designation', p.designation, 'nature', p.nature) order by p.designation)
      from products p where p.business_unit_id is null and p.group_brand_id is null
    ), '[]'::jsonb)
  );
$$;
