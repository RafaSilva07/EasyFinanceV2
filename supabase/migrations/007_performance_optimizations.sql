create index if not exists expenses_user_status_due_idx
  on public.expenses(user_id, status, due_date);

create index if not exists payables_user_status_due_idx
  on public.payables(user_id, status, due_date);

create index if not exists card_purchases_user_status_date_idx
  on public.card_purchases(user_id, status, purchase_date);

create index if not exists card_installments_user_purchase_due_idx
  on public.card_installments(user_id, card_purchase_id, due_date);

create index if not exists cash_transactions_user_account_date_idx
  on public.cash_transactions(user_id, account_id, date desc, created_at desc);

create or replace function public.cash_accounts_with_balance()
returns table (
  id uuid,
  user_id uuid,
  name text,
  color text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  balance numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    a.id,
    a.user_id,
    a.name,
    a.color,
    a.is_active,
    a.created_at,
    a.updated_at,
    coalesce(sum(t.amount), 0)::numeric as balance
  from public.cash_accounts a
  left join public.cash_transactions t
    on t.account_id = a.id and t.user_id = a.user_id
  where a.user_id = auth.uid()
  group by a.id
  order by a.is_active desc, a.name asc;
$$;

create or replace function public.cash_history_page(
  p_start date default null,
  p_end date default null,
  p_account_id uuid default null,
  p_type text default null,
  p_source_type text default null,
  p_offset integer default 0,
  p_limit integer default 50
)
returns table (
  items jsonb,
  total bigint,
  total_income numeric,
  total_outcome numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with filtered as (
    select
      t.*,
      jsonb_build_object('name', a.name, 'color', a.color) as cash_accounts
    from public.cash_transactions t
    join public.cash_accounts a on a.id = t.account_id
    where t.user_id = auth.uid()
      and (p_start is null or t.date >= p_start)
      and (p_end is null or t.date <= p_end)
      and (p_account_id is null or t.account_id = p_account_id)
      and (p_type is null or t.type = p_type)
      and (p_source_type is null or t.source_type = p_source_type)
  ), totals as (
    select
      count(*)::bigint as total,
      coalesce(sum(amount) filter (where amount > 0), 0)::numeric as total_income,
      coalesce(sum(abs(amount)) filter (where amount < 0), 0)::numeric as total_outcome
    from filtered
  ), page as (
    select *
    from filtered
    order by date desc, created_at desc, id desc
    offset greatest(p_offset, 0)
    limit least(greatest(p_limit, 1), 100)
  )
  select
    coalesce((select jsonb_agg(to_jsonb(page) order by date desc, created_at desc, id desc) from page), '[]'::jsonb),
    totals.total,
    totals.total_income,
    totals.total_outcome
  from totals;
$$;

create or replace function public.open_card_groups()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with purchase_rows as (
    select
      p.id,
      p.card_id,
      (
        to_jsonb(p)
        || jsonb_build_object(
          'cards', to_jsonb(c),
          'open_installments', coalesce(oi.items, '[]'::jsonb),
          'open_total', coalesce(oi.open_total, 0),
          'open_installments_count', coalesce(oi.open_count, 0),
          'paid_installments', coalesce(ai.paid_count, 0),
          'active_installments', coalesce(ai.active_count, 0),
          'next_due_date', oi.next_due_date,
          'has_paid_invoice', coalesce(ai.paid_count, 0) > 0
        )
      ) as purchase,
      coalesce(oi.open_total, 0)::numeric as open_total
    from public.card_purchases p
    join public.cards c on c.id = p.card_id
    cross join lateral (
      select
        jsonb_agg(
          to_jsonb(i) || jsonb_build_object('card_invoices', to_jsonb(inv))
          order by i.due_date, i.installment_number
        ) as items,
        sum(i.amount)::numeric as open_total,
        count(*)::integer as open_count,
        min(i.due_date) as next_due_date
      from public.card_installments i
      left join public.card_invoices inv on inv.id = i.invoice_id
      where i.card_purchase_id = p.id
        and coalesce(inv.status, 'pending') <> 'paid'
        and (
          not p.is_recurring
          or (i.invoice_year = extract(year from current_date)::integer
              and i.invoice_month = extract(month from current_date)::integer)
        )
    ) oi
    cross join lateral (
      select
        count(*)::integer as active_count,
        count(*) filter (where inv.status = 'paid')::integer as paid_count
      from public.card_installments i
      left join public.card_invoices inv on inv.id = i.invoice_id
      where i.card_purchase_id = p.id
    ) ai
    where p.user_id = auth.uid()
      and p.status = 'active'
      and coalesce(oi.open_count, 0) > 0
  ), grouped as (
    select
      pr.card_id,
      to_jsonb(c) as card,
      sum(pr.open_total)::numeric as total,
      jsonb_agg(pr.purchase order by (pr.purchase ->> 'purchase_date') desc, pr.id) as purchases
    from purchase_rows pr
    join public.cards c on c.id = pr.card_id
    group by pr.card_id, c.id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'card_id', card_id,
        'card', card,
        'total', total,
        'purchases', purchases
      )
      order by total desc, card_id
    ),
    '[]'::jsonb
  )
  from grouped;
