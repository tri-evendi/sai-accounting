/**
 * KUNCI BUKU — otentikasi ulang sebelum masuk ke buku sebuah PT.
 *
 * ══ APA YANG DIPECAHKAN, DAN APA YANG TIDAK ════════════════════════════════
 * Permintaan pemilik: membuka sebuah perusahaan harus melewati otentikasi
 * dulu, bukan langsung masuk dari sesi tenant.
 *
 * Yang perlu ditulis lebih dulu supaya tidak ada yang salah paham tentang apa
 * yang dibeli berkas ini: **tidak ada lubang yang ditambal di sini.** Sejak
 * #158 tidak ada "sesi perusahaan" yang memberi akses — `session.user.companyId`
 * hanya catatan "terakhir dibuka", jalur kanonik `/t/{tenant}/{company}/…` yang
 * membawa perusahaannya, dan penjaga memeriksa ulang KEANGGOTAAN di setiap
 * permintaan. Mengetik URL buku PT lain sudah ditolak tanpa berkas ini.
 *
 * Yang dibeli berkas ini adalah **bukti kehadiran**: pola `sudo`. Sesi yang
 * ditinggalkan terbuka di laptop yang tidak terkunci tetap bisa membuka menu
 * mana pun; kunci ini membuat pintu ke BUKU — tempat jurnal ditulis dan saldo
 * awal dibukukan — menuntut sandi sekali lagi.
 *
 * ⚠ Sandinya SANDI YANG SAMA, dan itu bukan kelalaian. Identitas di aplikasi
 * ini tunggal dan hidup di basis data kendali; peran menempel pada KEANGGOTAAN
 * per PT (`api/companies/route.ts` menjadikan pembuat PT `MANAGING_DIRECTOR` di
 * PT yang baru lahir). Kredensial terpisah per PT pernah ditimbang dan ditolak:
 * `docs/MULTI-COMPANY.md` melarang FK ke `users` dari basis data perusahaan,
 * jadi model itu menuntut sistem identitas KEDUA — beserta reset sandi,
 * undangan, dan audit yang tergandakan per PT.
 *
 * ══ KENAPA COOKIE BERTANDA TANGAN, BUKAN KLAIM DI JWT SESI ════════════════
 * Klaim di JWT harus diperbarui lewat alur `update()` milik NextAuth, yang
 * berjalan di KLIEN dan menempuh perjalanan bolak-balik; penjaga halaman butuh
 * jawabannya di SERVER, sinkron, pada permintaan yang sedang berjalan. Cookie
 * ber-HMAC menjawab di tempat: tidak ada keadaan di server yang harus
 * direplikasi antar-instance, dan isinya tidak bisa dikarang peramban karena
 * tanda tangannya memakai `AUTH_SECRET`.
 *
 * Yang dikunci ke dalam tanda tangan adalah **id penggunanya juga**, bukan
 * hanya daftar perusahaan. Tanpa itu, cookie yang dicuri dari sesi orang lain
 * — atau tertinggal setelah berganti akun di peramban yang sama — akan tetap
 * sah untuk pemilik sesi yang baru.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Umur kunci: satu hari kerja.
 *
 * Angkanya kompromi yang harus disebut: terlalu pendek dan pemegang buku
 * mengetik sandinya belasan kali sehari sampai ia berhenti membacanya —
 * friksi yang mengajari orang mengabaikan prompt justru MENURUNKAN keamanan.
 * Terlalu panjang dan "bukti kehadiran" berhenti membuktikan apa pun. Delapan
 * jam berarti sekali di pagi hari, dan kedaluwarsa sebelum shift berikutnya.
 */
export const UMUR_KUNCI_MS = 8 * 60 * 60 * 1000;

/** Nama cookie. Tanpa awalan `__Host-`: lihat catatan di `setUnlockCookie`. */
export const NAMA_COOKIE_KUNCI = "sai.company-unlock";

/** Satu perusahaan yang sedang terbuka, beserta kapan kuncinya habis. */
type Entri = [companyId: number, kedaluwarsaMs: number];

interface IsiKunci {
  /** `users.id` global — lihat catatan "id penggunanya juga" di kepala. */
  u: string;
  c: Entri[];
}

