"use client";

/**
 * Matriks Hak Akses (issue #73) — sisi client halaman /permissions.
 *
 * Matriks BAWAAN tetap di kode; halaman ini hanya mengedit PENYIMPANGANNYA
 * (override per sel) lewat `/api/authz/overrides`. Keputusan tampil di sini,
 * aturan mainnya di modul murni yang sama dengan server
 * (`lib/authz-overrides.ts`): validasi anti-lockout & delete ⊆ write ⊆ read
 * dijalankan DULU di client untuk umpan balik seketika, lalu server
 * memvalidasi ulang sebagai penjaga terakhir.
 *
 * Desain (MASTER.md): label bahasa tugas + kunci izin sebagai teks muted
 * (bukan kunci mentah saja); sel yang menyimpang dari bawaan ditandai latar
 * `warning-soft` DAN teks "diubah" (tidak pernah warna saja); sel anti-lockout
 * dinonaktifkan dengan ikon gembok + penjelasan; simpan/reset lewat dialog
 * konfirmasi; hasil lewat toast.
 */

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageLoader } from "@/components/ui/loading";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { ROLE_LABELS, ROLE_VALUES, type Role } from "@/lib/constants";
import type { Permission } from "@/lib/authz";
import {
  isProtectedCell,
  validateOverrides,
  type PermissionOverride,
} from "@/lib/authz-overrides";
import { PERMISSION_LABELS, permissionGroups } from "@/lib/authz-labels";
import { Lock, RotateCcw, Save } from "lucide-react";

interface OverridesResponse {
  baseline: Record<string, string[]>;
  effective: Record<string, string[]>;
  overrides: Array<{ role: string; permission: string; allowed: boolean }>;
}

/** Kunci sel matriks di state draft. */
const cellKey = (permission: Permission, role: Role) => `${permission}|${role}`;

/** `Record<izin, peran[]>` → draft per sel `izin|peran → boolean`. */
function toDraft(matrix: Record<string, string[]>): Record<string, boolean> {
  const draft: Record<string, boolean> = {};
  for (const group of permissionGroups()) {
    for (const permission of group.permissions) {
      for (const role of ROLE_VALUES) {
        draft[cellKey(permission, role)] = (matrix[permission] ?? []).includes(role);
      }
    }
  }
  return draft;
}

