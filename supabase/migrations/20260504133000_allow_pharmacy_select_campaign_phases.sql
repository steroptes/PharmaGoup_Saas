do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'campaign_phases'
      and policyname = 'pharmacy user sees phases for own campaigns'
  ) then
    create policy "pharmacy user sees phases for own campaigns"
      on public.campaign_phases
      for select
      using (
        exists (
          select 1
          from public.campaign_participants cp
          where cp.campaign_id = campaign_phases.campaign_id
            and cp.pharmacy_id = public.current_user_pharmacy_id()
        )
      );
  end if;
end$$;
