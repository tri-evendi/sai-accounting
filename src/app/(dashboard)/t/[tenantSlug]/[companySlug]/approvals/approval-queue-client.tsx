"use client";

/**
 * Antrean & keputusan persetujuan (issue #25).
 *
 * MASTER.md: status selalu badge BERTEKS (bukan warna saja), nominal
 * `tabular-nums` rata kanan dengan mata uang eksplisit, ikon `@ant-design/icons` (tanpa
 * emoji), aksi destruktif merah + konfirmasi, empty state bermakna.
 *
 * Nilai ditampilkan dua kali dan itu disengaja: dalam mata uang dokumen (yang
 * ditandatangani orang) dan dalam IDR base (yang diadu dengan ambang). Tanpa
 * keduanya, sebuah faktur USD terlihat seolah jauh di bawah ambang rupiah.
 *
 * ── Setelah migrasi AntD (issue #199) ──────────────────────────────────────
 * Tidak ada satu pun kelas Tailwind di berkas ini: tata letak lewat `Flex`,
 * jarak & ukuran lewat `theme.useToken()`, warna lewat primitif yang mewarnai
 * dirinya sendiri (`Money`, `Badge`) atau lewat token langsung.
 *
 * ── "Pengajuan Saya" ikut pindah perender (issue #229) ─────────────────────
 * Tabel itu dulu SATU-SATUNYA yang tertinggal di primitif JSX `Table`: baris
 * yang belum dibaca ditandai LATAR BARIS, dan kedua perender hanya meneruskan
 * gaya per KOLOM. Prop `rowStyle` menutup lubang itu, jadi tabelnya kini
 * `StaticTable` — bukan `DataTable`, karena aturan #189 memilih perender
 * menurut kebutuhan INTERAKTIVITAS: daftar ini pendek, tidak diurutkan, dan
 * tidak disaring; yang dibutuhkannya cuma dirender.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Flex, theme, Typography } from "antd";
import { Link } from "@/components/ui/app-link";
import { AuditOutlined, CheckCircleOutlined, CloseCircleOutlined, ExportOutlined, InboxOutlined, MailOutlined, SafetyCertificateOutlined, UndoOutlined } from "@ant-design/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable } from "@/components/ui/data-table";
import { StaticTable } from "@/components/ui/static-table";
import { textColumn, type SaiColumns } from "@/components/ui/table-columns";
import { moneyColumn } from "@/components/ui/money-column";
import { Money } from "@/components/ui/money";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";
import { wasResubmitted } from "@/lib/approvals";
import type { SystemRole } from "@/lib/constants";
import type { ApprovalRequestView } from "@/lib/approval-queue";
import { useDictionary, useT, type TranslateFn } from "@/lib/i18n/client";
import { roleLabels } from "@/lib/i18n/labels";
import { apiFetch } from "@/lib/api-fetch";

/** Lebar kotak catatan pengajuan ulang di dalam sel tabel — bekas `w-56`. */
const RESUBMIT_NOTE_WIDTH = 224;
/** Panjang minimum catatan sebelum tombol Tolak hidup (alasan wajib ditulis). */
const REJECT_NOTE_MIN = 5;

/**
 * Keputusan yang sudah dibuat tapi belum dibuka pemohonnya — inilah yang
 * ditandai latar baris di "Pengajuan Saya", dan yang dihitung lencana kartunya.
 * Satu definisi untuk keduanya supaya lencana tidak pernah menghitung baris
 * yang tidak ditandai (atau sebaliknya).
 */
function isUnread(row: ApprovalRequestView) {
  return (row.status === "approved" || row.status === "rejected") && row.readAt === null;
}

/** Badge per status — ikon + teks, tak pernah warna saja (MASTER.md §2). */
function StatusBadge({ status, label }: { status: string; label: string }) {
  /*
   * Ikon `1em` = `fontSizeSM` milik `Tag`, dan jaraknya datang dari aturan
   * `.ant-tag > svg + span` AntD — karena itu labelnya WAJIB `<span>`, bukan
   * teks telanjang (pola yang sama dengan `components/shared/aging.tsx`).
   */
  if (status === "approved") {
    return (
      <Badge variant="success">
        <CheckCircleOutlined aria-hidden="true" />
        <span>{label}</span>
      </Badge>
    );
  }
  if (status === "rejected") {
    return (
      <Badge variant="danger">
        <CloseCircleOutlined aria-hidden="true" />
        <span>{label}</span>
      </Badge>
    );
  }
  return (
    <Badge variant="warning">
      <AuditOutlined aria-hidden="true" />
      <span>{label}</span>
    </Badge>
  );
}

