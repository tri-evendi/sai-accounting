"use client";

/**
 * TUTUP BUKU TAHUNAN (issue #555) — layarnya.
 *
 * ══ TINDAKAN PALING BERAT DI HALAMAN INI ═══════════════════════════════════
 * Menutup periode BULANAN tidak memindahkan satu rupiah pun; ia hanya
 * mengunci. Yang ini memindahkan SELURUH laba setahun ke ekuitas dan menolkan
 * setiap akun laba rugi. Karena itu bentuknya dua langkah — pratinjau dulu,
 * tutup kemudian — dan pratinjaunya menyebut angka yang akan pindah beserta
 * jumlah akun yang akan dinolkan.
 *
 * ══ SATU KALIMAT YANG MENENANGKAN, DAN IA BENAR ════════════════════════════
 * "Laba Rugi tahun itu TIDAK berubah karenanya." Itu pertanyaan pertama yang
 * muncul di kepala orang yang membaca tombol ini, dan jawabannya memang ya —
 * `getIncomeStatement` mengecualikan jurnal penutup. Menuliskannya di layar
 * lebih murah daripada membiarkan orang tidak berani menekannya.
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Flex, theme } from "antd";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/loading";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { apiFetch } from "@/lib/api-fetch";
import { useT } from "@/lib/i18n/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { YearClosePlan } from "@/lib/year-close";

interface Muatan {
  year: number;
  plan: YearClosePlan;
  closed: boolean;
  reversedAt: string | null;
  /** Tahun bukunya sudah berakhir? (issue #565) */
  ended: boolean;
  /** Kapan ia berakhir — dipakai mengatakan KAPAN boleh ditutup. */
  endsAt: string | null;
}

export function YearClosePanel({ defaultYear }: { defaultYear: number }) {
  const t = useT();
  const { token } = theme.useToken();

  const [year, setYear] = useState(String(defaultYear));
  const [data, setData] = useState<Muatan | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const muat = useCallback(async () => {
    setError("");
    setDone("");
    setData(null);
    setLoading(true);
    try {
      const res = await apiFetch(`/api/periods/year-close?year=${encodeURIComponent(year)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || t("periods.yearLoadFailed"));
        return;
      }
      setData(body as Muatan);
    } finally {
      setLoading(false);
    }
  }, [year, t]);

  /* Dimuat sekali untuk tahun bawaan, supaya panel tidak berdiri kosong tanpa
     memberi tahu apa pun tentang tahun yang paling mungkin dimaksud. */
  useEffect(() => {
    void muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const kirim = useCallback(
    async (method: "POST" | "DELETE") => {
      setError("");
      setBusy(true);
      try {
        const url =
          method === "POST"
            ? "/api/periods/year-close"
            : `/api/periods/year-close?year=${encodeURIComponent(year)}`;
        const res = await apiFetch(url, {
          method,
          ...(method === "POST" ? { body: JSON.stringify({ year: Number(year) }) } : {}),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(body.error || t("periods.yearCloseFailed"));
          return;
        }
        setDone(
          t(method === "POST" ? "periods.yearClosedOk" : "periods.yearReopenedOk", { year })
        );
        await muat();
      } finally {
        setBusy(false);
      }
    },
    [year, t, muat]
  );

  const laba = data?.plan.netIncome ?? 0;

  return (
    <Card style={{ flex: "1 1 100%", minWidth: 0 }}>
      <CardHeader>
        <CardTitle level={2}>{t("periods.yearTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Flex vertical gap={token.margin}>
          <p style={{ margin: 0, color: token.colorTextSecondary }}>{t("periods.yearIntro")}</p>

          <Flex wrap gap={token.margin} align="flex-end">
            <div style={{ minWidth: 160 }}>
              <Label htmlFor="year-close-year">{t("periods.yearLabel")}</Label>
              <Input
                id="year-close-year"
                inputMode="numeric"
                value={year}
                onChange={(e) => {
                  setYear(e.target.value);
                  setData(null);
                }}
              />
            </div>
            <Button variant="secondary" onClick={muat} disabled={busy || !year}>
              {t("periods.yearPreview")}
            </Button>
          </Flex>

          {loading && <Spinner />}
          {error && <Alert type="error" showIcon message={error} />}
          {done && <Alert type="success" showIcon message={done} />}

          {data?.closed && <Alert type="info" showIcon message={t("periods.yearClosedBadge")} />}
          {!data?.closed && data?.reversedAt && (
            /* Pernah ditutup lalu dibatalkan BUKAN sama dengan belum pernah
               ditutup, dan layar yang menyamakan keduanya menyembunyikan
               riwayat yang justru menjelaskan kenapa angkanya pernah berubah. */
            <Alert type="warning" showIcon message={t("periods.yearReversedNote")} />
          )}

          {/* Tahun buku BELUM berakhir (issue #565).
              Tombolnya tidak ditawarkan sama sekali, dan alasannya disebut
              beserta TANGGAL-nya: "belum boleh" tanpa "kapan boleh" hanya
              memindahkan pertanyaannya. Pratinjaunya tetap terbaca — ia hanya
              membaca, dan "berapa laba tahun ini sejauh ini" pertanyaan yang
              sah — jadi angkanya tetap tampil, dengan keterangan bahwa ia laba
              SEMENTARA. */}
          {data && !data.closed && !data.ended && data.endsAt && (
            <Alert
              type="info"
              showIcon
              message={t("periods.yearNotEndedNote", { date: formatDate(data.endsAt) })}
            />
          )}

          {data && !data.closed && data.plan.lines.length > 0 && (
            <>
              <p style={{ margin: 0 }}>
                <span style={{ fontWeight: token.fontWeightStrong }}>
                  {t("periods.yearNetIncome")}{" "}
                </span>
                <span
                  style={{
                    fontVariantNumeric: "tabular-nums",
                    fontWeight: token.fontWeightStrong,
                    color: laba < 0 ? token.colorErrorText : token.colorSuccessText,
                  }}
                >
                  {laba > 0 ? "+" : ""}
                  {formatCurrency(laba, "IDR")}
                </span>
              </p>
              <p style={{ margin: 0, color: token.colorTextSecondary }}>
                {t("periods.yearAccounts", { count: data.plan.closedAccounts })}
              </p>

              {data.ended && (
              <div>
                {/* Dikonfirmasi, sebab ia memindahkan seluruh laba setahun ke
                    ekuitas. Pembatalannya ada, tetapi tindakan yang bisa
                    dibatalkan tetap layak ditanyakan sekali. */}
                <ConfirmDialog
                  title={t("periods.yearClose")}
                  message={t("periods.yearIntro")}
                  confirmLabel={t("periods.yearClose")}
                  onConfirm={() => kirim("POST")}
                  trigger={
                    <Button variant="primary" disabled={busy}>
                      {t("periods.yearClose")}
                    </Button>
                  }
                />
              </div>
              )}
            </>
          )}

          {data?.closed && (
            <div>
              <ConfirmDialog
                title={t("periods.yearReopen")}
                message={t("periods.yearReversedNote")}
                confirmLabel={t("periods.yearReopen")}
                onConfirm={() => kirim("DELETE")}
                trigger={
                  <Button variant="secondary" disabled={busy}>
                    {t("periods.yearReopen")}
                  </Button>
                }
              />
            </div>
          )}
        </Flex>
      </CardContent>
    </Card>
  );
}
