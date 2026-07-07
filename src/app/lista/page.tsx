"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle, Edit3, XCircle } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { ConfigNotice } from "@/components/layout/ConfigNotice";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cancelCardPurchase, fetchListData, updateCardPurchase, updateStatus } from "@/features/finance/api";
import { currentMonthRange, formatDateBr } from "@/lib/dates/format";
import { expenseCategories, getCategoryLabel } from "@/lib/finance/categories";
import { formatCurrency } from "@/lib/money/format";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import type { Card, CardPurchaseWithProgress, Expense, ExpenseCategory, Payable, PaymentStatus } from "@/types/finance";

const maskDateBr = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

const isoToBr = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
};

const brToIso = (value: string) => {
  const [day, month, year] = value.split("/");
  return `${year}-${month}-${day}`;
};

type ListItem =
  | {
      id: string;
      type: "entry";
      title: string;
      amount: number;
      date: string;
    }
  | {
      id: string;
      type: "expense";
      title: string;
      amount: number;
      date: string;
      status: PaymentStatus;
      category: ExpenseCategory;
    }
  | {
      id: string;
      type: "payable";
      title: string;
      amount: number;
      date: string;
      purchaseDate: string;
      status: PaymentStatus;
      category: ExpenseCategory;
    }
  | {
      id: string;
      type: "purchase";
      purchase: CardPurchaseWithProgress;
      title: string;
      amount: number;
      date: string;
      category: ExpenseCategory;
      cardId: string;
      card?: Card | null;
      hasOpenInvoice: boolean;
      hasOpenInvoiceInRange: boolean;
      hasInvoiceInRange: boolean;
    };

