"use client";

/**
 * REVALUASI VALAS (issue #554) — layarnya.
 *
 * ══ KENAPA IA BERKAS SENDIRI ═══════════════════════════════════════════════
 * `period-manager.tsx` sudah 515 baris dan memikul dua alur (tutup, buka
 * kembali). Menambahkan alur ketiga ke dalamnya membuat ketiganya berbagi satu
 * `busy`/`error` dan satu daftar state yang makin sulit dibaca — dan alur yang
 * MENERBITKAN JURNAL adalah yang paling tidak pantas berbagi bendera "sedang
 * sibuk" dengan alur yang tidak.
 *
 * ══ DUA LANGKAH, DAN LANGKAH PERTAMA TIDAK MENULIS APA PUN ═════════════════
 * Pratinjau dulu, posting kemudian, dan tombolnya berbeda. Kriteria #554
 * memintanya begitu, dan alasannya lebih dari kehati-hatian: yang dimasukkan
 * orang hanyalah satu angka (kurs), tetapi akibatnya menyentuh SETIAP saldo
 * valas sekaligus. Satu tombol yang langsung memposting berarti satu salah
 * ketik yang langsung menjadi jurnal.
 *
 * ⚠ Angka yang diposting DIHITUNG ULANG di server, bukan diambil dari
 * pratinjau ini. Kalau ada transaksi mendarat di antara keduanya, yang benar
 * adalah angka buku saat posting — dan layar ini mengatakannya.
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Flex, theme } from "antd";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/loading";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { apiFetch } from "@/lib/api-fetch";
import { useT } from "@/lib/i18n/client";
import { formatCurrency } from "@/lib/utils";
import type { RevaluationLine, RevaluationPlan } from "@/lib/fx-revaluation";

export function FxRevaluationPanel({
  year,
  month,
  closed,
  onPosted,
}: {
  year: number;
  month: number;
  /** Periode tertutup tidak bisa menerima jurnal — tombolnya mati, bukan hilang. */
  closed: boolean;
  onPosted: () => void;
}) {
  const t = useT();
  const { token } = theme.useToken();

  const [currencies, setCurrencies] = useState<string[]>([]);
  const [currency, setCurrency] = useState("");
  const [rate, setRate] = useState("");
  const [plan, setPlan] = useState<RevaluationPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [posted, setPosted] = useState("");

  /* Periode berganti → semuanya dilupakan. Sebuah pratinjau yang bertahan
     melintasi pergantian bulan adalah angka bulan lain yang terbaca seperti
     angka bulan ini. */
  useEffect(() => {
    setPlan(null);
    setRate("");
    setError("");
    setPosted("");
    let batal = false;
    (async () => {
      setLoading(true);
      try {
        const res = await apiFetch(`/api/periods/fx-revaluation?year=${year}&month=${month}`);
        const data = await res.json().catch(() => ({}));
        if (batal) return;
        if (!res.ok) {
          setError(data.error || t("periods.fxLoadFailed"));
          setCurrencies([]);
          return;
        }
        setCurrencies(data.currencies ?? []);
        setCurrency(data.currencies?.[0] ?? "");
      } finally {
        if (!batal) setLoading(false);
      }
    })();
    return () => {
      batal = true;
    };
  }, [year, month, t]);

  const preview = useCallback(async () => {
    setError("");
    setPosted("");
    setPlan(null);
    setBusy(true);
    try {
      const res = await apiFetch(
        `/api/periods/fx-revaluation?year=${year}&month=${month}` +
          `&currency=${encodeURIComponent(currency)}&closingRate=${encodeURIComponent(rate)}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || t("periods.fxPreviewFailed"));
        return;
      }
      setPlan(data as RevaluationPlan);
    } finally {
      setBusy(false);
    }
  }, [year, month, currency, rate, t]);

  const post = useCallback(async () => {
    setError("");
    setBusy(true);
    try {
      const res = await apiFetch("/api/periods/fx-revaluation", {
        method: "POST",
        body: JSON.stringify({ year, month, currency, closingRate: Number(rate) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || t("periods.fxPostFailed"));
        return;
      }
      setPlan(null);
      setRate("");
      setPosted(t("periods.fxPosted", { currency }));
      /* Daftar mata uang dimuat ulang lewat perubahan periode di induknya, dan
         ringkasan pra-tutup ikut disegarkan — pemeriksaan revaluasi di sana
         baru saja berubah dari peringatan menjadi hijau. */
      onPosted();
    } finally {
      setBusy(false);
    }
  }, [year, month, currency, rate, t, onPosted]);

  const columns: SaiColumns<RevaluationLine> = [
    {
      key: "account",
      dataIndex: "accountCode",
      title: t("periods.fxColAccount"),
      align: "left",
      render: (_v, row) => (
        <span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{row.accountCode}</span>{" "}
          {row.accountName}
        </span>
      ),
    },
    {
      key: "foreign",
      dataIndex: "foreignAmount",
      title: t("periods.fxColForeign"),
      align: "right",
      render: (_v, row) => (
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {formatCurrency(row.foreignAmount, row.currency)}
        </span>
      ),
    },
    {
      key: "carrying",
      dataIndex: "carryingBase",
      title: t("periods.fxColCarrying"),
      align: "right",
      render: (_v, row) => (
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {formatCurrency(row.carryingBase, "IDR")}
        </span>
      ),
    },
    {
      key: "difference",
      dataIndex: "difference",
      title: t("periods.fxColDifference"),
      align: "right",
      /* Untung hijau, rugi merah — DAN tandanya ikut tertulis. Warna sendirian
         tidak boleh memikul makna uang (MASTER.md), dan di sini taruhannya
         paling tinggi: satu baris yang terbaca terbalik adalah jurnal yang
         disetujui terbalik. */
      render: (_v, row) => (
        <span
          style={{
            fontVariantNumeric: "tabular-nums",
            color: row.difference < 0 ? token.colorErrorText : token.colorSuccessText,
            fontWeight: token.fontWeightStrong,
          }}
        >
          {row.difference > 0 ? "+" : ""}
          {formatCurrency(row.difference, "IDR")}
        </span>
      ),
    },
  ];

  return (
    <Card style={{ flex: "1 1 100%", minWidth: 0 }}>
      <CardHeader>
        <CardTitle level={2}>{t("periods.fxTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Flex vertical gap={token.margin}>
          <p style={{ margin: 0, color: token.colorTextSecondary }}>{t("periods.fxIntro")}</p>

          {loading && <Spinner />}

          {!loading && currencies.length === 0 && !error && (
            <Alert type="info" showIcon message={t("periods.fxNoBalances")} />
          )}

          {!loading && currencies.length > 0 && (
            <Flex wrap gap={token.margin} align="flex-end">
              <div>
                <Label htmlFor="fx-currency">{t("periods.fxCurrency")}</Label>
                <Flex gap={token.marginXS} style={{ marginTop: token.marginXXS }}>
                  {currencies.map((c) => (
                    <Button
                      key={c}
                      id={c === currencies[0] ? "fx-currency" : undefined}
                      variant={c === currency ? "secondary" : "ghost"}
                      onClick={() => {
                        setCurrency(c);
                        setPlan(null);
                      }}
                    >
                      {c}
                    </Button>
                  ))}
                </Flex>
              </div>

              <div style={{ minWidth: 200 }}>
                <Label htmlFor="fx-rate">{t("periods.fxClosingRate", { currency })}</Label>
                <Input
                  id="fx-rate"
                  inputMode="decimal"
                  value={rate}
                  onChange={(e) => {
                    setRate(e.target.value);
                    setPlan(null);
                  }}
                  placeholder={t("periods.fxClosingRatePlaceholder")}
                />
              </div>

              {/* `secondary`: ia MEMBACA. Penekanan utama panel ini milik
                  "Bukukan revaluasi", satu-satunya tombol di sini yang menulis
                  jurnal — dan dua tombol berpenekanan penuh dalam satu kartu
                  membuat yang menulis tidak lagi menonjol dari yang tidak.
                  Ukurannya dibiarkan bawaan (`md`) supaya SEMUA kendali di
                  baris ini sama tinggi — dijaga `tests/control-size-row`.
                  Yang menentukan ukurannya `Input` kurs: menurunkannya ke `sm`
                  membuat medan yang justru harus diketik angka menjadi sempit,
                  jadi chip dan tombol yang naik, bukan medannya yang turun. */}
              <Button variant="secondary" onClick={preview} disabled={busy || !currency || !rate}>
                {t("periods.fxPreview")}
              </Button>
            </Flex>
          )}

          {error && <Alert type="error" showIcon message={error} />}
          {posted && <Alert type="success" showIcon message={posted} />}

          {plan && plan.lines.length === 0 && (
            /* Diam adalah keluaran yang sah, dan dikatakan apa adanya — bukan
               dibiarkan sebagai tabel kosong yang terbaca seperti kegagalan. */
            <Alert type="info" showIcon message={t("periods.fxNoChange")} />
          )}

          {plan && plan.lines.length > 0 && (
            <>
              <StaticTable
                columns={columns}
                rows={plan.lines}
                rowKey={(row) => String(row.accountId)}
              />

              <Flex wrap justify="space-between" align="center" gap={token.margin}>
                <span style={{ fontWeight: token.fontWeightStrong }}>
                  {t("periods.fxTotalDifference")}{" "}
                  <span
                    style={{
                      fontVariantNumeric: "tabular-nums",
                      color:
                        plan.totalDifference < 0 ? token.colorErrorText : token.colorSuccessText,
                    }}
                  >
                    {plan.totalDifference > 0 ? "+" : ""}
                    {formatCurrency(plan.totalDifference, "IDR")}
                  </span>
                </span>

                <Button variant="primary" onClick={post} disabled={busy || closed}>
                  {t("periods.fxPost")}
                </Button>
              </Flex>

              <p style={{ margin: 0, color: token.colorTextSecondary }}>
                {t("periods.fxRecomputedNote")}
              </p>

              {closed && <Alert type="warning" showIcon message={t("periods.fxClosedPeriod")} />}
            </>
          )}
        </Flex>
      </CardContent>
    </Card>
  );
}
