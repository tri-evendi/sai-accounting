"use client";

/**
 * Formulir kunci buku — satu isian sandi, satu tombol.
 *
 * ⚠ TUJUAN SETELAH BERHASIL DIBERSIHKAN DI SINI, bukan dipercaya dari query.
 * `next` datang dari URL, jadi ia bisa berisi `https://situs-lain/...` atau
 * `//situs-lain`. Mengalihkan ke sana dari layar yang barusan meminta sandi
 * adalah pengalihan terbuka — bahan phishing yang matang. Karena itu hanya
 * jalur RELATIF yang diterima (`/…`, dan bukan `//…` yang bagi peramban berarti
 * host lain); apa pun selain itu jatuh ke beranda PT-nya.
 */

import { useState } from "react";
import { Flex, Typography, theme } from "antd";
import { LockOutlined } from "@ant-design/icons";

import { useAppRouter } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { apiFetch } from "@/lib/api-fetch";
import { useT } from "@/lib/i18n/client";

/** Hanya jalur di dalam aplikasi. `//host` sengaja ditolak — lihat kepala. */
function tujuanAman(next: string | undefined, fallback: string): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}

export function UnlockForm({ companySlug, next }: { companySlug: string; next?: string }) {
  const t = useT();
  const { token } = theme.useToken();
  const router = useAppRouter();

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const res = await apiFetch("/api/company-unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companySlug, password }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? t("unlock.failed"));
      setPassword("");
      setBusy(false);
      return;
    }

    /* `refresh()` sebelum pindah: penjaga membaca cookie di SERVER, dan tanpa
       ini rute yang sudah ter-cache di klien bisa dipakai ulang dengan hasil
       penjaga yang lama. */
    router.refresh();
    router.push(tujuanAman(next, `/`));
  }

  return (
    <form onSubmit={handleSubmit}>
      <Flex vertical gap={token.margin}>
        <PasswordInput
          id="unlock-password"
          label={t("unlock.passwordLabel")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          autoFocus
          required
        />

        {/* Peran `alert` di pembungkus supaya kegagalan DIUMUMKAN pembaca
            layar — teks yang hanya muncul di layar tidak pernah terdengar. */}
        {error && (
          <div role="alert">
            <Typography.Text type="danger">{error}</Typography.Text>
          </div>
        )}

        <Button type="submit" variant="primary" disabled={busy} style={{ width: "100%" }}>
          <LockOutlined aria-hidden="true" />
          {busy ? t("unlock.opening") : t("unlock.submit")}
        </Button>

        <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
          {t("unlock.hint")}
        </Typography.Text>
      </Flex>
    </form>
  );
}
