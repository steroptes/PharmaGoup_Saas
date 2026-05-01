create table if not exists public.campaign_business_units (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, name)
);

create table if not exists public.campaign_group_brands (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  campaign_business_unit_id uuid references public.campaign_business_units(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, campaign_business_unit_id, name)
);

alter table public.campaign_product_arrangements
  add column if not exists campaign_business_unit_id uuid references public.campaign_business_units(id) on delete set null,
  add column if not exists campaign_group_brand_id uuid references public.campaign_group_brands(id) on delete set null;

create or replace function public.set_campaign_business_units_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists campaign_business_units_set_updated_at on public.campaign_business_units;
create trigger campaign_business_units_set_updated_at
before update on public.campaign_business_units
for each row execute function public.set_campaign_business_units_updated_at();

create or replace function public.set_campaign_group_brands_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists campaign_group_brands_set_updated_at on public.campaign_group_brands;
create trigger campaign_group_brands_set_updated_at
before update on public.campaign_group_brands
for each row execute function public.set_campaign_group_brands_updated_at();

alter table public.campaign_business_units enable row level security;
alter table public.campaign_group_brands enable row level security;

do $$
begin
  if to_regprocedure('public.current_user_role()') is not null then
    if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaign_business_units' and policyname='admin all campaign_business_units') then
      create policy "admin all campaign_business_units" on public.campaign_business_units
        for all using (public.current_user_role() = 'admin')
        with check (public.current_user_role() = 'admin');
    end if;

    if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaign_group_brands' and policyname='admin all campaign_group_brands') then
      create policy "admin all campaign_group_brands" on public.campaign_group_brands
        for all using (public.current_user_role() = 'admin')
        with check (public.current_user_role() = 'admin');
    end if;
  end if;
end $$;
