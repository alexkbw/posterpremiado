import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, Lock, Mail, Trophy, User } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getPublicAppUrl } from "@/lib/public-app-url";

const CONFIRMATION_EMAIL_COOLDOWN_SECONDS = 60;

function getAuthRedirectUrl() {
  return getPublicAppUrl("/auth");
}

function getAuthErrorMessage(error: unknown) {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String(error.message)
      : "";

  if (message === "Invalid login credentials" || message === "Email not confirmed") {
    return "Login invalido ou email ainda nao confirmado. Confira os dados e confirme o link enviado pelo Supabase.";
  }

  if (message === "User already registered") {
    return "Este email ja esta cadastrado. Tente entrar ou redefinir a senha.";
  }

  if (
    message.toLowerCase().includes("security purposes") ||
    message.toLowerCase().includes("rate limit") ||
    message.toLowerCase().includes("over_email_send_rate_limit")
  ) {
    return "Aguarde 60 segundos antes de pedir um novo email de confirmacao.";
  }

  return message || "Erro ao processar a autenticacao.";
}

function normalizeCpf(value: string) {
  return value.replace(/\D/g, "").slice(0, 11);
}

function formatCpf(value: string) {
  const digits = normalizeCpf(value);

  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

function isValidCpf(value: string) {
  const digits = normalizeCpf(value);

  if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) {
    return false;
  }

  let sum = 0;

  for (let index = 0; index < 9; index += 1) {
    sum += Number(digits[index]) * (10 - index);
  }

  let remainder = (sum * 10) % 11;
  if (remainder === 10) {
    remainder = 0;
  }

  if (remainder !== Number(digits[9])) {
    return false;
  }

  sum = 0;
  for (let index = 0; index < 10; index += 1) {
    sum += Number(digits[index]) * (11 - index);
  }

  remainder = (sum * 10) % 11;
  if (remainder === 10) {
    remainder = 0;
  }

  return remainder === Number(digits[10]);
}

function isAdult(birthDate: string) {
  if (!birthDate) {
    return false;
  }

  const birthday = new Date(`${birthDate}T00:00:00`);
  const today = new Date();
  let age = today.getFullYear() - birthday.getFullYear();
  const monthDifference = today.getMonth() - birthday.getMonth();

  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthday.getDate())) {
    age -= 1;
  }

  return age >= 18;
}

