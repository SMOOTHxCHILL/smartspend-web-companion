-- =====================================================================
-- SmartSpend: accounts, phone-number members and per-account data access
-- =====================================================================
--
-- Run this ONCE in the Supabase SQL editor (Dashboard → SQL Editor → New
-- query → paste → Run). It runs as one transaction: if anything fails,
-- nothing is changed.
--
-- BEFORE RUNNING: replace REPLACE_WITH_OWNER_PHONE below with the phone
-- number that should own the data that is already in the database
-- (country code + number, e.g. +91 98765 43210). The first time that
-- number logs in, it becomes the owner of the existing data.
--
-- What this does
--   * accounts            one row per SmartSpend account (a household)
--   * account_members     each logged-in phone number belongs to exactly
--                         one account, as 'owner' or 'member'
--   * account_invites     phone numbers added to an account that haven't
--                         accepted yet
--   * every data table gets account_id + Row Level Security, so a logged-in
--     user can only ever read or change their own account's rows
--   * the existing reporting RPCs run as the caller, so RLS applies to them
--   * sync_transactions() for the Android app
--   * a private "apk" storage bucket for the Android app download
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Settings for this run
-- ---------------------------------------------------------------------
create temporary table _settings on commit drop as
select
  'REPLACE_WITH_OWNER_PHONE'::text as owner_phone,
  '00000000-0000-0000-0000-000000000001'::uuid as legacy_account_id;

do $$
begin
  if (select owner_phone from _settings) like 'REPLACE%' then
    raise exception 'Edit the script first: replace REPLACE_WITH_OWNER_PHONE with the owner''s phone number.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Account tables
-- ---------------------------------------------------------------------
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My account' check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now()
);

create table if not exists public.account_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  phone text not null,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now()
);
create index if not exists account_members_account_id_idx on public.account_members (account_id);

