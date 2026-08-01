"use client";

/**
 * Lupa kata sandi (issue #136) — pintu masuk alur atur-ulang mandiri.
 *
 * ══ JAWABANNYA SATU, APA PUN KENYATAANNYA ═══════════════════════════════════
 * Layar sesudah kirim SELALU sama: "kalau email itu terdaftar, tautannya sudah
 * dikirim". Bukan basa-basi — jawaban yang berbeda ADALAH kebocorannya:
 * siapa pun bisa menyisir alamat email dan membaca dari respons mana yang
 * punya akun di sini (docs/MULTI-TENANT.md §7.3 memakai prinsip yang sama
 * untuk undangan). Yang berbeda hanya apa yang terjadi di server, dan itu
 * tidak pernah terlihat dari luar.
 */

import { useState } from "react";
import Link from "next/link";
import { MailQuestion } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/client";

export default function ForgotPasswordPage() {
  const t = useT();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const email = new FormData(e.currentTarget).get("email");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (res.status === 429) {
        setError(t("auth.forgotPassword.tooMany"));
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? t("auth.forgotPassword.failed"));
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
      heading={t("auth.forgotPassword.heading")}
      description={t("auth.forgotPassword.description")}
      error={error}
      icon={<MailQuestion className="h-5 w-5" aria-hidden />}
      footer={
        <p className="text-center text-xs text-muted-foreground">
          <Link
            href="/login"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {t("auth.forgotPassword.backToLogin")}
          </Link>
        </p>
      }
    >
      {sent ? (
        <div role="status" className="space-y-2 rounded-lg border border-border bg-muted/40 p-4">
          <p className="text-sm font-medium text-foreground">
            {t("auth.forgotPassword.sentTitle")}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("auth.forgotPassword.sentBody")}
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            id="email"
            name="email"
            type="email"
            label={t("auth.forgotPassword.email")}
            placeholder={t("auth.forgotPassword.emailPlaceholder")}
            autoComplete="email"
            required
            autoFocus
            disabled={loading}
            aria-invalid={error ? true : undefined}
          />
          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? t("auth.forgotPassword.submitting") : t("auth.forgotPassword.submit")}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
