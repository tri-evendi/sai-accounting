"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { useT } from "@/lib/i18n/client";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const t = useT();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const newPassword = formData.get("newPassword") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (newPassword !== confirmPassword) {
      setError(t("auth.changePassword.mismatch"));
      setLoading(false);
      return;
    }

    if (newPassword.length < 8) {
      setError(t("auth.changePassword.tooShort"));
      setLoading(false);
      return;
    }

    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: formData.get("currentPassword"),
        newPassword,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || t("auth.changePassword.failed"));
      setLoading(false);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <AuthShell
      heading={t("auth.changePassword.heading")}
      description={t("auth.changePassword.description")}
      error={error}
      icon={<KeyRound className="h-5 w-5" aria-hidden />}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <PasswordInput
          id="currentPassword"
          name="currentPassword"
          label={t("auth.changePassword.current")}
          autoComplete="current-password"
          required
          autoFocus
          disabled={loading}
        />
        <PasswordInput
          id="newPassword"
          name="newPassword"
          label={t("auth.changePassword.new")}
          autoComplete="new-password"
          required
          disabled={loading}
        />
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          label={t("auth.changePassword.confirm")}
          autoComplete="new-password"
          required
          disabled={loading}
        />
        <p className="text-xs text-muted-foreground">{t("auth.changePassword.hint")}</p>
        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading ? t("auth.changePassword.submitting") : t("auth.changePassword.submit")}
        </Button>
      </form>
    </AuthShell>
  );
}
