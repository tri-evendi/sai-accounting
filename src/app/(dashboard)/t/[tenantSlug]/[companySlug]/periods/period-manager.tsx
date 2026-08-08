"use client";

/**
 * Tutup Buku — daftar periode + ringkasan pra-tutup.
 * Dikonversi ke token Ant Design pada issue #196.
 *
 * Kulitnya saja yang berubah; alur tutup/buka kembali (dua endpoint + muat
 * ulang ringkasan) tidak disentuh. Tiga hal yang menentukan bentuk konversinya:
 *
 *  • **Baris terpilih ditandai lewat `rowStyle`** (#229), bukan lewat kelas
 *    `bg-primary/10 hover:bg-primary/10`. Gaya SEBARIS menang atas selektor apa
 *    pun termasuk `:hover`, jadi baris terpilih tetap bertanda saat kursor
 *    lewat di atasnya — perilaku yang dulu perlu dua kelas untuk dijaga.
 *  • **Hasil pemeriksaan tetap ikon + kata + warna**, dan warnanya kini dari
 *    token (`colorSuccess`/`colorWarning`/`colorError`). Ikonnya besar-non-teks
 *    (ambang 3:1), sedangkan KATA-nya memakai varian `…Text` yang lolos ambang
 *    4,5:1 untuk teks 14px — dua ambang berbeda pada satu baris, dan itulah
 *    alasan keduanya tidak memakai token yang sama.
 *  • **Halaman ini TIDAK menyeberang**: `periods/page.tsx` tetap server
 *    component yang membaca `listPeriods()` lewat Prisma dan menyerahkannya ke
 *    sini sebagai props polos.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Col, Flex, Row, theme } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined, LockOutlined, ReloadOutlined, UnlockOutlined, WarningOutlined } from "@ant-design/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/loading";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { PeriodCheck, PeriodSummary } from "@/lib/period-close";
import { useT, type TranslateFn } from "@/lib/i18n/client";
import { apiFetch } from "@/lib/api-fetch";

interface PeriodRow {
  year: number;
  month: number;
  label: string;
  status: string;
  closedAt: string | null;
  closedByName: string | null;
  note: string | null;
}

/** Lebar dasar satu kolom panel; di bawahnya keduanya menumpuk. */
const PANEL_BASIS = 420;
/** Ikon keadaan kosong daftar periode. */
const EMPTY_ICON_SIZE = 48;
/** Panjang minimum alasan buka-kembali (tetap sama dengan sebelum migrasi). */
const MIN_REASON_LENGTH = 5;

const CHECK_LABEL_KEYS = {
  ok: "periods.checkOk",
  warning: "periods.checkWarning",
  blocker: "periods.checkBlocker",
} as const;

