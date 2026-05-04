create or replace function public.admin_delete_campaign_if_allowed(
  p_campaign_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.campaign_status;
  v_submissions_count bigint := 0;
  v_has_delivery_notes_table boolean;
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'FORBIDDEN';
  end if;

  select c.status
  into v_status
  from public.campaigns c
  where c.id = p_campaign_id;

  if v_status is null then
    raise exception 'CAMPAIGN_NOT_FOUND';
  end if;

  select to_regclass('public.delivery_notes') is not null
  into v_has_delivery_notes_table;

  if v_has_delivery_notes_table then
    select count(*)
    into v_submissions_count
    from public.delivery_notes dn
    where dn.campaign_id = p_campaign_id;
  end if;

  if not (v_status = 'draft' or v_submissions_count = 0) then
    raise exception 'CAMPAIGN_DELETE_NOT_ALLOWED';
  end if;

  delete from public.campaigns c
  where c.id = p_campaign_id;
end;
$$;

grant execute on function public.admin_delete_campaign_if_allowed(uuid) to authenticated;
