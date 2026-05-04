create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_logs enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'audit_logs'
      and policyname = 'admin all audit_logs'
  ) then
    create policy "admin all audit_logs"
      on public.audit_logs
      for all
      using (public.current_user_role() = 'admin')
      with check (public.current_user_role() = 'admin');
  end if;
end$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'audit_logs'
      and policyname = 'pharmacy user sees own logs'
  ) then
    create policy "pharmacy user sees own logs"
      on public.audit_logs
      for select
      using (user_id = auth.uid());
  end if;
end$$;
