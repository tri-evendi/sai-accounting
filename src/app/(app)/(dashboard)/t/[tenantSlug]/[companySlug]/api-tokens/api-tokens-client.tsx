"use client";

/**
 * Token API — terbitkan, lihat, cabut (issue #389, F-10).
 *
 * ══ TOKENNYA DIPERLIHATKAN SEKALI, DAN LAYAR INI HARUS MENGATAKANNYA ═══════
 * Yang tersimpan hanya SHA-256-nya, jadi tidak ada cara memulihkan token yang
 * terlanjur ditutup — dan itu bukan keterbatasan melainkan seluruh gunanya:
 * basis data yang bocor tidak membawa serta kredensial yang bisa dipakai.
 *
 * Konsekuensinya bagi layar ini: kalimat "salin sekarang, ia tidak akan
 * ditampilkan lagi" harus muncul BERSAMA tokennya, bukan sesudah orangnya
 * menutup kotaknya. Sebuah peringatan yang datang terlambat adalah peringatan
 * yang menjelaskan kerugian, bukan mencegahnya.
 *
 * ══ TOKEN TANPA PANDUAN ADALAH KREDENSIAL TANPA PINTU ══════════════════════
 * Sampai halaman `/docs/api` ada, layar ini adalah SATU-SATUNYA tempat kata
 * "API" muncul di aplikasi — dan ia tidak menyebut satu pun alamat, header,
 * atau bentuk jawaban. Orang yang menerima token dari sini tidak punya jalan
 * menemukan cara memakainya selain menebak. Karena itu dua tautan berdiri di
 * bawah judul: panduannya (prosa, `/docs/api` — publik, bisa dikirim ke
 * pengembang luar tanpa memberinya akun) dan spesifikasi mesinnya
 * (`/api/v1/openapi.json`, untuk pembangkit klien).
 *
 * Keduanya `<Link>`/`<a>` biasa, bukan tombol: §Aksi utama per layar mengunci
 * satu aksi utama di layar ini, dan aksi itu "Terbitkan".
 *
 * ══ YANG DITAMPILKAN DI DAFTAR ═════════════════════════════════════════════
 * Nama, peran, TERAKHIR DIPAKAI, dan siapa yang menerbitkan. Kolom "terakhir
 * dipakai" yang paling berguna dan paling mudah dilupakan: ia satu-satunya cara
 * pemiliknya tahu token mana yang sudah tidak dipakai siapa pun — dan token yang
 * tidak dipakai siapa pun adalah token yang aman dicabut, sekaligus yang paling
 * berbahaya dibiarkan hidup.
 */

import { useState } from "react";
import { Alert, Flex, Typography, theme } from "antd";
import { KeyOutlined } from "@ant-design/icons";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-fetch";
import { useT } from "@/lib/i18n/client";
import { useToast } from "@/components/ui/toast";
import { Link } from "@/components/ui/app-link";
import { V1_ROOT } from "@/lib/api-v1";
import { docsPath } from "@/lib/docs";
import { formatDateTime } from "@/lib/utils";

const { Text } = Typography;

export interface TokenRow {
  id: number;
  name: string;
  role: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdBy: string;
}

