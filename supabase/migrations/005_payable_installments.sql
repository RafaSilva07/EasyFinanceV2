alter table public.payables
  add column if not exists payable_group_id uuid not null default gen_random_uuid(),
  add column if not exists installment_number integer not null default 1 check (installment_number >= 1),
  add column if not exists installments_count integer not null default 1 check (installments_count >= 1);

create index if not exists payables_group_idx on public.payables(payable_group_id);
