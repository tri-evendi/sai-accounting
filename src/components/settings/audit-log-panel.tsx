"use client";

/**
 * Panel Jejak Audit di halaman Pengaturan.
 *
 * ── Setelah AntD (issue #240, fase C9) ────────────────────────────────────
 * Tabelnya pindah dari primitif JSX `Table` ke **`StaticTable`**, dan pilihan
 * perendernya mengikuti aturan #189 — KEBUTUHAN INTERAKTIVITAS, bukan
 * kerapatan. Daftar ini dipaginasi SERVER (`/api/audit?page=`) dan tidak punya
 * satu pun kendali sortir/filter di layar, jadi `DataTable` (rc-table, +80 KB
 * gzip) hanya akan menyalin lima belas baris ke peramban dua kali. Kerapatan
 * rapatnya — dulu `py-2` yang ditulis tangan di setiap sel — kini prop
 * `size="small"`, yang memang lahir untuk menghapus alasan itu.
 *
 * Paginasinya TETAP dua tombol, bukan primitif `Pagination`: primitif itu
 * menggambar `<Link href>` sungguhan di atas URL halaman, sedangkan halaman ini
 * memegang nomor halamannya di `useState` dan memuatnya lewat `fetch`.
 */

import { useEffect, useState } from "react";
import { Flex, theme } from "antd";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { useT, type TranslateFn } from "@/lib/i18n/client";
import type { DictionaryKey } from "@/lib/i18n/dictionary";
import { apiFetch } from "@/lib/api-fetch";

