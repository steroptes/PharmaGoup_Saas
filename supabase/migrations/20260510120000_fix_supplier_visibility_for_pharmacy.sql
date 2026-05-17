alter table if exists public.suppliers enable row level security;

grant select on table public.suppliers to anon, authenticated, service_role;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname='public'
      and tablename='suppliers'
      and policyname='pharmacy user sees suppliers'
  ) then
    create policy "pharmacy user sees suppliers"
      on public.suppliers
      for select
      using (true);
  end if;
end $$;

