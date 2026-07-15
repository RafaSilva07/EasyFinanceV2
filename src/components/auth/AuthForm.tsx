"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, useWatch, type UseFormRegisterReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, LogIn, UserPlus } from "lucide-react";
import { LoginMascotRive } from "@/components/auth/LoginMascotRive";
import { loginSchema, signupSchema, type LoginFormData, type SignupFormData } from "@/lib/auth/validation";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { useOperation } from "@/components/providers/OperationProvider";

type Mode = "login" | "signup";

export function AuthForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { runMutation } = useOperation();
  const [mode, setMode] = useState<Mode>(params.get("modo") === "cadastro" ? "signup" : "login");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEmailFocused, setIsEmailFocused] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [pointerLook, setPointerLook] = useState(0);

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const signupForm = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: "", password: "", confirmPassword: "" },
  });

  const loginEmail = useWatch({ control: loginForm.control, name: "email" }) ?? "";
  const signupEmail = useWatch({ control: signupForm.control, name: "email" }) ?? "";
  const emailValue = mode === "login" ? loginEmail : signupEmail;
  const emailRegistration = mode === "login" ? loginForm.register("email") : signupForm.register("email");
  const passwordRegistration = mode === "login" ? loginForm.register("password") : signupForm.register("password");
  const emailError = mode === "login" ? loginForm.formState.errors.email?.message : signupForm.formState.errors.email?.message;
  const passwordError = mode === "login" ? loginForm.formState.errors.password?.message : signupForm.formState.errors.password?.message;

  useEffect(() => {
    setError("");
    setSuccess(false);
    setShowPassword(false);
    setShowConfirmPassword(false);
  }, [mode]);

  async function finishSuccess() {
    setSuccess(true);
    window.setTimeout(() => router.push("/app"), 450);
  }

  async function submitLogin(values: LoginFormData) {
    setError("");
    setSuccess(false);
    if (!hasSupabaseConfig()) {
      setError("Configure as variaveis do Supabase em .env.local.");
      return;
    }

    setIsSubmitting(true);
    const { error: signInError } = await runMutation("Entrando...", () => createClient().auth.signInWithPassword({
      email: values.email,
      password: values.password,
    }));
    setIsSubmitting(false);

    if (signInError) {
      setError("E-mail ou senha invalidos.");
      return;
    }

    await finishSuccess();
  }

  async function submitSignup(values: SignupFormData) {
    setError("");
    setSuccess(false);
    if (!hasSupabaseConfig()) {
      setError("Configure as variaveis do Supabase em .env.local.");
      return;
    }

    setIsSubmitting(true);
    const { data, error: signUpError } = await runMutation("Criando conta...", () => createClient().auth.signUp({
      email: values.email,
      password: values.password,
    }));

    if (signUpError) {
      setIsSubmitting(false);
      setError("Nao foi possivel criar sua conta. Tente novamente.");
      return;
    }

    if (!data.session) {
      setIsSubmitting(false);
      setError(
        "Conta criada. Verifique as configuracoes de autenticacao no Supabase para permitir acesso sem confirmacao por e-mail.",
      );
      return;
    }

    setIsSubmitting(false);
    await finishSuccess();
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-gray-100 px-4 py-6">
      <section
        className="w-full max-w-md"
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const center = rect.left + rect.width / 2;
          const normalized = (event.clientX - center) / (rect.width / 2);
          setPointerLook(Math.max(-1, Math.min(1, normalized)));
        }}
        onPointerLeave={() => setPointerLook(0)}
      >
        <LoginMascotRive
          emailValue={emailValue}
          isEmailFocused={isEmailFocused}
          isPasswordFocused={isPasswordFocused}
          isSubmitting={isSubmitting}
          isSuccess={success}
          isError={Boolean(error)}
          pointerLook={pointerLook}
        />

        <div className="mb-5 text-center">
          <p className="text-sm font-semibold text-gray-500">Meu Controle Financeiro</p>
          <h1 className="mt-1 text-3xl font-bold text-gray-950">
            {mode === "login" ? "Bem-vindo de volta" : "Crie sua conta"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-gray-500">
            {mode === "login"
              ? "Entre para acompanhar seus pagamentos do mes."
              : "Comece a organizar seus gastos, entradas e parcelas."}
          </p>
        </div>

        <div className="mb-4 grid grid-cols-2 rounded-2xl border border-gray-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`h-11 rounded-xl text-sm font-bold ${mode === "login" ? "bg-gray-900 text-white" : "text-gray-500"}`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`h-11 rounded-xl text-sm font-bold ${mode === "signup" ? "bg-gray-900 text-white" : "text-gray-500"}`}
          >
            Criar conta
          </button>
        </div>

        <form
          onSubmit={mode === "login" ? loginForm.handleSubmit(submitLogin) : signupForm.handleSubmit(submitSignup)}
          className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
        >
          <AuthInput
            label="E-mail"
            type="email"
            autoComplete="email"
            error={emailError}
            registration={emailRegistration}
            onFocus={() => setIsEmailFocused(true)}
            onBlur={() => setIsEmailFocused(false)}
          />

          <PasswordInput
            label="Senha"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            visible={showPassword}
            onToggle={() => setShowPassword((value) => !value)}
            error={passwordError}
            registration={passwordRegistration}
            onFocus={() => setIsPasswordFocused(true)}
            onBlur={() => setIsPasswordFocused(false)}
          />

          {mode === "signup" ? (
            <PasswordInput
              label="Confirmar senha"
              autoComplete="new-password"
              visible={showConfirmPassword}
              onToggle={() => setShowConfirmPassword((value) => !value)}
              error={signupForm.formState.errors.confirmPassword?.message}
              registration={signupForm.register("confirmPassword")}
              onFocus={() => setIsPasswordFocused(true)}
              onBlur={() => setIsPasswordFocused(false)}
            />
          ) : null}

          {error ? <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gray-900 font-bold text-white disabled:opacity-60"
          >
            {mode === "login" ? <LogIn size={18} /> : <UserPlus size={18} />}
            {isSubmitting ? (mode === "login" ? "Entrando..." : "Criando conta...") : mode === "login" ? "Entrar" : "Criar conta"}
          </button>

          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="mt-5 w-full text-center text-sm font-semibold text-gray-700"
          >
            {mode === "login" ? "Ainda nao tenho conta" : "Ja tenho conta"}
          </button>
        </form>
      </section>
    </main>
  );
}