function rahasia(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) {
    /*
     * Gagal keras, dan sengaja. Tanpa rahasia, tanda tangan bisa dikarang
     * siapa pun — dan kunci yang bisa dikarang lebih buruk daripada tidak ada
     * kunci, sebab ia terlihat seperti perlindungan.
     */
    throw new Error(
      "AUTH_SECRET belum diset — kunci buku tidak bisa ditandatangani. " +
        "Ini variabel yang sama yang dipakai NextAuth; lihat .env.example."
    );
  }
  return s;
}

function tandaTangan(payload: string): string {
  return createHmac("sha256", rahasia()).update(payload).digest("base64url");
}

/** Bandingkan tanda tangan tanpa membocorkan posisi karakter yang berbeda. */
function tandaTanganCocok(payload: string, diberikan: string): boolean {
  const benar = Buffer.from(tandaTangan(payload));
  const uji = Buffer.from(diberikan);
  /* `timingSafeEqual` MELEMPAR bila panjangnya beda — diperiksa lebih dulu,
     dan panjang tanda tangan bukan rahasia. */
  return benar.length === uji.length && timingSafeEqual(benar, uji);
}

export function encodeUnlockCookie(isi: IsiKunci): string {
  const payload = Buffer.from(JSON.stringify(isi), "utf8").toString("base64url");
  return `${payload}.${tandaTangan(payload)}`;
}

/**
 * Baca & verifikasi. Mengembalikan `null` untuk SETIAP bentuk kegagalan —
 * tanda tangan salah, JSON rusak, pengguna lain, bentuk tak dikenal — sebab
 * pemanggilnya hanya punya satu tindakan untuk semuanya: minta sandi lagi.
 */
export function decodeUnlockCookie(raw: string | undefined, userId: string): IsiKunci | null {
  if (!raw) return null;
  const pisah = raw.lastIndexOf(".");
  if (pisah <= 0) return null;

  const payload = raw.slice(0, pisah);
  if (!tandaTanganCocok(payload, raw.slice(pisah + 1))) return null;

  try {
    const isi = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as IsiKunci;
    if (typeof isi?.u !== "string" || !Array.isArray(isi.c)) return null;
    /* Cookie milik akun LAIN diperlakukan sebagai tidak ada — bukan digabung. */
    if (isi.u !== userId) return null;
    return isi;
  } catch {
    return null;
  }
}

/** Buang entri yang sudah lewat. Dipakai saat membaca MAUPUN menulis. */
function masihHidup(entri: Entri[], sekarangMs: number): Entri[] {
  return entri.filter(([, kedaluwarsa]) => kedaluwarsa > sekarangMs);
}

/** Apakah buku PT ini sedang terbuka untuk pengguna ini? */
export function isCompanyUnlocked(
  raw: string | undefined,
  userId: string,
  companyId: number,
  sekarangMs: number
): boolean {
  const isi = decodeUnlockCookie(raw, userId);
  if (!isi) return false;
  return masihHidup(isi.c, sekarangMs).some(([id]) => id === companyId);
}

/**
 * Nilai cookie baru sesudah satu PT dibuka.
 *
 * Entri PT lain DIPERTAHANKAN beserta kedaluwarsanya masing-masing: pemegang
 * dua PT yang bolak-balik antar-buku sepanjang hari tidak boleh dipaksa
 * membuka ulang yang satu setiap kali ia membuka yang lain. Kedaluwarsa per
 * entri, bukan satu untuk semua — kalau tidak, membuka PT kedua diam-diam
 * memperpanjang kunci PT pertama.
 */
export function withCompanyUnlocked(
  raw: string | undefined,
  userId: string,
  companyId: number,
  sekarangMs: number
): string {
  const isi = decodeUnlockCookie(raw, userId);
  const lain = masihHidup(isi?.c ?? [], sekarangMs).filter(([id]) => id !== companyId);
  return encodeUnlockCookie({
    u: userId,
    c: [...lain, [companyId, sekarangMs + UMUR_KUNCI_MS]],
  });
}

/**
 * Cookie yang MENCABUT seluruh kunci — dipakai saat keluar.
 *
 * Sesi yang berakhir harus membawa kuncinya ikut berakhir; membiarkannya
 * berarti orang berikutnya yang masuk di peramban yang sama menemukan buku
 * yang sudah terbuka. (Pemeriksaan `u` di `decodeUnlockCookie` sudah menutup
 * kasus akun yang BERBEDA; ini menutup kasus akun yang SAMA masuk kembali
 * tanpa bermaksud membuka bukunya.)
 */
export const COOKIE_KUNCI_KOSONG = "";
