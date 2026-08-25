/**
 * JEJAK AUDIT — siapa melakukan apa, di perusahaan mana.
 *
 * ══ DARI BERKAS KE TABEL (issue #370) ══════════════════════════════════════
 * Sampai issue ini jejaknya adalah `data/audit/<slug>/audit.jsonl`: ditambah
 * dengan `appendFile`, dan DIBACA UTUH ke memori setiap kali halaman Audit
 * dibuka — seluruh berkas, seluruh barisnya di-parse, untuk mengambil 20.
 * Tanpa rotasi dan tanpa batas, di mesin yang rutin menyisakan ratusan
 * megabita. Tiga akibat lain lahir dari sebab yang sama, yaitu jejak yang
 * hidup DI LUAR basis data PT:
 *
 *   • tidak ikut ekspor mandiri tenant (#142) — sapuannya hanya melihat tabel;
 *   • tidak ikut penghancuran buku — berkasnya bertahan selamanya di direktori
 *     bersama, lengkap dengan nama pengguna dan alamat IP;
 *   • `appendFile` dari dua proses adalah baris yang saling menimpa, senyap,
 *     pada hari pertama penskalaan mendatar.
 *
 * Ketiganya menjadi urusan basis data begitu jejaknya menjadi tabel.
 *
 * ══ ALASAN PEMISAHAN PER PERUSAHAAN TIDAK DILEPAS ══════════════════════════
 * Versi berkas memilih satu berkas per perusahaan dengan alasan yang masih
 * berlaku kata demi kata: "siapa mengubah faktur siapa" adalah informasi yang
 * paling tidak boleh menyeberang, dan dengan penyimpanan terpisah, pembaca yang
 * lupa menyaring TIDAK PUNYA apa-apa untuk bocor.
 *
 * Tabel `audit_logs` hidup di basis data PT ITU SENDIRI, jadi jaminan itu utuh
 * — ditegakkan mekanisme yang lebih kuat, bukan konvensi: `prisma` di dalam
 * permintaan adalah klien PT aktif (konteksnya dimasuki penjaga), dan tabel ini
 * karena itu tidak punya kolom `company_id` untuk dilupakan seseorang.
 *
 * ══ MENULIS JEJAK TIDAK BOLEH MENGGAGALKAN AKSINYA ═════════════════════════
 * Sifat yang dipertahankan apa adanya dari versi berkas: penulisan jejak
 * terjadi SESUDAH transaksi bisnisnya, dan kegagalannya ditelan ke log. Sebuah
 * faktur yang sah tidak boleh batal hanya karena catatannya gagal ditulis.
 * Menjadikannya bagian transaksi adalah keputusan tersendiri yang pantas
 * dipikirkan terpisah — bukan efek samping pemindahan penyimpanan.
 *
 * ══ BERKAS LAMA ════════════════════════════════════════════════════════════
 * `bun run migrate:audit --apply` memindahkan isinya ke tabel ini, lalu MENGGANTI
 * NAMA berkasnya (tidak menghapusnya — menghapus jejak audit secara otomatis
 * adalah persis kebalikan dari alasan jejak itu ada). Sampai itu dijalankan,
 * halaman Audit membaca dari tabel dan berkas lamanya belum terlihat: itulah
 * kenapa skripnya LANGKAH RILIS, bukan kebersihan yang bisa ditunda.
 */
import { clientIpFrom } from "@/lib/client-ip";
import { prisma } from "@/lib/prisma";

