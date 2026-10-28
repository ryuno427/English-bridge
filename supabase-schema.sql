-- English Bridge cloud sync schema
-- Run once in Supabase Dashboard > SQL Editor.

create table if not exists public.sync_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  store_name text not null check (store_name in (
    'quickRecords', 'reviewCards', 'reviewLogs', 'usageLogs',
    'weeklyPlans', 'dailyGoals', 'categories', 'settings', 'appMeta'
  )),
  item_id text not null,
  payload jsonb not null default '{}'::jsonb,
  device_id text not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, store_name, item_id)
);

create index if not exists sync_items_user_updated_idx
  on public.sync_items (user_id, updated_at desc);

alter table public.sync_items enable row level security;

revoke all on table public.sync_items from anon;
revoke all on table public.sync_items from authenticated;
grant select, insert, update, delete on table public.sync_items to authenticated;

create policy "Users can read their own sync items"
on public.sync_items for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own sync items"
on public.sync_items for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own sync items"
on public.sync_items for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own sync items"
on public.sync_items for delete
to authenticated
using ((select auth.uid()) = user_id);
