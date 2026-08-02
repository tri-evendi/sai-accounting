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

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { RoleManager } from "./role-manager";
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
import { ROLE_LABELS, type Role } from "@/lib/constants";
import type { Permission } from "@/lib/authz";
import {
  isProtectedCell,
  validateOverrides,
  type PermissionOverride,
} from "@/lib/authz-overrides";
import { permissionGroups } from "@/lib/authz-labels";
import { RESOURCE_MODULE, isModuleEnabled, type BusinessModule } from "@/lib/business-modules";
import { useDictionary, useT, type TranslateFn } from "@/lib/i18n/client";
import { permissionLabels, permissionResourceLabels } from "@/lib/i18n/labels";
import { Lock, PackageX, RotateCcw, Save } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";

interface OverridesResponse {
  baseline: Record<string, string[]>;
  effective: Record<string, string[]>;
  overrides: Array<{ role: string; permission: string; allowed: boolean }>;
  /** Kolom matriks — peran dari DB (termasuk peran kustom). */
  roles: Array<{ key: string; label: string }>;
  /** issue #99 — modul yang aktif; baris modul non-aktif disembunyikan. */
  enabledModules: BusinessModule[];
}

/** Kunci sel matriks di state draft. */
const cellKey = (permission: Permission, role: Role) => `${permission}|${role}`;

/** `Record<izin, peran[]>` → draft per sel `izin|peran → boolean`. */
function toDraft(matrix: Record<string, string[]>, roleKeys: string[]): Record<string, boolean> {
  const draft: Record<string, boolean> = {};
  for (const group of permissionGroups()) {
    for (const permission of group.permissions) {
      for (const role of roleKeys) {
        draft[cellKey(permission, role)] = (matrix[permission] ?? []).includes(role);
      }
    }
  }
  return draft;
}

