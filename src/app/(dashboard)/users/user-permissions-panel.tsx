"use client";

/**
 * Panel "Izin Khusus" per pengguna (issue #75) — bagian halaman manajemen
 * pengguna, pola inline-card yang sama dengan form "Create New User" di
 * `users-client.tsx` (bukan halaman baru).
 *
 * Per izin, pilihan tri-state lewat `NativeSelect` (select native — issue #50):
 *   "Ikuti peran (Boleh/Tidak)"  → tidak ada baris tersimpan (default);
 *   "Selalu boleh"               → override allowed=true;
 *   "Selalu tidak"               → override allowed=false.
 * Nilai perannya tertulis DI DALAM label "Ikuti peran" supaya pilihannya
 * berdasar informasi, bukan tebakan.
 *
 * Keputusan tampil di sini, aturan mainnya di modul murni yang sama dengan
 * server (`lib/authz-user-overrides.ts`): validasi anti-lockout & delete ⊆
 * write ⊆ read pada set FINAL dijalankan DULU di client untuk umpan balik
 * seketika, lalu server memvalidasi ulang sebagai penjaga terakhir.
 *
 * Desain (MASTER.md): label bahasa tugas + kunci izin sebagai teks muted;
 * baris yang menyimpang ditandai latar `warning-soft` DAN teks "izin khusus"
 * (tidak pernah warna saja); izin anti-lockout dinonaktifkan dengan ikon
 * gembok + penjelasan; simpan/reset lewat dialog konfirmasi; hasil lewat toast.
 */

import { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageLoader } from "@/components/ui/loading";
import { NativeSelect } from "@/components/ui/select";
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
import { ROLE_LABELS, type Role } from "@/lib/constants";
import type { Permission } from "@/lib/authz";
import {
  validateUserOverrides,
  type UserPermissionOverrideRow,
} from "@/lib/authz-user-overrides";
import { PERMISSION_LABELS, permissionGroups } from "@/lib/authz-labels";
import { Lock, RotateCcw, Save, X } from "lucide-react";

interface UserPermissionsResponse {
  user: { id: number; username: string; name: string | null; role: string };
  roleEffective: Permission[];
  overrides: Array<{ permission: string; allowed: boolean }>;
  effective: Permission[];
  lockedPermissions: string[];
}

/** Tri-state satu izin di draft. */
type Choice = "role" | "allow" | "deny";

function toDraft(overrides: Array<{ permission: string; allowed: boolean }>) {
  const draft: Partial<Record<Permission, Choice>> = {};
  for (const row of overrides) {
    draft[row.permission as Permission] = row.allowed ? "allow" : "deny";
  }
  return draft;
}

