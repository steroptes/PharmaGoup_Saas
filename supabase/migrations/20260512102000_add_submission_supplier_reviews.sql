create table if not exists public.campaign_phase_submission_supplier_reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.campaign_phase_submissions(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  status text not null default 'submitted' check (status in ('draft','submitted','needs_correction','accepted')),
  admin_note text,
  correction_items jsonb not null default '[]'::jsonb,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (submission_id, supplier_id)
);

create index if not exists idx_submission_supplier_reviews_submission on public.campaign_phase_submission_supplier_reviews(submission_id);
create index if not exists idx_submission_supplier_reviews_status on public.campaign_phase_submission_supplier_reviews(status);

create or replace function public.set_submission_supplier_reviews_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_submission_supplier_reviews_set_updated_at on public.campaign_phase_submission_supplier_reviews;
create trigger trg_submission_supplier_reviews_set_updated_at
before update on public.campaign_phase_submission_supplier_reviews
for each row
execute function public.set_submission_supplier_reviews_updated_at();

alter table public.campaign_phase_submission_supplier_reviews enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaign_phase_submission_supplier_reviews' and policyname='admin all campaign_phase_submission_supplier_reviews') then
    create policy "admin all campaign_phase_submission_supplier_reviews" on public.campaign_phase_submission_supplier_reviews
      for all using (public.current_user_role() = 'admin')
      with check (public.current_user_role() = 'admin');
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaign_phase_submission_supplier_reviews' and policyname='pharmacy read own campaign_phase_submission_supplier_reviews') then
    create policy "pharmacy read own campaign_phase_submission_supplier_reviews" on public.campaign_phase_submission_supplier_reviews
      for select using (
        exists (
          select 1
          from public.campaign_phase_submissions s
          where s.id = campaign_phase_submission_supplier_reviews.submission_id
            and s.pharmacy_id = public.current_user_pharmacy_id()
        )
      );
  end if;
end $$;

insert into public.campaign_phase_submission_supplier_reviews (submission_id, supplier_id, status)
select
  s.id,
  ss.supplier_id,
  case
    when s.status = 'accepted' then 'accepted'
    when s.status = 'needs_correction' then 'needs_correction'
    when s.status = 'draft' then 'draft'
    else 'submitted'
  end as status
from public.campaign_phase_submissions s
join public.campaign_phase_submission_suppliers ss on ss.submission_id = s.id
where s.phase_key = 'purchase_orders'
on conflict (submission_id, supplier_id) do nothing;
