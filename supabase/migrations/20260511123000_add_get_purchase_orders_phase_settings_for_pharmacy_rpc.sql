create or replace function public.get_purchase_orders_phase_settings_for_pharmacy(
  p_campaign_id uuid,
  p_pharmacy_id uuid default null
)
returns table (
  allow_higher_than_intentions boolean,
  order_placement_mode public.order_placement_mode,
  multi_supplier_enabled boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.app_role;
  v_pharmacy_id uuid;
  v_allowed boolean;
begin
  v_role := public.current_user_role();
  v_pharmacy_id := coalesce(p_pharmacy_id, public.current_user_pharmacy_id());

  if v_role is null then
    raise exception 'FORBIDDEN';
  end if;

  if v_role = 'admin' then
    v_allowed := true;
  elsif v_role = 'pharmacy_user' then
    if v_pharmacy_id is null then
      raise exception 'PHARMACY_NOT_FOUND';
    end if;

    select exists (
      select 1
      from public.campaign_participants cp
      where cp.campaign_id = p_campaign_id
        and cp.pharmacy_id = v_pharmacy_id
    )
    into v_allowed;
  else
    v_allowed := false;
  end if;

  if not coalesce(v_allowed, false) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select
    coalesce(ph.allow_higher_than_intentions, false),
    coalesce(ph.order_placement_mode, 'participant_choice'::public.order_placement_mode),
    coalesce(ph.multi_supplier_enabled, false)
  from public.campaign_phases ph
  where ph.campaign_id = p_campaign_id
    and ph.phase_key = 'purchase_orders'
  limit 1;
end;
$$;

grant execute on function public.get_purchase_orders_phase_settings_for_pharmacy(uuid, uuid) to authenticated;
