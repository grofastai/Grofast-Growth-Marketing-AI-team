-- Phase 3: the correction loop. After a video/poster is Edited, it gets reviewed —
-- if it needs changes it goes BACK to Editing with a note about what to fix, and that
-- round-trip is logged rather than overwritten.
--
-- Kept as an append-only log (same shape as ad_revisions) so you can see "this video
-- went through 3 rounds of corrections" instead of just its current state.
create table if not exists content_corrections (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references content_items(id) on delete cascade,
  company_id uuid not null,
  correction_date date not null default current_date,
  notes text not null,
  -- Who asked for the change, and who it went back to.
  requested_by uuid references users(id) on delete set null,
  assigned_to uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists content_corrections_item_idx on content_corrections(content_item_id);
create index if not exists content_corrections_company_idx on content_corrections(company_id);

alter table content_corrections enable row level security;

create policy "tenant_all" on content_corrections
  for all using (company_id = (auth.jwt() ->> 'company_id')::uuid)
  with check (company_id = (auth.jwt() ->> 'company_id')::uuid);

create policy "service_all" on content_corrections for all using (true) with check (true);
