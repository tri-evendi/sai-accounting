/**
 * HASIL PEKERJAAN — izin yang dituntut saat MENGUNDUH, dan bentuk kuncinya.
 *
 * ══ `result_ref` ADALAH KUNCI, BUKAN KAPABILITAS ═══════════════════════════
 * Memegang kuncinya BUKAN izin untuk membacanya. Rancangan §4 menyebut tiga
 * aturan, dan ketiganya harus jadi kode — bukan asumsi:
 *
 *   1. penyimpanan objeknya PRIVAT, tanpa akses anonim;
 *   2. unduhan lewat RUTE APLIKASI, bukan URL penyimpanan yang dibagikan —
 *      di situlah izin peran dan konteks perusahaan diperiksa;
 *   3. izin diperiksa SAAT MENGUNDUH, bukan hanya saat pekerjaan lahir.
 *
 * Yang ketiga yang paling mudah terlewat, dan ia punya bentuk kegagalan yang
 * konkret: pekerjaan hidup berjam-jam. Orang yang perannya dicabut di antara
 * "ekspor dimulai" dan "berkasnya siap" tidak boleh tetap menerima hasilnya —
 * dan satu-satunya cara itu benar adalah bila izinnya diperiksa pada
 * permintaan unduh, terhadap keadaan peran HARI ITU.
 *
 * ══ IZINNYA PER `kind`, DAN ITU BUKAN KERAPIAN ═════════════════════════════
 * Satu izin tunggal untuk seluruh unduhan ("job.read") akan membuat siapa pun
 * yang boleh mengunduh satu dokumen juga boleh mengunduh ekspor neraca —
 * karena keduanya "hasil pekerjaan". Peta di bawah menuntut tiap jenis
 * menyatakan izinnya sendiri.
 *
 * `Record<JobKind, …>` yang LENGKAP, bukan `Partial`: `kind` baru tidak akan
 * mengompilasi sampai seseorang memutuskan siapa yang berhak mengunduh
 * hasilnya. Keputusan itu tidak boleh bisa ditunda tanpa sengaja.
 *
 * MURNI: tanpa Prisma, tanpa IO, tanpa `next/*`.
 */
import type { Permission } from "./authz";
import { JOB_KINDS, type JobKind } from "./generated/job-kinds";
import { tenantApiPath } from "./tenant-routes";

/**
 * Izin yang dituntut untuk mengunduh hasil sebuah jenis pekerjaan.
 *
 * `null` berarti jenis itu TIDAK PERNAH menghasilkan berkas yang bisa diunduh
 * pengguna — dan nilainya sengaja `null` alih-alih dihilangkan dari peta:
 * ketiadaan entri tidak bisa dibedakan dari entri yang lupa ditulis, sementara
 * `null` adalah pernyataan.
 */
export const JOB_RESULT_PERMISSION: Readonly<Record<JobKind, Permission | null>> = {
  /* Berkas yang ditunggu pengguna di layar. */
  "report.export": "report.export",
  /* Lembar sebar yang sama, dihitung Go (tahap 1d) — izinnya SAMA dengan
     `report.export`: yang diunduh pengguna satu jenis berkas, siapa pun
     mesin yang menghitungnya. */
  "report.export_go": "report.export",
  "report.package": "report.export",
  "document.generate": "document.read",

  /* Impor melaporkan hasilnya sebagai ringkasan, bukan berkas. Kalau suatu
     saat ia menghasilkan berkas galat yang bisa diunduh, izinnya diputuskan
     DI SINI — dan `tsc` tidak akan mengingatkan siapa pun, jadi baris ini
     yang harus. */
  "import.process": null,
  "mail.batch": null,

  /* Penyediaan PT tidak menghasilkan berkas: hasilnya BARIS registry, dan
     layar menunggunya lewat rute statusnya sendiri (`/api/companies/
     provisioning/[id]`, penjaga tenant `company.create`), bukan rute hasil
     bertenant — PT-nya belum ada ketika pekerjaan diterbitkan. */
  "company.provision": null,

  /* Jalur pemeliharaan: hasilnya bukan untuk pengguna aplikasi.
     `tenant.backup` menghasilkan manifest, dan itu TIDAK diunduh lewat rute
     aplikasi — ia artefak operator di tujuan cadangan, dan jalannya runbook
     (`PRODUCTION.md`), bukan permukaan HTTP bertenant. Menjadikannya dapat
     diunduh lewat rute PT akan memberi satu PT jalan ke manifest yang menyebut
     nama basis data SELURUH tenant. */
  "tenant.backup": null,
  "tenant.conformance": null,
  "schema.migrate": null,
  "schedule.tick": null,

  /* Jalur `ledger` menulis buku; hasilnya baris jurnal, bukan berkas. */
  "ledger.recurring": null,
  "ledger.dunning": null,

  /* Integrasi luar mengirim berkas KELUAR; tanda terimanya bukan unduhan. */
  "integration.efaktur": null,
  "integration.bank_feed": null,
};

