"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";

const schema = z.object({
  email: z.email("Informe um e-mail valido"),
  password: z.string().min(1, "Informe a senha"),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { register, handleSubmit, formState } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(values: FormData) {
    setError("");
    if (!hasSupabaseConfig()) {
      setError("Configure as variaveis do Supabase em .env.local.");
      return;
    }
    setLoading(true);
    const { error: signInError } = await createClient().auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });
    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.push("/inicio");
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-[#F3F4F6] px-4 py-8">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
      >
        <div className="mb-6">
          <p className="text-sm font-semibold text-gray-500">Meu Controle Financeiro</p>
          <h1 className="text-2xl font-bold text-gray-950">Entrar</h1>
        </div>
        <label className="mb-4 block">
          <span className="mb-1 block text-sm font-medium text-gray-700">E-mail</span>
          <input
            {...register("email")}
            type="email"
            className="h-12 w-full rounded-lg border border-gray-300 px-3 outline-none focus:border-gray-900"
          />
          <span className="mt-1 block text-xs text-red-600">{formState.errors.email?.message}</span>
        </label>
        <label className="mb-4 block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Senha</span>
          <div className="relative">
            <input
              {...register("password")}
              type={showPassword ? "text" : "password"}
              className="h-12 w-full rounded-lg border border-gray-300 px-3 pr-12 outline-none focus:border-gray-900"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Ocultar senha" : "Visualizar senha"}
              title={showPassword ? "Ocultar senha" : "Visualizar senha"}
              className="absolute inset-y-0 right-0 grid w-12 place-items-center text-gray-500"
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          <span className="mt-1 block text-xs text-red-600">{formState.errors.password?.message}</span>
        </label>
        {error ? <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-gray-950 font-semibold text-white disabled:opacity-60"
        >
          <LogIn size={18} />
          {loading ? "Entrando..." : "Entrar"}
        </button>
        <p className="mt-5 text-center text-sm text-gray-600">
          Ainda nao tem conta?{" "}
          <Link href="/cadastro" className="font-semibold text-gray-950">
            Criar conta
          </Link>
        </p>
      </form>
    </main>
  );
}
