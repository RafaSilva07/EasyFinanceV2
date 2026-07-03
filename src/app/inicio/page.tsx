"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Circle, WalletCards } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { ConfigNotice } from "@/components/layout/ConfigNotice";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { currentMonthValue, formatDateBr, monthLabel } from "@/lib/dates/format";
import { expenseCategories, getCategoryLabel, getCategoryMeta } from "@/lib/finance/categories";
import { formatCurrency } from "@/lib/money/format";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { fetchMonthData, updateInvoiceStatus, updateStatus, type MonthData } from "@/features/finance/api";
import type { CardInstallment, Expense, Payable, PaymentStatus } from "@/types/finance";

type CategoryTotal = (typeof expenseCategories)[number] & {
  total: number;
  percent: number;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return "Erro ao carregar dados.";
}

export default function InicioPage() {
  const [month, setMonth] = useState(() => {
    if (typeof window === "undefined") return currentMonthValue();
    const params = new URLSearchParams(window.location.search);
    return params.get("mes") ?? currentMonthValue();
  });
  const [data, setData] = useState<MonthData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCategoryDetails, setShowCategoryDetails] = useState(false);
  const [expandedInvoices, setExpandedInvoices] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    if (!hasSupabaseConfig()) return;
    setLoading(true);
    setError("");
    try {
      setData(await fetchMonthData(createClient(), month));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => {
    const entries = data?.entries.reduce((sum, item) => sum + Number(item.amount), 0) ?? 0;
    const expensePaid = data?.expenses.filter((item) => item.status === "paid").reduce((sum, item) => sum + Number(item.amount), 0) ?? 0;
    const expensePending = data?.expenses.filter((item) => item.status === "pending").reduce((sum, item) => sum + Number(item.amount), 0) ?? 0;
    const payablePaid = data?.payables.filter((item) => item.status === "paid").reduce((sum, item) => sum + Number(item.amount), 0) ?? 0;
    const payablePending = data?.payables.filter((item) => item.status === "pending").reduce((sum, item) => sum + Number(item.amount), 0) ?? 0;
    const cardPaid = data?.invoices
      .filter((invoice) => invoice.status === "paid")
      .reduce((sum, invoice) => sum + invoiceTotal(invoice.card_installments), 0) ?? 0;
    const cardPending = data?.invoices
      .filter((invoice) => invoice.status === "pending")
      .reduce((sum, invoice) => sum + invoiceTotal(invoice.card_installments), 0) ?? 0;
    const paid = expensePaid + payablePaid + cardPaid;
    const pending = expensePending + payablePending + cardPending;
    return { entries, paid, pending, spent: paid + pending, balance: entries - paid - pending };
  }, [data]);

  const categoryTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const category of expenseCategories) totals.set(category.value, 0);

    for (const expense of data?.expenses ?? []) {
      totals.set(expense.category, (totals.get(expense.category) ?? 0) + Number(expense.amount));
    }

    for (const payable of data?.payables ?? []) {
      totals.set(payable.category, (totals.get(payable.category) ?? 0) + Number(payable.amount));
    }

    for (const invoice of data?.invoices ?? []) {
      for (const installment of invoice.card_installments) {
        totals.set(installment.category, (totals.get(installment.category) ?? 0) + Number(installment.amount));
      }
    }

    return expenseCategories
      .map((category) => ({
        ...category,
        total: totals.get(category.value) ?? 0,
        percent: summary.spent > 0 ? ((totals.get(category.value) ?? 0) / summary.spent) * 100 : 0,
      }))
      .filter((category) => category.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [data, summary.spent]);

  function chooseCashAccount() {
    const accounts = data?.cashAccounts.filter((account) => account.is_active) ?? [];
    if (accounts.length === 0) return null;
    const options = accounts.map((account, index) => `${index + 1}. ${account.name} (${formatCurrency(account.balance)})`).join("\n");
    const choice = window.prompt(`Escolha a conta de caixa para baixar o pagamento, ou deixe vazio para nao mexer no caixa:\n${options}`);
    if (!choice) return null;
    const index = Number(choice) - 1;
    return accounts[index]?.id ?? null;
  }

  async function toggle(table: "expenses" | "payables" | "card_installments", id: string, status: PaymentStatus) {
    const nextStatus = status === "paid" ? "pending" : "paid";
    const accountId = nextStatus === "paid" && table !== "card_installments" ? chooseCashAccount() : null;
    await updateStatus(createClient(), table, id, nextStatus, accountId);
    await load();
  }

  async function toggleInvoice(id: string, status: PaymentStatus) {
    const nextStatus = status === "paid" ? "pending" : "paid";
    const accountId = nextStatus === "paid" ? chooseCashAccount() : null;
    await updateInvoiceStatus(createClient(), id, nextStatus, accountId);
    await load();
  }

  function toggleInvoiceDetails(id: string) {
    setExpandedInvoices((current) => ({ ...current, [id]: !current[id] }));
  }

  return (
    <AuthGuard>
      <AppShell title="Inicio" subtitle={monthLabel(month)}>
        {!hasSupabaseConfig() ? <ConfigNotice /> : null}
        <div className="mb-5 flex items-center gap-3">
          <input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="h-12 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold outline-none focus:border-gray-900"
          />
          {loading ? <span className="text-sm text-gray-500">Atualizando...</span> : null}
        </div>
        {error ? <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

        <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
          <SummaryCard label="Entradas" value={summary.entries} tone="green" />
          <SummaryCard label="Gastos" value={summary.spent} tone="red" />
          <SummaryCard label="Ja pago" value={summary.paid} tone="green" />
          <SummaryCard label="Falta pagar" value={summary.pending} tone="amber" />
          <SummaryCard label="Saldo previsto" value={summary.balance} tone={summary.balance >= 0 ? "green" : "red"} wide />
        </section>

        <CategorySummary
          categories={categoryTotals}
          total={summary.spent}
          expanded={showCategoryDetails}
          onToggle={() => setShowCategoryDetails((current) => !current)}
        />

        <section className="space-y-5">
          <div className="flex items-center gap-2">
            <WalletCards size={20} />
            <h2 className="text-lg font-bold">A pagar em {monthLabel(month)}</h2>
          </div>

          {(data?.invoices.length ?? 0) === 0 && (data?.expenses.length ?? 0) === 0 && (data?.payables.length ?? 0) === 0 && (data?.entries.length ?? 0) === 0 ? (
            <EmptyState title="Nenhum registro neste mes." actionLabel="Registrar agora" href="/registrar" />
          ) : null}

          {data?.invoices.map((invoice) => {
            const expanded = Boolean(expandedInvoices[invoice.id]);
            const total = invoiceTotal(invoice.card_installments);
            return (
              <div key={invoice.id} className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => toggleInvoiceDetails(invoice.id)}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="size-3 rounded-full" style={{ background: invoice.cards?.color ?? "#111827" }} />
                      <h3 className="truncate font-bold">{invoice.cards?.name ?? "Cartao"}</h3>
                      <ChevronDown className={`shrink-0 text-gray-500 transition-transform ${expanded ? "rotate-180" : ""}`} size={18} />
                    </div>
                    <p className="mt-1 text-sm text-gray-500">
                      Vence em {formatDateBr(invoice.due_date)} - {invoice.card_installments.length} compra{invoice.card_installments.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-bold text-gray-950">{formatCurrency(total)}</p>
                    <span className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-bold ${invoice.status === "paid" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                      {invoice.status === "paid" ? "Paga" : "Aberta"}
                    </span>
                  </div>
                </button>
                <div className="border-t border-gray-100 px-4 pb-4">
                  <button
                    type="button"
                    onClick={() => toggleInvoice(invoice.id, invoice.status)}
                    className={`mt-3 h-11 w-full rounded-lg text-sm font-bold ${invoice.status === "paid" ? "bg-emerald-100 text-emerald-700" : "bg-gray-950 text-white"}`}
                  >
                    {invoice.status === "paid" ? "Reabrir fatura" : "Pagar fatura"}
                  </button>
                </div>
                {expanded ? (
                  <div className="divide-y divide-gray-100 border-t border-gray-100">
                    {invoice.card_installments.map((item) => (
                      <InvoiceInstallmentRow
                        key={item.id}
                        href={`/compras/${item.card_purchase_id}`}
                        title={`${item.description} ${item.installment_number}/${item.installments_count}`}
                        category={item.category}
                        amount={Number(item.amount)}
                        date={item.due_date}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}

          <GroupedExpenses expenses={data?.expenses ?? []} onToggle={(item) => toggle("expenses", item.id, item.status)} />
          <GroupedPayables payables={data?.payables ?? []} onToggle={(item) => toggle("payables", item.id, item.status)} />

          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 p-4">
              <h3 className="font-bold">Entradas</h3>
            </div>
            {(data?.entries.length ?? 0) === 0 ? (
              <div className="p-4 text-sm text-gray-500">Nenhuma entrada registrada neste mes.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {data?.entries.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-semibold">{entry.description}</p>
                      <p className="text-sm text-gray-500">{formatDateBr(entry.date)}</p>
                    </div>
                    <p className="font-bold text-emerald-600">{formatCurrency(entry.amount)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </AppShell>
    </AuthGuard>
  );
}

function invoiceTotal(installments: CardInstallment[]) {
  return installments.reduce((sum, item) => sum + Number(item.amount), 0);
}

function SummaryCard({ label, value, tone, wide }: { label: string; value: number; tone: "green" | "red" | "amber"; wide?: boolean }) {
  const toneClass = tone === "green" ? "text-emerald-600" : tone === "red" ? "text-red-600" : "text-amber-600";
  return (
    <div className={`rounded-lg border border-gray-200 bg-white p-4 shadow-sm ${wide ? "col-span-2 md:col-span-1" : ""}`}>
      <p className="text-xs font-semibold uppercase text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${toneClass}`}>{formatCurrency(value)}</p>
    </div>
  );
}

function CategorySummary({
  categories,
  total,
  expanded,
  onToggle,
}: {
  categories: CategoryTotal[];
  total: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const maxCategoryTotal = categories[0]?.total ?? 0;
  const topCategories = categories.slice(0, 4);
  const pieGradient = buildPieGradient(categories);

  return (
    <section className="mb-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <button type="button" onClick={onToggle} className="w-full p-4 text-left">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">Gastos por categoria</h2>
            <p className="text-sm text-gray-500">{expanded ? "Detalhes do mes selecionado" : "Toque para ver detalhes"}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-gray-900">{formatCurrency(total)}</p>
            <ChevronDown className={`ml-auto mt-1 text-gray-500 transition-transform ${expanded ? "rotate-180" : ""}`} size={18} />
          </div>
        </div>

        {categories.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum gasto registrado neste mes.</p>
        ) : (
          <div className="flex items-center gap-4">
            <div
              className="grid size-28 shrink-0 place-items-center rounded-full"
              style={{ background: pieGradient }}
              aria-label="Grafico de categorias"
            >
              <div className="grid size-16 place-items-center rounded-full bg-white text-center shadow-sm">
                <span className="text-sm font-bold text-gray-950">{categories[0]?.percent.toFixed(0)}%</span>
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              {topCategories.map((category) => (
                <div key={category.value} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: category.color }} />
                    <span className="truncate font-medium text-gray-700">{category.label}</span>
                  </span>
                  <span className="shrink-0 font-bold text-gray-950">{category.percent.toFixed(0)}%</span>
                </div>
              ))}
              {categories.length > topCategories.length ? (
                <p className="text-xs font-medium text-gray-500">+{categories.length - topCategories.length} categoria{categories.length - topCategories.length === 1 ? "" : "s"}</p>
              ) : null}
            </div>
          </div>
        )}
      </button>

      {expanded && categories.length > 0 ? (
        <div className="space-y-3 border-t border-gray-100 p-4">
          {categories.map((category) => (
            <div key={category.value}>
              <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-gray-700">{category.label}</span>
                <span className="font-bold text-gray-950">{formatCurrency(category.total)} • {category.percent.toFixed(0)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full ${category.barClass}`}
                  style={{ width: `${maxCategoryTotal ? Math.max((category.total / maxCategoryTotal) * 100, 6) : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function buildPieGradient(categories: CategoryTotal[]) {
  if (categories.length === 0) return "#F3F4F6";
  let cursor = 0;
  const segments = categories.map((category) => {
    const start = cursor;
    const end = cursor + category.percent;
    cursor = end;
    return `${category.color} ${start}% ${end}%`;
  });
  return `conic-gradient(${segments.join(", ")})`;
}

function PaymentRow({ title, subtitle, amount, date, status, onToggle }: { title: string; subtitle?: string; amount: number; date: string; status: PaymentStatus; onToggle: () => void }) {
  const Icon = status === "paid" ? CheckCircle2 : Circle;
  return (
    <div className="flex items-center gap-3 p-4">
      <button type="button" onClick={onToggle} aria-label="Alternar status" title="Alternar status" className="text-gray-800">
        <Icon size={24} />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{title}</p>
        <p className="text-sm text-gray-500">{subtitle ? `${subtitle} - ` : ""}{formatDateBr(date)}</p>
      </div>
      <div className="text-right">
        <p className="font-bold">{formatCurrency(amount)}</p>
        <StatusBadge status={status} />
      </div>
    </div>
  );
}

function InvoiceInstallmentRow({ href, title, category, amount, date }: { href: string; title: string; category: CardInstallment["category"]; amount: number; date: string }) {
  const categoryMeta = getCategoryMeta(category);
  return (
    <Link href={href} className="flex items-center gap-3 p-4 transition hover:bg-gray-50 active:bg-gray-100">
      <div className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${categoryMeta.badgeClass}`}>
        {categoryMeta.initial}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{title}</p>
        <p className="text-sm text-gray-500">{categoryMeta.label} - {formatDateBr(date)}</p>
      </div>
      <p className="font-bold">{formatCurrency(amount)}</p>
    </Link>
  );
}

function GroupedExpenses({ expenses, onToggle }: { expenses: Expense[]; onToggle: (expense: Expense) => void }) {
  const labels: Record<string, string> = { pix: "Pix", cash: "Dinheiro", debit: "Debito", boleto: "Boleto", other: "Outro" };
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-100 p-4">
        <h3 className="font-bold">Pix / Dinheiro / Debito / Boleto / Outro</h3>
      </div>
      {expenses.length === 0 ? (
        <div className="p-4 text-sm text-gray-500">Nenhum gasto registrado neste mes.</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {expenses.map((expense) => (
            <PaymentRow
              key={expense.id}
              title={`${expense.description} - ${labels[expense.payment_method]}`}
              subtitle={getCategoryLabel(expense.category)}
              amount={Number(expense.amount)}
              date={expense.due_date}
              status={expense.status}
              onToggle={() => onToggle(expense)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GroupedPayables({ payables, onToggle }: { payables: Payable[]; onToggle: (payable: Payable) => void }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-100 p-4">
        <h3 className="font-bold">Contas a pagar</h3>
      </div>
      {payables.length === 0 ? (
        <div className="p-4 text-sm text-gray-500">Nenhuma conta a pagar neste mes.</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {payables.map((payable) => (
            <PaymentRow
              key={payable.id}
              title={payable.description}
              subtitle={`${getCategoryLabel(payable.category)} - compra em ${formatDateBr(payable.purchase_date)}`}
              amount={Number(payable.amount)}
              date={payable.due_date}
              status={payable.status}
              onToggle={() => onToggle(payable)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
