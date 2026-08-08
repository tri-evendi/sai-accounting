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
 * `colorWarningBg` DAN teks "diubah" (tidak pernah warna saja); sel anti-lockout
 * dinonaktifkan dengan ikon gembok + penjelasan; simpan/reset lewat dialog
 * konfirmasi; hasil lewat toast.
 *
 * ── Tabel: tetap primitif JSX, dengan header LENGKET (issue #199) ──────────
 * Ini bukan tabel data melainkan GRID KENDALI: barisnya bertingkat (judul
 * kelompok yang membentang penuh, lalu izin-izinnya), setiap sel berisi
 * `Checkbox` terkendali, dan jumlah kolomnya ditentukan peran yang ada di DB.
 * `StaticTable`/`DataTable` memetakan satu baris data ke satu baris tabel, jadi
 * baris judul kelompok harus dipalsukan lewat `onCell colSpan` — lebih banyak
 * kode, untuk hasil yang sama.
 *
 * Yang justru dibutuhkan matriks ini adalah header yang tetap terbaca saat
 * digulir: satu kotak centang tanpa nama peran di atasnya tidak berarti
 * apa-apa. Sejak issue #229 mekanismenya milik PRIMITIFNYA — `<Table maxHeight>`
 * + `<TableHead sticky>` — dan berkas sementara `matrix-sticky.ts` yang dulu
 * merakitnya di sini sudah dihapus. Keduanya tetap harus dipakai BERSAMA
 * (alasannya di kepala `components/ui/table.tsx`), dan itu dikunci
 * `tests/permission-matrix-sticky.test.tsx`.
 *
 * `Checkbox` tetap dipakai dalam bentuk terkendalinya yang lama
 * (`checked` + `onCheckedChange`) — permukaan inilah yang melahirkan primitif
 * itu, dan API-nya tidak berubah di issue ini.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Flex, theme } from "antd";
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
import { CloseSquareOutlined, LockOutlined, SaveOutlined, UndoOutlined } from "@ant-design/icons";
import { apiFetch } from "@/lib/api-fetch";
import { moneyPalette } from "@/lib/theme/antd-tokens";

/** Lebar minimum matriks sebelum ia menggulung mendatar — bekas `min-w-[640px]`. */
const MATRIX_MIN_WIDTH = 640;
/**
 * Tinggi maksimum kotak matriks. `vh` dan bukan piksel: yang menentukan berapa
 * banyak baris yang muat adalah tinggi LAYAR, dan angka piksel tetap akan
 * memotong matriks di layar besar sekaligus melewati batas layar kecil. 70%
 * menyisakan ruang untuk kepala halaman, legenda, dan tombol simpan.
 */
