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
  Entry,
  Expense,
  Payable,
  PaymentStatus,
} from "@/types/finance";
import { currentMonthValue, monthRange } from "@/lib/dates/format";
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

async function currentUserId(supabase: SupabaseClient) {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Usuario nao autenticado.");
  return data.user.id;
}

export async function fetchCards(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("cards")
    .select("*")
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Card[];
}

function withCashBalances(accounts: CashAccount[], transactions: CashTransaction[]): CashAccountWithBalance[] {
  return accounts.map((account) => ({
    ...account,
    balance: transactions
      .filter((transaction) => transaction.account_id === account.id)
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0),
  }));
}

export async function fetchCashAccounts(supabase: SupabaseClient) {
  const [accounts, transactions] = await Promise.all([
    supabase.from("cash_accounts").select("*").order("is_active", { ascending: false }).order("name"),
    supabase.from("cash_transactions").select("*"),
  ]);
  const error = accounts.error ?? transactions.error;
  if (error) throw error;
  return withCashBalances((accounts.data ?? []) as CashAccount[], (transactions.data ?? []) as CashTransaction[]);
}

export async function fetchCashData(supabase: SupabaseClient) {
  const [accounts, transactions] = await Promise.all([
    supabase.from("cash_accounts").select("*").order("is_active", { ascending: false }).order("name"),
    supabase.from("cash_transactions").select("*, cash_accounts(name, color)").order("date", { ascending: false }).order("created_at", { ascending: false }).limit(100),
  ]);
  const balanceTransactions = await supabase.from("cash_transactions").select("*");
  const error = accounts.error ?? transactions.error ?? balanceTransactions.error;
  if (error) throw error;
  return {
    accounts: withCashBalances((accounts.data ?? []) as CashAccount[], (balanceTransactions.data ?? []) as CashTransaction[]),
    transactions: (transactions.data ?? []) as (CashTransaction & { cash_accounts?: Pick<CashAccount, "name" | "color"> | null })[],
  };
}

export async function fetchMonthData(supabase: SupabaseClient, monthValue: string): Promise<MonthData> {
  const { start, end, year, month } = monthRange(monthValue);
  const [cards, entries, expenses, payables, invoices, cashAccounts, cashTransactions] = await Promise.all([
    supabase.from("cards").select("*").order("name"),
    supabase.from("entries").select("*").gte("date", start).lte("date", end).order("date"),
    supabase.from("expenses").select("*").gte("due_date", start).lte("due_date", end).order("due_date"),
    supabase.from("payables").select("*").gte("due_date", start).lte("due_date", end).order("due_date"),
    supabase
      .from("card_invoices")
      .select("*, cards(*), card_installments(*)")
      .eq("invoice_year", year)
      .eq("invoice_month", month)
      .order("due_date"),
    supabase.from("cash_accounts").select("*").order("name"),
    supabase.from("cash_transactions").select("*"),
  ]);

  const error = cards.error ?? entries.error ?? expenses.error ?? payables.error ?? invoices.error ?? cashAccounts.error ?? cashTransactions.error;
  if (error) throw error;

  return {
    cards: (cards.data ?? []) as Card[],
    entries: (entries.data ?? []) as Entry[],
    expenses: (expenses.data ?? []) as Expense[],
    payables: (payables.data ?? []) as Payable[],
    cashAccounts: withCashBalances((cashAccounts.data ?? []) as CashAccount[], (cashTransactions.data ?? []) as CashTransaction[]),
    invoices: (invoices.data ?? []) as (CardInvoiceWithCard & { card_installments: CardInstallment[] })[],
  };
}

