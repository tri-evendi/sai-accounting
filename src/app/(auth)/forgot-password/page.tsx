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
 *
 * ⚠ Panel "sudah dikirim" adalah SATU-SATUNYA umpan balik dari permintaan yang
 * tidak memindahkan halaman ke mana pun, jadi ia harus diumumkan pembaca layar.
 * Itu terjadi — tetapi TIDAK dengan cara yang bisa kita atur, dan itu perlu
 * ditulis supaya tidak "diperbaiki" dengan pembungkus yang tidak melakukan apa
 * pun (#200 sempat memasangnya):
 *
 *   • `Alert` AntD menuliskan `role="alert"` pada elemen akarnya sendiri, tanpa
 *     syarat (`antd/lib/alert/Alert.js`, sebelum `...restProps` disebar).
 *   • `role` yang DIOPER ke `Alert` dibuang — ia menyaring propnya lewat
 *     `pickAttrs(props, { aria: true, data: true })`, dan `role` bukan `aria-*`.
 *
 * Dua hal itu bersama berarti panel ini selalu diumumkan **asertif**, memotong
 * bacaan yang sedang berjalan, dan `role="status"` yang lebih sopan TIDAK bisa
 * dicapai selama komponennya `Alert` AntD — membungkusnya dengan `<div
 * role="status">` hanya menambah wilayah langsung kosong DI LUAR wilayah
 * asertif yang sudah ada di dalamnya. Jalan keluarnya sebuah primitif `Notice`
 * sendiri; sampai saat itu, asertif adalah harga yang kita bayar dan bukan
 * sesuatu yang hilang. Berlaku di seluruh alur auth & operator (#200).
 */

import { useState } from "react";
import Link from "next/link";
import { Alert, Flex, theme } from "antd";
import { MailQuestion } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/client";

export default function ForgotPasswordPage() {
  const t = useT();
  const { token } = theme.useToken();
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
      icon={<MailQuestion size={20} aria-hidden />}
      footer={
        <Flex justify="center">
          <Link
            href="/login"
            style={{ color: token.colorLink, fontSize: token.fontSizeSM, fontWeight: 500 }}
          >
            {t("auth.forgotPassword.backToLogin")}
          </Link>
        </Flex>
      }
    >
      {sent ? (
        /* `Alert` AntD sudah `role="alert"` sendiri; pembungkus tak menambah apa pun — lihat /forgot-password. */
        <Alert
          type="success"
          showIcon
          message={t("auth.forgotPassword.sentTitle")}
          description={t("auth.forgotPassword.sentBody")}
        />
      ) : (
        <form onSubmit={handleSubmit}>
          <Flex vertical gap={token.marginMD}>
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
            <Button type="submit" size="lg" style={{ width: "100%" }} disabled={loading}>
              {loading ? t("auth.forgotPassword.submitting") : t("auth.forgotPassword.submit")}
            </Button>
          </Flex>
        </form>
      )}
    </AuthShell>
  );
}