-- One pending invite per (phone, account). invited_by is NULL only for
-- invites created by this script; those are accepted automatically.
create table if not exists public.account_invites (
  phone text not null,
  account_id uuid not null references public.accounts (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (phone, account_id)
);

-- Phone numbers are stored as digits with country code ("919876543210"),
-- which is also how Supabase Auth stores them. A bare 10-digit number is
-- assumed to be Indian.
create or replace function public.normalize_phone(p text)
returns text
language sql
immutable
as $$
  select case when length(d) = 10 then '91' || d else d end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x
$$;

-- The caller's account. SECURITY DEFINER so RLS policies can use it
-- without recursing into account_members' own policy.
create or replace function public.current_account_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select account_id from public.account_members where user_id = auth.uid()
$$;

create or replace function public.current_account_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.account_members where user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- 2. The existing data becomes the "Home" account
-- ---------------------------------------------------------------------
insert into public.accounts (id, name)
select legacy_account_id, 'Home' from _settings
on conflict (id) do nothing;

insert into public.account_invites (phone, account_id, role, invited_by)
select public.normalize_phone(owner_phone), legacy_account_id, 'owner', null from _settings
on conflict (phone, account_id) do nothing;

-- ---------------------------------------------------------------------
-- 3. account_id + Row Level Security on every data table
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  pol record;
  legacy uuid := (select legacy_account_id from _settings);
begin
  foreach t in array array['merchants', 'transactions', 'raw_sms', 'merchant_aliases', 'transaction_embeddings'] loop
    if to_regclass('public.' || t) is null then
      raise notice 'Table % not found, skipped', t;
      continue;
    end if;

    execute format('alter table public.%I add column if not exists account_id uuid references public.accounts (id) on delete cascade', t);
    execute format('update public.%I set account_id = %L where account_id is null', t, legacy);
    execute format('alter table public.%I alter column account_id set default public.current_account_id()', t);
    execute format('alter table public.%I alter column account_id set not null', t);
    execute format('create index if not exists %I on public.%I (account_id)', t || '_account_id_idx', t);

    -- Remove any earlier policies (e.g. "anyone can read") — they would
    -- otherwise be OR-ed with the account policy and leak data.
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;

    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy account_isolation on public.%I for all to authenticated
         using (account_id = public.current_account_id())
         with check (account_id = public.current_account_id())', t);
  end loop;
end $$;

-- Account tables: members can see their own account; all changes go
-- through the SECURITY DEFINER functions below.
alter table public.accounts enable row level security;
alter table public.account_members enable row level security;
alter table public.account_invites enable row level security;

drop policy if exists account_read on public.accounts;
create policy account_read on public.accounts for select to authenticated
  using (id = public.current_account_id());

drop policy if exists members_read on public.account_members;
create policy members_read on public.account_members for select to authenticated
  using (account_id = public.current_account_id());

drop policy if exists invites_read on public.account_invites;
create policy invites_read on public.account_invites for select to authenticated
  using (account_id = public.current_account_id());

-- ---------------------------------------------------------------------
-- 4. Make the data tables multi-account
-- ---------------------------------------------------------------------

-- 4a. Merchant names were unique per database; now they are unique per
--     account. Merge any duplicate names first (keep a manually
--     categorised row, otherwise the oldest).
create temporary table _merchant_dupes on commit drop as
select id, keep_id
from (
  select id,
         first_value(id) over (
           partition by account_id, canonical_name
           order by (coalesce(category_source, '') = 'manual') desc, id
         ) as keep_id
  from public.merchants
) ranked
where id <> keep_id;

update public.transactions t set merchant_id = d.keep_id
from _merchant_dupes d where t.merchant_id = d.id;

update public.merchant_aliases a set merchant_id = d.keep_id
from _merchant_dupes d where a.merchant_id = d.id;

delete from public.merchants m using _merchant_dupes d where m.id = d.id;

-- 4b. Drop single-column UNIQUE constraints/indexes that would stop two
--     accounts from having the same merchant name / hash.
do $$
declare
  r record;
begin
  for r in
    select c.conname, cl.relname
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    join pg_attribute a on a.attrelid = cl.oid and a.attnum = c.conkey[1]
    where n.nspname = 'public'
      and c.contype = 'u'
      and array_length(c.conkey, 1) = 1
      and (cl.relname::text, a.attname::text) in (
        ('merchants', 'canonical_name'),
        ('transactions', 'dedup_hash'),
        ('raw_sms', 'sms_hash'),
        ('merchant_aliases', 'alias_text'))
  loop
    execute format('alter table public.%I drop constraint %I', r.relname, r.conname);
  end loop;

  for r in
    select ic.relname as index_name
    from pg_index i
    join pg_class ic on ic.oid = i.indexrelid
    join pg_class tc on tc.oid = i.indrelid
    join pg_namespace n on n.oid = tc.relnamespace
    join pg_attribute a on a.attrelid = tc.oid and a.attnum = i.indkey[0]
    where n.nspname = 'public'
      and i.indisunique and not i.indisprimary
      and i.indnatts = 1
      and (tc.relname::text, a.attname::text) in (
        ('merchants', 'canonical_name'),
        ('transactions', 'dedup_hash'),
        ('raw_sms', 'sms_hash'),
        ('merchant_aliases', 'alias_text'))
  loop
    execute format('drop index public.%I', r.index_name);
  end loop;
end $$;

create unique index if not exists merchants_account_name_key
  on public.merchants (account_id, canonical_name);
create unique index if not exists raw_sms_account_hash_key
  on public.raw_sms (account_id, sms_hash);

-- 4c. Transactions get a stable cross-device key: the SHA-256 of the SMS
--     they came from (the app's raw_sms.sms_hash). The app's own
--     dedup_hash includes a local row id, so it changes on reinstall.
alter table public.transactions add column if not exists source_hash text;

update public.transactions t
set source_hash = r.sms_hash
from public.raw_sms r
where t.raw_sms_id = r.id and t.source_hash is null;

create unique index if not exists transactions_account_source_key
  on public.transactions (account_id, source_hash);

-- The app does not upload raw SMS bodies, so new rows have no raw_sms_id.
alter table public.transactions alter column raw_sms_id drop not null;

-- 4d. Rows were copied in with explicit ids, so the id sequences may be
--     behind (or missing). Point them past the current max id.
do $$
declare
  t text;
  seq text;
begin
  foreach t in array array['merchants', 'transactions'] loop
    seq := pg_get_serial_sequence('public.' || t, 'id');
    if seq is null then
      execute format('create sequence if not exists public.%I owned by public.%I.id', t || '_id_seq', t);
      seq := 'public.' || t || '_id_seq';
      execute format('alter table public.%I alter column id set default nextval(%L)', t, seq);
    end if;
    execute format('select setval(%L, coalesce((select max(id) from public.%I), 0) + 1, false)', seq, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5. Existing reporting RPCs: run as the caller so RLS filters them
-- ---------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'get_spending_by_filter', 'get_spending_by_category', 'get_spending_by_month',
        'get_spending_summary', 'match_transaction_embeddings',
        'match_transaction_embeddings_filtered')
  loop
    execute format('alter function %s security invoker', r.sig);
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 6. Account functions (called after login and from the Account page)
-- ---------------------------------------------------------------------

-- Called right after every login. Puts the user in an account:
--   already a member      → nothing to do
--   invite from setup     → join it (the "Home" owner invite above)
--   otherwise             → a new, empty account they own (open sign-up)
-- Invites from other people are NOT auto-accepted; they show up on the
-- Account page so the person can accept or decline.
create or replace function public.ensure_account()
returns table (account_id uuid, account_name text, role text, phone text, pending_invites int)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  ph text;
  inv record;
  new_account uuid;
begin
  if uid is null then
    raise exception 'Not logged in' using errcode = '28000';
  end if;

  select public.normalize_phone(u.phone) into ph
  from auth.users u
  where u.id = uid and u.phone_confirmed_at is not null;

  if coalesce(ph, '') = '' then
    raise exception 'This login has no verified phone number' using errcode = '28000';
  end if;

  if not exists (select 1 from public.account_members m where m.user_id = uid) then
    select * into inv
    from public.account_invites i
    where i.phone = ph and i.invited_by is null
    order by i.created_at
    limit 1;

    if found then
      insert into public.account_members (user_id, account_id, phone, role)
      values (uid, inv.account_id, ph, inv.role);
      delete from public.account_invites i where i.phone = ph and i.account_id = inv.account_id;
    else
      insert into public.accounts (name) values ('My account') returning id into new_account;
      insert into public.account_members (user_id, account_id, phone, role)
      values (uid, new_account, ph, 'owner');
    end if;
  end if;

  return query
  select a.id, a.name, m.role, m.phone,
         (select count(*)::int from public.account_invites i
           where i.phone = ph and i.account_id <> a.id)
  from public.account_members m
  join public.accounts a on a.id = m.account_id
  where m.user_id = uid;
end $$;

-- Everything the Account page shows, in one call.
create or replace function public.get_account_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me record;
  ph text;
begin
  select m.*, a.name as account_name into me
  from public.account_members m
  join public.accounts a on a.id = m.account_id
  where m.user_id = auth.uid();

  if not found then
    raise exception 'No account yet' using errcode = '28000';
  end if;

  ph := me.phone;

  return jsonb_build_object(
    'account', jsonb_build_object('id', me.account_id, 'name', me.account_name),
    'me', jsonb_build_object('user_id', me.user_id, 'phone', me.phone, 'role', me.role),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', m.user_id, 'phone', m.phone, 'role', m.role, 'joined_at', m.created_at)
             order by m.created_at)
      from public.account_members m where m.account_id = me.account_id), '[]'::jsonb),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object('phone', i.phone, 'role', i.role, 'created_at', i.created_at)
             order by i.created_at)
      from public.account_invites i where i.account_id = me.account_id), '[]'::jsonb),
    'incoming_invites', coalesce((
      select jsonb_agg(jsonb_build_object(
               'account_id', i.account_id, 'account_name', a.name, 'role', i.role,
               'invited_by_phone', inviter.phone, 'created_at', i.created_at)
             order by i.created_at)
      from public.account_invites i
      join public.accounts a on a.id = i.account_id
      left join public.account_members inviter on inviter.user_id = i.invited_by
      where i.phone = ph and i.account_id <> me.account_id), '[]'::jsonb),
    'transaction_count', (select count(*) from public.transactions t where t.account_id = me.account_id)
  );