export async function fetchOpenData(supabase: SupabaseClient): Promise<OpenData> {
  const { year: currentYear, month: currentMonth } = monthRange(currentMonthValue());
  const [cards, expenses, payables, purchases, cashAccounts, cashTransactions] = await Promise.all([
    supabase.from("cards").select("*").order("name"),
    supabase.from("expenses").select("*").eq("status", "pending").order("due_date"),
    supabase.from("payables").select("*").eq("status", "pending").order("due_date"),
    supabase
      .from("card_purchases")
      .select("*, cards(*), card_installments(*, card_invoices(*))")
      .eq("status", "active")
      .order("purchase_date", { ascending: false }),
    supabase.from("cash_accounts").select("*").order("name"),
    supabase.from("cash_transactions").select("*"),
  ]);

  const error = cards.error ?? expenses.error ?? payables.error ?? purchases.error ?? cashAccounts.error ?? cashTransactions.error;
  if (error) throw error;

  const groups = new Map<string, OpenCardGroup>();
  for (const purchase of purchases.data ?? []) {
    const installments = ((purchase.card_installments ?? []) as (CardInstallment & { card_invoices?: CardInvoice | null })[])
      .filter((installment) => installment.card_invoices?.status !== "paid")
      .filter((installment) => {
        if (!purchase.is_recurring) return true;
        return installment.invoice_year === currentYear && installment.invoice_month === currentMonth;
      })
      .sort((a, b) => a.due_date.localeCompare(b.due_date));

    if (installments.length === 0) continue;

    const openTotal = installments.reduce((sum, installment) => sum + Number(installment.amount), 0);
    const openPurchase = {
      ...purchase,
      open_installments: installments,
      open_total: openTotal,
      open_installments_count: installments.length,
      paid_installments: (purchase.card_installments ?? []).filter((installment: CardInstallment & { card_invoices?: CardInvoice | null }) => installment.card_invoices?.status === "paid").length,
      active_installments: (purchase.card_installments ?? []).length,
      next_due_date: installments[0]?.due_date ?? null,
      has_paid_invoice: (purchase.card_installments ?? []).some((installment: CardInstallment & { card_invoices?: CardInvoice | null }) => installment.card_invoices?.status === "paid"),
    } as OpenCardPurchase;

    const cardId = purchase.card_id;
    const existing = groups.get(cardId);
    if (existing) {
      existing.total += openTotal;
      existing.purchases.push(openPurchase);
    } else {
      groups.set(cardId, {
        card_id: cardId,
        card: purchase.cards,
        total: openTotal,
        purchases: [openPurchase],
      });
    }
  }

  return {
    cards: (cards.data ?? []) as Card[],
    expenses: (expenses.data ?? []) as Expense[],
    payables: (payables.data ?? []) as Payable[],
    cashAccounts: withCashBalances((cashAccounts.data ?? []) as CashAccount[], (cashTransactions.data ?? []) as CashTransaction[]),
    openCardGroups: [...groups.values()].sort((a, b) => b.total - a.total),
  };
}

export async function fetchListData(
  supabase: SupabaseClient,
  range: { start: string; end: string },
) {
  const [cards, entries, expenses, payables, purchases] = await Promise.all([
    supabase.from("cards").select("*").order("name"),
    supabase.from("entries").select("*").gte("date", range.start).lte("date", range.end).order("date"),
    supabase.from("expenses").select("*").gte("due_date", range.start).lte("due_date", range.end).order("due_date"),
    supabase.from("payables").select("*").gte("due_date", range.start).lte("due_date", range.end).order("due_date"),
    supabase
    .from("card_purchases")
    .select("*, cards(*), card_installments(*, card_invoices(*))")
    .eq("status", "active")
    .order("purchase_date", { ascending: false }),
  ]);

  const error = cards.error ?? entries.error ?? expenses.error ?? payables.error ?? purchases.error;
  if (error) throw error;

  const activePurchases = (purchases.data ?? []).map((purchase) => {
    const installments = (purchase.card_installments ?? []) as (CardInstallment & { card_invoices?: CardInvoice | null })[];
    const installmentsInRange = installments.filter((installment) => installment.due_date >= range.start && installment.due_date <= range.end);
    const openInstallmentsInRange = installmentsInRange.filter((installment) => installment.card_invoices?.status !== "paid");
    const activeInstallments = installments.length;
    const paidInstallments = installments.filter((installment) => installment.card_invoices?.status === "paid").length;
    const nextDueDate =
      installments
        .filter((installment) => installment.card_invoices?.status !== "paid")
        .sort((a, b) => a.due_date.localeCompare(b.due_date))[0]?.due_date ?? null;

    return {
      ...purchase,
      paid_installments: paidInstallments,
      active_installments: activeInstallments,
      installments_in_range: installmentsInRange,
      open_installments_in_range: openInstallmentsInRange,
      next_due_date: nextDueDate,
      has_paid_invoice: paidInstallments > 0,
    };
  }) as CardPurchaseWithProgress[];

  return {
    cards: (cards.data ?? []) as Card[],
    entries: (entries.data ?? []) as Entry[],
    expenses: (expenses.data ?? []) as Expense[],
    payables: (payables.data ?? []) as Payable[],
    purchases: activePurchases,
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
  values: Pick<Entry, "description" | "amount" | "date" | "notes">,
) {
  const user_id = await currentUserId(supabase);
  const { error } = await supabase.from("entries").insert({ ...values, user_id });
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

export async function createPayable(
  supabase: SupabaseClient,
  values: Pick<Payable, "description" | "amount" | "purchase_date" | "due_date" | "category" | "status" | "notes">,
) {
  const user_id = await currentUserId(supabase);
  const { error } = await supabase.from("payables").insert({ ...values, user_id });
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
