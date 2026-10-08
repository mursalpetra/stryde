-- STRYDE cloud schema: apply to a Supabase project after connection.
-- Private records protected by auth.uid() and row-level security.
create table if not exists public.stryde_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text, height_cm numeric(5,1), baseline_weight_kg numeric(6,2),
 goals text, updated_at timestamptz not null default now()
);
create table if not exists public.stryde_workouts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 session_date date not null, week_number integer check(week_number between 1 and 52),
 day_index integer check(day_index between 0 and 6),
 session_type text not null,
 status text not null check(status in ('planned','completed','missed','skipped')),
 distance_km numeric(7,2), duration_minutes numeric(7,1),
 perceived_effort integer check(perceived_effort between 1 and 10),
 notes text, details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.stryde_measurements (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 measured_on date not null, weight_kg numeric(6,2),
 waist_cm numeric(6,2), hip_cm numeric(6,2),
 sleep_hours numeric(4,1), energy integer check(energy between 1 and 5),
 notes text, created_at timestamptz not null default now()
);
create table if not exists public.stryde_plan_adjustments (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 proposed_at timestamptz not null default now(),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 rationale text not null, changes jsonb not null default '[]'::jsonb
);
alter table public.stryde_profiles enable row level security;
alter table public.stryde_workouts enable row level security;
alter table public.stryde_measurements enable row level security;
alter table public.stryde_plan_adjustments enable row level security;
create policy "profiles private" on public.stryde_profiles for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "workouts private" on public.stryde_workouts for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "measurements private" on public.stryde_measurements for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "adjustments private" on public.stryde_plan_adjustments for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create index if not exists stryde_workouts_user_date on public.stryde_workouts(user_id,session_date);
create index if not exists stryde_measurements_user_date on public.stryde_measurements(user_id,measured_on);
