/**
 * "APA YANG PERLU SAYA TANGANI HARI INI?" — jawabannya, sebagai daftar.
 *
 * ══ MASALAH YANG DITUTUPNYA ════════════════════════════════════════════════
 * `pages/operator.md` menyatakan apa yang dioptimalkan permukaan ini: *"bukan
 * onboarding melainkan kecepatan menjawab 'apa yang perlu ditangani hari
 * ini'"*. Ringkasan konsol sampai sekarang menjawabnya dengan **enam belas ubin
 * berbobot sama** dalam empat kisi yang serupa — jumlah tenant di sebelah
 * jumlah pengguna di sebelah uji coba kedaluwarsa, semuanya dengan ukuran
 * angka, tebal huruf, dan tepi yang sama.
 *
 * Enam belas angka setara bukan jawaban atas pertanyaan itu; ia pertanyaan yang
 * sama, dipecah menjadi enam belas. Yang menuntut tindakan (sembilan uji coba
 * yang sudah lewat) berdiri dengan bobot yang persis sama dengan yang tidak
 * pernah menuntut apa pun (jumlah pengguna terdaftar), jadi membacanya tetap
 * menuntut orangnya menyaring sendiri — pekerjaan yang justru ia buka konsol
 * untuk hindari.
 *
 * Modul ini menyaringnya LEBIH DULU: hanya keadaan yang benar-benar menuntut
 * tindakan, berurut menurut mendesaknya, dan NOL baris ketika memang tidak ada
 * apa-apa.
 *
 * ══ TIGA ATURAN YANG MEMBENTUK DAFTARNYA ═══════════════════════════════════
 *
 *  1. **Nol tidak punya baris.** "0 tagihan lewat jatuh tempo" adalah kabar
 *     baik yang memakan satu baris dan satu kali pembacaan; sepuluh baris nol
 *     membuat satu baris yang BUKAN nol berhenti menonjol. Keadaan tenang
 *     dikatakan SEKALI, sebagai satu kalimat, oleh pemanggil.
 *
 *  2. **Penjadwal berdiri paling atas, dan bukan karena ia paling gawat.**
 *     Ia paling atas karena ia MENJELASKAN baris lain: uji coba kedaluwarsa
 *     yang menumpuk dan tagihan yang tidak pernah terbit hampir selalu berarti
 *     penjadwalnya tidak jalan — bukan pelanggannya yang diam. Membaca lima
 *     baris di bawahnya sebelum tahu itu berarti menindaklanjuti gejala.
 *
 *  3. **Setiap baris harus punya TINDAKAN, bukan hanya angka.** Karena itu
 *     tiap baris membawa `href` ke tempat tindakan itu dilakukan. Satu-satunya
 *     yang boleh tanpa `href` adalah baris yang jumlahnya menggabungkan dua
 *     status sementara saringan tujuannya hanya menerima satu — menautkannya
 *     akan mendaratkan orang di daftar yang jumlahnya BERBEDA dari angka yang
 *     baru saja ia tekan (alasan yang sama sudah tercatat di ubin
 *     "ditangguhkan" pada halaman ringkasan).
 *
 * MURNI: tanpa Prisma, tanpa `next/*`, tanpa kamus — ia menerima angka dan
 * memulangkan daftar kunci. Diuji di `tests/operator-attention.test.ts`.
 */

import { SCHEDULER_STALE_AFTER_MINUTES } from "@/lib/scheduler-heartbeat";

/** Seberapa keras baris ini dibaca. Bukan warna-saja: tiap baris berteks. */
export type AttentionTone = "danger" | "warning" | "info";

export interface AttentionItem {
  /** Penanda baris; juga akhiran kunci kamus (`operator.attention.<key>`). */
  key:
    | "schedulerNever"
    | "schedulerFailing"
    | "trialsExpired"
    | "invoicesOverdue"
    | "tenantsPastDue"
    | "tenantsSuspended"
    | "trialsEndingSoon";
  /** Angka yang dipajang. Untuk baris penjadwal: jumlah galat putaran terakhir. */
  count: number;
  tone: AttentionTone;
  /** Ke mana tindakannya dilakukan. `undefined` = lihat aturan 3 di kepala. */
  href?: string;
}

export interface AttentionInput {
  control: {
    byStatus: Record<string, number>;
    trialsEndingSoon: number;
    trialsExpired: number;
  };
  /** `null` = `sai_platform` tak terjangkau — bidangnya memang boleh mati. */
  platform: {
    overdueInvoices: number;
    lastRun: { finishedAt: Date; status: string; errorCount: number } | null;
  } | null;
}

