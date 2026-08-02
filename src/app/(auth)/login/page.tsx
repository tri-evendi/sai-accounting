"use client";

import { Suspense, useEffect, useState } from "react";
import { signIn, getSession, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { LogIn } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { useT, type TranslateFn } from "@/lib/i18n/client";
// Aturan arah pasca-masuk hidup di satu tempat (#159 temuan 3): penjaga
// halaman server memakai fungsi yang sama — jangan menyalinnya ke sini lagi.
import { resolvePostLoginPath } from "@/lib/post-login";

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
  /*
   * Akun sah tapi belum diberi akses ke perusahaan mana pun (issue #104).
   * `authorize()` melemparnya sebagai penanda, bukan sebagai kalimat — kalau
   * dibiarkan lewat apa adanya, pengguna membaca "NoCompanyAccess" dan
   * menyimpulkan sistemnya rusak, padahal yang kurang cuma pendaftaran.
   */
  if (message.includes("NoCompanyAccess")) {
    return t("auth.selectCompany.noAccessBody");
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
      const destination = resolvePostLoginPath(
        session?.user?.mustChangePassword,
        session?.user?.companyId,
        session?.user?.companyCount,
        callbackUrl
      );
      router.replace(destination);
    });
  }, [sessionStatus, callbackUrl, router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const result = await signIn("credentials", {
      identifier: formData.get("identifier"),
      password: formData.get("password"),
      redirect: false,
    });

    if (result?.error) {
      setError(formatSignInError(result.error, t));
      setLoading(false);
      return;
    }

    const session = await getSession();
    router.push(
      resolvePostLoginPath(
        session?.user?.mustChangePassword,
        session?.user?.companyId,
        session?.user?.companyCount,
        callbackUrl
      )
    );
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
        /* Tautan SUNGGUHAN sejak issue #136 — dulu kalimat "hubungi admin
           sistem", jalan buntu bagi pelanggan yang justru dirinya adminnya.
           Sejak #138 ada pintu kedua: mendaftar sendiri. */
        <div className="space-y-2 text-center text-xs text-muted-foreground">
          <p>
            <Link
              href="/forgot-password"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {t("auth.login.forgotPassword")}
            </Link>
          </p>
          <p>
            {t("auth.login.registerPrompt")}{" "}
            <Link
              href="/register"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {t("auth.login.registerLink")}
            </Link>
          </p>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Email = pengenal resmi (issue #136); username lama tetap diterima
            selama masa peralihan — lihat authorize() di lib/auth.ts. */}
        <Input
          id="identifier"
          name="identifier"
          label={t("auth.login.identifier")}
          placeholder={t("auth.login.identifierPlaceholder")}
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
