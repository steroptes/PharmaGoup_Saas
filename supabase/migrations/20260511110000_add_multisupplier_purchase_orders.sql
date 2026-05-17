create table if not exists public.campaign_phase_submission_line_suppliers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.campaign_phase_submissions(id) on delete cascade,
  product_id uuid not null references public.managed_products(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  quantity numeric(12,3) not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (submission_id, product_id, supplier_id)
);

create index if not exists idx_submission_line_suppliers_submission on public.campaign_phase_submission_line_suppliers(submission_id);
create index if not exists idx_submission_line_suppliers_supplier on public.campaign_phase_submission_line_suppliers(supplier_id);

alter table if exists public.campaign_phases
  add column if not exists multi_supplier_enabled boolean not null default false;

alter table public.campaign_phase_submission_line_suppliers enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'campaign_phase_submission_line_suppliers'
      and policyname = 'admin manage campaign_phase_submission_line_suppliers'
  ) then
    create policy "admin manage campaign_phase_submission_line_suppliers"
      on public.campaign_phase_submission_line_suppliers
      for all
      using (public.current_user_role() = 'admin')
      with check (public.current_user_role() = 'admin');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'campaign_phase_submission_line_suppliers'
      and policyname = 'pharmacy manage own campaign_phase_submission_line_suppliers'
  ) then
    create policy "pharmacy manage own campaign_phase_submission_line_suppliers"
      on public.campaign_phase_submission_line_suppliers
      for all
      using (
        exists (
          select 1
          from public.campaign_phase_submissions s
          where s.id = campaign_phase_submission_line_suppliers.submission_id
            and s.pharmacy_id = public.current_user_pharmacy_id()
        )
      )
      with check (
        exists (
          select 1
          from public.campaign_phase_submissions s
          where s.id = campaign_phase_submission_line_suppliers.submission_id
            and s.pharmacy_id = public.current_user_pharmacy_id()
        )
      );
  end if;
end $$;
