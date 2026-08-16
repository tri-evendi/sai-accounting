/**
 * PERINGATAN OPERASIONAL (issue #374) — galat yang harus SAMPAI ke orang.
 *
 * ══ MASALAH YANG DISELESAIKAN ═══════════════════════════════════════════════
 * `lib/log.ts` menaruh galat di tempat yang bisa dibaca. Itu belum cukup: log
 * hanya berguna bagi orang yang sedang melihatnya, dan kegagalan yang paling
 * mahal justru terjadi ketika tidak ada yang melihat. Modul ini yang membuat
 * sebagian kecil dari galat itu MENGETUK PINTU.
 *
 * ══ PEREDAM ADALAH SELURUH BAGIAN YANG SULIT ════════════════════════════════
 * Keputusan pemilik adalah peringatan surel, bukan dasbor. Bahaya bentuk itu
 * bukan kurangnya peringatan melainkan BANJIRNYA: satu basis data yang tumbang
 * menghasilkan ribuan galat identik dalam semenit, dan seribu surel dalam
 * semenit mengubah kotak masuk seseorang menjadi sesuatu yang ia saring ke
 * folder — setelah itu peringatan berikutnya, yang mungkin penting, tidak
 * pernah terbaca lagi. Peringatan yang membanjir sama tidak bergunanya dengan
 * tidak ada peringatan, dan lebih berbahaya karena terasa seperti punya.
 *
 * Maka peredamnya bukan hiasan: SATU surel per SIDIK JARI per jam. Sidik
 * jarinya adalah nama peristiwa + nama galat, bukan pesannya — pesan sering
 * memuat id yang berbeda tiap kejadian, dan sidik jari yang ikut berubah
 * berarti tidak ada peredaman sama sekali.
 *
 * ══ PEREDAMNYA MEMAKAI PENGHITUNG YANG SUDAH ADA ════════════════════════════
 * "Paling banyak satu per jam per kunci" adalah persis definisi pembatas laju,
 * dan `rate-limit-persistent.ts` (#138) sudah melakukannya dengan benar:
 * atomik lewat UPSERT, selamat dari restart, terbagi antar-instance. Menulis
 * peredam kedua di sebelahnya berarti dua mekanisme yang akan menyimpang.
 *
 * ══ TIDAK PERNAH MELEMPAR, TIDAK PERNAH BERULANG ════════════════════════════
 * Pemanggilnya adalah jalur-jalur yang SUDAH gagal. Sebuah peringatan yang
 * melempar akan mengubah kegagalan kecil menjadi kegagalan besar, dan
 * peringatan yang melaporkan kegagalannya sendiri lewat dirinya sendiri adalah
 * putaran tak berujung. Karena itu setiap kegagalan di berkas ini berhenti
 * pada satu `console.error` polos — sengaja bukan `logError`, supaya tidak ada
 * jalan kembali ke sini.
 */

import "server-only";

import { logError } from "@/lib/log";
import type { LogContext } from "@/lib/log";
import { checkPersistentRateLimit } from "@/lib/rate-limit-persistent";
import { sendMail } from "@/lib/mailer";

/** Satu surel per sidik jari per jam. */
const ALERT_THROTTLE = { windowMs: 60 * 60 * 1000, maxAttempts: 1 } as const;

/**
 * Sidik jari peredam: peristiwa + jenis galat, TANPA pesannya.
 *
 * Pesan galat sering memuat id, nama berkas, atau nomor yang berbeda pada
 * setiap kejadian. Sidik jari yang ikut berubah menghasilkan satu ember baru
 * setiap kali — yaitu tidak ada peredaman sama sekali, dengan tampilan seolah
 * ada. MURNI, supaya sifat itu bisa dikunci di tes.
 */
export function alertFingerprint(event: string, error: unknown): string {
  const kind = error instanceof Error ? error.name : typeof error;
  return `${event}:${kind}`;
}

/** Ke mana peringatan dikirim. Kosong = tidak ada yang dikirim, dan itu SAH. */
function alertRecipient(): string | null {
  const explicit = process.env.PLATFORM_ALERT_EMAIL?.trim();
  if (explicit) return explicit;
  /* Cadangan ke alamat kontak: pemasangan yang sudah mengisi satu alamat tidak
     seharusnya diam-diam tidak punya penerima peringatan. */
  return process.env.PLATFORM_CONTACT_EMAIL?.trim() || null;
}

/**
 * Catat galat, dan — bila peredamnya mengizinkan — ketuk pintu.
 *
 * SELALU mencatat; yang diredam hanya surelnya. Log adalah riwayat lengkapnya,
 * surel hanya pemberitahuan bahwa riwayat itu perlu dibaca.
 */
export async function reportError(
  event: string,
  error: unknown,
  context?: LogContext
): Promise<void> {
  logError(event, error, context);

  const to = alertRecipient();
  if (!to) return;

  try {
    const fingerprint = alertFingerprint(event, error);
    const gate = await checkPersistentRateLimit(`alert:${fingerprint}`, ALERT_THROTTLE);
    if (!gate.allowed) return;

    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const lines = Object.entries(context ?? {}).map(([k, v]) => `  ${k}: ${String(v)}`);

    await sendMail({
      to,
      subject: `[SAI] ${event}`,
      text:
        `Sebuah galat terjadi di jalur yang SENGAJA tidak menggagalkan permintaannya,\n` +
        `jadi penggunanya kemungkinan besar tidak melihat apa pun.\n\n` +
        `  peristiwa : ${event}\n` +
        `  galat     : ${detail}\n` +
        `  waktu     : ${new Date().toISOString()}\n` +
        (lines.length > 0 ? `\nkonteks:\n${lines.join("\n")}\n` : "") +
        `\nRiwayat lengkapnya ada di log container, dalam bentuk JSON:\n` +
        `  docker compose logs web | grep '"event":"${event}"' | jq .\n\n` +
        `Surel berikutnya untuk galat sejenis paling cepat satu jam lagi —\n` +
        `peredam ini yang menjaga kotak masuk Anda tetap layak dibaca.\n`,
    });
  } catch (failure) {
    /* `console.error` POLOS, sengaja bukan `logError`: satu-satunya jalan yang
       tidak bisa memanggil balik ke sini. */
    console.error("[alert] peringatan gagal dikirim:", failure);
  }
}