/** Judul baris: jenis dokumen + nomor, dengan tautan bila dokumennya punya halaman. */
function DocumentTitle({ row }: { row: ApprovalRequestView }) {
  const { token } = theme.useToken();
  const text = `${row.documentTypeLabel}${row.documentNo ? ` ${row.documentNo}` : ""}`;
  if (!row.documentHref) return <Typography.Text strong>{text}</Typography.Text>;
  return (
    <Link
      href={row.documentHref}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: token.marginXXS,
        fontWeight: token.fontWeightStrong,
        // `colorLink` = `colorBrandText` #186 (5,65:1); `colorPrimary` sebagai
        // teks hanya 4,10:1 — lihat lib/theme/antd-tokens.ts.
        color: token.colorLink,
      }}
    >
      {text}
      <ExportOutlined aria-hidden="true" />
    </Link>
  );
}

function ValueCell({ row, t }: { row: ApprovalRequestView; t: TranslateFn }) {
  const { token } = theme.useToken();
  const footnote: React.CSSProperties = {
    display: "block",
    margin: 0,
    fontSize: token.fontSizeSM,
    color: token.colorTextSecondary,
  };
  return (
    <div style={{ textAlign: "right" }}>
      <Typography.Text strong>
        <Money value={row.amount} currency={row.currency} />
      </Typography.Text>
      {row.currency !== "IDR" && (
        <p style={footnote}>
          {t("approvals.valueEquivalent")}{" "}
          <Money value={row.baseAmount} currency="IDR" style={{ fontSize: "inherit" }} />
          {row.rate
            ? ` ${t("approvals.valueRate", { rate: row.rate.toLocaleString("id-ID") })}`
            : ""}
        </p>
      )}
      <p style={footnote}>
        {t("approvals.valueThreshold")}{" "}
        <Money value={row.thresholdAmount} currency="IDR" style={{ fontSize: "inherit" }} />
      </p>
    </div>
  );
}

interface Props {
  inbox: ApprovalRequestView[];
  mine: ApprovalRequestView[];
  decided: ApprovalRequestView[];
  currentUserId: number;
}