const MATRIX_MAX_HEIGHT = "70vh";
/** Lebar satu kolom peran — bekas `w-32`. */
const ROLE_COLUMN_WIDTH = 128;
/** Lebar minimum kolom nama izin — bekas `min-w-[280px]`. */
const PERMISSION_COLUMN_MIN = 280;
/** Tinggi minimum isi sel centang — target sentuh `controlHeight` (40px). */
const CELL_MIN_HEIGHT = 40;
/** Petak warna di legenda — bekas `size-3`. */
const SWATCH = 12;

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
  const { token } = theme.useToken();
  const money = moneyPalette(token);
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
        <Alert type="error" showIcon message={loadError} />
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
              <span>{t("permissions.overrideBadge", { count: savedOverrideCount })}</span>
            </Badge>
          ) : (
            <Badge>
              <span>{t("permissions.defaultBadge")}</span>
            </Badge>
          )
        }
        actions={
          <>
            <Button
              variant="outline"
              disabled={saving || (savedOverrideCount === 0 && !isDirty)}
              onClick={() => setConfirmReset(true)}
            >
              <UndoOutlined aria-hidden="true" />
              {t("permissions.resetToDefault")}
            </Button>
            {/* Aksi utama layar ini (#267): ia yang MENGIKAT — matriks izin di
                kepala halaman. "Tambah peran" di kartu `RoleManager` di bawah
                turun ke `secondary` supaya keduanya tidak menyala bersamaan;
                tak satu pun penjaga bisa melihat pasangan itu (dua berkas). */}
            <Button variant="primary" disabled={saving || !isDirty} onClick={requestSave}>
              <SaveOutlined aria-hidden="true" />
              {t("common.saveChanges")}
            </Button>
          </>
        }
      />

      {/* Kelola peran (buat/ubah/hapus) — perubahan memuat ulang kolom matriks. */}
      <RoleManager onRolesChanged={loadOverrides} />

      {errors.length > 0 && (
        <div role="alert">
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: token.margin }}
            message={t("permissions.errorsTitle")}
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

      {/* issue #99 — kenapa matriksnya lebih pendek dari yang diingat orang. */}
      {hiddenRowCount > 0 && (
        <Alert
          type="info"
          style={{ marginBottom: token.margin }}
          icon={<CloseSquareOutlined aria-hidden="true" style={{ fontSize: token.fontSizeLG }} />}
          showIcon
          message={t("modules.permissionsNotice", { count: hiddenRowCount })}
        />
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
          {t("permissions.legendMarkedBefore")}{" "}
          <span style={{ fontWeight: token.fontWeightStrong, color: money.colorMoneyPending }}>
            {t("permissions.legendChanged")}
          </span>{" "}
          {t("permissions.legendMarkedAfter")}
        </Flex>
        <Flex align="center" gap={token.marginXXS}>
          <LockOutlined aria-hidden="true" />
          {t("permissions.legendLocked")}
        </Flex>
      </Flex>

      {/*
       * Kotak gulung & header lengket kini SATU kotak, bukan dua: `maxHeight`
       * membatasi pembungkus geser milik primitif itu sendiri. `containerStyle`
       * membawa tepi & sudut yang dulu digambar pembungkus tambahan.
       *
       * `stickyHead*` dikirim eksplisit karena matriks ini TIDAK berada di
       * dalam satu pun komponen AntD, sehingga bawaan `var(--ant-…)` milik
       * primitif tidak akan teratasi di sini — lihat kepala `ui/table.tsx`.
       *
       * Latarnya `colorTableHeadBg` sejak #266, bukan `colorBgContainer`:
       * kepala tabel di app ini bernada, dan matriks yang tetap putih adalah
       * rupa tabel kedua di satu produk — persis yang jalan B hindari.
       */}
      <Table
        data-permission-matrix="role"
        style={{ minWidth: MATRIX_MIN_WIDTH }}
        maxHeight={MATRIX_MAX_HEIGHT}
        containerStyle={{
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: token.borderRadiusLG,
          background: token.colorBgContainer,
        }}
        stickyHeadBackground={token.colorTableHeadBg}
        stickyHeadBorderColor={token.colorBorderSecondary}
      >
        <TableHeader>
          <TableRow>
            <TableHead sticky style={{ minWidth: PERMISSION_COLUMN_MIN }}>
              {t("users.colPermission")}
            </TableHead>
            {(data?.roles ?? []).map((r) => (
              <TableHead
                key={r.key}
                sticky
                style={{ width: ROLE_COLUMN_WIDTH, textAlign: "center" }}
              >
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
  const { token } = theme.useToken();
  const money = moneyPalette(token);
  return (
    <>
      <TableRow style={{ background: token.colorFillAlter }}>
        <TableCell
          colSpan={1 + roleKeys.length}
          style={{ paddingBlock: token.paddingXS, fontWeight: token.fontWeightStrong }}
        >
          {label}
        </TableCell>
      </TableRow>
      {permissions.map((permission) => (
        <TableRow key={permission}>
          <TableCell>
            <div>{permissionText[permission]}</div>
            <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>
              {permission}
            </div>
          </TableCell>
          {roleKeys.map((role) => {
            const key = cellKey(permission, role);
            const allowed = draft[key] ?? false;
            const changed = allowed !== isBaselineAllowed(permission, role);
            const locked = isProtectedCell(role, permission);
            return (
              <TableCell
                key={role}
                style={{
                  textAlign: "center",
                  verticalAlign: "middle",
                  background: changed ? token.colorWarningBg : undefined,
                }}
              >
                <Flex
                  vertical
                  align="center"
                  justify="center"
                  gap={token.marginXXS}
                  style={{ minHeight: CELL_MIN_HEIGHT, paddingBlock: token.paddingXXS }}
                >
                  {/* Bentuk terkendali yang melahirkan primitif ini
                      (`checked` + `onCheckedChange`) — sengaja tidak diubah. */}
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
                    <Flex
                      align="center"
                      gap={token.marginXXS}
                      style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}
                    >
                      <LockOutlined aria-hidden="true" />
                      {t("permissions.lockedShort")}
                    </Flex>
                  )}
                  {/* Penanda kedua di samping latar sel — warna tak pernah sendirian. */}
                  {changed && !locked && (
                    <span
                      style={{
                        fontSize: token.fontSizeSM,
                        fontWeight: token.fontWeightStrong,
                        color: money.colorMoneyPending,
                      }}
                    >
                      {t("permissions.legendChanged")}
                    </span>
                  )}
                </Flex>
              </TableCell>
            );
          })}
        </TableRow>
      ))}
    </>
  );
}
