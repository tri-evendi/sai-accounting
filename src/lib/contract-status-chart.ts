/**
 * IRISAN DONAT STATUS KONTRAK — setiap kontrak harus terhitung
 * (audit skema §S3 — docs/arsitektur/13-AUDIT-SKEMA.md)
 *
 * == CACAT YANG DIPERBAIKI BERKAS INI =====================================
 * Donat status di halaman kontrak dibangun dari TIGA status yang dipaku:
 *
 *     { name: sah,         value: countByStatus.get("signed")   ?? 0 },
 *     { name: menunggu,    value: countByStatus.get("pending")  ?? 0 },
 *     { name: dibatalkan,  value: countByStatus.get("canceled") ?? 0 },
 *
 * Diukur di buku produksi: **609 kontrak, 508 masuk grafik, 101 HILANG.**
 * Seluruh 101 itu berstatus `completed` — nilai yang masuk lewat impor warisan
 * (ketiganya lahir dalam jendela dua detik yang sama, 18 Jul 11:42:45–46) dan
 * yang TIDAK ADA di kosakata aplikasi mana pun.
 *
 * Yang membuatnya berbahaya: grafik itu tidak terlihat salah. Ia menggambar tiga
 * irisan yang rapi, jumlahnya tampak masuk akal, dan 16,6% kontrak tidak ada di
 * mana pun. Tabel di halaman yang sama justru BENAR — `StatusBadge` punya
 * cadangan dan menampilkan "Completed" — jadi dua permukaan di satu halaman
 * menjawab berbeda tentang data yang sama.
 *
 * == KENAPA INI BISA DIPERBAIKI TANPA MENUNGGU KEPUTUSAN KOSAKATA ==========
 * Apakah `completed` sah dan harus masuk `CONTRACT_STATUSES`, atau 101 baris itu
 * harus dipetakan ke `signed`, adalah keputusan pemilik (§S3). Tapi jawaban mana
 * pun TIDAK mengubah aturan di sini: **grafik harus menghitung setiap kontrak.**
 * Jadi kedua hal itu dipisahkan — yang satu dikerjakan sekarang, yang satu
 * menunggu.
 *
 * Dan sesudah perbaikan ini, grafiknya sendiri menjadi bukti untuk keputusan
 * itu: irisan "Completed" akan terlihat, dengan jumlahnya.
 */

/** Tiga status yang kosakata aplikasi kenal, dalam urutan yang MENENTUKAN warna. */
const DIKENAL = ["signed", "pending", "canceled"] as const;

export type StatusDikenal = (typeof DIKENAL)[number];

export interface IrisanStatus {
  name: string;
  value: number;
}

/**
 * Label cadangan untuk status di luar kosakata.
 *
 * Aturannya SAMA dengan `StatusBadge` — huruf pertama dibesarkan — dan itu
 * disengaja: dua permukaan di satu halaman yang menamai nilai yang sama dengan
 * cara berbeda membuat pembacanya mengira itu dua hal yang berbeda.
 */
export function labelCadangan(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/**
 * Irisan donat: tiga yang dikenal dalam urutan tetap, lalu sisanya.
 *
 * Urutan tiga yang pertama TIDAK boleh berubah — `statusTones` di
 * `dashboard-charts.tsx` dipasangkan per POSISI, jadi hijau/kuning/merah
 * menempel pada sah/menunggu/dibatalkan lewat urutan ini, bukan lewat namanya.
 * Status di luar kosakata jatuh ke posisi ≥ 3 dan mendapat `unknownTone`, yang
 * memang sudah menjadi cadangan di sana.
 *
 * Yang tak dikenal diurutkan menurut namanya — bukan menurut jumlahnya — supaya
 * warna satu status tidak berpindah hanya karena datanya bergerak.
 */
export function irisanStatusKontrak(
  jumlahPerStatus: Map<string, number>,
  labelDikenal: Record<StatusDikenal, string>
): IrisanStatus[] {
  const dikenal: IrisanStatus[] = DIKENAL.map((s) => ({
    name: labelDikenal[s],
    value: jumlahPerStatus.get(s) ?? 0,
  }));

  const lain: IrisanStatus[] = [...jumlahPerStatus.entries()]
    .filter(([s]) => !(DIKENAL as readonly string[]).includes(s))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([s, n]) => ({ name: labelCadangan(s), value: n }));

  return [...dikenal, ...lain];
}

/**
 * Jumlah seluruh irisan — dipakai TES untuk menegakkan invariannya.
 *
 * Diekspor supaya invariannya bisa dinyatakan sebagai satu baris: jumlah irisan
 * harus sama dengan jumlah kontrak. Tanpa itu, cacat yang sama bisa kembali
 * dalam bentuk lain — mis. seseorang menambah status keempat ke kosakata dan
 * lupa bahwa yang kelima masih mungkin ada di data.
 */
export function totalIrisan(irisan: IrisanStatus[]): number {
  return irisan.reduce((n, i) => n + i.value, 0);
}
