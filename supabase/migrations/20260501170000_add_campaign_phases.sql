do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'campaign_phase_key') then
    create type public.campaign_phase_key as enum ('purchase_intentions', 'purchase_orders', 'delivery_notes');
  end if;
end $$;

create table if not exists public.campaign_phases (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  phase_key public.campaign_phase_key not null,
  is_enabled boolean not null default false,
  has_period_limit boolean not null default false,
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_phases_campaign_phase_unique unique (campaign_id, phase_key),
  constraint campaign_phase_period_valid check (
    (not has_period_limit and start_date is null and end_date is null)
    or
    (has_period_limit and start_date is not null and end_date is not null and end_date >= start_date)
  )
);

create or replace function public.set_campaign_phase_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists campaign_phases_set_updated_at on public.campaign_phases;
create trigger campaign_phases_set_updated_at
before update on public.campaign_phases
for each row execute function public.set_campaign_phase_updated_at();

create or replace function public.enforce_delivery_notes_phase_enabled()
returns trigger
language plpgsql
as $$
begin
  if new.phase_key = 'delivery_notes' and not new.is_enabled then
    raise exception 'La phase delivery_notes est obligatoire et doit rester activée.';
  end if;
  return new;
end;
$$;

drop trigger if exists campaign_phases_enforce_delivery_notes on public.campaign_phases;
create trigger campaign_phases_enforce_delivery_notes
before insert or update on public.campaign_phases
for each row execute function public.enforce_delivery_notes_phase_enabled();

create or replace function public.bootstrap_campaign_phases()
returns trigger
language plpgsql
as $$
begin
  insert into public.campaign_phases (campaign_id, phase_key, is_enabled)
  values
    (new.id, 'purchase_intentions', false),
    (new.id, 'purchase_orders', false),
    (new.id, 'delivery_notes', true)
  on conflict (campaign_id, phase_key) do nothing;
  return new;
end;
$$;

drop trigger if exists campaigns_bootstrap_phases on public.campaigns;
create trigger campaigns_bootstrap_phases
after insert on public.campaigns
for each row execute function public.bootstrap_campaign_phases();

insert into public.campaign_phases (campaign_id, phase_key, is_enabled)
select c.id, phase.phase_key, case when phase.phase_key = 'delivery_notes' then true else false end
from public.campaigns c
cross join (values ('purchase_intentions'::public.campaign_phase_key), ('purchase_orders'::public.campaign_phase_key), ('delivery_notes'::public.campaign_phase_key)) as phase(phase_key)
on conflict (campaign_id, phase_key) do nothing;

update public.campaign_phases
set is_enabled = true
where phase_key = 'delivery_notes' and is_enabled = false;

alter table public.campaign_phases enable row level security;

do $$
begin
  if to_regprocedure('public.current_user_role()') is not null then
    if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaign_phases' and policyname='admin all campaign_phases') then
      create policy "admin all campaign_phases" on public.campaign_phases
        for all using (public.current_user_role() = 'admin')
        with check (public.current_user_role() = 'admin');
    end if;
  end if;
end $$;
