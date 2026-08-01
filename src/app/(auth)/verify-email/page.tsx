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
import { BadgeCheck, MailCheck } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";

function VerifyEmailInner() {
  const t = useT();
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
    <p className="text-center text-xs text-muted-foreground">
      <Link
        href={done || alreadyRegistered ? "/login" : "/register"}
        className="font-medium text-primary underline-offset-4 hover:underline"
      >
        {done || alreadyRegistered
          ? t("auth.register.haveAccount")
          : t("auth.register.registerAgain")}
      </Link>
    </p>
  );

  return (
    <AuthShell
      heading={done ? t("auth.register.verifiedTitle") : t("auth.register.verifyHeading")}
      description={done ? undefined : t("auth.register.verifyDescription")}
      error={error}
      icon={
        done ? (
          <BadgeCheck className="h-5 w-5" aria-hidden />
        ) : (
          <MailCheck className="h-5 w-5" aria-hidden />
        )
      }
      footer={footer}
    >
      {done ? (
        <div className="space-y-4">
          <div role="status" className="rounded-lg border border-border bg-success-soft p-4">
            <p className="text-sm leading-relaxed text-success-strong">
              {t("auth.register.verifiedBody")}
            </p>
          </div>
          {/* Langkah 4 §7.1: layar "buat perusahaan pertama" — tujuannya
              /companies/new (lewat masuk), bukan pemilih perusahaan. */}
          <Button asChild className="w-full" size="lg">
            <Link href="/login?callbackUrl=%2Fcompanies%2Fnew">
              {t("auth.register.verifiedCta")}
            </Link>
          </Button>
        </div>
      ) : alreadyRegistered ? (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("auth.register.alreadyRegistered")}
          </p>
          <Button asChild className="w-full">
            <Link href="/login">{t("auth.login.submit")}</Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/forgot-password">{t("auth.forgotPassword.heading")}</Link>
          </Button>
        </div>
      ) : !token ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("auth.register.missingToken")}
        </p>
      ) : (
        <Button onClick={handleVerify} className="w-full" size="lg" disabled={loading}>
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
