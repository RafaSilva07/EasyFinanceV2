alter table public.expenses
  add column if not exists category text not null default 'other'
  check (category in (
    'food',
    'housing',
    'transport',
    'subscriptions',
    'leisure',
    'health',
    'gifts',
    'personal',
    'education',
    'other'
  ));

alter table public.card_purchases
  add column if not exists category text not null default 'other'
  check (category in (
    'food',
    'housing',
    'transport',
    'subscriptions',
    'leisure',
    'health',
    'gifts',
    'personal',
    'education',
    'other'
  ));

alter table public.card_installments
  add column if not exists category text not null default 'other'
  check (category in (
    'food',
    'housing',
    'transport',
    'subscriptions',
    'leisure',
    'health',
    'gifts',
    'personal',
    'education',
    'other'
  ));

create index if not exists expenses_user_category_idx on public.expenses(user_id, category);
create index if not exists installments_user_category_idx on public.card_installments(user_id, category);
