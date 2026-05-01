do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'campaign_product_arrangement_mode') then
    create type public.campaign_product_arrangement_mode as enum ('inherit_laboratory', 'custom');
  end if;
end $$;

create table if not exists public.campaign_product_settings (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  arrangement_mode public.campaign_product_arrangement_mode not null default 'inherit_laboratory',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_product_arrangements (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  product_id uuid not null references public.managed_products(id) on delete cascade,
  business_unit_id uuid references public.business_units(id) on delete set null,
  group_brand_id uuid references public.group_brands(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, product_id)
);

create or replace function public.set_campaign_product_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists campaign_product_settings_set_updated_at on public.campaign_product_settings;
create trigger campaign_product_settings_set_updated_at
before update on public.campaign_product_settings
for each row execute function public.set_campaign_product_settings_updated_at();

create or replace function public.set_campaign_product_arrangements_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists campaign_product_arrangements_set_updated_at on public.campaign_product_arrangements;
create trigger campaign_product_arrangements_set_updated_at
before update on public.campaign_product_arrangements
for each row execute function public.set_campaign_product_arrangements_updated_at();

insert into public.campaign_product_settings (campaign_id, arrangement_mode)
select c.id, 'inherit_laboratory'::public.campaign_product_arrangement_mode
from public.campaigns c
on conflict (campaign_id) do nothing;

alter table public.campaign_product_settings enable row level security;
alter table public.campaign_product_arrangements enable row level security;

do $$
begin
  if to_regprocedure('public.current_user_role()') is not null then
    if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaign_product_settings' and policyname='admin all campaign_product_settings') then
      create policy "admin all campaign_product_settings" on public.campaign_product_settings
        for all using (public.current_user_role() = 'admin')
        with check (public.current_user_role() = 'admin');
    end if;

    if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaign_product_arrangements' and policyname='admin all campaign_product_arrangements') then
      create policy "admin all campaign_product_arrangements" on public.campaign_product_arrangements
        for all using (public.current_user_role() = 'admin')
        with check (public.current_user_role() = 'admin');
    end if;
  end if;
end $$;
