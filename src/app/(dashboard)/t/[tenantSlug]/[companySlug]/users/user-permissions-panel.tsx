"use client";

/**
 * Panel "Izin Khusus" per pengguna (issue #75) — bagian halaman manajemen
 * pengguna, pola inline-card yang sama dengan form "Create New User" di
 * `users-client.tsx` (bukan halaman baru).
 *
 * Per izin, pilihan tri-state lewat `NativeSelect` (issue #50):
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
 * baris yang menyimpang ditandai latar `colorWarningBg` DAN teks "izin khusus"
 * (tidak pernah warna saja); izin anti-lockout dinonaktifkan dengan ikon
 * gembok + penjelasan; simpan/reset lewat dialog konfirmasi; hasil lewat toast.
 *
 * ── Header lengket (issue #199, dipindah ke primitifnya di #229) ───────────
 * Daftar izin panjang: begitu digulir, judul kolom "Untuk pengguna ini" keluar
 * layar dan pemilih tri-state kehilangan artinya. Sejak #229 mekanismenya milik
 * primitif tabel — `<Table maxHeight>` + `<TableHead sticky>`, yang HARUS
 * dipakai bersama (alasannya di kepala `components/ui/table.tsx`) — dan berkas
 * sementara `permissions/matrix-sticky.ts` sudah dihapus. Sama persis dengan
 * matriks `/permissions`, dan dikunci `tests/permission-matrix-sticky.test.tsx`.
 */

import { useEffect, useMemo, useState } from "react";
import { Alert, Flex, theme, Typography } from "antd";
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
import { CloseOutlined, LockOutlined, SaveOutlined, UndoOutlined } from "@ant-design/icons";
import { apiFetch } from "@/lib/api-fetch";
import { moneyPalette } from "@/lib/theme/antd-tokens";

/** Lebar minimum matriks sebelum ia menggulung mendatar — bekas `min-w-[560px]`. */
const MATRIX_MIN_WIDTH = 560;
/**
 * Tinggi maksimum kotak matriks — angka yang sama dengan matriks `/permissions`
 * dan atas alasan yang sama: `vh`, karena yang menentukan berapa banyak baris
 * yang muat adalah tinggi LAYAR.
 */
