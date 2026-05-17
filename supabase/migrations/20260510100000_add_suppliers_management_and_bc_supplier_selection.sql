do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'supplier_nature'
  ) then
    create type public.supplier_nature as enum ('medicament', 'para', 'mixte');
  end if;
end $$;

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  tax_identifier text,
  phone text,
  email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  address text,
  mobile_phone text,
  landline_phone text,
  nature public.supplier_nature not null default 'mixte'
);

alter table if exists public.suppliers
  add column if not exists address text,
  add column if not exists mobile_phone text,
  add column if not exists landline_phone text,
  add column if not exists nature public.supplier_nature not null default 'mixte';

create table if not exists public.supplier_contacts (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  function_title text,
  phone text,
  created_at timestamptz not null default now()
);

create index if not exists idx_supplier_contacts_supplier on public.supplier_contacts(supplier_id);

create table if not exists public.pharmacy_partner_suppliers (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (pharmacy_id, supplier_id)
);

create index if not exists idx_pharmacy_partner_suppliers_pharmacy on public.pharmacy_partner_suppliers(pharmacy_id);
create index if not exists idx_pharmacy_partner_suppliers_supplier on public.pharmacy_partner_suppliers(supplier_id);

create table if not exists public.campaign_phase_submission_suppliers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.campaign_phase_submissions(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (submission_id, supplier_id)
);

create index if not exists idx_campaign_phase_submission_suppliers_submission on public.campaign_phase_submission_suppliers(submission_id);
create index if not exists idx_campaign_phase_submission_suppliers_supplier on public.campaign_phase_submission_suppliers(supplier_id);

alter table public.supplier_contacts enable row level security;
alter table public.pharmacy_partner_suppliers enable row level security;
alter table public.campaign_phase_submission_suppliers enable row level security;
alter table public.suppliers enable row level security;

do $$
begin
  if to_regprocedure('public.current_user_role()') is not null then
    if not exists (select 1 from pg_policies where schemaname='public' and tablename='suppliers' and policyname='admin all suppliers') then
      create policy "admin all suppliers" on public.suppliers
        for all using (public.current_user_role() = 'admin')
        with check (public.current_user_role() = 'admin');
    end if;

    if not exists (select 1 from pg_policies where schemaname='public' and tablename='supplier_contacts' and policyname='admin all supplier_contacts') then
      create policy "admin all supplier_contacts" on public.supplier_contacts
        for all using (public.current_user_role() = 'admin')
        with check (public.current_user_role() = 'admin');
    end if;

    if not exists (select 1 from pg_policies where schemaname='public' and tablename='pharmacy_partner_suppliers' and policyname='admin all pharmacy_partner_suppliers') then
      create policy "admin all pharmacy_partner_suppliers" on public.pharmacy_partner_suppliers
        for all using (public.current_user_role() = 'admin')
        with check (public.current_user_role() = 'admin');
    end if;

    if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaign_phase_submission_suppliers' and policyname='admin all campaign_phase_submission_suppliers') then
      create policy "admin all campaign_phase_submission_suppliers" on public.campaign_phase_submission_suppliers
        for all using (public.current_user_role() = 'admin')
        with check (public.current_user_role() = 'admin');
    end if;
  end if;

  if to_regprocedure('public.current_user_pharmacy_id()') is not null then
    if not exists (select 1 from pg_policies where schemaname='public' and tablename='suppliers' and policyname='pharmacy user sees suppliers') then
      create policy "pharmacy user sees suppliers" on public.suppliers
        for select using (true);
    end if;

    if not exists (select 1 from pg_policies where schemaname='public' and tablename='pharmacy_partner_suppliers' and policyname='pharmacy manage own partner suppliers') then
      create policy "pharmacy manage own partner suppliers" on public.pharmacy_partner_suppliers
        for all
        using (pharmacy_id = public.current_user_pharmacy_id())
        with check (pharmacy_id = public.current_user_pharmacy_id());
    end if;

    if not exists (select 1 from pg_policies where schemaname='public' and tablename='supplier_contacts' and policyname='pharmacy sees contacts of own partner suppliers') then
      create policy "pharmacy sees contacts of own partner suppliers" on public.supplier_contacts
        for select
        using (
          exists (
            select 1
            from public.pharmacy_partner_suppliers pps
            where pps.supplier_id = supplier_contacts.supplier_id
              and pps.pharmacy_id = public.current_user_pharmacy_id()
          )
        );
    end if;

    if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaign_phase_submission_suppliers' and policyname='pharmacy manage own campaign_phase_submission_suppliers') then
      create policy "pharmacy manage own campaign_phase_submission_suppliers" on public.campaign_phase_submission_suppliers
        for all
        using (
          exists (
            select 1
            from public.campaign_phase_submissions s
            where s.id = campaign_phase_submission_suppliers.submission_id
              and s.pharmacy_id = public.current_user_pharmacy_id()
          )
        )
        with check (
          exists (
            select 1
            from public.campaign_phase_submissions s
            where s.id = campaign_phase_submission_suppliers.submission_id
              and s.pharmacy_id = public.current_user_pharmacy_id()
          )
        );
    end if;
  end if;
end $$;
