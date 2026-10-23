/**
 * STEMPEL BUILD — build mana yang sedang dijalankan proses ini.
 *
 * ══ KENAPA ADA (permintaan pemilik 22 Okt 2026: "versi untuk setiap service")
 * Nomor RILIS tetap satu (`package.json`, mis. 0.12.1). Yang ditambahkan adalah
 * kemampuan setiap layanan MENYEBUT build yang ia jalankan — sebab layanan
 * latar tidak melayani satu halaman pun, dan satu yang tertinggal di image
 * lama tidak merusak apa pun yang terlihat. `svc-worker` pernah menjalankan
 * kode basi berhari-hari tanpa satu tanda (kepala `publish-image.yml`).
 *
 * ══ SUMBERNYA: tiga variabel lingkungan yang ditanam image ══════════════════
 * `APP_VERSION`, `GIT_SHA`, `BUILD_TIME` — build-arg dari `publish-image.yml`,
 * dijadikan `ENV` di setiap tahap akhir `Dockerfile` (dijaga
 * `tests/build-stamp.test.ts`). Padanan Go: `internal/buildinfo`.
 *
 * Cadangan bila tak ditanam (build lokal, `bun run dev`):
 *   • versi → `NEXT_PUBLIC_APP_VERSION` (disuntik `next.config.ts` dari
 *     `package.json` saat build) → `npm_package_version` (disetel `bun run`)
 *     → `0.0.0`. Nomor yang jelas mustahil benar lebih jujur daripada nomor
 *     masuk akal yang kebetulan salah — alasan yang sama dengan `APP_VERSION`
 *     di `constants.ts`.
 *   • sha → `dev`. Bukan string kosong: `dev` terbaca sebagai keadaan, kosong
 *     terbaca sebagai kerusakan tampilan.
 *   • waktu → `null`.
 *
 * MURNI: tidak menyentuh berkas, jaringan, atau basis data — jadi aman dipakai
 * dari route Next, skrip bun, maupun tes.
 */

export interface BuildInfo {
  /** Nomor rilis, tanpa awalan `v`. */
  version: string;
  /** SHA commit penuh, atau `dev` bila tidak ditanam. */
  sha: string;
  /** 7 karakter pertama SHA (pola `sha-<pendek>` tag registry), atau `dev`. */
  shortSha: string;
  /** Waktu build UTC ISO-8601, atau `null` bila tidak ditanam / tak terurai. */
  builtAt: string | null;
}

/** Yang cukup untuk MEMBANDINGKAN dua build — yang tertulis di jejak hanya ini. */
export interface BuildStamp {
  version: string;
  shortSha: string;
}

export const DEV_SHA = "dev";
export const UNKNOWN_VERSION = "0.0.0";

/** Panjang SHA pendek — sama dengan tag `sha-<pendek>` dari `git rev-parse --short`. */
export const SHORT_SHA_LENGTH = 7;

/**
 * Batas `jobs.claimed_by` dan `runtime_samples.instance` (VARCHAR(100)).
 * Identitas yang melampauinya akan DITOLAK basis data saat klaim — pelari yang
 * tidak pernah bisa mengklaim apa pun, tanpa galat yang menyebut sebabnya.
 */
export const IDENTITY_MAX_LENGTH = 100;

type Env = Record<string, string | undefined>;

const bersih = (v: string | undefined): string | undefined => {
  const t = v?.trim();
  return t ? t : undefined;
};

/**
 * Baca stempel build proses ini.
 *
 * `fallbackVersion` terpisah dari `env` dengan sengaja: di aplikasi Next,
 * `process.env.NEXT_PUBLIC_APP_VERSION` hanya terisi bila ditulis HARFIAH
 * (Next menggantinya saat build), jadi ia dibaca di sini secara harfiah —
 * bukan lewat `env[...]` yang tidak pernah diganti.
 */
export function buildInfo(
  env: Env = process.env,
  fallbackVersion: string | undefined = process.env.NEXT_PUBLIC_APP_VERSION
): BuildInfo {
  const version = (
    bersih(env.APP_VERSION) ??
    bersih(fallbackVersion) ??
    bersih(env.npm_package_version) ??
    UNKNOWN_VERSION
  ).replace(/^v/, "");
  const sha = bersih(env.GIT_SHA) ?? DEV_SHA;
  const shortSha = sha === DEV_SHA ? DEV_SHA : sha.slice(0, SHORT_SHA_LENGTH);
  const waktu = bersih(env.BUILD_TIME);
  const builtAt = waktu && !Number.isNaN(Date.parse(waktu)) ? waktu : null;
  return { version, sha, shortSha, builtAt };
}

