create or replace function public.set_my_campaign_participation(
  p_campaign_id uuid,
  p_status public.campaign_participation_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pharmacy_id uuid;
  v_campaign_status public.campaign_status;
  v_previous_status public.campaign_participation_status;
begin
  if p_status not in ('accepted', 'declined') then
    raise exception 'INVALID_PARTICIPATION_STATUS';
  end if;

  select p.pharmacy_id
  into v_pharmacy_id
  from public.profiles p
  where p.id = auth.uid()
  limit 1;

  if v_pharmacy_id is null then
    raise exception 'PHARMACY_NOT_FOUND';
  end if;

  select c.status
  into v_campaign_status
  from public.campaigns c
  where c.id = p_campaign_id;

  if v_campaign_status is null then
    raise exception 'CAMPAIGN_NOT_FOUND';
  end if;

  if v_campaign_status <> 'open' then
    raise exception 'CAMPAIGN_NOT_OPEN';
  end if;

  select cp.participation_status
  into v_previous_status
  from public.campaign_participants cp
  where cp.campaign_id = p_campaign_id
    and cp.pharmacy_id = v_pharmacy_id;

  if v_previous_status is null then
    raise exception 'CAMPAIGN_PARTICIPANT_NOT_FOUND';
  end if;

  update public.campaign_participants cp
  set participation_status = p_status
  where cp.campaign_id = p_campaign_id
    and cp.pharmacy_id = v_pharmacy_id;

  if v_previous_status is distinct from p_status then
    insert into public.audit_logs (user_id, entity_type, entity_id, action, details)
    values (
      auth.uid(),
      'campaign_participant',
      p_campaign_id,
      'participation_status_changed',
      jsonb_build_object(
        'pharmacy_id', v_pharmacy_id,
        'previous_status', v_previous_status,
        'new_status', p_status
      )
    );
  end if;
end;
$$;

grant execute on function public.set_my_campaign_participation(uuid, public.campaign_participation_status) to authenticated;