export type AuditAction =
  /** Perusahaan baru dibuat dari aplikasi — basis datanya ikut lahir (#104). */
  | "company.create"
  | "finance.create"
  | "stock.in"
  | "stock.out"
  | "item.create"
  /// Barang dinonaktifkan/diaktifkan lagi — bukan dihapus (docs/DATABASE.md §1.3).
  | "item.activate"
  | "item.deactivate"
  | "supplier_transaction.purchase"
  | "supplier_transaction.payment"
  /** Re-allocating an existing payment across purchases (issue #38). No journal. */
  | "supplier_transaction.allocate"
  | "auth.password_change"
  /**
   * Seluruh data CONTOH dibuang sekaligus (`[CONTOH]`). Belasan dokumen dan
   * jurnalnya hilang dalam satu tindakan, jadi ia WAJIB berjejak: orang
   * berikutnya yang bertanya "faktur contohnya ke mana" harus menemukan
   * jawabannya di sini, bukan menyimpulkan bukunya pernah dibobol.
   */
  /**
   * Impor master data dari berkas (issue #381). Satu entri per BERKAS, bukan
   * per baris: seratus pelanggan yang masuk sekaligus adalah SATU tindakan
   * seseorang, dan seratus baris jejak untuk satu tindakan mengubur tindakan
   * lain yang justru perlu dibaca.
   */
  /**
   * Token API (issue #389). Tokennya sendiri TIDAK PERNAH masuk jejak — jejak
   * dibaca lebih banyak orang daripada yang berhak memakai tokennya. Yang
   * dicatat namanya, perannya, dan siapa yang menerbitkan/mencabutnya.
   */
  | "api_token.create"
  | "api_token.revoke"
  | "master.import"
  | "sample_data.clear"
  | "period.close"
  | "period.reopen"
  /** Recording uang muka received/paid before any invoice exists (issue #26). */
  | "advance.create"
  | "advance.cancel"
  /** Compensating an advance into an invoice/purchase. Posts its own journal. */
  | "advance.apply"
  | "advance.unapply"
  /** Bank reconciliation (issue #24) — none of these post a journal. */
  | "reconciliation.create"
  | "reconciliation.line.add"
  | "reconciliation.import"
  | "reconciliation.match"
  | "reconciliation.unmatch"
  | "reconciliation.lock"
  | "reconciliation.reopen"
  /** Retur penjualan & pembelian (issue #27). Each posts its own journal. */
  | "sales_return.create"
  | "purchase_return.create"
  /** Setup perusahaan + saldo awal (issue #20). Posts the opening journal, once. */
  | "setup.create"
  /** Aset tetap (issue #28). Depreciation & disposal post journals; the rest don't. */
  | "fixed_asset.category.create"
  | "fixed_asset.create"
  | "fixed_asset.depreciate"
  | "fixed_asset.dispose"
  | "fixed_asset.transfer"
  /** Surat Jalan / Delivery Order (issue #14). Reduces stock; HPP via stock-out. */
  | "delivery_order.create"
  /**
   * Faktur ditarik ("Ambil") dari sebuah kontrak (issue #15). Consumes part of an
   * outstanding contract promise. Posts NO new journal — a pulled faktur posts
   * exactly as a normal faktur does; only the document link is new.
   */
  | "invoice.pull_from_contract"
  /**
   * Faktur DIKIRIM ke pelanggan (issue #465). Tidak menyentuh buku besar sama
   * sekali — tapi ia satu-satunya tindakan di buku ini yang akibatnya KELUAR
   * dari perusahaan dan tidak bisa ditarik kembali, dan itulah persis kelas
   * tindakan yang jejaknya dicari orang berikutnya ("siapa yang menagih
   * pelanggan ini, kapan, ke alamat mana").
   *
   * Dua aksi, bukan satu, karena artinya berbeda: `email` benar-benar terkirim
   * oleh kita; `whatsapp` hanya DISIAPKAN — manusia yang menekan kirim.
   */
  | "invoice.send.email"
  | "invoice.send.whatsapp"
  /**
   * Templat transaksi berulang (issue #469). Tidak menyentuh buku besar —
   * tapi ia menentukan dokumen apa yang akan LAHIR SENDIRI setiap bulan, dan
   * pertanyaan "siapa yang menyalakan ini" tidak punya jawaban lain.
   */
  | "recurring.template.create"
  | "recurring.template.update"
  /**
   * Approval transaksi (issue #25). `approval.request` is raised by the document
   * route when a value crosses the ambang; `approval.approve` is the ONLY action
   * here that reaches the ledger — it releases the withheld journal through
   * `postForSource`. Rejecting posts nothing. Marking a decision as read is
   * deliberately NOT audited: it is the requester dismissing their own
   * notification, not a change to the record.
   */
  | "approval.request"
  | "approval.approve"
  | "approval.reject"
  /**
   * Persetujuan yang GUGUR karena dokumennya diedit melampaui nilai yang
   * disetujui (issue #45). Bukan penolakan oleh manusia: tak ada penyetuju yang
   * memutuskan apa pun di sini, dokumennya sendiri yang berubah sehingga restu
   * lama tak lagi berlaku. Jurnalnya ditarik oleh `repostForSource`.
   */
  | "approval.revoke"
  /**
   * Dokumen yang ditolak diajukan ulang setelah diperbaiki (issue #44). Tidak
   * menerbitkan jurnal apa pun — hanya mengembalikan dokumen ke antrean.
   */
  | "approval.resubmit"
  | "approval.rule.create"
  | "approval.rule.update"
  | "approval.rule.deactivate"
  /**
   * Wizard terpandu Penjualan/Pembelian Baru (issue #5). Penanda TAMBAHAN, bukan
   * pengganti: dokumen yang dibuat wizard tetap menulis entri normalnya sendiri
   * (`delivery_order.create`, `supplier_transaction.purchase`, `stock.in`, …),
   * jadi jejaknya identik dengan formulir biasa. Entri ini hanya merekam bahwa
   * seluruhnya lahir dari satu transaksi wizard, dan berapa dokumen di dalamnya.
   * Wizard tidak memposting apa pun sendiri — jurnalnya dari `postForSource`.
   */
  | "wizard.sales"
  | "wizard.purchase"
  /**
   * Manajemen pengguna (audit RBAC fase 3). Mutasi paling ber-privilege di
   * app ini (termasuk pemberian peran berakses penuh) dulunya justru TIDAK
   * diaudit.
   * `user.update` mencatat field yang berubah (roleFrom→roleTo, resetPassword)
   * — tidak pernah nilai kata sandinya.
   */
  | "user.create"
  | "user.update"
  | "user.delete"
  /**
   * Undangan staf (issue #139). `user.invite` mencatat email + peran + HASIL
   * SEBENARNYA (`outcome`) — jawaban HTTP-nya seragam demi anti-enumerasi,
   * jejak audit justru tempat kebenarannya boleh (dan harus) tinggal.
   * Tidak pernah ada token di jejak — hanya keberadaannya.
   */
  | "user.invite"
  | "user.invite_revoked"
  | "user.invite_accepted"
  /**
   * Matriks izin dikonfigurasi dari UI (issue #73). `authz.override.update`
   * mencatat set override yang DISIMPAN (peran × izin × boleh/tidak — tidak
   * pernah ada rahasia di sini); `authz.override.reset` = kembali persis ke
   * matriks bawaan di kode (semua baris override dihapus).
   */
  | "authz.override.update"
  | "authz.override.reset"
  /**
   * Izin khusus per pengguna (issue #75). `user.authz.override.update`
   * mencatat set override yang DISIMPAN untuk seorang pengguna (izin ×
   * boleh/tidak — tidak pernah ada rahasia); `user.authz.override.reset` =
   * pengguna kembali mengikuti perannya sepenuhnya (semua barisnya dihapus).
   */
  | "user.authz.override.update"
  | "user.authz.override.reset"
  /**
   * Peran dinamis — CRUD peran dari UI (/permissions). `role.create`/`update`/
   * `delete` mencatat key + label + perubahan; menghapus peran juga membuang
   * baris override izinnya.
   */
  | "role.create"
  | "role.update"
  | "role.delete"
  /**
   * Modul per kategori usaha (issue #99). Mencatat himpunan modul yang
   * DISIMPAN beserta keadaan sebelumnya — jejak yang menjawab "sejak kapan
   * menu itu hilang, dan siapa yang mematikannya". Tidak menyentuh satu baris
   * jurnal pun, dan tidak mengubah izin siapa pun.
   */
  | "company_setting.modules.update"
  /**
   * Unggah dokumen (lampiran kontrak/faktur). Tidak menyentuh jurnal — tapi
   * menulis berkas ke server, dan setiap route yang menulis wajib meninggalkan
   * jejak.
   */
  | "document.upload"
  /**
   * Pajak perusahaan (issue #368): penanda PKP dan tabel tarif PPN
   * ber-efektif-tanggal. Tidak menyentuh satu baris jurnal pun — dokumen
   * tersimpan membawa `tax_rate`-nya sendiri, jadi yang berubah hanyalah bawaan
   * formulir berikutnya. Tetap diaudit justru karena bawaan itu ikut ke faktur
   * yang dikirim ke pelanggan: "sejak kapan faktur kita 12%, dan atas
   * perintah siapa" harus punya jawaban.
   */
  | "company_setting.tax.pkp"
  | "company_setting.tax.rate.upsert"
  | "company_setting.tax.rate.delete"
  /**
   * Pengingat jatuh tempo ke pelanggan (issue #467). Dua aksi, dan yang kedua
   * bukan formalitas: `reminders.test` adalah SATU-SATUNYA bukti bahwa seorang
   * manusia pernah membaca sendiri kalimat yang kemudian dikirimkan mesin ke
   * pelanggan atas nama perusahaan ini. Penjadwal menolak berjalan tanpanya.
   */
  | "company_setting.reminders.update"
  | "company_setting.reminders.test";