export function UserPermissionsPanel({
  userId,
  onClose,
  onSaved,
}: {
  userId: number;
  onClose: () => void;
  /** Dipanggil setelah simpan sukses — daftar pengguna me-refresh lencananya. */
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<UserPermissionsResponse | null>(null);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState<Partial<Record<Permission, Choice>>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const groups = useMemo(() => permissionGroups(), []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/users/${userId}/permissions`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(
            res.status === 403
              ? "Anda tidak punya izin mengelola hak akses."
              : res.status === 404
                ? "Pengguna tidak ditemukan."
                : "Gagal memuat izin pengguna."
          );
        }
        return (await res.json()) as UserPermissionsResponse;
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);
        setDraft(toDraft(json.overrides));
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const roleSet = useMemo(() => new Set(data?.roleEffective ?? []), [data]);
  const lockedSet = useMemo(() => new Set(data?.lockedPermissions ?? []), [data]);

  /** Baris yang dikirim ke server: hanya pilihan selain "Ikuti peran". */
  const draftOverrides: UserPermissionOverrideRow[] = useMemo(() => {
    const rows: UserPermissionOverrideRow[] = [];
    for (const group of groups) {
      for (const permission of group.permissions) {
        const choice = draft[permission] ?? "role";
        if (choice !== "role") rows.push({ permission, allowed: choice === "allow" });
      }
    }
    return rows;
  }, [draft, groups]);

  const isDirty = useMemo(() => {
    if (!data) return false;
    const saved = toDraft(data.overrides);
    return groups.some((group) =>
      group.permissions.some((p) => (draft[p] ?? "role") !== (saved[p] ?? "role"))
    );
  }, [data, draft, groups]);

  const savedOverrideCount = data?.overrides.length ?? 0;

  function setChoice(permission: Permission, choice: Choice) {
    setErrors([]);
    setDraft((prev) => ({ ...prev, [permission]: choice }));
  }

  function requestSave() {
    if (!data) return;
    const found = validateUserOverrides(data.user.role, draftOverrides, roleSet);
    setErrors(found);
    if (found.length > 0) {
      toast("Perubahan belum bisa disimpan — periksa pesan kesalahannya.", "error");
      return;
    }
    setConfirmSave(true);
  }

  async function submit(overrides: UserPermissionOverrideRow[], successMessage: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${userId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides }),
      });
      const json = await res.json();
      if (!res.ok) {
        const message = (json as { error?: string }).error ?? "Gagal menyimpan izin pengguna.";
        setErrors((json as { errors?: string[] }).errors ?? [message]);
        toast(message, "error");
        return;
      }
      const next = json as UserPermissionsResponse;
      setData(next);
      setDraft(toDraft(next.overrides));
      setErrors([]);
      toast(successMessage);
      onSaved();
    } catch {
      toast("Gagal menghubungi server. Coba lagi.", "error");
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <Card className="mb-6">
        <div className="flex items-start justify-between gap-4 p-6">
          <div className="rounded-md bg-destructive-soft p-4 text-sm text-destructive-strong">
            {loadError}
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            <X aria-hidden="true" />
            Tutup
          </Button>
        </div>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="mb-6">
        <PageLoader message="Memuat izin pengguna..." />
      </Card>
    );
  }

  const displayName = data.user.name || data.user.username;
  const roleLabel = ROLE_LABELS[data.user.role as Role] ?? data.user.role;

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex flex-wrap items-center gap-2">
              Izin Khusus — {displayName}
              {savedOverrideCount > 0 ? (
                <Badge variant="warning">{savedOverrideCount} izin khusus</Badge>
              ) : (
                <Badge>Ikuti peran</Badge>
              )}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Bawaannya pengguna mengikuti perannya ({roleLabel}). Pilihan &quot;Selalu
              boleh/tidak&quot; menang atas perannya — hanya untuk pengguna ini, berlaku
              paling lama satu menit, dan tercatat di jejak audit.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={saving || (savedOverrideCount === 0 && !isDirty)}
              onClick={() => setConfirmReset(true)}
            >
              <RotateCcw aria-hidden="true" />
              Ikuti peran sepenuhnya
            </Button>
            <Button size="sm" disabled={saving || !isDirty} onClick={requestSave}>
              <Save aria-hidden="true" />
              Simpan
            </Button>
            <Button variant="secondary" size="sm" disabled={saving} onClick={onClose}>
              <X aria-hidden="true" />
              Tutup
            </Button>
          </div>
        </div>
      </CardHeader>

      <div className="px-6 pb-6">
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
            <span
              aria-hidden="true"
              className="inline-block size-3 rounded-sm bg-warning-soft ring-1 ring-warning"
            />
            Baris bertanda <span className="font-medium text-warning-strong">izin khusus</span>{" "}
            menyimpang dari perannya
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Lock className="size-3" aria-hidden="true" />
            Terkunci: Pimpinan harus selalu bisa mengelola pengguna &amp; hak akses
          </span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table className="min-w-[560px]">
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[280px]">Izin</TableHead>
                <TableHead className="w-64">Untuk pengguna ini</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group) => (
                <UserPermissionGroupRows
                  key={group.resource}
                  label={group.label}
                  permissions={group.permissions}
                  draft={draft}
                  roleSet={roleSet}
                  lockedSet={lockedSet}
                  onChange={setChoice}
                  disabled={saving}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <ConfirmDialog
        open={confirmSave}
        onOpenChange={setConfirmSave}
        title={`Simpan izin khusus untuk ${displayName}?`}
        message={
          `${
            draftOverrides.length === 0
              ? "Semua izin kembali mengikuti perannya — izin khusus yang tersimpan akan dihapus."
              : `${draftOverrides.length} izin akan menyimpang dari perannya (${roleLabel}).`
          } ` +
          "Perubahan berlaku paling lama satu menit dan dicatat di jejak audit atas nama Anda."
        }
        confirmLabel="Simpan"
        confirmVariant="primary"
        onConfirm={() =>
          submit(
            draftOverrides,
            draftOverrides.length === 0
              ? "Pengguna kembali mengikuti perannya sepenuhnya."
              : "Izin khusus disimpan. Berlaku paling lama satu menit."
          )
        }
      />

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Ikuti peran sepenuhnya?"
        message={
          `Semua izin khusus ${displayName} dihapus dan ia kembali berizin persis seperti ` +
          `perannya (${roleLabel}). Perubahan berlaku paling lama satu menit dan dicatat di jejak audit.`
        }
        confirmLabel="Hapus izin khusus"
        confirmVariant="danger"
        onConfirm={() => submit([], "Pengguna kembali mengikuti perannya sepenuhnya.")}
      />
    </Card>
  );
}

function UserPermissionGroupRows({
  label,
  permissions,
  draft,
  roleSet,
  lockedSet,
  onChange,
  disabled,
}: {
  label: string;
  permissions: Permission[];
  draft: Partial<Record<Permission, Choice>>;
  roleSet: ReadonlySet<Permission>;
  lockedSet: ReadonlySet<string>;
  onChange: (permission: Permission, choice: Choice) => void;
  disabled: boolean;
}) {
  return (
    <>
      <TableRow className="bg-muted/60 hover:bg-muted/60">
        <TableCell colSpan={2} className="py-2 text-sm font-semibold text-foreground">
          {label}
        </TableCell>
      </TableRow>
      {permissions.map((permission) => {
        const choice = draft[permission] ?? "role";
        const changed = choice !== "role";
        const roleAllows = roleSet.has(permission);
        // Terkunci = izin anti-lockout DAN perannya memang punya: satu-satunya
        // pilihan yang dilarang adalah mencabutnya, jadi seluruh kontrolnya
        // dimatikan pada "Ikuti peran (Boleh)".
        const locked = lockedSet.has(permission);
        return (
          <TableRow key={permission} className={cn(changed && "bg-warning-soft")}>
            <TableCell>
              <div className="text-sm text-foreground">{PERMISSION_LABELS[permission]}</div>
              <div className="text-xs text-muted-foreground">{permission}</div>
            </TableCell>
            <TableCell>
              <div className="flex flex-col gap-0.5">
                <NativeSelect
                  fieldSize="sm"
                  value={choice}
                  disabled={disabled || locked}
                  onChange={(e) => onChange(permission, e.target.value as Choice)}
                  aria-label={`${PERMISSION_LABELS[permission]} untuk pengguna ini`}
                  title={
                    locked
                      ? "Terkunci — Pimpinan harus selalu bisa mengelola pengguna & hak akses."
                      : undefined
                  }
                  options={[
                    { value: "role", label: `Ikuti peran (${roleAllows ? "Boleh" : "Tidak"})` },
                    { value: "allow", label: "Selalu boleh" },
                    { value: "deny", label: "Selalu tidak" },
                  ]}
                />
                {locked && (
                  <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                    <Lock className="size-3" aria-hidden="true" />
                    terkunci
                  </span>
                )}
                {changed && !locked && (
                  <span className="text-xs font-medium text-warning-strong">izin khusus</span>
                )}
              </div>
            </TableCell>
          </TableRow>
        );
      })}
    </>
  );
}
