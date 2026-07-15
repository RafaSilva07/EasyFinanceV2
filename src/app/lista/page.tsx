"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Circle, Edit3, Trash2, XCircle } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { ConfigNotice } from "@/components/layout/ConfigNotice";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PaymentAccountDialog, type PaymentRequest } from "@/components/finance/PaymentAccountDialog";
import {
  cancelCardPurchase,
  deleteEntry,
  deleteExpense,
  deletePayable,
  fetchListData,
  payWithCash,
  updateCardPurchase,
  updateEntry,
  updateExpense,
  updatePayable,
  updatePayableGroup,
  updateStatus,
  type FinanceListRecord,
} from "@/features/finance/api";
import { currentMonthRange, formatDateBr } from "@/lib/dates/format";
import { expenseCategories, getCategoryLabel } from "@/lib/finance/categories";
import { formatCurrency } from "@/lib/money/format";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import type { Card, CardPurchaseWithProgress, CashAccountWithBalance, EntryWithCashAccount, Expense, ExpenseCategory, Payable, PaymentMethod, PaymentStatus } from "@/types/finance";
import { useOperation } from "@/components/providers/OperationProvider";

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

const parsedPreviewAmount = (value: string) => {
  const parsed = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};

type ListItem =
  | {
      id: string;
      type: "entry";
      title: string;
      amount: number;
      date: string;
      entry: EntryWithCashAccount;
    }
  | {
      id: string;
      type: "expense";
      title: string;
      amount: number;
      date: string;
      status: PaymentStatus;
      category: ExpenseCategory;
      expense: Expense;
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
      payable: Payable;
      payables: Payable[];
      paidInstallments: number;
      totalInstallments: number;
      firstDueDate: string;
      lastPaidText: string | null;
      nextDueText: string | null;
      nextDueDate: string | null;
      lastDueDate: string;
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
      lastPaidText: string | null;
      nextDueText: string | null;
    };

type EditableRecord = Extract<ListItem, { type: "entry" }> | Extract<ListItem, { type: "expense" }> | Extract<ListItem, { type: "payable" }>;
type SortMode = "date-desc" | "date-asc" | "due-asc" | "amount-desc" | "amount-asc" | "pending-first" | "category-asc" | "type-asc";

const paymentMethodOptions: { value: PaymentMethod; label: string }[] = [
  { value: "pix", label: "Pix" },
  { value: "cash", label: "Dinheiro" },
  { value: "debit", label: "Debito" },
  { value: "boleto", label: "Boleto" },
  { value: "other", label: "Outro" },
];

const sortOptions: { value: SortMode; label: string }[] = [
  { value: "date-desc", label: "Data mais recente" },
  { value: "date-asc", label: "Data mais antiga" },
  { value: "due-asc", label: "Vencimento mais proximo" },
  { value: "amount-desc", label: "Valor maior" },
  { value: "amount-asc", label: "Valor menor" },
  { value: "pending-first", label: "Pendentes primeiro" },
  { value: "category-asc", label: "Categoria A-Z" },
  { value: "type-asc", label: "Tipo de registro" },
];

const pageSizeOptions = [10, 20, 50];

function getPurchaseInstallments(purchase: CardPurchaseWithProgress) {
  return ((purchase as CardPurchaseWithProgress & {
    card_installments?: Array<{
      installment_number: number;
      installments_count: number;
      due_date: string;
      card_invoices?: { status?: PaymentStatus } | null;
      status?: PaymentStatus;
    }>;
  }).card_installments ?? []).slice().sort((a, b) => a.installment_number - b.installment_number);
}

