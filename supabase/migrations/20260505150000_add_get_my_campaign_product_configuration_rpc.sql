create or replace function public.get_my_campaign_product_configuration(
  p_campaign_id uuid
)
returns table (
  product_id uuid,
  arrangement_mode public.campaign_product_arrangement_mode,
  campaign_business_unit_id uuid,
  campaign_group_brand_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_pharmacy_id uuid;
  v_is_allowed boolean;
begin
  v_role := public.current_user_role();

  if v_role is null then
    raise exception 'FORBIDDEN';
  end if;

  if v_role = 'admin' then
    return query
    select
      cp.product_id,
      coalesce(cps.arrangement_mode, 'inherit_laboratory'::public.campaign_product_arrangement_mode) as arrangement_mode,
      cpa.campaign_business_unit_id,
      cpa.campaign_group_brand_id
    from public.campaign_products cp
    left join public.campaign_product_settings cps on cps.campaign_id = cp.campaign_id
    left join public.campaign_product_arrangements cpa
      on cpa.campaign_id = cp.campaign_id and cpa.product_id = cp.product_id
    where cp.campaign_id = p_campaign_id;
    return;
  end if;

  if v_role <> 'pharmacy_user' then
    raise exception 'FORBIDDEN';
  end if;

  v_pharmacy_id := public.current_user_pharmacy_id();
  if v_pharmacy_id is null then
    raise exception 'FORBIDDEN';
  end if;

  select exists (
    select 1
    from public.campaigns c
    join public.campaign_participants cp on cp.campaign_id = c.id
    where c.id = p_campaign_id
      and c.status = 'open'
      and cp.pharmacy_id = v_pharmacy_id
      and cp.participation_status = 'accepted'
  )
  into v_is_allowed;

  if not v_is_allowed then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select
    cp.product_id,
    coalesce(cps.arrangement_mode, 'inherit_laboratory'::public.campaign_product_arrangement_mode) as arrangement_mode,
    cpa.campaign_business_unit_id,
    cpa.campaign_group_brand_id
  from public.campaign_products cp
  left join public.campaign_product_settings cps on cps.campaign_id = cp.campaign_id
  left join public.campaign_product_arrangements cpa
    on cpa.campaign_id = cp.campaign_id and cpa.product_id = cp.product_id
  where cp.campaign_id = p_campaign_id;
end;
$$;

grant execute on function public.get_my_campaign_product_configuration(uuid) to authenticated;
