create table if not exists public.card_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete cascade,
  invoice_month integer not null check (invoice_month between 1 and 12),
  invoice_year integer not null,
  due_date date not null,
  status text not null default 'pending' check (status in ('pending', 'paid')),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint card_invoices_unique_month unique (user_id, card_id, invoice_month, invoice_year)
);

alter table public.card_invoices enable row level security;

drop policy if exists "card_invoices_select_own" on public.card_invoices;
create policy "card_invoices_select_own" on public.card_invoices
  for select using (user_id = auth.uid());

drop policy if exists "card_invoices_insert_own" on public.card_invoices;
create policy "card_invoices_insert_own" on public.card_invoices
  for insert with check (user_id = auth.uid());

drop policy if exists "card_invoices_update_own" on public.card_invoices;
create policy "card_invoices_update_own" on public.card_invoices
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "card_invoices_delete_own" on public.card_invoices;
create policy "card_invoices_delete_own" on public.card_invoices
  for delete using (user_id = auth.uid());

alter table public.card_purchases
  add column if not exists status text not null default 'active'
  check (status in ('active', 'canceled'));

alter table public.card_installments
  add column if not exists invoice_id uuid references public.card_invoices(id) on delete set null;

insert into public.card_invoices (user_id, card_id, invoice_month, invoice_year, due_date, status)
select
  user_id,
  card_id,
  invoice_month,
  invoice_year,
  min(due_date) as due_date,
  case when bool_and(status = 'paid') then 'paid' else 'pending' end as status
from public.card_installments
where invoice_id is null
group by user_id, card_id, invoice_month, invoice_year
on conflict (user_id, card_id, invoice_month, invoice_year) do update
set due_date = excluded.due_date,
    updated_at = now();

update public.card_installments ci
set invoice_id = inv.id
from public.card_invoices inv
where ci.invoice_id is null
  and inv.user_id = ci.user_id
  and inv.card_id = ci.card_id
  and inv.invoice_month = ci.invoice_month
  and inv.invoice_year = ci.invoice_year;

create index if not exists card_invoices_user_month_idx on public.card_invoices(user_id, invoice_year, invoice_month);
create index if not exists card_invoices_card_idx on public.card_invoices(card_id);
create index if not exists card_installments_invoice_idx on public.card_installments(invoice_id);
