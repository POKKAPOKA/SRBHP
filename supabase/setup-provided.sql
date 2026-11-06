-- ==========================================
-- 1. 拡張機能とENUM型の定義（重複エラー回避付き）
-- ==========================================
create extension if not exists "pgcrypto";

do $$ begin
  create type public.member_role as enum ('leader', 'executive', 'member');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.member_status as enum ('pre_registered', 'pending_approval', 'active', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.event_type as enum ('free', 'bingo', 'ir');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.event_status as enum ('pending', 'approved', 'published', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.attendance_status as enum ('attending', 'late_early', 'absent');
exception when duplicate_object then null; end $$;

-- ==========================================
-- 2. 部員・メンバー管理テーブル
-- ==========================================
create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  email text unique not null,
  display_name text not null,
  grade int check (grade between 1 and 6),
  role public.member_role not null default 'member',
  status public.member_status not null default 'pending_approval',
  main_games text[] default '{}',
  discord_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ==========================================
-- 3. イベントテーブル（自由企画・ビンゴ・IR共通）
-- ==========================================
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  event_type public.event_type not null default 'free',
  status public.event_status not null default 'pending',
  start_at timestamptz not null,
  end_at timestamptz not null,
  location text not null default '',
  config jsonb not null default '{}'::jsonb,
  created_by uuid references public.members(id) on delete set null,
  approved_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ==========================================
-- 4. 出欠管理テーブル（参加 / 遅刻・早退 / 欠席）
-- ==========================================
create table if not exists public.event_attendances (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  status public.attendance_status not null,
  arrival_time text,
  departure_time text,
  note text default '',
  updated_at timestamptz not null default now(),
  unique(event_id, member_id)
);

-- ==========================================
-- 5. ミッションビンゴ提出テーブル
-- ==========================================
create table if not exists public.bingo_submissions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  cell_index int not null check (cell_index between 0 and 24),
  proof_image_url text,
  comment text default '',
  created_at timestamptz not null default now(),
  unique(event_id, member_id, cell_index)
);

-- ==========================================
-- 6. IRリザルト提出ログテーブル（Gemini自動解析結果）
-- ==========================================
create table if not exists public.ir_submissions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  game_title text not null,
  song_title text not null,
  difficulty text not null,
  score bigint not null,
  judge_breakdown jsonb not null default '{}'::jsonb,
  ai_commentary text not null default '',
  proof_image_url text not null,
  submitted_at timestamptz not null default now()
);

-- ==========================================
-- 7. IR 中間発表・最終発表スナップショット
-- ==========================================
create table if not exists public.ir_snapshots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  is_final boolean not null default false,
  title text not null,
  rankings_data jsonb not null default '{}'::jsonb,
  overall_commentary text not null default '',
  published_at timestamptz not null default now()
);

alter table public.ir_snapshots alter column rankings_data set default '{}'::jsonb;

-- ==========================================
-- 8. ハイブリッド認証トリガー
-- ==========================================
create or replace function public.handle_auth_user_login()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if exists (select 1 from public.members where lower(email) = lower(new.email)) then
    update public.members
    set user_id = new.id,
        status = case when status = 'pre_registered' then 'active'::public.member_status else status end,
        updated_at = now()
    where lower(email) = lower(new.email);
  else
    insert into public.members (user_id, email, display_name, role, status)
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
      'member',
      'pending_approval'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_auth_user_login();

-- ==========================================
-- 9. RLS（Row Level Security）用のヘルパー関数
-- ==========================================
create or replace function public.get_my_member_record()
returns public.members
language sql
security definer
stable
as $$
  select * from public.members where user_id = auth.uid() limit 1;
$$;

create or replace function public.is_active_member()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.members
    where user_id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.has_role(allowed_roles public.member_role[])
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.members
    where user_id = auth.uid()
      and status = 'active'
      and role = any(allowed_roles)
  );
$$;

