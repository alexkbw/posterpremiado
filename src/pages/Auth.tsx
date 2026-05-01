import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, Lock, Mail, User } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import BrandMark from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getPublicAppUrl } from "@/lib/public-app-url";

type AuthMode = "login" | "signup" | "forgot-password" | "reset-password";

const CONFIRMATION_EMAIL_COOLDOWN_SECONDS = 60;

function getAuthRedirectUrl() {
  return getPublicAppUrl("/auth", { allowLocalBrowserOrigin: true });
}

function getPasswordResetRedirectUrl() {
  return getPublicAppUrl("/auth?mode=recovery", { allowLocalBrowserOrigin: true });
}

function hasRecoveryUrlState() {
  if (typeof window === "undefined") {
    return false;
  }

  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  return (
    searchParams.get("mode") === "recovery" ||
    searchParams.get("type") === "recovery" ||
    hashParams.get("type") === "recovery"
  );
}

function getAuthErrorMessage(error: unknown) {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String(error.message)
      : "";
  const lowerMessage = message.toLowerCase();

  if (message === "Invalid login credentials" || message === "Email not confirmed") {
    return "Login invalido ou email ainda nao confirmado. Confira os dados e confirme o link enviado pelo Supabase.";
  }

  if (message === "User already registered") {
    return "Esses dados ja foram cadastrados. Se a conta ainda nao foi confirmada, voce pode reenviar a confirmacao abaixo.";
  }

  if (
    lowerMessage.includes("profiles_cpf_unique_idx") ||
    (lowerMessage.includes("duplicate key") && lowerMessage.includes("cpf")) ||
    lowerMessage.includes("database error saving new user")
  ) {
    return "Este CPF ja esta cadastrado. Use outro documento ou recupere o acesso da conta existente.";
  }

  if (
    (lowerMessage.includes("expired") || lowerMessage.includes("invalid")) &&
    (lowerMessage.includes("token") || lowerMessage.includes("otp"))
  ) {
    return "O link de redefinicao expirou ou nao e mais valido. Solicite um novo link.";
  }

  if (
    lowerMessage.includes("security purposes") ||
    lowerMessage.includes("rate limit") ||
    lowerMessage.includes("over_email_send_rate_limit")
  ) {
    return "Aguarde 60 segundos antes de pedir um novo email.";
  }

  return message || "Erro ao processar a autenticacao.";
}

function isUserAlreadyRegisteredError(error: unknown) {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String(error.message)
      : "";

  return message === "User already registered";
}

