/**
 * REDAKSI STATUS PUBLIK (issue #374).
 *
 * ══ Kenapa penjaga ini ada ═════════════════════════════════════════════════
 * Halaman `/status` dibaca tanpa sesi. Sebuah medan yang lolos dari probe
 * kesiapan ke sana tidak akan pernah terlihat seperti cacat: halamannya tetap
 * memuat, tetap rapi, tetap benar — sambil menerbitkan nama basis data, umur
 * denyut, atau kalimat galat kepada siapa pun yang tahu alamatnya. Kelas
 * kegagalan yang seperti itu hanya bisa ditangkap SEBELUM tayang, dan hanya
 * bila pemetaannya berbentuk fungsi murni yang bisa dipanggil dengan masukan
 * terburuk yang bisa dibayangkan.
 *
 * Itu bukan kekhawatiran teoretis. Pada hari berkas ini ditulis, probe publik
 * yang sudah berjalan memang menerbitkan sebab kegagalan cadangannya —
 * lihat `tests/health-probe-scope.test.ts`.
 */
import { describe, expect, it } from "vitest";

import {
  maintenanceWindow,
  publicStatus,
  type ComponentId,
  type ComponentState,
  type StatusInput,
} from "@/lib/public-status";

/** Pemasangan yang seluruhnya sehat — dasar setiap kasus di bawah. */
const SEHAT: StatusInput = {
  status: "ok",
  platform: { status: "ok" },
  company: { status: "ok" },
  scheduler: { status: "ok" },
  mail: { status: "ok" },
};

const state = (input: StatusInput, id: ComponentId): ComponentState =>
  publicStatus(input).components.find((c) => c.id === id)!.state;

describe("bentuk keluarannya tertutup", () => {
  it("selalu tiga komponen, selalu urutan yang sama", () => {
    /* Urutan yang berpindah-pindah membuat pembaca yang kembali harus membaca
       ulang seluruh daftar untuk menemukan baris yang ia pedulikan. */
    expect(publicStatus(SEHAT).components.map((c) => c.id)).toEqual([
      "application",
      "billing",
      "email",
    ]);
  });

  it("tiap komponen HANYA membawa id dan keadaan — tidak ada medan lain", () => {
    /* Inilah tes yang benar-benar menjaga redaksinya: sebuah medan yang kelak
       ditambahkan "sekadar untuk membantu" (umur denyut, nama basis data,
       sebab kegagalan) memerahkan baris ini sebelum ia sempat tayang. */
    for (const komponen of publicStatus(SEHAT).components) {
      expect(Object.keys(komponen).sort()).toEqual(["id", "state"]);
    }
  });

  it("tidak ada satu pun string bebas di seluruh keluarannya", () => {
    /* Setiap NILAI teks harus berasal dari himpunan tertutup di atas. Sebuah
       kalimat galat yang menyelinap masuk akan gagal di sini apa pun bunyinya,
       tanpa penjaga ini perlu tahu bunyi apa yang harus dicari — dan itu
       bedanya dengan mencocokkan kata-kata terlarang, yang selalu tertinggal
       satu kalimat di belakang penyusupnya.

       Yang disapu nilainya, bukan kuncinya: nama medan adalah bentuk yang
       sudah dikunci tes di atas, sedangkan yang bisa membawa muatan dari luar
       hanyalah isinya. */
    const sah = new Set([
      "operational",
      "degraded",
      "down",
      "unknown",
      "application",
      "billing",
      "email",
    ]);
    const rusak: StatusInput = {
      status: "ok",
      platform: { status: "unknown" },
      company: { status: "error" },
      scheduler: { status: "late" },
      mail: { status: "not_configured" },
    };
    const hasil = publicStatus(rusak);
    const nilai = [hasil.overall, ...hasil.components.flatMap((c) => [c.id, c.state])];
    for (const v of nilai) {
      expect(sah.has(v), `nilai tak dikenal: ${JSON.stringify(v)}`).toBe(true);
    }
    /* Dan tidak ada medan LAIN yang ikut terbawa di tingkat atas. */
    expect(Object.keys(hasil).sort()).toEqual(["components", "overall"]);
  });
});

describe("aplikasi", () => {
  it("kendali tak terjangkau → seluruh halaman menyatakan tidak dapat diakses", () => {
    const hasil = publicStatus({ status: "error" });
    expect(hasil.overall).toBe("down");
    expect(state({ status: "error" }, "application")).toBe("down");
  });

  it("kendali mati membuat bidang lain `unknown`, bukan `operational`", () => {
    /* Ketika kendali mati, tidak ada bidang lain yang jawabannya masih berarti
       — dan memajang "penagihan: normal" di sebelah "aplikasi: tidak dapat
       diakses" adalah halaman yang membantah dirinya sendiri. */
    const hasil = publicStatus({ status: "error" });
    expect(hasil.components.filter((c) => c.state === "unknown")).toHaveLength(2);
  });

  it("buku PT yang tak terjangkau = terganggu, BUKAN mati", () => {
    /* Yang terukur satu buku. Menyatakan seluruh layanan mati atas dasar itu
       adalah kabar yang lebih salah daripada diam. */
    expect(state({ ...SEHAT, company: { status: "error" } }, "application")).toBe("degraded");
  });

  it("belum ada satu PT pun = normal, bukan sakit", () => {
    /* Pemasangan yang baru lahir. Menyebutnya terganggu membuat setiap
       pemasangan segar terlihat rusak sejak menit pertama. */
    expect(state({ ...SEHAT, company: { status: "unknown" } }, "application")).toBe("operational");
  });
});

