"use client";

/**
 * Kartu "Data & Privasi" di Pengaturan Tenant (issue #142) — dua hak UU PDP:
 * ekspor seluruh data, dan permintaan penghapusan akun.
 *
 * Ekspor = tautan unduh biasa (`GET /api/tenant/export`) — server yang
 * menjaga izinnya dan mencatat auditnya. Permintaan penghapusan menyebut
 * KONSEKUENSINYA sebelum tombol ditekan (masa tenggang, anonimisasi, buku
 * yang TETAP tersimpan 10 tahun) dan menuntut konfirmasi eksplisit.
 *
 * ══ DUA TINDAKAN YANG TIDAK SEDERAJAT ══════════════════════════════════════
 * Keduanya dulu tampil sebagai dua kotak bertombol lebar penuh yang berurutan,
 * dan satu-satunya yang membedakan "unduh data saya" dari "hapus akun saya"
 * adalah warna tepi kotaknya. Yang kedua kini turun ke kaki kartu di atas
 * permukaan galat yang terpisah garis — bidang tersendiri yang terbaca sebagai
 * bidang tersendiri, bukan pilihan ketiga dalam satu daftar.
 * (Konfirmasinya tetap: `ConfirmDialog`, MASTER.md §Form — tombol destruktif
 * menuntut konfirmasi eksplisit.)
 *
 * Tombolnya TIDAK selebar kartu: tombol selebar kartu di layar 1024px adalah
 * target sentuh sepanjang 900px untuk satu tindakan yang tak bisa dibatalkan.
 * Sejak #200 lebar itu diatur `flexWrap` — tombolnya turun sendiri ke baris
 * berikutnya saat kalimatnya tidak muat lagi, tanpa satu pun media query.
 */

import { useEffect, useState } from "react";
import { Flex, Typography, theme } from "antd";
import { DownloadOutlined, SecurityScanOutlined } from "@ant-design/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatDate } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import { moneyPalette } from "@/lib/theme/antd-tokens";

const { Title, Text } = Typography;

interface DeletionState {
  pending: { graceEndsAt: string; createdAt: string } | null;
  graceDays: number;
}

export function PrivacySection({ canDelete }: { canDelete: boolean }) {
  const t = useT();
  const { token } = theme.useToken();
  const money = moneyPalette(token);
  const [state, setState] = useState<DeletionState | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!canDelete) return;
    let cancelled = false;
    fetch("/api/tenant/deletion-request")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: DeletionState | null) => {
        if (!cancelled && data) setState(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canDelete]);

  async function submitRequest() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/tenant/deletion-request", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? t("tenantSettings.deletionFailed"));
        return;
      }
      setState((prev) => ({
        pending: { graceEndsAt: data.graceEndsAt, createdAt: new Date().toISOString() },
        graceDays: prev?.graceDays ?? data.graceDays,
      }));
      setMessage(t("tenantSettings.deletionRequested"));
    } catch {
      setError(t("tenantSettings.deletionFailed"));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  async function cancelRequest() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/tenant/deletion-request", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? t("tenantSettings.deletionFailed"));
        return;
      }
      setState((prev) => (prev ? { ...prev, pending: null } : prev));
      setMessage(t("tenantSettings.deletionCancelled"));
    } catch {
      setError(t("tenantSettings.deletionFailed"));
    } finally {
      setBusy(false);
    }
  }

  /* Gaya "long" lewat helper bersama, bukan `Intl` yang dirakit di tempat:
   * tanggal ini menyebut hari akun sebuah badan usaha benar-benar ditutup, dan
   * satu-satunya tanggal di halaman yang gayanya ditentukan sendiri. */
  const graceDate = state?.pending ? formatDate(state.pending.graceEndsAt) : null;

  return (
    <Card>
      <CardHeader>
        <Title level={2} style={{ fontSize: token.fontSizeLG, marginBlock: 0 }}>
          {t("tenantSettings.privacyHeading")}
        </Title>
      </CardHeader>

      {/* Ekspor — tetap tersedia saat suspended; itulah gunanya secara hukum. */}
      <CardContent>
        <Flex wrap align="center" justify="space-between" gap={token.marginSM}>
          <Text type="secondary" style={{ flex: "1 1 260px", lineHeight: 1.625 }}>
            {t("tenantSettings.exportBody")}
          </Text>
          {/* `download` menempel di TOMBOLNYA sekarang, bukan di `<a>` anaknya
              — `Button href` merender `<a>` itu sendiri, jadi atribut anchor
              apa pun harus ikut pindah ke sini atau ia hilang tanpa suara. */}
          <Button href="/api/tenant/export" download variant="outline" style={{ flexShrink: 0 }}>
            <DownloadOutlined aria-hidden="true" />
            {t("tenantSettings.exportButton")}
          </Button>
        </Flex>
      </CardContent>

      {canDelete && (
        <CardFooter style={{ background: token.colorErrorBg }}>
          <Flex vertical gap={token.marginSM} style={{ width: "100%" }}>
            <Text style={{ color: money.colorMoneyNegative, lineHeight: 1.625 }}>
              {t("tenantSettings.deletionBody", { days: state?.graceDays ?? 30 })}
            </Text>

            {/* ⚠ HASILNYA DIUMUMKAN, bukan sekadar dicetak.
             *
             * Kedua kalimat ini adalah SATU-SATUNYA umpan balik dari dua
             * permintaan jaringan yang tidak memindahkan halaman ke mana pun —
             * dan salah satunya menutup akses seluruh badan usaha. Sebagai teks
             * telanjang, pembaca layar tidak mengumumkan apa pun ketika kalimat
             * itu muncul: yang menekan "Ajukan penghapusan" mendengar sunyi,
             * lalu menekan lagi. (Tetangganya, `billing-actions.tsx`, memakai
             * toast yang memang sudah punya live region; di sini kalimatnya
             * harus tinggal di tempat sebab ia menerangkan bidang di sekitarnya.)
             *
             * `alert` untuk galat (menyela — ada yang gagal dan perlu diketahui
             * sekarang), `status` untuk keberhasilan (sopan, tidak memotong). */}
            {message && (
              <Text role="status" style={{ color: money.colorMoneyPositive }}>
                {message}
              </Text>
            )}
            {error && (
              <Text role="alert" style={{ color: money.colorMoneyNegative }}>
                {error}
              </Text>
            )}

            {state?.pending ? (
              <Flex vertical align="flex-start" gap={token.marginXS}>
                <Text strong style={{ color: money.colorMoneyPending }}>
                  {t("tenantSettings.deletionPending", { date: graceDate ?? "" })}
                </Text>
                <Button variant="outline" disabled={busy} onClick={cancelRequest}>
                  {t("tenantSettings.deletionCancelButton")}
                </Button>
              </Flex>
            ) : (
              <div>
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() => setConfirming(true)}
                >
                  <SecurityScanOutlined aria-hidden="true" />
                  {t("tenantSettings.deletionRequestButton")}
                </Button>
              </div>
            )}
          </Flex>
        </CardFooter>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("tenantSettings.deletionConfirmTitle")}
        message={t("tenantSettings.deletionConfirmBody", { days: state?.graceDays ?? 30 })}
        confirmLabel={t("tenantSettings.deletionRequestButton")}
        onConfirm={submitRequest}
      />
    </Card>
  );
}
