"use client";

/**
 * Menerima undangan staf (issue #139) — dari tautan surel.
 *
 * Penerima MENENTUKAN KATA SANDINYA SENDIRI: tidak pernah ada kata sandi
 * sementara yang diketik admin lalu berkeliling lewat WhatsApp. Isi
 * undangannya (PT tujuan, peran, email) diambil dengan token — memegang
 * tautan = menerima surelnya. Semua kegagalan token dijawab satu kalimat.
 */

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Alert, Flex, Typography, theme } from "antd";
import { UserPlus } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { PageLoader } from "@/components/ui/loading";
import { useT } from "@/lib/i18n/client";

const { Text } = Typography;

interface InvitationInfo {
  email: string;
  companyName: string;
  role: string;
}

function AcceptInvitationForm() {
  const t = useT();
  const { token: designToken } = theme.useToken();
  const token = useSearchParams().get("token") ?? "";
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!token) {
        setChecking(false);
        return;
      }
      try {
        const res = await fetch(`/api/auth/accept-invitation?token=${encodeURIComponent(token)}`);
        const data = await res.json().catch(() => null);
        if (!cancelled && data?.ok) setInfo(data.invitation);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const formData = new FormData(e.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");
    if (password !== confirmPassword) {
      setError(t("validation.passwordMismatch"));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/accept-invitation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        /* Tanpa `username` (#159 temuan 4): server menurunkannya dari email
         * undangan — satu isian lebih sedikit untuk dipikirkan penerima. */
        body: JSON.stringify({
          token,
          name: String(formData.get("name") ?? "") || undefined,
          password,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? t("invitations.invalidToken"));
        return;
      }
      /* Tujuan yang dikirim server: buku perusahaan yang mengundangnya. Kalau
       * tidak ada (perusahaannya hilang di antara dua langkah — mustahil dalam
       * praktik, tapi jawabannya tetap harus punya bentuk), jatuh ke /login
       * telanjang seperti sebelumnya. */
      const data = await res.json().catch(() => null);
      if (typeof data?.next === "string" && data.next.startsWith("/")) setNext(data.next);
      setDone(true);
    } catch {
      setError(t("auth.forgotPassword.failed"));
    } finally {
      setLoading(false);
    }
  }

  /* Sesudah masuk, `resolvePostLoginPath` menghormati `callbackUrl` relatif —
   * jadi orang yang baru bergabung mendarat LANGSUNG di buku perusahaan yang
   * mengundangnya, bukan di panel akun yang bukan urusannya. */
  const loginHref = next ? `/login?callbackUrl=${encodeURIComponent(next)}` : "/login";

  const footer = (
    <Flex justify="center">
      <Link
        href={loginHref}
        style={{
          color: designToken.colorLink,
          fontSize: designToken.fontSizeSM,
          fontWeight: 500,
        }}
      >
        {t("invitations.goLogin")}
      </Link>
    </Flex>
  );

  if (checking) return <PageLoader message={t("invitations.checking")} />;

  return (
    <AuthShell
      heading={t("invitations.acceptHeading")}
      description={
        info
          ? t("invitations.acceptDescription", { company: info.companyName })
          : t("invitations.acceptHeading")
      }
      error={error}
      icon={<UserPlus size={20} aria-hidden />}
      footer={footer}
    >
      {done ? (
        /* `Alert` AntD sudah `role="alert"` sendiri; pembungkus tak menambah apa pun — lihat /forgot-password. */
        <Alert
          type="success"
          showIcon
          message={t("invitations.successTitle")}
          description={t("invitations.successBody")}
        />
      ) : !info ? (
        /* Token hilang / tak dikenal / kedaluwarsa / terpakai — SATU kalimat. */
        <Text type="secondary">{t("invitations.invalidToken")}</Text>
      ) : (
        <form onSubmit={handleSubmit}>
          <Flex vertical gap={designToken.marginMD}>
            <Text type="secondary">{t("invitations.acceptAs", { email: info.email })}</Text>
            <Input
              id="name"
              name="name"
              label={t("users.displayName")}
              autoFocus
              maxLength={100}
              disabled={loading}
            />
            <PasswordInput
              id="password"
              name="password"
              label={t("invitations.choosePassword")}
              placeholder="••••••••"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
              disabled={loading}
            />
            <PasswordInput
              id="confirmPassword"
              name="confirmPassword"
              label={t("auth.resetPassword.confirm")}
              placeholder="••••••••"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
              disabled={loading}
            />
            <Text type="secondary" style={{ fontSize: designToken.fontSizeSM }}>
              {t("auth.changePassword.hint")}
            </Text>
            <Button type="submit" size="lg" style={{ width: "100%" }} disabled={loading}>
              {loading ? t("invitations.submitting") : t("invitations.submit")}
            </Button>
          </Flex>
        </form>
      )}
    </AuthShell>
  );
}

export default function AcceptInvitationPage() {
  // useSearchParams menuntut batas Suspense — pola yang sama dengan /login.
  return (
    <Suspense fallback={null}>
      <AcceptInvitationForm />
    </Suspense>
  );
}
