"use client";

import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ROLE_LABELS, APP_NAME, COMPANY_NAME, type Role } from "@/lib/constants";
import { AuditLogPanel } from "@/components/settings/audit-log-panel";
import { GLOSSARY_PATH } from "@/lib/labels";
import { BookMarked } from "lucide-react";

export default function SettingsPage() {
  const { data: session } = useSession();

  if (!session) return null;

  const isManager = session.user.role === "bos";

  return (
    <div className={isManager ? "max-w-5xl" : "max-w-2xl"}>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Pengaturan</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Profil</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm font-medium text-gray-500">Nama</dt>
              <dd className="text-sm text-gray-900">{session.user.name}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Nama Pengguna</dt>
              <dd className="text-sm text-gray-900">{session.user.email}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Peran</dt>
              <dd className="text-sm text-gray-900">
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
          <p className="text-sm text-gray-600">
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
          <p className="text-sm text-gray-700">{APP_NAME}</p>
          <p className="text-sm text-gray-500 mt-1">{COMPANY_NAME}</p>
          <p className="text-sm text-gray-400 mt-2">
            Sistem pembukuan, kontrak, dan stok barang
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
