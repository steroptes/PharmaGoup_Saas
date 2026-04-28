-- Extensions
create extension if not exists "pgcrypto";

-- Enums
create type public.app_role as enum ('admin', 'pharmacy_user');
create type public.campaign_status as enum ('draft', 'open', 'closed', 'archived');
create type public.delivery_note_status as enum ('draft', 'extracted', 'corrected', 'submitted', 'validated', 'rejected');

-- Core tables
create table public.pharmacies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  tax_identifier text,
  phone text,
  email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  tax_identifier text,
  phone text,
  email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  code text not null,
  designation text not null,
  p_phar_default numeric(12,2),
  p_pub_default numeric(12,2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (supplier_id, code)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.app_role not null,
  pharmacy_id uuid references public.pharmacies(id),
  created_at timestamptz not null default now(),
  constraint pharmacy_required_for_pharmacy_user check (
    (role = 'admin' and pharmacy_id is null)
    or (role = 'pharmacy_user' and pharmacy_id is not null)
  )
);

create table public.campaigns (
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

create table public.campaign_participants (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (campaign_id, pharmacy_id)
);

create table public.campaign_products (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (campaign_id, product_id)
);

create table public.delivery_notes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id),
  pharmacy_id uuid not null references public.pharmacies(id),
  supplier_id uuid not null references public.suppliers(id),
  uploaded_by uuid not null references auth.users(id),
  bl_number text,
  bl_date date,
  total_ht numeric(12,2),
  total_tva numeric(12,2),
  total_ttc numeric(12,2),
  file_url text not null,
  status public.delivery_note_status not null default 'draft',
  ocr_confidence numeric(5,2),
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.delivery_note_lines (
  id uuid primary key default gen_random_uuid(),
  delivery_note_id uuid not null references public.delivery_notes(id) on delete cascade,
  product_id uuid references public.products(id),
  product_code text not null,
  designation text not null,
  quantity numeric(12,2) not null check (quantity > 0),
  p_phar numeric(12,2) not null check (p_phar > 0),
  p_pub numeric(12,2),
  subtotal numeric(12,2) not null check (subtotal >= 0),
  line_confidence numeric(5,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);


-- Utility helpers (defined after profiles table exists)
create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_user_pharmacy_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select pharmacy_id from public.profiles where id = auth.uid();
$$;

-- Update timestamp trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_delivery_notes_updated_at
before update on public.delivery_notes
for each row execute function public.set_updated_at();

create trigger trg_delivery_note_lines_updated_at
before update on public.delivery_note_lines
for each row execute function public.set_updated_at();

-- Business validation for campaign/date/supplier consistency
create or replace function public.validate_delivery_note_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  campaign_row public.campaigns;
  has_scope boolean;
begin
  select * into campaign_row from public.campaigns where id = new.campaign_id;
  if campaign_row.id is null then
    raise exception 'Campagne inexistante';
  end if;

  if campaign_row.status <> 'open' then
    raise exception 'La campagne doit être ouverte';
  end if;

  if current_date < campaign_row.start_date or current_date > campaign_row.end_date then
    raise exception 'La campagne doit être active selon les dates';
  end if;

  if new.supplier_id <> campaign_row.supplier_id then
    raise exception 'Le fournisseur du BL doit correspondre à la campagne';
  end if;

  select exists (
    select 1 from public.campaign_participants cp
    where cp.campaign_id = new.campaign_id and cp.pharmacy_id = new.pharmacy_id
  ) into has_scope;

  if not has_scope then
    raise exception 'La pharmacie ne participe pas à la campagne';
  end if;

  return new;
end;
$$;

create trigger trg_delivery_note_validate
before insert or update on public.delivery_notes
for each row execute function public.validate_delivery_note_before_write();

-- RLS enable
alter table public.profiles enable row level security;
alter table public.pharmacies enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_participants enable row level security;
alter table public.campaign_products enable row level security;
alter table public.delivery_notes enable row level security;
alter table public.delivery_note_lines enable row level security;
alter table public.audit_logs enable row level security;

-- Admin blanket access
create policy "admin all profiles" on public.profiles for all using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy "admin all pharmacies" on public.pharmacies for all using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy "admin all suppliers" on public.suppliers for all using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy "admin all products" on public.products for all using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy "admin all campaigns" on public.campaigns for all using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy "admin all campaign_participants" on public.campaign_participants for all using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy "admin all campaign_products" on public.campaign_products for all using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy "admin all delivery_notes" on public.delivery_notes for all using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy "admin all delivery_note_lines" on public.delivery_note_lines for all using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy "admin all audit_logs" on public.audit_logs for all using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');

-- Pharmacy user scoped access
create policy "pharmacy user own profile" on public.profiles
for select using (id = auth.uid());

create policy "pharmacy user sees own pharmacy" on public.pharmacies
for select using (id = public.current_user_pharmacy_id());

create policy "pharmacy user sees suppliers" on public.suppliers
for select using (true);

create policy "pharmacy user sees products via campaign scope" on public.products
for select using (
  exists (
    select 1
    from public.campaigns c
    join public.campaign_participants cp on cp.campaign_id = c.id
    where c.supplier_id = products.supplier_id
      and cp.pharmacy_id = public.current_user_pharmacy_id()
  )
);

create policy "pharmacy user sees campaigns where participant" on public.campaigns
for select using (
  exists (
    select 1 from public.campaign_participants cp
    where cp.campaign_id = campaigns.id
      and cp.pharmacy_id = public.current_user_pharmacy_id()
  )
);

create policy "pharmacy user sees own campaign participants" on public.campaign_participants
for select using (pharmacy_id = public.current_user_pharmacy_id());

create policy "pharmacy user sees campaign products for own campaigns" on public.campaign_products
for select using (
  exists (
    select 1 from public.campaign_participants cp
    where cp.campaign_id = campaign_products.campaign_id
      and cp.pharmacy_id = public.current_user_pharmacy_id()
  )
);

create policy "pharmacy user manage own non-validated notes" on public.delivery_notes
for all
using (
  pharmacy_id = public.current_user_pharmacy_id()
  and (
    uploaded_by = auth.uid()
    or status in ('submitted', 'rejected', 'corrected', 'draft', 'extracted')
  )
)
with check (
  pharmacy_id = public.current_user_pharmacy_id()
  and uploaded_by = auth.uid()
  and status <> 'validated'
);

create policy "pharmacy user can update own note before validated" on public.delivery_notes
for update
using (
  pharmacy_id = public.current_user_pharmacy_id()
  and uploaded_by = auth.uid()
  and status <> 'validated'
)
with check (
  pharmacy_id = public.current_user_pharmacy_id()
  and uploaded_by = auth.uid()
  and status <> 'validated'
);

create policy "pharmacy user lines via own note" on public.delivery_note_lines
for all
using (
  exists (
    select 1 from public.delivery_notes dn
    where dn.id = delivery_note_lines.delivery_note_id
      and dn.pharmacy_id = public.current_user_pharmacy_id()
      and (dn.uploaded_by = auth.uid() or dn.status in ('submitted', 'rejected', 'corrected', 'draft', 'extracted'))
      and dn.status <> 'validated'
  )
)
with check (
  exists (
    select 1 from public.delivery_notes dn
    where dn.id = delivery_note_lines.delivery_note_id
      and dn.pharmacy_id = public.current_user_pharmacy_id()
      and dn.uploaded_by = auth.uid()
      and dn.status <> 'validated'
  )
);

create policy "pharmacy user sees own logs" on public.audit_logs
for select using (user_id = auth.uid());

-- Storage bucket expectation (run in Supabase SQL editor with storage schema access)
-- insert into storage.buckets (id, name, public) values ('delivery-notes', 'delivery-notes', false)
-- on conflict do nothing;