/** `v0.12.1+abc1234` — bentuk yang ditulis ke jejak dan dibaca konsol. */
export function buildLabel(b: BuildStamp): string {
  return `v${b.version}+${b.shortSha}`;
}

/**
 * Baris log saat start: `svc-worker v0.12.1 (abc1234, built 2026-10-22T…Z)`.
 * Bentuknya sama persis dengan `buildinfo.Banner` di Go.
 */
export function buildBanner(service: string, b: BuildInfo = buildInfo()): string {
  return `${service} v${b.version} (${b.shortSha}, built ${b.builtAt ?? "unknown"})`;
}

/**
 * Identitas pekerja / instans yang ditulis ke `jobs.claimed_by` dan
 * `runtime_samples.instance`:
 *
 *   `<kepala> <layanan> v<versi>+<sha pendek>`
 *   mis. `interactive@3f2a9c1b0d4e:7 svc-worker v0.12.1+abc1234`
 *
 * Kepala yang lama (`<jalur>@<host>:<pid>` / `<host>:<pid>`) tetap di depan dan
 * tetap utuh bila muat, supaya baris tetap menunjuk container yang memegang
 * lease. Stempelnya di BELAKANG, dan yang dipangkas bila terlalu panjang
 * adalah KEPALA — stempel adalah satu-satunya bagian yang dibaca mesin.
 *
 * ⚠ Bentuk ini LINTAS BAHASA: pelari Go menulisnya juga (`jobs.WorkerID`), dan
 * konsol membaca keduanya dengan `parseIdentity` di bawah. Kesamaan tata
 * letaknya dijaga `tests/build-stamp.test.ts`.
 */
export function stampIdentity(head: string, service: string, b: BuildStamp): string {
  const ekor = ` ${service} ${buildLabel(b)}`;
  const ruang = Math.max(0, IDENTITY_MAX_LENGTH - ekor.length);
  return `${head.slice(0, ruang)}${ekor}`.slice(0, IDENTITY_MAX_LENGTH);
}

export interface ParsedIdentity {
  /** Bagian sebelum stempel — `interactive@host:pid` atau `host:pid`. */
  head: string;
  /** `svc-worker`, `svc-integrator`, … — `null` untuk baris sebelum stempel. */
  service: string | null;
  build: BuildStamp | null;
}

const POLA_STEMPEL = /^(.*) ([a-z][a-z0-9-]*) v([0-9A-Za-z.-]+)\+([0-9A-Za-z]+)$/;

/**
 * Urai identitas. Baris yang ditulis SEBELUM stempel ada (`lane@host:pid`)
 * menghasilkan `service`/`build` null — bukan galat: konsol menyebutnya
 * "belum berstempel", dan itu jawaban yang jujur tentang image lama.
 */
export function parseIdentity(raw: string): ParsedIdentity {
  const m = POLA_STEMPEL.exec(raw.trim());
  if (!m) return { head: raw.trim(), service: null, build: null };
  return { head: m[1]!, service: m[2]!, build: { version: m[3]!, shortSha: m[4]! } };
}

/**
 * Stempel untuk dititipkan di `details` jejak putaran (`scheduler_runs`,
 * `conformance_runs`) — dua tabel yang sudah punya JSON bebas, jadi tidak
 * butuh kolom maupun migration.
 */
export function buildDetails(b: BuildInfo = buildInfo()): { build: string } {
  return { build: buildLabel(b) };
}

/**
 * Medan build untuk `/api/health` kedua aplikasi. `version` di tingkat atas
 * untuk pembaca yang hanya ingin nomornya; `build` untuk yang membandingkan
 * (ritual rilis PRODUCTION.md §Updates langkah 5).
 *
 * Probe itu PUBLIK (`isPublicPath`). Yang terbit hanya nomor rilis, sha commit,
 * dan waktu build — ketiganya sudah publik sebagai tag image di registry; tidak
 * ada host, jalur, atau isi lingkungan lain.
 */
