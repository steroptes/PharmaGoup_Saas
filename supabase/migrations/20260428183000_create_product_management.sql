create type public.product_nature as enum ('medicament', 'para');

create table public.vat_rates (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  rate numeric(5,2) not null check (rate >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (label),
  unique (rate)
);

create table public.managed_products (
  id uuid primary key default gen_random_uuid(),
  designation text not null,
  nature public.product_nature not null,
  pct_code text,
  barcode text not null unique,
  purchase_unit_price_ht numeric(12,3) not null check (purchase_unit_price_ht >= 0),
  vat_rate_id uuid not null references public.vat_rates(id),
  laboratory_id uuid not null references public.laboratories(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint pct_required_for_medicament check (
    (nature = 'medicament' and pct_code is not null and length(trim(pct_code)) > 0)
    or nature = 'para'
  )
);

create unique index managed_products_pct_unique_not_null on public.managed_products (pct_code) where pct_code is not null;

insert into public.vat_rates (label, rate)
values
  ('TVA 0%', 0.00),
  ('TVA 7%', 7.00),
  ('TVA 13%', 13.00),
  ('TVA 19%', 19.00)
on conflict do nothing;

alter table public.vat_rates enable row level security;
alter table public.managed_products enable row level security;

create policy "admin all vat_rates" on public.vat_rates
for all using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create policy "pharmacy user sees vat_rates" on public.vat_rates
for select using (true);

create policy "admin all managed_products" on public.managed_products
for all using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create policy "pharmacy user sees managed_products" on public.managed_products
for select using (true);