export function ApprovalQueue({ inbox, mine, decided, currentUserId }: Props) {
  const t = useT();
  const dictionary = useDictionary();
  const { token } = theme.useToken();
  const router = useRouter();
  const { toast } = useToast();
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);

  /** Kepala kartu dengan lencana jumlah di kanan. */
  const cardHeaderStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: token.marginSM,
  };
  /** Badan kartu yang isinya tabel/daftar penuh lebar — bekas `px-0 py-0`. */
  const flushBody: React.CSSProperties = { padding: 0 };

  /**
   * Kolom riwayat keputusan. `moneyColumn` menyumbang seluruh aturan uang
   * (rata kanan, tabular-nums, id-ID, negatif merah) — `hideCurrency` dipakai
   * karena mata uangnya sudah dinyatakan sekali di judul kolom, jadi tidak
   * diulang di tiap baris.
   */
  const decidedColumns = useMemo<SaiColumns<ApprovalRequestView>>(
    () => [
      {
        key: "documentNo",
        dataIndex: "documentNo",
        title: t("common.document"),
        sorter: true,
        render: (_value, row) => (
          <>
            <DocumentTitle row={row} />
            <Typography.Text type="secondary" style={{ display: "block", fontSize: token.fontSizeSM }}>
              {t("approvals.approverPrefix", {
                role:
                  roleLabels(dictionary)[row.approverRole as SystemRole] ?? row.approverRole,
              })}
            </Typography.Text>
          </>
        ),
      },
      textColumn<ApprovalRequestView>({
        dataIndex: "requestedByName",
        title: t("approvals.colRequester"),
        sorter: true,
      }),
      moneyColumn<ApprovalRequestView>({
        dataIndex: "baseAmount",
        title: t("approvals.colValueIdr"),
        hideCurrency: true,
      }),
      {
        key: "status",
        dataIndex: "status",
        title: t("common.status"),
        sorter: true,
        render: (_value, row) => <StatusBadge status={row.status} label={row.statusLabel} />,
      },
      {
        key: "decidedAt",
        dataIndex: "decidedAt",
        title: t("approvals.colDecidedAt"),
        sorter: true,
        render: (_value, row) => (
          <div style={{ color: token.colorTextSecondary }}>
            <span
              style={{
                display: "block",
                whiteSpace: "nowrap",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {row.decidedAt ? formatDate(row.decidedAt) : "—"}
            </span>
            {row.decisionNote && (
              <span style={{ display: "block", fontSize: token.fontSizeSM }}>
                “{row.decisionNote}”
              </span>
            )}
          </div>
        ),
      },
    ],
    [t, dictionary, token]
  );

  async function decide(row: ApprovalRequestView, decision: "approve" | "reject") {
    setBusyId(row.id);
    try {
      const res = await apiFetch(`/api/approvals/${row.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: notes[row.id]?.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error || t("approvals.errDecision"), "error");
        return;
      }
      toast(
        decision === "approve"
          ? data.journalId
            ? t("approvals.approvedWithJournal")
            : t("approvals.approvedNoJournal")
          : t("approvals.rejectedToast"),
        decision === "approve" ? "success" : "info"
      );
      setNotes((prev) => ({ ...prev, [row.id]: "" }));
      router.refresh();
    } catch {
      toast(t("approvals.errDecision"), "error");
    } finally {
      setBusyId(null);
    }
  }

  /** Mengajukan ulang dokumen yang ditolak setelah diperbaiki (issue #44). */
  async function resubmit(row: ApprovalRequestView) {
    setBusyId(row.id);
    try {
      const res = await apiFetch(`/api/approvals/${row.id}/resubmit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: notes[row.id]?.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error || t("approvals.errResubmit"), "error");
        return;
      }
      toast(data.message || t("approvals.resubmitted"), "success");
      setNotes((prev) => ({ ...prev, [row.id]: "" }));
      router.refresh();
    } catch {
      toast(t("approvals.errResubmit"), "error");
    } finally {
      setBusyId(null);
    }
  }

  async function markRead(row: ApprovalRequestView) {
    setBusyId(row.id);
    try {
      const res = await apiFetch(`/api/approvals/${row.id}`, { method: "PATCH" });
      if (!res.ok) {
        toast(t("approvals.errMarkRead"), "error");
        return;
      }
      router.refresh();
    } catch {
      toast(t("approvals.errMarkRead"), "error");
    } finally {
      setBusyId(null);
    }
  }

  const unread = mine.filter(isUnread);

  /*
   * Kolom "Pengajuan Saya". SENGAJA tidak di-`useMemo`: ia menutup `notes`,
   * `busyId`, dan `markRead`/`resubmit`, yang berubah pada setiap ketikan di
   * kotak catatan — sebuah memo dengan daftar ketergantungan itu menghitung
   * ulang setiap kali juga, hanya dengan satu perbandingan tambahan.
   */
  const mineColumns: SaiColumns<ApprovalRequestView> = [
    {
      key: "documentNo",
      dataIndex: "documentNo",
      title: t("common.document"),
      render: (_value, row) => (
        <>
          <DocumentTitle row={row} />
          <Typography.Text
            type="secondary"
            style={{ display: "block", fontSize: token.fontSizeSM }}
          >
            {row.message}
          </Typography.Text>
        </>
      ),
    },
    {
      key: "createdAt",
      dataIndex: "createdAt",
      title: t("approvals.colSubmitted"),
      render: (_value, row) => (
        <span
          style={{
            whiteSpace: "nowrap",
            color: token.colorTextSecondary,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatDate(row.createdAt)}
        </span>
      ),
    },
    // Mata uang dibaca PER BARIS: pengajuan bisa bercampur IDR & valas, dan
    // menyeragamkannya di judul kolom akan mencetak "Rp" di atas angka USD.
    moneyColumn<ApprovalRequestView>({
      dataIndex: "amount",
      title: t("approvals.colValue"),
      currency: (row) => row.currency,
      sorter: false,
    }),
    {
      key: "status",
      dataIndex: "status",
      title: t("common.status"),
      render: (_value, row) => <StatusBadge status={row.status} label={row.statusLabel} />,
    },
    {
      key: "decidedAt",
      dataIndex: "decidedAt",
      title: t("approvals.colDecision"),
      render: (_value, row) =>
        row.decidedAt ? (
          <div style={{ color: token.colorTextSecondary }}>
            <span
              style={{
                display: "block",
                whiteSpace: "nowrap",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatDate(row.decidedAt)}
            </span>
            <span style={{ display: "block", fontSize: token.fontSizeSM }}>
              {t("approvals.resubmittedBy", { name: row.decidedByName ?? "" })}
            </span>
            {row.decisionNote && (
              <span style={{ display: "block", fontSize: token.fontSizeSM }}>
                “{row.decisionNote}”
              </span>
            )}
          </div>
        ) : (
          <span style={{ color: token.colorTextSecondary }}>—</span>
        ),
    },
    {
      key: "actions",
      title: "",
      align: "right",
      render: (_value, row) => (
        <Flex vertical align="flex-end" gap={token.marginXS}>
          {isUnread(row) && row.requestedById === currentUserId && (
            <Button
              variant="secondary"
              size="sm"
              disabled={busyId === row.id}
              onClick={() => markRead(row)}
            >
              <MailOutlined aria-hidden="true" />
              {t("approvals.markRead")}
            </Button>
          )}
          {/* issue #44 — dokumen yang ditolak tidak lagi buntu: perbaiki
              dokumennya, lalu ajukan ulang di sini. */}
          {row.status === "rejected" && (
            <>
              <Input
                id={`resubmit-note-${row.id}`}
                label={t("common.notesOptional")}
                placeholder={t("approvals.resubmitNotePlaceholder")}
                value={notes[row.id] ?? ""}
                onChange={(e) => setNotes((prev) => ({ ...prev, [row.id]: e.target.value }))}
                style={{ width: RESUBMIT_NOTE_WIDTH }}
              />
              {/* Aksi BARIS di dalam `.map()` — tidak pernah primer (#267).
                  Jumlahnya sebanyak dokumen yang ditolak; sepuluh blok biru
                  bukan sepuluh kali penekanan melainkan nol. */}
              <Button
                variant="secondary"
                size="sm"
                disabled={busyId === row.id}
                onClick={() => resubmit(row)}
              >
                <UndoOutlined aria-hidden="true" />
                {t("approvals.resubmit")}
              </Button>
            </>
          )}
        </Flex>
      ),
    },
  ];

  return (
    <Flex vertical gap={token.marginLG}>
      {/* ── Antrean penyetuju ── */}
      <Card data-tour="persetujuan-antrean">
        <CardHeader style={cardHeaderStyle}>
          <CardTitle>{t("approvals.inboxTitle")}</CardTitle>
          <Badge variant={inbox.length > 0 ? "warning" : "default"}>
            <span>{t("approvals.docCount", { count: inbox.length })}</span>
          </Badge>
        </CardHeader>
        <CardContent style={flushBody}>
          {inbox.length === 0 ? (
            <Flex
              vertical
              align="center"
              gap={token.marginXS}
              style={{
                paddingInline: token.paddingLG,
                paddingBlock: token.paddingXL + token.paddingSM,
                textAlign: "center",
              }}
            >
              <InboxOutlined aria-hidden="true" style={{ fontSize: token.fontSizeHeading3, color: token.colorTextSecondary }} />
              <Typography.Text type="secondary">{t("approvals.inboxEmpty")}</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                {t("approvals.inboxEmptyHint")}{" "}
                <Link
                  href="/approvals/rules"
                  style={{ color: token.colorLink, textDecoration: "underline" }}
                >
                  {t("nav.items.approvalRules")}
                </Link>
                {t("common.fullStop")}
              </Typography.Text>
            </Flex>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {inbox.map((row, index) => (
                <li
                  key={row.id}
                  style={{
                    paddingInline: token.paddingLG,
                    paddingBlock: token.padding,
                    // Garis pemisah antar-butir — bekas `divide-y divide-border`.
                    borderBlockStart:
                      index === 0 ? undefined : `1px solid ${token.colorBorderSecondary}`,
                  }}
                >
                  <Flex wrap align="flex-start" justify="space-between" gap={token.margin}>
                    <div style={{ minWidth: 0 }}>
                      <DocumentTitle row={row} />
                      <Typography.Text
                        type="secondary"
                        style={{ display: "block", marginTop: token.marginXXS }}
                      >
                        {t("approvals.submittedBy", {
                          name: row.requestedByName,
                          date: formatDate(row.createdAt),
                        })}
                      </Typography.Text>
                      {row.requestNote && (
                        <Typography.Text
                          type="secondary"
                          style={{ display: "block", marginTop: token.marginXXS }}
                        >
                          {t("approvals.requestNote", { note: row.requestNote })}
                        </Typography.Text>
                      )}
                      {/* issue #44 — pengajuan ULANG: penyetuju harus tahu bahwa
                          dokumen ini pernah ditolak dan atas alasan apa, kalau
                          tidak ia menimbangnya seolah-olah baru pertama datang.
                          `Alert` AntD (pola #194): teks `colorText` di atas latar
                          tipis + ikon, jadi maknanya tidak bergantung warna —
                          bukan lagi amber di atas amber muda. */}
                      {wasResubmitted(row) && (
                        <Alert
                          type="warning"
                          style={{ marginTop: token.marginXS }}
                          icon={<UndoOutlined aria-hidden="true" style={{ fontSize: token.fontSizeLG }} />}
                          showIcon
                          message={
                            <span>
                              <Typography.Text strong>
                                {t("approvals.resubmittedBadge")}
                              </Typography.Text>{" "}
                              {[
                                t("approvals.resubmittedPrev"),
                                row.decidedByName
                                  ? t("approvals.resubmittedBy", { name: row.decidedByName })
                                  : "",
                                row.decidedAt
                                  ? t("approvals.resubmittedOn", {
                                      date: formatDate(row.decidedAt),
                                    })
                                  : "",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              {row.decisionNote
                                ? t("approvals.resubmittedNote", { note: row.decisionNote })
                                : t("common.fullStop")}
                            </span>
                          }
                        />
                      )}
                    </div>
                    <ValueCell row={row} t={t} />
                  </Flex>

                  <div style={{ marginTop: token.marginSM }}>
                    <Label htmlFor={`note-${row.id}`} style={{ marginBottom: token.marginXXS }}>
                      {t("approvals.decisionNoteLabel")}
                    </Label>
                    <Textarea
                      id={`note-${row.id}`}
                      rows={2}
                      value={notes[row.id] ?? ""}
                      onChange={(e) =>
                        setNotes((prev) => ({ ...prev, [row.id]: e.target.value }))
                      }
                      placeholder={t("approvals.decisionNotePlaceholder")}
                    />
                    <Typography.Text
                      type="secondary"
                      style={{ display: "block", marginTop: token.marginXXS, fontSize: token.fontSizeSM }}
                    >
                      {t("approvals.decisionNoteHint")}
                    </Typography.Text>
                  </div>

                  <Flex wrap gap={token.marginXS} style={{ marginTop: token.marginSM }}>
                    <ConfirmDialog
                      title={t("approvals.approveTitle")}
                      message={t("approvals.approveMessage")}
                      confirmLabel={t("approvals.approve")}
                      confirmVariant="primary"
                      onConfirm={() => decide(row, "approve")}
                      trigger={
                        /* Aksi BARIS di dalam `.map()` — tidak pernah primer
                           (#267). Antrean berisi sepuluh dokumen akan memberi
                           sepuluh blok biru, yaitu nol penekanan.
                           Yang HILANG dengan menurunkannya: tidak ada. Aksi
                           yang mengikat tetap berisi penuh, hanya di layarnya
                           sendiri — `confirmVariant="primary"` di dalam dialog.
                           ⚠ Ini BUKAN preseden "pemicu selalu secondary": pemicu
                           ConfirmDialog berbeda dari pemicu yang membuka PANEL
                           (bedanya ditulis di MASTER.md §Aksi utama per layar);
                           yang memutuskan di sini pengulangan barisnya. */
                        <Button variant="secondary" size="sm" disabled={busyId === row.id}>
                          <CheckCircleOutlined aria-hidden="true" />
                          {t("approvals.approve")}
                        </Button>
                      }
                    />
                    {/* Aksi destruktif: tetap merah pekat DAN tetap lewat
                        ConfirmDialog — dan tetap menuntut alasan tertulis
                        sebelum tombolnya hidup (design-system/…/approvals.md). */}
                    <ConfirmDialog
                      title={t("approvals.rejectTitle")}
                      message={t("approvals.rejectMessage")}
                      confirmLabel={t("approvals.reject")}
                      confirmVariant="danger"
                      onConfirm={() => decide(row, "reject")}
                      trigger={
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={
                            busyId === row.id ||
                            (notes[row.id]?.trim().length ?? 0) < REJECT_NOTE_MIN
                          }
                        >
                          <CloseCircleOutlined aria-hidden="true" />
                          {t("approvals.reject")}
                        </Button>
                      }
                    />
                  </Flex>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── Pengajuan saya (notifikasi in-app) ── */}
      <Card data-tour="persetujuan-pengajuan">
        <CardHeader style={cardHeaderStyle}>
          <CardTitle>{t("approvals.mineTitle")}</CardTitle>
          {unread.length > 0 && (
            <Badge variant="warning">
              <span>{t("approvals.unreadBadge", { count: unread.length })}</span>
            </Badge>
          )}
        </CardHeader>
        <CardContent style={flushBody}>
          {mine.length === 0 ? (
            <Typography.Paragraph
              type="secondary"
              style={{
                margin: 0,
                paddingInline: token.paddingLG,
                paddingBlock: token.paddingXL,
                textAlign: "center",
              }}
            >
              {t("approvals.mineEmpty")}
            </Typography.Paragraph>
          ) : (
            /*
             * Penanda "belum dibaca" adalah LATAR BARIS, dan itu satu-satunya
             * tanda "ini keputusan baru" di kartu yang berperan sebagai
             * notifikasi in-app. Sampai #229 tak satu pun perender meneruskan
             * gaya per BARIS, jadi tabel ini terkunci di primitif JSX;
             * `rowStyle` yang membebaskannya.
             *
             * Warnanya bukan penanda tunggal: baris yang sama membawa tombol
             * "Tandai sudah dibaca", dan lencana di kepala kartu menghitungnya.
             */
            <StaticTable
              columns={mineColumns}
              rows={mine}
              rowKey={(row) => row.id}
              rowStyle={(row) =>
                isUnread(row) ? { background: token.colorWarningBg } : undefined
              }
            />
          )}
        </CardContent>
      </Card>

      {/* ── Riwayat keputusan peran ini ── */}
      {decided.length > 0 && (
        <Card data-tour="persetujuan-riwayat">
          <CardHeader>
            <CardTitle>
              <Flex align="center" gap={token.marginXS} style={{ display: "inline-flex" }}>
                <SafetyCertificateOutlined aria-hidden="true" style={{ color: token.colorTextSecondary }} />
                {t("approvals.historyTitle")}
              </Flex>
            </CardTitle>
          </CardHeader>
          <CardContent style={flushBody}>
            {/*
             * Satu-satunya tabel di halaman ini yang memakai DataTable, dan
             * itu disengaja: riwayat keputusan sudah termuat penuh di client,
             * dan pertanyaan yang wajar atasnya ("keputusan terbesar bulan
             * ini?") memang butuh pengurutan seketika. Tabel lain di app ini
             * dipaginasi server, jadi cukup primitif `Table`.
             */}
            <DataTable
              columns={decidedColumns}
              data={decided}
              rowKey={(row) => row.id}
              pageSize={20}
            />
          </CardContent>
        </Card>
      )}
    </Flex>
  );
}
