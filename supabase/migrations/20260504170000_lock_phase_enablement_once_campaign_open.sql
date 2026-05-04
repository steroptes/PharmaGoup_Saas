create or replace function public.lock_campaign_phase_enablement_once_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_status public.campaign_status;
begin
  if new.is_enabled is distinct from old.is_enabled then
    select c.status
    into v_campaign_status
    from public.campaigns c
    where c.id = new.campaign_id;

    if v_campaign_status = 'open' then
      raise exception 'CAMPAIGN_PHASE_ENABLEMENT_LOCKED_ON_OPEN';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_lock_campaign_phase_enablement_once_open on public.campaign_phases;
create trigger trg_lock_campaign_phase_enablement_once_open
before update on public.campaign_phases
for each row
execute function public.lock_campaign_phase_enablement_once_open();
