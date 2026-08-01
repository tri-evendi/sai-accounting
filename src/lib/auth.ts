import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import { controlDb } from "@/lib/control-db";
import { companiesForUser, membershipFor } from "@/lib/company-registry";
import { loginSchema } from "@/lib/validations/auth";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { evaluateSession, shouldRecheckSession } from "@/lib/session-guard";

/**
 * Autentikasi (issue #104): identitas dibaca dari BASIS DATA KENDALI, bukan
 * dari buku salah satu perusahaan.
 *
 * ══ APA YANG DIBAWA TOKEN, DAN KENAPA ══════════════════════════════════════
 *   userId             siapa orangnya                    (identitas, global)
 *   sessionVersion     alat pencabutan sesi              (identitas, global)
 *   mustChangePassword satu kata sandi untuk semua PT    (identitas, global)
 *   companyId          PT yang SEDANG dibuka             (pilihan, per sesi)
 *   role               peran DI PT ITU                   (keanggotaan)
 *   accountantMode     preferensi tampilan DI PT ITU     (keanggotaan)
 *
 * `role` sengaja TIDAK global. Seseorang bisa Direktur Utama di PT A dan Kepala
 * Gudang di PT B; satu kolom peran tidak bisa menyatakan itu, dan menebaknya
 * berarti memberi orang akses yang bukan haknya di salah satu dari keduanya.
 *
 * ══ MASUK TANPA PERUSAHAAN AKTIF ADALAH KEADAAN YANG SAH ═══════════════════
 * Pengguna dengan lebih dari satu PT masuk TANPA `companyId`, lalu memilih di
 * `/select-company`. Memilihkan otomatis (mis. "yang pertama") terdengar ramah
 * tapi berbahaya: orang akan mengira ia sedang melihat PT yang biasa dibukanya,
 * lalu menulis transaksi ke buku yang salah. Kalau PT-nya cuma satu, pilihannya
 * tidak ambigu, jadi ia langsung aktif.
 *
 * ══ BERGANTI PERUSAHAAN ════════════════════════════════════════════════════
 * Lewat `useSession().update({ companyId })`. Keanggotaannya diperiksa ULANG di
 * sini — angka yang datang dari klien tidak pernah dipercaya. Sisi klien wajib
 * memuat ulang halaman sepenuhnya setelahnya (lihat CompanySwitcher).
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  // Required behind nginx/reverse proxy when env vars are not loaded at runtime
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        identifier: {},
        password: {},
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const identifier = parsed.data.identifier.toLowerCase();

        // Rate limit per pengenal (email/username), sebelum menyentuh DB.
        const rateCheck = checkRateLimit(`login:${identifier}`, RATE_LIMITS.login);
        if (!rateCheck.allowed) {
          throw new Error("Too many login attempts. Please try again later.");
        }

        /*
         * ── Pengenal login = EMAIL (issue #136), username sebagai peralihan ──
         *
         * Berisi `@` → dicari lewat `users.email` (unik sejak migration 0003).
         * Tanpa `@` → username LAMA: dicari `findMany take 2`, dan HANYA
         * diterima bila hasilnya persis satu. Sejak 0004 username tidak lagi
         * unik se-pemasangan; nama yang kembar (dua tenant, dua `budi`) tidak
         * bisa dijawab tanpa menebak pemiliknya, jadi ia ditolak sebagai
         * kredensial salah — pemiliknya masuk dengan email, pengenal yang
         * memang tidak pernah ambigu. Jalur username sengaja TIDAK dibuang:
         * pengguna pt-sai belum tentu tahu email yang didaftarkan untuknya,
         * dan mengunci mereka semua pada hari rilis bukan migrasi, melainkan
         * pemadaman.
         */
        const user = identifier.includes("@")
          ? await controlDb.user.findUnique({ where: { email: identifier } })
          : await (async () => {
              const matches = await controlDb.user.findMany({
                where: { username: parsed.data.identifier },
                take: 2,
              });
              return matches.length === 1 ? matches[0] : null;
            })();

        if (!user) return null;

        const passwordMatch = await bcrypt.compare(parsed.data.password, user.password);

        if (!passwordMatch) return null;

        // Perusahaan yang boleh dibukanya. Kosong = akunnya sah tapi belum
        // diberi akses ke PT mana pun; katakan itu apa adanya, jangan biarkan
        // ia masuk ke aplikasi yang setiap halamannya akan menolak.
        const companies = await companiesForUser(user.id);
        if (companies.length === 0) {
          throw new Error("NoCompanyAccess");
        }

        // Satu perusahaan = tidak ada yang perlu dipilih. Lebih dari satu =
        // pengguna yang memilih, di layar tersendiri.
        const only = companies.length === 1 ? companies[0] : null;
        const membership = only ? await membershipFor(user.id, only.companyId) : null;

        return {
          id: String(user.id),
          name: user.name || user.username,
          /*
           * AKHIRNYA email sungguhan (issue #136) — bukan lagi username yang
           * dialiaskan. NULL hanya mungkin di tengah masa adopsi #134
           * (sebelum migration 0003); username menjadi pengisi supaya audit
           * yang mencatat kolom ini tidak pernah kosong.
           */
          email: user.email ?? user.username,
          mustChangePassword: user.mustChangePassword,
          sessionVersion: user.sessionVersion,
          companyId: only?.companyId ?? null,
          companySlug: only?.slug ?? null,
          companyName: only?.name ?? null,
          companyCount: companies.length,
          role: membership?.role ?? null,
          accountantMode: membership?.accountantMode ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        const u = user as {
          mustChangePassword?: boolean;
          sessionVersion?: number;
          companyId?: number | null;
          companySlug?: string | null;
          companyName?: string | null;
          companyCount?: number;
          role?: string | null;
          accountantMode?: boolean | null;
        };
        token.userId = user.id;
        token.mustChangePassword = u.mustChangePassword ?? false;
        token.sessionVersion = u.sessionVersion ?? 1;
        token.companyId = u.companyId ?? null;
        token.companySlug = u.companySlug ?? null;
        token.companyName = u.companyName ?? null;
        token.companyCount = u.companyCount ?? 0;
        token.role = u.role ?? null;
        token.accountantMode = u.accountantMode ?? null;
        token.checkedAt = Date.now();
        return token;
      }

      /*
       * Berganti perusahaan (issue #104). Angka dari klien TIDAK pernah
       * dipercaya: keanggotaannya dibaca ulang dari basis data kendali, dan
       * permintaan untuk PT yang bukan haknya diabaikan — token tetap pada
       * perusahaan yang sekarang.
       */
      if (trigger === "update" && session && typeof session === "object" && "companyId" in session) {
        const requested = Number((session as { companyId?: unknown }).companyId);
        const userId = Number.parseInt(String(token.userId), 10);
        if (Number.isInteger(requested) && Number.isInteger(userId)) {
          const membership = await membershipFor(userId, requested);
          if (membership) {
            token.companyId = membership.company.companyId;
            token.companySlug = membership.company.slug;
            token.companyName = membership.company.name;
            token.role = membership.role;
            token.accountantMode = membership.accountantMode;
            token.checkedAt = Date.now();
          }
        }
      }

      // issue #11 — toggle Mode Akuntan dari navbar. Preferensi TAMPILAN saja;
      // peran tidak pernah disentuh di sini.
      if (
        trigger === "update" &&
        session &&
        typeof session === "object" &&
        "accountantMode" in session
      ) {
        const next = (session as { accountantMode?: boolean | null }).accountantMode;
        token.accountantMode = next === true || next === false ? next : null;
      }

      /*
       * ── Kata sandi baru saja diganti — paksa revalidasi SEKARANG ──────────
       *
       * `mustChangePassword` hanya disegarkan oleh revalidasi berkala di bawah,
       * dan jaraknya `SESSION_RECHECK_MS` (60 detik). Tanpa cabang ini, orang
       * yang BERHASIL mengganti kata sandinya tetap membawa token bertanda
       * "wajib ganti" sampai satu menit — dan `proxy.ts` memantulkan setiap
       * tujuan kembali ke `/change-password`. Yang dilihat pengguna baru pada
       * langkah pertamanya adalah formulir yang menolak keberhasilannya
       * sendiri, tanpa satu pun pesan galat yang menjelaskan.
       *
       * Yang ditulis di sini hanya "sudah lama tidak diperiksa"; nilainya tetap
       * dibaca dari basis data kendali oleh blok di bawah. Klien tidak pernah
       * bisa mengumumkan bahwa sandinya sudah berganti — ia hanya bisa meminta
       * pemeriksaan lebih awal.
       */
      if (
        trigger === "update" &&
        session &&
        typeof session === "object" &&
        "passwordChanged" in session
      ) {
        token.checkedAt = 0;
      }

      // ── audit RBAC fase 3 + keanggotaan (#104) — revalidasi berkala ──────
      if (!token.userId) return null;
      if (shouldRecheckSession(token, Date.now())) {
        const userId = Number.parseInt(String(token.userId), 10);
        const dbUser = await controlDb.user.findUnique({
          where: { id: userId },
          select: { mustChangePassword: true, sessionVersion: true },
        });
        const companyId = typeof token.companyId === "number" ? token.companyId : null;
        const membership = companyId === null ? null : await membershipFor(userId, companyId);

        const verdict = evaluateSession(token, dbUser, membership);
        if (verdict === "revoke") return null;

        if (verdict === "clearCompany") {
          // Aksesnya ke PT itu dicabut — tapi ia mungkin masih punya PT lain,
          // jadi yang dilepas hanya perusahaannya, bukan sesinya.
          token.companyId = null;
          token.companySlug = null;
          token.companyName = null;
          token.role = null;
          token.accountantMode = null;
        } else if (membership) {
          token.role = membership.role;
          token.accountantMode = membership.accountantMode;
          // Nama perusahaan bisa berubah di halaman pengaturan; revalidasi
          // berkala ini satu-satunya tempat sesi lama ikut menyusul.
          token.companyName = membership.company.name;
        }

        /*
         * Jumlahnya ikut disegarkan DI SINI, bukan tiap permintaan: keanggotaan
         * berubah jarang (perusahaan baru dibuat, akses dicabut), dan revalidasi
         * berkala ini memang sudah menyentuh basis data kendali.
         */
        token.companyCount = (await companiesForUser(userId)).length;

        token.mustChangePassword = dbUser!.mustChangePassword;
        token.sessionVersion = dbUser!.sessionVersion;
        token.checkedAt = Date.now();
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
        (session.user as { role: string | null }).role = (token.role as string | null) ?? null;
        (session.user as { mustChangePassword: boolean }).mustChangePassword =
          token.mustChangePassword === true;
        (session.user as { accountantMode?: boolean | null }).accountantMode =
          (token.accountantMode as boolean | null | undefined) ?? null;
        (session.user as { companyId: number | null }).companyId =
          (token.companyId as number | null | undefined) ?? null;
        (session.user as { companySlug: string | null }).companySlug =
          (token.companySlug as string | null | undefined) ?? null;
        (session.user as { companyName: string | null }).companyName =
          (token.companyName as string | null | undefined) ?? null;
        (session.user as { companyCount: number }).companyCount =
          typeof token.companyCount === "number" ? token.companyCount : 0;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
  },
});
