/**
 * SPESIFIKASI `/api/v1` — satu sumber untuk dokumentasi DAN penjaganya
 * (issue #389, F-10).
 *
 * ══ KENAPA SPESIFIKASINYA DITULIS, BUKAN DIBANGKITKAN DARI KODE ════════════
 * Membangkitkan OpenAPI dari kode route menuntut dekorator atau skema runtime
 * di setiap handler — lapisan yang harus dipelihara di 5 tempat demi dokumen
 * yang dibaca di 1 tempat. Yang benar-benar berbahaya bukan spesifikasi yang
 * ditulis tangan, melainkan spesifikasi yang MENYIMPANG dari route-nya tanpa
 * ada yang tahu.
 *
 * Karena itu yang dibangun di sini bukan kepercayaan melainkan PENJAGA:
 * `tests/api-v1-spec.test.ts` menuntut setiap route `/api/v1/*` punya entri di
 * sini, dan setiap entri punya route-nya. Menambah endpoint tanpa
 * mendokumentasikannya gagal di `bun run verify`, bukan ditemukan integrator
 * enam bulan kemudian.
 *
 * ══ IZINNYA IKUT DITULIS, DAN ITU BUKAN HIASAN ═════════════════════════════
 * Integrator yang mendapat 403 perlu tahu izin APA yang kurang supaya bisa
 * meminta token berperan lain. Tanpa itu, satu-satunya jalan adalah menebak
 * peran satu per satu.
 *
 * MURNI: tanpa Prisma, tanpa I/O.
 */

import type { Permission } from "@/lib/authz";
import { DEFAULT_LIMIT, MAX_LIMIT } from "@/lib/api-v1";

export interface FieldSpec {
  name: string;
  type: "string" | "integer" | "number" | "boolean" | "date-time" | "date";
  /** Boleh `null` di jawaban. */
  nullable?: boolean;
  description: string;
}

export interface EndpointSpec {
  /** Segmen di bawah `/api/v1/` — sekaligus nama direktori route-nya. */
  segment: string;
  summary: string;
  description: string;
  permission: Permission;
  fields: FieldSpec[];
}

const UPDATED_AT: FieldSpec = {
  name: "updatedAt",
  type: "date-time",
  description:
    "Kapan baris ini terakhir berubah. Pakai dengan `?updatedSince=` untuk menarik " +
    "HANYA yang berubah — selisih antara satu permintaan kecil per jam dan seluruh " +
    "daftar per jam.",
};

