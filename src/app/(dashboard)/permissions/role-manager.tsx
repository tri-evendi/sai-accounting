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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

interface RoleRow {
  key: string;
  label: string;
  isSystem: boolean;
  isActive: boolean;
}

export function RoleManager({ onRolesChanged }: { onRolesChanged: () => void }) {
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
        toast(data.error || "Gagal membuat peran.", "error");
        return;
      }
      setNewKey("");
      setNewLabel("");
      toast(`Peran "${data.label}" dibuat. Atur izinnya di matriks di bawah.`);
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
        toast(data.error || "Gagal mengubah peran.", "error");
        return;
      }
      toast("Peran diperbarui.");
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
        toast(data.error || "Gagal menghapus peran.", "error");
        return;
      }
      toast(`Peran "${role.label}" dihapus.`, "info");
      await afterChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Kelola Peran</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Tambah peran baru sesuai kebutuhan. Peran baru lahir tanpa izin — centang izinnya di
          matriks di bawah. Peran sistem (Pimpinan, Staf Kantor, Bagian Gudang) tak bisa
          dinonaktifkan atau dihapus.
        </p>

        {/* Daftar peran */}
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-2 font-medium text-muted-foreground">Nama Peran</th>
                <th className="px-4 py-2 font-medium text-muted-foreground">Kunci</th>
                <th className="px-4 py-2 font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.key} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-medium text-foreground">
                    <span className="flex items-center gap-1.5">
                      {role.label}
                      {role.isSystem && (
                        <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Peran sistem" />
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{role.key}</td>
                  <td className="px-4 py-2">
                    <Badge variant={role.isActive ? "success" : "default"}>
                      {role.isActive ? "Aktif" : "Nonaktif"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2">
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
                                <Ban className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Nonaktifkan
                              </>
                            ) : (
                              <>
                                <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Aktifkan
                              </>
                            )}
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={busy}
                            onClick={() => setDeleteTarget(role)}
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Hapus
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Tambah peran */}
        <form onSubmit={create} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-1">
            <label htmlFor="new-role-label" className="block text-sm font-medium text-foreground">
              Nama peran
            </label>
            <TextInput
              id="new-role-label"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="mis. Kasir"
              maxLength={50}
              required
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="new-role-key" className="block text-sm font-medium text-foreground">
              Kunci (huruf kecil, tanpa spasi)
            </label>
            <TextInput
              id="new-role-key"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value.toLowerCase())}
              placeholder="mis. kasir"
              maxLength={20}
              required
            />
          </div>
          <Button type="submit" disabled={busy || !newKey || !newLabel}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Tambah Peran
          </Button>
        </form>
      </CardContent>

      {deleteTarget && (
        <ConfirmDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title={`Hapus peran "${deleteTarget.label}"?`}
          message={
            "Peran ini dan seluruh pengaturan izinnya dihapus permanen. Hanya bisa bila tak ada " +
            "pengguna yang memakainya. Tindakan ini tidak bisa dibatalkan."
          }
          confirmLabel="Hapus peran"
          confirmVariant="danger"
          onConfirm={() => remove(deleteTarget)}
        />
      )}
    </Card>
  );
}
