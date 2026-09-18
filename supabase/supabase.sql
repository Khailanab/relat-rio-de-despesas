-- Controle de Despesas / Supabase
-- Execute no SQL Editor do projeto.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  mz text unique not null,
  full_name text not null,
  role text not null check (role in ('supervisor','coordinator')),
  job_title text,
  cost_center text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  supervisor_id uuid not null references public.profiles(id),
  route_date date not null,
  plate text not null,
  km_start integer not null check (km_start >= 0),
  km_end integer not null check (km_end >= km_start),
  km_travelled integer generated always as (km_end - km_start) stored,
  km_value numeric(12,2) generated always as ((km_end - km_start) * 1.23) stored,
  photo_start_path text,
  photo_end_path text,
  hotel_value numeric(12,2) not null default 0 check (hotel_value >= 0),
  hotel_receipt_path text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.daily_reports(id) on delete cascade,
  type text not null check (type in ('Pedágio','Estacionamento','Diversas')),
  amount numeric(12,2) not null check (amount >= 0),
  receipt_path text,
  created_at timestamptz not null default now()
);

create or replace view public.daily_reports_with_totals as
select r.*,
  coalesce((select sum(e.amount) from public.expenses e where e.report_id=r.id),0)::numeric(12,2) as total_extras
from public.daily_reports r;

alter table public.profiles enable row level security;
alter table public.daily_reports enable row level security;
alter table public.expenses enable row level security;

create or replace function public.current_role()
returns text language sql stable security definer set search_path=public
as $$ select role from public.profiles where id=auth.uid() $$;

create policy "profiles own or coordinator read" on public.profiles
for select using (id=auth.uid() or public.current_role()='coordinator');

create policy "reports own or coordinator read" on public.daily_reports
for select using (supervisor_id=auth.uid() or public.current_role()='coordinator');

create policy "supervisors create own reports" on public.daily_reports
for insert with check (supervisor_id=auth.uid() and public.current_role()='supervisor');

create policy "coordinator update reports" on public.daily_reports
for update using (public.current_role()='coordinator') with check (public.current_role()='coordinator');

create policy "own reports update" on public.daily_reports
for update using (supervisor_id=auth.uid() and public.current_role()='supervisor')
with check (supervisor_id=auth.uid());

create policy "coordinator delete reports" on public.daily_reports
for delete using (public.current_role()='coordinator');

create policy "expenses visible through report" on public.expenses
for select using (
  exists(select 1 from public.daily_reports r where r.id=report_id and (r.supervisor_id=auth.uid() or public.current_role()='coordinator'))
);

create policy "supervisor inserts own report expenses" on public.expenses
for insert with check (
  exists(select 1 from public.daily_reports r where r.id=report_id and r.supervisor_id=auth.uid() and public.current_role()='supervisor')
  or public.current_role()='coordinator'
);

create policy "coordinator edits expenses" on public.expenses
for update using (public.current_role()='coordinator') with check (public.current_role()='coordinator');

create policy "supervisor deletes own report expenses" on public.expenses
for delete using (
  exists(select 1 from public.daily_reports r where r.id=report_id and r.supervisor_id=auth.uid() and public.current_role()='supervisor')
  or public.current_role()='coordinator'
);

-- Bucket privado.
insert into storage.buckets (id,name,public)
values ('expense-files','expense-files',false)
on conflict (id) do update set public=false;

create policy "expense files own folder read" on storage.objects
for select to authenticated
using (
  bucket_id='expense-files' and (
    (storage.foldername(name))[1]=auth.uid()::text
    or public.current_role()='coordinator'
  )
);

create policy "expense files own folder upload" on storage.objects
for insert to authenticated
with check (
  bucket_id='expense-files' and (storage.foldername(name))[1]=auth.uid()::text
);

create policy "coordinator expense file delete" on storage.objects
for delete to authenticated
using (bucket_id='expense-files' and public.current_role()='coordinator');

-- Importante:
-- O Supabase Auth precisa ter a confirmação de e-mail desativada se forem usados
-- identificadores sintéticos @mz.internal. O usuário final nunca verá esse e-mail.
-- O cadastro individual dos colaboradores será feito depois, com MZ, nome, função e CC.