export type AuditEntity =
  /** Baris `companies` di basis data KENDALI — bukan tabel di buku perusahaan. */
  | "company"
  | "cash_movement"
  /** Tabel tarif PPN ber-efektif-tanggal (issue #368). */
  | "tax_rates"
  | "stock"
  | "item"
  /**
   * Mitra dagang sebagai ENTITAS jejak (issue #381). Sebelum ini hanya
   * `supplier_transaction` yang ada — transaksinya, bukan mitranya — sehingga
   * "seratus pemasok diimpor" tidak punya entitas untuk disebut.
   */
  | "customer"
  | "supplier"
  /** Kredensial mesin (issue #389). */
  | "api_token"
  | "supplier_transaction"
  | "user"
  /** Baris `invitations` di basis data kendali (issue #139). */
  | "invitation"
  | "role"
  | "period"
  | "advance_payment"
  | "advance_application"
  | "bank_statement"
  | "bank_statement_line"
  | "sales_return"
  | "purchase_return"
  | "company_settings"
  /** Bukan sebuah tabel — kumpulan baris bertanda `[CONTOH]` di banyak tabel. */
  | "sample_data"
  | "fixed_asset_category"
  | "fixed_asset"
  | "delivery_order"
  | "invoice"
  /** Approval transaksi (issue #25). */
  | "approval_request"
  | "approval_rule"
  /** Override matriks izin (issue #73). */
  | "role_permission_override"
  /** Izin khusus per pengguna (issue #75). */
  | "user_permission_override"
  /** Dokumen unggahan (lampiran). */
  | "document"
  /** Templat transaksi berulang (issue #469). */
  | "recurring_template";

