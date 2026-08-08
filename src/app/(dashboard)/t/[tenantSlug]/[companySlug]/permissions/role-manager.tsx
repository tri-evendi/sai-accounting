"use client";

/**
 * Kelola Peran (peran dinamis) — panel di atas matriks /permissions.
 *
 * Buat peran baru (key + label), ubah nama, aktif/nonaktifkan, hapus. Peran
 * SISTEM (managing_director/finance_manager/warehouse_head/administrator)
 * terkunci dari nonaktif/hapus. Setelah perubahan apa pun
 * memanggil `onRolesChanged` agar kolom matriks izin ikut termuat ulang.
 *
 * Semua aksi lewat /api/roles (di-gate authz.manage) — sumber kebenaran DB.
 *
 * ── Setelah migrasi AntD (issue #199) ──────────────────────────────────────
 * Tanpa kelas Tailwind; kerapatan "px-4 py-2" yang dulu ditulis ulang di
 * delapan sel hilang bersamanya.
 *
 * Daftar perannya memakai `StaticTable`, BUKAN `DataTable`, meski datanya sudah
 * di client. Aturannya di MASTER.md: `DataTable` hanya untuk tabel yang
 * pengguna­nya diuntungkan sortir/filter/paginasi seketika. Daftar peran sebuah
 * PT berisi segelintir baris yang sudah terurut dari API — di sana rc-table
 * hanya menambah pustaka ke bundel halaman tanpa satu pun imbalan (terukur:
 * halaman ber-`DataTable` ±80 KB gzip lebih berat daripada yang tidak).
 */
import { useCallback, useEffect, useState } from "react";
import { Col, Flex, Row, theme, Typography } from "antd";
import { CheckOutlined, DeleteOutlined, LockOutlined, PlusOutlined, StopOutlined } from "@ant-design/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { StaticTable } from "@/components/ui/static-table";
import { type SaiColumns } from "@/components/ui/table-columns";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/lib/i18n/client";
import { apiFetch } from "@/lib/api-fetch";

/** Panjang maksimum label & kunci peran — batas yang sama ditegakkan API. */
const LABEL_MAX = 50;
const KEY_MAX = 20;

interface RoleRow {
  key: string;
  label: string;
  isSystem: boolean;
  isActive: boolean;
}