/**
 * Berapa lama putaran penjadwal boleh tidak terdengar sebelum ia jadi temuan.
 *
 * DIIMPOR, bukan diketik ulang: `scheduler-heartbeat.ts` (#373) sudah memegang
 * ambang ini untuk `/api/health` dan halaman status publik. Dua ambang untuk
 * satu pertanyaan ("apakah penjadwal masih hidup?") berarti halaman status dan
 * konsol operator bisa berbeda pendapat tentang mesin yang sama — dan yang
 * membuka keduanya tidak punya cara tahu mana yang benar.
 *
 * Modul itu MURNI untuk bagian ini (konstanta + fungsi penilai; ia tidak
 * mengimpor Prisma maupun `next/*`), jadi kemurnian berkas ini tidak hilang.
 */
export const SCHEDULER_STALE_MINUTES = SCHEDULER_STALE_AFTER_MINUTES;

const MENIT_MS = 60 * 1000;

/**
 * Baris yang menuntut tindakan, paling mendesak di atas.
 *
 * Urutannya ditulis sebagai URUTAN KODE, bukan sebagai angka prioritas yang
 * disortir: daftar tujuh baris yang urutannya terbaca dari atas ke bawah di
 * dalam fungsi lebih sulit dirusak diam-diam daripada tujuh angka yang harus
 * dibandingkan di kepala pembacanya.
 */
export function attentionItems(input: AttentionInput, now: Date = new Date()): AttentionItem[] {
  const out: AttentionItem[] = [];
  const { control, platform } = input;

  /* ── 1. Penjadwal (aturan 2 di kepala berkas) ───────────────────────────
     Hanya bisa dinilai bila bidang platform terbaca; saat ia mati, halaman
     sudah mengatakannya sebagai kalimat tersendiri dan menambahkan baris
     "penjadwal tak diketahui" di sini hanya mengulang hal yang sama. */
  if (platform !== null) {
    const run = platform.lastRun;
    if (run === null) {
      out.push({ key: "schedulerNever", count: 0, tone: "danger", href: "/operator/scheduler" });
    } else {
      const umurMenit = (now.getTime() - run.finishedAt.getTime()) / MENIT_MS;
      const gagal = run.status !== "ok" || run.errorCount > 0;
      /* Basi ATAU gagal — keduanya satu baris, sebab tindakannya sama (buka
         halaman penjadwal) dan dua baris tentang satu mesin membuat daftar ini
         terbaca lebih panjang daripada pekerjaannya. */
      if (gagal || umurMenit > SCHEDULER_STALE_AFTER_MINUTES) {
        out.push({
          key: "schedulerFailing",
          count: run.errorCount,
          tone: "danger",
          href: "/operator/scheduler",
        });
      }
    }
  }

  /* ── 2. Uji coba yang SUDAH lewat tapi statusnya belum bergerak ────────── */
  if (control.trialsExpired > 0) {
    out.push({
      key: "trialsExpired",
      count: control.trialsExpired,
      tone: "warning",
      href: "/operator/tenants?status=trialing",
    });
  }

  /* ── 3. Tagihan lewat jatuh tempo ──────────────────────────────────────── */
  if (platform !== null && platform.overdueInvoices > 0) {
    out.push({
      key: "invoicesOverdue",
      count: platform.overdueInvoices,
      tone: "danger",
      href: "/operator/tenants?status=past_due",
    });
  }

  /* ── 4. Tenant menunggak ───────────────────────────────────────────────── */
  const menunggak = control.byStatus.past_due ?? 0;
  if (menunggak > 0) {
    out.push({
      key: "tenantsPastDue",
      count: menunggak,
      tone: "warning",
      href: "/operator/tenants?status=past_due",
    });
  }

  /* ── 5. Buku yang TERKUNCI bagi pelanggannya ───────────────────────────
     Tanpa `href` — lihat aturan 3: angkanya menjumlahkan `suspended` +
     `cancelled`, saringannya hanya menerima satu. */
  const terkunci = (control.byStatus.suspended ?? 0) + (control.byStatus.cancelled ?? 0);
  if (terkunci > 0) {
    out.push({ key: "tenantsSuspended", count: terkunci, tone: "danger" });
  }

  /* ── 6. Uji coba yang akan berakhir — menelepon SEBELUM, bukan sesudah ── */
  if (control.trialsEndingSoon > 0) {
    out.push({
      key: "trialsEndingSoon",
      count: control.trialsEndingSoon,
      tone: "info",
      href: "/operator/tenants?status=trialing",
    });
  }

  return out;
}
