/**
 * Matriks izin BAWAAN — DIBANGKITKAN, tidak pernah disalin tangan (issue #300).
 *
 * ── Kenapa dibangkitkan ────────────────────────────────────────────────────
 * Sebuah tabel peran-vs-izin yang diketik ke dalam dokumen adalah tabel yang
 * mulai berbohong pada PR berikutnya: izin bertambah di `authz.ts`, dokumennya
 * tidak. Berkas ini karena itu tidak memuat satu pun nama peran maupun nama
 * izin. Ia membaca `PERMISSION_ROLES` (bawaan), `ROLE_VALUES` (peran sistem),
 * dan peta labelnya — jadi menambah satu baris di `authz.ts` mengubah halaman
 * dokumentasinya tanpa berkas ini maupun `lib/docs.ts` disentuh.
 *
 * ── Kenapa ia HARUS menyebut dirinya bawaan ────────────────────────────────
 * Dua lapis membuat tabel apa pun berhenti menjadi kebenaran tetap:
 *
 *  1. **Override per tenant (#73).** Matriks EFEKTIF = bawaan +
 *     `role_permission_overrides`. Sebuah tenant boleh memberi Kepala Gudang
 *     `report.read`, atau mencabut `invoice.delete` dari Administrator.
 *  2. **Peran adalah DATA.** Sejak tabel `roles` ada, Direktur Utama bisa
 *     membuat peran yang belum ada saat kalimat ini ditulis — jadi "empat
 *     kolom" pun bukan janji.
 *
 * Permukaan ini PUBLIK dan karena itu tidak punya konteks perusahaan: membaca
 * keduanya mustahil di sini, dan menebaknya berarti melanggar aturan pertama
 * docs/MULTI-COMPANY.md (konteks perusahaan yang hilang harus MELEMPAR, tidak
 * pernah jatuh ke bawaan). Jadi yang dilakukan halaman ini adalah menyatakan
 * batasnya dan menunjuk ke tempat jawabannya: `/permissions` di dalam aplikasi,
 * yang membaca matriks efektif perusahaan yang sedang dibuka.
 *
 * ── Kenapa `StaticTable` ───────────────────────────────────────────────────
 * Seluruh matriks bawaan tanpa satu pun kendali. `DataTable` akan menambah +80 KB gzip
 * (#199) demi sortir yang tidak berguna pada tabel yang urutannya sudah
 * bermakna (urutan deklarasi = urutan modul di menu).
 */

import { StaticTable } from "@/components/ui/static-table";
import { textColumn, type SaiColumns } from "@/components/ui/table-columns";
import { PERMISSIONS, PERMISSION_ROLES, type Permission } from "@/lib/authz";
import { permissionLabels, permissionResourceLabels, roleLabels } from "@/lib/i18n/labels";
import { permissionResource } from "@/lib/authz-labels";
import { ROLE_VALUES, type SystemRole } from "@/lib/constants";
import { getRequestI18n } from "@/lib/i18n/server";

interface Baris {
  permission: Permission;
  modul: string;
  izin: string;
  /** Peran mana yang memegangnya di BAWAAN — dipetakan per kunci peran. */
  dipegang: Record<SystemRole, boolean>;
}

const JUDUL_TABEL: React.CSSProperties = {
  margin: 0,
  marginBottom: "var(--ant-margin-xs)",
  /* Di bawah judul halaman (30px) dan di bawah sub-judul isi (20px). */
  fontSize: "var(--ant-font-size-lg)",
  fontWeight: 600,
  color: "var(--ant-color-text)",
};

export async function PermissionMatrix() {
  const { dictionary, t } = await getRequestI18n();

  const izinLabels = permissionLabels(dictionary);
  const modulLabels = permissionResourceLabels(dictionary);
  const peranLabels = roleLabels(dictionary);

  const rows: Baris[] = PERMISSIONS.map((permission) => ({
    permission,
    modul: modulLabels[permissionResource(permission)],
    izin: izinLabels[permission],
    dipegang: Object.fromEntries(
      ROLE_VALUES.map((role) => [
        role,
        (PERMISSION_ROLES[permission] as readonly string[]).includes(role),
      ])
    ) as Record<SystemRole, boolean>,
  }));

  /*
   * "Ya" / "Tidak" sebagai KATA, bukan centang berwarna. Warna tidak pernah
   * penanda tunggal (MASTER.md Prinsip Inti #2), dan sebuah tabel ratusan sel yang
   * dibedakan hanya oleh warna adalah tabel yang tak terbaca bagi satu dari dua
   * belas pembaca laki-laki — di halaman yang justru menjelaskan siapa boleh apa.
   */
  const ya = t("docs.matrixHeld");
  const tidak = t("docs.matrixNotHeld");

  const columns: SaiColumns<Baris> = [
    textColumn<Baris>({ dataIndex: "modul", title: t("docs.matrixColModule") }),
    textColumn<Baris>({ dataIndex: "izin", title: t("docs.matrixColPermission") }),
    ...ROLE_VALUES.map((role) => ({
      key: role,
      title: peranLabels[role],
      align: "center" as const,
      render: (_value: unknown, row: Baris) => (
        <span style={{ color: "var(--ant-color-text-secondary)" }}>
          {row.dipegang[role] ? ya : tidak}
        </span>
      ),
    })),
  ];

  return (
    <section>
      <h3 style={JUDUL_TABEL}>{t("docs.matrixTitle")}</h3>
      <StaticTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.permission}
        size="small"
      />
    </section>
  );
}
