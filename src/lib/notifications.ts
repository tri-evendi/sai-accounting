/**
 * Pusat pemberitahuan dalam aplikasi.
 *
 * ══ MASALAH YANG DIBERESKANNYA ══════════════════════════════════════════════
 * Empat perusahaan mandek di wisaya penyiapan selama enam hari (issue #416),
 * dan tidak ada satu pun kanal yang memberi tahu siapa pun — tidak pemiliknya,
 * tidak operatornya. Bahkan setelah perbaikannya terpasang, satu-satunya cara
 * mengabari mereka adalah surel yang dikirim tangan, satu per satu.
 *
 * ══ MILIK PENGGUNA, BUKAN PERUSAHAAN ════════════════════════════════════════
 * Baris pemberitahuan hidup di basis data KENDALI bersama penggunanya. Dua
 * alasan, dan yang kedua yang menentukan:
 *
 *   1. Orang dengan dua PT hanya punya SATU kotak masuk. Kotak masuk per-buku
 *      berarti kabar penting bisa duduk di buku yang jarang dibuka.
 *   2. Pemberitahuan yang paling dibutuhkan lahir SEBELUM ada buku yang bisa
 *      dibaca — "penyiapan Anda belum selesai" justru berbicara tentang buku
 *      yang belum ada isinya.
 *
 * ══ IDEMPOTEN, DAN ITU YANG MEMBUATNYA AMAN DIPANGGIL TIAP JAM ══════════════
 * `dedupeKey` + `@@unique([userId, kind, dedupeKey])` mengikuti doktrin
 * `ReminderLog` (#140): produser yang berjalan dua kali MENABRAK constraint,
 * bukan melahirkan pemberitahuan kembar. Penjadwal yang jalan tiap jam karena
 * itu boleh memanggil `notify()` tiap jam tanpa membanjiri siapa pun.
 *
 * Kuncinya milik produser, dan bentuknya menentukan seberapa sering kabar
 * berulang: `company:8` = sekali seumur hidup; `company:8:d3` = sekali per
 * tahap pengingat.
 */
import "server-only";

import { controlDb } from "@/lib/control-db";

/**
 * Jenis pemberitahuan. Enum-like `String @db.VarChar` (docs/DATABASE.md), dan
 * SENGAJA hanya menentukan ikon serta pengelompokan — tak satu pun jenis di
 * sini memberi atau mencabut izin apa pun.
 */
export const NOTIFICATION_KINDS = [
  "setup_incomplete",
  "announcement",
  /* Faktur jatuh tempo — aturan, kosakata, dan cadensinya hidup di
     `lib/invoice-due-digest.ts`; disalin sebagai literal di sini supaya seluruh
     kosakata terbaca dalam satu tatapan. `tests/invoice-due-digest.test.ts`
     menolak keduanya menyimpang. */
  "invoice_due_soon",
  "invoice_overdue",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** Batas bawaan daftar — kotak masuk, bukan arsip. */
const DEFAULT_LIMIT = 50;

export interface NotifyInput {
  userId: number;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Tautan dalam app; kosong = pemberitahuan yang hanya memberi kabar. */
  href?: string | null;
  /** Kunci idempotensi milik produser — lihat kepala berkas. */
  dedupeKey: string;
}

/**
 * Terbitkan satu pemberitahuan. Memulangkan `false` bila kembarannya sudah ada.
 *
 * `skipDuplicates` dan BUKAN `catch (P2002)`: yang kedua menyembunyikan galat
 * unik LAIN yang kebetulan lewat jalur yang sama, dan pada tabel dengan satu
 * constraint hari ini itu terasa aman — sampai constraint kedua ditambahkan.
 */
export async function notify(input: NotifyInput): Promise<boolean> {
  const result = await controlDb.notification.createMany({
    data: [
      {
        userId: input.userId,
        kind: input.kind,
        title: input.title,
        body: input.body,
        href: input.href ?? null,
        dedupeKey: input.dedupeKey,
      },
    ],
    skipDuplicates: true,
  });
  return result.count > 0;
}

/**
 * Kotak masuk seorang pengguna — belum dibaca lebih dulu, lalu terbaru.
 *
 * `userId` SELALU datang dari sesi pemanggil, tidak pernah dari badan
 * permintaan. Itu satu-satunya pagar yang dibutuhkan permukaan ini, dan ia
 * ditegakkan di route, bukan di sini: fungsi yang menerima id begitu saja
 * tidak boleh berpura-pura menjaga apa pun.
 */
export async function listNotifications(userId: number, limit = DEFAULT_LIMIT) {
  return controlDb.notification.findMany({
    where: { userId },
    orderBy: [{ readAt: "asc" }, { createdAt: "desc" }],
    take: limit,
  });
}

/** Berapa yang belum dibaca — angka di lonceng. */
export async function unreadNotificationCount(userId: number): Promise<number> {
  return controlDb.notification.count({ where: { userId, readAt: null } });
}

/**
 * Tandai terbaca. Tanpa `ids` = seluruh kotak masuknya.
 *
 * `userId` ikut di `where` bahkan saat `ids` disebut — id yang ditebak orang
 * lain tidak boleh menandai apa pun milik siapa pun.
 */
export async function markNotificationsRead(
  userId: number,
  ids?: number[]
): Promise<number> {
  const result = await controlDb.notification.updateMany({
    where: {
      userId,
      readAt: null,
      ...(ids && ids.length > 0 ? { id: { in: ids } } : {}),
    },
    data: { readAt: new Date() },
  });
  return result.count;
}