const MATRIX_MAX_HEIGHT = "70vh";
/** Lebar kolom pemilih tri-state — bekas `w-64`. */
const CHOICE_COLUMN_WIDTH = 256;
/** Lebar minimum kolom nama izin — bekas `min-w-[280px]`. */
const PERMISSION_COLUMN_MIN = 280;
/** Petak warna di legenda — bekas `size-3`. */
const SWATCH = 12;

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
  const { token } = theme.useToken();
  const money = moneyPalette(token);
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
    apiFetch(`/api/users/${userId}/permissions`)
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
      const res = await apiFetch(`/api/users/${userId}/permissions`, {
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
      <Card style={{ marginBottom: token.marginLG }}>
        <Flex align="flex-start" justify="space-between" gap={token.margin} style={{ padding: token.paddingLG }}>
          <Alert type="error" showIcon message={loadError} style={{ flex: 1 }} />
          <Button variant="outline" size="sm" onClick={onClose}>
            <CloseOutlined aria-hidden="true" />
            {t("common.close")}
          </Button>
        </Flex>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card style={{ marginBottom: token.marginLG }}>
        <PageLoader message={t("users.loadingPermissions")} />
      </Card>
    );
  }

  const displayName = data.user.name || data.user.username;
  const roleLabel = roleLabels(dictionary)[data.user.role as SystemRole] ?? data.user.role;

  return (
    <Card style={{ marginBottom: token.marginLG }}>
      <CardHeader>
        <Flex wrap align="flex-start" justify="space-between" gap={token.marginSM}>
          <div>
            <CardTitle>
              <Flex wrap align="center" gap={token.marginXS} style={{ display: "inline-flex" }}>
                {t("users.panelTitle", { name: displayName })}
                {savedOverrideCount > 0 ? (
                  <Badge variant="warning">
                    <span>{t("users.overrideBadge", { count: savedOverrideCount })}</span>
                  </Badge>
                ) : (
                  <Badge>
                    <span>{t("users.followRoleBadge")}</span>
                  </Badge>
                )}
              </Flex>
            </CardTitle>
            <Typography.Text
              type="secondary"
              style={{ display: "block", marginTop: token.marginXXS }}
            >
              {t("users.panelHint", { role: roleLabel })}
            </Typography.Text>
          </div>
          <Flex wrap align="center" gap={token.marginXS}>
            <Button
              variant="outline"
              size="sm"
              disabled={saving || (savedOverrideCount === 0 && !isDirty)}
              onClick={() => setConfirmReset(true)}
            >
              <UndoOutlined aria-hidden="true" />
              {t("users.followRoleFully")}
            </Button>
            <Button size="sm" disabled={saving || !isDirty} onClick={requestSave}>
              <SaveOutlined aria-hidden="true" />
              {t("common.save")}
            </Button>
            <Button variant="secondary" size="sm" disabled={saving} onClick={onClose}>
              <CloseOutlined aria-hidden="true" />
              {t("common.close")}
            </Button>
          </Flex>
        </Flex>
      </CardHeader>

      <div style={{ paddingInline: token.paddingLG, paddingBottom: token.paddingLG }}>
        {errors.length > 0 && (
          <div role="alert">
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: token.margin }}
              message={t("users.errorsTitle")}
              description={
                <ul style={{ margin: 0, paddingInlineStart: token.paddingLG }}>
                  {errors.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              }
            />
          </div>
        )}

        <Flex
          wrap
          align="center"
          gap={token.margin}
          style={{
            marginBottom: token.margin,
            fontSize: token.fontSizeSM,
            color: token.colorTextSecondary,
          }}
        >
          <Flex align="center" gap={token.marginXXS}>
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                width: SWATCH,
                height: SWATCH,
                borderRadius: token.borderRadiusSM,
                background: token.colorWarningBg,
                border: `1px solid ${token.colorWarningBorder}`,
              }}
            />
            {t("users.legendMarkedBefore")}{" "}
            <span style={{ fontWeight: token.fontWeightStrong, color: money.colorMoneyPending }}>
              {t("users.legendOverride")}
            </span>{" "}
            {t("users.legendMarkedAfter")}
          </Flex>
          <Flex align="center" gap={token.marginXXS}>
            <LockOutlined aria-hidden="true" />
            {t("users.legendLocked")}
          </Flex>
        </Flex>

        {/* Satu kotak, bukan dua — lihat catatan yang sama di
            `permissions/permissions-client.tsx`. `stickyHead*` dikirim
            eksplisit karena panel ini berdiri di luar pohon komponen AntD. */}
        <Table
          data-permission-matrix="user"
          style={{ minWidth: MATRIX_MIN_WIDTH }}
          maxHeight={MATRIX_MAX_HEIGHT}
          containerStyle={{
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: token.borderRadiusLG,
            background: token.colorBgContainer,
          }}
          stickyHeadBackground={token.colorBgContainer}
          stickyHeadBorderColor={token.colorBorderSecondary}
        >
          <TableHeader>
            <TableRow>
              <TableHead sticky style={{ minWidth: PERMISSION_COLUMN_MIN }}>
                {t("users.colPermission")}
              </TableHead>
              <TableHead sticky style={{ width: CHOICE_COLUMN_WIDTH }}>
                {t("users.colForThisUser")}
              </TableHead>
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
  const { token } = theme.useToken();
  const money = moneyPalette(token);
  return (
    <>
      <TableRow style={{ background: token.colorFillAlter }}>
        <TableCell
          colSpan={2}
          style={{
            paddingBlock: token.paddingXS,
            fontWeight: token.fontWeightStrong,
          }}
        >
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
          <TableRow
            key={permission}
            style={changed ? { background: token.colorWarningBg } : undefined}
          >
            <TableCell>
              <div>{permissionText[permission]}</div>
              <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>
                {permission}
              </div>
            </TableCell>
            <TableCell>
              <Flex vertical gap={token.marginXXS}>
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
                  <Flex
                    align="center"
                    gap={token.marginXXS}
                    style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}
                  >
                    <LockOutlined aria-hidden="true" />
                    {t("users.lockedShort")}
                  </Flex>
                )}
                {/* Penanda kedua di samping latar baris: warna tidak pernah
                    sendirian (MASTER.md §Anti-Patterns). */}
                {changed && !locked && (
                  <span
                    style={{
                      fontSize: token.fontSizeSM,
                      fontWeight: token.fontWeightStrong,
                      color: money.colorMoneyPending,
                    }}
                  >
                    {t("users.legendOverride")}
                  </span>
                )}
              </Flex>
            </TableCell>
          </TableRow>
        );
      })}
    </>
  );
}