/**
 * Satu baris jejak, sebagaimana dibaca layar Audit.
 *
 * `id` bertipe NUMBER sejak #370 — kunci baris `audit_logs`. Versi berkas
 * menyusunnya sebagai string `<epoch>-<acak>`, sementara `audit-log-panel.tsx`
 * sudah lama mendeklarasikannya `number`: ketidakcocokan yang tidak pernah
 * terasa karena nilainya hanya dipakai sebagai `rowKey` React. Sekarang
 * keduanya bicara hal yang sama.
 *
 * `companyId`/`companySlug` DICABUT, bukan hilang: barisnya hidup di basis data
 * perusahaan itu, jadi menyebutkan perusahaannya di setiap baris adalah
 * pengulangan yang bisa menyimpang — dan satu-satunya pembacanya adalah berkas
 * ini sendiri.
 */
export type AuditLogEntry = {
  id: number;
  userId: string;
  username: string;
  /** Peran aktor SAAT beraksi (audit RBAC fase 3) — peran bisa berubah, jejak tidak. */
  role: string | null;
  action: AuditAction;
  entity: AuditEntity;
  entityId: number | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
};

/**
 * Alamat pelaku, untuk baris jejak. Lewat `clientIpFrom` — entri ke-N dari
 * KANAN (issue #372), bukan yang paling kiri.
 *
 * Bedanya menentukan justru DI SINI: sebuah jejak audit yang mencatat alamat
 * pilihan penyerang tidak sekadar tidak berguna, ia MENYESATKAN penyelidikan
 * yang membacanya — dan jejak audit dibaca justru ketika sedang ada masalah.
 */
export function getClientIp(request?: Request): string | null {
  if (!request) return null;
  return clientIpFrom(request.headers);
}

