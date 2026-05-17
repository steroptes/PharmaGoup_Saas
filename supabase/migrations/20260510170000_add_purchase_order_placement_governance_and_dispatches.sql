do $$
begin
  if not exists (select 1 from pg_type where typname = 'order_placement_mode') then
    create type public.order_placement_mode as enum ('participant_choice', 'admin_only', 'participant_only');
  end if;
end $$;

alter table if exists public.campaign_phases
  add column if not exists order_placement_mode public.order_placement_mode not null default 'participant_choice';

create table if not exists public.campaign_phase_authorized_suppliers (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  phase_key text not null check (phase_key in ('purchase_orders')),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (campaign_id, phase_key, supplier_id)
);

alter table if exists public.campaign_phase_submissions
  add column if not exists delegate_order_to_admin boolean not null default false;

create table if not exists public.purchase_order_dispatches (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.campaign_phase_submissions(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_role public.app_role not null,
  channel text not null check (channel in ('email', 'sms', 'whatsapp')),
  status text not null default 'sent' check (status in ('sent', 'failed')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_purchase_order_dispatches_submission on public.purchase_order_dispatches(submission_id, created_at desc);

alter table public.campaign_phase_authorized_suppliers enable row level security;
alter table public.purchase_order_dispatches enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'campaign_phase_authorized_suppliers'
      and policyname = 'admin manage campaign_phase_authorized_suppliers'
  ) then
    create policy "admin manage campaign_phase_authorized_suppliers"
      on public.campaign_phase_authorized_suppliers
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
      and tablename = 'purchase_order_dispatches'
      and policyname = 'admin manage purchase_order_dispatches'
  ) then
    create policy "admin manage purchase_order_dispatches"
      on public.purchase_order_dispatches
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
      and tablename = 'purchase_order_dispatches'
      and policyname = 'pharmacy read own purchase_order_dispatches'
  ) then
    create policy "pharmacy read own purchase_order_dispatches"
      on public.purchase_order_dispatches
      for select
      using (
        exists (
          select 1
          from public.campaign_phase_submissions s
          where s.id = purchase_order_dispatches.submission_id
            and s.pharmacy_id = public.current_user_pharmacy_id()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'purchase_order_dispatches'
      and policyname = 'pharmacy create own purchase_order_dispatches'
  ) then
    create policy "pharmacy create own purchase_order_dispatches"
      on public.purchase_order_dispatches
      for insert
      with check (
        actor_role = 'pharmacy_user'
        and exists (
          select 1
          from public.campaign_phase_submissions s
          where s.id = purchase_order_dispatches.submission_id
            and s.pharmacy_id = public.current_user_pharmacy_id()
        )
      );
  end if;
end $$;