$$;

create or replace function public.finance_list_page(
  p_start date default null,
  p_end date default null,
  p_view_mode text default 'purchases',
  p_type text default null,
  p_status text default null,
  p_card_id uuid default null,
  p_category text default null,
  p_sort text default 'date-desc',
  p_offset integer default 0,
  p_limit integer default 20
)
returns table (items jsonb, total bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with entry_records as (
    select
      'entry'::text as record_type,
      e.id as record_id,
      e.description as title,
      e.amount::numeric as amount,
      e.date as record_date,
      e.date as due_date,
      'paid'::text as record_status,
      null::text as category,
      null::uuid as card_id,
      jsonb_build_object(
        'entry', to_jsonb(e) || jsonb_build_object(
          'cash_transactions', case when t.id is null then null else
            jsonb_build_object(
              'account_id', t.account_id,
              'cash_accounts', jsonb_build_object('id', a.id, 'name', a.name, 'color', a.color)
            ) end
        )
      ) as payload
    from public.entries e
    left join public.cash_transactions t on t.id = e.cash_transaction_id
    left join public.cash_accounts a on a.id = t.account_id
    where e.user_id = auth.uid()
      and p_view_mode = 'purchases'
      and p_status is null
      and (p_start is null or e.date >= p_start)
      and (p_end is null or e.date <= p_end)
  ), expense_records as (
    select
      'expense'::text,
      e.id,
      e.description,
      e.amount::numeric,
      e.due_date,
      e.due_date,
      e.status,
      e.category,
      null::uuid,
      jsonb_build_object('expense', to_jsonb(e))
    from public.expenses e
    where e.user_id = auth.uid()
      and p_view_mode = 'purchases'
      and (p_start is null or e.due_date >= p_start)
      and (p_end is null or e.due_date <= p_end)
  ), payable_source as (
    select
      p.*,
      case
        when p.installments_count > 1 and count(*) over (partition by p.payable_group_id) = 1
          then md5(
            lower(trim(p.description)) || '|' || p.purchase_date::text || '|' || p.category || '|'
            || p.installments_count::text || '|' || coalesce(p.notes, '')
          )
        else p.payable_group_id::text
      end as performance_group_key
    from public.payables p
    where p.user_id = auth.uid()
      and p_view_mode = 'purchases'
  ), payable_records as (
    select
      'payable'::text,
      (array_agg(p.id order by p.installment_number, p.due_date, p.id))[1] as record_id,
      min(p.description) as title,
      sum(p.amount)::numeric as amount,
      coalesce(min(p.due_date) filter (where p.status = 'pending'), max(p.due_date)) as record_date,
      coalesce(min(p.due_date) filter (where p.status = 'pending'), max(p.due_date)) as due_date,
      case when bool_and(p.status = 'paid') then 'paid' else 'pending' end as record_status,
      min(p.category) as category,
      null::uuid as card_id,
      jsonb_build_object(
        'payables', jsonb_agg(to_jsonb(p) order by p.installment_number, p.due_date),
        'paid_installments', count(*) filter (where p.status = 'paid'),
        'total_installments', count(*),
        'first_due_date', min(p.due_date),
        'last_due_date', max(p.due_date),
        'next_due_date', min(p.due_date) filter (where p.status = 'pending'),
        'purchase_date', min(p.purchase_date)
      ) as payload
    from payable_source p
    group by p.performance_group_key
    having p_start is null
      or bool_or(p.purchase_date between p_start and p_end)
      or bool_or(p.due_date between p_start and p_end)
  ), purchase_records as (
    select
      'purchase'::text,
      p.id,
      p.description,
      (p.installment_amount * p.installments_count)::numeric,
      p.purchase_date,
      coalesce(ix.next_due_date, ix.last_due_date, p.purchase_date),
      case when ix.active_count > 0 and ix.paid_count >= ix.active_count then 'paid' else 'pending' end,
      p.category,
      p.card_id,
      jsonb_build_object(
        'purchase', to_jsonb(p)
          || jsonb_build_object(
            'cards', to_jsonb(c),
            'card_installments', coalesce(ix.items, '[]'::jsonb),
            'paid_installments', coalesce(ix.paid_count, 0),
            'active_installments', coalesce(ix.active_count, 0),
            'installments_in_range', coalesce(ix.items_in_range, '[]'::jsonb),
            'open_installments_in_range', coalesce(ix.open_items_in_range, '[]'::jsonb),
            'next_due_date', ix.next_due_date,
            'has_paid_invoice', coalesce(ix.paid_count, 0) > 0
          )
      )
    from public.card_purchases p
    join public.cards c on c.id = p.card_id
    cross join lateral (
      select
        jsonb_agg(to_jsonb(i) || jsonb_build_object('card_invoices', to_jsonb(inv)) order by i.installment_number) as items,
        jsonb_agg(to_jsonb(i) || jsonb_build_object('card_invoices', to_jsonb(inv)) order by i.installment_number)
          filter (where (p_start is null or i.due_date >= p_start) and (p_end is null or i.due_date <= p_end)) as items_in_range,
        jsonb_agg(to_jsonb(i) || jsonb_build_object('card_invoices', to_jsonb(inv)) order by i.installment_number)
          filter (where coalesce(inv.status, 'pending') <> 'paid'
            and (p_start is null or i.due_date >= p_start) and (p_end is null or i.due_date <= p_end)) as open_items_in_range,
        count(*)::integer as active_count,
        count(*) filter (where inv.status = 'paid')::integer as paid_count,
        min(i.due_date) filter (where coalesce(inv.status, 'pending') <> 'paid') as next_due_date,
        max(i.due_date) as last_due_date,
        bool_or((p_start is null or i.due_date >= p_start) and (p_end is null or i.due_date <= p_end)) as has_in_range,
        bool_or(coalesce(inv.status, 'pending') <> 'paid'
          and (p_start is null or i.due_date >= p_start) and (p_end is null or i.due_date <= p_end)) as has_open_in_range
      from public.card_installments i
      left join public.card_invoices inv on inv.id = i.invoice_id
      where i.card_purchase_id = p.id
    ) ix
    where p.user_id = auth.uid()
      and p.status = 'active'
      and (
        (p_view_mode = 'purchases' and (
          p_start is null
          or p.purchase_date between p_start and p_end
          or coalesce(ix.has_in_range, false)
        ))
        or (p_view_mode = 'open-invoices' and coalesce(ix.has_open_in_range, false))
        or (p_view_mode = 'invoice-range' and coalesce(ix.has_in_range, false))
      )
  ), all_records as (
    select * from entry_records
    union all select * from expense_records
    union all select * from payable_records
    union all select * from purchase_records
  ), filtered as (
    select *
    from all_records r
    where (p_type is null or r.record_type = p_type)
      and (p_status is null or r.record_status = p_status)
      and (p_card_id is null or r.card_id = p_card_id)
      and (p_category is null or r.category = p_category)
  ), numbered as (
    select
      r.*,
      row_number() over (
        order by
          case when p_sort = 'date-desc' then r.record_date end desc nulls last,
          case when p_sort = 'date-asc' then r.record_date end asc nulls last,
          case when p_sort = 'due-asc' then r.due_date end asc nulls last,
          case when p_sort = 'amount-desc' then r.amount end desc,
          case when p_sort = 'amount-asc' then r.amount end asc,
          case when p_sort = 'pending-first' then case when r.record_status = 'pending' then 0 else 1 end end asc,
          case when p_sort = 'category-asc' then case r.category
            when 'food' then 'Alimentacao'
            when 'subscriptions' then 'Assinaturas'
            when 'education' then 'Educacao'
            when 'housing' then 'Moradia'
            when 'personal' then 'Compras pessoais'
            when 'gifts' then 'Presentes'
            when 'health' then 'Saude'
            when 'transport' then 'Transporte'
            when 'leisure' then 'Lazer'
            else 'Outros'
          end end asc,
          case when p_sort = 'type-asc' then case r.record_type
            when 'entry' then 'Entrada'
            when 'expense' then 'Gasto simples'
            when 'payable' then 'Conta a pagar'
            else 'Compra no cartao'
          end end asc,
          r.record_date desc,
          r.record_id
      ) as position,
      count(*) over ()::bigint as total_count
    from filtered r
  ), totals as (
    select count(*)::bigint as total from filtered
  ), page as (
    select *
    from numbered
    where position > greatest(p_offset, 0)
      and position <= greatest(p_offset, 0) + least(greatest(p_limit, 1), 50)
    order by position
  )
  select
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', record_id,
          'type', record_type,
          'title', title,
          'amount', amount,
          'date', record_date,
          'status', record_status,
          'category', category,
          'cardId', card_id,
          'payload', payload
        ) order by position
      ) from page
    ), '[]'::jsonb),
    totals.total
  from totals;
$$;

revoke all on function public.cash_accounts_with_balance() from public;
revoke all on function public.cash_history_page(date, date, uuid, text, text, integer, integer) from public;
revoke all on function public.open_card_groups() from public;
revoke all on function public.finance_list_page(date, date, text, text, text, uuid, text, text, integer, integer) from public;

grant execute on function public.cash_accounts_with_balance() to authenticated;
grant execute on function public.cash_history_page(date, date, uuid, text, text, integer, integer) to authenticated;
grant execute on function public.open_card_groups() to authenticated;
grant execute on function public.finance_list_page(date, date, text, text, text, uuid, text, text, integer, integer) to authenticated;