-- ==========================================
-- 10. 役員による列改ざん防止トリガー＆CSV一括Upsert用RPC
-- ==========================================
create or replace function public.enforce_member_update_restrictions()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null or public.has_role(array['leader'::public.member_role]) then
    new.updated_at := now();
    return new;
  end if;

  if public.has_role(array['executive'::public.member_role]) then
    if new.email is distinct from old.email
       or new.user_id is distinct from old.user_id
       or new.display_name is distinct from old.display_name
       or new.grade is distinct from old.grade
       or new.status is distinct from old.status
       or new.main_games is distinct from old.main_games
       or new.discord_user_id is distinct from old.discord_user_id then
      raise exception 'Executives are only allowed to update the role column.';
    end if;
    new.updated_at := now();
    return new;
  end if;

  raise exception 'Permission denied.';
end;
$$;

drop trigger if exists trg_enforce_member_update on public.members;
create trigger trg_enforce_member_update
  before update on public.members
  for each row execute procedure public.enforce_member_update_restrictions();

create or replace function public.bulk_upsert_members(payload jsonb)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  item jsonb;
  affected_count int := 0;
begin
  if not public.has_role(array['leader'::public.member_role]) then
    raise exception 'Only the leader can bulk import members.';
  end if;

  for item in select * from jsonb_array_elements(payload)
  loop
    insert into public.members (
      email,
      display_name,
      grade,
      role,
      status,
      main_games,
      discord_user_id
    )
    values (
      lower(trim(item->>'email')),
      trim(item->>'display_name'),
      nullif(item->>'grade', '')::int,
      coalesce(nullif(item->>'role', '')::public.member_role, 'member'),
      'pre_registered',
      coalesce(
        (select array_agg(x) from jsonb_array_elements_text(coalesce(item->'main_games', '[]'::jsonb)) as x),
        '{}'::text[]
      ),
      nullif(trim(coalesce(item->>'discord_user_id', '')), '')
    )
    on conflict (email) do update
    set display_name = excluded.display_name,
        grade = coalesce(excluded.grade, public.members.grade),
        role = excluded.role,
        main_games = case
          when array_length(excluded.main_games, 1) is not null then excluded.main_games
          else public.members.main_games
        end,
        discord_user_id = coalesce(excluded.discord_user_id, public.members.discord_user_id),
        updated_at = now();
    affected_count := affected_count + 1;
  end loop;

  return affected_count;
end;
$$;

-- ==========================================
-- 11. Phase 3 最終発表・スナップショット公開用アトミックRPC
-- ==========================================
create or replace function public.publish_event_snapshot(
  p_event_id uuid,
  p_title text,
  p_rankings jsonb,
  p_commentary text
) returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_status public.event_status;
  v_event_type public.event_type;
  v_snapshot_id uuid;
begin
  if not exists (
    select 1 from public.members m
    where m.user_id = auth.uid() and m.status = 'active' and m.role in ('leader', 'executive')
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_event_id is null
     or length(trim(coalesce(p_title, ''))) = 0
     or length(p_title) > 200
     or length(coalesce(p_commentary, '')) > 3000
     or jsonb_typeof(p_rankings) is distinct from 'object' then
    raise exception 'Invalid snapshot data' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('srb-final:' || p_event_id::text, 0));

  select e.status, e.event_type into v_status, v_event_type
  from public.events e
  where e.id = p_event_id;

  if not found or v_status not in ('approved', 'published') or v_event_type not in ('ir', 'bingo', 'free') then
    raise exception 'Event is not available for publication' using errcode = '22023';
  end if;

  if v_status = 'approved' then
    select e.status into v_status from public.events e where e.id = p_event_id for update;
    if not found or v_status <> 'approved' then
      raise exception 'Event status changed' using errcode = '22023';
    end if;
  end if;

  if (p_rankings->>'kind') is distinct from v_event_type::text then
    raise exception 'Snapshot type does not match event' using errcode = '22023';
  end if;

  if exists (select 1 from public.ir_snapshots s where s.event_id = p_event_id and s.is_final) then
    raise exception 'Final snapshot already exists' using errcode = '23505';
  end if;

  insert into public.ir_snapshots (event_id, is_final, title, rankings_data, overall_commentary)
  values (p_event_id, true, trim(p_title), p_rankings, coalesce(p_commentary, ''))
  returning id into v_snapshot_id;

  if v_status = 'approved' then
    update public.events set status = 'published', updated_at = now()
    where id = p_event_id and status = 'approved';
    if not found then
      raise exception 'Could not publish event' using errcode = '42501';
    end if;
  end if;

  return v_snapshot_id;
