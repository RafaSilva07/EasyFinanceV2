"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Card,
  CardInstallment,
  CardPurchase,
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
  installments: (CardInstallment & { cards: Card | null })[];
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
  const [cards, entries, expenses, installments] = await Promise.all([
    supabase.from("cards").select("*").order("name"),
    supabase.from("entries").select("*").gte("date", start).lte("date", end).order("date"),
    supabase.from("expenses").select("*").gte("due_date", start).lte("due_date", end).order("due_date"),
    supabase
      .from("card_installments")
      .select("*, cards(*)")
      .eq("invoice_year", year)
      .eq("invoice_month", month)
      .order("due_date"),
  ]);

  const error = cards.error ?? entries.error ?? expenses.error ?? installments.error;
  if (error) throw error;

  return {
    cards: (cards.data ?? []) as Card[],
    entries: (entries.data ?? []) as Entry[],
    expenses: (expenses.data ?? []) as Expense[],
    installments: (installments.data ?? []) as (CardInstallment & { cards: Card | null })[],
  };
}

export async function fetchListData(supabase: SupabaseClient, monthValue: string) {
  const monthData = await fetchMonthData(supabase, monthValue);
  const { data, error } = await supabase
    .from("card_purchases")
    .select("*")
    .order("purchase_date", { ascending: false });
  if (error) throw error;
  return { ...monthData, purchases: (data ?? []) as CardPurchase[] };
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
      notes: values.notes,
    })
    .select()
    .single();

  if (purchaseError) throw purchaseError;

  const installments = Array.from(
    { length: values.installments_count - values.start_installment + 1 },
    (_, index) => {
      const installmentNumber = values.start_installment + index;
      const dueDate = getInvoiceDueDate({
        purchaseDate: values.purchase_date,
        closingDay: values.card.closing_day,
        dueDay: values.card.due_day,
        installmentOffset: installmentNumber - 1,
      });
      return {
        user_id,
        card_purchase_id: purchase.id,
        card_id: values.card.id,
        description: values.description,
        installment_number: installmentNumber,
        installments_count: values.installments_count,
        amount: values.installment_amount,
        category: values.category,
        invoice_month: dueDate.getMonth() + 1,
        invoice_year: dueDate.getFullYear(),
        due_date: toIsoDate(dueDate),
        status: "pending" as PaymentStatus,
      };
    },
  );

  const { error: installmentsError } = await supabase.from("card_installments").insert(installments);
  if (installmentsError) throw installmentsError;
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
