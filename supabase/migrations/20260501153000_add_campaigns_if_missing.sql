-- Safe migration for partially initialized databases.
-- Creates campaign objects even when supplier/product/pharmacy legacy tables are missing.

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'campaign_status') then
    create type public.campaign_status as enum ('draft', 'open', 'closed', 'archived');
  end if;
end $$;

do $$
declare
  has_suppliers boolean;
  has_laboratories boolean;
  has_pharmacies boolean;
  has_products boolean;
begin
  select exists (select 1 from information_schema.tables where table_schema='public' and table_name='suppliers') into has_suppliers;
  select exists (select 1 from information_schema.tables where table_schema='public' and table_name='laboratories') into has_laboratories;
  select exists (select 1 from information_schema.tables where table_schema='public' and table_name='pharmacies') into has_pharmacies;
  select exists (select 1 from information_schema.tables where table_schema='public' and table_name='products') into has_products;

  if not exists (select 1 from information_schema.tables where table_schema='public' and table_name='campaigns') then
    execute '
      create table public.campaigns (
        id uuid primary key default gen_random_uuid(),
        name text not null,
        supplier_id uuid,
        start_date date not null,
        end_date date not null,
        status public.campaign_status not null default ''draft'',
        description text,
        created_at timestamptz not null default now(),
        constraint valid_campaign_dates check (end_date >= start_date)
      )';
  end if;

  if has_suppliers then
    begin
      alter table public.campaigns add constraint campaigns_supplier_fk foreign key (supplier_id) references public.suppliers(id);
    exception when duplicate_object then null;
    end;
  elsif has_laboratories then
    begin
      alter table public.campaigns add constraint campaigns_supplier_fk foreign key (supplier_id) references public.laboratories(id);
    exception when duplicate_object then null;
    end;
  end if;

  if not exists (select 1 from information_schema.tables where table_schema='public' and table_name='campaign_participants') then
    execute '
      create table public.campaign_participants (
        id uuid primary key default gen_random_uuid(),
        campaign_id uuid not null references public.campaigns(id) on delete cascade,
        pharmacy_id uuid not null,
        created_at timestamptz not null default now(),
        unique (campaign_id, pharmacy_id)
      )';
  end if;

  if has_pharmacies then
    begin
      alter table public.campaign_participants add constraint campaign_participants_pharmacy_fk foreign key (pharmacy_id) references public.pharmacies(id) on delete cascade;
    exception when duplicate_object then null;
    end;
  end if;

  if not exists (select 1 from information_schema.tables where table_schema='public' and table_name='campaign_products') then
    execute '
      create table public.campaign_products (
        id uuid primary key default gen_random_uuid(),
        campaign_id uuid not null references public.campaigns(id) on delete cascade,
        product_id uuid not null,
        created_at timestamptz not null default now(),
        unique (campaign_id, product_id)
      )';
  end if;

  if has_products then
    begin
      alter table public.campaign_products add constraint campaign_products_product_fk foreign key (product_id) references public.products(id) on delete cascade;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

alter table public.campaigns enable row level security;
alter table public.campaign_participants enable row level security;
alter table public.campaign_products enable row level security;

do $$
begin
  if to_regprocedure('public.current_user_role()') is not null then
    if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaigns' and policyname='admin all campaigns') then
      create policy "admin all campaigns" on public.campaigns
        for all using (public.current_user_role() = 'admin')
        with check (public.current_user_role() = 'admin');
    end if;

    if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaign_participants' and policyname='admin all campaign_participants') then
      create policy "admin all campaign_participants" on public.campaign_participants
        for all using (public.current_user_role() = 'admin')
        with check (public.current_user_role() = 'admin');
    end if;

    if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaign_products' and policyname='admin all campaign_products') then
      create policy "admin all campaign_products" on public.campaign_products
        for all using (public.current_user_role() = 'admin')
        with check (public.current_user_role() = 'admin');
    end if;
  end if;
end $$;
