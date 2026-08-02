"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("audit.title")}</CardTitle>
        <p className="text-xs text-muted-foreground font-normal mt-1">
          {t("audit.description")}
        </p>
      </CardHeader>
      <CardContent>
        {error && (
          <p className="text-sm text-destructive mb-4">{error}</p>
        )}
        {loading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{t("common.loading")}</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{t("audit.empty")}</p>
        ) : (
          /* Tabel ringkas (py-2, tanpa padding tepi) — padding rapat sengaja
             menimpa bawaan primitif agar sama dengan tampilan sebelum migrasi. */
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-auto py-2 pr-4 pl-0">{t("audit.colTime")}</TableHead>
                <TableHead className="h-auto py-2 pr-4 pl-0">{t("audit.colUser")}</TableHead>
                <TableHead className="h-auto py-2 pr-4 pl-0">{t("audit.colAction")}</TableHead>
                <TableHead className="h-auto py-2 pr-4 pl-0">{t("audit.colDetails")}</TableHead>
                <TableHead className="h-auto px-0 py-2">{t("audit.colIp")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="py-2 pr-4 pl-0 text-muted-foreground whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString("id-ID")}
                  </TableCell>
                  <TableCell className="py-2 pr-4 pl-0 font-medium">{log.username}</TableCell>
                  <TableCell className="py-2 pr-4 pl-0">
                    {actionLabel(t, log.action)}
                  </TableCell>
                  <TableCell className="py-2 pr-4 pl-0 text-muted-foreground max-w-xs truncate">
                    {formatDetails(log, t)}
                  </TableCell>
                  <TableCell className="px-0 py-2 text-muted-foreground text-xs">{log.ipAddress || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-2 border-t">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              {t("common.previous")}
            </Button>
            <span className="text-xs text-muted-foreground">
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
          </div>
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
  return JSON.stringify(d).slice(0, 80);
}
