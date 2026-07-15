"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Card,
  CardInstallment,
  CardInvoice,
  CardInvoiceWithCard,
  CardPurchase,
  CardPurchaseWithProgress,
  CashAccount,
  CashAccountWithBalance,
  CashTransaction,
  CashTransactionWithActions,
  Entry,
  EntryWithCashAccount,
  Expense,
  Payable,
  PaymentStatus,
} from "@/types/finance";
import { monthRange } from "@/lib/dates/format";
import { getInvoiceDueDate, toIsoDate } from "@/lib/dates/invoice";

export type MonthData = {
  cards: Card[];
  entries: Entry[];
  expenses: Expense[];
  payables: Payable[];
  cashAccounts: CashAccountWithBalance[];
  invoices: (CardInvoiceWithCard & { card_installments: CardInstallment[] })[];
};

export type CardPurchaseDetails = CardPurchaseWithProgress & {
  card_installments: (CardInstallment & { card_invoices?: CardInvoice | null })[];
};

export type OpenCardPurchase = CardPurchaseWithProgress & {
  open_installments: (CardInstallment & { card_invoices?: CardInvoice | null })[];
  open_total: number;
  open_installments_count: number;
};

export type OpenCardGroup = {
  card_id: string;
  card?: Card | null;
  total: number;
  purchases: OpenCardPurchase[];
};

export type OpenData = {
  cards: Card[];
  expenses: Expense[];
  payables: Payable[];
  cashAccounts: CashAccountWithBalance[];
  openCardGroups: OpenCardGroup[];
};

export type FinanceListRecord = {
  id: string;
  type: "entry" | "expense" | "payable" | "purchase";
  title: string;
  amount: number;
  date: string;
  status: PaymentStatus;
  category: string | null;
  cardId: string | null;
  payload: {
    entry?: EntryWithCashAccount;
    expense?: Expense;
    payables?: Payable[];
    paid_installments?: number;
    total_installments?: number;
    first_due_date?: string;
    last_due_date?: string;
    next_due_date?: string | null;
    purchase_date?: string;
    purchase?: CardPurchaseWithProgress & {
      cards?: Card | null;
      card_installments?: (CardInstallment & { card_invoices?: CardInvoice | null })[];
    };
  };
};

export type FinanceListPage = {
  items: FinanceListRecord[];
  total: number;
  cards: Card[];
  cashAccounts: CashAccountWithBalance[];
};

async function currentUserId(supabase: SupabaseClient) {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Usuario nao autenticado.");
  return data.user.id;
}

export async function fetchCards(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("cards")
    .select("id,user_id,name,issuer,color,closing_day,due_day,is_active,created_at,updated_at")
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Card[];
}

export async function fetchCashAccounts(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("cash_accounts_with_balance");
  if (error) throw error;
  return (data ?? []) as CashAccountWithBalance[];
}

export async function fetchCashData(supabase: SupabaseClient) {
  const [accounts, transactions] = await Promise.all([
    supabase.rpc("cash_accounts_with_balance"),
    supabase.rpc("cash_recent_with_actions", { p_limit: 100 }),
  ]);
  const error = accounts.error ?? transactions.error;
  if (error) throw error;
  return {
    accounts: (accounts.data ?? []) as CashAccountWithBalance[],
    transactions: (transactions.data ?? []) as CashTransactionWithActions[],
  };
}

export async function payWithCash(
  supabase: SupabaseClient,
  values: { sourceType: "expense" | "payable" | "card_invoice"; sourceIds: string[]; accountId: string | null },
) {
  const { error } = await supabase.rpc("pay_with_cash", {
    p_source_type: values.sourceType,
    p_source_ids: values.sourceIds,
    p_account_id: values.accountId,
  });
  if (error) throw error;
}

export async function undoCashTransaction(supabase: SupabaseClient, transactionId: string) {
  const { error } = await supabase.rpc("undo_cash_transaction", { p_transaction_id: transactionId });
  if (error) throw error;
}

export async function deleteCashTransaction(supabase: SupabaseClient, transactionId: string) {
  const { error } = await supabase.rpc("delete_cash_transaction", { p_transaction_id: transactionId });
  if (error) throw error;
}