export const ENDPOINTS: readonly EndpointSpec[] = [
  {
    segment: "customers",
    summary: "Daftar pelanggan",
    description: "Pelanggan yang terdaftar di buku perusahaan ini.",
    permission: "customer.read",
    fields: [
      { name: "id", type: "integer", description: "Pengenal internal, stabil." },
      { name: "name", type: "string", description: "Nama pelanggan." },
      { name: "address", type: "string", nullable: true, description: "Alamat." },
      { name: "phone", type: "string", nullable: true, description: "Telepon." },
      { name: "email", type: "string", nullable: true, description: "Surel." },
      { name: "pic", type: "string", nullable: true, description: "Narahubung." },
      {
        name: "npwp",
        type: "string",
        nullable: true,
        description: "NPWP — diperlukan e-Faktur untuk faktur pajak lokal.",
      },
      {
        name: "taxExempt",
        type: "boolean",
        description: "Bebas PPN. `false` berarti dikenai PPN.",
      },
      { name: "isActive", type: "boolean", description: "Nonaktif = tidak ditawarkan lagi." },
      UPDATED_AT,
    ],
  },
  {
    segment: "suppliers",
    summary: "Daftar pemasok",
    description: "Pemasok yang terdaftar di buku perusahaan ini.",
    permission: "supplier.read",
    fields: [
      { name: "id", type: "integer", description: "Pengenal internal, stabil." },
      { name: "name", type: "string", description: "Nama pemasok." },
      { name: "address", type: "string", nullable: true, description: "Alamat." },
      { name: "phone", type: "string", nullable: true, description: "Telepon." },
      { name: "email", type: "string", nullable: true, description: "Surel." },
      { name: "isActive", type: "boolean", description: "Nonaktif = tidak ditawarkan lagi." },
      UPDATED_AT,
    ],
  },
  {
    segment: "items",
    summary: "Daftar barang",
    description: "Barang persediaan. Saldo stoknya TIDAK ada di sini — lihat catatan di bawah.",
    permission: "inventory.read",
    fields: [
      { name: "id", type: "integer", description: "Pengenal internal, stabil." },
      { name: "name", type: "string", description: "Nama barang. Unik." },
      { name: "unit", type: "string", nullable: true, description: "Satuan stok (kg, pcs, …)." },
      { name: "isActive", type: "boolean", description: "Nonaktif = tidak ditawarkan lagi." },
      UPDATED_AT,
    ],
  },
  {
    segment: "accounts",
    summary: "Bagan akun",
    description: "Daftar akun perkiraan. SALDO tidak ada di sini — ia milik laporan, bukan master.",
    permission: "account.read",
    fields: [
      { name: "id", type: "integer", description: "Pengenal internal, stabil." },
      { name: "code", type: "string", description: "Kode akun." },
      { name: "name", type: "string", description: "Nama akun." },
      {
        name: "type",
        type: "string",
        description:
          "Tipe akun (cash_bank, account_receivable, inventory, revenue, expense, …).",
      },
      {
        name: "normalBalance",
        type: "string",
        description: "`debit` atau `credit` — saldo normalnya, turunan dari tipe.",
      },
      { name: "currency", type: "string", description: "Mata uang akun." },
      { name: "isActive", type: "boolean", description: "Nonaktif = tidak dipakai lagi." },
      UPDATED_AT,
    ],
  },
  {
    segment: "invoices",
    summary: "Daftar faktur penjualan",
    description:
      "Faktur beserta nilainya. `total` dihitung dari baris fakturnya + PPN — angka yang " +
      "sama dengan yang dipakai umur piutang, jadi keduanya tidak bisa berbeda.",
    permission: "invoice.read",
    fields: [
      { name: "id", type: "integer", description: "Pengenal internal, stabil." },
      { name: "invoiceNo", type: "string", description: "Nomor faktur. Unik." },
      { name: "date", type: "date", description: "Tanggal faktur (YYYY-MM-DD)." },
      { name: "dueDate", type: "date", nullable: true, description: "Jatuh tempo." },
      {
        name: "status",
        type: "string",
        description: "Status dokumen (pending, paid, canceled, …).",
      },
      { name: "customerId", type: "integer", nullable: true, description: "Pelanggannya." },
      { name: "customerName", type: "string", nullable: true, description: "Nama pelanggannya." },
      { name: "currency", type: "string", description: "Mata uang faktur." },
      {
        name: "rate",
        type: "number",
        nullable: true,
        description: "Kurs ke IDR. `null` untuk faktur IDR.",
      },
      { name: "subtotal", type: "number", description: "Nilai baris faktur, sebelum PPN." },
      { name: "taxAmount", type: "number", description: "PPN." },
      { name: "total", type: "number", description: "Subtotal + PPN, dalam mata uang faktur." },
      {
        name: "isOpening",
        type: "boolean",
        description:
          "`true` untuk faktur SALDO AWAL — dokumen yang dibawa dari sistem lama saat " +
          "penyiapan. Nilainya sudah ada di jurnal pembuka, jadi ia tidak menerbitkan " +
          "jurnalnya sendiri.",
      },
      UPDATED_AT,
    ],
  },
];

/** Catatan yang berlaku untuk SETIAP endpoint — ditulis sekali di dokumen. */
export const GENERAL_NOTES: readonly string[] = [
  `Setiap daftar ter-paginasi. \`?limit=\` bawaan ${DEFAULT_LIMIT}, maksimum ${MAX_LIMIT}; ` +
    "`?offset=` mulai dari 0. Tidak ada bentuk “kembalikan semuanya”.",
  "Nilai kueri yang salah DITOLAK dengan 400, tidak diperbaiki diam-diam. `?limit=abc` " +
    "adalah galat, bukan 50 — supaya parameter yang salah ketik ketahuan pada menit " +
    "pertama, bukan pada rekonsiliasi pertama.",
  "`?updatedSince=` menerima ISO-8601 dan menyaring pada `updatedAt`. Urutannya " +
    "`updatedAt` menaik dengan `id` sebagai pemutus seri, jadi penarikan bertahap tidak " +
    "pernah melewatkan atau menggandakan baris.",
  "`meta.hasMore` dihitung server. Jangan menghitungnya sendiri dari `total`/`limit` — " +
    "itu tiga tempat untuk salah, dan yang salah berhenti satu halaman terlalu awal.",
  "Autentikasi: `Authorization: Bearer <token>`. Token diterbitkan di Pengaturan → " +
    "Token API, dan BERPERAN sebagai sebuah peran: izinnya persis sama dengan pengguna " +
    "berperan itu, termasuk kehilangan akses ke modul yang dimatikan.",
  "401 = kredensialnya bermasalah (tidak ada, salah, atau sudah dicabut — tidak " +
    "dibedakan, supaya endpoint ini tidak menjadi alat menebak). 403 = kredensialnya sah " +
    "tetapi perannya tidak berhak; jawabannya menyebut izin yang kurang.",
  "429 = terlalu banyak permintaan. Batasnya per TOKEN, bukan per alamat.",
  "Seluruh nilai uang adalah angka desimal dalam mata uang dokumennya sendiri. " +
    "Jumlah lintas mata uang tidak pernah dilakukan di sini.",
];

