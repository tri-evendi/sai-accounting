"use client";

import { Suspense, useEffect, useState } from "react";
import { signIn, getSession, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Flex, Typography, theme } from "antd";
import { LoginOutlined } from "@ant-design/icons";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { useT, type TranslateFn } from "@/lib/i18n/client";
// Aturan arah pasca-masuk hidup di satu tempat (#159 temuan 3): penjaga
// halaman server memakai fungsi yang sama — jangan menyalinnya ke sini lagi.
import { resolvePostLoginPath } from "@/lib/post-login";

const { Text } = Typography;

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

/** Kalimat tunggu di tengah kartu — satu bentuk, dua pemakai di berkas ini. */
function WaitingLine({ children }: { children: React.ReactNode }) {
  return (
    <Text type="secondary" style={{ display: "block", textAlign: "center" }}>
      {children}
    </Text>
  );
}

function LoginLoading() {
  const t = useT();
  return (
    <AuthShell
      heading={t("auth.login.heading")}
      description={t("auth.login.description")}
      icon={<LoginOutlined aria-hidden style={{ fontSize: 20 }} />}
    >
      <WaitingLine>{t("common.loading")}</WaitingLine>
    </AuthShell>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status: sessionStatus } = useSession();
  const t = useT();
  const { token } = theme.useToken();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const callbackUrl = searchParams.get("callbackUrl");

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;

    getSession().then((session) => {
      const destination = resolvePostLoginPath(
        session?.user?.mustChangePassword,
        {
          companyId: session?.user?.companyId,
          tenantSlug: session?.user?.tenantSlug,
          companySlug: session?.user?.companySlug,
          tenantRole: session?.user?.tenantRole,
        },
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
        {
          companyId: session?.user?.companyId,
          tenantSlug: session?.user?.tenantSlug,
          companySlug: session?.user?.companySlug,
          tenantRole: session?.user?.tenantRole,
        },
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
        icon={<LoginOutlined aria-hidden style={{ fontSize: 20 }} />}
      >
        <WaitingLine>{t("auth.login.checkingSession")}</WaitingLine>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      heading={t("auth.login.heading")}
      description={t("auth.login.description")}
      error={error}
      icon={<LoginOutlined aria-hidden style={{ fontSize: 20 }} />}
      footer={
        /* Tautan SUNGGUHAN sejak issue #136 — dulu kalimat "hubungi admin
           sistem", jalan buntu bagi pelanggan yang justru dirinya adminnya.
           Sejak #138 ada pintu kedua: mendaftar sendiri. */
        <Flex vertical align="center" gap={token.marginXS}>
          <Link
            href="/forgot-password"
            style={{ color: token.colorLink, fontSize: token.fontSizeSM, fontWeight: 500 }}
          >
            {t("auth.login.forgotPassword")}
          </Link>
          <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            {t("auth.login.registerPrompt")}{" "}
            <Link href="/register" style={{ color: token.colorLink, fontWeight: 500 }}>
              {t("auth.login.registerLink")}
            </Link>
          </Text>
        </Flex>
      }
    >
      <form onSubmit={handleSubmit}>
        <Flex vertical gap={token.marginMD}>
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
          <Button
            type="submit"
            variant="primary"
            size="lg"
            style={{ width: "100%" }}
            disabled={loading}
          >
            {loading ? t("auth.login.submitting") : t("auth.login.submit")}
          </Button>
        </Flex>
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
