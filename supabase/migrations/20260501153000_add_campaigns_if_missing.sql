-- Safe migration for environments where baseline init was partially/manualy applied.
-- This avoids re-creating global enums like app_role and only ensures campaign schema exists.

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'campaign_status') then
    create type public.campaign_status as enum ('draft', 'open', 'closed', 'archived');
  end if;
end $$;

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  supplier_id uuid not null references public.suppliers(id),
  start_date date not null,
  end_date date not null,
  status public.campaign_status not null default 'draft',
  description text,
  created_at timestamptz not null default now(),
  constraint valid_campaign_dates check (end_date >= start_date)
);

create table if not exists public.campaign_participants (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (campaign_id, pharmacy_id)
);

create table if not exists public.campaign_products (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (campaign_id, product_id)
);

alter table public.campaigns enable row level security;
alter table public.campaign_participants enable row level security;
alter table public.campaign_products enable row level security;

do $$
begin
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
end $$;
