do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'campaign_participation_status'
  ) then
    create type public.campaign_participation_status as enum ('pending', 'accepted', 'declined');
  end if;
end$$;

alter table public.campaign_participants
  add column if not exists participation_status public.campaign_participation_status not null default 'pending',
  add column if not exists participation_decided_at timestamptz;

create or replace function public.set_campaign_participation_decided_at()
returns trigger
language plpgsql
as $$
begin
  if new.participation_status is distinct from old.participation_status then
    new.participation_decided_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_campaign_participation_decided_at on public.campaign_participants;
create trigger trg_campaign_participation_decided_at
before update on public.campaign_participants
for each row execute function public.set_campaign_participation_decided_at();

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'campaign_participants'
      and policyname = 'pharmacy user update own campaign participation decision'
  ) then
    create policy "pharmacy user update own campaign participation decision"
      on public.campaign_participants
      for update
      using (
        pharmacy_id = public.current_user_pharmacy_id()
        and public.current_user_role() = 'pharmacy_user'
      )
      with check (
        pharmacy_id = public.current_user_pharmacy_id()
        and public.current_user_role() = 'pharmacy_user'
      );
  end if;
end$$;
