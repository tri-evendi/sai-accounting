"use client";

/**
 * Membuat kata sandi baru dari tautan surel (issue #136).
 *
 * Tokennya sekali pakai & berbatas waktu; SEMUA kegagalan token (tak dikenal,
 * kedaluwarsa, sudah dipakai) dijawab SATU kalimat yang sama — membedakannya
 * memberi penyisir alamat konfirmasi gratis bahwa token (dan akunnya) pernah
 * ada. Sukses = kata sandi berganti + seluruh sesi lama dicabut.
 */

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { KeyRound } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { useT } from "@/lib/i18n/client";

function ResetPasswordForm() {
  const t = useT();
  const token = useSearchParams().get("token") ?? "";
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const formData = new FormData(e.currentTarget);
    const newPassword = String(formData.get("newPassword") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");
    if (newPassword !== confirmPassword) {
      setError(t("validation.passwordMismatch"));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? t("auth.resetPassword.invalidToken"));
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
        href={done ? "/login" : "/forgot-password"}
        className="font-medium text-primary underline-offset-4 hover:underline"
      >
        {done ? t("auth.resetPassword.goLogin") : t("auth.resetPassword.requestNew")}
      </Link>
    </p>
  );

  return (
    <AuthShell
      heading={t("auth.resetPassword.heading")}
      description={t("auth.resetPassword.description")}
      error={error}
      icon={<KeyRound className="h-5 w-5" aria-hidden />}
      footer={footer}
    >
      {done ? (
        <div role="status" className="space-y-2 rounded-lg border border-border bg-success-soft p-4">
          <p className="text-sm font-medium text-success-strong">
            {t("auth.resetPassword.successTitle")}
          </p>
          <p className="text-sm leading-relaxed text-success-strong">
            {t("auth.resetPassword.successBody")}
          </p>
        </div>
      ) : !token ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("auth.resetPassword.missingToken")}
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <PasswordInput
            id="newPassword"
            name="newPassword"
            label={t("auth.resetPassword.newPassword")}
            placeholder="••••••••"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={128}
            autoFocus
            disabled={loading}
            aria-invalid={error ? true : undefined}
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
            aria-invalid={error ? true : undefined}
          />
          <p className="text-xs text-muted-foreground">{t("auth.changePassword.hint")}</p>
          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? t("auth.resetPassword.submitting") : t("auth.resetPassword.submit")}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  // useSearchParams menuntut batas Suspense — pola yang sama dengan /login.
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