export async function fetchCashHistory(
  supabase: SupabaseClient,
  filters: {
    start?: string;
    end?: string;
    accountId?: string;
    type?: string;
    sourceType?: string;
    offset?: number;
    limit?: number;
  },
) {
  const [accounts, page] = await Promise.all([
    supabase.rpc("cash_accounts_with_balance"),
    supabase.rpc("cash_history_page", {
      p_start: filters.start || null,
      p_end: filters.end || null,
      p_account_id: filters.accountId && filters.accountId !== "all" ? filters.accountId : null,
      p_type: filters.type && filters.type !== "all" ? filters.type : null,
      p_source_type: filters.sourceType && filters.sourceType !== "all" ? filters.sourceType : null,
      p_offset: filters.offset ?? 0,
      p_limit: filters.limit ?? 50,
    }),
  ]);
  const error = accounts.error ?? page.error;
  if (error) throw error;

  const result = page.data?.[0] as { items?: unknown[]; total?: number; total_income?: number; total_outcome?: number } | undefined;

  return {
    accounts: (accounts.data ?? []) as CashAccount[],
    transactions: (result?.items ?? []) as (CashTransaction & { cash_accounts?: Pick<CashAccount, "name" | "color"> | null })[],
    total: Number(result?.total ?? 0),
    totalIncome: Number(result?.total_income ?? 0),
    totalOutcome: Number(result?.total_outcome ?? 0),
  };
}

export async function fetchMonthData(supabase: SupabaseClient, monthValue: string): Promise<MonthData> {
  const { start, end, year, month } = monthRange(monthValue);
  const [cards, entries, expenses, payables, invoices, cashAccounts] = await Promise.all([
    supabase.from("cards").select("id,user_id,name,issuer,color,closing_day,due_day,is_active,created_at,updated_at").order("name"),
    supabase.from("entries").select("id,user_id,description,amount,date,cash_transaction_id,notes,created_at,updated_at").gte("date", start).lte("date", end).order("date"),
    supabase.from("expenses").select("id,user_id,description,amount,due_date,payment_method,category,status,cash_transaction_id,notes,created_at,updated_at").gte("due_date", start).lte("due_date", end).order("due_date"),
    supabase.from("payables").select("id,user_id,description,amount,purchase_date,due_date,category,status,payable_group_id,installment_number,installments_count,cash_transaction_id,notes,created_at,updated_at").gte("due_date", start).lte("due_date", end).order("due_date"),
    supabase
      .from("card_invoices")
      .select("*, cards(*), card_installments(*)")
      .eq("invoice_year", year)
      .eq("invoice_month", month)
      .order("due_date"),
    supabase.rpc("cash_accounts_with_balance"),
  ]);

  const error = cards.error ?? entries.error ?? expenses.error ?? payables.error ?? invoices.error ?? cashAccounts.error;
  if (error) throw error;

  return {
    cards: (cards.data ?? []) as Card[],
    entries: (entries.data ?? []) as Entry[],
    expenses: (expenses.data ?? []) as Expense[],
    payables: (payables.data ?? []) as Payable[],
    cashAccounts: (cashAccounts.data ?? []) as CashAccountWithBalance[],
    invoices: (invoices.data ?? []) as (CardInvoiceWithCard & { card_installments: CardInstallment[] })[],
  };
}

export async function fetchOpenData(supabase: SupabaseClient): Promise<OpenData> {
  const [cards, expenses, payables, groups, cashAccounts] = await Promise.all([
    supabase.from("cards").select("id,user_id,name,issuer,color,closing_day,due_day,is_active,created_at,updated_at").order("name"),
    supabase.from("expenses").select("id,user_id,description,amount,due_date,payment_method,category,status,cash_transaction_id,notes,created_at,updated_at").eq("status", "pending").order("due_date"),
    supabase.from("payables").select("id,user_id,description,amount,purchase_date,due_date,category,status,payable_group_id,installment_number,installments_count,cash_transaction_id,notes,created_at,updated_at").eq("status", "pending").order("due_date"),
    supabase.rpc("open_card_groups"),
    supabase.rpc("cash_accounts_with_balance"),
  ]);

  const error = cards.error ?? expenses.error ?? payables.error ?? groups.error ?? cashAccounts.error;
  if (error) throw error;

  return {
    cards: (cards.data ?? []) as Card[],
    expenses: (expenses.data ?? []) as Expense[],
    payables: (payables.data ?? []) as Payable[],
    cashAccounts: (cashAccounts.data ?? []) as CashAccountWithBalance[],
    openCardGroups: (groups.data ?? []) as OpenCardGroup[],
  };
}

