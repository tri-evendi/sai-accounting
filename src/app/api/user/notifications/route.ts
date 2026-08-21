/**
 * Kotak masuk pemberitahuan milik PEMANGGIL SENDIRI.
 *
 * Self-scoped seperti `user/accountant-mode` dan `user/companies`: `auth()`
 * saja, tanpa `requireApiPermission`. Dua alasan, dan yang kedua yang
 * menentukan:
 *
 *   1. Tidak ada izin yang bisa dideklarasikan — setiap peran berhak membaca
 *      kotak masuknya sendiri, dan tak seorang pun berhak membaca milik orang
 *      lain. Itu bukan pertanyaan yang dijawab matriks izin.
 *   2. Penjaga izin menuntut KONTEKS PERUSAHAAN, sedangkan pemberitahuan yang
 *      paling penting justru berbicara tentang perusahaan yang belum siap
 *      dibuka (issue #416). Menuntut konteks di sini berarti menutup kabar
 *      tepat pada orang yang paling membutuhkannya.
 *
 * `userId` SELALU `session.user.id` — tidak pernah dari query maupun badan
 * permintaan. Itulah seluruh pagar permukaan ini.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import {
  listNotifications,
  markNotificationsRead,
  unreadNotificationCount,
} from "@/lib/notifications";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";

async function currentUserId(): Promise<number | null> {
  const session = await auth();
  const raw = session?.user?.id;
  if (!raw) return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.sessionExpired") }, { status: 401 });
  }

  const [rows, unread] = await Promise.all([
    listNotifications(userId),
    unreadNotificationCount(userId),
  ]);

  return NextResponse.json(
    {
      unread,
      rows: rows.map((r: (typeof rows)[number]) => ({
        id: r.id,
        kind: r.kind,
        title: r.title,
        body: r.body,
        href: r.href,
        readAt: r.readAt,
        createdAt: r.createdAt,
      })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/* Tanpa `ids` = tandai seluruh kotak masuk. Dengan `ids` = hanya yang disebut,
   dan `userId` tetap ikut di `where` — id yang ditebak orang lain tidak boleh
   menandai apa pun milik siapa pun. */
const bodySchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).max(200).optional(),
});

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    const { t } = await getRequestI18n();
    return NextResponse.json({ error: t("errors.sessionExpired") }, { status: 401 });
  }

  const { dictionary, t } = await getRequestI18n();
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    /* Badan kosong SAH dan berarti "tandai semuanya" — tombol "tandai semua
       terbaca" tidak perlu mengirim apa pun. */
  }

  const parsed = bodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: t("validation.invalidInput"),
        details: translateFieldErrors(parsed.error, dictionary),
      },
      { status: 400 }
    );
  }

  const marked = await markNotificationsRead(userId, parsed.data.ids);
  return NextResponse.json({ marked });
}