function recordToListItem(record: FinanceListRecord): ListItem | null {
  if (record.type === "entry" && record.payload.entry) {
    return { id: record.id, type: "entry", title: record.title, amount: Number(record.amount), date: record.date, entry: record.payload.entry };
  }
  if (record.type === "expense" && record.payload.expense) {
    const expense = record.payload.expense;
    return { id: record.id, type: "expense", title: record.title, amount: Number(record.amount), date: record.date, status: expense.status, category: expense.category, expense };
  }
  if (record.type === "payable" && record.payload.payables?.length) {
    const payables = record.payload.payables.slice().sort((a, b) => a.installment_number - b.installment_number || a.due_date.localeCompare(b.due_date));
    const pending = payables.filter((item) => item.status === "pending").sort((a, b) => a.due_date.localeCompare(b.due_date));
    const lastPaid = payables.filter((item) => item.status === "paid").sort((a, b) => b.installment_number - a.installment_number)[0];
    const representative = pending[0] ?? payables[0];
    const nextDue = pending[0] ?? null;
    return {
      id: record.id,
      type: "payable",
      title: record.title,
      amount: Number(record.amount),
      date: record.date,
      purchaseDate: record.payload.purchase_date ?? representative.purchase_date,
      status: record.status,
      category: representative.category,
      payable: representative,
      payables,
      paidInstallments: Number(record.payload.paid_installments ?? 0),
      totalInstallments: Number(record.payload.total_installments ?? payables.length),
      firstDueDate: record.payload.first_due_date ?? payables[0].due_date,
      lastPaidText: lastPaid ? `${lastPaid.installment_number}/${lastPaid.installments_count} paga em ${formatDateBr(lastPaid.due_date)}` : null,
      nextDueText: nextDue ? `${nextDue.installment_number}/${nextDue.installments_count} vence em ${formatDateBr(nextDue.due_date)}` : null,
      nextDueDate: record.payload.next_due_date ?? null,
      lastDueDate: record.payload.last_due_date ?? payables[payables.length - 1].due_date,
    };
  }
  if (record.type === "purchase" && record.payload.purchase) {
    const purchase = record.payload.purchase;
    const installments = getPurchaseInstallments(purchase);
    const lastPaid = installments.filter((item) => item.card_invoices?.status === "paid").sort((a, b) => b.installment_number - a.installment_number)[0];
    const nextDue = installments.filter((item) => item.card_invoices?.status !== "paid").sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
    return {
      id: record.id,
      type: "purchase",
      purchase,
      title: record.title,
      amount: Number(record.amount),
      date: record.date,
      category: purchase.category,
      cardId: purchase.card_id,
      card: purchase.cards,
      hasOpenInvoice: purchase.active_installments > purchase.paid_installments,
      hasOpenInvoiceInRange: Boolean(purchase.open_installments_in_range?.length),
      hasInvoiceInRange: Boolean(purchase.installments_in_range?.length),
      lastPaidText: lastPaid ? `${lastPaid.installment_number}/${lastPaid.installments_count} paga em fatura ${formatDateBr(lastPaid.due_date)}` : null,
      nextDueText: nextDue ? `${nextDue.installment_number}/${nextDue.installments_count} vence em ${formatDateBr(nextDue.due_date)}` : null,
    };
  }
  return null;
}

