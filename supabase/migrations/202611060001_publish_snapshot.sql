-- Run in the Supabase SQL editor/migration workflow before enabling final publication.
-- This function deliberately uses the caller's RLS policies (no service key).
-- It atomically inserts the immutable public snapshot and publishes the event.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'events' and policyname = 'phase3_admin_publish_approved') then
    create policy phase3_admin_publish_approved on public.events
      for update to authenticated
      using (
        status = 'approved'
        and exists (select 1 from public.members m where m.user_id = auth.uid() and m.status = 'active' and m.role in ('leader', 'executive'))
      )
      with check (
        status = 'published'
        and exists (select 1 from public.members m where m.user_id = auth.uid() and m.status = 'active' and m.role in ('leader', 'executive'))
      );
  end if;
end $$;

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
  if not exists (select 1 from public.members m where m.user_id = auth.uid() and m.status = 'active' and m.role in ('leader', 'executive')) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_event_id is null or length(trim(coalesce(p_title, ''))) = 0 or length(p_title) > 200 or length(coalesce(p_commentary, '')) > 3000 or jsonb_typeof(p_rankings) is distinct from 'object' then
    raise exception 'Invalid snapshot data' using errcode = '22023';
  end if;
  -- Serialize attempts for the same event, including backfilling a final
  -- snapshot for an event which was already published before Phase 3.
  perform pg_advisory_xact_lock(hashtextextended('srb-final:' || p_event_id::text, 0));
  select e.status, e.event_type into v_status, v_event_type from public.events e where e.id = p_event_id;
  if not found or v_status not in ('approved', 'published') or v_event_type not in ('ir', 'bingo', 'free') then
    raise exception 'Event is not available for publication' using errcode = '22023';
  end if;
  if v_status = 'approved' then
    select e.status into v_status from public.events e where e.id = p_event_id for update;
    if not found or v_status <> 'approved' then raise exception 'Event status changed' using errcode = '22023'; end if;
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
    update public.events set status = 'published' where id = p_event_id and status = 'approved';
    if not found then raise exception 'Could not publish event' using errcode = '42501'; end if;
  end if;
  return v_snapshot_id;
end;
$$;

revoke all on function public.publish_event_snapshot(uuid, text, jsonb, text) from public;
grant execute on function public.publish_event_snapshot(uuid, text, jsonb, text) to authenticated;