export async function fetchListData(
  supabase: SupabaseClient,
  options: {
    range?: { start: string; end: string };
    viewMode: string;
    type: string;
    status: string;
    card: string;
    category: string;
    sort: string;
    page: number;
    pageSize: number;
  },
): Promise<FinanceListPage> {
  const offset = Math.max(0, (options.page - 1) * options.pageSize);
  const [cards, cashAccounts, page] = await Promise.all([
    supabase.from("cards").select("id,user_id,name,issuer,color,closing_day,due_day,is_active,created_at,updated_at").order("name"),
    supabase.from("cash_accounts").select("id,user_id,name,color,is_active,created_at,updated_at").order("is_active", { ascending: false }).order("name"),
    supabase.rpc("finance_list_page", {
      p_start: options.range?.start ?? null,
      p_end: options.range?.end ?? null,
      p_view_mode: options.viewMode,
      p_type: options.type === "all" ? null : options.type,
      p_status: options.status === "all" ? null : options.status,
      p_card_id: options.card === "all" ? null : options.card,
      p_category: options.category === "all" ? null : options.category,
      p_sort: options.sort,
      p_offset: offset,
      p_limit: options.pageSize,
    }),
  ]);
  const error = cards.error ?? cashAccounts.error ?? page.error;
  if (error) throw error;
  const result = page.data?.[0] as { items?: FinanceListRecord[]; total?: number } | undefined;
  return {
    cards: (cards.data ?? []) as Card[],
    cashAccounts: (cashAccounts.data ?? []) as CashAccountWithBalance[],
    items: result?.items ?? [],
    total: Number(result?.total ?? 0),
  };
}

export async function fetchCardPurchaseDetails(
  supabase: SupabaseClient,
  purchaseId: string,
): Promise<CardPurchaseDetails> {
  const { data, error } = await supabase
    .from("card_purchases")
    .select("*, cards(*), card_installments(*, card_invoices(*))")
    .eq("id", purchaseId)
    .single();

  if (error) throw error;

  const installments = ((data.card_installments ?? []) as (CardInstallment & { card_invoices?: CardInvoice | null })[])
    .slice()
    .sort((a, b) => a.installment_number - b.installment_number);
  const paidInstallments = installments.filter((installment) => installment.card_invoices?.status === "paid").length;
  const nextDueDate =
    installments
      .filter((installment) => installment.card_invoices?.status !== "paid")
      .sort((a, b) => a.due_date.localeCompare(b.due_date))[0]?.due_date ?? null;

  return {
    ...data,
    card_installments: installments,
    paid_installments: paidInstallments,
    active_installments: installments.length,
    next_due_date: nextDueDate,
    has_paid_invoice: paidInstallments > 0,
  } as CardPurchaseDetails;
}

export async function saveCard(
  supabase: SupabaseClient,
  values: Omit<Card, "id" | "user_id" | "created_at" | "updated_at">,
  id?: string,
) {
  const user_id = await currentUserId(supabase);
  const payload = { ...values, user_id, updated_at: new Date().toISOString() };
  const query = id ? supabase.from("cards").update(payload).eq("id", id) : supabase.from("cards").insert(payload);
  const { error } = await query;
  if (error) throw error;
}

export async function createEntry(
  supabase: SupabaseClient,
  values: Pick<Entry, "description" | "amount" | "date" | "notes"> & { cash_account_id: string },
) {
  const { error } = await supabase.rpc("create_entry_with_cash", {
    p_description: values.description,
    p_amount: values.amount,
    p_date: values.date,
    p_notes: values.notes,
    p_cash_account_id: values.cash_account_id,
  });
  if (error) throw error;
}

export async function updateEntry(
  supabase: SupabaseClient,
  id: string,
  values: Pick<Entry, "description" | "amount" | "date" | "notes"> & { cash_account_id: string },
) {
  const { error } = await supabase.rpc("update_entry_with_cash", {
    p_entry_id: id,
    p_description: values.description,
    p_amount: values.amount,
    p_date: values.date,
    p_notes: values.notes,
    p_cash_account_id: values.cash_account_id,
  });
  if (error) throw error;
}

