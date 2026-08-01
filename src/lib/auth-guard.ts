import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import type { Permission } from "@/lib/authz";
import { canEffective, isModuleActiveFor } from "@/lib/authz-effective";
import { moduleForPermission } from "@/lib/business-modules";
import { enterCompanyFromSession } from "@/lib/company-session";
import { isWritePermission, readOnlyRefusal } from "@/lib/subscription-lifecycle";
import { tenantStateForCompany } from "@/lib/tenant-state";

type AuthResult =
  | {
      authorized: true;
      session: {
        user: {
          id: string;
          /** Peran DI PERUSAHAAN yang sedang dibuka — dijamin ada di cabang ini. */
          role: string;
          name: string;
          email: string;
          mustChangePassword: boolean;
        };
      };
      /** Perusahaan yang konteksnya sudah ditanam untuk permintaan ini (#104). */
      companyId: number;
    }
  | { authorized: false; response: NextResponse };

/**
 * SATU-SATUNYA penjaga API route (audit RBAC fase 1–4; lihat docs/RBAC.md).
 * Route mendeklarasikan IZINNYA; matriks bawaan hidup di `lib/authz.ts` dan
 * sejak issue #73 dicek terhadap matriks EFEKTIF (bawaan + override DB,
 * `lib/authz-effective.ts`). Tanpa sesi → 401; tanpa izin → 403. Sengaja
 * TANPA lapisan Mode Akuntan — mode adalah preferensi tampilan, otorisasi
 * API murni peran. Cakupan pemakaian dijaga `tests/authz-coverage.test.ts`.
 * (Pendahulunya, `requireAuth([peran])`, dihapus di fase 4.)
 */
export async function requireApiPermission(permission: Permission): Promise<AuthResult> {
  const session = await auth();

  if (!session?.user) {
    return {
      authorized: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  /*
   * Konteks perusahaan (issue #104) — DI SINI, sebelum satu query pun.
   *
   * Kalau sesinya belum memilih perusahaan, jawabannya 409 dengan kode yang
   * bisa dibaca klien, bukan 401: kredensialnya sah, yang kurang adalah
   * pilihan perusahaan. Menjawab 401 akan membuat klien melempar orang ke
   * halaman masuk untuk mengetik ulang kata sandi yang tidak pernah salah.
   */
  const company = await enterCompanyFromSession(session);
  if (!company.ok) {
    return {
      authorized: false,
      response: NextResponse.json(
        {
          error:
            company.reason === "no-company"
              ? "Pilih perusahaan terlebih dahulu."
              : "Perusahaan yang Anda buka tidak tersedia lagi.",
          code: company.reason === "no-company" ? "company_required" : "company_unavailable",
        },
        { status: 409 }
      ),
    };
  }

  /*
   * Gerbang MODUL (issue #99). Menyembunyikan menu saja tidak pernah dianggap
   * pengamanan — route-nya ikut tertutup, kalau tidak fitur yang "dimatikan"
   * masih bisa dipanggil langsung dan tetap membuat transaksi baru.
   *
   * Tetap 403 (bukan 404): permintaannya sah dan pemanggilnya terautentikasi,
   * hanya fiturnya yang tidak aktif. `code` membedakannya dari penolakan peran,
   * supaya klien bisa menampilkan kalimat yang benar.
   */
  if (!(await isModuleActiveFor(permission))) {
    return {
      authorized: false,
      response: NextResponse.json(
        {
          error: "Fitur ini belum aktif untuk perusahaan Anda.",
          code: "module_inactive",
          module: moduleForPermission(permission),
        },
        { status: 403 }
      ),
    };
  }

  if (!(await canEffective(session.user, permission))) {
    return {
      authorized: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  /*
   * Gerbang HANYA-BACA saat langganan ditangguhkan (issue #140).
   *
   * `suspended`/`cancelled` menolak setiap izin TULIS — di PENJAGA, bukan
   * disembunyikan di UI — sementara baca & ekspor tetap jalan: pelanggan yang
   * menunggak tetap wajib (secara hukum) bisa membaca dan mengunduh bukunya.
   * Statusnya dibaca dari basis data KENDALI lewat cache per-perusahaan
   * (`tenant-state.ts`) — TIDAK PERNAH dari `sai_platform` di jalur ini
   * (penagihan mati ≠ login mati, doktrin #137). Izin baca dilewatkan tanpa
   * query tambahan sama sekali.
   */
  if (isWritePermission(permission)) {
    const tenantState = await tenantStateForCompany(company.companyId);
    const refusal = readOnlyRefusal(tenantState?.status, permission);
    if (refusal) {
      return {
        authorized: false,
        response: NextResponse.json(
          { error: refusal.message, code: refusal.code },
          { status: 403 }
        ),
      };
    }
  }

  return { authorized: true, session, companyId: company.companyId } as AuthResult;
}