export default function ListaPage() {
  const initialRange = currentMonthRange();
  const [startDate, setStartDate] = useState(initialRange.start);
  const [endDate, setEndDate] = useState(initialRange.end);
  const [periodMode, setPeriodMode] = useState<"none" | "range">("none");
  const [viewMode, setViewMode] = useState("purchases");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [card, setCard] = useState("all");
  const [category, setCategory] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("date-desc");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ListItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [cards, setCards] = useState<Card[]>([]);
  const [cashAccounts, setCashAccounts] = useState<CashAccountWithBalance[]>([]);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [editing, setEditing] = useState<Extract<ListItem, { type: "purchase" }> | null>(null);
  const [editingRecord, setEditingRecord] = useState<EditableRecord | null>(null);
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);
  const requestIdRef = useRef(0);
  const { runMutation, runQuery } = useOperation();

  const load = useCallback(async () => {
    if (!hasSupabaseConfig()) return;
    setError("");
    const requestId = ++requestIdRef.current;
    try {
      const activeRange = periodMode === "range" ? { start: startDate, end: endDate } : undefined;
      await runQuery("Carregando lista...", async () => {
        const data = await fetchListData(createClient(), {
          range: activeRange,
          viewMode,
          type,
          status,
          card,
          category,
          sort: sortMode,
          page,
          pageSize,
        });
        if (requestId !== requestIdRef.current) return;
        setCards(data.cards);
        setCashAccounts(data.cashAccounts);
        setItems(data.items.map(recordToListItem).filter((item): item is ListItem => item !== null));
        setTotalItems(data.total);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar lista.");
    }
  }, [card, category, endDate, page, pageSize, periodMode, runQuery, sortMode, startDate, status, type, viewMode]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageStart = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const pageEnd = Math.min(safePage * pageSize, totalItems);

  useEffect(() => {
    setPage(1);
  }, [periodMode, startDate, endDate, type, status, card, category, viewMode, sortMode, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  async function toggleExpense(item: Extract<ListItem, { type: "expense" }>) {
    if (item.status === "pending") {
      setPaymentRequest({ sourceType: "expense", sourceIds: [item.id], description: item.title, amount: item.amount });
      return;
    }
    await runMutation("Reabrindo pagamento...", async () => {
      await updateStatus(createClient(), "expenses", item.id, "pending");
      await load();
    });
  }

  async function togglePayable(item: Extract<ListItem, { type: "payable" }>) {
    if (item.status === "pending") {
      const pending = item.payables.filter((payable) => payable.status === "pending");
      setPaymentRequest({
        sourceType: "payable",
        sourceIds: pending.map((payable) => payable.id),
        description: item.title,
        amount: pending.reduce((sum, payable) => sum + Number(payable.amount), 0),
      });
      return;
    }
    await runMutation("Reabrindo conta a pagar...", async () => {
      await Promise.all(item.payables.map((payable) => updateStatus(createClient(), "payables", payable.id, "pending")));
      await load();
    });
  }

  async function confirmPayment(accountId: string | null) {
    if (!paymentRequest) return;
    await runMutation(accountId ? "Processando pagamento..." : "Registrando pagamento externo...", async () => {
      await payWithCash(createClient(), { sourceType: paymentRequest.sourceType, sourceIds: paymentRequest.sourceIds, accountId });
      setPaymentRequest(null);
      setFeedback(accountId ? "Pagamento registrado no caixa." : "Pagamento externo registrado.");
      await load();
    });
  }

  async function cancelPurchase(item: Extract<ListItem, { type: "purchase" }>) {
    const confirmed = window.confirm(`Cancelar a compra "${item.title}"?`);
    if (!confirmed) return;
    setError("");
    setFeedback("");
    try {
      await runMutation("Cancelando compra...", async () => {
        await cancelCardPurchase(createClient(), item.id);
        setFeedback("Compra cancelada e removida das faturas pendentes.");
        await load();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel cancelar a compra.");
    }
  }

  async function deleteRecord(item: EditableRecord) {
    const confirmed = window.confirm(item.type === "payable" && item.payables.length > 1 ? `Excluir todas as parcelas de "${item.title}"?` : `Excluir "${item.title}"?`);
    if (!confirmed) return;
    setError("");
    setFeedback("");
    try {
      await runMutation("Excluindo registro...", async () => {
        if (item.type === "entry") {
          await deleteEntry(createClient(), item.id);
          setFeedback("Entrada excluida.");
        } else if (item.type === "expense") {
          await deleteExpense(createClient(), item.id);
          setFeedback("Gasto excluido.");
        } else {
          await Promise.all(item.payables.map((payable) => deletePayable(createClient(), payable.id)));
          setFeedback(item.payables.length > 1 ? "Conta parcelada excluida." : "Conta a pagar excluida.");
        }
        await load();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel excluir o registro.");
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
            <span className="mb-1 block text-xs font-semibold text-gray-500">Prazo</span>
            <select value={periodMode} onChange={(event) => setPeriodMode(event.target.value as "none" | "range")} className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm">
              <option value="none">Sem prazo</option>
              <option value="range">Filtrar por periodo</option>
            </select>
          </label>
          {periodMode === "range" ? <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-500">Inicio</span>
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm font-semibold" />
          </label> : null}
          {periodMode === "range" ? <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-500">Fim</span>
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm font-semibold" />
          </label> : null}
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
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-500">Ordenar por</span>
            <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm">
              {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-500">Itens por pagina</span>
            <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm">
              {pageSizeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        </div>

        {items.length === 0 ? (
          <EmptyState title="Nenhum registro encontrado." actionLabel="Registrar" href="/registrar" />
        ) : (
          <>
          <div className="mb-3 flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between">
            <span>Mostrando {pageStart}-{pageEnd} de {totalItems}</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={safePage <= 1} className="rounded-lg border border-gray-200 px-3 py-2 font-bold text-gray-700 disabled:opacity-50">
                Anterior
              </button>
              <span className="font-semibold text-gray-900">{safePage}/{totalPages}</span>
              <button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={safePage >= totalPages} className="rounded-lg border border-gray-200 px-3 py-2 font-bold text-gray-700 disabled:opacity-50">
                Proxima
              </button>
            </div>
          </div>
          <div className="space-y-3">
            {items.map((item) => {
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
                      {item.type === "payable" && item.totalInstallments > 1 ? ` - ${item.paidInstallments}/${item.totalInstallments} parcelas pagas` : ""}
                      {" - "}
                      {formatDateBr(item.date)}
                      {item.type === "payable" ? ` - compra em ${formatDateBr(item.purchaseDate)}` : ""}
                    </p>
                    {item.type === "entry" ? (
                      <p className={`mt-1 text-xs ${item.entry.cash_transactions?.cash_accounts ? "text-emerald-700" : "text-amber-700"}`}>
                        {item.entry.cash_transactions?.cash_accounts?.name ?? "Entrada ainda nao vinculada ao caixa"}
                      </p>
                    ) : null}
                    {item.type === "payable" && item.totalInstallments > 1 && item.lastPaidText ? <p className="mt-1 text-xs text-emerald-700">Ultima paga: {item.lastPaidText}</p> : null}
                    {item.type === "payable" && item.totalInstallments > 1 && item.nextDueText ? <p className="mt-1 text-xs text-amber-700">Proxima a pagar: {item.nextDueText}</p> : null}
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${item.type === "entry" ? "text-emerald-600" : "text-gray-950"}`}>{formatCurrency(item.amount)}</p>
                    {item.type === "expense" || item.type === "payable" ? <StatusBadge status={item.status} /> : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => setEditingRecord(item)} aria-label="Editar registro" title="Editar" className="rounded-lg border border-gray-200 p-2 text-gray-700">
                      <Edit3 size={16} />
                    </button>
                    <button type="button" onClick={() => deleteRecord(item)} aria-label="Excluir registro" title="Excluir" className="rounded-lg border border-red-200 p-2 text-red-700">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          </>
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
        {editingRecord ? (
          <EditRecordDialog
            item={editingRecord}
            cashAccounts={cashAccounts}
            onClose={() => setEditingRecord(null)}
            onSaved={async () => {
              setEditingRecord(null);
              setFeedback("Registro atualizado.");
              await load();
            }}
            onError={setError}
          />
        ) : null}
        {paymentRequest ? (
          <PaymentAccountDialog
            request={paymentRequest}
            accounts={cashAccounts}
            onClose={() => setPaymentRequest(null)}
            onConfirm={confirmPayment}
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
    : `Parcelada - ${paid}/${total} parcelas pagas - ${total} parcelas no total - ${getCategoryLabel(item.category)}`;
  const recurringText = purchase.is_recurring ? ` - Assinatura ${purchase.recurring_status === "active" ? "ativa" : "inativa"}` : "";

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ background: item.card?.color ?? "#3B82F6" }} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{item.title}</p>
          <p className="text-sm text-gray-500">{subtitle}{recurringText}</p>
          {!isSingle && item.lastPaidText ? <p className="mt-1 text-xs text-emerald-700">Ultima paga: {item.lastPaidText}</p> : null}
          {!isSingle && item.nextDueText ? <p className="mt-1 text-xs text-amber-700">Proxima a pagar: {item.nextDueText}</p> : null}
          {isSingle && purchase.next_due_date ? <p className="mt-1 text-xs text-gray-500">Proxima fatura: {formatDateBr(purchase.next_due_date)}</p> : null}
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
  const { runMutation } = useOperation();
  const purchase = item.purchase;
  const [description, setDescription] = useState(purchase.description);
  const [cardId, setCardId] = useState(purchase.card_id);
  const [purchaseDate, setPurchaseDate] = useState(isoToBr(purchase.purchase_date));
  const [category, setCategory] = useState<ExpenseCategory>(purchase.category);
  const [amountMode, setAmountMode] = useState<"installment" | "total">("installment");
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
      const effectiveInstallmentsCount = category === "subscriptions" && isRecurring && recurringStatus === "active" ? 12 : Number(installmentsCount);
      const parsedAmount = Number(installmentAmount.replace(/\./g, "").replace(",", "."));
      await runMutation("Atualizando compra...", async () => {
        await updateCardPurchase(createClient(), purchase.id, {
          card,
          description,
          purchase_date: brToIso(purchaseDate),
          category,
          installment_amount: amountMode === "total" ? parsedAmount / effectiveInstallmentsCount : parsedAmount,
          installments_count: effectiveInstallmentsCount,
          start_installment: Number(startInstallment),
          is_recurring: category === "subscriptions" && isRecurring,
          recurring_status: category === "subscriptions" && isRecurring ? recurringStatus : "inactive",
          notes: notes.trim() || null,
        });
        await onSaved();
      });
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
          <div className="grid grid-cols-2 rounded-lg border border-gray-200 bg-white p-1">
            <button type="button" onClick={() => setAmountMode("installment")} className={`h-10 rounded-md text-sm font-bold ${amountMode === "installment" ? "bg-gray-950 text-white" : "text-gray-600"}`}>
              Por parcela
            </button>
            <button type="button" onClick={() => setAmountMode("total")} className={`h-10 rounded-md text-sm font-bold ${amountMode === "total" ? "bg-gray-950 text-white" : "text-gray-600"}`}>
              Valor total
            </button>
          </div>
          <EditField label={amountMode === "installment" ? "Valor da parcela" : "Valor total"} value={installmentAmount} onChange={setInstallmentAmount} inputMode="decimal" />
          <div className="grid grid-cols-2 gap-3">
            <EditField label="Parcelas" value={installmentsCount} onChange={setInstallmentsCount} type="number" />
            <EditField label="Parcela inicial" value={startInstallment} onChange={setStartInstallment} type="number" />
          </div>
          {parsedPreviewAmount(installmentAmount) > 0 ? (
            <div className="rounded-lg bg-gray-100 p-4">
              <p className="text-sm text-gray-500">{amountMode === "installment" ? "Total calculado" : "Valor por parcela"}</p>
              <p className="text-xl font-bold">
                {formatCurrency(amountMode === "installment"
                  ? parsedPreviewAmount(installmentAmount) * Math.max(1, Number(installmentsCount) || 1)
                  : parsedPreviewAmount(installmentAmount) / Math.max(1, Number(installmentsCount) || 1))}
              </p>
            </div>
          ) : null}
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

function EditRecordDialog({
  item,
  cashAccounts,
  onClose,
  onSaved,
  onError,
}: {
  item: EditableRecord;
  cashAccounts: CashAccountWithBalance[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onError: (value: string) => void;
}) {
  const { runMutation } = useOperation();
  const [description, setDescription] = useState(item.title.replace(/\s\d+\/\d+$/, ""));
  const [amount, setAmount] = useState(String(item.amount).replace(".", ","));
  const [date, setDate] = useState(isoToBr(item.type === "payable" ? item.firstDueDate : item.date));
  const [purchaseDate, setPurchaseDate] = useState(item.type === "payable" ? isoToBr(item.purchaseDate) : "");
  const [installmentsCount, setInstallmentsCount] = useState(item.type === "payable" ? String(item.totalInstallments) : "1");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(item.type === "expense" ? item.expense.payment_method : "pix");
  const [category, setCategory] = useState<ExpenseCategory>(item.type === "entry" ? "other" : item.category);
  const [status, setStatus] = useState<PaymentStatus>(item.type === "entry" ? "paid" : item.status);
  const [cashAccountId, setCashAccountId] = useState(
    item.type === "entry" ? item.entry.cash_transactions?.account_id ?? "" : "",
  );
  const [notes, setNotes] = useState(
    item.type === "entry" ? item.entry.notes ?? "" : item.type === "expense" ? item.expense.notes ?? "" : item.payable.notes ?? "",
  );
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onError("");

    if (!description.trim()) {
      onError("Informe uma descricao.");
      return;
    }
    if (item.type === "entry" && !cashAccountId) {
      onError("Escolha a conta de destino da entrada.");
      return;
    }
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(date) || (item.type === "payable" && !/^\d{2}\/\d{2}\/\d{4}$/.test(purchaseDate))) {
      onError("Informe as datas no formato dd/mm/aaaa.");
      return;
    }

    const parsedAmount = Number(amount.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      onError("Informe um valor valido.");
      return;
    }

    const parsedInstallments = Number(installmentsCount);
    if (item.type === "payable" && (!Number.isInteger(parsedInstallments) || parsedInstallments < 1)) {
      onError("Informe uma quantidade de parcelas valida.");
      return;
    }

    setSaving(true);
    try {
      await runMutation("Salvando alteracoes...", async () => {
        if (item.type === "entry") {
          await updateEntry(createClient(), item.id, {
            description: description.trim(),
            amount: parsedAmount,
            date: brToIso(date),
            cash_account_id: cashAccountId,
            notes: notes.trim() || null,
          });
        } else if (item.type === "expense") {
          await updateExpense(createClient(), item.id, {
            description: description.trim(),
            amount: parsedAmount,
            due_date: brToIso(date),
            payment_method: paymentMethod,
            category,
            status,
            notes: notes.trim() || null,
          });
        } else if (item.payables.length > 1 || parsedInstallments > 1) {
          await updatePayableGroup(createClient(), item.payable.payable_group_id, {
            description: description.trim(),
            amount: parsedAmount,
            purchase_date: brToIso(purchaseDate),
            due_date: brToIso(date),
            category,
            status,
            installments_count: parsedInstallments,
            notes: notes.trim() || null,
          });
        } else {
          await updatePayable(createClient(), item.payable.id, {
            description: description.trim(),
            amount: parsedAmount,
            purchase_date: brToIso(purchaseDate),
            due_date: brToIso(date),
            category,
            status,
            notes: notes.trim() || null,
          });
        }
        await onSaved();
      });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Nao foi possivel editar o registro.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40 p-4 sm:items-center sm:justify-center">
      <form onSubmit={submit} className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-4 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Editar {labelType(item.type).toLowerCase()}</h2>
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-bold">
            Fechar
          </button>
        </div>
        <div className="space-y-3">
          <EditField label="Descricao" value={description} onChange={setDescription} />
          <EditField label={item.type === "payable" ? "Valor total" : "Valor"} value={amount} onChange={setAmount} inputMode="decimal" />
          {item.type === "payable" ? (
            <EditField label="Data da compra" value={purchaseDate} onChange={(value) => setPurchaseDate(maskDateBr(value))} inputMode="numeric" />
          ) : null}
          <EditField label={item.type === "entry" ? "Data" : item.type === "payable" ? "Vencimento da primeira parcela" : "Vencimento"} value={date} onChange={(value) => setDate(maskDateBr(value))} inputMode="numeric" />
          {item.type === "entry" ? (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Conta de destino</span>
              <select value={cashAccountId} onChange={(event) => setCashAccountId(event.target.value)} className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3">
                <option value="">Escolha uma conta</option>
                {cashAccounts.filter((account) => account.is_active).map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
              {cashAccounts.every((account) => !account.is_active) ? (
                <a href="/caixa" className="mt-2 inline-block text-sm font-bold text-gray-900 underline">Criar conta no Caixa</a>
              ) : null}
            </label>
          ) : null}
          {item.type === "payable" ? (
            <>
              <EditField label="Quantidade de parcelas" value={installmentsCount} onChange={setInstallmentsCount} type="number" />
              {Number(installmentsCount) > 1 ? (
                <div className="rounded-lg bg-gray-100 p-4">
                  <p className="text-sm text-gray-500">Valor aproximado da parcela</p>
                  <p className="text-xl font-bold">{formatCurrency(parsedPreviewAmount(amount) / Math.max(1, Number(installmentsCount) || 1))}</p>
                </div>
              ) : null}
              {item.paidInstallments > 0 ? (
                <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                  Esta conta tem parcela paga. Para alterar quantidade, valor ou vencimentos das parcelas, reabra/remova a baixa primeiro.
                </p>
              ) : null}
            </>
          ) : null}
          {item.type === "expense" ? (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Forma de pagamento</span>
              <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)} className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3">
                {paymentMethodOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          ) : null}
          {item.type !== "entry" ? (
            <>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">Categoria</span>
                <select value={category} onChange={(event) => setCategory(event.target.value as ExpenseCategory)} className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3">
                  {expenseCategories.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">Status</span>
                <select value={status} onChange={(event) => setStatus(event.target.value as PaymentStatus)} className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3">
                  <option value="pending">Pendente</option>
                  {item.status === "paid" ? <option value="paid">Pago</option> : null}
                </select>
                {item.status === "pending" ? <span className="mt-1 block text-xs text-gray-500">Use a acao Pagar para escolher a conta de saida.</span> : null}
              </label>
            </>
          ) : null}
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
