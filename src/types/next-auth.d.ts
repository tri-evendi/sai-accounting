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
    /** Perusahaan yang sedang dibuka. NULL = pengguna belum memilih (#104). */
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
      // issue #104 — perusahaan yang sedang dibuka sesi ini.
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
    // issue #104 — perusahaan yang sedang dibuka token ini.
    companyId?: number | null;
    companySlug?: string | null;
    companyName?: string | null;
    companyCount?: number;
  }
}
