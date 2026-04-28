create table public.laboratories (
  id uuid primary key default gen_random_uuid(),
  designation text not null,
  tax_identifier text,
  address text,
  mobile_phone text,
  landline_phone text,
  created_at timestamptz not null default now()
);

alter table public.laboratories enable row level security;

create policy "admin all laboratories" on public.laboratories
for all using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create policy "pharmacy user sees laboratories" on public.laboratories
for select using (true);