export default function AuthPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSecondsLeft, setResendSecondsLeft] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    birthDate: "",
    cpf: "",
    displayName: "",
    email: "",
    password: "",
  });

  useEffect(() => {
    if (!resendSecondsLeft) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setResendSecondsLeft((currentSeconds) => {
        if (currentSeconds <= 1) {
          window.clearInterval(timer);
          return 0;
        }

        return currentSeconds - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [resendSecondsLeft]);

  if (authLoading) return null;
  if (user) return <Navigate to="/dashboard" />;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    const email = form.email.trim().toLowerCase();
    const displayName = form.displayName.trim();
    const cpf = normalizeCpf(form.cpf);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password: form.password,
        });

        if (error) throw error;

        toast.success("Bem-vindo de volta!");
        navigate("/dashboard");
      } else {
        if (!displayName) {
          toast.error("Informe seu nome completo.");
          return;
        }

        if (!isValidCpf(cpf)) {
          toast.error("Informe um CPF valido.");
          return;
        }

        if (!isAdult(form.birthDate)) {
          toast.error("A plataforma esta disponivel apenas para maiores de 18 anos.");
          return;
        }

        const { error } = await supabase.auth.signUp({
          email,
          password: form.password,
          options: {
            data: {
              birth_date: form.birthDate,
              cpf,
              display_name: displayName,
              full_name: displayName,
            },
            emailRedirectTo: getAuthRedirectUrl(),
          },
        });

        if (error) throw error;

        setForm((currentForm) => ({
          ...currentForm,
          email,
          password: "",
        }));
        setIsLogin(true);
        setResendSecondsLeft(CONFIRMATION_EMAIL_COOLDOWN_SECONDS);
        toast.success("Cadastro realizado! Verifique seu email. Se nao chegar, o reenvio libera em 60 segundos.");
      }
    } catch (error) {
      toast.error(getAuthErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    const email = form.email.trim().toLowerCase();

    if (!email) {
      toast.error("Informe o email para reenviar a confirmacao.");
      return;
    }

    if (resendSecondsLeft > 0) {
      toast.error(`Aguarde ${resendSecondsLeft}s antes de reenviar.`);
      return;
    }

    setResendLoading(true);

    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: {
          emailRedirectTo: getAuthRedirectUrl(),
        },
      });

      if (error) throw error;

      setResendSecondsLeft(CONFIRMATION_EMAIL_COOLDOWN_SECONDS);
      toast.success("Se a conta ainda nao foi confirmada, um novo email foi solicitado. Aguarde ate 60 segundos entre tentativas.");
    } catch (error) {
      toast.error(getAuthErrorMessage(error));
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
        initial={{ opacity: 0, y: 20 }}
      >
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex items-center gap-2">
            <Trophy className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-display font-bold text-gradient-gold">PremioSemanal</h1>
          </div>
          <p className="text-muted-foreground">
            {isLogin ? "Acesse sua conta" : "Crie sua conta e concorra"}
          </p>
        </div>

        <div className="glass-card rounded-2xl p-6">
          <form className="space-y-4" onSubmit={handleSubmit}>
            {!isLogin ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="displayName">Nome</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="border-border bg-secondary/50 pl-10"
                      id="displayName"
                      onChange={(event) => setForm({ ...form, displayName: event.target.value })}
                      placeholder="Seu nome completo"
                      required
                      value={form.displayName}
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="cpf">CPF</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="border-border bg-secondary/50 pl-10"
                        id="cpf"
                        inputMode="numeric"
                        maxLength={14}
                        onChange={(event) => setForm({ ...form, cpf: normalizeCpf(event.target.value) })}
                        placeholder="000.000.000-00"
                        required
                        value={formatCpf(form.cpf)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="birthDate">Data de nascimento</Label>
                    <Input
                      className="border-border bg-secondary/50"
                      id="birthDate"
                      onChange={(event) => setForm({ ...form, birthDate: event.target.value })}
                      required
                      type="date"
                      value={form.birthDate}
                    />
                  </div>
                </div>
              </>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="border-border bg-secondary/50 pl-10"
                  id="email"
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  placeholder="seu@email.com"
                  required
                  type="email"
                  value={form.email}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="border-border bg-secondary/50 pl-10 pr-10"
                  id="password"
                  minLength={6}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  placeholder="********"
                  required
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                />
                <button
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                  type="button"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button className="w-full" disabled={loading || resendLoading} size="lg" type="submit" variant="hero">
              {loading ? "Processando..." : isLogin ? "Entrar" : "Cadastrar"}
            </Button>

            {isLogin ? (
              <Button
                className="w-full"
                disabled={loading || resendLoading || resendSecondsLeft > 0 || !form.email.trim()}
                onClick={handleResendConfirmation}
                size="lg"
                type="button"
                variant="outline"
              >
                {resendLoading
                  ? "Reenviando..."
                  : resendSecondsLeft > 0
                    ? `Reenviar em ${resendSecondsLeft}s`
                    : "Reenviar confirmacao"}
              </Button>
            ) : null}
          </form>

          {isLogin ? (
            <p className="mt-4 rounded-xl border border-primary/10 bg-primary/5 px-4 py-3 text-xs text-primary/85">
              O Supabase aceita um novo pedido de confirmacao apos cerca de 60 segundos. Confira tambem a caixa de spam.
            </p>
          ) : null}

          {!isLogin ? (
            <p className="mt-4 rounded-xl border border-primary/10 bg-primary/5 px-4 py-3 text-xs text-primary/85">
              O cadastro exige CPF valido e idade minima de 18 anos. O avatar pode ser escolhido depois, dentro do chat.
            </p>
          ) : null}

          <div className="mt-6 text-center">
            <button
              className="text-sm text-muted-foreground transition-colors hover:text-primary"
              onClick={() => setIsLogin(!isLogin)}
            >
              {isLogin ? "Nao tem conta? Cadastre-se" : "Ja tem conta? Faca login"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