export function healthBuildFields(b: BuildInfo = buildInfo()): {
  version: string;
  build: { version: string; sha: string; builtAt: string | null };
} {
  return { version: b.version, build: { version: b.version, sha: b.sha, builtAt: b.builtAt } };
}

/** Kebalikan `buildLabel`: `v0.12.1+abc1234` → stempel, atau `null`. */
export function parseBuildLabel(raw: unknown): BuildStamp | null {
  if (typeof raw !== "string") return null;
  const m = /^v([0-9A-Za-z.-]+)\+([0-9A-Za-z]+)$/.exec(raw.trim());
  return m ? { version: m[1]!, shortSha: m[2]! } : null;
}

/**
 * Putusan satu build terhadap ACUAN (build konsol operator yang sedang dibuka).
 *
 *   • `same`    — versi DAN sha pendek sama;
 *   • `differs` — salah satunya beda: layanan itu "tertinggal" (atau konsolnya
 *                 yang tertinggal — keduanya menuntut tindakan yang sama:
 *                 tarik & naikkan ulang yang beda);
 *   • `unknown` — salah satu tidak berstempel, atau acuannya build lokal
 *                 (`dev`). Membandingkan `dev` dengan sha produksi akan
 *                 mewarnai setiap baris di mesin pengembang sebagai tertinggal.
 */
export type BuildVerdict = "same" | "differs" | "unknown";

export function compareBuild(reference: BuildStamp, other: BuildStamp | null): BuildVerdict {
  if (!other) return "unknown";
  if (reference.shortSha === DEV_SHA || other.shortSha === DEV_SHA) {
    return reference.version === other.version && reference.shortSha === other.shortSha
      ? "same"
      : "unknown";
  }
  const a = reference.shortSha.slice(0, SHORT_SHA_LENGTH);
  const b = other.shortSha.slice(0, SHORT_SHA_LENGTH);
  return reference.version === other.version && a === b ? "same" : "differs";
}

/* ─────────────────────── Rakitan baris "Versi layanan" ─────────────────────── */

/** Satu pengamatan mentah: layanan + peran + build yang terlihat menulis jejak. */
export interface BuildSighting {
  service: string;
  /** Jalur / peran (`ledger`, `scheduler`, `web`, …). */
  role: string;
  build: BuildStamp | null;
  lastSeen: Date;
}

/**
 * Pengamatan dari satu identitas berstempel (`jobs.claimed_by` atau
 * `runtime_samples.instance`).
 *
 * `role` bawaannya kepala sebelum `@` (`interactive@host:pid` → `interactive`);
 * `runtime_samples` menyerahkannya sendiri (kolom `source`), sebab kepalanya
 * `host:pid` tanpa jalur. `service` diambil dari stempel; baris SEBELUM stempel
 * ada jatuh ke `fallbackService`, dan build-nya `null` ("belum berstempel").
 */
export function sightingFromIdentity(
  raw: string,
  lastSeen: Date,
  opts: { role?: string; fallbackService?: string } = {}
): BuildSighting {
  const p = parseIdentity(raw);
  const role = opts.role ?? (p.head.includes("@") ? p.head.slice(0, p.head.indexOf("@")) : p.head);
  return { service: p.service ?? opts.fallbackService ?? UNKNOWN_SERVICE, role, build: p.build, lastSeen };
}

/**
 * Pengamatan dari `details` jejak putaran (`scheduler_runs`,
 * `conformance_runs`) — medan `build` yang ditulis `buildDetails()`. Putaran
 * lama tanpa medan itu → build `null`.
 */
export function sightingFromRunDetails(
  details: string | null,
  lastSeen: Date,
  service: string,
  role: string
): BuildSighting {
  let build: BuildStamp | null = null;
  /* `service` di dalam jejaknya MENANG atas tebakan pemanggil: sejak sakelar
     `runner:` (23 Okt 2026) `conformance_runs` bisa ditulis `svc-worker` ATAU
     `svc-integrator`, dan build Go yang dicatat atas nama `svc-worker` akan
     terbaca sebagai worker yang tertinggal versi. Jejak lama tanpa medan itu
     memakai `service` pemanggil, seperti sebelumnya. */
  let dariJejak: string | null = null;
  if (details) {
    try {
      const d = JSON.parse(details) as { build?: unknown; service?: unknown };
      build = parseBuildLabel(d.build);
      if (typeof d.service === "string" && /^[a-z][a-z0-9-]*$/.test(d.service)) dariJejak = d.service;
    } catch {
      build = null;
    }
  }
  return { service: dariJejak ?? service, role, build, lastSeen };
}

