alter table public.entries
  add column if not exists cash_transaction_id uuid references public.cash_transactions(id) on delete set null;

create index if not exists entries_cash_transaction_idx on public.entries(cash_transaction_id);

create or replace function public.create_entry_with_cash(
  p_description text,
  p_amount numeric,
  p_date date,
  p_notes text,
  p_cash_account_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_entry_id uuid;
  v_transaction_id uuid;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if p_amount <= 0 then
    raise exception 'O valor da entrada deve ser maior que zero.';
  end if;

  if not exists (
    select 1
    from public.cash_accounts
    where id = p_cash_account_id
      and user_id = v_user_id
      and is_active = true
  ) then
    raise exception 'Escolha uma conta de caixa ativa.';
  end if;

  insert into public.entries (user_id, description, amount, date, notes)
  values (v_user_id, trim(p_description), p_amount, p_date, p_notes)
  returning id into v_entry_id;

  insert into public.cash_transactions (
    user_id,
    account_id,
    type,
    amount,
    date,
    description,
    source_type,
    source_id,
    notes
  )
  values (
    v_user_id,
    p_cash_account_id,
    'income',
    p_amount,
    p_date,
    'Entrada: ' || trim(p_description),
    'entry',
    v_entry_id,
    p_notes
  )
  returning id into v_transaction_id;

  update public.entries
  set cash_transaction_id = v_transaction_id
  where id = v_entry_id;

  return v_entry_id;
end;
$$;

create or replace function public.update_entry_with_cash(
  p_entry_id uuid,
  p_description text,
  p_amount numeric,
  p_date date,
  p_notes text,
  p_cash_account_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_entry public.entries%rowtype;
  v_transaction public.cash_transactions%rowtype;
  v_next_transaction_id uuid;
  v_replace_transaction boolean := false;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if p_amount <= 0 then
    raise exception 'O valor da entrada deve ser maior que zero.';
  end if;

  if not exists (
    select 1
    from public.cash_accounts
    where id = p_cash_account_id
      and user_id = v_user_id
      and is_active = true
  ) then
    raise exception 'Escolha uma conta de caixa ativa.';
  end if;

  select * into v_entry
  from public.entries
  where id = p_entry_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Entrada nao encontrada.';
  end if;

  if v_entry.cash_transaction_id is not null then
    select * into v_transaction
    from public.cash_transactions
    where id = v_entry.cash_transaction_id and user_id = v_user_id;
  end if;

  v_replace_transaction :=
    v_entry.cash_transaction_id is null
    or v_transaction.id is null
    or v_transaction.account_id <> p_cash_account_id
    or v_transaction.amount <> p_amount
    or v_transaction.date <> p_date
    or v_entry.description <> trim(p_description);

  if v_replace_transaction and v_transaction.id is not null then
    insert into public.cash_transactions (
      user_id,
      account_id,
      type,
      amount,
      date,
      description,
      source_type,
      source_id,
      notes
    )
    values (
      v_user_id,
      v_transaction.account_id,
      'reversal',
      -v_transaction.amount,
      current_date,
      'Estorno de edicao: ' || v_entry.description,
      'reversal',
      v_transaction.id,
      null
    );
  end if;

  if v_replace_transaction then
    insert into public.cash_transactions (
      user_id,
      account_id,
      type,
      amount,
      date,
      description,
      source_type,
      source_id,
      notes
    )
    values (
      v_user_id,
      p_cash_account_id,
      'income',
      p_amount,
      p_date,
      'Entrada: ' || trim(p_description),
      'entry',
      p_entry_id,
      p_notes
    )
    returning id into v_next_transaction_id;
  else
    v_next_transaction_id := v_entry.cash_transaction_id;

    update public.cash_transactions
    set notes = p_notes,
        description = 'Entrada: ' || trim(p_description)
    where id = v_next_transaction_id;
  end if;

  update public.entries
  set description = trim(p_description),
      amount = p_amount,
      date = p_date,
      notes = p_notes,
      cash_transaction_id = v_next_transaction_id,
      updated_at = now()
  where id = p_entry_id;
end;
$$;

create or replace function public.delete_entry_with_cash(p_entry_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_entry public.entries%rowtype;
  v_transaction public.cash_transactions%rowtype;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  select * into v_entry
  from public.entries
  where id = p_entry_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Entrada nao encontrada.';
  end if;

  if v_entry.cash_transaction_id is not null then
    select * into v_transaction
    from public.cash_transactions
    where id = v_entry.cash_transaction_id and user_id = v_user_id;

    if v_transaction.id is not null then
      insert into public.cash_transactions (
        user_id,
        account_id,
        type,
        amount,
        date,
        description,
        source_type,
        source_id,
        notes
      )
      values (
        v_user_id,
        v_transaction.account_id,
        'reversal',
        -v_transaction.amount,
        current_date,
        'Estorno de exclusao: ' || v_entry.description,
        'reversal',
        v_transaction.id,
        null
      );
    end if;
  end if;

  delete from public.entries where id = p_entry_id;
end;
$$;

revoke all on function public.create_entry_with_cash(text, numeric, date, text, uuid) from public;
revoke all on function public.update_entry_with_cash(uuid, text, numeric, date, text, uuid) from public;
revoke all on function public.delete_entry_with_cash(uuid) from public;

grant execute on function public.create_entry_with_cash(text, numeric, date, text, uuid) to authenticated;
grant execute on function public.update_entry_with_cash(uuid, text, numeric, date, text, uuid) to authenticated;
grant execute on function public.delete_entry_with_cash(uuid) to authenticated;
