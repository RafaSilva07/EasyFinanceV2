"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { ConfigNotice } from "@/components/layout/ConfigNotice";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fetchListData, updateStatus } from "@/features/finance/api";
import { currentMonthValue, formatDateBr } from "@/lib/dates/format";
import { formatCurrency } from "@/lib/money/format";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import type { Card, PaymentStatus } from "@/types/finance";

type ListItem = {
  id: string;
  type: "entry" | "expense" | "installment";
  title: string;
  amount: number;
  date: string;
  status?: PaymentStatus;
  cardId?: string;
  card?: Card | null;
};

export default function ListaPage() {
  const [month, setMonth] = useState(currentMonthValue());
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [card, setCard] = useState("all");
  const [items, setItems] = useState<ListItem[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!hasSupabaseConfig()) return;
    setError("");
    try {
      const data = await fetchListData(createClient(), month);
      setCards(data.cards);
      setItems([
        ...data.entries.map((item) => ({
          id: item.id,
          type: "entry" as const,
          title: item.description,
          amount: Number(item.amount),
          date: item.date,
        })),
        ...data.expenses.map((item) => ({
          id: item.id,
          type: "expense" as const,
          title: item.description,
          amount: Number(item.amount),
          date: item.due_date,
          status: item.status,
        })),
        ...data.installments.map((item) => ({
          id: item.id,
          type: "installment" as const,
          title: `${item.description} ${item.installment_number}/${item.installments_count}`,
          amount: Number(item.amount),
          date: item.due_date,
          status: item.status,
          cardId: item.card_id,
          card: item.cards,
        })),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar lista.");
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (type !== "all" && item.type !== type) return false;
      if (status !== "all" && item.status !== status) return false;
      if (card !== "all" && item.cardId !== card) return false;
      return true;
    });
  }, [items, type, status, card]);

  async function toggle(item: ListItem) {
    if (!item.status || item.type === "entry") return;
    await updateStatus(createClient(), item.type === "expense" ? "expenses" : "card_installments", item.id, item.status === "paid" ? "pending" : "paid");
    await load();
  }

  return (
    <AuthGuard>
      <AppShell title="Lista" subtitle="Registros do mes">
        {!hasSupabaseConfig() ? <ConfigNotice /> : null}
        {error ? <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        <div className="mb-5 grid gap-2 rounded-lg border border-gray-200 bg-white p-3 md:grid-cols-4">
          <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="h-11 rounded-lg border border-gray-300 px-3 text-sm font-semibold" />
          <select value={type} onChange={(event) => setType(event.target.value)} className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm">
            <option value="all">Todos os tipos</option>
            <option value="entry">Entradas</option>
            <option value="expense">Gastos simples</option>
            <option value="installment">Parcelas</option>
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm">
            <option value="all">Todos os status</option>
            <option value="pending">Pendentes</option>
            <option value="paid">Pagos</option>
          </select>
          <select value={card} onChange={(event) => setCard(event.target.value)} className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm">
            <option value="all">Todos os cartoes</option>
            {cards.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>

        {filtered.length === 0 ? (
          <EmptyState title="Nenhum registro encontrado." actionLabel="Registrar" href="/registrar" />
        ) : (
          <div className="space-y-3">
            {filtered.map((item) => {
              const Icon = item.status === "paid" ? CheckCircle2 : Circle;
              return (
                <div key={`${item.type}-${item.id}`} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  {item.status ? (
                    <button type="button" onClick={() => toggle(item)} aria-label="Alternar status" title="Alternar status" className="text-gray-800">
                      <Icon size={24} />
                    </button>
                  ) : (
                    <span className="grid size-6 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">E</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {item.card ? <span className="size-2.5 rounded-full" style={{ background: item.card.color }} /> : null}
                      <p className="truncate font-semibold">{item.title}</p>
                    </div>
                    <p className="text-sm text-gray-500">{labelType(item.type)} - {formatDateBr(item.date)}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${item.type === "entry" ? "text-emerald-600" : "text-gray-950"}`}>{formatCurrency(item.amount)}</p>
                    {item.status ? <StatusBadge status={item.status} /> : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </AppShell>
    </AuthGuard>
  );
}

function labelType(type: ListItem["type"]) {
  if (type === "entry") return "Entrada";
  if (type === "expense") return "Gasto";
  return "Parcela";
}
