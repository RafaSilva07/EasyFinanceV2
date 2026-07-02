import { z } from "zod";

export const loginSchema = z.object({
  email: z.email("Digite um e-mail valido."),
  password: z.string().min(1, "Digite sua senha."),
});

export const signupSchema = z
  .object({
    email: z.email("Digite um e-mail valido."),
    password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres."),
    confirmPassword: z.string().min(1, "Confirme sua senha."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas nao coincidem.",
    path: ["confirmPassword"],
  });

export type LoginFormData = z.infer<typeof loginSchema>;
export type SignupFormData = z.infer<typeof signupSchema>;
