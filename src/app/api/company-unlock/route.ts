/**
 * `POST /api/company-unlock` — memverifikasi sandi lalu membuka buku satu PT.
 *
 * Alasan fitur ini ada, dan kenapa ia BUKAN tambalan lubang, ada di kepala
 * `lib/company-unlock.ts`. Yang perlu diketahui di berkas ini adalah tiga
 * keputusan keamanannya:
 *
 *  1. **Keanggotaan diperiksa, bukan hanya sandi.** Sandi yang benar untuk
 *     akun yang bukan anggota PT itu tetap ditolak — kalau tidak, siapa pun
 *     yang punya akun di pemasangan ini bisa membuka kunci PT mana pun dengan
 *     sandinya sendiri, dan pemeriksaan keanggotaan di penjaga halaman menjadi
 *     satu-satunya yang tersisa.
 *
 *  2. **Satu kalimat penolakan untuk semua kegagalan.** Sandi salah, bukan
 *     anggota, PT tidak ada — ketiganya `401` dengan kalimat yang sama.
 *     Membedakannya mengubah endpoint ini menjadi alat penebak keberadaan PT
 *     dan keanggotaan orang lain.
 *
 *  3. **Dibatasi laju.** Endpoint ini menerima sandi, jadi ia permukaan
 *     penebakan sandi persis seperti `/login` — dan pemakainya SUDAH bersesi,
 *     yang berarti penyerangnya adalah sesi yang dibajak atau laptop yang
 *     ditinggal terbuka. Penghitungnya per PENGGUNA, memakai anggaran
 *     `RATE_LIMITS.login` yang sama.
 */
import bcrypt from "bcrypt";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import {
  NAMA_COOKIE_KUNCI,
  UMUR_KUNCI_MS,
  withCompanyUnlocked,
} from "@/lib/company-unlock";
import { controlDb } from "@/lib/control-db";
import { getT } from "@/lib/i18n/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

const schema = z.object({
  companySlug: z.string().min(1).max(64),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  const t = await getT();
  const session = await auth();
  /* Tanpa sesi pun kalimatnya SAMA — butir 2 di kepala berkas berlaku untuk
     setiap penolakan, bukan hanya yang datang dari sandi salah. */
  if (!session?.user?.id) {
    return NextResponse.json({ error: t("unlock.failed") }, { status: 401 });
  }

  const userId = session.user.id;

  const rate = checkRateLimit(`unlock:${userId}`, RATE_LIMITS.login);
  if (!rate.allowed) {
    return NextResponse.json({ error: t("unlock.tooMany") }, { status: 429 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: t("unlock.failed") }, { status: 400 });
  }

  /* Keanggotaan DAN sandi dibaca dalam satu kueri: keduanya syarat, dan
     memisahkannya hanya menambah satu perjalanan ke basis data. */
  const membership = await controlDb.membership.findFirst({
    where: {
      userId: Number.parseInt(userId, 10),
      isActive: true,
      company: { slug: parsed.data.companySlug, isActive: true },
    },
    select: { company: { select: { id: true } }, user: { select: { password: true } } },
  });

  /* Satu kalimat untuk semua kegagalan — butir 2 di kepala berkas. */
  const tolak = () => NextResponse.json({ error: t("unlock.failed") }, { status: 401 });

  if (!membership) return tolak();
  if (!(await bcrypt.compare(parsed.data.password, membership.user.password))) return tolak();

  const jar = await cookies();
  jar.set({
    name: NAMA_COOKIE_KUNCI,
    value: withCompanyUnlocked(
      jar.get(NAMA_COOKIE_KUNCI)?.value,
      userId,
      membership.company.id,
      Date.now()
    ),
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    /*
     * `secure` MENGIKUTI protokol yang sedang dipakai, bukan `NODE_ENV`.
     * Pemasangan produksi berjalan di https dan cookienya wajib `Secure`;
     * pengembangan lokal berjalan di http, dan cookie `Secure` di sana tidak
     * pernah tersimpan — kunci yang tidak pernah tersimpan berarti prompt
     * sandi yang berulang tanpa henti. Ini pelajaran yang sudah dibayar sekali
     * di sesi ini oleh `AUTH_URL` produksi yang terbawa ke localhost.
     */
    secure: new URL(request.url).protocol === "https:",
    maxAge: Math.floor(UMUR_KUNCI_MS / 1000),
  });

  return NextResponse.json({ ok: true });
}
