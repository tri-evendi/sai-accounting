/**
 * Alur Kerja (panduan urutan) — menjawab "mulai dari mana?".
 *
 * Sistem punya banyak fitur tapi menu hanya MENDAFTAR-nya, tak menunjukkan
 * URUTAN mengerjakannya. Modul ini memetakan pekerjaan sehari-hari menjadi
 * beberapa alur bernomor (Penjualan, Pembelian, Tutup Buku) yang tiap
 * langkahnya menuju halaman/formulir yang tepat — sehingga pengguna awam tahu
 * "kontrak dulu, baru surat jalan, baru faktur, baru terima uang".
 *
 * MURNI (tanpa React/ikon/Prisma) seperti `nav.ts`/`quick-actions.ts`: ikon
 * disebut sebagai NAMA string, penyaringan izin bisa diuji langsung. Langkah
 * yang izinnya tak dimiliki pengguna DIBUANG lalu sisanya dinomori ulang, dan
 * alur yang tersisa < 2 langkah tidak ditampilkan (bukan "alur" lagi).
 *
 * TAMPILAN saja — tiap halaman tujuan tetap dijaga `requirePagePermission`.
 */
import { can, type Permission } from "@/lib/authz";
import type { AllowedPermissions } from "@/lib/nav";
import type { TermKey } from "@/lib/labels";
import type { DictionaryKey } from "@/lib/i18n/dictionary";

export type WorkflowTone = "in" | "out" | "neutral";

export interface WorkflowStep {
  /**
   * Perintah bahasa tugas (bahasa SUMBER), mis. "Catat Penjualan". Panelnya
   * menggambar `labelKey`; teks ini tetap ada karena modul ini murni & teruji
   * — pola yang sama dengan `QUICK_ACTIONS` (lihat `quick-actions.ts`).
   */
  label: string;
  /** Satu baris: apa yang terjadi di langkah ini (bahasa sumber). */
  description: string;
  /** Kunci kamus untuk `label`. */
  labelKey: DictionaryKey;
  /** Kunci kamus untuk `description`. */
  descriptionKey: DictionaryKey;
  href: string;
  /** Nama ikon lucide-react; dipetakan ke komponen di panelnya. */
  icon: string;
  /** Izin halaman tujuan — sama dengan `requirePagePermission` di sana. */
  permission: Permission;
  /** Langkah opsional (mis. Kontrak) — ditandai di UI, tidak wajib dilalui. */
  optional?: boolean;
  termKey?: TermKey;
}

export interface Workflow {
  id: string;
  /** Nama alur dalam bahasa sumber, mis. "Alur Penjualan". */
  label: string;
  /** Satu baris menjelaskan kapan alur ini dipakai (bahasa sumber). */
  description: string;
  /** Kunci kamus untuk `label`. */
  labelKey: DictionaryKey;
  /** Kunci kamus untuk `description`. */
  descriptionKey: DictionaryKey;
  tone: WorkflowTone;
  steps: WorkflowStep[];
}

