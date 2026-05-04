do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'campaign_phase_submission_status') then
    create type public.campaign_phase_submission_status as enum ('draft', 'submitted');
  end if;
end $$;

create table if not exists public.campaign_phase_submissions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  phase_key public.campaign_phase_key not null,
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  status public.campaign_phase_submission_status not null default 'draft',
  submitted_at timestamptz,
  total_quantity numeric(14,3) not null default 0,
  total_amount_ht numeric(14,3) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, phase_key, pharmacy_id)
);

create table if not exists public.campaign_phase_submission_lines (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.campaign_phase_submissions(id) on delete cascade,
  product_id uuid not null references public.managed_products(id),
  product_name text not null,
  campaign_business_unit_id uuid references public.campaign_business_units(id),
  campaign_group_brand_id uuid references public.campaign_group_brands(id),
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price_ht numeric(14,3) not null check (unit_price_ht >= 0),
  line_total_ht numeric(14,3) not null check (line_total_ht >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_campaign_phase_submissions_campaign_phase on public.campaign_phase_submissions(campaign_id, phase_key);
create index if not exists idx_campaign_phase_submissions_pharmacy on public.campaign_phase_submissions(pharmacy_id);
create index if not exists idx_campaign_phase_submission_lines_submission on public.campaign_phase_submission_lines(submission_id);

create or replace function public.update_campaign_phase_submission_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_campaign_phase_submissions_updated_at on public.campaign_phase_submissions;
create trigger trg_campaign_phase_submissions_updated_at
before update on public.campaign_phase_submissions
for each row execute function public.update_campaign_phase_submission_updated_at();

alter table public.campaign_phase_submissions enable row level security;
alter table public.campaign_phase_submission_lines enable row level security;

do $$
begin
  if to_regprocedure('public.current_user_role()') is null then
    return;
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaign_phase_submissions' and policyname='admin all campaign_phase_submissions') then
    create policy "admin all campaign_phase_submissions" on public.campaign_phase_submissions
      for all using (public.current_user_role() = 'admin')
      with check (public.current_user_role() = 'admin');
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaign_phase_submission_lines' and policyname='admin all campaign_phase_submission_lines') then
    create policy "admin all campaign_phase_submission_lines" on public.campaign_phase_submission_lines
      for all using (public.current_user_role() = 'admin')
      with check (public.current_user_role() = 'admin');
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaign_phase_submissions' and policyname='pharmacy own campaign_phase_submissions') then
    create policy "pharmacy own campaign_phase_submissions" on public.campaign_phase_submissions
      for select using (
        public.current_user_role() = 'pharmacy_user'
        and pharmacy_id = (
          select p.pharmacy_id from public.profiles p where p.id = auth.uid()
        )
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaign_phase_submissions' and policyname='pharmacy insert own campaign_phase_submissions') then
    create policy "pharmacy insert own campaign_phase_submissions" on public.campaign_phase_submissions
      for insert with check (
        public.current_user_role() = 'pharmacy_user'
        and pharmacy_id = (
          select p.pharmacy_id from public.profiles p where p.id = auth.uid()
        )
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaign_phase_submissions' and policyname='pharmacy update own campaign_phase_submissions') then
    create policy "pharmacy update own campaign_phase_submissions" on public.campaign_phase_submissions
      for update using (
        public.current_user_role() = 'pharmacy_user'
        and pharmacy_id = (
          select p.pharmacy_id from public.profiles p where p.id = auth.uid()
        )
      ) with check (
        public.current_user_role() = 'pharmacy_user'
        and pharmacy_id = (
          select p.pharmacy_id from public.profiles p where p.id = auth.uid()
        )
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaign_phase_submission_lines' and policyname='pharmacy own campaign_phase_submission_lines') then
    create policy "pharmacy own campaign_phase_submission_lines" on public.campaign_phase_submission_lines
      for select using (
        exists (
          select 1
          from public.campaign_phase_submissions s
          where s.id = submission_id
            and s.pharmacy_id = (select p.pharmacy_id from public.profiles p where p.id = auth.uid())
            and public.current_user_role() = 'pharmacy_user'
        )
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaign_phase_submission_lines' and policyname='pharmacy insert own campaign_phase_submission_lines') then
    create policy "pharmacy insert own campaign_phase_submission_lines" on public.campaign_phase_submission_lines
      for insert with check (
        exists (
          select 1
          from public.campaign_phase_submissions s
          where s.id = submission_id
            and s.pharmacy_id = (select p.pharmacy_id from public.profiles p where p.id = auth.uid())
            and public.current_user_role() = 'pharmacy_user'
        )
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaign_phase_submission_lines' and policyname='pharmacy delete own campaign_phase_submission_lines') then
    create policy "pharmacy delete own campaign_phase_submission_lines" on public.campaign_phase_submission_lines
      for delete using (
        exists (
          select 1
          from public.campaign_phase_submissions s
          where s.id = submission_id
            and s.pharmacy_id = (select p.pharmacy_id from public.profiles p where p.id = auth.uid())
            and public.current_user_role() = 'pharmacy_user'
        )
      );
  end if;
end $$;
