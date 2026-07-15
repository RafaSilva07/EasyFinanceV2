"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Edit3, Plus } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { ConfigNotice } from "@/components/layout/ConfigNotice";
import { EmptyState } from "@/components/ui/EmptyState";
import { fetchCards, saveCard } from "@/features/finance/api";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import type { Card } from "@/types/finance";
import { useOperation } from "@/components/providers/OperationProvider";

const schema = z.object({
  name: z.string().min(1, "Informe o nome"),
  issuer: z.string().optional().transform((value) => value?.trim() || null),
  color: z.string().min(1, "Escolha a cor"),
  closing_day: z.coerce.number().int().min(1).max(31),
  due_day: z.coerce.number().int().min(1).max(31),
  is_active: z.boolean(),
});

type FormInput = z.input<typeof schema>;
type FormData = z.output<typeof schema>;

export default function CartoesPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [editing, setEditing] = useState<Card | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const { runMutation, runQuery } = useOperation();
  const form = useForm<FormInput, unknown, FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      issuer: "",
      color: "#7C3AED",
      closing_day: 25,
      due_day: 5,
      is_active: true,
    },
  });

  const load = useCallback(async () => {
    if (!hasSupabaseConfig()) return;
    await runQuery("Carregando cartoes...", async () => {
      setCards(await fetchCards(createClient()));
    });
  }, [runQuery]);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit(card: Card) {
    setEditing(card);
    form.reset({
      name: card.name,
      issuer: card.issuer ?? "",
      color: card.color,
      closing_day: card.closing_day,
      due_day: card.due_day,
      is_active: card.is_active,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(values: FormData) {
    setError("");
    setMessage("");
    try {
      await runMutation(editing ? "Atualizando cartao..." : "Cadastrando cartao...", async () => {
        await saveCard(createClient(), values, editing?.id);
        setMessage(editing ? "Cartao atualizado." : "Cartao cadastrado.");
        setEditing(null);
        form.reset({ name: "", issuer: "", color: "#7C3AED", closing_day: 25, due_day: 5, is_active: true });
        await load();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar cartao.");
    }
  }

  return (
    <AuthGuard>
      <AppShell title="Cartoes" subtitle="Fechamento, vencimento e cor">
        {!hasSupabaseConfig() ? <ConfigNotice /> : null}
        {message ? <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

        <form onSubmit={form.handleSubmit(submit)} className="mb-6 space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">{editing ? "Editar cartao" : "Cadastrar cartao"}</h2>
            {editing ? (
              <button type="button" onClick={() => { setEditing(null); form.reset(); }} className="text-sm font-semibold text-gray-600">
                Cancelar
              </button>
            ) : null}
          </div>
          <TextInput label="Nome do cartao" error={form.formState.errors.name?.message} {...form.register("name")} />
          <TextInput label="Banco/emissor" error={form.formState.errors.issuer?.message} {...form.register("issuer")} />
          <div className="grid grid-cols-[1fr_72px] gap-3">
            <TextInput label="Cor do cartao" error={form.formState.errors.color?.message} {...form.register("color")} />
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Amostra</span>
              <input type="color" {...form.register("color")} className="h-12 w-full rounded-lg border border-gray-300 bg-white p-1" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TextInput label="Fechamento" type="number" min="1" max="31" error={form.formState.errors.closing_day?.message} {...form.register("closing_day")} />
            <TextInput label="Vencimento" type="number" min="1" max="31" error={form.formState.errors.due_day?.message} {...form.register("due_day")} />
          </div>
          <label className="flex min-h-12 items-center justify-between rounded-lg border border-gray-200 px-3">
            <span className="font-medium">Cartao ativo</span>
            <input type="checkbox" {...form.register("is_active")} className="size-5 accent-gray-950" />
          </label>
          <button type="submit" className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-gray-950 font-bold text-white">
            {editing ? <Edit3 size={18} /> : <Plus size={18} />}
            {editing ? "Salvar alteracoes" : "Cadastrar cartao"}
          </button>
        </form>

        {cards.length === 0 ? (
          <EmptyState title="Nenhum cartao cadastrado ainda." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {cards.map((card) => (
              <button key={card.id} type="button" onClick={() => startEdit(card)} className="rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm">
                <div className="mb-4 h-24 rounded-lg p-4 text-white" style={{ background: card.color }}>
                  <p className="text-lg font-bold">{card.name}</p>
                  <p className="text-sm opacity-90">{card.issuer}</p>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Fecha dia {card.closing_day}</span>
                  <span className="text-gray-600">Vence dia {card.due_day}</span>
                  <span className={`font-semibold ${card.is_active ? "text-emerald-600" : "text-gray-500"}`}>{card.is_active ? "Ativo" : "Inativo"}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </AppShell>
    </AuthGuard>
  );
}

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string };

function TextInput({ label, error, ...props }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <input {...props} className="h-12 w-full rounded-lg border border-gray-300 px-3 outline-none focus:border-gray-900" />
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}
    </label>
  );
}
