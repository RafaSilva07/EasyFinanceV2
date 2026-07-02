# EasyFinance

Sistema financeiro simples, mobile-first e instalavel como PWA.

## Configuracao

Crie `.env.local` com:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Execute o SQL em `supabase/migrations/001_initial_schema.sql` no Supabase.

## Supabase Auth

Para o cadastro entrar direto sem confirmacao por e-mail:

1. Abra o painel do Supabase.
2. Va em `Authentication > Providers > Email`.
3. Desative `Confirm email`.
4. Salve a configuracao.

Essa configuracao fica no painel do Supabase, nao em migration SQL.

## Desenvolvimento

```bash
npm run dev
```

Abra `http://localhost:3000`.
