"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Card,
  CardInstallment,
  CardInvoice,
  CardInvoiceWithCard,
  CardPurchase,
  CardPurchaseWithProgress,
  Entry,
  Expense,
  PaymentStatus,
} from "@/types/finance";
import { monthRange } from "@/lib/dates/format";
import { getInvoiceDueDate, toIsoDate } from "@/lib/dates/invoice";

export type MonthData = {
  cards: Card[];
  entries: Entry[];
  expenses: Expense[];
  invoices: (CardInvoiceWithCard & { card_installments: CardInstallment[] })[];
};

export type CardPurchaseDetails = CardPurchaseWithProgress & {
  card_installments: (CardInstallment & { card_invoices?: CardInvoice | null })[];
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

export async function fetchMonthData(supabase: SupabaseClient, monthValue: string): Promise<MonthData> {
  const { start, end, year, month } = monthRange(monthValue);
  const [cards, entries, expenses, invoices] = await Promise.all([
    supabase.from("cards").select("*").order("name"),
    supabase.from("entries").select("*").gte("date", start).lte("date", end).order("date"),
    supabase.from("expenses").select("*").gte("due_date", start).lte("due_date", end).order("due_date"),
    supabase
      .from("card_invoices")
      .select("*, cards(*), card_installments(*)")
      .eq("invoice_year", year)
      .eq("invoice_month", month)
      .order("due_date"),
  ]);

  const error = cards.error ?? entries.error ?? expenses.error ?? invoices.error;
  if (error) throw error;

  return {
    cards: (cards.data ?? []) as Card[],
    entries: (entries.data ?? []) as Entry[],
    expenses: (expenses.data ?? []) as Expense[],
    invoices: (invoices.data ?? []) as (CardInvoiceWithCard & { card_installments: CardInstallment[] })[],
  };
}

export async function fetchListData(
  supabase: SupabaseClient,
  range: { start: string; end: string },
) {
  const [cards, entries, expenses, purchases] = await Promise.all([
    supabase.from("cards").select("*").order("name"),
    supabase.from("entries").select("*").gte("date", range.start).lte("date", range.end).order("date"),
    supabase.from("expenses").select("*").gte("due_date", range.start).lte("due_date", range.end).order("due_date"),
    supabase
    .from("card_purchases")
    .select("*, cards(*), card_installments(*, card_invoices(*))")
    .eq("status", "active")
    .order("purchase_date", { ascending: false }),
  ]);

  const error = cards.error ?? entries.error ?? expenses.error ?? purchases.error;
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
) {
  const { error: invoiceError } = await supabase
    .from("card_invoices")
    .update({ status, updated_at: new Date().toISOString() })
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
  table: "expenses" | "card_installments",
  id: string,
  status: PaymentStatus,
) {
  const { error } = await supabase.from(table).update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}
