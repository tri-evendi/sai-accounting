"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
import { PageLoader } from "@/components/ui/loading";
import { PageHeader } from "@/components/ui/page-header";
import { KeyRound, Trash2, UserPlus, RotateCcw } from "lucide-react";
import { ROLES, ROLE_LABELS, isFullAccessRole } from "@/lib/constants";
import { UserPermissionsPanel } from "./user-permissions-panel";
import { useT } from "@/lib/i18n/client";

interface User {
  id: number;
  username: string;
  /** Pengenal login (issue #136). NULL hanya di tengah masa adopsi #134. */
  email: string | null;
  name: string | null;
  role: string;
  mustChangePassword: boolean;
  createdAt: string;
  /** Jumlah izin khusus tersimpan (issue #75) — lencana di tombol per baris. */
  overrideCount: number;
}

/** Undangan yang masih menunggu (issue #139). */
interface PendingInvitation {
  id: number;
  email: string;
  companyRole: string;
  expiresAt: string;
  createdAt: string;
}

export function UsersClient({
  roles,
  canInvite,
}: {
  roles: { key: string; label: string }[];
  /** Kewenangan TENANT `tenant.member.invite` (issue #139) — tampilan saja;
   *  API-nya menegakkan sendiri lewat `requireTenantApiPermission`. */
  canInvite: boolean;
}) {
  const t = useT();
  const [users, setUsers] = useState<User[]>([]);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviting, setInviting] = useState(false);
  // issue #75 — pengguna yang panel "Izin Khusus"-nya sedang terbuka.
  const [permissionsFor, setPermissionsFor] = useState<number | null>(null);
  const [error, setError] = useState("");
  const { toast } = useToast();

  async function fetchUsers() {
    const res = await fetch("/api/users");
    if (res.ok) {
      setUsers(await res.json());
    } else if (res.status === 403) {
      setError(t("users.errNoPermission"));
    }
    setLoading(false);
  }

  async function fetchInvitations() {
    if (!canInvite) return;
    const res = await fetch("/api/tenant/invitations");
    if (res.ok) setInvitations(await res.json());
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const res = await fetch("/api/users");
      if (cancelled) return;
      if (res.ok) {
        setUsers(await res.json());
      } else if (res.status === 403) {
        setError(t("users.errNoPermission"));
      }
      setLoading(false);

      if (canInvite) {
        const inv = await fetch("/api/tenant/invitations");
        if (!cancelled && inv.ok) setInvitations(await inv.json());
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [t, canInvite]);

  /*
   * UNDANGAN, bukan pembuatan akun (issue #139): admin tidak pernah lagi
   * mengetik kata sandi orang lain — penerima menentukan kata sandinya sendiri
   * lewat tautan surel. Jawaban API SERAGAM apa pun keadaan emailnya; yang
   * berbeda hanya isi surelnya, jadi tidak ada yang bisa disimpulkan dari sini.
   */
  async function handleInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setInviting(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const res = await fetch("/api/tenant/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: formData.get("email"),
        role: formData.get("role"),
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error || t("users.errInvite"));
    } else {
      toast(t("invitations.sent"));
      setShowInvite(false);
      // Baris undangan ditulis SETELAH respons (anti-enumerasi), jadi daftar
      // di bawah menyusul — disegarkan sekali lagi sesaat kemudian.
      setTimeout(() => void fetchInvitations(), 1500);
    }
    setInviting(false);
  }

  async function handleRevokeInvitation(id: number) {
    const res = await fetch(`/api/tenant/invitations/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast(t("users.inviteRevoked"));
      await fetchInvitations();
    } else {
      const data = await res.json().catch(() => null);
      toast(data?.error || t("users.errRevokeInvite"), "error");
    }
  }

  async function handleDelete(userId: number) {
    const res = await fetch(`/api/users/${userId}`, { method: "DELETE" });
    if (res.ok) {
      toast(t("users.deleted"));
      if (permissionsFor === userId) setPermissionsFor(null);
      await fetchUsers();
    } else {
      const data = await res.json();
      toast(data.error || t("users.errDelete"), "error");
    }
  }

  async function handleResetPassword(userId: number) {
    const res = await fetch(`/api/users/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "changeme123" }),
    });
    if (res.ok) {
      toast(t("users.passwordReset"));
      await fetchUsers();
    } else {
      toast(t("users.errReset"), "error");
    }
  }

  if (loading) return <PageLoader message={t("users.loading")} />;
  if (error && users.length === 0) {
    return <div className="rounded-md bg-destructive-soft p-4 text-sm text-destructive-strong">{error}</div>;
  }

  return (
    <div>
      <PageHeader
        title={t("users.title")}
        actions={
          canInvite ? (
            <Button onClick={() => setShowInvite(!showInvite)}>
              <UserPlus className="h-4 w-4 mr-1" />{" "}
              {showInvite ? t("common.cancel") : t("users.inviteUser")}
            </Button>
          ) : undefined
        }
      />

      {error && <div className="mb-4 rounded-md bg-destructive-soft p-3 text-sm text-destructive-strong">{error}</div>}

      {/* Form UNDANGAN (issue #139) — email + peran; TANPA kolom kata sandi.
          Penerima menentukan kata sandinya sendiri lewat tautan surel. */}
      {showInvite && (
        <Card className="mb-6">
          <CardHeader><CardTitle>{t("users.inviteTitle")}</CardTitle></CardHeader>
          <div className="px-6 pb-6">
            <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
              {t("users.inviteHint")}
            </p>
            <form onSubmit={handleInvite} className="grid gap-4 sm:grid-cols-2">
              <Input
                id="email"
                name="email"
                type="email"
                label={t("auth.forgotPassword.email")}
                required
                autoFocus
              />
              <Select
                id="role" name="role" label={t("users.role")}
                defaultValue={ROLES.FINANCE_MANAGER}
                options={roles.map((r) => ({ value: r.key, label: r.label }))}
              />
              <div className="sm:col-span-2">
                <Button type="submit" disabled={inviting}>
                  {inviting ? t("users.inviting") : t("users.sendInvite")}
                </Button>
              </div>
            </form>
          </div>
        </Card>
      )}

      {/* Undangan yang masih menunggu (issue #139). */}
      {canInvite && invitations.length > 0 && (
        <Card className="mb-6">
          <CardHeader><CardTitle>{t("users.pendingInvites")}</CardTitle></CardHeader>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("auth.forgotPassword.email")}</TableHead>
                <TableHead>{t("users.role")}</TableHead>
                <TableHead>{t("users.inviteExpires")}</TableHead>
                <TableHead className="text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.map((invitation) => (
                <TableRow key={invitation.id}>
                  <TableCell className="font-medium text-foreground">{invitation.email}</TableCell>
                  <TableCell>
                    <Badge>
                      {roles.find((r) => r.key === invitation.companyRole)?.label ??
                        ROLE_LABELS[invitation.companyRole] ??
                        invitation.companyRole}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(invitation.expiresAt).toLocaleDateString("id-ID")}
                  </TableCell>
                  <TableCell className="text-right">
                    <ConfirmDialog
                      title={t("users.revokeInviteTitle")}
                      message={t("users.revokeInviteMessage", { email: invitation.email })}
                      confirmLabel={t("users.revokeInvite")}
                      onConfirm={() => handleRevokeInvitation(invitation.id)}
                      trigger={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
                          title={t("users.revokeInvite")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Izin Khusus per pengguna (issue #75) — panel inline, pola yang sama
          dengan form Create; key me-reset state saat berpindah pengguna. */}
      {permissionsFor !== null && (
        <UserPermissionsPanel
          key={permissionsFor}
          userId={permissionsFor}
          onClose={() => setPermissionsFor(null)}
          onSaved={fetchUsers}
        />
      )}

      {/* Users Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("auth.login.username")}</TableHead>
              <TableHead>{t("auth.forgotPassword.email")}</TableHead>
              <TableHead>{t("common.name")}</TableHead>
              <TableHead>{t("users.role")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead className="text-right">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium text-foreground">{user.username}</TableCell>
                <TableCell className="text-foreground">{user.email || "-"}</TableCell>
                <TableCell className="text-foreground">{user.name || "-"}</TableCell>
                <TableCell>
                  <Badge variant={isFullAccessRole(user.role) ? "success" : "default"}>
                    {roles.find((r) => r.key === user.role)?.label ?? ROLE_LABELS[user.role] ?? user.role}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={user.mustChangePassword ? "warning" : "success"}>
                    {user.mustChangePassword ? t("users.mustChangePassword") : t("common.active")}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {/* `gap-2` (8px), bukan `gap-1`: tiga aksi ikon yang berdampingan
                      butuh jarak sentuh minimum agar tidak salah tekan di layar
                      sentuh — lihat "target sentuh" di MASTER.md. */}
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="relative text-muted-foreground hover:bg-primary/10 hover:text-primary"
                      title={t("users.overridesTitle")}
                      aria-label={t("users.overridesAria", { username: user.username })}
                      onClick={() =>
                        setPermissionsFor(permissionsFor === user.id ? null : user.id)
                      }
                    >
                      <KeyRound className="h-4 w-4" />
                      {user.overrideCount > 0 && (
                        <Badge
                          variant="warning"
                          className="absolute -right-1.5 -top-1.5 px-1 py-0 text-[10px] leading-4"
                          title={t("users.overridesBadgeTitle", { count: user.overrideCount })}
                        >
                          {user.overrideCount}
                        </Badge>
                      )}
                    </Button>
                    <ConfirmDialog
                      title={t("users.resetPasswordTitle")}
                      message={t("users.resetPasswordMessage", { username: user.username })}
                      confirmLabel={t("users.reset")}
                      confirmVariant="primary"
                      onConfirm={() => handleResetPassword(user.id)}
                      trigger={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:bg-primary/10 hover:text-primary"
                          title={t("users.resetPasswordTooltip")}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      }
                    />
                    <ConfirmDialog
                      title={t("users.deleteUserTitle")}
                      message={t("users.deleteUserMessage", { username: user.username })}
                      confirmLabel={t("common.delete")}
                      onConfirm={() => handleDelete(user.id)}
                      trigger={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
                          title={t("users.deleteUserTooltip")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      }
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
