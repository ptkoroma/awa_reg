create table if not exists public.vip_event_state (
  event_id text primary key,
  event_name text not null default 'VIP Guest Registration',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vip_event_state enable row level security;

grant usage on schema public to anon, authenticated;
revoke all on public.vip_event_state from anon;
grant select, insert, update on public.vip_event_state to authenticated;

drop policy if exists "Allow public staging reads" on public.vip_event_state;
drop policy if exists "Allow public staging inserts" on public.vip_event_state;
drop policy if exists "Allow public staging updates" on public.vip_event_state;
drop policy if exists "Allow signed-in staff reads" on public.vip_event_state;
drop policy if exists "Allow signed-in staff inserts" on public.vip_event_state;
drop policy if exists "Allow signed-in staff updates" on public.vip_event_state;

create policy "Allow signed-in staff reads"
on public.vip_event_state
for select
to authenticated
using (true);

create policy "Allow signed-in staff inserts"
on public.vip_event_state
for insert
to authenticated
with check (true);

create policy "Allow signed-in staff updates"
on public.vip_event_state
for update
to authenticated
using (true)
with check (true);