end;
$$;

revoke all on function public.publish_event_snapshot(uuid, text, jsonb, text) from public;
grant execute on function public.publish_event_snapshot(uuid, text, jsonb, text) to authenticated;

-- ==========================================
-- 12. 各テーブルのRLS有効化とポリシー設定
-- ==========================================
alter table public.members enable row level security;
alter table public.events enable row level security;
alter table public.event_attendances enable row level security;
alter table public.bingo_submissions enable row level security;
alter table public.ir_submissions enable row level security;
alter table public.ir_snapshots enable row level security;

-- membersポリシー
drop policy if exists "Active members can view members" on public.members;
create policy "Active members can view members" on public.members
  for select using (user_id = auth.uid() or public.is_active_member());

drop policy if exists "Leader full access on members" on public.members;
create policy "Leader full access on members" on public.members
  for all using (public.has_role(array['leader'::public.member_role]))
  with check (public.has_role(array['leader'::public.member_role]));

drop policy if exists "Executive can update non-leader members" on public.members;
create policy "Executive can update non-leader members" on public.members
  for update using (
    public.has_role(array['executive'::public.member_role])
    and role != 'leader'
    and user_id is distinct from auth.uid()
  )
  with check (role != 'leader');

-- eventsポリシー（Phase 3 公開遷移ポリシー統合）
drop policy if exists "Public can view published events" on public.events;
create policy "Public can view published events" on public.events
  for select using (
    status = 'published'
    or (
      public.is_active_member()
      and (
        status = 'approved'
        or created_by = (select id from public.get_my_member_record())
        or public.has_role(array['leader'::public.member_role, 'executive'::public.member_role])
      )
    )
  );

drop policy if exists "Active members can propose events" on public.events;
create policy "Active members can propose events" on public.events
  for insert with check (public.is_active_member() and status = 'pending');

drop policy if exists "Executives and Leaders can manage events" on public.events;
create policy "Executives and Leaders can manage events" on public.events
  for all using (public.has_role(array['leader'::public.member_role, 'executive'::public.member_role]))
  with check (public.has_role(array['leader'::public.member_role, 'executive'::public.member_role]));

drop policy if exists "phase3_admin_publish_approved" on public.events;
create policy "phase3_admin_publish_approved" on public.events
  for update to authenticated
  using (
    status = 'approved'
    and exists (
      select 1 from public.members m
      where m.user_id = auth.uid() and m.status = 'active' and m.role in ('leader', 'executive')
    )
  )
  with check (
    status = 'published'
    and exists (
      select 1 from public.members m
      where m.user_id = auth.uid() and m.status = 'active' and m.role in ('leader', 'executive')
    )
  );

-- event_attendancesポリシー
drop policy if exists "Active members view attendances" on public.event_attendances;
create policy "Active members view attendances" on public.event_attendances
  for select using (public.is_active_member());

drop policy if exists "Active members manage own attendance" on public.event_attendances;
create policy "Active members manage own attendance" on public.event_attendances
  for all using (
    public.is_active_member() and member_id = (select id from public.get_my_member_record())
  )
  with check (
    public.is_active_member() and member_id = (select id from public.get_my_member_record())
  );

-- bingo_submissionsポリシー（approved期間中のみ提出可）
drop policy if exists "Active members view bingo" on public.bingo_submissions;
create policy "Active members view bingo" on public.bingo_submissions
  for select using (public.is_active_member());

drop policy if exists "Active members manage own bingo" on public.bingo_submissions;
create policy "Active members manage own bingo" on public.bingo_submissions
  for all using (
    public.is_active_member()
    and member_id = (select id from public.get_my_member_record())
  )
  with check (
    public.is_active_member()
    and member_id = (select id from public.get_my_member_record())
    and exists (
      select 1 from public.events e
      where e.id = event_id and e.status = 'approved'
    )
  );

