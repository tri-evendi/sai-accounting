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
import { UserPlus } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { PageLoader } from "@/components/ui/loading";
import { useT } from "@/lib/i18n/client";

interface InvitationInfo {
  email: string;
  companyName: string;
  role: string;
}

function AcceptInvitationForm() {
  const t = useT();
  const token = useSearchParams().get("token") ?? "";
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
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
      setDone(true);
    } catch {
      setError(t("auth.forgotPassword.failed"));
    } finally {
      setLoading(false);
    }
  }

  const footer = (
    <p className="text-center text-xs text-muted-foreground">
      <Link
        href="/login"
        className="font-medium text-primary underline-offset-4 hover:underline"
      >
        {t("invitations.goLogin")}
      </Link>
    </p>
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
      icon={<UserPlus className="h-5 w-5" aria-hidden />}
      footer={footer}
    >
      {done ? (
        <div role="status" className="space-y-2 rounded-lg border border-border bg-success-soft p-4">
          <p className="text-sm font-medium text-success-strong">
            {t("invitations.successTitle")}
          </p>
          <p className="text-sm leading-relaxed text-success-strong">
            {t("invitations.successBody")}
          </p>
        </div>
      ) : !info ? (
        /* Token hilang / tak dikenal / kedaluwarsa / terpakai — SATU kalimat. */
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("invitations.invalidToken")}
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("invitations.acceptAs", { email: info.email })}
          </p>
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
          <p className="text-xs text-muted-foreground">{t("auth.changePassword.hint")}</p>
          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? t("invitations.submitting") : t("invitations.submit")}
          </Button>
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
