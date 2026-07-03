alter table public.card_purchases
  add column if not exists is_recurring boolean not null default false,
  add column if not exists recurring_status text not null default 'inactive'
  check (recurring_status in ('active', 'inactive'));

create table if not exists public.payables (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  amount numeric(12,2) not null,
  purchase_date date not null,
  due_date date not null,
  category text not null default 'other' check (category in ('food', 'housing', 'transport', 'subscriptions', 'leisure', 'health', 'gifts', 'personal', 'education', 'other')),
  status text not null default 'pending' check (status in ('pending', 'paid')),
  cash_transaction_id uuid,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.cash_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#111827',
  is_active boolean not null default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.cash_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.cash_accounts(id) on delete cascade,
  type text not null check (type in ('income', 'expense', 'transfer_in', 'transfer_out', 'reversal')),
  amount numeric(12,2) not null,
  date date not null,
  description text not null,
  source_type text check (source_type in ('manual', 'entry', 'expense', 'payable', 'card_invoice', 'transfer', 'reversal')),
  source_id uuid,
  notes text,
  created_at timestamp with time zone default now()
);

alter table public.expenses
  add column if not exists cash_transaction_id uuid references public.cash_transactions(id) on delete set null;

alter table public.card_invoices
  add column if not exists cash_transaction_id uuid references public.cash_transactions(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payables_cash_transaction_fk'
  ) then
    alter table public.payables
      add constraint payables_cash_transaction_fk
      foreign key (cash_transaction_id) references public.cash_transactions(id) on delete set null;
  end if;
end $$;

create index if not exists payables_user_due_idx on public.payables(user_id, due_date);
create index if not exists payables_user_category_idx on public.payables(user_id, category);
create index if not exists cash_accounts_user_idx on public.cash_accounts(user_id);
create index if not exists cash_transactions_user_date_idx on public.cash_transactions(user_id, date);
create index if not exists cash_transactions_account_idx on public.cash_transactions(account_id);
create index if not exists cash_transactions_source_idx on public.cash_transactions(source_type, source_id);

alter table public.payables enable row level security;
alter table public.cash_accounts enable row level security;
alter table public.cash_transactions enable row level security;

drop policy if exists "payables_select_own" on public.payables;
create policy "payables_select_own" on public.payables
  for select using (user_id = auth.uid());

drop policy if exists "payables_insert_own" on public.payables;
create policy "payables_insert_own" on public.payables
  for insert with check (user_id = auth.uid());

drop policy if exists "payables_update_own" on public.payables;
create policy "payables_update_own" on public.payables
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "payables_delete_own" on public.payables;
create policy "payables_delete_own" on public.payables
  for delete using (user_id = auth.uid());

drop policy if exists "cash_accounts_select_own" on public.cash_accounts;
create policy "cash_accounts_select_own" on public.cash_accounts
  for select using (user_id = auth.uid());

drop policy if exists "cash_accounts_insert_own" on public.cash_accounts;
create policy "cash_accounts_insert_own" on public.cash_accounts
  for insert with check (user_id = auth.uid());

drop policy if exists "cash_accounts_update_own" on public.cash_accounts;
create policy "cash_accounts_update_own" on public.cash_accounts
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "cash_accounts_delete_own" on public.cash_accounts;
create policy "cash_accounts_delete_own" on public.cash_accounts
  for delete using (user_id = auth.uid());

drop policy if exists "cash_transactions_select_own" on public.cash_transactions;
create policy "cash_transactions_select_own" on public.cash_transactions
  for select using (user_id = auth.uid());

drop policy if exists "cash_transactions_insert_own" on public.cash_transactions;
create policy "cash_transactions_insert_own" on public.cash_transactions
  for insert with check (user_id = auth.uid());

drop policy if exists "cash_transactions_update_own" on public.cash_transactions;
create policy "cash_transactions_update_own" on public.cash_transactions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "cash_transactions_delete_own" on public.cash_transactions;
create policy "cash_transactions_delete_own" on public.cash_transactions
  for delete using (user_id = auth.uid());