export function PermissionsClient() {
  const t = useT();
  const dictionary = useDictionary();
  const { toast } = useToast();
  const [data, setData] = useState<OverridesResponse | null>(null);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // Bentuk kelompok tetap dari `authz-labels.ts`; teksnya dari kamus.
  const permissionText = useMemo(() => permissionLabels(dictionary), [dictionary]);
  const resourceText = useMemo(() => permissionResourceLabels(dictionary), [dictionary]);
  const groups = useMemo(
    () =>
      permissionGroups().map((group) => ({ ...group, label: resourceText[group.resource] })),
    [resourceText]
  );
  /**
   * issue #99 — yang DIGAMBAR hanyalah kelompok milik modul yang aktif.
   *
   * Penyaringan berhenti di sini, dan itu disengaja: `groups` (lengkap) tetap
   * yang dipakai menyusun draft & daftar override yang dikirim ke server. Kalau
   * penyaringan ikut masuk ke sana, menyimpan dari halaman ini akan MENGHAPUS
   * override milik modul yang sedang mati — dan menyalakan modulnya kembali
   * akan diam-diam mengubah hak akses orang. Persis yang tidak boleh terjadi.
   */
  const enabledModules = useMemo(
    () => new Set<BusinessModule>(data?.enabledModules ?? []),
    [data]
  );
  const visibleGroups = useMemo(
    () => groups.filter((group) => isModuleEnabled(RESOURCE_MODULE[group.resource], enabledModules)),
    [groups, enabledModules]
  );
  const hiddenRowCount = useMemo(
    () =>
      groups
        .filter((group) => !visibleGroups.includes(group))
        .reduce((sum, group) => sum + group.permissions.length, 0),
    [groups, visibleGroups]
  );
  // Kolom matriks berasal dari DB (peran, termasuk kustom), bukan enum kode.
  const roleKeys = useMemo(() => (data?.roles ?? []).map((r) => r.key), [data]);
  const labelOf = (key: string) =>
    data?.roles.find((r) => r.key === key)?.label ?? ROLE_LABELS[key] ?? key;

  const loadOverrides = useCallback(async () => {
    try {
      const res = await apiFetch("/api/authz/overrides");
      if (!res.ok) {
        throw new Error(
          res.status === 403 ? t("permissions.errNoPermission") : t("permissions.errLoad")
        );
      }
      const json = (await res.json()) as OverridesResponse;
      setData(json);
      setDraft(toDraft(json.effective, json.roles.map((r) => r.key)));
    } catch (err) {
      setLoadError((err as Error).message);
    }
  }, [t]);

  useEffect(() => {
    void loadOverrides();
  }, [loadOverrides]);

  const isBaselineAllowed = (permission: Permission, role: Role) =>
    (data?.baseline[permission] ?? []).includes(role);

  /** Semua sel yang menyimpang dari BAWAAN — inilah yang dikirim ke server. */
  const draftOverrides: PermissionOverride[] = useMemo(() => {
    if (!data) return [];
    const rows: PermissionOverride[] = [];
    for (const group of groups) {
      for (const permission of group.permissions) {
        for (const role of roleKeys) {
          const allowed = draft[cellKey(permission, role)] ?? false;
          if (allowed !== (data.baseline[permission] ?? []).includes(role)) {
            rows.push({ role, permission, allowed });
          }
        }
      }
    }
    return rows;
  }, [data, draft, groups, roleKeys]);

  /** Beda terhadap keadaan TERSIMPAN (efektif server) — tombol Simpan hidup? */
  const isDirty = useMemo(() => {
    if (!data) return false;
    const saved = toDraft(data.effective, roleKeys);
    return Object.keys(draft).some((key) => draft[key] !== saved[key]);
  }, [data, draft, roleKeys]);

  const savedOverrideCount = data?.overrides.length ?? 0;

  function toggleCell(permission: Permission, role: Role, next: boolean) {
    setErrors([]);
    setDraft((prev) => ({ ...prev, [cellKey(permission, role)]: next }));
  }

  function requestSave() {
    const found = validateOverrides(draftOverrides);
    setErrors(found);
    if (found.length > 0) {
      toast(t("permissions.errSaveBlocked"), "error");
      return;
    }
    setConfirmSave(true);
  }

  async function submit(overrides: PermissionOverride[], successMessage: string) {
    setSaving(true);
    try {
      const res = await apiFetch("/api/authz/overrides", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides }),
      });
      const json = await res.json();
      if (!res.ok) {
        const message = (json as { error?: string }).error ?? t("permissions.errSave");
        setErrors((json as { errors?: string[] }).errors ?? [message]);
        toast(message, "error");
        return;
      }
      const next = json as OverridesResponse;
      setData(next);
      setDraft(toDraft(next.effective, next.roles.map((r) => r.key)));
      setErrors([]);
      toast(successMessage);
    } catch {
      toast(t("permissions.errNetwork"), "error");
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div>
        <PageHeader title={t("nav.items.permissions")} />
        <div className="rounded-md bg-destructive-soft p-4 text-sm text-destructive-strong">
          {loadError}
        </div>
      </div>
    );
  }

  if (!data) return <PageLoader message={t("permissions.loading")} />;

  return (
    <div>
      <PageHeader
        title={t("nav.items.permissions")}
        description={t("permissions.description")}
        badge={
          savedOverrideCount > 0 ? (
            <Badge variant="warning">
              {t("permissions.overrideBadge", { count: savedOverrideCount })}
            </Badge>
          ) : (
            <Badge>{t("permissions.defaultBadge")}</Badge>
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
              {t("permissions.resetToDefault")}
            </Button>
            <Button disabled={saving || !isDirty} onClick={requestSave}>
              <Save aria-hidden="true" />
              {t("common.saveChanges")}
            </Button>
          </>
        }
      />

      {/* Kelola peran (buat/ubah/hapus) — perubahan memuat ulang kolom matriks. */}
      <RoleManager onRolesChanged={loadOverrides} />

      {errors.length > 0 && (
        <div
          role="alert"
          className="mb-4 rounded-md bg-destructive-soft p-4 text-sm text-destructive-strong"
        >
          <p className="font-medium">{t("permissions.errorsTitle")}</p>
          <ul className="mt-1 list-disc pl-5">
            {errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* issue #99 — kenapa matriksnya lebih pendek dari yang diingat orang. */}
      {hiddenRowCount > 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
          <PackageX className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{t("modules.permissionsNotice", { count: hiddenRowCount })}</span>
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-3 rounded-sm bg-warning-soft ring-1 ring-warning" />
          {t("permissions.legendMarkedBefore")}{" "}
          <span className="font-medium text-warning-strong">
            {t("permissions.legendChanged")}
          </span>{" "}
          {t("permissions.legendMarkedAfter")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Lock className="size-3" aria-hidden="true" />
          {t("permissions.legendLocked")}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[280px]">{t("users.colPermission")}</TableHead>
              {(data?.roles ?? []).map((r) => (
                <TableHead key={r.key} className="w-32 text-center">
                  {r.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleGroups.map((group) => (
              <PermissionGroupRows
                key={group.resource}
                label={group.label}
                permissions={group.permissions}
                roleKeys={roleKeys}
                labelOf={labelOf}
                draft={draft}
                isBaselineAllowed={isBaselineAllowed}
                onToggle={toggleCell}
                disabled={saving}
                permissionText={permissionText}
                t={t}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={confirmSave}
        onOpenChange={setConfirmSave}
        title={t("permissions.confirmSaveTitle")}
        message={
          `${
            draftOverrides.length === 0
              ? t("permissions.confirmSaveAllDefault")
              : t("permissions.confirmSaveCount", { count: draftOverrides.length })
          } ` + t("permissions.confirmSaveTail")
        }
        confirmLabel={t("common.save")}
        onConfirm={() =>
          submit(
            draftOverrides,
            draftOverrides.length === 0
              ? t("permissions.savedDefault")
              : t("permissions.saved")
          )
        }
      />

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={t("permissions.confirmResetTitle")}
        message={t("permissions.confirmResetMessage")}
        confirmLabel={t("permissions.resetToDefault")}
        confirmVariant="danger"
        onConfirm={() => submit([], t("permissions.savedDefault"))}
      />
    </div>
  );
}

function PermissionGroupRows({
  label,
  permissions,
  roleKeys,
  labelOf,
  draft,
  isBaselineAllowed,
  onToggle,
  disabled,
  permissionText,
  t,
}: {
  label: string;
  permissions: Permission[];
  roleKeys: string[];
  labelOf: (key: string) => string;
  draft: Record<string, boolean>;
  isBaselineAllowed: (permission: Permission, role: Role) => boolean;
  onToggle: (permission: Permission, role: Role, next: boolean) => void;
  disabled: boolean;
  permissionText: Record<Permission, string>;
  t: TranslateFn;
}) {
  return (
    <>
      <TableRow className="bg-muted/60 hover:bg-muted/60">
        <TableCell colSpan={1 + roleKeys.length} className="py-2 text-sm font-semibold text-foreground">
          {label}
        </TableCell>
      </TableRow>
      {permissions.map((permission) => (
        <TableRow key={permission}>
          <TableCell>
            <div className="text-sm text-foreground">{permissionText[permission]}</div>
            <div className="text-xs text-muted-foreground">{permission}</div>
          </TableCell>
          {roleKeys.map((role) => {
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
                    aria-label={t("permissions.cellAria", {
                      role: labelOf(role),
                      permission: permissionText[permission],
                    })}
                    title={locked ? t("permissions.lockedTitle") : undefined}
                  />
                  {locked && (
                    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                      <Lock className="size-3" aria-hidden="true" />
                      {t("permissions.lockedShort")}
                    </span>
                  )}
                  {changed && !locked && (
                    <span className="text-xs font-medium text-warning-strong">
                      {t("permissions.legendChanged")}
                    </span>
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
