"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Edit3, Save, Trash2, X } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { ConfigNotice } from "@/components/layout/ConfigNotice";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  cancelCardPurchase,
  fetchCardPurchaseDetails,
  fetchCards,
  updateCardPurchase,
  type CardPurchaseDetails,
} from "@/features/finance/api";
import { formatDateBr } from "@/lib/dates/format";
import { expenseCategories, getCategoryLabel, getCategoryMeta } from "@/lib/finance/categories";
import { formatCurrency } from "@/lib/money/format";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import type { Card, ExpenseCategory } from "@/types/finance";
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

const parseMoney = (value: string) => Number(value.replace(/\./g, "").replace(",", "."));

type PurchaseForm = {
  description: string;
  cardId: string;
  purchaseDate: string;
  category: ExpenseCategory;
  installmentAmount: string;
  installmentsCount: string;
  startInstallment: string;
  isRecurring: boolean;
  recurringStatus: "active" | "inactive";
  notes: string;
};

export default function CompraDetalhePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const purchaseId = params.id;
  const [purchase, setPurchase] = useState<CardPurchaseDetails | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [form, setForm] = useState<PurchaseForm | null>(null);
  const [amountMode, setAmountMode] = useState<"installment" | "total">("installment");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const { runMutation, runQuery } = useOperation();

  const load = useCallback(async () => {
    if (!hasSupabaseConfig() || !purchaseId) return;
    setLoading(true);
    setError("");
    try {
      await runQuery("Carregando compra...", async () => {
        const supabase = createClient();
        const [purchaseData, cardData] = await Promise.all([
          fetchCardPurchaseDetails(supabase, purchaseId),
          fetchCards(supabase),
        ]);
        setPurchase(purchaseData);
        setCards(cardData);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel carregar a compra.");
    } finally {
      setLoading(false);
    }
  }, [purchaseId, runQuery]);

  useEffect(() => {
    load();
  }, [load]);

  const total = useMemo(() => {
    if (!purchase) return 0;
    return Number(purchase.installment_amount) * Number(purchase.installments_count);
  }, [purchase]);

  function startEditing() {
    if (!purchase) return;
    setForm({
      description: purchase.description,
      cardId: purchase.card_id,
      purchaseDate: isoToBr(purchase.purchase_date),
      category: purchase.category,
      installmentAmount: String(purchase.installment_amount).replace(".", ","),
      installmentsCount: String(purchase.installments_count),
      startInstallment: String(purchase.start_installment),
      isRecurring: purchase.is_recurring,
      recurringStatus: purchase.recurring_status,
      notes: purchase.notes ?? "",
    });
    setAmountMode("installment");
    setFeedback("");
    setError("");
    setEditing(true);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!purchase || !form) return;

    const card = cards.find((candidate) => candidate.id === form.cardId);
    const enteredAmount = parseMoney(form.installmentAmount);
    const installmentsCount = Number(form.installmentsCount);
    const startInstallment = Number(form.startInstallment);
    const installmentAmount = amountMode === "total" ? enteredAmount / installmentsCount : enteredAmount;

    if (!card) {
      setError("Escolha um cartao valido.");
      return;
    }
    if (!form.description.trim()) {
      setError("Informe a descricao da compra.");
      return;
    }
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(form.purchaseDate)) {
      setError("Informe a data no formato dd/mm/aaaa.");
      return;
    }
    if (!Number.isFinite(enteredAmount) || enteredAmount <= 0) {
      setError(amountMode === "total" ? "Informe um valor total valido." : "Informe um valor de parcela valido.");
      return;
    }
    if (!Number.isInteger(installmentsCount) || installmentsCount < 1 || !Number.isInteger(startInstallment) || startInstallment < 1 || startInstallment > installmentsCount) {
      setError("Confira a quantidade de parcelas e a parcela inicial.");
      return;
    }

    setSaving(true);
    setError("");
    setFeedback("");
    try {
      await runMutation("Atualizando compra...", async () => {
        await updateCardPurchase(createClient(), purchase.id, {
          card,
          description: form.description.trim(),
          purchase_date: brToIso(form.purchaseDate),
          category: form.category,
          installment_amount: installmentAmount,
          installments_count: installmentsCount,
          start_installment: startInstallment,
          is_recurring: form.category === "subscriptions" && form.isRecurring,
          recurring_status: form.category === "subscriptions" && form.isRecurring ? form.recurringStatus : "inactive",
          notes: form.notes.trim() || null,
        });
        setEditing(false);
        setFeedback("Compra atualizada.");
        await load();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel salvar a compra.");
    } finally {
      setSaving(false);
    }
  }

  async function removePurchase() {
    if (!purchase) return;
    const confirmed = window.confirm(`Excluir a compra "${purchase.description}"? Ela sera removida das faturas pendentes.`);
    if (!confirmed) return;

    setSaving(true);
    setError("");
    setFeedback("");
    try {
      await runMutation("Excluindo compra...", async () => {
        await cancelCardPurchase(createClient(), purchase.id);
        router.push("/lista");
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel excluir a compra.");
      setSaving(false);
    }
  }

  const categoryMeta = getCategoryMeta(purchase?.category);

  return (
    <AuthGuard>
      <AppShell title="Compra" subtitle={purchase?.description ?? "Detalhes"}>
        {!hasSupabaseConfig() ? <ConfigNotice /> : null}
        <div className="mb-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-700"
          >
            <ArrowLeft size={17} />
            Voltar
          </button>
          <Link href="/lista" className="text-sm font-bold text-gray-600">
            Abrir lista
          </Link>
        </div>

        {error ? <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        {feedback ? <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{feedback}</p> : null}
        {loading ? <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">Carregando compra...</p> : null}

        {purchase ? (
          <div className="space-y-4">
            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-2 flex items-center gap-2">
                    <span className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold ${categoryMeta.badgeClass}`}>
                      {categoryMeta.initial}
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-bold">{purchase.description}</h2>
                      <p className="text-sm text-gray-500">{getCategoryLabel(purchase.category)} - compra em {formatDateBr(purchase.purchase_date)}</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-500">
                    {purchase.cards?.name ?? "Cartao"} - {purchase.installments_count === 1 ? "A vista" : `${purchase.paid_installments}/${purchase.active_installments || purchase.installments_count} parcelas pagas`}
                  </p>
                  {purchase.is_recurring ? (
                    <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs font-bold ${purchase.recurring_status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
                      Assinatura {purchase.recurring_status === "active" ? "ativa" : "inativa"}
                    </span>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xl font-bold text-gray-950">{formatCurrency(total)}</p>
                  <p className="text-sm text-gray-500">{formatCurrency(purchase.installment_amount)} por parcela</p>
                </div>
              </div>

              {purchase.notes ? <p className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">{purchase.notes}</p> : null}

              <div className="mt-4 grid grid-cols-2 gap-2 sm:flex">
                <button
                  type="button"
                  onClick={startEditing}
                  disabled={purchase.status === "canceled"}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-bold text-gray-700 disabled:opacity-50"
                >
                  <Edit3 size={16} />
                  Editar
                </button>
                <button
                  type="button"
                  onClick={removePurchase}
                  disabled={saving || purchase.status === "canceled"}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-red-200 px-3 text-sm font-bold text-red-700 disabled:opacity-50"
                >
                  <Trash2 size={16} />
                  Excluir
                </button>
              </div>
            </section>

            {editing && form ? (
              <form onSubmit={submit} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="font-bold">Editar compra</h2>
                  <button type="button" onClick={() => setEditing(false)} className="grid size-9 place-items-center rounded-lg border border-gray-200" aria-label="Fechar edicao">
                    <X size={17} />
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <EditField label="Descricao" value={form.description} onChange={(value) => setForm({ ...form, description: value })} />
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-gray-700">Cartao</span>
                    <select value={form.cardId} onChange={(event) => setForm({ ...form, cardId: event.target.value })} className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3">
                      {cards.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}
                    </select>
                  </label>
                  <EditField label="Data original" value={form.purchaseDate} onChange={(value) => setForm({ ...form, purchaseDate: maskDateBr(value) })} inputMode="numeric" />
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-gray-700">Categoria</span>
                    <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as ExpenseCategory })} className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3">
                      {expenseCategories.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  {form.category === "subscriptions" ? (
                    <>
                      <label className="flex min-h-11 items-center justify-between rounded-lg border border-gray-200 px-3">
                        <span className="text-sm font-medium text-gray-700">Assinatura recorrente</span>
                        <input type="checkbox" checked={form.isRecurring} onChange={(event) => setForm({ ...form, isRecurring: event.target.checked, recurringStatus: event.target.checked ? "active" : "inactive" })} className="size-5 accent-gray-950" />
                      </label>
                      {form.isRecurring ? (
                        <label className="block">
                          <span className="mb-1 block text-sm font-medium text-gray-700">Status da assinatura</span>
                          <select value={form.recurringStatus} onChange={(event) => setForm({ ...form, recurringStatus: event.target.value as "active" | "inactive" })} className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3">
                            <option value="active">Ativa</option>
                            <option value="inactive">Inativa</option>
                          </select>
                        </label>
                      ) : null}
                    </>
                  ) : null}
                  <div className="grid grid-cols-2 rounded-lg border border-gray-200 bg-white p-1 md:col-span-2">
                    <button type="button" onClick={() => setAmountMode("installment")} className={`h-10 rounded-md text-sm font-bold ${amountMode === "installment" ? "bg-gray-950 text-white" : "text-gray-600"}`}>
                      Por parcela
                    </button>
                    <button type="button" onClick={() => setAmountMode("total")} className={`h-10 rounded-md text-sm font-bold ${amountMode === "total" ? "bg-gray-950 text-white" : "text-gray-600"}`}>
                      Valor total
                    </button>
                  </div>
                  <EditField label={amountMode === "installment" ? "Valor da parcela" : "Valor total"} value={form.installmentAmount} onChange={(value) => setForm({ ...form, installmentAmount: value })} inputMode="decimal" />
                  <div className="grid grid-cols-2 gap-3">
                    <EditField label="Parcelas" value={form.installmentsCount} onChange={(value) => setForm({ ...form, installmentsCount: value })} type="number" />
                    <EditField label="Parcela inicial" value={form.startInstallment} onChange={(value) => setForm({ ...form, startInstallment: value })} type="number" />
                  </div>
                  {parseMoney(form.installmentAmount) > 0 ? (
                    <div className="rounded-lg bg-gray-100 p-4 md:col-span-2">
                      <p className="text-sm text-gray-500">{amountMode === "installment" ? "Total calculado" : "Valor por parcela"}</p>
                      <p className="text-xl font-bold">
                        {formatCurrency(amountMode === "installment"
                          ? parseMoney(form.installmentAmount) * Math.max(1, Number(form.installmentsCount) || 1)
                          : parseMoney(form.installmentAmount) / Math.max(1, Number(form.installmentsCount) || 1))}
                      </p>
                    </div>
                  ) : null}
                  <label className="block md:col-span-2">
                    <span className="mb-1 block text-sm font-medium text-gray-700">Observacao</span>
                    <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={3} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
                  </label>
                </div>
                {purchase.has_paid_invoice ? (
                  <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
                    Esta compra tem fatura paga. Para editar, reabra a fatura primeiro.
                  </p>
                ) : null}
                <button type="submit" disabled={saving} className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-gray-950 font-bold text-white disabled:opacity-60 sm:w-auto sm:px-5">
                  <Save size={17} />
                  {saving ? "Salvando..." : "Salvar alteracoes"}
                </button>
              </form>
            ) : null}

            <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 p-4">
                <h2 className="font-bold">Parcelas e faturas</h2>
                <p className="text-sm text-gray-500">O pagamento acontece pela fatura do cartao.</p>
              </div>
              <div className="divide-y divide-gray-100">
                {purchase.card_installments.length === 0 ? (
                  <p className="p-4 text-sm text-gray-500">Nenhuma parcela ativa nesta compra.</p>
                ) : (
                  purchase.card_installments.map((installment) => (
                    <div key={installment.id} className="flex items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="font-semibold">Parcela {installment.installment_number}/{installment.installments_count}</p>
                        <p className="text-sm text-gray-500">Fatura vence em {formatDateBr(installment.due_date)}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-bold">{formatCurrency(installment.amount)}</p>
                        <StatusBadge status={installment.card_invoices?.status ?? installment.status} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        ) : !loading ? (
          <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">Compra nao encontrada.</p>
        ) : null}
      </AppShell>
    </AuthGuard>
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
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        inputMode={inputMode}
        className="h-11 w-full rounded-lg border border-gray-300 px-3"
      />
    </label>
  );
}