export async function writeAuditLog(params: {
  userId: string;
  username: string;
  /** Peran aktor saat beraksi — isi dari session.user.role (fase 3). */
  role?: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId?: number;
  details?: Record<string, unknown>;
  request?: Request;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        // Batas kolom (VarChar(50)) ditegakkan DI SINI, bukan diserahkan ke
        // basis data: MariaDB non-strict akan memotong diam-diam, dan yang
        // terpotong diam-diam adalah nama aktor di sebuah jejak audit.
        username: params.username.slice(0, 50),
        role: params.role ?? null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId ?? null,
        details: params.details ? JSON.stringify(params.details) : null,
        ipAddress: getClientIp(params.request),
      },
    });
  } catch (err) {
    /*
     * Sifat yang dipertahankan dari versi berkas: jejak yang gagal ditulis
     * TIDAK menggagalkan aksi yang sudah sah (lihat kepala berkas).
     *
     * Tapi diam bukan bagian dari sifat itu. Sebuah tindakan yang terjadi tanpa
     * meninggalkan jejak adalah persis keadaan yang jejak audit ada untuk
     * mencegahnya, dan tidak ada satu pun permukaan yang akan
     * memperlihatkannya — halamannya hanya tampak lebih pendek. Sejak #374 ia
     * mengetuk pintu (teredam satu surel per jam per jenis galat).
     *
     * Impornya DINAMIS, dan itu perlu: `lib/alert.ts` mengirim surel dan
     * menyentuh basis data kendali, sementara berkas ini diimpor 65 route.
     * Memuatnya statis menyeret mailer ke jalur panas setiap route hanya demi
     * cabang yang hampir tidak pernah jalan.
     */
    const { reportError } = await import("@/lib/alert");
    await reportError("audit.write_failed", err, {
      action: params.action,
      entity: params.entity,
      entityId: params.entityId ?? null,
    });
  }
}

export interface AuditPage {
  logs: AuditLogEntry[];
  page: number;
  perPage: number;
  totalCount: number;
  totalPages: number;
}

export interface AuditPagingOptions {
  page?: number;
  perPage?: number;
  action?: string | null;
}

/**
 * Sanitasi parameter halaman — MURNI, jadi aturannya teruji tanpa basis data
 * (yang tersisa dari `paginateAuditLines` #60, satu-satunya bagiannya yang
 * memang bukan urusan penyimpanan).
 *
 * Aman terhadap NaN dengan sengaja: `?page=abc` bisa diketik siapa saja, dan
 * `Math.max(1, NaN)` tetap NaN — yang dulu diteruskan ke `slice(NaN, NaN)` dan
 * menghasilkan daftar berisi yang tampak kosong. Sekarang taruhannya lebih
 * besar lagi: NaN yang lolos ke `skip`/`take` Prisma adalah galat kueri, bukan
 * halaman kosong.
 *
 * `perPage` dibatasi 50 — batas yang sama seperti sebelumnya, kini berarti
 * batas baris yang benar-benar diambil basis data, bukan potongan dari sesuatu
 * yang sudah terlanjur dibaca seluruhnya.
 */
export function normalizeAuditPaging(options: AuditPagingOptions): {
  page: number;
  perPage: number;
} {
  const rawPage = options.page ?? 1;
  const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
  const rawPerPage = options.perPage ?? 20;
  const perPage = Number.isFinite(rawPerPage)
    ? Math.min(50, Math.max(1, Math.floor(rawPerPage)))
    : 20;
  return { page, perPage };
}

/**
 * `details` disimpan sebagai TEKS berisi JSON. Baris yang tidak bisa diurai
 * TIDAK menjatuhkan halamannya: ia dipulangkan `null`, persis seperti versi
 * berkas melewati baris yang rusak. Sebuah jejak audit yang satu barisnya
 * cacat tetap harus bisa dibaca seluruhnya.
 */
function parseDetails(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Satu halaman jejak perusahaan AKTIF — terbaru dulu.
 *
 * Sejak #370 paginasinya dikerjakan basis data (`skip`/`take` + `count`), bukan
 * dengan membaca seluruh berkas lalu memotongnya. Perusahaannya tidak disebut
 * di `where` karena tidak bisa disebut: `prisma` di sini adalah klien PT aktif.
 */
export async function readAuditLogs(options: AuditPagingOptions): Promise<AuditPage> {
  const { page, perPage } = normalizeAuditPaging(options);
  const where = options.action ? { action: options.action } : {};

  const [rows, totalCount] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      // `id` sebagai pemutus seri: beberapa entri bisa berbagi milidetik
      // `created_at` yang sama, dan tanpa urutan total sebuah baris bisa
      // berpindah halaman antar permintaan (pola yang sama dengan /documents).
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    logs: rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      username: row.username,
      role: row.role,
      action: row.action as AuditAction,
      entity: row.entity as AuditEntity,
      entityId: row.entityId,
      details: parseDetails(row.details),
      ipAddress: row.ipAddress,
      createdAt: row.createdAt.toISOString(),
    })),
    page,
    perPage,
    totalCount,
    totalPages: Math.ceil(totalCount / perPage) || 0,
  };
}
