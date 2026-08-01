"use client";

/**
 * Pendaftaran mandiri (issue #138) — langkah 1 perjalanan §7.1: nama, email,
 * kata sandi, setuju S&K. Tidak ada yang lahir dari layar ini kecuali satu
 * surel verifikasi; Tenant/akun/basis data semuanya menunggu tautan diklik.
 *
 * Layar sesudah kirim SELALU sama, terdaftar atau belum emailnya — jawaban
 * yang berbeda adalah kebocoran enumerasi (pola /forgot-password #136).
 */

import { useState } from "react";
import Link from "next/link";
import { UserPlus } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Checkbox } from "@/components/ui/checkbox";
import { useT } from "@/lib/i18n/client";

export default function RegisterPage() {
  const t = useT();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          email: formData.get("email"),
          password: formData.get("password"),
          termsAccepted: terms,
        }),
      });

      if (res.status === 429) {
        setError(t("auth.forgotPassword.tooMany"));
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const fieldErrors = data?.details?.fieldErrors as Record<string, string[]> | undefined;
        const first = fieldErrors ? Object.values(fieldErrors).flat().find(Boolean) : undefined;
        setError(first ?? data?.error ?? t("auth.forgotPassword.failed"));
        return;
      }
      setSent(true);
    } catch {
      setError(t("auth.forgotPassword.failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      heading={t("auth.register.heading")}
      description={t("auth.register.description")}
      error={error}
      icon={<UserPlus className="h-5 w-5" aria-hidden />}
      footer={
        <p className="text-center text-xs text-muted-foreground">
          <Link
            href="/login"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {t("auth.register.haveAccount")}
          </Link>
        </p>
      }
    >
      {sent ? (
        <div role="status" className="space-y-2 rounded-lg border border-border bg-muted/40 p-4">
          <p className="text-sm font-medium text-foreground">{t("auth.register.sentTitle")}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("auth.register.sentBody")}
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            id="name"
            name="name"
            label={t("auth.register.name")}
            placeholder={t("auth.register.namePlaceholder")}
            autoComplete="name"
            required
            maxLength={100}
            autoFocus
            disabled={loading}
          />
          <Input
            id="email"
            name="email"
            type="email"
            label={t("auth.forgotPassword.email")}
            placeholder={t("auth.forgotPassword.emailPlaceholder")}
            autoComplete="email"
            required
            disabled={loading}
          />
          <PasswordInput
            id="password"
            name="password"
            label={t("auth.login.password")}
            placeholder="••••••••"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={128}
            disabled={loading}
          />
          <p className="text-xs text-muted-foreground">{t("auth.changePassword.hint")}</p>
          {/* Checkbox primitif Radix tanpa prop label — labelnya elemen <label>
              tersendiri supaya seluruh kalimatnya bisa diklik. */}
          <div className="flex items-start gap-2.5">
            <Checkbox
              id="terms"
              checked={terms}
              onCheckedChange={(value) => setTerms(value === true)}
              disabled={loading}
              className="mt-0.5"
            />
            <label
              htmlFor="terms"
              className="cursor-pointer text-sm leading-snug text-muted-foreground"
            >
              {t("auth.register.termsPrefix")}{" "}
              <Link
                href="/terms"
                target="_blank"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {t("auth.register.termsLinkLabel")}
              </Link>{" "}
              {t("auth.register.termsAnd")}{" "}
              <Link
                href="/privacy"
                target="_blank"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {t("auth.register.privacyLinkLabel")}
              </Link>
              .
            </label>
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={loading || !terms}>
            {loading ? t("auth.register.submitting") : t("auth.register.submit")}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
