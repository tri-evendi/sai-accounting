"use client";

import { Suspense, useEffect, useState } from "react";
import { signIn, getSession, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { useT, type TranslateFn } from "@/lib/i18n/client";

function resolvePostLoginPath(status: number | undefined, callbackUrl: string | null) {
  if (status === 1) return "/change-password";
  if (callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")) {
    return callbackUrl;
  }
  return "/dashboard";
}

/**
 * Pesan gagal masuk. Hanya galat kredensial baku yang diterjemahkan: sisanya
 * (mis. pembatasan "Too many login attempts") datang dari server dengan
 * kontennya sendiri — menerjemahkannya di sini berarti menebak isinya.
 * Terjemahan pesan server adalah pekerjaan lanjutan, sekelas dengan pesan zod.
 */
function formatSignInError(message: string | undefined, t: TranslateFn) {
  if (!message || message === "CredentialsSignin") {
    return t("auth.login.invalidCredentials");
  }
  return message;
}

function LoginLoading() {
  const t = useT();
  return (
    <AuthShell
      heading={t("auth.login.heading")}
      description={t("auth.login.description")}
      icon={<LogIn className="h-5 w-5" aria-hidden />}
    >
      <p className="text-center text-sm text-muted-foreground">{t("common.loading")}</p>
    </AuthShell>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status: sessionStatus } = useSession();
  const t = useT();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const callbackUrl = searchParams.get("callbackUrl");

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;

    getSession().then((session) => {
      const destination = resolvePostLoginPath(session?.user?.status, callbackUrl);
      router.replace(destination);
    });
  }, [sessionStatus, callbackUrl, router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const result = await signIn("credentials", {
      username: formData.get("username"),
      password: formData.get("password"),
      redirect: false,
    });

    if (result?.error) {
      setError(formatSignInError(result.error, t));
      setLoading(false);
      return;
    }

    const session = await getSession();
    router.push(resolvePostLoginPath(session?.user?.status, callbackUrl));
    router.refresh();
  }

  if (sessionStatus === "loading" || sessionStatus === "authenticated") {
    return (
      <AuthShell
        heading={t("auth.login.heading")}
        description={t("auth.login.description")}
        icon={<LogIn className="h-5 w-5" aria-hidden />}
      >
        <p className="text-center text-sm text-muted-foreground">
          {t("auth.login.checkingSession")}
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      heading={t("auth.login.heading")}
      description={t("auth.login.description")}
      error={error}
      icon={<LogIn className="h-5 w-5" aria-hidden />}
      footer={
        <p className="text-center text-xs text-muted-foreground">
          {t("auth.login.forgotPassword")}
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          id="username"
          name="username"
          label={t("auth.login.username")}
          placeholder={t("auth.login.usernamePlaceholder")}
          autoComplete="username"
          required
          autoFocus
          disabled={loading}
          aria-invalid={error ? true : undefined}
        />
        <PasswordInput
          id="password"
          name="password"
          label={t("auth.login.password")}
          placeholder="••••••••"
          autoComplete="current-password"
          required
          disabled={loading}
          aria-invalid={error ? true : undefined}
        />
        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading ? t("auth.login.submitting") : t("auth.login.submit")}
        </Button>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginForm />
    </Suspense>
  );
}
