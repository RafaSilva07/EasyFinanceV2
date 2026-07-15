create or replace function public.pay_with_cash(
  p_source_type text,
  p_source_ids uuid[],
  p_account_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_account public.cash_accounts%rowtype;
  v_balance numeric;
  v_total numeric := 0;
  v_expected integer;
  v_found integer;
  v_record record;
  v_transaction_id uuid;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if p_source_type not in ('expense', 'payable', 'card_invoice') then
    raise exception 'Tipo de pagamento invalido.';
  end if;

  if p_account_id is not null then
    select * into v_account
    from public.cash_accounts
    where id = p_account_id and user_id = v_user_id and is_active = true
    for update;

    if not found then
      raise exception 'Escolha uma conta de caixa ativa.';
    end if;
  end if;

  select count(*) into v_expected
  from (select distinct unnest(p_source_ids) as id) ids;

  if v_expected = 0 then
    raise exception 'Nenhum registro foi informado para pagamento.';
  end if;

  if p_source_type = 'expense' then
    perform 1 from public.expenses
    where user_id = v_user_id and id = any(p_source_ids)
    order by id for update;
    select count(*), coalesce(sum(amount), 0) into v_found, v_total
    from public.expenses
    where user_id = v_user_id and id = any(p_source_ids) and status = 'pending';
  elsif p_source_type = 'payable' then
    perform 1 from public.payables
    where user_id = v_user_id and id = any(p_source_ids)
    order by id for update;
    select count(*), coalesce(sum(amount), 0) into v_found, v_total
    from public.payables
    where user_id = v_user_id and id = any(p_source_ids) and status = 'pending';
  else
    perform 1 from public.card_invoices
    where user_id = v_user_id and id = any(p_source_ids)
    order by id for update;
    select count(*), coalesce(sum(invoice_total), 0) into v_found, v_total
    from (
      select inv.id, coalesce(sum(i.amount), 0) as invoice_total
      from public.card_invoices inv
      left join public.card_installments i on i.invoice_id = inv.id
      where inv.user_id = v_user_id and inv.id = any(p_source_ids) and inv.status = 'pending'
      group by inv.id
    ) invoices;
  end if;

  if v_found <> v_expected then
    raise exception 'Um ou mais registros ja foram pagos ou nao foram encontrados.';
  end if;

  if p_account_id is not null then
    select coalesce(sum(amount), 0) into v_balance
    from public.cash_transactions
    where user_id = v_user_id and account_id = p_account_id;

    if v_balance < v_total then
      raise exception 'Saldo insuficiente nesta conta.';
    end if;
  end if;

  if p_source_type = 'expense' then
    for v_record in
      select * from public.expenses
      where user_id = v_user_id and id = any(p_source_ids) and status = 'pending'
      order by due_date, id
      for update
    loop
      v_transaction_id := null;
      if p_account_id is not null then
        insert into public.cash_transactions (
          user_id, account_id, type, amount, date, description, source_type, source_id, notes
        ) values (
          v_user_id, p_account_id, 'expense', -abs(v_record.amount), current_date,
          'Pagamento ' || v_record.description, 'expense', v_record.id, null
        ) returning id into v_transaction_id;
      end if;

      update public.expenses
      set status = 'paid', cash_transaction_id = v_transaction_id, updated_at = now()
      where id = v_record.id;
    end loop;
  elsif p_source_type = 'payable' then
    for v_record in
      select * from public.payables
      where user_id = v_user_id and id = any(p_source_ids) and status = 'pending'
      order by due_date, installment_number, id
      for update
    loop
      v_transaction_id := null;
      if p_account_id is not null then
        insert into public.cash_transactions (
          user_id, account_id, type, amount, date, description, source_type, source_id, notes
        ) values (
          v_user_id, p_account_id, 'expense', -abs(v_record.amount), current_date,
          'Pagamento ' || v_record.description, 'payable', v_record.id, null
        ) returning id into v_transaction_id;
      end if;

      update public.payables
      set status = 'paid', cash_transaction_id = v_transaction_id, updated_at = now()
      where id = v_record.id;
    end loop;
  else
    for v_record in
      select
        inv.*,
        c.name as card_name,
        coalesce(sum(i.amount), 0) as invoice_total
      from public.card_invoices inv
      join public.cards c on c.id = inv.card_id
      left join public.card_installments i on i.invoice_id = inv.id
      where inv.user_id = v_user_id and inv.id = any(p_source_ids) and inv.status = 'pending'
      group by inv.id, c.id
      order by inv.due_date, inv.id
    loop
      v_transaction_id := null;
      if p_account_id is not null then
        insert into public.cash_transactions (
          user_id, account_id, type, amount, date, description, source_type, source_id, notes
        ) values (
          v_user_id, p_account_id, 'expense', -abs(v_record.invoice_total), current_date,
          'Pagamento fatura ' || v_record.card_name, 'card_invoice', v_record.id, null
        ) returning id into v_transaction_id;
      end if;

      update public.card_invoices
      set status = 'paid', cash_transaction_id = v_transaction_id, updated_at = now()
      where id = v_record.id;

      update public.card_installments
      set status = 'paid', updated_at = now()
      where invoice_id = v_record.id;
    end loop;
  end if;
end;
$$;

create or replace function public.undo_cash_transaction(p_transaction_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_transaction public.cash_transactions%rowtype;
  v_item public.cash_transactions%rowtype;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  select * into v_transaction
  from public.cash_transactions
  where id = p_transaction_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Movimentacao nao encontrada.';
  end if;

  if v_transaction.type = 'reversal' or v_transaction.source_type = 'reversal' then
    raise exception 'Uma movimentacao de estorno nao pode ser desfeita.';
  end if;

  if exists (
    select 1 from public.cash_transactions
    where user_id = v_user_id and source_type = 'reversal' and source_id = v_transaction.id
  ) then
    raise exception 'Esta movimentacao ja foi desfeita.';
  end if;

  if v_transaction.source_type = 'transfer' then
    if v_transaction.source_id is null then
      raise exception 'Transferencia sem identificador de origem.';
    end if;

    if exists (
      select 1
      from public.cash_transactions reversal
      join public.cash_transactions original on original.id = reversal.source_id
      where reversal.user_id = v_user_id
        and reversal.source_type = 'reversal'
        and original.source_type = 'transfer'
        and original.source_id = v_transaction.source_id
    ) then
      raise exception 'Esta transferencia ja foi desfeita.';
    end if;

    for v_item in
      select * from public.cash_transactions
      where user_id = v_user_id and source_type = 'transfer' and source_id = v_transaction.source_id
      order by created_at, id
      for update
    loop
      insert into public.cash_transactions (
        user_id, account_id, type, amount, date, description, source_type, source_id, notes
      ) values (
        v_user_id, v_item.account_id, 'reversal', -v_item.amount, current_date,
        'Estorno de transferencia', 'reversal', v_item.id, null
      );
    end loop;
    return;
  end if;

  if v_transaction.source_type = 'entry' then
    if v_transaction.source_id is null or not exists (
      select 1 from public.entries
      where id = v_transaction.source_id and user_id = v_user_id and cash_transaction_id = v_transaction.id
    ) then
      raise exception 'A entrada vinculada nao foi encontrada.';
    end if;
    perform public.delete_entry_with_cash(v_transaction.source_id);
    return;
  end if;

  if v_transaction.source_type = 'expense' then
    if not exists (
      select 1 from public.expenses
      where id = v_transaction.source_id and user_id = v_user_id and cash_transaction_id = v_transaction.id
    ) then
      raise exception 'O gasto vinculado nao foi encontrado.';
    end if;
    insert into public.cash_transactions (
      user_id, account_id, type, amount, date, description, source_type, source_id, notes
    ) values (
      v_user_id, v_transaction.account_id, 'reversal', -v_transaction.amount, current_date,
      'Estorno de ' || v_transaction.description, 'reversal', v_transaction.id, null
    );
    update public.expenses
    set status = 'pending', cash_transaction_id = null, updated_at = now()
    where id = v_transaction.source_id and user_id = v_user_id;
    return;
  end if;

  if v_transaction.source_type = 'payable' then
    if not exists (
      select 1 from public.payables
      where id = v_transaction.source_id and user_id = v_user_id and cash_transaction_id = v_transaction.id
    ) then
      raise exception 'A conta vinculada nao foi encontrada.';
    end if;
    insert into public.cash_transactions (
      user_id, account_id, type, amount, date, description, source_type, source_id, notes
    ) values (
      v_user_id, v_transaction.account_id, 'reversal', -v_transaction.amount, current_date,
      'Estorno de ' || v_transaction.description, 'reversal', v_transaction.id, null
    );
    update public.payables
    set status = 'pending', cash_transaction_id = null, updated_at = now()
    where id = v_transaction.source_id and user_id = v_user_id;
    return;
  end if;

  if v_transaction.source_type = 'card_invoice' then
    if not exists (
      select 1 from public.card_invoices
      where id = v_transaction.source_id and user_id = v_user_id and cash_transaction_id = v_transaction.id
    ) then
      raise exception 'A fatura vinculada nao foi encontrada.';
    end if;
    insert into public.cash_transactions (
      user_id, account_id, type, amount, date, description, source_type, source_id, notes
    ) values (
      v_user_id, v_transaction.account_id, 'reversal', -v_transaction.amount, current_date,
      'Estorno de ' || v_transaction.description, 'reversal', v_transaction.id, null
    );
    update public.card_invoices
    set status = 'pending', cash_transaction_id = null, updated_at = now()
    where id = v_transaction.source_id and user_id = v_user_id;
    update public.card_installments
    set status = 'pending', updated_at = now()
    where invoice_id = v_transaction.source_id and user_id = v_user_id;
    return;
  end if;

  if v_transaction.source_type = 'manual' or v_transaction.source_type is null then
    insert into public.cash_transactions (
      user_id, account_id, type, amount, date, description, source_type, source_id, notes
    ) values (
      v_user_id, v_transaction.account_id, 'reversal', -v_transaction.amount, current_date,
      'Estorno de ' || v_transaction.description, 'reversal', v_transaction.id, null
    );
    return;
  end if;

  raise exception 'Esta movimentacao nao pode ser desfeita.';
end;
$$;

create or replace function public.delete_cash_transaction(p_transaction_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_transaction public.cash_transactions%rowtype;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  select * into v_transaction
  from public.cash_transactions
  where id = p_transaction_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Movimentacao nao encontrada.';
  end if;

  if v_transaction.type = 'reversal' or v_transaction.source_type = 'reversal' then
    raise exception 'Movimentacoes de estorno nao podem ser excluidas.';
  end if;

  if v_transaction.source_type = 'manual' or v_transaction.source_type is null then
    if exists (
      select 1 from public.cash_transactions
      where user_id = v_user_id and source_type = 'reversal' and source_id = v_transaction.id
    ) then
      raise exception 'Uma movimentacao desfeita nao pode ser excluida.';
    end if;
    delete from public.cash_transactions where id = v_transaction.id and user_id = v_user_id;
    return;
  end if;

  if v_transaction.source_type = 'transfer' then
    if v_transaction.source_id is null then
      raise exception 'Transferencia sem identificador de origem.';
    end if;
    if exists (
      select 1
      from public.cash_transactions reversal
      join public.cash_transactions original on original.id = reversal.source_id
      where reversal.user_id = v_user_id
        and reversal.source_type = 'reversal'
        and original.source_type = 'transfer'
        and original.source_id = v_transaction.source_id
    ) then
      raise exception 'Uma transferencia desfeita nao pode ser excluida.';
    end if;
    delete from public.cash_transactions
    where user_id = v_user_id and source_type = 'transfer' and source_id = v_transaction.source_id;
    return;
  end if;

  raise exception 'Registros vinculados devem ser desfeitos, nao excluidos.';
end;
$$;

create or replace function public.cash_recent_with_actions(p_limit integer default 100)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with recent as (
    select
      t.*,
      jsonb_build_object('name', a.name, 'color', a.color) as cash_accounts
    from public.cash_transactions t
    join public.cash_accounts a on a.id = t.account_id
    where t.user_id = auth.uid()
    order by t.date desc, t.created_at desc, t.id desc
    limit least(greatest(p_limit, 1), 100)
  ), action_state as (
    select
      r.*,
      (
        exists (
          select 1 from public.cash_transactions reversal
          where reversal.user_id = auth.uid()
            and reversal.source_type = 'reversal'
            and reversal.source_id = r.id
        )
        or (
          r.source_type = 'transfer'
          and exists (
            select 1
            from public.cash_transactions reversal
            join public.cash_transactions original on original.id = reversal.source_id
            where reversal.user_id = auth.uid()
              and reversal.source_type = 'reversal'
              and original.user_id = auth.uid()
              and original.source_type = 'transfer'
              and original.source_id = r.source_id
          )
        )
      ) as is_reversed
    from recent r
  ), marked as (
    select
      s.*,
      (
        s.type <> 'reversal'
        and coalesce(s.source_type, 'manual') <> 'reversal'
        and not s.is_reversed
      ) as can_undo,
      (
        s.type <> 'reversal'
        and coalesce(s.source_type, 'manual') <> 'reversal'
        and not s.is_reversed
        and (s.source_type in ('manual', 'transfer') or s.source_type is null)
      ) as can_delete
    from action_state s
  )
  select coalesce(
    jsonb_agg(to_jsonb(marked) order by date desc, created_at desc, id desc),
    '[]'::jsonb
  )
  from marked;
$$;

revoke all on function public.pay_with_cash(text, uuid[], uuid) from public;
revoke all on function public.undo_cash_transaction(uuid) from public;
revoke all on function public.delete_cash_transaction(uuid) from public;
revoke all on function public.cash_recent_with_actions(integer) from public;

grant execute on function public.pay_with_cash(text, uuid[], uuid) to authenticated;
grant execute on function public.undo_cash_transaction(uuid) to authenticated;
grant execute on function public.delete_cash_transaction(uuid) to authenticated;
grant execute on function public.cash_recent_with_actions(integer) to authenticated;
