-- Native in-app client management — replaces the Google Sheet as the source of truth.
-- Adds the fields that were only ever available via the sheet but are actually used
-- (period/billing cycle, contact phone/email, and a real onboarded date), plus an
-- is_internal flag so Internal Brands (currently hardcoded in app code) become normal,
-- editable client rows instead.

alter table public.clients
  add column if not exists period       text,
  add column if not exists phone        text,
  add column if not exists email        text,
  add column if not exists joined_at    date,
  add column if not exists is_internal  boolean not null default false;

comment on column public.clients.period is 'Billing cycle, e.g. Monthly / Quarterly / Yearly — display only.';
comment on column public.clients.joined_at is 'When this client relationship started — used for date-aware reporting (mirrors users.joined_at).';
comment on column public.clients.is_internal is 'True for internal brands (Grofast Digital, Grofast AI, Karthick Brands, etc.) — excluded from common-cost sharing among real clients but still a normal, editable row.';
