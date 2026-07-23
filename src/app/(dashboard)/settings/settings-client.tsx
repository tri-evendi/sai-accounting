"use client";

import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ROLE_LABELS, APP_NAME, COMPANY_NAME, type Role } from "@/lib/constants";
import { can } from "@/lib/authz";
import { AuditLogPanel } from "@/components/settings/audit-log-panel";
import { PageHeader } from "@/components/ui/page-header";
import { GLOSSARY_PATH } from "@/lib/labels";
import { BookMarked } from "lucide-react";

export function SettingsClient() {
  const { data: session } = useSession();

  if (!session) return null;

  // audit RBAC fase 4 — panel Audit Log tampil bila punya izin membacanya.
  const isManager = can(session.user, "audit.read");

  return (
    <div className={isManager ? "max-w-5xl" : "max-w-2xl"}>
      <PageHeader title="Pengaturan" />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Profil</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Nama</dt>
              <dd className="text-sm text-foreground">{session.user.name}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Nama Pengguna</dt>
              <dd className="text-sm text-foreground">{session.user.email}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Peran</dt>
              <dd className="text-sm text-foreground">
                {ROLE_LABELS[session.user.role as Role] || session.user.role}
              </dd>
            </div>
          </dl>
          <div className="mt-4">
            <Link href="/change-password">
              <Button variant="secondary" className="cursor-pointer">Ganti Kata Sandi</Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {isManager && (
        <div className="mb-6">
          <AuditLogPanel />
        </div>
      )}

      {/* issue #21 — pintu masuk kedua ke Kamus Istilah, selain menu Bantuan. */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Bantuan</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Tidak paham sebuah istilah akuntansi? Buka kamusnya — semuanya dijelaskan dengan
            bahasa sehari-hari beserta contoh.
          </p>
          <Link href={GLOSSARY_PATH} className="mt-3 inline-block">
            <Button variant="secondary" className="cursor-pointer">
              <BookMarked className="mr-2 h-4 w-4" aria-hidden="true" />
              Buka Kamus Istilah
            </Button>
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tentang Aplikasi</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-foreground">{APP_NAME}</p>
          <p className="text-sm text-muted-foreground mt-1">{COMPANY_NAME}</p>
          <p className="text-sm text-muted-foreground mt-2">
            Sistem pembukuan, kontrak, dan stok barang
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