type AuthInputProps = {
  label: string;
  type: string;
  autoComplete: string;
  error?: string;
  registration: UseFormRegisterReturn;
  onFocus?: () => void;
  onBlur?: () => void;
};

function AuthInput({ label, type, autoComplete, error, registration, onFocus, onBlur }: AuthInputProps) {
  return (
    <label className="mb-4 block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <input
        {...registration}
        type={type}
        autoComplete={autoComplete}
        onFocus={onFocus}
        onBlur={(event) => {
          registration.onBlur(event);
          onBlur?.();
        }}
        className="h-12 w-full rounded-xl border border-gray-300 bg-white px-3 outline-none focus:border-gray-900"
      />
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}
    </label>
  );
}

function PasswordInput({
  label,
  autoComplete,
  visible,
  onToggle,
  error,
  registration,
  onFocus,
  onBlur,
}: {
  label: string;
  autoComplete: string;
  visible: boolean;
  onToggle: () => void;
  error?: string;
  registration: UseFormRegisterReturn;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  return (
    <label className="mb-4 block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <div className="relative">
        <input
          {...registration}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          onFocus={onFocus}
          onBlur={(event) => {
            registration.onBlur(event);
            onBlur?.();
          }}
          className="h-12 w-full rounded-xl border border-gray-300 bg-white px-3 pr-12 outline-none focus:border-gray-900"
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={visible ? "Ocultar senha" : "Visualizar senha"}
          title={visible ? "Ocultar senha" : "Visualizar senha"}
          className="absolute inset-y-0 right-0 grid w-12 place-items-center text-gray-500"
        >
          {visible ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </div>
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}
    </label>
  );
}