export interface ServiceBuildRow extends BuildSighting {
  verdict: BuildVerdict;
}

/**
 * Pengamatan yang lebih tua dari ini terhadap pengamatan build LAIN untuk
 * layanan+peran yang sama dianggap DIGANTIKAN (container lama sudah ditukar),
 * dan tidak ditampilkan. Tiga kali jendela potret runtime (5 menit): dua
 * replika yang sama-sama hidup menulis tiap 5 menit, jadi selisih mereka
 * tidak pernah sebesar ini — keduanya tetap tampil, dan replika yang tertinggal
 * itulah yang ingin dilihat.
 */
export const SUPERSEDED_GAP_MS = 15 * 60_000;

/**
 * Layanan identitas lama (`lane@host:pid`, sebelum stempel) — tidak bisa
 * dibedakan Node atau Go. Baris seperti itu dianggap digantikan oleh pengamatan
 * berstempel mana pun untuk PERAN yang sama, sebab sesudah rilis pertama yang
 * berstempel, setiap pengklaim jalur itu menulis bentuk baru.
 */
export const UNKNOWN_SERVICE = "?";

const kunciBuild = (b: BuildStamp | null) => (b ? buildLabel(b) : "");

/**
 * Gabungkan pengamatan dari beberapa sumber (`runtime_samples`, `jobs`,
 * jejak putaran) menjadi satu baris per layanan+peran+build, buang yang sudah
 * digantikan, beri putusan terhadap acuan, lalu urutkan.
 *
 * `expected` = pasangan layanan+peran yang SEHARUSNYA terlihat; yang tidak
 * terlihat sama sekali tetap muncul sebagai baris tanpa `lastSeen`, supaya
 * ketiadaan terbaca sebagai ketiadaan — bukan sebagai baris yang tidak pernah
 * ada di tabel.
 */
export function serviceBuildRows(
  reference: BuildStamp,
  sightings: readonly BuildSighting[],
  expected: readonly { service: string; role: string }[] = []
): { rows: ServiceBuildRow[]; unseen: { service: string; role: string }[] } {
  const terbaru = new Map<string, BuildSighting>();
  for (const s of sightings) {
    const k = `${s.service}\u0000${s.role}\u0000${kunciBuild(s.build)}`;
    const ada = terbaru.get(k);
    if (!ada || ada.lastSeen < s.lastSeen) terbaru.set(k, s);
  }

  const semua = [...terbaru.values()];
  const puncakPeran = new Map<string, number>();
  const puncakPeranSaja = new Map<string, number>();
  for (const s of semua) {
    const k = `${s.service}\u0000${s.role}`;
    const t = s.lastSeen.getTime();
    puncakPeran.set(k, Math.max(puncakPeran.get(k) ?? 0, t));
    puncakPeranSaja.set(s.role, Math.max(puncakPeranSaja.get(s.role) ?? 0, t));
  }

  const rows: ServiceBuildRow[] = semua
    .filter((s) => {
      const puncak =
        s.service === UNKNOWN_SERVICE
          ? (puncakPeranSaja.get(s.role) ?? 0)
          : (puncakPeran.get(`${s.service}\u0000${s.role}`) ?? 0);
      return puncak - s.lastSeen.getTime() <= SUPERSEDED_GAP_MS;
    })
    .map((s) => ({ ...s, verdict: compareBuild(reference, s.build) }))
    .sort(
      (a, b) =>
        a.service.localeCompare(b.service) ||
        a.role.localeCompare(b.role) ||
        b.lastSeen.getTime() - a.lastSeen.getTime()
    );

  const terlihat = new Set(semua.map((s) => `${s.service}\u0000${s.role}`));
  const unseen = expected.filter((e) => !terlihat.has(`${e.service}\u0000${e.role}`));
  return { rows, unseen };
}