export default function ListaPage() {
  const initialRange = currentMonthRange();
  const [startDate, setStartDate] = useState(initialRange.start);
  const [endDate, setEndDate] = useState(initialRange.end);
  const [viewMode, setViewMode] = useState("purchases");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [card, setCard] = useState("all");
  const [category, setCategory] = useState("all");
  const [items, setItems] = useState<ListItem[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [editing, setEditing] = useState<Extract<ListItem, { type: "purchase" }> | null>(null);

  const load = useCallback(async () => {
    if (!hasSupabaseConfig()) return;
    setError("");
    try {
      const data = await fetchListData(createClient(), { start: startDate, end: endDate });
      setCards(data.cards);
      setItems([
        ...data.entries.map((item) => ({
          id: item.id,
          type: "entry" as const,
          title: item.description,
          amount: Number(item.amount),
          date: item.date,
        })),
        ...data.expenses.map((item: Expense) => ({
          id: item.id,
          type: "expense" as const,
          title: item.description,
          amount: Number(item.amount),
          date: item.due_date,
          status: item.status,
          category: item.category,
        })),
        ...data.payables.map((item: Payable) => ({
          id: item.id,
          type: "payable" as const,
          title: `${item.description}${item.installments_count > 1 ? ` ${item.installment_number}/${item.installments_count}` : ""}`,
          amount: Number(item.amount),
          date: item.due_date,
          purchaseDate: item.purchase_date,
          status: item.status,
          category: item.category,
        })),
        ...data.purchases.map((item) => ({
          id: item.id,
          type: "purchase" as const,
          purchase: item,
          title: item.description,
          amount: Number(item.installment_amount) * Number(item.installments_count),
          date: item.purchase_date,
          category: item.category,
          cardId: item.card_id,
          card: item.cards,
          hasOpenInvoice: item.active_installments > item.paid_installments,
          hasOpenInvoiceInRange: Boolean(item.open_installments_in_range?.length),
          hasInvoiceInRange: Boolean(item.installments_in_range?.length),
        })),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar lista.");
    }
  }, [endDate, startDate]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (type !== "all" && item.type !== type) return false;
      if (item.type === "purchase" && viewMode === "purchases" && item.date < startDate && !item.hasInvoiceInRange) return false;
      if (item.type === "purchase" && viewMode === "purchases" && item.date > endDate && !item.hasInvoiceInRange) return false;
      if (item.type === "purchase" && viewMode === "open-invoices" && !item.hasOpenInvoiceInRange) return false;
      if (item.type === "purchase" && viewMode === "invoice-range" && !item.hasInvoiceInRange) return false;
      if (item.type !== "purchase" && viewMode !== "purchases") return false;
      if (item.type === "purchase" && status === "paid" && item.purchase.paid_installments < item.purchase.active_installments) return false;
      if (item.type === "purchase" && status === "pending" && item.purchase.paid_installments >= item.purchase.active_installments) return false;
      if (item.type === "expense" && status !== "all" && item.status !== status) return false;
      if (item.type === "payable" && status !== "all" && item.status !== status) return false;
      if (item.type === "entry" && status !== "all") return false;
      if (card !== "all" && (item.type !== "purchase" || item.cardId !== card)) return false;
      if (category !== "all" && item.type !== "entry" && item.category !== category) return false;
      return true;
    });
  }, [items, type, status, card, category, viewMode, startDate, endDate]);

  async function toggleExpense(item: Extract<ListItem, { type: "expense" }>) {
    await updateStatus(createClient(), "expenses", item.id, item.status === "paid" ? "pending" : "paid");
    await load();
  }

  async function togglePayable(item: Extract<ListItem, { type: "payable" }>) {
    await updateStatus(createClient(), "payables", item.id, item.status === "paid" ? "pending" : "paid");
    await load();
  }

  async function cancelPurchase(item: Extract<ListItem, { type: "purchase" }>) {
    const confirmed = window.confirm(`Cancelar a compra "${item.title}"?`);
    if (!confirmed) return;
    setError("");
    setFeedback("");
    try {
      await cancelCardPurchase(createClient(), item.id);
      setFeedback("Compra cancelada e removida das faturas pendentes.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel cancelar a compra.");
    }
  }

  return (
    <AuthGuard>
      <AppShell title="Lista" subtitle="Registros e faturas">
        {!hasSupabaseConfig() ? <ConfigNotice /> : null}
        {error ? <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        {feedback ? <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{feedback}</p> : null}
        <div className="mb-5 grid gap-2 rounded-lg border border-gray-200 bg-white p-3 md:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-500">Inicio</span>
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm font-semibold" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-500">Fim</span>
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm font-semibold" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-500">Visualizacao</span>
            <select value={viewMode} onChange={(event) => setViewMode(event.target.value)} className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm">
              <option value="purchases">Por compra</option>
              <option value="open-invoices">Faturas em aberto</option>
              <option value="invoice-range">Faturas no periodo</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-500">Tipo</span>
          <select value={type} onChange={(event) => setType(event.target.value)} className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm">
            <option value="all">Todos os tipos</option>
            <option value="entry">Entradas</option>
            <option value="expense">Gastos simples</option>
            <option value="payable">Contas a pagar</option>
            <option value="purchase">Compras no cartao</option>
          </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-500">Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm">
            <option value="all">Todos os status</option>
            <option value="pending">Pendentes</option>
            <option value="paid">Pagos</option>
          </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-500">Cartao</span>
          <select value={card} onChange={(event) => setCard(event.target.value)} className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm">
            <option value="all">Todos os cartoes</option>
            {cards.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-500">Categoria</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm">
            <option value="all">Todas categorias</option>
            {expenseCategories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          </label>
        </div>

        {filtered.length === 0 ? (
          <EmptyState title="Nenhum registro encontrado." actionLabel="Registrar" href="/registrar" />
        ) : (
          <div className="space-y-3">
            {filtered.map((item) => {
              if (item.type === "purchase") {
                return <PurchaseRow key={`purchase-${item.id}`} item={item} onEdit={() => setEditing(item)} onCancel={() => cancelPurchase(item)} />;
              }

              const Icon = (item.type === "expense" || item.type === "payable") && item.status === "paid" ? CheckCircle2 : Circle;
              return (
                <div key={`${item.type}-${item.id}`} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  {item.type === "expense" || item.type === "payable" ? (
                    <button type="button" onClick={() => item.type === "expense" ? toggleExpense(item) : togglePayable(item)} aria-label="Alternar status" title="Alternar status" className="text-gray-800">
                      <Icon size={24} />
                    </button>
                  ) : (
                    <span className="grid size-6 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">E</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{item.title}</p>
                    <p className="text-sm text-gray-500">
                      {labelType(item.type)}
                      {item.type === "expense" || item.type === "payable" ? ` - ${getCategoryLabel(item.category)}` : ""}
                      {" - "}
                      {formatDateBr(item.date)}
                      {item.type === "payable" ? ` - compra em ${formatDateBr(item.purchaseDate)}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${item.type === "entry" ? "text-emerald-600" : "text-gray-950"}`}>{formatCurrency(item.amount)}</p>
                    {item.type === "expense" || item.type === "payable" ? <StatusBadge status={item.status} /> : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {editing ? (
          <EditPurchaseDialog
            item={editing}
            cards={cards}
            onClose={() => setEditing(null)}
            onSaved={async () => {
              setEditing(null);
              setFeedback("Compra atualizada.");
              await load();
            }}
            onError={setError}
          />
        ) : null}
      </AppShell>
    </AuthGuard>
  );
}

function PurchaseRow({ item, onEdit, onCancel }: { item: Extract<ListItem, { type: "purchase" }>; onEdit: () => void; onCancel: () => void }) {
  const purchase = item.purchase;
  const paid = purchase.paid_installments;
  const total = purchase.active_installments || purchase.installments_count;
  const isSingle = purchase.installments_count === 1;
  const subtitle = isSingle
    ? `A vista - ${getCategoryLabel(item.category)} - compra em ${formatDateBr(item.date)}`
    : `Parcelada - ${paid}/${total} parcelas pagas - ${getCategoryLabel(item.category)}`;
  const recurringText = purchase.is_recurring ? ` - Assinatura ${purchase.recurring_status === "active" ? "ativa" : "inativa"}` : "";

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ background: item.card?.color ?? "#3B82F6" }} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{item.title}</p>
          <p className="text-sm text-gray-500">{subtitle}{recurringText}</p>
          {purchase.next_due_date ? <p className="mt-1 text-xs text-gray-500">Proxima fatura: {formatDateBr(purchase.next_due_date)}</p> : null}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700">
              <Edit3 size={14} />
              Editar
            </button>
            <button type="button" onClick={onCancel} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700">
              <XCircle size={14} />
              Cancelar
            </button>
          </div>
        </div>
        <p className="font-bold">{formatCurrency(item.amount)}</p>
      </div>
    </div>
  );
}

function EditPurchaseDialog({
  item,
  cards,
  onClose,
  onSaved,
  onError,
}: {
  item: Extract<ListItem, { type: "purchase" }>;
  cards: Card[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onError: (value: string) => void;
}) {
  const purchase = item.purchase;
  const [description, setDescription] = useState(purchase.description);
  const [cardId, setCardId] = useState(purchase.card_id);
  const [purchaseDate, setPurchaseDate] = useState(isoToBr(purchase.purchase_date));
  const [category, setCategory] = useState<ExpenseCategory>(purchase.category);
  const [installmentAmount, setInstallmentAmount] = useState(String(purchase.installment_amount).replace(".", ","));
  const [installmentsCount, setInstallmentsCount] = useState(String(purchase.installments_count));
  const [startInstallment, setStartInstallment] = useState(String(purchase.start_installment));
  const [isRecurring, setIsRecurring] = useState(purchase.is_recurring);
  const [recurringStatus, setRecurringStatus] = useState<"active" | "inactive">(purchase.recurring_status);
  const [notes, setNotes] = useState(purchase.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const card = cards.find((candidate) => candidate.id === cardId);
    if (!card) {
      onError("Escolha um cartao valido.");
      return;
    }
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(purchaseDate)) {
      onError("Informe a data no formato dd/mm/aaaa.");
      return;
    }

    setSaving(true);
    onError("");
    try {
      await updateCardPurchase(createClient(), purchase.id, {
        card,
        description,
        purchase_date: brToIso(purchaseDate),
        category,
        installment_amount: Number(installmentAmount.replace(/\./g, "").replace(",", ".")),
        installments_count: category === "subscriptions" && isRecurring && recurringStatus === "active" ? 12 : Number(installmentsCount),
        start_installment: Number(startInstallment),
        is_recurring: category === "subscriptions" && isRecurring,
        recurring_status: category === "subscriptions" && isRecurring ? recurringStatus : "inactive",
        notes: notes.trim() || null,
      });
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Nao foi possivel editar a compra.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40 p-4 sm:items-center sm:justify-center">
      <form onSubmit={submit} className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-4 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Editar compra</h2>
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-bold">
            Fechar
          </button>
        </div>
        <div className="space-y-3">
          <EditField label="Descricao" value={description} onChange={setDescription} />
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Cartao</span>
            <select value={cardId} onChange={(event) => setCardId(event.target.value)} className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3">
              {cards.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}
            </select>
          </label>
          <EditField label="Data original" value={purchaseDate} onChange={(value) => setPurchaseDate(maskDateBr(value))} inputMode="numeric" />
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Categoria</span>
            <select
              value={category}
              onChange={(event) => {
                const nextCategory = event.target.value as ExpenseCategory;
                setCategory(nextCategory);
                if (nextCategory !== "subscriptions") {
                  setIsRecurring(false);
                  setRecurringStatus("inactive");
                }
              }}
              className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3"
            >
              {expenseCategories.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          {category === "subscriptions" ? (
            <>
              <label className="flex min-h-12 items-center justify-between rounded-lg border border-gray-200 px-3">
                <span className="text-sm font-medium text-gray-700">Assinatura recorrente</span>
                <input
                  type="checkbox"
                  checked={isRecurring}
                  onChange={(event) => {
                    setIsRecurring(event.target.checked);
                    setRecurringStatus(event.target.checked ? "active" : "inactive");
                    if (event.target.checked) setInstallmentsCount("12");
                  }}
                  className="size-5 accent-gray-950"
                />
              </label>
              {isRecurring ? (
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Status da assinatura</span>
                  <select value={recurringStatus} onChange={(event) => setRecurringStatus(event.target.value as "active" | "inactive")} className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3">
                    <option value="active">Ativa</option>
                    <option value="inactive">Inativa</option>
                  </select>
                </label>
              ) : null}
            </>
          ) : null}
          <EditField label="Valor da parcela" value={installmentAmount} onChange={setInstallmentAmount} inputMode="decimal" />
          <div className="grid grid-cols-2 gap-3">
            <EditField label="Parcelas" value={installmentsCount} onChange={setInstallmentsCount} type="number" />
            <EditField label="Parcela inicial" value={startInstallment} onChange={setStartInstallment} type="number" />
          </div>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Observacao</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <button type="submit" disabled={saving} className="h-12 w-full rounded-lg bg-gray-950 font-bold text-white disabled:opacity-60">
            {saving ? "Salvando..." : "Salvar alteracoes"}
          </button>
        </div>
      </form>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} type={type} inputMode={inputMode} className="h-11 w-full rounded-lg border border-gray-300 px-3" />
    </label>
  );
}

function labelType(type: ListItem["type"]) {
  if (type === "entry") return "Entrada";
  if (type === "expense") return "Gasto";
  if (type === "payable") return "Conta a pagar";
  return "Compra";
}
