create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamp with time zone default now()
);

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  issuer text,
  color text not null default '#111827',
  closing_day integer not null check (closing_day between 1 and 31),
  due_day integer not null check (due_day between 1 and 31),
  is_active boolean not null default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  amount numeric(12,2) not null,
  date date not null,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  amount numeric(12,2) not null,
  due_date date not null,
  payment_method text not null check (payment_method in ('pix', 'cash', 'debit', 'boleto', 'other')),
  category text not null default 'other' check (category in ('food', 'housing', 'transport', 'subscriptions', 'leisure', 'health', 'gifts', 'personal', 'education', 'other')),
  status text not null default 'pending' check (status in ('pending', 'paid')),
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.card_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete cascade,
  description text not null,
  purchase_date date not null,
  category text not null default 'other' check (category in ('food', 'housing', 'transport', 'subscriptions', 'leisure', 'health', 'gifts', 'personal', 'education', 'other')),
  installment_amount numeric(12,2) not null,
  installments_count integer not null default 1 check (installments_count >= 1),
  start_installment integer not null default 1 check (start_installment >= 1),
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint card_purchases_start_check check (start_installment <= installments_count)
);

create table if not exists public.card_installments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_purchase_id uuid not null references public.card_purchases(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete cascade,
  description text not null,
  installment_number integer not null,
  installments_count integer not null,
  amount numeric(12,2) not null,
  category text not null default 'other' check (category in ('food', 'housing', 'transport', 'subscriptions', 'leisure', 'health', 'gifts', 'personal', 'education', 'other')),
  invoice_month integer not null check (invoice_month between 1 and 12),
  invoice_year integer not null,
  due_date date not null,
  status text not null default 'pending' check (status in ('pending', 'paid')),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists cards_user_idx on public.cards(user_id);
create index if not exists entries_user_date_idx on public.entries(user_id, date);
create index if not exists expenses_user_due_idx on public.expenses(user_id, due_date);
create index if not exists expenses_user_category_idx on public.expenses(user_id, category);
create index if not exists installments_user_invoice_idx on public.card_installments(user_id, invoice_year, invoice_month);
create index if not exists installments_user_category_idx on public.card_installments(user_id, category);

alter table public.profiles enable row level security;
alter table public.cards enable row level security;
alter table public.entries enable row level security;
alter table public.expenses enable row level security;
alter table public.card_purchases enable row level security;
alter table public.card_installments enable row level security;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own" on public.profiles
  for delete using (id = auth.uid());

drop policy if exists "cards_select_own" on public.cards;
create policy "cards_select_own" on public.cards
  for select using (user_id = auth.uid());

drop policy if exists "cards_insert_own" on public.cards;
create policy "cards_insert_own" on public.cards
  for insert with check (user_id = auth.uid());

drop policy if exists "cards_update_own" on public.cards;
create policy "cards_update_own" on public.cards
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "cards_delete_own" on public.cards;
create policy "cards_delete_own" on public.cards
  for delete using (user_id = auth.uid());

drop policy if exists "entries_select_own" on public.entries;
create policy "entries_select_own" on public.entries
  for select using (user_id = auth.uid());

drop policy if exists "entries_insert_own" on public.entries;
create policy "entries_insert_own" on public.entries
  for insert with check (user_id = auth.uid());

drop policy if exists "entries_update_own" on public.entries;
create policy "entries_update_own" on public.entries
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "entries_delete_own" on public.entries;
create policy "entries_delete_own" on public.entries
  for delete using (user_id = auth.uid());

drop policy if exists "expenses_select_own" on public.expenses;
create policy "expenses_select_own" on public.expenses
  for select using (user_id = auth.uid());

drop policy if exists "expenses_insert_own" on public.expenses;
create policy "expenses_insert_own" on public.expenses
  for insert with check (user_id = auth.uid());

drop policy if exists "expenses_update_own" on public.expenses;
create policy "expenses_update_own" on public.expenses
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "expenses_delete_own" on public.expenses;
create policy "expenses_delete_own" on public.expenses
  for delete using (user_id = auth.uid());

drop policy if exists "card_purchases_select_own" on public.card_purchases;
create policy "card_purchases_select_own" on public.card_purchases
  for select using (user_id = auth.uid());

drop policy if exists "card_purchases_insert_own" on public.card_purchases;
create policy "card_purchases_insert_own" on public.card_purchases
  for insert with check (user_id = auth.uid());

drop policy if exists "card_purchases_update_own" on public.card_purchases;
create policy "card_purchases_update_own" on public.card_purchases
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "card_purchases_delete_own" on public.card_purchases;
create policy "card_purchases_delete_own" on public.card_purchases
  for delete using (user_id = auth.uid());

drop policy if exists "card_installments_select_own" on public.card_installments;
create policy "card_installments_select_own" on public.card_installments
  for select using (user_id = auth.uid());

drop policy if exists "card_installments_insert_own" on public.card_installments;
create policy "card_installments_insert_own" on public.card_installments
  for insert with check (user_id = auth.uid());

drop policy if exists "card_installments_update_own" on public.card_installments;
create policy "card_installments_update_own" on public.card_installments
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "card_installments_delete_own" on public.card_installments;
create policy "card_installments_delete_own" on public.card_installments
  for delete using (user_id = auth.uid());
