"use client";

/**
 * Halaman tautan verifikasi (issue #138) — langkah 3 perjalanan §7.1.
 *
 * ══ KENAPA TOMBOL, BUKAN VERIFIKASI-SAAT-DIBUKA ═════════════════════════════
 * Pemindai tautan surel (Outlook SafeLinks, penyaring korporat) MEMBUKA setiap
 * URL yang lewat. Kalau membuka halaman ini saja sudah mengonsumsi token,
 * robot itulah yang "mengaktifkan" akun — atau, karena tokennya sekali pakai,
 * menghanguskannya sebelum manusianya sempat menekan apa pun. Mutasi terjadi
 * HANYA lewat POST dari tombol.
 *
 * Sukses = Tenant + User(owner) + TenantMembership lahir (satu transaksi di
 * server) — dan layar ini menjadi layar "buat perusahaan pertama": BUKAN
 * /select-company, karena belum ada apa pun untuk dipilih. Tombolnya membawa
 * ke /login dengan tujuan /companies/new; alur masuk mengarahkan pengguna
 * tanpa perusahaan ke sana dengan sendirinya.
 */

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Alert, Flex, Typography, theme } from "antd";
import { BadgeCheck, MailCheck } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";

const { Text } = Typography;

function VerifyEmailInner() {
  const t = useT();
  const { token: designToken } = theme.useToken();
  const token = useSearchParams().get("token") ?? "";
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [error, setError] = useState("");

  async function handleVerify() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (res.ok) {
        setDone(true);
        return;
      }
      const data = await res.json().catch(() => null);
      if (data?.code === "already_registered") {
        setAlreadyRegistered(true);
        return;
      }
      setError(data?.error ?? t("auth.register.invalidToken"));
    } catch {
      setError(t("auth.forgotPassword.failed"));
    } finally {
      setLoading(false);
    }
  }

  const footer = (
    <Flex justify="center">
      <Link
        href={done || alreadyRegistered ? "/login" : "/register"}
        style={{
          color: designToken.colorLink,
          fontSize: designToken.fontSizeSM,
          fontWeight: 500,
        }}
      >
        {done || alreadyRegistered
          ? t("auth.register.haveAccount")
          : t("auth.register.registerAgain")}
      </Link>
    </Flex>
  );

  return (
    <AuthShell
      heading={done ? t("auth.register.verifiedTitle") : t("auth.register.verifyHeading")}
      description={done ? undefined : t("auth.register.verifyDescription")}
      error={error}
      icon={done ? <BadgeCheck size={20} aria-hidden /> : <MailCheck size={20} aria-hidden />}
      footer={footer}
    >
      {done ? (
        <Flex vertical gap={designToken.margin}>
          {/* `role` pada pembungkus — `Alert` AntD hanya meneruskan
              `aria-*`/`data-*`, jadi peran yang dioper langsung akan hilang. */}
          <div role="status" aria-live="polite">
            <Alert type="success" showIcon message={t("auth.register.verifiedBody")} />
          </div>
          {/* Langkah 4 §7.1: layar "buat perusahaan pertama" — tujuannya
              /companies/new (lewat masuk), bukan pemilih perusahaan. */}
          <Button asChild size="lg" style={{ width: "100%" }}>
            <Link href="/login?callbackUrl=%2Fcompanies%2Fnew">
              {t("auth.register.verifiedCta")}
            </Link>
          </Button>
        </Flex>
      ) : alreadyRegistered ? (
        <Flex vertical gap={designToken.margin}>
          <Text type="secondary">{t("auth.register.alreadyRegistered")}</Text>
          <Button asChild style={{ width: "100%" }}>
            <Link href="/login">{t("auth.login.submit")}</Link>
          </Button>
          <Button asChild variant="outline" style={{ width: "100%" }}>
            <Link href="/forgot-password">{t("auth.forgotPassword.heading")}</Link>
          </Button>
        </Flex>
      ) : !token ? (
        <Text type="secondary">{t("auth.register.missingToken")}</Text>
      ) : (
        <Button onClick={handleVerify} size="lg" style={{ width: "100%" }} disabled={loading}>
          {loading ? t("auth.register.verifying") : t("auth.register.verifyButton")}
        </Button>
      )}
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  // useSearchParams menuntut batas Suspense — pola yang sama dengan /login.
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  );
}