/** Bangun dokumen OpenAPI 3.1. MURNI — `serverUrl` disuntikkan pemanggil. */
export function buildOpenApiDocument(serverUrl: string): Record<string, unknown> {
  const paths: Record<string, unknown> = {};

  for (const endpoint of ENDPOINTS) {
    paths[`/api/v1/${endpoint.segment}`] = {
      get: {
        summary: endpoint.summary,
        description: `${endpoint.description}\n\nIzin yang dituntut: \`${endpoint.permission}\`.`,
        operationId: `list${endpoint.segment[0].toUpperCase()}${endpoint.segment.slice(1)}`,
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: MAX_LIMIT, default: DEFAULT_LIMIT },
            description: "Jumlah baris per halaman.",
          },
          {
            name: "offset",
            in: "query",
            schema: { type: "integer", minimum: 0, default: 0 },
            description: "Baris pertama yang diambil.",
          },
          {
            name: "updatedSince",
            in: "query",
            schema: { type: "string", format: "date-time" },
            description: "Hanya baris yang berubah pada atau sesudah waktu ini.",
          },
        ],
        responses: {
          "200": {
            description: "Daftar beserta metanya.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data", "meta"],
                  properties: {
                    data: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: Object.fromEntries(
                          endpoint.fields.map((f) => [
                            f.name,
                            {
                              type: schemaTypeOf(f),
                              ...(formatOf(f) ? { format: formatOf(f) } : {}),
                              ...(f.nullable ? { nullable: true } : {}),
                              description: f.description,
                            },
                          ])
                        ),
                      },
                    },
                    meta: { $ref: "#/components/schemas/ListMeta" },
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadQuery" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "429": { $ref: "#/components/responses/TooManyRequests" },
        },
      },
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "SAI Accounting API",
      version: "1.0.0",
      description: GENERAL_NOTES.map((n) => `- ${n}`).join("\n"),
    },
    servers: [{ url: serverUrl }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "sai_<id>_<rahasia>" },
      },
      schemas: {
        ListMeta: {
          type: "object",
          required: ["total", "limit", "offset", "hasMore"],
          properties: {
            total: { type: "integer", description: "Jumlah baris yang cocok dengan saringan." },
            limit: { type: "integer" },
            offset: { type: "integer" },
            hasMore: {
              type: "boolean",
              description: "Masih ada baris sesudah halaman ini. Dihitung server.",
            },
          },
        },
        Error: {
          type: "object",
          required: ["error"],
          properties: { error: { type: "string" } },
        },
      },
      responses: {
        BadQuery: errorResponse("Parameter kueri tidak sah."),
        Unauthorized: errorResponse(
          "Token tidak ada, salah, atau sudah dicabut — ketiganya dijawab sama."
        ),
        Forbidden: errorResponse("Peran token tidak berhak; jawabannya menyebut izinnya."),
        TooManyRequests: errorResponse("Terlalu banyak permintaan untuk token ini."),
      },
    },
    paths,
  };
}

function schemaTypeOf(field: FieldSpec): string {
  if (field.type === "date-time" || field.type === "date") return "string";
  return field.type;
}

function formatOf(field: FieldSpec): string | null {
  if (field.type === "date-time") return "date-time";
  if (field.type === "date") return "date";
  return null;
}

function errorResponse(description: string) {
  return {
    description,
    content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
  };
}
