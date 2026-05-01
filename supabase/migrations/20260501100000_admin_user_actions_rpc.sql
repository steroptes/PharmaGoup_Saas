create or replace function public.admin_toggle_user_ban(
  p_user_id uuid,
  p_is_banned boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'FORBIDDEN';
  end if;

  update public.profiles
  set is_banned = p_is_banned
  where id = p_user_id;
end;
$$;

grant execute on function public.admin_toggle_user_ban(uuid, boolean) to authenticated;

create or replace function public.admin_delete_user_account(
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'FORBIDDEN';
  end if;

  delete from auth.users where id = p_user_id;
end;
$$;

grant execute on function public.admin_delete_user_account(uuid) to authenticated;