-- ir_submissionsポリシー（発表前の他者スコア覗き見防止 ＆ 提出後の自己スコア改ざん防止）
drop policy if exists "Active members view ir submissions" on public.ir_submissions;
create policy "Active members view ir submissions" on public.ir_submissions
  for select using (
    public.is_active_member()
    and (
      member_id = (select id from public.get_my_member_record())
      or public.has_role(array['leader'::public.member_role, 'executive'::public.member_role])
      or exists (
        select 1 from public.events e
        where e.id = event_id and e.status = 'published'
      )
    )
  );

drop policy if exists "Active members insert own ir submissions" on public.ir_submissions;
create policy "Active members insert own ir submissions" on public.ir_submissions
  for insert with check (
    public.is_active_member()
    and member_id = (select id from public.get_my_member_record())
    and exists (
      select 1 from public.events e
      where e.id = event_id and e.status = 'approved'
    )
  );

-- ※一般部員による提出後のスコア自己書き換え（UPDATE）は廃止し、役員・サークル長のみ管理可能に設定
drop policy if exists "Active members manage own ir submissions" on public.ir_submissions;
drop policy if exists "Executives and Leaders manage ir submissions" on public.ir_submissions;
create policy "Executives and Leaders manage ir submissions" on public.ir_submissions
  for all using (public.has_role(array['leader'::public.member_role, 'executive'::public.member_role]))
  with check (public.has_role(array['leader'::public.member_role, 'executive'::public.member_role]));

-- ir_snapshotsポリシー
drop policy if exists "Anyone can view final snapshots, members view intermediate" on public.ir_snapshots;
create policy "Anyone can view final snapshots, members view intermediate" on public.ir_snapshots
  for select using (is_final = true or public.is_active_member());

drop policy if exists "Executives and Leaders manage snapshots" on public.ir_snapshots;
create policy "Executives and Leaders manage snapshots" on public.ir_snapshots
  for all using (public.has_role(array['leader'::public.member_role, 'executive'::public.member_role]))
  with check (public.has_role(array['leader'::public.member_role, 'executive'::public.member_role]));

-- ==========================================
-- 13. 画像用バケット（proofs）の作成とStorageポリシー
-- ==========================================
insert into storage.buckets (id, name, public)
values ('proofs', 'proofs', true)
on conflict (id) do update
set public = true;

drop policy if exists "Anyone can view proof images" on storage.objects;
create policy "Anyone can view proof images" on storage.objects
  for select using (bucket_id = 'proofs');

drop policy if exists "Active members can upload proof images" on storage.objects;
create policy "Active members can upload proof images" on storage.objects
  for insert with check (
    bucket_id = 'proofs' and public.is_active_member()
  );

drop policy if exists "Active members can update own proof images" on storage.objects;
create policy "Active members can update own proof images" on storage.objects
  for update using (
    bucket_id = 'proofs' and owner = auth.uid() and public.is_active_member()
  )
  with check (
    bucket_id = 'proofs' and owner = auth.uid() and public.is_active_member()
  );

drop policy if exists "Active members and admins can delete proof images" on storage.objects;
create policy "Active members and admins can delete proof images" on storage.objects
  for delete using (
    bucket_id = 'proofs' and (
      owner = auth.uid() or public.has_role(array['leader'::public.member_role, 'executive'::public.member_role])
    )
  );

-- ==========================================
-- 14. サークル長（仮）の事前登録・権限付与
-- ==========================================
insert into public.members (user_id, email, display_name, grade, role, status)
values (
  (select id from auth.users where lower(email) = lower('takaumi284279@gmail.com') limit 1),
  'takaumi284279@gmail.com',
  'ポッカポカ',
  2,
  'leader',
  case
    when exists (select 1 from auth.users where lower(email) = lower('takaumi284279@gmail.com'))
    then 'active'::public.member_status
    else 'pre_registered'::public.member_status
  end
)
on conflict (email) do update
set user_id = coalesce(public.members.user_id, excluded.user_id),
    display_name = excluded.display_name,
    grade = excluded.grade,
    role = 'leader',
    status = case
      when coalesce(public.members.user_id, excluded.user_id) is not null
      then 'active'::public.member_status
      else 'pre_registered'::public.member_status
    end,
    updated_at = now();