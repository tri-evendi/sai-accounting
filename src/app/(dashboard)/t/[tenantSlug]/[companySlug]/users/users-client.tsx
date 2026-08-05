"use client";

/**
 * Manajemen pengguna & undangan (issue #59/#139).
 *
 * ── Setelah migrasi AntD (issue #199) ──────────────────────────────────────
 * Tanpa kelas Tailwind. Pita galat menjadi `Alert` AntD — teks `colorText` di
 * atas latar tipis + ikon, bukan merah di atas merah muda (pola #194).
 *
 * Kedua tabel memakai `StaticTable`, bukan `DataTable`, meski datanya dimuat di
 * client (`/api/users`, `/api/tenant/invitations`). Jumlah barisnya dibatasi
 * KUOTA KURSI paket — meter di atas tabel ini yang menyebut angkanya — jadi
 * tidak ada halaman kedua untuk dipaginasi dan tidak ada daftar panjang untuk
 * disortir. rc-table di sini terukur ±80 KB gzip untuk kemampuan yang tidak
 * terpakai (MASTER.md §Primitif Wajib).
 */

import { useState, useEffect } from "react";
import { Alert, Col, Flex, Row, theme, Typography } from "antd";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { StaticTable } from "@/components/ui/static-table";
import { type SaiColumns } from "@/components/ui/table-columns";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { PageLoader } from "@/components/ui/loading";
import { PageHeader } from "@/components/ui/page-header";
import { KeyRound, Trash2, UserPlus, RotateCcw } from "lucide-react";
import { ROLES, ROLE_LABELS, isFullAccessRole } from "@/lib/constants";
import { UserPermissionsPanel } from "./user-permissions-panel";
import { useT } from "@/lib/i18n/client";
import { QuotaMeter } from "@/components/ui/quota-meter";
import { apiFetch } from "@/lib/api-fetch";
import { moneyPalette } from "@/lib/theme/antd-tokens";

