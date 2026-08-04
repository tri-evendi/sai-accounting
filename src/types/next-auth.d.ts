import "next-auth";

declare module "next-auth" {
  interface User {
    /** Peran DI PERUSAHAAN yang sedang dibuka (issue #104). NULL = belum memilih. */
    role?: string | null;
    /** Wajib ganti kata sandi sebelum boleh membuka apa pun (users.must_change_password). */
    mustChangePassword?: boolean;
    // issue #11 — Mode Akuntan preference (null = follow role default).
    accountantMode?: boolean | null;
    // audit RBAC fase 3 — versi sesi untuk pencabutan.
    sessionVersion?: number;
    /**
     * Slug TENANT pemilik akun ini (issue #157) — bagian pertama jalur kanonik
     * `/t/{tenantSlug}/{companySlug}/…`. Tetap selama sesi hidup: satu pengguna
     * milik tepat satu tenant. NULL hanya di sisa masa adopsi #134.
     */
    tenantSlug?: string | null;
    tenantRole?: string | null;
    /** Perusahaan yang TERAKHIR dibuka. NULL = pengguna belum memilih (#104). */
    companyId?: number | null;
    companySlug?: string | null;
    /**
     * Nama perusahaan yang sedang dibuka — dibawa sesi supaya chrome aplikasi
     * bisa MENYEBUTKANNYA tanpa satu permintaan pun. Slug ("pt-sai") adalah
     * pengenal mesin; yang dikenali orang adalah namanya.
     */
    companyName?: string | null;
    /**
     * BERAPA perusahaan yang boleh dibuka pengguna ini. Dibawa sesi supaya
     * chrome bisa memutuskan menawarkan "Pilih Perusahaan" atau tidak, tanpa
     * satu permintaan pun di setiap pemuatan halaman.
     */
    companyCount?: number;
  }

  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      /** NULL selama pengguna belum memilih perusahaan — peran milik keanggotaan. */
      role: string | null;
      mustChangePassword: boolean;
      // issue #11 — raw preference; effectiveAccountantMode() derives the boolean.
      accountantMode?: boolean | null;
      // issue #157 — tenant pemilik akun; bagian pertama jalur kanonik.
      tenantSlug: string | null;
      /** Peran TENANT (owner/admin/member) — menentukan pendaratan pasca-masuk
       *  (`resolvePostLoginPath`). `undefined` = sesi lama yang belum
       *  membawanya; jangan jatuhkan ke `null`. */
      tenantRole?: string | null;
      /*
       * issue #104, turun pangkat di #157 — perusahaan yang TERAKHIR DIBUKA.
       * Bukan lagi sumber kebenaran otorisasi: halaman bertenant mengambil
       * perusahaannya dari URL dan memverifikasi keanggotaan setiap permintaan.
       * Yang tersisa untuk nilai ini: menjawab `/dashboard` telanjang, menandai
       * pilihan aktif di /select-company, dan (sampai #158) memberi konteks
       * pada route API yang belum berjalur.
       */
      companyId: number | null;
      companySlug: string | null;
      companyName: string | null;
      companyCount: number;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string | null;
    mustChangePassword?: boolean;
    userId?: string;
    // issue #11 — Mode Akuntan preference carried across requests.
    accountantMode?: boolean | null;
    // audit RBAC fase 3 — versi sesi + stempel revalidasi terakhir (ms epoch).
    sessionVersion?: number;
    checkedAt?: number;
    // issue #157 — slug tenant pemilik akun (tetap selama sesi hidup).
    tenantSlug?: string | null;
    tenantRole?: string | null;
    // issue #104 — perusahaan yang TERAKHIR dibuka token ini.
    companyId?: number | null;
    companySlug?: string | null;
    companyName?: string | null;
    companyCount?: number;
  }
}