export function PeriodManager({ periods }: { periods: PeriodRow[] }) {
  const router = useRouter();
  const t = useT();
  const { token } = theme.useToken();

  const [selected, setSelected] = useState<{ year: number; month: number } | null>(
    periods[0] ? { year: periods[0].year, month: periods[0].month } : null
  );
  const [summary, setSummary] = useState<PeriodSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const loadSummary = useCallback(async (year: number, month: number) => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(`/api/periods/summary?year=${year}&month=${month}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || t("periods.summaryLoadFailed"));
        setSummary(null);
        return;
      }
      setSummary(await res.json());
    } catch {
      setError(t("periods.summaryLoadFailed"));
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (selected) loadSummary(selected.year, selected.month);
  }, [selected, loadSummary]);

  async function submit(url: string, body: Record<string, unknown>, fallback: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || fallback);
        return;
      }
      setNote("");
      setReason("");
      if (selected) await loadSummary(selected.year, selected.month);
      router.refresh();
    } catch {
      setError(fallback);
    } finally {
      setBusy(false);
    }
  }

  const onClose = () =>
    submit(
      "/api/periods",
      { year: summary!.year, month: summary!.month, note: note || null },
      t("periods.closeFailed")
    );

  const onReopen = () =>
    submit(
      "/api/periods/reopen",
      { year: summary!.year, month: summary!.month, reason },
      t("periods.reopenFailed")
    );

  /**
   * Ikon + warna per hasil pemeriksaan. Ikon memakai warna PENUH (ambang
   * non-teks 3:1); katanya memakai varian `…Text` (ambang teks 4,5:1).
   */
  const CHECK_STYLES: Record<
    PeriodCheck["status"],
    { Icon: typeof CheckCircleOutlined; icon: string; text: string; labelKey: keyof typeof CHECK_LABEL_KEYS }
  > = {
    ok: {
      Icon: CheckCircleOutlined,
      icon: token.colorSuccess,
      text: token.colorSuccessText,
      labelKey: "ok",
    },
    warning: {
      Icon: WarningOutlined,
      icon: token.colorWarning,
      text: token.colorWarningText,
      labelKey: "warning",
    },
    blocker: {
      Icon: CloseCircleOutlined,
      icon: token.colorError,
      text: token.colorErrorText,
      labelKey: "blocker",
    },
  };

  const statusBadge = (status: string, translate: TranslateFn) =>
    status === "closed" ? (
      <Badge variant="danger">
        <LockOutlined aria-hidden="true" />
        <span>{translate("periods.statusClosed")}</span>
      </Badge>
    ) : (
      <Badge variant="success">
        <UnlockOutlined aria-hidden="true" />
        <span>{translate("periods.statusOpen")}</span>
      </Badge>
    );

  const isSelected = (p: PeriodRow) =>
    selected?.year === p.year && selected?.month === p.month;

  const periodColumns: SaiColumns<PeriodRow> = [
    {
      key: "label",
      dataIndex: "label",
      title: t("periods.colPeriod"),
      align: "left",
      render: (_v, row) => (
        <span style={{ fontWeight: token.fontWeightStrong }}>{row.label}</span>
      ),
    },
    {
      key: "status",
      dataIndex: "status",
      title: t("common.status"),
      align: "left",
      render: (_v, row) => statusBadge(row.status, t),
    },
    {
      key: "closedAt",
      dataIndex: "closedAt",
      title: t("periods.colClosed"),
      align: "left",
      render: (_v, row) =>
        row.closedAt ? (
          <span
            style={{ fontVariantNumeric: "tabular-nums", color: token.colorTextSecondary }}
          >
            {formatDate(row.closedAt)}
            {row.closedByName && (
              <span style={{ display: "block" }}>
                <small>{t("periods.closedBy", { name: row.closedByName })}</small>
              </span>
            )}
          </span>
        ) : (
          <span style={{ color: token.colorTextSecondary }}>—</span>
        ),
    },
    {
      key: "review",
      title: "",
      align: "right",
      /* "Tinjau" memilih periode mana yang dibaca kartu ringkasan di sebelah —
         itu KEADAAN, bukan ajakan, dan bentuknya sama dengan chip saringan aktif
         yang turun di potongan 3: aktif `secondary` (berbingkai), sisanya
         `ghost` (tanpa bingkai). Sebelum #267 potongan 4 baris terpilih berisi
         penuh dan bertabrakan dengan "Tutup periode" di kartu kanan — dua blok
         biru sekaligus. Penjaganya buta di sini, dan itu DICOBA: kolom dirakit
         di luar `return`, jadi tak ada satu wadah JSX pun yang memuat keduanya
         dan `tests/button-emphasis.test.ts` tetap hijau pada pelanggarannya.
         Keadaan terpilih tidak bergantung bingkai saja: barisnya juga berlatar
         `colorPrimaryBg` dan judul kartu kanan menyebut periodenya. */
      render: (_v, row) => (
        <Button
          variant={isSelected(row) ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setSelected({ year: row.year, month: row.month })}
        >
          {t("periods.review")}
        </Button>
      ),
    },
  ];

  return (
    <Flex wrap gap={token.marginLG} align="flex-start">
      {/* ── Period list ── */}
      <Card style={{ flex: `1 1 ${PANEL_BASIS}px`, minWidth: 0 }}>
        <CardHeader>
          <CardTitle>{t("periods.listTitle")}</CardTitle>
        </CardHeader>
        <StaticTable
          columns={periodColumns}
          rows={periods}
          rowKey={(row) => `${row.year}-${row.month}`}
          /* Baris terpilih tetap bertanda meski kursor berpindah: gaya sebaris
             menang atas `:hover` milik primitifnya. */
          rowStyle={(row) =>
            isSelected(row) ? { background: token.colorPrimaryBg } : undefined
          }
          empty={
            <EmptyState
              icon={<LockOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
              title={t("periods.emptyList")}
            />
          }
        />
      </Card>

      {/* ── Pre-close summary ── */}
      <Card style={{ flex: `1 1 ${PANEL_BASIS}px`, minWidth: 0 }}>
        <CardHeader>
          <Flex wrap align="center" justify="space-between" gap={token.marginXS}>
            <CardTitle>
              {summary ? t("periods.summaryOf", { label: summary.label }) : t("periods.summaryTitle")}
            </CardTitle>
            {selected && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => loadSummary(selected.year, selected.month)}
                aria-label={t("periods.reloadSummary")}
              >
                <ReloadOutlined aria-hidden="true" />
              </Button>
            )}
          </Flex>
        </CardHeader>

        <CardContent>
          {error && (
            <div role="alert" style={{ marginBottom: token.margin }}>
              <Alert type="error" showIcon message={error} />
            </div>
          )}

          {loading && (
            <Flex justify="center" style={{ paddingBlock: token.paddingXL }}>
              <Spinner />
            </Flex>
          )}

          {!loading && !summary && !error && (
            <p
              style={{
                margin: 0,
                paddingBlock: token.paddingXL,
                textAlign: "center",
                color: token.colorTextSecondary,
              }}
            >
              {t("periods.pickPeriod")}
            </p>
          )}

          {!loading && summary && (
            <>
              <Row
                gutter={[token.margin, token.margin]}
                style={{
                  marginBottom: token.marginLG,
                  paddingBottom: token.paddingLG,
                  borderBottom: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
                }}
              >
                <Col xs={24} sm={8}>
                  <small style={{ color: token.colorTextSecondary }}>
                    {t("periods.journalCount")}
                  </small>
                  <p
                    style={{
                      margin: 0,
                      marginTop: token.marginXXS,
                      fontSize: token.fontSizeHeading4,
                      fontWeight: token.fontWeightStrong,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {summary.journalCount}
                  </p>
                </Col>
                <Col xs={12} sm={8}>
                  <small style={{ color: token.colorTextSecondary }}>
                    {t("periods.totalDebit")}
                  </small>
                  <p
                    style={{
                      margin: 0,
                      marginTop: token.marginXXS,
                      fontWeight: token.fontWeightStrong,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatCurrency(summary.totalDebit, "IDR")}
                  </p>
                </Col>
                <Col xs={12} sm={8}>
                  <small style={{ color: token.colorTextSecondary }}>
                    {t("periods.totalCredit")}
                  </small>
                  <p
                    style={{
                      margin: 0,
                      marginTop: token.marginXXS,
                      fontWeight: token.fontWeightStrong,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatCurrency(summary.totalCredit, "IDR")}
                  </p>
                </Col>
              </Row>

              <Flex vertical gap={token.marginSM} component="ul" style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {summary.checks.map((c) => {
                  const style = CHECK_STYLES[c.status];
                  const Icon = style.Icon;
                  return (
                    <li key={c.id} style={{ display: "flex", gap: token.marginSM }}>
                      <Icon aria-hidden="true" style={{ flexShrink: 0, marginTop: token.marginXXS, color: style.icon }} />
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, fontWeight: token.fontWeightStrong }}>
                          {c.label}{" "}
                          {/* Kata + warna, tak pernah warna saja. */}
                          <span style={{ fontWeight: "normal", color: style.text }}>
                            <small>· {t(CHECK_LABEL_KEYS[style.labelKey])}</small>
                          </span>
                        </p>
                        <p style={{ margin: 0, color: token.colorTextSecondary }}>{c.detail}</p>
                      </div>
                    </li>
                  );
                })}
              </Flex>

              <div
                style={{
                  marginTop: token.marginLG,
                  paddingTop: token.paddingLG,
                  borderTop: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
                }}
              >
                {summary.status === "closed" ? (
                  <Flex vertical gap={token.marginXS}>
                    <p style={{ margin: 0, color: token.colorTextSecondary }}>
                      {summary.closedAt && summary.closedByName
                        ? t("periods.lockedSinceBy", {
                            date: formatDate(summary.closedAt),
                            name: summary.closedByName,
                          })
                        : summary.closedAt
                          ? t("periods.lockedSince", { date: formatDate(summary.closedAt) })
                          : summary.closedByName
                            ? t("periods.lockedBy", { name: summary.closedByName })
                            : t("periods.lockedPlain")}
                      {summary.note && (
                        <span style={{ display: "block", marginTop: token.marginXXS }}>
                          {t("periods.noteLine", { note: summary.note })}
                        </span>
                      )}
                    </p>
                    <Label htmlFor="reopen-reason">{t("periods.reopenReasonLabel")}</Label>
                    <Textarea
                      id="reopen-reason"
                      rows={2}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={t("periods.reopenReasonPlaceholder")}
                    />
                    <p style={{ margin: 0, color: token.colorTextSecondary }}>
                      <small>{t("periods.reopenReasonHint")}</small>
                    </p>
                    <div>
                      <ConfirmDialog
                        title={t("periods.reopenTitle", { label: summary.label })}
                        message={t("periods.reopenMessage", { label: summary.label })}
                        confirmLabel={t("periods.reopenConfirm")}
                        confirmVariant="danger"
                        onConfirm={onReopen}
                        trigger={
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={busy || reason.trim().length < MIN_REASON_LENGTH}
                          >
                            <UnlockOutlined aria-hidden="true" />
                            {t("periods.reopenButton")}
                          </Button>
                        }
                      />
                    </div>
                  </Flex>
                ) : (
                  <Flex vertical gap={token.marginXS}>
                    <Label htmlFor="close-note">{t("periods.closeNoteLabel")}</Label>
                    <Textarea
                      id="close-note"
                      rows={2}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={t("periods.closeNotePlaceholder")}
                    />

                    {summary.blockerCount > 0 && (
                      <div role="alert">
                        <Alert
                          type="error"
                          showIcon
                          message={t("periods.blockerWarning", { count: summary.blockerCount })}
                        />
                      </div>
                    )}

                    <div>
                      <ConfirmDialog
                        title={t("periods.closeTitle", { label: summary.label })}
                        message={t("periods.closeMessage", { label: summary.label })}
                        confirmLabel={t("periods.closeAction")}
                        confirmVariant="primary"
                        onConfirm={onClose}
                        trigger={
                          /* Aksi utama layar ini (#267). Ia TETAP primer meski
                             "Kunci" di `reconciliation-workspace` turun di
                             potongan 3, dan bedanya bukan selera: di sana
                             penguncian menyala saat pekerjaan sesungguhnya
                             ("Cocokkan") belum selesai — di sini menutup periode
                             ADALAH pekerjaan halaman ini, dan tombolnya hanya
                             hidup ketika `summary.canClose`, yaitu ketika
                             pemeriksaannya sudah lulus. Penekanan sebagai
                             jawaban atas keadaan, bukan atas tata letak. */
                          <Button variant="primary" size="sm" disabled={busy || !summary.canClose}>
                            <LockOutlined aria-hidden="true" />
                            {t("periods.closeAction")}
                          </Button>
                        }
                      />
                    </div>
                  </Flex>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </Flex>
  );
}
