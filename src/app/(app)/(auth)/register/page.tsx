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
import { Alert, Flex, Typography, theme } from "antd";
import { UserAddOutlined } from "@ant-design/icons";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Checkbox } from "@/components/ui/checkbox";
import { useT } from "@/lib/i18n/client";
import { tenantSlugFrom } from "@/lib/registration";
import { moneyPalette } from "@/lib/theme/antd-tokens";

const { Text } = Typography;

/**
 * Pratinjau slug — bentuk yang SAMA dengan yang dipakai server
 * (`tenantSlugFrom`), bukan tiruan yang ditulis ulang di klien: dua fungsi
 * untuk satu aturan berarti pratinjau yang menjanjikan alamat yang tidak jadi.
 * Isian kosong menampilkan contoh, bukan string kosong yang terbaca seperti
 * galat.
 */
function slugPratinjau(nama: string): string {
  const slug = tenantSlugFrom(nama);
  return nama.trim().length === 0 || slug === "tenant" ? "nama-akun" : slug;
}

export default function RegisterPage() {
  const t = useT();
  const { token } = theme.useToken();
  const [accountName, setAccountName] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  /* Kenapa BUKAN tombol yang dinonaktifkan sampai kotaknya dicentang: tombol
   * mati tidak menjelaskan apa pun. Orang yang melewatkan kotak persetujuan
   * hanya melihat tombol yang tidak bereaksi, dan tidak ada satu pun kalimat
   * yang menyebut sebabnya — keluhan "tombol daftarnya rusak" yang sebenarnya
   * bukan kerusakan. Tombolnya kini hidup, dan penolakannya BERBICARA, tepat
   * di sebelah kotaknya. */
  const [termsError, setTermsError] = useState(false);
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState("");

  /** Gaya tautan sebaris di dalam kalimat — dipakai tiga kali di bawah. */
  const inlineLink: React.CSSProperties = { color: token.colorLink, fontWeight: 500 };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!terms) {
      setTermsError(true);
      document.getElementById("terms")?.focus();
      return;
    }
    setTermsError(false);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          accountName: formData.get("accountName"),
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
      icon={<UserAddOutlined aria-hidden style={{ fontSize: 20 }} />}
      footer={
        <Flex justify="center">
          <Link href="/login" style={{ ...inlineLink, fontSize: token.fontSizeSM }}>
            {t("auth.register.haveAccount")}
          </Link>
        </Flex>
      }
    >
      {sent ? (
        /* `Alert` AntD sudah `role="alert"` sendiri; pembungkus tak menambah apa pun — lihat /forgot-password. */
        <Alert
          type="success"
          showIcon
          message={t("auth.register.sentTitle")}
          description={t("auth.register.sentBody")}
        />
      ) : (
        <form onSubmit={handleSubmit}>
          <Flex vertical gap={token.marginMD}>
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
            {/*
              * Nama AKUN, terpisah dari nama orang (#458).
              *
              * Pratinjau alamatnya ditampilkan LANGSUNG di bawah isian, dan itu
              * bukan hiasan: slug tenant tidak bisa diubah sesudah akun lahir
              * (belum ada jalurnya — lihat #458 lingkup 3), jadi satu-satunya
              * saat orang bisa melihat akibat ketikannya adalah SEKARANG.
              */}
            <div>
              <Input
                id="accountName"
                name="accountName"
                label={t("auth.register.accountName")}
                placeholder={t("auth.register.accountNamePlaceholder")}
                autoComplete="organization"
                required
                minLength={2}
                maxLength={150}
                disabled={loading}
                onChange={(e) => setAccountName(e.currentTarget.value)}
              />
              <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                {t("auth.register.accountNameHint")}{" "}
                <span style={{ fontFamily: "var(--ant-font-family-code)" }}>
                  /t/{slugPratinjau(accountName)}/…
                </span>
              </Text>
            </div>
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
            <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
              {t("auth.changePassword.hint")}
            </Text>

            {/* Kotak persetujuan: labelnya elemen <label> tersendiri supaya
                seluruh kalimatnya (termasuk kedua tautan) bisa diklik. */}
            <Flex align="flex-start" gap={token.marginXS}>
              <Checkbox
                id="terms"
                checked={terms}
                onCheckedChange={(value) => {
                  setTerms(value === true);
                  if (value === true) setTermsError(false);
                }}
                disabled={loading}
                aria-invalid={termsError || undefined}
                aria-describedby={termsError ? "terms-error" : undefined}
                style={{ marginTop: 2 }}
              />
              <label htmlFor="terms" style={{ cursor: "pointer" }}>
                <Text type="secondary">
                  {t("auth.register.termsPrefix")}{" "}
                  <Link href="/terms" target="_blank" style={inlineLink}>
                    {t("auth.register.termsLinkLabel")}
                  </Link>{" "}
                  {t("auth.register.termsAnd")}{" "}
                  <Link href="/privacy" target="_blank" style={inlineLink}>
                    {t("auth.register.privacyLinkLabel")}
                  </Link>
                  .
                </Text>
              </label>
            </Flex>
            {/* `colorError` AntD hanya 3,27:1 sebagai teks 14px (MASTER.md
                §Ant Design sebagai KULIT) — pesan penolakan memakai token uang
                negatif, yang memang diukur untuk dibaca sebagai teks. */}
            {termsError && (
              <Text
                id="terms-error"
                role="alert"
                style={{ color: moneyPalette(token).colorMoneyNegative }}
              >
                {t("auth.register.termsRequired")}
              </Text>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              style={{ width: "100%" }}
              disabled={loading}
            >
              {loading ? t("auth.register.submitting") : t("auth.register.submit")}
            </Button>
          </Flex>
        </form>
      )}
    </AuthShell>
  );
}