/** Apakah hasil jenis ini boleh diunduh lewat rute aplikasi? */
export function isDownloadableKind(kind: JobKind): boolean {
  return JOB_RESULT_PERMISSION[kind] !== null;
}

/**
 * Bentuk `result_ref` yang diterima: `<putaran>/<berkas>`, keduanya dari
 * kosakata yang sempit.
 *
 * ══ DIVALIDASI MESKI IA DATANG DARI BASIS DATA KITA SENDIRI ════════════════
 * `result_ref` ditulis pekerja, dan pekerja menulisnya dari nama yang
 * sebagiannya berasal dari muatan pekerjaan — yaitu dari luar. Nilai yang
 * menyusun JALUR BERKAS diperiksa apa pun asalnya; aturan yang sama dengan
 * `resolveDocumentPath` (#367) dan nama basis data di `company-clients.ts`.
 *
 * Yang ditolak, dan tiap penolakan punya serangan yang jelas di belakangnya:
 * `..` (keluar dari akar), garis miring di awal (jalur absolut), garis miring
 * berganda dan `\` (normalisasi yang berbeda antar lapis), byte nol
 * (pemotongan jalur di lapisan C), dan apa pun di luar
 * `[A-Za-z0-9._-]` per segmen.
 */
const SEGMEN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function isValidResultRef(ref: string): boolean {
  if (ref.length === 0 || ref.length > 320) return false;
  if (ref.includes("\0") || ref.includes("\\")) return false;
  const bagian = ref.split("/");
  /* TEPAT dua segmen: `<putaran>/<berkas>`. Kedalaman yang bebas membuat
     "di bawah akar" menjadi sifat yang harus dibuktikan ulang tiap kali
     seseorang menambah lapis; dua segmen membuatnya bisa dibaca sekali. */
  if (bagian.length !== 2) return false;
  return bagian.every((s) => s !== "." && s !== ".." && SEGMEN.test(s));
}

/**
 * Nama berkas yang dilihat pengguna, dari `result_ref`.
 *
 * Diambil dari segmen terakhir dan TIDAK dari muatan pekerjaan: nama yang
 * datang dari muatan bisa memuat apa pun, dan ia mendarat di header
 * `Content-Disposition` — tempat baris baru memecah respons.
 */
export function resultFilename(ref: string): string {
  return ref.slice(ref.lastIndexOf("/") + 1);
}

/** Apakah `kind` ini dikenal kontrak? Pembungkus tipis untuk pembaca rute. */
export function isKnownKind(v: string): v is JobKind {
  return Object.prototype.hasOwnProperty.call(JOB_KINDS, v);
}

/**
 * Alamat pengambilan hasil sebuah pekerjaan. SATU tempat rumus ini ditulis.
 *
 * `kind` ikut di jalurnya, dan alasannya URUTAN PEMERIKSAAN — bukan kerapian
 * URL. Lengkapnya di kepala route handler-nya; ringkasnya: izin yang dituntut
 * bergantung pada jenis pekerjaannya, dan membaca jenis itu dari barisnya
 * sebelum gerbang berjalan akan membocorkan keberadaan pekerjaan ke penanya
 * anonim.
 *
 * Sepasang slug WAJIB, dan itu bukan kerepotan yang bisa dihemat (#489):
 * alamat ini mendarat di `<a href download>`, yang tidak melewati `apiFetch()`
 * dan tidak bisa membawa header lingkup. Menjadikannya parameter wajib berarti
 * yang lupa mengirimnya gugur di `tsc`, bukan di layar pengguna.
 */
export function jobResultHref(
  tenantSlug: string,
  companySlug: string,
  kind: JobKind,
  jobId: number
): string {
  return tenantApiPath(
    tenantSlug,
    companySlug,
    `/jobs/${encodeURIComponent(kind)}/${jobId}/result`
  );
}
