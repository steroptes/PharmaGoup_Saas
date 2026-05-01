do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'campaign_scope_type') then
    create type public.campaign_scope_type as enum ('campaign', 'business_unit', 'group_brand', 'product');
  end if;
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'campaign_condition_phase') then
    create type public.campaign_condition_phase as enum ('purchase_intentions', 'purchase_orders', 'both');
  end if;
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'bonification_value_type') then
    create type public.bonification_value_type as enum ('percent', 'amount');
  end if;
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'bonification_nature') then
    create type public.bonification_nature as enum ('purchase_voucher', 'cash', 'products');
  end if;
end $$;

create table if not exists public.campaign_conditions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  scope_type public.campaign_scope_type not null,
  campaign_business_unit_id uuid references public.campaign_business_units(id) on delete cascade,
  campaign_group_brand_id uuid references public.campaign_group_brands(id) on delete cascade,
  product_id uuid references public.managed_products(id) on delete cascade,
  phase public.campaign_condition_phase not null default 'both',
  label text not null,
  operator text not null,
  target_value numeric(14,3) not null,
  unit text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_bonifications (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  scope_type public.campaign_scope_type not null,
  campaign_business_unit_id uuid references public.campaign_business_units(id) on delete cascade,
  campaign_group_brand_id uuid references public.campaign_group_brands(id) on delete cascade,
  product_id uuid references public.managed_products(id) on delete cascade,
  label text not null,
  value_type public.bonification_value_type not null,
  value numeric(14,3) not null check (value >= 0),
  nature public.bonification_nature not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_campaign_conditions_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_campaign_conditions_updated_at on public.campaign_conditions;
create trigger trg_campaign_conditions_updated_at
before update on public.campaign_conditions
for each row execute function public.set_campaign_conditions_updated_at();

create or replace function public.set_campaign_bonifications_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_campaign_bonifications_updated_at on public.campaign_bonifications;
create trigger trg_campaign_bonifications_updated_at
before update on public.campaign_bonifications
for each row execute function public.set_campaign_bonifications_updated_at();

alter table public.campaign_conditions enable row level security;
alter table public.campaign_bonifications enable row level security;

do $$
begin
  if to_regprocedure('public.current_user_role()') is not null then
    if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaign_conditions' and policyname='admin all campaign_conditions') then
      create policy "admin all campaign_conditions" on public.campaign_conditions
      for all using (public.current_user_role() = 'admin')
      with check (public.current_user_role() = 'admin');
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaign_bonifications' and policyname='admin all campaign_bonifications') then
      create policy "admin all campaign_bonifications" on public.campaign_bonifications
      for all using (public.current_user_role() = 'admin')
      with check (public.current_user_role() = 'admin');
    end if;
  end if;
end $$;
