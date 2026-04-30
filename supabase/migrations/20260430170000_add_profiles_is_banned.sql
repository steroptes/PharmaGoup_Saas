alter table public.profiles
add column if not exists is_banned boolean not null default false;
