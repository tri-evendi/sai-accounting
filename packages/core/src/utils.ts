/*
 * `cn()` DICABUT di issue #203, bersama Tailwind.
 *
 * Bentuknya `twMerge(clsx(inputs))`: `clsx` merangkai daftar kelas, `twMerge`
 * membuang kelas Tailwind yang saling bertabrakan supaya `max-w-lg` pemanggil
 * benar-benar MENGGANTIKAN `max-w-2xl` bawaan alih-alih berdiri di sebelahnya.
 * Pekerjaan kedua itu hanya masuk akal selama ada kelas Tailwind; tanpa
 * Tailwind, `twMerge` menjadi tabel aturan tentang kosakata yang sudah tidak
 * dipakai satu berkas pun.
 *
 * Diukur sebelum dicabut: 15 pemanggil, seluruhnya di `src/components/ui/**`,
 * dan setelah konversi #203 tersisa NOL yang benar-benar merangkai kelas. Tiga
 * di antaranya memakainya bukan untuk kelas melainkan untuk menggabungkan
 * daftar id `aria-describedby` — pekerjaan yang kebetulan cocok, bukan
 * pekerjaan yang dijanjikan namanya. Ketiganya kini memanggil `describedByWith`
 * di `components/ui/input.tsx`, yang namanya menyebut apa yang digabungnya dan
 * yang tetap mengembalikan `undefined` untuk daftar kosong (atribut kosong
 * menunjuk elemen yang tidak ada).
 *
 * `clsx` dan `tailwind-merge` ikut keluar dari `package.json` bersamanya.
 */

export function formatCurrency(amount: number, currency: string = "IDR") {
  const localeMap: Record<string, string> = {
    IDR: "id-ID",
    USD: "en-US",
    CNY: "zh-CN",
  };

  try {
    return new Intl.NumberFormat(localeMap[currency] || "id-ID", {
      style: "currency",
      currency,
      minimumFractionDigits: currency === "IDR" ? 0 : 2,
    }).format(amount);
  } catch {
    // `Intl.NumberFormat` throws `RangeError: Invalid currency code` for any code
    // that is not valid ISO-4217 (legacy/dirty data such as "Rp" or "S$"). A bad
    // string on a single document must never 500 a whole ledger page, so fall back
    // to the plain number followed by the raw code as a visible label. Fix the
    // underlying value through the document's edit form.
    return `${new Intl.NumberFormat("id-ID").format(amount)} ${currency}`.trim();
  }
}

export function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("id-ID", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(date));
}

export function formatDateShort(date: Date | string) {
  return new Intl.DateTimeFormat("id-ID", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}

/**
 * Tanggal ringkas bergaya "12 Agu 2026" — bentuk yang dipakai kartu & tabel
 * permukaan `/platform`.
 *
 * Ada di sini, bukan sebagai helper lokal, karena SALINANNYA sudah tumbuh:
 * `platform/page.tsx` dan `platform/subscription-section.tsx` masing-masing
 * menulis `Intl.DateTimeFormat("id-ID", { dateStyle: "medium" })` sendiri —
 * dua definisi identik untuk tanggal yang muncul BERSEBELAHAN (kartu "tagihan
 * berikutnya" dan kolom jatuh tempo di tabel di bawahnya). Dua salinan berarti
 * dua tempat yang harus diingat pada hari gaya tanggalnya diubah, dan yang
 * terlewat akan berdiri persis di sebelah yang tidak.
 */
export function formatDateMedium(date: Date | string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(date));
}

/** Tanggal + jam — untuk batas waktu yang jamnya memang menentukan (mis. kedaluwarsa VA/QRIS). */
export function formatDateTime(date: Date | string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(date)
  );
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("id-ID").format(value);
}

/**
 * Nomor halaman dari query string, aman terhadap sampah.
 *
 * `parseInt("abc")` adalah `NaN`, dan `Math.max(1, NaN)` tetap `NaN` — yang
 * lalu mengalir ke `skip`/`slice` dan membuat daftar berisi tampak kosong
 * (atau Prisma melempar). URL bisa diedit tangan atau basi dari bookmark,
 * jadi setiap halaman berpaginasi memakai helper ini alih-alih parseInt polos.
 */
export function parsePageParam(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}
