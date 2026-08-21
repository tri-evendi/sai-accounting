/**
 * Kotak masuk pemberitahuan — pusat notifikasi dalam aplikasi.
 *
 * ══ MENJAGA DIRINYA SENDIRI ═════════════════════════════════════════════════
 * Terdaftar di `tests/authz-coverage.test.ts` bersama beranda, dan karena alasan
 * yang sama: ia terbuka untuk SETIAP peran — semua orang berhak membaca kotak
 * masuknya sendiri — jadi tidak ada satu izin pun yang bisa ia deklarasikan ke
 * `requirePagePermission`. Konsekuensinya ia memasang konteks perusahaannya
 * sendiri lewat `enterCompanyFromRoute`, persis pola beranda.
 *
 * ⚠ Isinya TIDAK bergantung pada perusahaan itu: pemberitahuan milik PENGGUNA
 * (lihat kepala `lib/notifications.ts`). Konteks perusahaan dipasang semata
 * karena halaman ini hidup di dalam kerangka dasbor yang bertenant — dan
 * memverifikasi keanggotaan sebelum menggambar apa pun tetap benar.
 *
 * ══ DIBACA = DITANDAI ═══════════════════════════════════════════════════════
 * Membuka halaman ini menandai seluruh isinya terbaca. Bukan tombol terpisah:
 * kotak masuk yang menuntut satu klik tambahan untuk mengakui bahwa ia sudah
 * dilihat hanya menumpuk angka merah yang berhenti berarti.
 */
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { enterCompanyFromRoute } from "@/lib/company-route";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import {
  listNotifications,
  markNotificationsRead,
} from "@/lib/notifications";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { getT } from "@/lib/i18n/server";
import { formatDate } from "@/lib/utils";
import { NotificationList } from "./notification-list";

export const dynamic = "force-dynamic";

export default async function NotificationsPage({
  params,
}: {
  params: Promise<TenantScopedParams>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { tenantSlug, companySlug } = await params;
  const scoped = await enterCompanyFromRoute({
    tenantSlug,
    companySlug,
    userId: session.user.id,
  });
  if (!scoped.ok) {
    if (scoped.reason === "no-session") redirect("/login");
    notFound();
  }

  const userId = Number(session.user.id);
  const rows = await listNotifications(userId);
  /* Dibaca SESUDAH daftarnya diambil, supaya yang baru saja belum terbaca tetap
     tampil bertanda pada kunjungan ini — dan tidak lagi pada kunjungan
     berikutnya. */
  await markNotificationsRead(userId);

  const t = await getT();

  return (
    <div>
      <PageHeader
        title={t("notifications.title")}
        description={t("notifications.description")}
      />

      {rows.length === 0 ? (
        <EmptyState
          title={t("notifications.emptyTitle")}
          description={t("notifications.emptyDescription")}
        />
      ) : (
        <NotificationList
          items={rows.map((r) => ({
            id: r.id,
            title: r.title,
            body: r.body,
            href: r.href,
            unread: r.readAt == null,
            when: formatDate(r.createdAt),
          }))}
          openLabel={t("notifications.open")}
          unreadLabel={t("notifications.unread")}
        />
      )}
    </div>
  );
}
