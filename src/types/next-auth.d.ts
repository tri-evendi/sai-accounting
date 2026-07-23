import "next-auth";

declare module "next-auth" {
  interface User {
    role?: string;
    status?: number;
    // issue #11 — Mode Akuntan preference (null = follow role default).
    accountantMode?: boolean | null;
    // audit RBAC fase 3 — versi sesi untuk pencabutan.
    sessionVersion?: number;
  }

  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: string;
      status: number;
      // issue #11 — raw preference; effectiveAccountantMode() derives the boolean.
      accountantMode?: boolean | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    status?: number;
    userId?: string;
    // issue #11 — Mode Akuntan preference carried across requests.
    accountantMode?: boolean | null;
    // audit RBAC fase 3 — versi sesi + stempel revalidasi terakhir (ms epoch).
    sessionVersion?: number;
    checkedAt?: number;
  }
}
