"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Filter } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { ConfigNotice } from "@/components/layout/ConfigNotice";
import { fetchCashHistory } from "@/features/finance/api";
import { currentMonthRange, formatDateBr } from "@/lib/dates/format";
import { formatCurrency } from "@/lib/money/format";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import type { CashAccount, CashTransaction, CashSourceType, CashTransactionType } from "@/types/finance";

const typeLabels: Record<CashTransactionType, string> = {
  income: "Entrada",
  expense: "Saida",
  transfer_in: "Transferencia recebida",
  transfer_out: "Transferencia enviada",
  reversal: "Estorno",
};

const sourceLabels: Record<CashSourceType, string> = {
  manual: "Manual",
  entry: "Entrada",
  expense: "Gasto simples",
  payable: "Conta a pagar",
  card_invoice: "Fatura de cartao",
  transfer: "Transferencia",
  reversal: "Estorno",
};

const historyFilters = [
  { value: "all", label: "Todos" },
  { value: "income", label: "Entradas" },
  { value: "manual_out", label: "Saida manual / Pix / Debito" },
  { value: "card_invoice", label: "Fatura de cartao" },
  { value: "payable", label: "Conta a pagar" },
  { value: "expense", label: "Gasto simples" },
  { value: "transfer", label: "Transferencia entre contas" },
  { value: "reversal", label: "Estornos" },
];

function resolveHistoryFilter(value: string) {
  if (value === "income") return { type: "income", sourceType: "all" };
  if (value === "manual_out") return { type: "expense", sourceType: "manual" };
  if (value === "card_invoice") return { type: "expense", sourceType: "card_invoice" };
  if (value === "payable") return { type: "expense", sourceType: "payable" };
  if (value === "expense") return { type: "expense", sourceType: "expense" };
  if (value === "transfer") return { type: "all", sourceType: "transfer" };
  if (value === "reversal") return { type: "reversal", sourceType: "all" };
  return { type: "all", sourceType: "all" };
}

export default function CaixaHistoricoPage() {
  const initialRange = currentMonthRange();
  const [startDate, setStartDate] = useState(initialRange.start);
  const [endDate, setEndDate] = useState(initialRange.end);
  const [accountId, setAccountId] = useState("all");
  const [historyType, setHistoryType] = useState("all");
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [transactions, setTransactions] = useState<(CashTransaction & { cash_accounts?: Pick<CashAccount, "name" | "color"> | null })[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!hasSupabaseConfig()) return;
    setLoading(true);
    setError("");
    try {
      const resolvedFilter = resolveHistoryFilter(historyType);
      const data = await fetchCashHistory(createClient(), {
        start: startDate,
        end: endDate,
        accountId,
        type: resolvedFilter.type,
        sourceType: resolvedFilter.sourceType,
      });
      setAccounts(data.accounts);
      setTransactions(data.transactions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel carregar o historico.");
    } finally {
      setLoading(false);
    }
  }, [accountId, endDate, historyType, startDate]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    const income = transactions.filter((item) => Number(item.amount) > 0).reduce((sum, item) => sum + Number(item.amount), 0);
    const outcome = transactions.filter((item) => Number(item.amount) < 0).reduce((sum, item) => sum + Math.abs(Number(item.amount)), 0);
    return { income, outcome, balance: income - outcome };
  }, [transactions]);

  return (
    <AuthGuard>
      <AppShell title="Historico" subtitle="Movimentacoes do caixa">
        {!hasSupabaseConfig() ? <ConfigNotice /> : null}
        <div className="mb-4">
          <Link href="/caixa" className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-700">
            <ArrowLeft size={17} />
            Voltar ao caixa
          </Link>
        </div>
        {error ? <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

        <section className="mb-5 grid grid-cols-3 gap-3">
          <Summary label="Entradas" value={totals.income} tone="green" />
          <Summary label="Saidas" value={totals.outcome} tone="red" />
          <Summary label="Saldo" value={totals.balance} tone={totals.balance >= 0 ? "green" : "red"} />
        </section>

        <section className="mb-5 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
          <div className="mb-3 flex items-center gap-2 font-bold">
            <Filter size={18} />
            Filtros
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-500">Inicio</span>
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-500">Fim</span>
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-500">Conta</span>
              <select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm">
                <option value="all">Todas</option>
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-500">Tipo</span>
              <select value={historyType} onChange={(event) => setHistoryType(event.target.value)} className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm">
                {historyFilters.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 p-4">
            <h2 className="font-bold">Movimentacoes</h2>
            {loading ? <p className="mt-1 text-sm text-gray-500">Atualizando...</p> : null}
          </div>
          {transactions.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">Nenhuma movimentacao encontrada.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {transactions.map((transaction) => (
                <div key={transaction.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{transaction.description}</p>
                    <p className="text-sm text-gray-500">
                      {transaction.cash_accounts?.name ?? "Conta"} - {formatDateBr(transaction.date)}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {typeLabels[transaction.type]}{transaction.source_type ? ` - ${sourceLabels[transaction.source_type]}` : ""}
                    </p>
                  </div>
                  <p className={`shrink-0 font-bold ${Number(transaction.amount) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {formatCurrency(transaction.amount)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </AppShell>
    </AuthGuard>
  );
}

function Summary({ label, value, tone }: { label: string; value: number; tone: "green" | "red" }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-bold ${tone === "green" ? "text-emerald-600" : "text-red-600"}`}>{formatCurrency(value)}</p>
    </div>
  );
}
