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
import { Alert, Flex, Typography, theme } from "antd";
import { KeyOutlined } from "@ant-design/icons";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { useT } from "@/lib/i18n/client";

const { Text } = Typography;

function ResetPasswordForm() {
  const t = useT();
  const { token: designToken } = theme.useToken();
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
    <Flex justify="center">
      <Link
        href={done ? "/login" : "/forgot-password"}
        style={{
          color: designToken.colorLink,
          fontSize: designToken.fontSizeSM,
          fontWeight: 500,
        }}
      >
        {done ? t("auth.resetPassword.goLogin") : t("auth.resetPassword.requestNew")}
      </Link>
    </Flex>
  );

  return (
    <AuthShell
      heading={t("auth.resetPassword.heading")}
      description={t("auth.resetPassword.description")}
      error={error}
      icon={<KeyOutlined aria-hidden style={{ fontSize: 20 }} />}
      footer={footer}
    >
      {done ? (
        /* `Alert` AntD sudah `role="alert"` sendiri; pembungkus tak menambah apa pun — lihat /forgot-password. */
        <Alert
          type="success"
          showIcon
          message={t("auth.resetPassword.successTitle")}
          description={t("auth.resetPassword.successBody")}
        />
      ) : !token ? (
        <Text type="secondary">{t("auth.resetPassword.missingToken")}</Text>
      ) : (
        <form onSubmit={handleSubmit}>
          <Flex vertical gap={designToken.marginMD}>
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
            <Text type="secondary" style={{ fontSize: designToken.fontSizeSM }}>
              {t("auth.changePassword.hint")}
            </Text>
            <Button type="submit" size="lg" style={{ width: "100%" }} disabled={loading}>
              {loading ? t("auth.resetPassword.submitting") : t("auth.resetPassword.submit")}
            </Button>
          </Flex>
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