/** Lebar meter kursi — bekas `sm:max-w-sm`. */
const SEATS_WIDTH = 384;
/** Geseran lencana jumlah izin khusus ke pojok tombolnya. */
const BADGE_OFFSET = -6;
/** Ukuran & tinggi baris lencana angka — bekas `text-[10px] leading-4`. */
const BADGE_FONT = 10;
const BADGE_LINE = 16;

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
  seats,
}: {
  roles: { key: string; label: string }[];
  /** Kewenangan TENANT `tenant.member.invite` (issue #139) — tampilan saja;
   *  API-nya menegakkan sendiri lewat `requireTenantApiPermission`. */
  canInvite: boolean;
  /** Kursi terpakai vs kuota paket. `null` bila pemakainya tidak berhak
   *  mengundang — angkanya memang tidak dibaca untuknya. */
  seats: { currentUsers: number; pendingInvitations: number; maxUsers: number } | null;
}) {
  const t = useT();
  const { token } = theme.useToken();
  const money = moneyPalette(token);
  const [users, setUsers] = useState<User[]>([]);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviting, setInviting] = useState(false);
  // issue #75 — pengguna yang panel "Izin Khusus"-nya sedang terbuka.
  const [permissionsFor, setPermissionsFor] = useState<number | null>(null);
  const [error, setError] = useState("");
  const { toast } = useToast();

  /** Jarak antar-blok halaman — bekas `mb-6` pada tiap kartu. */
  const blockGap: React.CSSProperties = { marginBottom: token.marginLG };

  async function fetchUsers() {
    const res = await apiFetch("/api/users");
    if (res.ok) {
      setUsers(await res.json());
    } else if (res.status === 403) {
      setError(t("users.errNoPermission"));
    }
    setLoading(false);
  }

  async function fetchInvitations() {
    if (!canInvite) return;
    const res = await apiFetch("/api/tenant/invitations");
    if (res.ok) setInvitations(await res.json());
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const res = await apiFetch("/api/users");
      if (cancelled) return;
      if (res.ok) {
        setUsers(await res.json());
      } else if (res.status === 403) {
        setError(t("users.errNoPermission"));
      }
      setLoading(false);

      if (canInvite) {
        const inv = await apiFetch("/api/tenant/invitations");
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
    const res = await apiFetch("/api/tenant/invitations", {
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
    const res = await apiFetch(`/api/tenant/invitations/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast(t("users.inviteRevoked"));
      await fetchInvitations();
    } else {
      const data = await res.json().catch(() => null);
      toast(data?.error || t("users.errRevokeInvite"), "error");
    }
  }

  async function handleDelete(userId: number) {
    const res = await apiFetch(`/api/users/${userId}`, { method: "DELETE" });
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
    const res = await apiFetch(`/api/users/${userId}`, {
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

  const roleLabelOf = (key: string) =>
    roles.find((r) => r.key === key)?.label ?? ROLE_LABELS[key] ?? key;

  const invitationColumns: SaiColumns<PendingInvitation> = [
    {
      key: "email",
      dataIndex: "email",
      title: t("auth.forgotPassword.email"),
      render: (_value, invitation) => <Typography.Text strong>{invitation.email}</Typography.Text>,
    },
    {
      key: "companyRole",
      dataIndex: "companyRole",
      title: t("users.role"),
      render: (_value, invitation) => (
        <Badge>
          <span>{roleLabelOf(invitation.companyRole)}</span>
        </Badge>
      ),
    },
    {
      key: "expiresAt",
      dataIndex: "expiresAt",
      title: t("users.inviteExpires"),
      render: (_value, invitation) => (
        <Typography.Text type="secondary">
          {new Date(invitation.expiresAt).toLocaleDateString("id-ID")}
        </Typography.Text>
      ),
    },
    {
      key: "actions",
      title: t("common.actions"),
      align: "right",
      render: (_value, invitation) => (
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
              title={t("users.revokeInvite")}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          }
        />
      ),
    },
  ];

  const userColumns: SaiColumns<User> = [
    {
      key: "username",
      dataIndex: "username",
      title: t("auth.login.username"),
      render: (_value, user) => <Typography.Text strong>{user.username}</Typography.Text>,
    },
    /* `email`/`name` boleh NULL (masa adopsi #134). Ditulis "-" seperti
       sebelumnya, bukan sel kosong: kolom kosong terbaca seperti kegagalan
       render, sedangkan "-" menyatakan "memang belum ada isinya". */
    {
      key: "email",
      dataIndex: "email",
      title: t("auth.forgotPassword.email"),
      render: (_value, user) => user.email || "-",
    },
    {
      key: "name",
      dataIndex: "name",
      title: t("common.name"),
      render: (_value, user) => user.name || "-",
    },
    {
      key: "role",
      dataIndex: "role",
      title: t("users.role"),
      render: (_value, user) => (
        <Badge variant={isFullAccessRole(user.role) ? "success" : "default"}>
          <span>{roleLabelOf(user.role)}</span>
        </Badge>
      ),
    },
    {
      key: "status",
      dataIndex: "mustChangePassword",
      title: t("common.status"),
      render: (_value, user) => (
        <Badge variant={user.mustChangePassword ? "warning" : "success"}>
          <span>
            {user.mustChangePassword ? t("users.mustChangePassword") : t("common.active")}
          </span>
        </Badge>
      ),
    },
    {
      key: "actions",
      title: t("common.actions"),
      align: "right",
      render: (_value, user) => (
        /* `marginXS` (8px), bukan 4: tiga aksi ikon yang berdampingan butuh
           jarak sentuh minimum agar tidak salah tekan di layar sentuh — lihat
           "target sentuh" di MASTER.md. */
        <Flex justify="flex-end" gap={token.marginXS}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            style={{ position: "relative" }}
            title={t("users.overridesTitle")}
            aria-label={t("users.overridesAria", { username: user.username })}
            onClick={() => setPermissionsFor(permissionsFor === user.id ? null : user.id)}
          >
            <KeyRound aria-hidden="true" />
            {user.overrideCount > 0 && (
              <Badge
                variant="warning"
                style={{
                  position: "absolute",
                  insetInlineEnd: BADGE_OFFSET,
                  top: BADGE_OFFSET,
                  margin: 0,
                  paddingInline: token.paddingXXS,
                  fontSize: BADGE_FONT,
                  lineHeight: `${BADGE_LINE}px`,
                }}
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
                title={t("users.resetPasswordTooltip")}
              >
                <RotateCcw aria-hidden="true" />
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
                title={t("users.deleteUserTooltip")}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            }
          />
        </Flex>
      ),
    },
  ];

  if (loading) return <PageLoader message={t("users.loading")} />;
  if (error && users.length === 0) {
    return <Alert type="error" showIcon message={error} />;
  }

  return (
    <div>
      <PageHeader
        title={t("users.title")}
        actions={
          canInvite ? (
            <Button onClick={() => setShowInvite(!showInvite)}>
              <UserPlus aria-hidden="true" />
              {showInvite ? t("common.cancel") : t("users.inviteUser")}
            </Button>
          ) : undefined
        }
      />

      {error && <Alert type="error" showIcon message={error} style={blockGap} />}

      {/* Form UNDANGAN (issue #139) — email + peran; TANPA kolom kata sandi.
          Penerima menentukan kata sandinya sendiri lewat tautan surel. */}
      {showInvite && (
        <Card style={blockGap}>
          <CardHeader><CardTitle>{t("users.inviteTitle")}</CardTitle></CardHeader>
          <div style={{ paddingInline: token.paddingLG, paddingBottom: token.paddingLG }}>
            <Typography.Paragraph type="secondary">
              {t("users.inviteHint")}
            </Typography.Paragraph>
            <form onSubmit={handleInvite}>
              <Row gutter={[token.margin, token.margin]}>
                <Col xs={24} sm={12}>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    label={t("auth.forgotPassword.email")}
                    required
                    autoFocus
                  />
                </Col>
                <Col xs={24} sm={12}>
                  <Select
                    id="role" name="role" label={t("users.role")}
                    defaultValue={ROLES.FINANCE_MANAGER}
                    options={roles.map((r) => ({ value: r.key, label: r.label }))}
                  />
                </Col>
                <Col span={24}>
                  <Button type="submit" disabled={inviting}>
                    {inviting ? t("users.inviting") : t("users.sendInvite")}
                  </Button>
                </Col>
              </Row>
            </form>
          </div>
        </Card>
      )}

      {/* Undangan yang masih menunggu (issue #139). */}
      {/* ── KURSI: terlihat SEBELUM formulir, bukan sesudah penolakan ──────
       *
       * Kuota dihitung dari pengguna AKTIF + UNDANGAN YANG MASIH MENUNGGU,
       * dan bagian kedua itulah yang paling sering mengejutkan: kursi sudah
       * terpakai sebelum orangnya pernah membuat akun. Sebelum meter ini,
       * satu-satunya kabarnya adalah 422 sesudah seseorang mengetik alamat
       * rekannya.
       *
       * Meternya sama dengan yang dipakai panel akun — satu rasio terhadap
       * batas, dengan keadaan sebagai KATA, bukan rona saja. */}
      {canInvite && seats && (
        <Flex vertical gap={token.margin} style={{ maxWidth: SEATS_WIDTH, ...blockGap }}>
          <QuotaMeter
            label={t("users.seatsLabel")}
            used={seats.currentUsers + seats.pendingInvitations}
            max={seats.maxUsers}
            valueLabel={t("tenantSettings.usageOf", {
              used: seats.currentUsers + seats.pendingInvitations,
              max: seats.maxUsers,
            })}
            stateLabel={
              seats.currentUsers + seats.pendingInvitations >= seats.maxUsers
                ? t("users.seatsFull")
                : t("tenantSettings.quotaNearlyFull")
            }
          />
          {seats.pendingInvitations > 0 && (
            /* Kursi yang ditahan undangan menunggu — disebut angkanya, sebab
             * "cabut undangan" hanya masuk akal kalau pembacanya tahu ada
             * undangan yang menahan kursi. */
            <Typography.Text type="secondary">
              {t("users.seatsPending", { count: seats.pendingInvitations })}
            </Typography.Text>
          )}
          {seats.currentUsers + seats.pendingInvitations >= seats.maxUsers && (
            /* `colorMoneyPending` (#186), bukan amber penuh: ini teks 14px, jadi
               ambangnya 4,5:1 — `colorWarning` bawaan AntD hanya 1,90:1. */
            <p style={{ margin: 0, color: money.colorMoneyPending }}>
              {t("users.seatsFullHint")}{" "}
              <a
                href="/platform/billing/plans"
                style={{
                  color: "inherit",
                  fontWeight: token.fontWeightStrong,
                  textDecoration: "underline",
                  textUnderlineOffset: token.marginXXS,
                }}
              >
                {t("platform.plansViewLabel")}
              </a>
            </p>
          )}
        </Flex>
      )}

      {canInvite && invitations.length > 0 && (
        <Card style={blockGap}>
          <CardHeader><CardTitle>{t("users.pendingInvites")}</CardTitle></CardHeader>
          <StaticTable
            columns={invitationColumns}
            rows={invitations}
            rowKey={(invitation) => invitation.id}
          />
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
        <StaticTable columns={userColumns} rows={users} rowKey={(user) => user.id} />
      </Card>
    </div>
  );
}