export function ApiTokensClient({
  roles,
  tokens,
}: {
  roles: { value: string; label: string }[];
  tokens: TokenRow[];
}) {
  const t = useT();
  const { token: tk } = theme.useToken();
  const { toast } = useToast();
  const router = useRouter();

  const [name, setName] = useState("");
  const [role, setRole] = useState(roles[0]?.value ?? "");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  /** Token utuh yang BARU SAJA terbit — satu-satunya kesempatan menyalinnya. */
  const [fresh, setFresh] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<TokenRow | null>(null);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setFresh(null);
    setCreating(true);
    const res = await apiFetch("/api/api-tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, role }),
    });
    const data = await res.json().catch(() => ({}));
    setCreating(false);
    if (!res.ok) {
      setError(data.error || t("apiTokens.createFailed"));
      return;
    }
    setFresh(data.token as string);
    setName("");
    router.refresh();
  }

  async function handleRevoke(row: TokenRow) {
    const res = await apiFetch(`/api/api-tokens/${row.id}`, { method: "DELETE" });
    setRevoking(null);
    if (!res.ok) {
      toast(t("apiTokens.revokeFailed"));
      return;
    }
    toast(t("apiTokens.revoked", { name: row.name }));
    router.refresh();
  }

  const columns: SaiColumns<TokenRow> = [
    {
      key: "name",
      dataIndex: "name",
      title: t("apiTokens.colName"),
      align: "left",
      render: (_v, r) => (
        <Flex vertical>
          <Text strong={!r.revokedAt}>{r.name}</Text>
          {r.revokedAt && (
            <Text type="secondary" style={{ fontSize: tk.fontSizeSM }}>
              {t("apiTokens.revokedAt", { at: formatDateTime(r.revokedAt) })}
            </Text>
          )}
        </Flex>
      ),
    },
    {
      key: "role",
      dataIndex: "role",
      title: t("apiTokens.colRole"),
      align: "left",
      render: (_v, r) => (
        <Text type="secondary">{roles.find((x) => x.value === r.role)?.label ?? r.role}</Text>
      ),
    },
    {
      key: "lastUsedAt",
      dataIndex: "lastUsedAt",
      title: t("apiTokens.colLastUsed"),
      align: "left",
      render: (_v, r) => (
        <Text type="secondary">
          {r.lastUsedAt ? formatDateTime(r.lastUsedAt) : t("apiTokens.neverUsed")}
        </Text>
      ),
    },
    {
      key: "createdBy",
      dataIndex: "createdBy",
      title: t("apiTokens.colCreatedBy"),
      align: "left",
      render: (_v, r) => <Text type="secondary">{r.createdBy}</Text>,
    },
    {
      key: "actions",
      title: t("common.actions"),
      align: "right",
      render: (_v, r) =>
        r.revokedAt ? null : (
          <Button variant="secondary" size="sm" onClick={() => setRevoking(r)}>
            {t("apiTokens.revoke")}
          </Button>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("apiTokens.title")}
        description={
          <>
            {t("apiTokens.description")}{" "}
            {/* Alamat KEDUANYA dirakit dari sumbernya (`docsPath`, `V1_ROOT`),
                bukan diketik: jalur yang diketik ulang adalah jalur yang
                tertinggal saat rutenya pindah — dan tautan dokumentasi yang
                mati lebih buruk daripada tidak ada tautan. */}
            <Link href={docsPath("api")}>{t("apiTokens.docsLink")}</Link>
            {" · "}
            {/* Spesifikasi mesin: bukan halaman, melainkan berkas JSON — jadi
                `<a>` biasa (pemuatan penuh, tab baru), bukan navigasi
                sisi-klien yang akan mencoba merendernya sebagai rute. */}
            <a href={`${V1_ROOT}/openapi.json`} target="_blank" rel="noopener noreferrer">
              {t("apiTokens.specLink")}
            </a>
          </>
        }
      />

      <Card style={{ marginBottom: tk.marginLG }}>
        <CardHeader>
          <CardTitle level={2}>{t("apiTokens.newTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate}>
            <Flex vertical gap={tk.marginMD}>
              <Text type="secondary">{t("apiTokens.roleHint")}</Text>
              <Flex gap={tk.marginSM} wrap align="flex-end">
                <div style={{ minWidth: 240 }}>
                  <Input
                    id="token-name"
                    label={t("apiTokens.nameLabel")}
                    placeholder={t("apiTokens.namePlaceholder")}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={100}
                    required
                    disabled={creating}
                  />
                </div>
                <div style={{ minWidth: 200 }}>
                  <Select
                    id="token-role"
                    label={t("apiTokens.roleLabel")}
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    options={roles}
                  />
                </div>
                <Button type="submit" variant="primary" disabled={creating || !name.trim()}>
                  <KeyOutlined aria-hidden="true" />
                  {creating ? t("apiTokens.creating") : t("apiTokens.create")}
                </Button>
              </Flex>

              {error && <Alert type="error" showIcon message={error} />}

              {fresh && (
                <Alert
                  type="success"
                  showIcon
                  message={t("apiTokens.freshTitle")}
                  description={
                    <Flex vertical gap={tk.marginXS}>
                      {/* Peringatannya BERSAMA tokennya, bukan sesudah orangnya
                          menutup kotak ini — peringatan yang datang terlambat
                          menjelaskan kerugian, bukan mencegahnya. */}
                      <Text strong>{t("apiTokens.freshWarning")}</Text>
                      <code
                        style={{
                          display: "block",
                          padding: tk.paddingSM,
                          background: "var(--ant-color-fill-quaternary)",
                          borderRadius: tk.borderRadiusSM,
                          wordBreak: "break-all",
                          fontSize: tk.fontSizeSM,
                        }}
                      >
                        {fresh}
                      </code>
                    </Flex>
                  }
                />
              )}
            </Flex>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {tokens.length === 0 ? (
            <EmptyState
              icon={<KeyOutlined aria-hidden="true" style={{ fontSize: 48 }} />}
              title={t("apiTokens.emptyTitle")}
              description={t("apiTokens.emptyBody")}
            />
          ) : (
            <StaticTable columns={columns} rows={tokens} rowKey={(r) => r.id} />
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        title={t("apiTokens.revokeTitle")}
        message={t("apiTokens.revokeBody", { name: revoking?.name ?? "" })}
        confirmLabel={t("apiTokens.revoke")}
        confirmVariant="danger"
        onConfirm={() => {
          if (revoking) void handleRevoke(revoking);
        }}
      />
    </div>
  );
}