end $$;

-- Owner adds a phone number. The person accepts on their Account page
-- after logging in with that number.
create or replace function public.add_account_phone(p_phone text, p_role text default 'member')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me record;
  ph text := public.normalize_phone(p_phone);
begin
  select * into me from public.account_members where user_id = auth.uid();
  if not found or me.role <> 'owner' then
    raise exception 'Only an account owner can add phone numbers' using errcode = '42501';
  end if;
  if ph !~ '^[0-9]{11,15}$' then
    raise exception 'Enter a valid phone number with country code' using errcode = '22023';
  end if;
  if p_role not in ('owner', 'member') then
    raise exception 'Role must be owner or member' using errcode = '22023';
  end if;
  if exists (select 1 from public.account_members where account_id = me.account_id and phone = ph) then
    raise exception 'That number is already on this account' using errcode = '23505';
  end if;
  if (select count(*) from public.account_invites where account_id = me.account_id) >= 20 then
    raise exception 'Too many pending invites' using errcode = '54000';
  end if;

  insert into public.account_invites (phone, account_id, role, invited_by)
  values (ph, me.account_id, p_role, me.user_id)
  on conflict (phone, account_id) do update set role = excluded.role, invited_by = excluded.invited_by;

  return ph;
end $$;

create or replace function public.cancel_account_invite(p_phone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_account_role() is distinct from 'owner' then
    raise exception 'Only an account owner can cancel invites' using errcode = '42501';
  end if;
  delete from public.account_invites
  where account_id = public.current_account_id() and phone = public.normalize_phone(p_phone);
end $$;

-- Internal: take a user out of their current account. If they were the
-- last member, the account and all its data are deleted. If they were the
-- last owner, the longest-standing member becomes owner.
create or replace function public._detach_member(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  acc uuid;
begin
  delete from public.account_members where user_id = p_user returning account_id into acc;
  if acc is null then
    return;
  end if;

  if not exists (select 1 from public.account_members where account_id = acc) then
    delete from public.accounts where id = acc;
  elsif not exists (select 1 from public.account_members where account_id = acc and role = 'owner') then
    update public.account_members set role = 'owner'
    where user_id = (select user_id from public.account_members where account_id = acc order by created_at limit 1);
  end if;
end $$;
revoke execute on function public._detach_member(uuid) from public, anon, authenticated;

create or replace function public.accept_account_invite(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me record;
  inv record;
begin
  select * into me from public.account_members where user_id = auth.uid();
  if not found then
    raise exception 'Log in again first' using errcode = '28000';
  end if;

  select * into inv from public.account_invites where phone = me.phone and account_id = p_account_id;
  if not found then
    raise exception 'That invite no longer exists' using errcode = 'P0002';
  end if;

  perform public._detach_member(me.user_id);

  insert into public.account_members (user_id, account_id, phone, role)
  values (me.user_id, p_account_id, me.phone, inv.role);

  delete from public.account_invites where phone = me.phone and account_id = p_account_id;
end $$;

create or replace function public.decline_account_invite(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.account_invites
  where account_id = p_account_id
    and phone = (select phone from public.account_members where user_id = auth.uid());
end $$;

-- Owner removes a phone number from the account. That person immediately
-- loses access; next time they log in they get a fresh, empty account.
create or replace function public.remove_account_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me record;
begin
  select * into me from public.account_members where user_id = auth.uid();
  if not found or me.role <> 'owner' then
    raise exception 'Only an account owner can remove numbers' using errcode = '42501';
  end if;
  if p_user_id = me.user_id then
    raise exception 'Use "Leave account" to remove yourself' using errcode = '22023';
  end if;
  if not exists (select 1 from public.account_members where user_id = p_user_id and account_id = me.account_id) then
    raise exception 'That number is not on this account' using errcode = 'P0002';
  end if;

  delete from public.account_members where user_id = p_user_id;
end $$;

-- Leave the account. If you are the last member the account and its data
-- are deleted, so the page asks for confirmation first.
create or replace function public.leave_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._detach_member(auth.uid());
end $$;

create or replace function public.rename_account(p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
begin
  if public.current_account_role() is distinct from 'owner' then
    raise exception 'Only an account owner can rename the account' using errcode = '42501';
  end if;
  if char_length(clean) not between 1 and 40 then
    raise exception 'Name must be 1–40 characters' using errcode = '22023';
  end if;
  update public.accounts set name = clean where id = public.current_account_id();
end $$;

-- ---------------------------------------------------------------------
-- 7. Sync from the Android app
-- ---------------------------------------------------------------------
-- p_items: [{ source_hash, dedup_hash, bank, amount, type, raw_merchant,
--             transaction_date (ISO-8601 or null), confidence,
--             merchant: { name, category, category_source, mcc } | null }]
--
-- Runs as the caller, so RLS keeps everything inside their account.
-- Category rule: a category set on the website ('manual') always wins;
-- a correction made in the app ('user_corrected') beats the app's
-- automatic guesses.
create or replace function public.sync_transactions(p_items jsonb)
returns table (id bigint, inserted boolean)
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  acc uuid := public.current_account_id();
begin
  if acc is null then
    raise exception 'No account for this login' using errcode = '28000';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 1000 then
    raise exception 'p_items must be an array of at most 1000 items' using errcode = '22023';
  end if;

  insert into public.merchants as m (account_id, canonical_name, category, category_source, mcc, created_at, updated_at)
  select acc, x.name, x.category, x.category_source, x.mcc, now(), now()
  from (
    select distinct on (name) name, category, category_source, mcc
    from (
      select btrim(i -> 'merchant' ->> 'name') as name,
             coalesce(nullif(btrim(i -> 'merchant' ->> 'category'), ''), 'Other') as category,
             coalesce(nullif(i -> 'merchant' ->> 'category_source', ''), 'default') as category_source,
             nullif(i -> 'merchant' ->> 'mcc', '') as mcc
      from jsonb_array_elements(p_items) i
    ) raw
    where coalesce(name, '') <> ''
    order by name, (category_source = 'user_corrected') desc
  ) x
  on conflict (account_id, canonical_name) do update
    set category = excluded.category,
        category_source = excluded.category_source,
        mcc = coalesce(excluded.mcc, m.mcc),
        updated_at = now()
    where m.category_source <> 'manual'
      and (excluded.category_source = 'user_corrected' or m.category_source <> 'user_corrected')
      and m.category is distinct from excluded.category;

  return query
  with rows as (
    select distinct on (source_hash) *
    from (
      select i ->> 'source_hash' as source_hash,
             coalesce(i ->> 'dedup_hash', i ->> 'source_hash') as dedup_hash,
             coalesce(i ->> 'bank', 'Unknown') as bank,
             abs((i ->> 'amount')::numeric) as amount,
             i ->> 'type' as type,
             coalesce(i ->> 'raw_merchant', '') as raw_merchant,
             nullif(i ->> 'transaction_date', '')::timestamptz as transaction_date,
             coalesce((i ->> 'confidence')::numeric, 0) as confidence,
             btrim(i -> 'merchant' ->> 'name') as merchant_name
      from jsonb_array_elements(p_items) i
    ) r
    where coalesce(source_hash, '') <> '' and type in ('debit', 'credit') and amount is not null
    order by source_hash
  ),
  upserted as (
    insert into public.transactions as t
      (account_id, source_hash, dedup_hash, bank, amount, type, raw_merchant,
       transaction_date, confidence, created_at, merchant_id)
    select acc, r.source_hash, r.dedup_hash, r.bank, r.amount, r.type, r.raw_merchant,
           r.transaction_date, r.confidence, now(), mm.id
    from rows r
    left join public.merchants mm on mm.account_id = acc and mm.canonical_name = r.merchant_name
    on conflict (account_id, source_hash) do update
      set merchant_id = coalesce(excluded.merchant_id, t.merchant_id)
      where t.merchant_id is distinct from coalesce(excluded.merchant_id, t.merchant_id)
    returning t.id, (t.xmax = 0) as inserted
  )
  select u.id::bigint, u.inserted from upserted u;
end $$;

-- Transactions in the caller's account that the chat can't search yet.
create or replace function public.transactions_missing_embeddings(p_limit int default 200)
returns setof bigint
language sql
stable
security invoker
set search_path = public
as $$
  select t.id::bigint
  from public.transactions t
  where t.account_id = public.current_account_id()
    and not exists (select 1 from public.transaction_embeddings e where e.transaction_id = t.id)
  order by t.id
  limit least(greatest(p_limit, 1), 500)
$$;

-- Who may call what
revoke execute on function public.ensure_account() from public, anon;
revoke execute on function public.get_account_overview() from public, anon;
revoke execute on function public.add_account_phone(text, text) from public, anon;
revoke execute on function public.cancel_account_invite(text) from public, anon;
revoke execute on function public.accept_account_invite(uuid) from public, anon;
revoke execute on function public.decline_account_invite(uuid) from public, anon;
revoke execute on function public.remove_account_member(uuid) from public, anon;
revoke execute on function public.leave_account() from public, anon;
revoke execute on function public.rename_account(text) from public, anon;
revoke execute on function public.sync_transactions(jsonb) from public, anon;
revoke execute on function public.transactions_missing_embeddings(int) from public, anon;

grant execute on function public.ensure_account() to authenticated;
grant execute on function public.get_account_overview() to authenticated;
grant execute on function public.add_account_phone(text, text) to authenticated;
grant execute on function public.cancel_account_invite(text) to authenticated;
grant execute on function public.accept_account_invite(uuid) to authenticated;
grant execute on function public.decline_account_invite(uuid) to authenticated;
grant execute on function public.remove_account_member(uuid) to authenticated;
grant execute on function public.leave_account() to authenticated;
grant execute on function public.rename_account(text) to authenticated;
grant execute on function public.sync_transactions(jsonb) to authenticated;
grant execute on function public.transactions_missing_embeddings(int) to authenticated;

-- ---------------------------------------------------------------------
-- 8. Private bucket for the Android APK
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('apk', 'apk', false)
on conflict (id) do nothing;

drop policy if exists "Logged-in users can download the app" on storage.objects;
create policy "Logged-in users can download the app"
  on storage.objects for select to authenticated
  using (bucket_id = 'apk');

commit;

-- Quick check after running (should list your tables with rls_enabled = true):
-- select relname, relrowsecurity as rls_enabled from pg_class
-- where relname in ('accounts','account_members','account_invites','merchants',
--                   'transactions','raw_sms','merchant_aliases','transaction_embeddings');