export const WORKFLOWS: Workflow[] = [
  {
    id: "penjualan",
    label: "Alur Penjualan",
    description: "Dari kesepakatan sampai uang masuk — urutan mencatat penjualan.",
    labelKey: "workflows.penjualan.label",
    descriptionKey: "workflows.penjualan.description",
    tone: "in",
    steps: [
      {
        label: "Buat Kontrak",
        description: "Kesepakatan sebelum barang dikirim.",
        labelKey: "workflows.penjualan.steps.kontrak.label",
        descriptionKey: "workflows.penjualan.steps.kontrak.description",
        href: "/contracts/new",
        icon: "FileText",
        permission: "contract.write",
        optional: true,
        termKey: "kontrak",
      },
      {
        label: "Catat Penjualan",
        description: "Dipandu: pelanggan → barang → surat jalan → faktur.",
        labelKey: "workflows.penjualan.steps.penjualan.label",
        descriptionKey: "workflows.penjualan.steps.penjualan.description",
        href: "/sales/new",
        icon: "Receipt",
        permission: "invoice.write",
        termKey: "faktur",
      },
      {
        label: "Terima Pembayaran",
        description: "Catat uang masuk ke kas / bank.",
        labelKey: "workflows.penjualan.steps.terima.label",
        descriptionKey: "workflows.penjualan.steps.terima.description",
        href: "/finance/new?arah=masuk",
        icon: "ArrowDownLeft",
        permission: "cash.write",
        termKey: "kas_bank",
      },
      {
        label: "Pantau Piutang",
        description: "Lihat pelanggan yang belum bayar.",
        labelKey: "workflows.penjualan.steps.piutang.label",
        descriptionKey: "workflows.penjualan.steps.piutang.description",
        href: "/receivables",
        icon: "HandCoins",
        permission: "receivable.read",
        termKey: "piutang",
      },
    ],
  },
  {
    id: "pembelian",
    label: "Alur Pembelian",
    description: "Dari beli barang sampai utang lunas.",
    labelKey: "workflows.pembelian.label",
    descriptionKey: "workflows.pembelian.description",
    tone: "out",
    steps: [
      {
        label: "Catat Pembelian",
        description: "Dipandu: pemasok → barang → utang.",
        labelKey: "workflows.pembelian.steps.pembelian.label",
        descriptionKey: "workflows.pembelian.steps.pembelian.description",
        href: "/purchases/new",
        icon: "ShoppingCart",
        permission: "purchase.write",
        termKey: "pembelian",
      },
      {
        label: "Bayar Pemasok",
        description: "Catat uang keluar dari kas / bank.",
        labelKey: "workflows.pembelian.steps.bayar.label",
        descriptionKey: "workflows.pembelian.steps.bayar.description",
        href: "/finance/new?arah=keluar",
        icon: "ArrowUpRight",
        permission: "cash.write",
        termKey: "kas_bank",
      },
      {
        label: "Pantau Utang",
        description: "Lihat tagihan yang harus dibayar.",
        labelKey: "workflows.pembelian.steps.utang.label",
        descriptionKey: "workflows.pembelian.steps.utang.description",
        href: "/payables",
        icon: "Wallet",
        permission: "payable.read",
        termKey: "utang",
      },
    ],
  },
  {
    id: "tutup_buku",
    label: "Tutup Buku Bulanan",
    description: "Beres-beres tiap akhir bulan sebelum laporan final.",
    labelKey: "workflows.tutup_buku.label",
    descriptionKey: "workflows.tutup_buku.description",
    tone: "neutral",
    steps: [
      {
        label: "Cocokkan Rekening",
        description: "Samakan catatan dengan rekening koran bank.",
        labelKey: "workflows.tutup_buku.steps.cocokkan.label",
        descriptionKey: "workflows.tutup_buku.steps.cocokkan.description",
        href: "/reconciliation",
        icon: "Scale",
        permission: "reconciliation.read",
        termKey: "rekonsiliasi_bank",
      },
      {
        label: "Kunci Bulan",
        description: "Tutup periode agar angkanya tak berubah lagi.",
        labelKey: "workflows.tutup_buku.steps.kunci.label",
        descriptionKey: "workflows.tutup_buku.steps.kunci.description",
        href: "/periods",
        icon: "Lock",
        permission: "period.manage",
        termKey: "tutup_periode",
      },
      {
        label: "Lihat Laporan",
        description: "Laba/rugi, neraca, arus kas.",
        labelKey: "workflows.tutup_buku.steps.laporan.label",
        descriptionKey: "workflows.tutup_buku.steps.laporan.description",
        href: "/reports",
        icon: "BarChart3",
        permission: "report.read",
      },
    ],
  },
];

/**
 * Alur yang relevan bagi pengguna: tiap langkah disaring `allowed` (izin
 * EFEKTIF, issue #73) atau `can()` bawaan bila belum termuat. Alur dengan
 * kurang dari dua langkah tersisa dibuang — panduan urutan hanya bermakna bila
 * ada urutan.
 */
export function visibleWorkflows(
  role: string | null | undefined,
  allowed?: AllowedPermissions
): Workflow[] {
  if (!role) return [];
  const holds = (p: Permission) => (allowed ? allowed.has(p) : can({ role }, p));
  return WORKFLOWS.map((wf) => ({
    ...wf,
    steps: wf.steps.filter((s) => holds(s.permission)),
  })).filter((wf) => wf.steps.length >= 2);
}