export async function deleteEntry(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.rpc("delete_entry_with_cash", { p_entry_id: id });
  if (error) throw error;
}

export async function createExpense(
  supabase: SupabaseClient,
  values: Pick<Expense, "description" | "amount" | "due_date" | "payment_method" | "category" | "status" | "notes">,
) {
  const user_id = await currentUserId(supabase);
  const { error } = await supabase.from("expenses").insert({ ...values, user_id });
  if (error) throw error;
}

export async function updateExpense(
  supabase: SupabaseClient,
  id: string,
  values: Pick<Expense, "description" | "amount" | "due_date" | "payment_method" | "category" | "status" | "notes">,
) {
  const { data: current, error: findError } = await supabase
    .from("expenses")
    .select("*")
    .eq("id", id)
    .single();
  if (findError) throw findError;

  let cashTransactionId: string | null = current.cash_transaction_id ?? null;
  if (current.status === "paid" && values.status === "pending") {
    await reverseLinkedCashTransaction(supabase, cashTransactionId, `Estorno de ${current.description}`);
    cashTransactionId = null;
  } else if (
    current.status === "paid" &&
    values.status === "paid" &&
    cashTransactionId &&
    (Number(current.amount) !== Number(values.amount) ||
      current.due_date !== values.due_date ||
      current.description !== values.description)
  ) {
    const { data: transaction, error: transactionError } = await supabase
      .from("cash_transactions")
      .select("account_id")
      .eq("id", cashTransactionId)
      .maybeSingle();
    if (transactionError) throw transactionError;
    await reverseLinkedCashTransaction(supabase, cashTransactionId, `Estorno de edicao: ${current.description}`);
    const nextTransaction = transaction?.account_id
      ? await createPaymentCashOut(supabase, {
          accountId: transaction.account_id,
          amount: Number(values.amount),
          date: values.due_date,
          description: `Pagamento ${values.description}`,
          sourceType: "expense",
          sourceId: id,
        })
      : null;
    cashTransactionId = nextTransaction?.id ?? null;
  }

  const { error } = await supabase
    .from("expenses")
    .update({
      ...values,
      cash_transaction_id: cashTransactionId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteExpense(supabase: SupabaseClient, id: string) {
  const { data: current, error: findError } = await supabase
    .from("expenses")
    .select("*")
    .eq("id", id)
    .single();
  if (findError) throw findError;

  await reverseLinkedCashTransaction(supabase, current.cash_transaction_id ?? null, `Estorno de exclusao: ${current.description}`);

  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw error;
}

function addMonthsClamped(dateIso: string, offset: number) {
  const [year, month, day] = dateIso.split("-").map(Number);
  const target = new Date(year, month - 1 + offset, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return toIsoDate(target);
}

function splitAmount(total: number, count: number) {
  const cents = Math.round(Number(total) * 100);
  const base = Math.floor(cents / count);
  const remainder = cents - base * count;
  return Array.from({ length: count }, (_, index) => (base + (index === count - 1 ? remainder : 0)) / 100);
}

export async function createPayable(
  supabase: SupabaseClient,
  values: Pick<Payable, "description" | "amount" | "purchase_date" | "due_date" | "category" | "status" | "notes"> & {
    installments_count?: number;
  },
) {
  const user_id = await currentUserId(supabase);
  const installmentsCount = Math.max(1, Number(values.installments_count ?? 1));
  const payableGroupId = crypto.randomUUID();
  const amounts = splitAmount(Number(values.amount), installmentsCount);
  const rows = amounts.map((amount, index) => ({
    user_id,
    description: values.description,
    amount,
    purchase_date: values.purchase_date,
    due_date: addMonthsClamped(values.due_date, index),
    category: values.category,
    status: values.status,
    payable_group_id: payableGroupId,
    installment_number: index + 1,
    installments_count: installmentsCount,
    notes: values.notes,
  }));

  const { error } = await supabase.from("payables").insert(rows);
  if (error) throw error;
}

export async function updatePayable(
  supabase: SupabaseClient,
  id: string,
  values: Pick<Payable, "description" | "amount" | "purchase_date" | "due_date" | "category" | "status" | "notes">,
) {
  const { data: current, error: findError } = await supabase
    .from("payables")
    .select("*")
    .eq("id", id)
    .single();
  if (findError) throw findError;

  let cashTransactionId: string | null = current.cash_transaction_id ?? null;
  if (current.status === "paid" && values.status === "pending") {
    await reverseLinkedCashTransaction(supabase, cashTransactionId, `Estorno de ${current.description}`);
    cashTransactionId = null;
  } else if (
    current.status === "paid" &&
    values.status === "paid" &&
    cashTransactionId &&
    (Number(current.amount) !== Number(values.amount) ||
      current.due_date !== values.due_date ||
      current.description !== values.description)
  ) {
    const { data: transaction, error: transactionError } = await supabase
      .from("cash_transactions")
      .select("account_id")
      .eq("id", cashTransactionId)
      .maybeSingle();
    if (transactionError) throw transactionError;
    await reverseLinkedCashTransaction(supabase, cashTransactionId, `Estorno de edicao: ${current.description}`);
    const nextTransaction = transaction?.account_id
      ? await createPaymentCashOut(supabase, {
          accountId: transaction.account_id,
          amount: Number(values.amount),
          date: values.due_date,
          description: `Pagamento ${values.description}`,
          sourceType: "payable",
          sourceId: id,
        })
      : null;
    cashTransactionId = nextTransaction?.id ?? null;
  }

  const { error } = await supabase
    .from("payables")
    .update({
      ...values,
      cash_transaction_id: cashTransactionId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function updatePayableGroup(
  supabase: SupabaseClient,
  groupId: string,
  values: Pick<Payable, "description" | "purchase_date" | "due_date" | "category" | "status" | "notes"> & {
    amount: number;
    installments_count: number;
  },
) {
  const { data: currentRows, error: findError } = await supabase
    .from("payables")
    .select("*")
    .eq("payable_group_id", groupId)
    .order("installment_number");
  if (findError) throw findError;

  const current = (currentRows ?? []) as Payable[];
  if (current.length === 0) throw new Error("Conta a pagar nao encontrada.");

  const hasPaidInstallment = current.some((payable) => payable.status === "paid" || payable.cash_transaction_id);
  if (hasPaidInstallment) {
    throw new Error("Nao e possivel alterar parcelas de uma conta que ja tem parcela paga. Reabra ou remova a baixa antes.");
  }

  const user_id = await currentUserId(supabase);
  const installmentsCount = Math.max(1, Number(values.installments_count));
  const amounts = splitAmount(Number(values.amount), installmentsCount);
  const now = new Date().toISOString();

  const { error: deleteError } = await supabase
    .from("payables")
    .delete()
    .eq("payable_group_id", groupId);
  if (deleteError) throw deleteError;

  const rows = amounts.map((amount, index) => ({
    user_id,
    description: values.description,
    amount,
    purchase_date: values.purchase_date,
    due_date: addMonthsClamped(values.due_date, index),
    category: values.category,
    status: values.status,
    payable_group_id: groupId,
    installment_number: index + 1,
    installments_count: installmentsCount,
    notes: values.notes,
    created_at: current[index]?.created_at ?? now,
    updated_at: now,
  }));

  const { error: insertError } = await supabase.from("payables").insert(rows);
  if (insertError) throw insertError;
}

export async function deletePayable(supabase: SupabaseClient, id: string) {
  const { data: current, error: findError } = await supabase
    .from("payables")
    .select("*")
    .eq("id", id)
    .single();
  if (findError) throw findError;

  await reverseLinkedCashTransaction(supabase, current.cash_transaction_id ?? null, `Estorno de exclusao: ${current.description}`);

  const { error } = await supabase.from("payables").delete().eq("id", id);
  if (error) throw error;
}

export async function saveCashAccount(
  supabase: SupabaseClient,
  values: Pick<CashAccount, "name" | "color" | "is_active">,
  id?: string,
) {
  const user_id = await currentUserId(supabase);
  const payload = { ...values, user_id, updated_at: new Date().toISOString() };
  const query = id ? supabase.from("cash_accounts").update(payload).eq("id", id) : supabase.from("cash_accounts").insert(payload);
  const { error } = await query;
  if (error) throw error;
}

export async function deleteCashAccount(supabase: SupabaseClient, id: string) {
  const { count, error: countError } = await supabase
    .from("cash_transactions")
    .select("id", { count: "exact", head: true })
    .eq("account_id", id);
  if (countError) throw countError;
  if ((count ?? 0) > 0) {
    throw new Error("Esta conta tem movimentacoes. Marque como inativa para preservar o historico.");
  }

  const { error } = await supabase.from("cash_accounts").delete().eq("id", id);
  if (error) throw error;
}

export async function createCashTransaction(
  supabase: SupabaseClient,
  values: Pick<CashTransaction, "account_id" | "type" | "amount" | "date" | "description" | "source_type" | "source_id" | "notes">,
) {
  const user_id = await currentUserId(supabase);
  const { data, error } = await supabase
    .from("cash_transactions")
    .insert({ ...values, user_id })
    .select()
    .single();
  if (error) throw error;
  return data as CashTransaction;
}

export async function createCashTransfer(
  supabase: SupabaseClient,
  values: {
    from_account_id: string;
    to_account_id: string;
    amount: number;
    date: string;
    description: string;
    notes: string | null;
  },
) {
  const user_id = await currentUserId(supabase);
  const transferId = crypto.randomUUID();
  const { error } = await supabase.from("cash_transactions").insert([
    {
      user_id,
      account_id: values.from_account_id,
      type: "transfer_out",
      amount: -Math.abs(values.amount),
      date: values.date,
      description: values.description,
      source_type: "transfer",
      source_id: transferId,
      notes: values.notes,
    },
    {
      user_id,
      account_id: values.to_account_id,
      type: "transfer_in",
      amount: Math.abs(values.amount),
      date: values.date,
      description: values.description,
      source_type: "transfer",
      source_id: transferId,
      notes: values.notes,
    },
  ]);
  if (error) throw error;
}

async function reverseLinkedCashTransaction(
  supabase: SupabaseClient,
  transactionId: string | null,
  description: string,
) {
  if (!transactionId) return;
  const { data: transaction, error } = await supabase
    .from("cash_transactions")
    .select("*")
    .eq("id", transactionId)
    .maybeSingle();
  if (error) throw error;
  if (!transaction) return;

  await createCashTransaction(supabase, {
    account_id: transaction.account_id,
    type: "reversal",
    amount: -Number(transaction.amount),
    date: new Date().toISOString().slice(0, 10),
    description,
    source_type: "reversal",
    source_id: transactionId,
    notes: null,
  });
}

async function createPaymentCashOut(
  supabase: SupabaseClient,
  values: {
    accountId?: string | null;
    amount: number;
    date: string;
    description: string;
    sourceType: "expense" | "payable" | "card_invoice";
    sourceId: string;
  },
) {
  if (!values.accountId) return null;
  return createCashTransaction(supabase, {
    account_id: values.accountId,
    type: "expense",
    amount: -Math.abs(Number(values.amount)),
    date: values.date,
    description: values.description,
    source_type: values.sourceType,
    source_id: values.sourceId,
    notes: null,
  });
}

async function getOrCreateCardInvoice(
  supabase: SupabaseClient,
  values: Pick<CardInvoice, "user_id" | "card_id" | "invoice_month" | "invoice_year" | "due_date">,
) {
  const { data: existing, error: findError } = await supabase
    .from("card_invoices")
    .select("*")
    .eq("user_id", values.user_id)
    .eq("card_id", values.card_id)
    .eq("invoice_month", values.invoice_month)
    .eq("invoice_year", values.invoice_year)
    .maybeSingle();

  if (findError) throw findError;
  if (existing) return existing as CardInvoice;

  const { data, error } = await supabase
    .from("card_invoices")
    .insert({ ...values, status: "pending" })
    .select()
    .single();
  if (error) throw error;
  return data as CardInvoice;
}

function buildInstallmentDrafts({
  user_id,
  purchaseId,
  values,
  invoices,
}: {
  user_id: string;
  purchaseId: string;
  values: {
    card: Card;
    description: string;
    purchase_date: string;
    category: CardPurchase["category"];
    installment_amount: number;
    installments_count: number;
    start_installment: number;
  };
  invoices: CardInvoice[];
}) {
  return invoices.map((invoice, index) => {
    const installmentNumber = values.start_installment + index;
    return {
      user_id,
      card_purchase_id: purchaseId,
      invoice_id: invoice.id,
      card_id: values.card.id,
      description: values.description,
      installment_number: installmentNumber,
      installments_count: values.installments_count,
      amount: values.installment_amount,
      category: values.category,
      invoice_month: invoice.invoice_month,
      invoice_year: invoice.invoice_year,
      due_date: invoice.due_date,
      status: invoice.status,
    };
  });
}

async function invoicesForPurchase(
  supabase: SupabaseClient,
  user_id: string,
  values: {
    card: Card;
    purchase_date: string;
    installments_count: number;
    start_installment: number;
  },
) {
  const invoices: CardInvoice[] = [];
  for (let index = 0; index < values.installments_count - values.start_installment + 1; index += 1) {
    const installmentNumber = values.start_installment + index;
    const dueDate = getInvoiceDueDate({
      purchaseDate: values.purchase_date,
      closingDay: values.card.closing_day,
      dueDay: values.card.due_day,
      installmentOffset: installmentNumber - 1,
    });
    invoices.push(
      await getOrCreateCardInvoice(supabase, {
        user_id,
        card_id: values.card.id,
        invoice_month: dueDate.getMonth() + 1,
        invoice_year: dueDate.getFullYear(),
        due_date: toIsoDate(dueDate),
      }),
    );
  }
  return invoices;
}

export async function createCardPurchase(
  supabase: SupabaseClient,
  values: {
    card: Card;
    description: string;
    purchase_date: string;
    category: CardPurchase["category"];
    installment_amount: number;
    installments_count: number;
    start_installment: number;
    is_recurring?: boolean;
    recurring_status?: CardPurchase["recurring_status"];
    notes: string | null;
  },
) {
  const user_id = await currentUserId(supabase);
  const { data: purchase, error: purchaseError } = await supabase
    .from("card_purchases")
    .insert({
      user_id,
      card_id: values.card.id,
      description: values.description,
      purchase_date: values.purchase_date,
      category: values.category,
      installment_amount: values.installment_amount,
      installments_count: values.installments_count,
      start_installment: values.start_installment,
      status: "active",
      is_recurring: Boolean(values.is_recurring),
      recurring_status: values.is_recurring ? values.recurring_status ?? "active" : "inactive",
      notes: values.notes,
    })
    .select()
    .single();

  if (purchaseError) throw purchaseError;

  const invoices = await invoicesForPurchase(supabase, user_id, values);
  const installments = buildInstallmentDrafts({ user_id, purchaseId: purchase.id, values, invoices });
  const { error: installmentsError } = await supabase.from("card_installments").insert(installments);
  if (installmentsError) throw installmentsError;

  return {
    purchase: purchase as CardPurchase,
    installments,
  };
}

export async function updateInvoiceStatus(
  supabase: SupabaseClient,
  invoiceId: string,
  status: PaymentStatus,
  cashAccountId?: string | null,
) {
  const { data: invoice, error: invoiceFindError } = await supabase
    .from("card_invoices")
    .select("*, cards(name), card_installments(amount)")
    .eq("id", invoiceId)
    .single();
  if (invoiceFindError) throw invoiceFindError;

  let cashTransactionId: string | null = invoice.cash_transaction_id ?? null;
  if (status === "paid") {
    const total = (invoice.card_installments ?? []).reduce((sum: number, item: { amount: number }) => sum + Number(item.amount), 0);
    const transaction = await createPaymentCashOut(supabase, {
      accountId: cashAccountId,
      amount: total,
      date: invoice.due_date,
      description: `Pagamento fatura ${invoice.cards?.name ?? "cartao"}`,
      sourceType: "card_invoice",
      sourceId: invoiceId,
    });
    cashTransactionId = transaction?.id ?? null;
  } else {
    await reverseLinkedCashTransaction(supabase, cashTransactionId, "Estorno de fatura reaberta");
    cashTransactionId = null;
  }

  const { error: invoiceError } = await supabase
    .from("card_invoices")
    .update({ status, cash_transaction_id: cashTransactionId, updated_at: new Date().toISOString() })
    .eq("id", invoiceId);
  if (invoiceError) throw invoiceError;

  const { error: installmentsError } = await supabase
    .from("card_installments")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("invoice_id", invoiceId);
  if (installmentsError) throw installmentsError;
}

async function purchaseHasPaidInvoice(supabase: SupabaseClient, purchaseId: string) {
  const { data, error } = await supabase
    .from("card_installments")
    .select("id, card_invoices(status)")
    .eq("card_purchase_id", purchaseId);
  if (error) throw error;

  return (data ?? []).some((installment) => {
    const invoice = installment.card_invoices as { status?: PaymentStatus } | null;
    return invoice?.status === "paid";
  });
}

export async function cancelCardPurchase(supabase: SupabaseClient, purchaseId: string) {
  const { error: purchaseError } = await supabase
    .from("card_purchases")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("id", purchaseId);
  if (purchaseError) throw purchaseError;

  const { data: pendingInstallments, error: findError } = await supabase
    .from("card_installments")
    .select("id, card_invoices(status)")
    .eq("card_purchase_id", purchaseId);
  if (findError) throw findError;

  const idsToDelete = (pendingInstallments ?? [])
    .filter((installment) => {
      const invoice = installment.card_invoices as { status?: PaymentStatus } | null;
      return invoice?.status !== "paid";
    })
    .map((installment) => installment.id);

  if (idsToDelete.length === 0) return;

  const { error: deleteError } = await supabase
    .from("card_installments")
    .delete()
    .in("id", idsToDelete);
  if (deleteError) throw deleteError;
}

export async function updateCardPurchase(
  supabase: SupabaseClient,
  purchaseId: string,
  values: {
    card: Card;
    description: string;
    purchase_date: string;
    category: CardPurchase["category"];
    installment_amount: number;
    installments_count: number;
    start_installment: number;
    is_recurring?: boolean;
    recurring_status?: CardPurchase["recurring_status"];
    notes: string | null;
  },
) {
  if (await purchaseHasPaidInvoice(supabase, purchaseId)) {
    throw new Error("Nao e possivel editar compra com fatura paga. Reabra a fatura primeiro.");
  }

  const user_id = await currentUserId(supabase);
  const { error: purchaseError } = await supabase
    .from("card_purchases")
    .update({
      card_id: values.card.id,
      description: values.description,
      purchase_date: values.purchase_date,
      category: values.category,
      installment_amount: values.installment_amount,
      installments_count: values.installments_count,
      start_installment: values.start_installment,
      is_recurring: Boolean(values.is_recurring),
      recurring_status: values.is_recurring ? values.recurring_status ?? "active" : "inactive",
      notes: values.notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", purchaseId);
  if (purchaseError) throw purchaseError;

  const { error: deleteError } = await supabase
    .from("card_installments")
    .delete()
    .eq("card_purchase_id", purchaseId);
  if (deleteError) throw deleteError;

  const invoices = await invoicesForPurchase(supabase, user_id, values);
  const installments = buildInstallmentDrafts({ user_id, purchaseId, values, invoices });
  const { error: insertError } = await supabase.from("card_installments").insert(installments);
  if (insertError) throw insertError;
}

export async function updateStatus(
  supabase: SupabaseClient,
  table: "expenses" | "card_installments" | "payables",
  id: string,
  status: PaymentStatus,
  cashAccountId?: string | null,
) {
  if (table === "card_installments") {
    const { error } = await supabase.from(table).update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    return;
  }

  const { data: record, error: findError } = await supabase
    .from(table)
    .select("*")
    .eq("id", id)
    .single();
  if (findError) throw findError;

  let cashTransactionId: string | null = record.cash_transaction_id ?? null;
  if (status === "paid") {
    const transaction = await createPaymentCashOut(supabase, {
      accountId: cashAccountId,
      amount: Number(record.amount),
      date: record.due_date,
      description: `Pagamento ${record.description}`,
      sourceType: table === "payables" ? "payable" : "expense",
      sourceId: id,
    });
    cashTransactionId = transaction?.id ?? null;
  } else {
    await reverseLinkedCashTransaction(supabase, cashTransactionId, `Estorno de ${record.description}`);
    cashTransactionId = null;
  }

  const { error } = await supabase.from(table).update({ status, cash_transaction_id: cashTransactionId, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}