function isObfuscatedExistingSignupResponse(data: {
  session?: unknown | null;
  user?: { identities?: unknown[] | null } | null;
}) {
  return !data.session && Array.isArray(data.user?.identities) && data.user.identities.length === 0;
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
  const [authMode, setAuthMode] = useState<AuthMode>(() => (hasRecoveryUrlState() ? "reset-password" : "login"));
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSecondsLeft, setResendSecondsLeft] = useState(0);
  const [canResendSignupConfirmation, setCanResendSignupConfirmation] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    birthDate: "",
    confirmPassword: "",
    cpf: "",
    displayName: "",
    email: "",
    password: "",
  });

  const isLogin = authMode === "login";
  const isSignup = authMode === "signup";
  const isForgotPassword = authMode === "forgot-password";
  const isResetPassword = authMode === "reset-password";
  const isRecoverySessionReady = isResetPassword && Boolean(user);

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

  useEffect(() => {
    if (!hasRecoveryUrlState()) {
      return undefined;
    }

    setAuthMode("reset-password");

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "PASSWORD_RECOVERY" && !(session && hasRecoveryUrlState())) {
        return;
      }

      setAuthMode("reset-password");
      setResetEmailSent(false);
      setCanResendSignupConfirmation(false);
      setForm((currentForm) => ({
        ...currentForm,
        confirmPassword: "",
        email: session?.user?.email ?? currentForm.email,
        password: "",
      }));
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isRecoverySessionReady || !user?.email) {
      return;
    }

    setForm((currentForm) => ({
      ...currentForm,
      email: user.email ?? currentForm.email,
    }));
  }, [isRecoverySessionReady, user?.email]);

  if (authLoading) return null;
  if (user && !isResetPassword) return <Navigate replace to="/dashboard" />;

  const resetTransientState = () => {
    setCanResendSignupConfirmation(false);
    setResetEmailSent(false);
    setShowPassword(false);
    setForm((currentForm) => ({
      ...currentForm,
      confirmPassword: "",
      password: "",
    }));
  };

  const switchMode = (nextMode: AuthMode) => {
    resetTransientState();
    setAuthMode(nextMode);
  };

  const handleBackToLogin = async () => {
    resetTransientState();

    if (isResetPassword && user) {
      await supabase.auth.signOut();
    }

    setAuthMode("login");
    navigate("/auth", { replace: true });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    const email = form.email.trim().toLowerCase();
    const displayName = form.displayName.trim();
    const cpf = normalizeCpf(form.cpf);

    try {
      if (isForgotPassword || (isResetPassword && !isRecoverySessionReady)) {
        if (!email) {
          toast.error("Informe o email para enviar o link de redefinicao.");
          return;
        }

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: getPasswordResetRedirectUrl(),
        });

        if (error) throw error;

        setResetEmailSent(true);
        toast.success("Se o email existir, enviaremos um link para redefinir a senha.");
        return;
      }

      if (isResetPassword) {
        if (form.password.length < 6) {
          toast.error("A nova senha precisa ter pelo menos 6 caracteres.");
          return;
        }

        if (form.password !== form.confirmPassword) {
          toast.error("As senhas nao conferem.");
          return;
        }

        const { error } = await supabase.auth.updateUser({
          password: form.password,
        });

        if (error) throw error;

        toast.success("Senha redefinida com sucesso.");
        navigate("/dashboard", { replace: true });
        return;
      }

      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password: form.password,
        });

        if (error) throw error;

        toast.success("Bem-vindo de volta!");
        navigate("/dashboard");
        return;
      }

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

      const { data, error } = await supabase.auth.signUp({
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

      if (isObfuscatedExistingSignupResponse(data)) {
        setCanResendSignupConfirmation(true);
        setForm((currentForm) => ({
          ...currentForm,
          email,
          password: "",
        }));
        toast.error("Esses dados ja foram cadastrados. Se quiser, voce pode reenviar a confirmacao de email abaixo.");
        return;
      }

      setCanResendSignupConfirmation(false);
      setForm((currentForm) => ({
        ...currentForm,
        email,
        password: "",
      }));
      setAuthMode("login");
      setResendSecondsLeft(CONFIRMATION_EMAIL_COOLDOWN_SECONDS);
      toast.success("Cadastro realizado! Verifique seu email. Se nao chegar, o reenvio libera em 60 segundos.");
    } catch (error) {
      if (isSignup) {
        setCanResendSignupConfirmation(isUserAlreadyRegisteredError(error));
      }

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

  const heading = isResetPassword
    ? isRecoverySessionReady
      ? "Defina sua nova senha"
      : "Recupere o acesso"
    : isForgotPassword
      ? "Recupere o acesso"
      : isLogin
        ? "Acesse sua conta"
        : "Crie sua conta para comprar o poster";

  const subheading = isResetPassword
    ? isRecoverySessionReady
      ? "Escolha uma nova senha para concluir a recuperacao."
      : "Informe seu email para receber um novo link de redefinicao."
    : isForgotPassword
      ? "Enviaremos um link seguro para redefinir sua senha."
      : isLogin
        ? "Entre com seu email e senha."
        : "Finalize seu cadastro para participar das promocoes.";

  const submitLabel = loading
    ? "Processando..."
    : isResetPassword
      ? isRecoverySessionReady
        ? "Salvar nova senha"
        : "Enviar novo link"
      : isForgotPassword
        ? "Enviar link de redefinicao"
        : isLogin
          ? "Entrar"
          : "Cadastrar";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
        initial={{ opacity: 0, y: 20 }}
      >
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex items-center gap-2">
            <BrandMark className="h-8 w-8" />
            <h1 className="text-3xl font-display font-bold text-gradient-gold">PosterPremiado</h1>
          </div>
          <p className="text-muted-foreground">{heading}</p>
          <p className="mt-2 text-sm text-muted-foreground/80">{subheading}</p>
        </div>

        <div className="glass-card rounded-2xl p-6">
          <form className="space-y-4" onSubmit={handleSubmit}>
            {isSignup ? (
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

            {!isRecoverySessionReady ? (
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="border-border bg-secondary/50 pl-10"
                    id="email"
                    onChange={(event) => {
                      if (isSignup && canResendSignupConfirmation) {
                        setCanResendSignupConfirmation(false);
                      }

                      setResetEmailSent(false);
                      setForm({ ...form, email: event.target.value });
                    }}
                    placeholder="seu@email.com"
                    required
                    type="email"
                    value={form.email}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="recoveryEmail">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="border-border bg-secondary/50 pl-10"
                    disabled
                    id="recoveryEmail"
                    type="email"
                    value={form.email}
                  />
                </div>
              </div>
            )}

            {isLogin || isSignup || isRecoverySessionReady ? (
              <div className="space-y-2">
                <Label htmlFor="password">{isRecoverySessionReady ? "Nova senha" : "Senha"}</Label>
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
            ) : null}

            {isRecoverySessionReady ? (
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirme a nova senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="border-border bg-secondary/50 pl-10"
                    id="confirmPassword"
                    minLength={6}
                    onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}
                    placeholder="********"
                    required
                    type={showPassword ? "text" : "password"}
                    value={form.confirmPassword}
                  />
                </div>
              </div>
            ) : null}

            <Button className="w-full" disabled={loading || resendLoading} size="lg" type="submit" variant="hero">
              {submitLabel}
            </Button>

            {isLogin ? (
              <button
                className="w-full text-sm text-muted-foreground transition-colors hover:text-primary"
                onClick={() => switchMode("forgot-password")}
                type="button"
              >
                Esqueci minha senha
              </button>
            ) : null}

            {isSignup && canResendSignupConfirmation ? (
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

          {isSignup && canResendSignupConfirmation ? (
            <p className="mt-4 rounded-xl border border-primary/10 bg-primary/5 px-4 py-3 text-xs text-primary/85">
              Esses dados ja foram cadastrados. Se a conta ainda nao foi confirmada, deseja enviar outra confirmacao de email? O reenvio fica disponivel a cada 60 segundos.
            </p>
          ) : null}

          {(isForgotPassword || isResetPassword) && resetEmailSent ? (
            <p className="mt-4 rounded-xl border border-primary/10 bg-primary/5 px-4 py-3 text-xs text-primary/85">
              Se encontrarmos esse email, enviaremos um link seguro de redefinicao. Confira tambem spam e promocoes.
            </p>
          ) : null}

          {isResetPassword && !isRecoverySessionReady ? (
            <p className="mt-4 rounded-xl border border-primary/10 bg-primary/5 px-4 py-3 text-xs text-primary/85">
              O link pode ter expirado ou ainda nao ter sido aberto corretamente. Informe o email para solicitar um novo envio.
            </p>
          ) : null}

          {isSignup ? (
            <p className="mt-4 rounded-xl border border-primary/10 bg-primary/5 px-4 py-3 text-xs text-primary/85">
              O cadastro exige CPF valido e idade minima de 18 anos. O avatar pode ser escolhido depois, dentro do chat.
            </p>
          ) : null}

          <div className="mt-6 text-center">
            <button
              className="text-sm text-muted-foreground transition-colors hover:text-primary"
              onClick={() => {
                if (isLogin) {
                  switchMode("signup");
                  return;
                }

                void handleBackToLogin();
              }}
              type="button"
            >
              {isLogin ? "Nao tem conta? Cadastre-se" : "Voltar ao login"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