interface AuditEntry {
  id: number;
  username: string;
  action: string;
  entity: string;
  entityId: number | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

const ACTION_KEYS: Record<string, DictionaryKey> = {
  "finance.create": "auditAction.finance_create",
  "stock.in": "auditAction.stock_in",
  "stock.out": "auditAction.stock_out",
  "item.create": "auditAction.item_create",
  "auth.password_change": "auditAction.auth_password_change",
  // issue #25 — approval trail. `approval.approve` is the one that releases a
  // withheld journal, so it is worth naming rather than showing raw.
  "approval.request": "auditAction.approval_request",
  "approval.approve": "auditAction.approval_approve",
  "approval.reject": "auditAction.approval_reject",
  "approval.rule.create": "auditAction.approval_rule_create",
  "approval.rule.update": "auditAction.approval_rule_update",
  "approval.rule.deactivate": "auditAction.approval_rule_deactivate",
  // issue #73 — perubahan hak akses adalah mutasi paling ber-privilege setelah
  // manajemen pengguna; layak bernama, bukan tampil mentah.
  "authz.override.update": "auditAction.authz_override_update",
  "authz.override.reset": "auditAction.authz_override_reset",
  // issue #99 — mematikan sebuah modul membuat menu hilang untuk SEMUA orang;
  // jejaknya harus terbaca sebagai kalimat, bukan kode mentah. Kuncinya sengaja
  // tinggal di namespace `modules` bersama seluruh teks fitur itu.
  "company_setting.modules.update": "modules.auditAction",
};

/** Nama tindakan; kode yang belum punya nama tampil apa adanya. */
function actionLabel(t: TranslateFn, action: string): string {
  const key = ACTION_KEYS[action];
  return key ? t(key) : action;
}

export function AuditLogPanel() {
  const t = useT();
  const { token } = theme.useToken();
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      // try/catch: fetch yang gagal di jaringan (bukan status non-OK) dulunya
      // membuat "Memuat…" tergantung selamanya karena loading tak pernah turun.
      try {
        const res = await apiFetch(`/api/audit?page=${page}&perPage=15`);
        if (cancelled) return;
        if (!res.ok) {
          setError(res.status === 403 ? t("audit.accessDenied") : t("audit.loadFailed"));
          setLoading(false);
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setLogs(data.logs);
        setTotalPages(data.totalPages);
        setLoading(false);
      } catch {
        if (cancelled) return;
        setError(t("audit.loadFailed"));
        setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [page, t]);

  const columns: SaiColumns<AuditEntry> = [
    {
      key: "time",
      title: t("audit.colTime"),
      align: "left",
      render: (_v, log) => (
        <span style={{ whiteSpace: "nowrap", color: token.colorTextSecondary }}>
          {new Date(log.createdAt).toLocaleString("id-ID")}
        </span>
      ),
    },
    {
      key: "user",
      title: t("audit.colUser"),
      align: "left",
      render: (_v, log) => <span style={{ fontWeight: 500 }}>{log.username}</span>,
    },
    {
      key: "action",
      title: t("audit.colAction"),
      align: "left",
      render: (_v, log) => actionLabel(t, log.action),
    },
    {
      key: "details",
      title: t("audit.colDetails"),
      align: "left",
      render: (_v, log) => (
        <span
          style={{
            display: "block",
            maxWidth: 320,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: token.colorTextSecondary,
          }}
        >
          {formatDetails(log, t)}
        </span>
      ),
    },
    {
      key: "ip",
      title: t("audit.colIp"),
      align: "left",
      render: (_v, log) => (
        <span style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>
          {log.ipAddress || "—"}
        </span>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle level={2}>{t("audit.title")}</CardTitle>
        <p
          style={{
            margin: 0,
            marginTop: token.marginXXS,
            fontSize: token.fontSizeSM,
            fontWeight: "normal",
            color: token.colorTextSecondary,
          }}
        >
          {t("audit.description")}
        </p>
      </CardHeader>
      <CardContent>
        {error && (
          <p role="alert" style={{ marginBottom: token.margin, color: token.colorError }}>
            {error}
          </p>
        )}
        {loading ? (
          <p
            style={{
              margin: 0,
              paddingBlock: token.paddingLG,
              textAlign: "center",
              color: token.colorTextSecondary,
            }}
          >
            {t("common.loading")}
          </p>
        ) : (
          <StaticTable
            columns={columns}
            rows={logs}
            rowKey={(log) => log.id}
            size="small"
            empty={<EmptyState title={t("audit.empty")} />}
          />
        )}
        {totalPages > 1 && (
          <Flex
            align="center"
            justify="space-between"
            style={{
              marginTop: token.margin,
              paddingTop: token.paddingXS,
              borderTop: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
            }}
          >
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              {t("common.previous")}
            </Button>
            <span style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>
              {t("table.page", { page, pages: totalPages })}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {t("common.next")}
            </Button>
          </Flex>
        )}
      </CardContent>
    </Card>
  );
}

function formatDetails(log: AuditEntry, t: TranslateFn): string {
  const d = log.details;
  if (!d) return `ID ${log.entityId ?? "—"}`;

  /*
   * Kuasa lintas-peran pada persetujuan HARUS terlihat, dan didahulukan.
   *
   * Peran berakses penuh boleh memutuskan pengajuan yang ditujukan ke peran
   * lain. Setelah pemisahan tugas ditukar dengan kelangsungan proses, jejak
   * audit adalah kendali yang tersisa — jadi pemakaiannya tidak boleh
   * tenggelam. Tanpa cabang ini, `overrodeApproverRole` hanya ikut masuk ke
   * `JSON.stringify(...).slice(0, 80)` di bawah, yang untuk detail persetujuan
   * (belasan field) hampir pasti terpotong sebelum sampai — tercatat di
   * berkas, tapi tak pernah terbaca di layar.
   */
  if (typeof d.overrodeApproverRole === "string") {
    return t("audit.overrodeApprover", { role: d.overrodeApproverRole });
  }

  if (typeof d.description === "string") return d.description;
  if (typeof d.itemName === "string") {
    return `${d.itemName} · ${d.quantity ?? ""} ${d.type ?? ""}`.trim();
  }
  if (typeof d.name === "string") return String(d.name);

  /*
   * ── Dua jejak yang dulu tercetak sebagai JSON mentah (issue #355) ─────────
   *
   * Audit produksi 13 Agustus 2026 menemukan kolom Rincian berbunyi
   * `{"coaCreated":0,"coaExisting":38,"journalNumb…` — potongan `JSON.stringify`
   * di bawah, terpotong di tengah nama field. Barisnya berasal dari
   * `setup.create`, yang detailnya memang tujuh field dan tak satu pun bernama
   * `description`/`itemName`/`name`.
   *
   * Jejak audit dibaca justru saat sedang ada masalah. Struktur data internal
   * yang bocor ke layar pada saat itu bukan cuma jelek — ia memaksa pembacanya
   * menerjemahkan nama field sendiri, tepat ketika ia paling tidak punya waktu.
   */
  if (typeof d.coaCreated === "number" && typeof d.coaExisting === "number") {
    const journal = typeof d.journalNumber === "string" ? d.journalNumber : null;
    return journal
      ? t("audit.setupDone", {
          created: d.coaCreated,
          existing: d.coaExisting,
          journal,
        })
      : t("audit.setupDonePlain");
  }

  if (Array.isArray(d.modules)) {
    return t("audit.modulesUpdated", { count: d.modules.length });
  }

  /*
   * Sisanya: KOSONG, bukan JSON.
   *
   * Godaannya adalah menyimpan `JSON.stringify` sebagai cadangan "kalau-kalau
   * berguna". Ia tidak berguna: dipotong 80 karakter, ia hampir selalu berhenti
   * di tengah field, jadi yang sampai ke pembaca adalah setengah nama kunci
   * tanpa nilainya. Kolom Tindakan sudah menyebut APA yang terjadi dan kolom
   * Waktu/Pengguna menyebut siapa & kapan; rincian yang tak punya kalimat lebih
   * jujur dinyatakan tidak ada. Jejak lengkapnya tetap utuh di basis data.
   *
   * Menambah jenis aksi baru = menambah satu cabang di atas, bukan melonggarkan
   * kembali cabang ini.
   */
  return t("audit.unavailable");
}