export function RoleManager({ onRolesChanged }: { onRolesChanged: () => void }) {
  const t = useT();
  const { token } = theme.useToken();
  const { toast } = useToast();
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RoleRow | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch("/api/roles");
    if (res.ok) setRoles((await res.json()) as RoleRow[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function afterChange() {
    await load();
    onRolesChanged();
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await apiFetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: newKey, label: newLabel }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error || t("permissions.errCreateRole"), "error");
        return;
      }
      setNewKey("");
      setNewLabel("");
      toast(t("permissions.roleCreated", { label: data.label }));
      await afterChange();
    } finally {
      setBusy(false);
    }
  }

  async function patch(role: RoleRow, body: { label?: string; isActive?: boolean }) {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/roles/${role.key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error || t("permissions.errPatchRole"), "error");
        return;
      }
      toast(t("permissions.roleUpdated"));
      await afterChange();
    } finally {
      setBusy(false);
    }
  }

  async function remove(role: RoleRow) {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/roles/${role.key}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error || t("permissions.errDeleteRole"), "error");
        return;
      }
      toast(t("permissions.roleDeleted", { label: role.label }), "info");
      await afterChange();
    } finally {
      setBusy(false);
    }
  }

  const roleColumns: SaiColumns<RoleRow> = [
    {
      key: "label",
      dataIndex: "label",
      title: t("permissions.colRoleName"),
      render: (_value, role) => (
        <Flex align="center" gap={token.marginXXS}>
          <Typography.Text strong>{role.label}</Typography.Text>
          {role.isSystem && (
            <LockOutlined aria-label={t("permissions.systemRoleAria")} style={{ color: token.colorTextSecondary }} />
          )}
        </Flex>
      ),
    },
    {
      key: "roleKey",
      dataIndex: "key",
      title: t("permissions.colRoleKey"),
      render: (_value, role) => (
        <Typography.Text
          type="secondary"
          code
          style={{ fontSize: token.fontSizeSM }}
        >
          {role.key}
        </Typography.Text>
      ),
    },
    {
      key: "isActive",
      dataIndex: "isActive",
      title: t("common.status"),
      render: (_value, role) => (
        <Badge variant={role.isActive ? "success" : "default"}>
          <span>{role.isActive ? t("common.active") : t("common.inactive")}</span>
        </Badge>
      ),
    },
    {
      key: "actions",
      title: "",
      align: "right",
      render: (_value, role) =>
        role.isSystem ? null : (
          <Flex align="center" justify="flex-end" gap={token.marginXS}>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => patch(role, { isActive: !role.isActive })}
            >
              {role.isActive ? (
                <>
                  <StopOutlined aria-hidden="true" />
                  {t("permissions.deactivateRole")}
                </>
              ) : (
                <>
                  <CheckOutlined aria-hidden="true" />
                  {t("permissions.activateRole")}
                </>
              )}
            </Button>
            {/* Menghapus peran mencabut akses setiap orang yang memegangnya —
                merah + konfirmasi, tak pernah satu klik. */}
            <Button
              variant="danger"
              size="sm"
              disabled={busy}
              onClick={() => setDeleteTarget(role)}
            >
              <DeleteOutlined aria-hidden="true" />
              {t("common.delete")}
            </Button>
          </Flex>
        ),
    },
  ];

  return (
    <Card style={{ marginBottom: token.marginLG }}>
      <CardHeader>
        <CardTitle>{t("permissions.roleManagerTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Flex vertical gap={token.margin}>
          <Typography.Text type="secondary">
            {t("permissions.roleManagerHint")}
          </Typography.Text>

          {/* Daftar peran */}
          <div
            style={{
              border: `1px solid ${token.colorBorderSecondary}`,
              borderRadius: token.borderRadiusLG,
              overflow: "hidden",
            }}
          >
            <StaticTable columns={roleColumns} rows={roles} rowKey={(role) => role.key} />
          </div>

          {/* Tambah peran */}
          <form onSubmit={create}>
            <Row gutter={[token.marginSM, token.marginSM]} align="bottom">
              <Col xs={24} sm={10}>
                <Flex vertical gap={token.marginXXS}>
                  <Label htmlFor="new-role-label">{t("permissions.roleNameField")}</Label>
                  <TextInput
                    id="new-role-label"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder={t("permissions.roleNamePlaceholder")}
                    maxLength={LABEL_MAX}
                    required
                  />
                </Flex>
              </Col>
              <Col xs={24} sm={10}>
                <Flex vertical gap={token.marginXXS}>
                  <Label htmlFor="new-role-key">{t("permissions.roleKeyField")}</Label>
                  <TextInput
                    id="new-role-key"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value.toLowerCase())}
                    placeholder={t("permissions.roleKeyPlaceholder")}
                    maxLength={KEY_MAX}
                    required
                  />
                </Flex>
              </Col>
              <Col xs={24} sm={4}>
                {/* `secondary` (#267 potongan 4): formulir ini memang menyimpan,
                    tetapi ia SAMPINGAN di layar yang tugas utamanya menyunting
                    lalu menyimpan matriks izin — dan "Simpan perubahan" di
                    kepala `/permissions` yang memikul itu. Bentuk yang sama
                    persis dengan "Simpan barang-baru" di `inventory/update`
                    (potongan 3) dan kompensasi uang muka (potongan 2). */}
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={busy || !newKey || !newLabel}
                >
                  <PlusOutlined aria-hidden="true" />
                  {t("permissions.addRole")}
                </Button>
              </Col>
            </Row>
          </form>
        </Flex>
      </CardContent>

      {deleteTarget && (
        <ConfirmDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title={t("permissions.deleteRoleTitle", { label: deleteTarget.label })}
          message={t("permissions.deleteRoleMessage")}
          confirmLabel={t("permissions.deleteRoleLabel")}
          confirmVariant="danger"
          onConfirm={() => remove(deleteTarget)}
        />
      )}
    </Card>
  );
}