export function PermissionsClient() {
  const { toast } = useToast();
  const [data, setData] = useState<OverridesResponse | null>(null);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const groups = useMemo(() => permissionGroups(), []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/authz/overrides")
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 403 ? "Anda tidak punya izin mengelola hak akses." : "Gagal memuat hak akses.");
        return (await res.json()) as OverridesResponse;
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);
        setDraft(toDraft(json.effective));
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isBaselineAllowed = (permission: Permission, role: Role) =>
    (data?.baseline[permission] ?? []).includes(role);

  /** Semua sel yang menyimpang dari BAWAAN — inilah yang dikirim ke server. */
  const draftOverrides: PermissionOverride[] = useMemo(() => {
    if (!data) return [];
    const rows: PermissionOverride[] = [];
    for (const group of groups) {
      for (const permission of group.permissions) {
        for (const role of ROLE_VALUES) {
          const allowed = draft[cellKey(permission, role)] ?? false;
          if (allowed !== (data.baseline[permission] ?? []).includes(role)) {
            rows.push({ role, permission, allowed });
          }
        }
      }
    }
    return rows;
  }, [data, draft, groups]);

  /** Beda terhadap keadaan TERSIMPAN (efektif server) — tombol Simpan hidup? */
  const isDirty = useMemo(() => {
    if (!data) return false;
    const saved = toDraft(data.effective);
    return Object.keys(draft).some((key) => draft[key] !== saved[key]);
  }, [data, draft]);

  const savedOverrideCount = data?.overrides.length ?? 0;

  function toggleCell(permission: Permission, role: Role, next: boolean) {
    setErrors([]);
    setDraft((prev) => ({ ...prev, [cellKey(permission, role)]: next }));
  }

  function requestSave() {
    const found = validateOverrides(draftOverrides);
    setErrors(found);
    if (found.length > 0) {
      toast("Perubahan belum bisa disimpan — periksa pesan kesalahannya.", "error");
      return;
    }
    setConfirmSave(true);
  }

  async function submit(overrides: PermissionOverride[], successMessage: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/authz/overrides", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides }),
      });
      const json = await res.json();
      if (!res.ok) {
        const message = (json as { error?: string }).error ?? "Gagal menyimpan hak akses.";
        setErrors((json as { errors?: string[] }).errors ?? [message]);
        toast(message, "error");
        return;
      }
      const next = json as OverridesResponse;
      setData(next);
      setDraft(toDraft(next.effective));
      setErrors([]);
      toast(successMessage);
    } catch {
      toast("Gagal menghubungi server. Coba lagi.", "error");
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div>
        <PageHeader title="Hak Akses" />
        <div className="rounded-md bg-destructive-soft p-4 text-sm text-destructive-strong">
          {loadError}
        </div>
      </div>
    );
  }

  if (!data) return <PageLoader message="Memuat hak akses..." />;

  return (
    <div>
      <PageHeader
        title="Hak Akses"
        description={
          "Atur apa yang boleh dilakukan tiap peran. Perubahan berlaku untuk semua pengguna " +
          "peran itu paling lama satu menit setelah disimpan, dan tercatat di jejak audit."
        }
        badge={
          savedOverrideCount > 0 ? (
            <Badge variant="warning">{savedOverrideCount} penyimpangan dari bawaan</Badge>
          ) : (
            <Badge>Sesuai bawaan</Badge>
          )
        }
        actions={
          <>
            <Button
              variant="outline"
              disabled={saving || (savedOverrideCount === 0 && !isDirty)}
              onClick={() => setConfirmReset(true)}
            >
              <RotateCcw aria-hidden="true" />
              Reset ke bawaan
            </Button>
            <Button disabled={saving || !isDirty} onClick={requestSave}>
              <Save aria-hidden="true" />
              Simpan Perubahan
            </Button>
          </>
        }
      />

      {errors.length > 0 && (
        <div
          role="alert"
          className="mb-4 rounded-md bg-destructive-soft p-4 text-sm text-destructive-strong"
        >
          <p className="font-medium">Perubahan belum bisa disimpan:</p>
          <ul className="mt-1 list-disc pl-5">
            {errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-3 rounded-sm bg-warning-soft ring-1 ring-warning" />
          Sel bertanda <span className="font-medium text-warning-strong">diubah</span> menyimpang dari bawaan
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Lock className="size-3" aria-hidden="true" />
          Terkunci: Pimpinan harus selalu bisa mengelola pengguna & hak akses
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[280px]">Izin</TableHead>
              {ROLE_VALUES.map((role) => (
                <TableHead key={role} className="w-32 text-center">
                  {ROLE_LABELS[role]}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group) => (
              <PermissionGroupRows
                key={group.resource}
                label={group.label}
                permissions={group.permissions}
                draft={draft}
                isBaselineAllowed={isBaselineAllowed}
                onToggle={toggleCell}
                disabled={saving}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={confirmSave}
        onOpenChange={setConfirmSave}
        title="Simpan perubahan hak akses?"
        message={
          `${draftOverrides.length === 0
            ? "Semua sel kembali sesuai bawaan — penyimpangan yang tersimpan akan dihapus."
            : `${draftOverrides.length} sel akan menyimpang dari bawaan.`} ` +
          "Perubahan berlaku untuk semua pengguna peran terkait paling lama satu menit, " +
          "dan dicatat di jejak audit atas nama Anda."
        }
        confirmLabel="Simpan"
        onConfirm={() =>
          submit(
            draftOverrides,
            draftOverrides.length === 0
              ? "Hak akses kembali sesuai bawaan."
              : "Hak akses disimpan. Berlaku paling lama satu menit."
          )
        }
      />

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset ke bawaan?"
        message={
          "Semua penyimpangan dihapus dan setiap peran kembali ke hak akses bawaan " +
          "aplikasi. Perubahan berlaku paling lama satu menit dan dicatat di jejak audit."
        }
        confirmLabel="Reset ke bawaan"
        confirmVariant="danger"
        onConfirm={() => submit([], "Hak akses kembali sesuai bawaan.")}
      />
    </div>
  );
}

function PermissionGroupRows({
  label,
  permissions,
  draft,
  isBaselineAllowed,
  onToggle,
  disabled,
}: {
  label: string;
  permissions: Permission[];
  draft: Record<string, boolean>;
  isBaselineAllowed: (permission: Permission, role: Role) => boolean;
  onToggle: (permission: Permission, role: Role, next: boolean) => void;
  disabled: boolean;
}) {
  return (
    <>
      <TableRow className="bg-muted/60 hover:bg-muted/60">
        <TableCell colSpan={1 + ROLE_VALUES.length} className="py-2 text-sm font-semibold text-foreground">
          {label}
        </TableCell>
      </TableRow>
      {permissions.map((permission) => (
        <TableRow key={permission}>
          <TableCell>
            <div className="text-sm text-foreground">{PERMISSION_LABELS[permission]}</div>
            <div className="text-xs text-muted-foreground">{permission}</div>
          </TableCell>
          {ROLE_VALUES.map((role) => {
            const key = cellKey(permission, role);
            const allowed = draft[key] ?? false;
            const changed = allowed !== isBaselineAllowed(permission, role);
            const locked = isProtectedCell(role, permission);
            return (
              <TableCell
                key={role}
                className={cn("text-center align-middle", changed && "bg-warning-soft")}
              >
                <div className="flex min-h-10 flex-col items-center justify-center gap-0.5 py-1">
                  <Checkbox
                    checked={allowed}
                    disabled={disabled || locked}
                    onCheckedChange={(state) => onToggle(permission, role, state === true)}
                    aria-label={`${ROLE_LABELS[role]}: ${PERMISSION_LABELS[permission]}`}
                    title={
                      locked
                        ? "Terkunci — Pimpinan harus selalu bisa mengelola pengguna & hak akses."
                        : undefined
                    }
                  />
                  {locked && (
                    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                      <Lock className="size-3" aria-hidden="true" />
                      terkunci
                    </span>
                  )}
                  {changed && !locked && (
                    <span className="text-xs font-medium text-warning-strong">diubah</span>
                  )}
                </div>
              </TableCell>
            );
          })}
        </TableRow>
      ))}
    </>
  );
}
