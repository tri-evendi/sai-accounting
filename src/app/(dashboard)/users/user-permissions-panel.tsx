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
import type { SystemRole } from "@/lib/constants";
import type { Permission } from "@/lib/authz";
import {
  validateUserOverrides,
  type UserPermissionOverrideRow,
} from "@/lib/authz-user-overrides";
import { permissionGroups } from "@/lib/authz-labels";
import { RESOURCE_MODULE, isModuleEnabled, type BusinessModule } from "@/lib/business-modules";
import { useDictionary, useT, type TranslateFn } from "@/lib/i18n/client";
import { permissionLabels, permissionResourceLabels, roleLabels } from "@/lib/i18n/labels";
import { Lock, RotateCcw, Save, X } from "lucide-react";

interface UserPermissionsResponse {
  user: { id: number; username: string; name: string | null; role: string };
  roleEffective: Permission[];
  overrides: Array<{ permission: string; allowed: boolean }>;
  effective: Permission[];
  lockedPermissions: string[];
  /** issue #99 — modul aktif; baris milik modul non-aktif tidak digambar. */
  enabledModules: BusinessModule[];
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
  const t = useT();
  const dictionary = useDictionary();
  const { toast } = useToast();
  const [data, setData] = useState<UserPermissionsResponse | null>(null);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState<Partial<Record<Permission, Choice>>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // Bentuk kelompok dari `authz-labels.ts`; teksnya dari kamus, jadi baris
  // matriks ikut bahasa tanpa kehilangan jaminan tipe penuhnya.
  const permissionText = useMemo(() => permissionLabels(dictionary), [dictionary]);
  const resourceText = useMemo(() => permissionResourceLabels(dictionary), [dictionary]);
  const groups = useMemo(
    () =>
      permissionGroups().map((group) => ({ ...group, label: resourceText[group.resource] })),
    [resourceText]
  );
  /**
   * issue #99 — hanya kelompok milik modul AKTIF yang digambar. Penyaringan
   * sengaja berhenti di tampilan: draft & daftar override yang dikirim ke server
   * tetap disusun dari `groups` yang lengkap, kalau tidak menyimpan dari panel
   * ini akan menghapus izin khusus milik modul yang sedang mati.
   */
  const visibleGroups = useMemo(
    () =>
      groups.filter((group) =>
        isModuleEnabled(
          RESOURCE_MODULE[group.resource],
          new Set<BusinessModule>(data?.enabledModules ?? [])
        )
      ),
    [groups, data]
  );

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/users/${userId}/permissions`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(
            res.status === 403
              ? t("users.errNoPermissionAuthz")
              : res.status === 404
                ? t("users.errUserNotFound")
                : t("users.errLoadPermissions")
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
  }, [userId, t]);

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
      toast(t("users.errSaveBlocked"), "error");
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
        const message = (json as { error?: string }).error ?? t("users.errSavePermissions");
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
      toast(t("users.errNetwork"), "error");
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
            {t("common.close")}
          </Button>
        </div>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="mb-6">
        <PageLoader message={t("users.loadingPermissions")} />
      </Card>
    );
  }

  const displayName = data.user.name || data.user.username;
  const roleLabel = roleLabels(dictionary)[data.user.role as SystemRole] ?? data.user.role;

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {t("users.panelTitle", { name: displayName })}
              {savedOverrideCount > 0 ? (
                <Badge variant="warning">
                  {t("users.overrideBadge", { count: savedOverrideCount })}
                </Badge>
              ) : (
                <Badge>{t("users.followRoleBadge")}</Badge>
              )}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("users.panelHint", { role: roleLabel })}
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
              {t("users.followRoleFully")}
            </Button>
            <Button size="sm" disabled={saving || !isDirty} onClick={requestSave}>
              <Save aria-hidden="true" />
              {t("common.save")}
            </Button>
            <Button variant="secondary" size="sm" disabled={saving} onClick={onClose}>
              <X aria-hidden="true" />
              {t("common.close")}
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
            <p className="font-medium">{t("users.errorsTitle")}</p>
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
            {t("users.legendMarkedBefore")}{" "}
            <span className="font-medium text-warning-strong">{t("users.legendOverride")}</span>{" "}
            {t("users.legendMarkedAfter")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Lock className="size-3" aria-hidden="true" />
            {t("users.legendLocked")}
          </span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table className="min-w-[560px]">
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[280px]">{t("users.colPermission")}</TableHead>
                <TableHead className="w-64">{t("users.colForThisUser")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleGroups.map((group) => (
                <UserPermissionGroupRows
                  key={group.resource}
                  label={group.label}
                  permissions={group.permissions}
                  draft={draft}
                  roleSet={roleSet}
                  lockedSet={lockedSet}
                  onChange={setChoice}
                  disabled={saving}
                  permissionText={permissionText}
                  t={t}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <ConfirmDialog
        open={confirmSave}
        onOpenChange={setConfirmSave}
        title={t("users.confirmSaveTitle", { name: displayName })}
        message={
          `${
            draftOverrides.length === 0
              ? t("users.confirmSaveAllRole")
              : t("users.confirmSaveCount", {
                  count: draftOverrides.length,
                  role: roleLabel,
                })
          } ` + t("users.confirmSaveTail")
        }
        confirmLabel={t("common.save")}
        confirmVariant="primary"
        onConfirm={() =>
          submit(
            draftOverrides,
            draftOverrides.length === 0
              ? t("users.savedFollowRole")
              : t("users.savedOverrides")
          )
        }
      />

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={t("users.confirmResetTitle")}
        message={t("users.confirmResetMessage", { name: displayName, role: roleLabel })}
        confirmLabel={t("users.confirmResetLabel")}
        confirmVariant="danger"
        onConfirm={() => submit([], t("users.savedFollowRole"))}
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
  permissionText,
  t,
}: {
  label: string;
  permissions: Permission[];
  draft: Partial<Record<Permission, Choice>>;
  roleSet: ReadonlySet<Permission>;
  lockedSet: ReadonlySet<string>;
  onChange: (permission: Permission, choice: Choice) => void;
  disabled: boolean;
  permissionText: Record<Permission, string>;
  t: TranslateFn;
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
              <div className="text-sm text-foreground">{permissionText[permission]}</div>
              <div className="text-xs text-muted-foreground">{permission}</div>
            </TableCell>
            <TableCell>
              <div className="flex flex-col gap-0.5">
                <NativeSelect
                  fieldSize="sm"
                  value={choice}
                  disabled={disabled || locked}
                  onChange={(e) => onChange(permission, e.target.value as Choice)}
                  aria-label={t("users.selectAria", { permission: permissionText[permission] })}
                  title={locked ? t("users.lockedTitle") : undefined}
                  options={[
                    {
                      value: "role",
                      label: t("users.choiceRole", {
                        state: roleAllows
                          ? t("users.choiceAllowed")
                          : t("users.choiceNotAllowed"),
                      }),
                    },
                    { value: "allow", label: t("users.choiceAlwaysAllow") },
                    { value: "deny", label: t("users.choiceAlwaysDeny") },
                  ]}
                />
                {locked && (
                  <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                    <Lock className="size-3" aria-hidden="true" />
                    {t("users.lockedShort")}
                  </span>
                )}
                {changed && !locked && (
                  <span className="text-xs font-medium text-warning-strong">
                    {t("users.legendOverride")}
                  </span>
                )}
              </div>
            </TableCell>
          </TableRow>
        );
      })}
    </>
  );
}