describe("penagihan", () => {
  it("platform tak terjangkau → belum diketahui", () => {
    expect(state({ ...SEHAT, platform: { status: "unknown" } }, "billing")).toBe("unknown");
  });

  it("penjadwal telat → terganggu, walau tak ada satu halaman pun yang rusak", () => {
    /* Uji coba tidak berakhir dan tagihan tidak terbit — kegagalan senyap yang
       #373 dibuat untuk membuatnya bisa ditanyakan. */
    expect(state({ ...SEHAT, scheduler: { status: "late" } }, "billing")).toBe("degraded");
  });

  it("yang terburuk di antara keduanya yang menang", () => {
    expect(
      state(
        { ...SEHAT, platform: { status: "unknown" }, scheduler: { status: "late" } },
        "billing"
      )
    ).toBe("degraded");
  });
});

describe("surel", () => {
  it.each([
    ["capturing_to_file" as const],
    ["not_configured" as const],
  ])("`%s` → terganggu; keduanya berarti tak ada surel yang berangkat", (status) => {
    expect(state({ ...SEHAT, mail: { status } }, "email")).toBe("degraded");
  });

  it("kegagalan MEMBACA setelan ≠ setelan yang buruk", () => {
    expect(state({ ...SEHAT, mail: { status: "unknown" } }, "email")).toBe("unknown");
  });
});

describe("ringkasan mengambil yang terburuk", () => {
  it("semuanya normal → normal", () => {
    expect(publicStatus(SEHAT).overall).toBe("operational");
  });

  it("satu terganggu sudah cukup", () => {
    expect(publicStatus({ ...SEHAT, scheduler: { status: "late" } }).overall).toBe("degraded");
  });

  it("`degraded` mengalahkan `unknown` — kerusakan terukur di atas ketidaktahuan", () => {
    /* Ketidaktahuan tidak boleh berteriak lebih keras daripada kerusakan yang
       benar-benar terukur; halaman yang berteriak untuk hal yang belum tentu
       apa-apa berhenti dipercaya pada kejadian ketiga. */
    expect(
      publicStatus({
        ...SEHAT,
        platform: { status: "unknown" },
        mail: { status: "not_configured" },
      }).overall
    ).toBe("degraded");
  });

  it("hanya `unknown` → `unknown`, bukan `operational`", () => {
    expect(publicStatus({ ...SEHAT, platform: { status: "unknown" } }).overall).toBe("unknown");
  });
});

describe("jendela pemeliharaan", () => {
  const now = new Date("2026-09-10T10:00:00Z");

  it("tanpa setelan = tidak ada pengumuman", () => {
    expect(maintenanceWindow(now, undefined, undefined)).toBeNull();
    expect(maintenanceWindow(now, "", "")).toBeNull();
    expect(maintenanceWindow(now, "   ", "   ")).toBeNull();
  });

  it("hanya salah satu diisi = tidak ada pengumuman", () => {
    /* Setengah jendela bukan jendela — dan menebak ujung yang lain adalah
       mengarang pada halaman yang seluruh nilainya adalah tidak mengarang. */
    expect(maintenanceWindow(now, "2026-09-11T00:00:00Z", undefined)).toBeNull();
    expect(maintenanceWindow(now, undefined, "2026-09-11T00:00:00Z")).toBeNull();
  });

  it("tanggal sampah = diam, bukan `Invalid Date` di layar", () => {
    expect(maintenanceWindow(now, "besok pagi", "lusa")).toBeNull();
  });

  it("akhir yang mendahului awal ditolak", () => {
    expect(maintenanceWindow(now, "2026-09-11T00:00:00Z", "2026-09-10T00:00:00Z")).toBeNull();
    /* Sama persis juga ditolak: jendela nol-detik tidak mengumumkan apa pun. */
    expect(maintenanceWindow(now, "2026-09-11T00:00:00Z", "2026-09-11T00:00:00Z")).toBeNull();
  });

  it("belum mulai → `upcoming`", () => {
    expect(
      maintenanceWindow(now, "2026-09-11T20:00:00Z", "2026-09-11T22:00:00Z")?.state
    ).toBe("upcoming");
  });

  it("sedang berlangsung → `active`", () => {
    expect(
      maintenanceWindow(now, "2026-09-10T09:00:00Z", "2026-09-10T12:00:00Z")?.state
    ).toBe("active");
  });

  it("sudah lewat menghilang dengan sendirinya", () => {
    /* Pengumuman yang lupa dicabut tetap terpajang berminggu-minggu, dan
       halaman status yang memajang pemeliharaan yang sudah selesai mengajari
       pembacanya untuk tidak mempercayainya. */
    expect(maintenanceWindow(now, "2026-09-09T09:00:00Z", "2026-09-09T12:00:00Z")).toBeNull();
  });

  it("tepat pada detik berakhirnya sudah dianggap lewat", () => {
    expect(maintenanceWindow(now, "2026-09-10T08:00:00Z", "2026-09-10T10:00:00Z")).toBeNull();
  });
});
