"use client";

/**
 * Kelola Peran (peran dinamis) — panel di atas matriks /permissions.
 *
 * Buat peran baru (key + label), ubah nama, aktif/nonaktifkan, hapus. Peran
 * SISTEM (bos/core/ptg) terkunci dari nonaktif/hapus. Setelah perubahan apa pun
 * memanggil `onRolesChanged` agar kolom matriks izin ikut termuat ulang.
 *
 * Semua aksi lewat /api/roles (di-gate authz.manage) — sumber kebenaran DB.
 */
import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Lock, Check, Ban } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/lib/i18n/client";

interface RoleRow {
  key: string;
  label: string;
  isSystem: boolean;
  isActive: boolean;
}

export function RoleManager({ onRolesChanged }: { onRolesChanged: () => void }) {
  const t = useT();
  const { toast } = useToast();
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RoleRow | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/roles");
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
      const res = await fetch("/api/roles", {
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
      const res = await fetch(`/api/roles/${role.key}`, {
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
      const res = await fetch(`/api/roles/${role.key}`, { method: "DELETE" });
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

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>{t("permissions.roleManagerTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t("permissions.roleManagerHint")}
        </p>

        {/* Daftar peran */}
        {/* Tabel ringkas (px-4 py-2) — padding rapat sengaja menimpa bawaan
            primitif agar sama dengan tampilan sebelum migrasi. */}
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-auto px-4 py-2">{t("permissions.colRoleName")}</TableHead>
                <TableHead className="h-auto px-4 py-2">{t("permissions.colRoleKey")}</TableHead>
                <TableHead className="h-auto px-4 py-2">{t("common.status")}</TableHead>
                <TableHead className="h-auto px-4 py-2" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((role) => (
                <TableRow key={role.key}>
                  <TableCell className="px-4 py-2 font-medium text-foreground">
                    <span className="flex items-center gap-1.5">
                      {role.label}
                      {role.isSystem && (
                        <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label={t("permissions.systemRoleAria")} />
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-2 font-mono text-xs text-muted-foreground">{role.key}</TableCell>
                  <TableCell className="px-4 py-2">
                    <Badge variant={role.isActive ? "success" : "default"}>
                      {role.isActive ? t("common.active") : t("common.inactive")}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-4 py-2">
                    <div className="flex items-center justify-end gap-2">
                      {!role.isSystem && (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={busy}
                            onClick={() => patch(role, { isActive: !role.isActive })}
                          >
                            {role.isActive ? (
                              <>
                                <Ban className="mr-1 h-3.5 w-3.5" aria-hidden="true" />{" "}
                                {t("permissions.deactivateRole")}
                              </>
                            ) : (
                              <>
                                <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" />{" "}
                                {t("permissions.activateRole")}
                              </>
                            )}
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={busy}
                            onClick={() => setDeleteTarget(role)}
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />{" "}
                            {t("common.delete")}
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Tambah peran */}
        <form onSubmit={create} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-1">
            <label htmlFor="new-role-label" className="block text-sm font-medium text-foreground">
              {t("permissions.roleNameField")}
            </label>
            <TextInput
              id="new-role-label"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder={t("permissions.roleNamePlaceholder")}
              maxLength={50}
              required
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="new-role-key" className="block text-sm font-medium text-foreground">
              {t("permissions.roleKeyField")}
            </label>
            <TextInput
              id="new-role-key"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value.toLowerCase())}
              placeholder={t("permissions.roleKeyPlaceholder")}
              maxLength={20}
              required
            />
          </div>
          <Button type="submit" disabled={busy || !newKey || !newLabel}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> {t("permissions.addRole")}
          </Button>
        </form>
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
