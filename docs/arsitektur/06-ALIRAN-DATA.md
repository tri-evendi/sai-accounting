# 06 — Aliran Data

> Potret 11 Oktober 2026 · v0.9.0 · [indeks](./README.md)

Enam alur yang membawa hampir seluruh nilai sistem ini. Masing-masing dilacak
dari masukan sampai tempat data berhenti.

## 1. Daur hidup permintaan halaman

Alur paling sering terjadi, dan tempat setiap batas keamanan dilewati.

```mermaid
sequenceDiagram
    autonumber
    participant B as Peramban
    participant T as Traefik
    participant P as src/proxy.ts
    participant G as requirePagePermission
    participant CDB as sai_control
    participant H as current-company.ts
    participant PX as prisma (Proxy)
    participant POOL as company-clients (LRU)
    participant BDB as buku PT

    B->>T: GET /t/akme/pt-akme/invoices
    T->>P: HTTP (TLS sudah diterminasi)

    P->>P: normalizeHost → bidang operator?
    P->>P: isPublicPath? isBearerApiPath?
    P->>P: getToken() — JWT NextAuth
    alt tanpa sesi
        P-->>B: 307 → /login
    end
    P->>P: titipkan header x-sai-path
    P->>G: lanjut ke halaman

    G->>G: auth() — muat sesi
    G->>CDB: enterCompanyFromRoute(akme, pt-akme, userId)
    Note over G,CDB: baca ULANG keanggotaan pada permintaan INI.<br/>Slug tak ada / PT nonaktif / bukan anggota /<br/>tenant lain → 404 YANG SAMA PERSIS
    CDB-->>G: {companyId, databaseName, role, accountantMode}

    alt slug tenant berpindah (#458)
        G-->>B: 301 → jalur baru (dari x-sai-path)
    end

    G->>H: setRouteCompany(ctx)
    Note over H: WeakMap dikunci pada objek<br/>hasil `await headers()`
    G->>G: timpa session.user.role dengan peran di PT INI
    G->>G: canEffective(izin) — bawaan+override peran+pengguna+modul
    G->>G: requireUnlockedCompany (kunci buku)
    G->>G: requireSetupDone

    G->>PX: prisma.invoice.findMany(...)
    PX->>H: currentCompany()
    alt konteks hilang
        PX-->>G: MissingCompanyContextError ⚠ MELEMPAR
    end
    H-->>PX: {databaseName}
    PX->>POOL: getCompanyClient(databaseName)
    POOL-->>PX: PrismaClient (maks 4; LRU, grace 15s)
    PX->>BDB: SELECT …
    BDB-->>PX: baris
    PX-->>G: data
    G-->>B: HTML (RSC)
```

**Lima hal yang sering disalahpahami pada alur ini:**

1. **Proxy bukan penjaga otorisasi.** Ia memutuskan "perlu sesi atau tidak" dan
   "bidang mana". Izin diputuskan penjaga, satu lapis di bawah.
2. **Keanggotaan dibaca ulang dari basis data setiap permintaan**, tidak dibaca
   dari JWT. Lebih mahal, dan itu harga yang dibayar sengaja.
3. **Peran ditimpa per permintaan.** JWT membawa peran di PT yang *terakhir*
   dibuka.
4. **Empat kegagalan berbeda menghasilkan 404 yang identik.** Membedakannya
   membocorkan keberadaan perusahaan orang lain.
5. **Konteks hilang → melempar**, selalu, tanpa jalur bawaan.

## 2. Posting dokumen → jurnal

Alur yang memegang kebenaran akuntansi. Contoh: faktur penjualan.

```mermaid
sequenceDiagram
    autonumber
    participant U as Pengguna
    participant R as POST /api/invoices
    participant AG as requireApiPermission
    participant Z as zod (validations/invoice.ts)
    participant TX as prisma.$transaction
    participant PF as postForSource
    participant AP as approvals
    participant PD as periods
    participant RU as posting/rules
    participant MP as posting/mapping
    participant LG as ledger.postJournal
    participant DB as buku PT
    participant AU as audit_logs

    U->>R: faktur baru
    R->>AG: requireApiPermission("invoice.write")
    AG->>AG: lingkup PT dari permintaan (company-request.ts)
    AG-->>R: lolos
    R->>Z: parse badan permintaan
    alt tidak sah
        Z-->>U: 400 + galat per medan
    end

    R->>TX: mulai transaksi
    TX->>DB: INSERT invoices + invoice_items
    TX->>PF: postForSource({sourceType:"invoice", sourceId, tx})

    PF->>PF: sudah punya jurnal hidup? → idempoten, berhenti
    PF->>AP: approvalGate — ambang nilai terlampaui?
    alt butuh persetujuan
        AP->>DB: INSERT approval_requests
        AP-->>PF: TAHAN — buku besar DIAM
        Note over AP,PF: dokumen ADA, jurnal BELUM.<br/>Menunggu /approvals
    end

    PF->>PD: periode tanggal ini tertutup?
    alt tertutup
        PD-->>TX: TOLAK → rollback
    end

    PF->>RU: buildSalesInvoiceLines(...)
    RU->>MP: resolveAccountIds(MAPPING_KEYS)
    MP->>DB: account_mappings → accounts
    RU->>RU: kurs & selisih kurs (posting/rates)
    RU-->>PF: baris jurnal

    PF->>LG: postJournal(lines)
    LG->>LG: Σ debit = Σ kredit?
    alt timpang
        LG-->>TX: TOLAK → rollback
    end
    LG->>DB: INSERT journals + journal_lines
    TX->>AU: writeAuditLog(...)
    TX-->>R: commit
    R-->>U: 201
```

### Jalur persetujuan

```mermaid
stateDiagram-v2
    [*] --> Dibuat: dokumen disimpan
    Dibuat --> Terposting: di bawah ambang
    Dibuat --> Menunggu: ambang terlampaui
    Menunggu --> Terposting: disetujui (/approvals)
    Menunggu --> Ditolak: ditolak
    Ditolak --> Menunggu: resubmit
    Terposting --> Dibalik: reverseJournal()
    Dibalik --> [*]
    note right of Terposting
        Jurnal IMUTABEL.
        Koreksi = pembalikan,
        BUKAN sunting.
    end note
    note right of Menunggu
        Dokumen ADA, jurnal BELUM.
        Buku besar diam sampai
        seseorang memutuskan.
    end note
```

**Dokumen berulang** (`recurring:run`) selalu menerbitkan pengajuan persetujuan
dengan `force` — **apa pun nilainya**. Jadi buku besar diam sampai seseorang
menyetujuinya di `/approvals`. Kejadian yang jatuh di periode **tertutup** atau
yang dokumen sumbernya **hilang** **ditahan dan dilaporkan** — tidak
diselundupkan, tidak dibuang.

## 3. Alur penyediaan PT baru

Satu-satunya alur yang **membuat basis data**.

```mermaid
sequenceDiagram
    autonumber
    participant U as Pemilik tenant
    participant W as POST /api/companies
    participant TA as tenant-authz
    participant CP as company-provisioning
    participant CDB as sai_control
    participant MY as MariaDB
    participant NEW as basis data PT baru
    participant SU as Wisaya /setup

    U->>W: perusahaan baru
    W->>TA: izin "company.create" (owner/admin)
    W->>CDB: kuota paket terlampaui?
    alt kuota penuh
        W-->>U: tolak + ajakan naik paket
    end

    W->>CP: provisionCompany(nama, tenantId)
    CP->>CP: susun slug + nama basis data
    CP->>CP: saring /^[A-Za-z0-9_]{1,64}$/
    CP->>MY: CREATE DATABASE sai_t<N>_<slug>
    CP->>NEW: prisma migrate deploy (64 migration)
    CP->>CDB: INSERT companies (database_name = NAMA saja)
    CP->>CDB: INSERT memberships (pembuat)
    Note over CP,CDB: Kredensial TIDAK ikut tersimpan —<br/>host/user/sandi selalu dari environment

    CP->>NEW: seedCoaForModules(modul terpilih)
    CP->>NEW: seedDefaultMappings()
    CP->>NEW: kategori aset tetap bawaan
    CP->>NEW: data [CONTOH] (is_demo = FALSE)

    W-->>SU: alihkan ke wisaya
    SU->>NEW: identitas, periode, saldo awal, modul
    SU->>CDB: tandai penyiapan selesai
```

Dua catatan yang mencegah kesalahan:

- **`companies.database_name` menyimpan NAMA, bukan URL.** Menyimpan URL
  lengkap berarti satu `SELECT` bisa membawa pergi kredensial setiap pelanggan.
- Data `[CONTOH]` pada perusahaan baru **wajib `is_demo = FALSE`** — ia prasyarat
  penyiapan, bukan data demo yang akan disapu.

## 4. Alur penagihan langganan

Alur yang menyeberangi **dua** basis data, dan karena itu punya aturan urutan.

```mermaid
sequenceDiagram
    autonumber
    participant S as scheduler (tiap jam)
    participant PDB as sai_platform
    participant CDB as sai_control
    participant U as Tenant
    participant W as web
    participant MT as Midtrans
    participant WH as POST /api/billing/webhook

    Note over S: langkah 1 — scheduler:subscriptions
    S->>PDB: langganan jatuh tempo / trial habis?
    S->>PDB: INSERT platform_invoices
    S->>CDB: INSERT notifications
    S->>PDB: dunning · suspensi · sinkronisasi pemakaian
    S->>PDB: INSERT scheduler_runs

    Note over U,MT: pembayaran (bila billing_mode ≠ none)
    U->>W: /platform/billing → bayar
    W->>MT: POST /v2/charge (VA / QRIS)
    MT-->>W: instruksi pembayaran
    W-->>U: tampilkan VA / QR

    U->>MT: transfer
    MT->>WH: webhook
    WH->>WH: verifikasi tanda tangan SHA-512
    alt tanda tangan salah / kunci tak ada di produksi
        WH-->>MT: TOLAK (gagal-tertutup)
    end
    WH->>PDB: UPDATE payments + platform_invoices
    Note over WH,PDB: ⚠ PLATFORM DULU
    WH->>CDB: snapshot status tenant + kuota
    Note over WH,CDB: KENDALI BELAKANGAN
```

### Kenapa urutannya tidak boleh dibalik

FK dan transaksi **tidak menyeberangi** basis data, jadi kegagalan di tengah
selalu mungkin. Urutan platform→kendali memilih **kegagalan yang bisa
diperbaiki**:

| Urutan | Kegagalan di tengah meninggalkan | Bisa diperbaiki? |
|---|---|---|
| **Platform dulu** ✅ | Pembayaran tercatat, tenant **belum** naik kelas | **Ya** — `bun run reconcile:platform` |
| Kendali dulu ❌ | Tenant naik kelas, **tanpa** pembayaran | **Tidak akan pernah ketahuan** |

### Keadaan hari ini

**Penagihan otomatis sengaja DIHENTIKAN** (Fase A). Terbukti dari basis data
platform 11 Okt 2026:

| | |
|---|---|
| `billing_mode = none` | **11 dari 11** langganan |
| `payments` | **0 baris** |
| `platform_invoices` | 11 baris |
| `MIDTRANS_*` di `.env` | **tidak ada** → transport MOCK |

Alur di atas karena itu **berjalan tanpa menagih siapa pun**. Mekanismenya
hidup dan diuji; gerbangnya tertutup di tingkat data. Alasan & gerbang
pembukaannya: [`docs/KOMERSIALISASI.md`](../KOMERSIALISASI.md).
Penghentiannya dilakukan `scripts/pause-platform-billing.ts` —
**kering secara bawaan**, `--apply` menuntut `--reason`, dan idempoten.

## 5. Alur cadangan

```mermaid
sequenceDiagram
    autonumber
    participant B as backup (harian)
    participant DB as MariaDB
    participant V as volume documents + audit (:ro)
    participant FS as BACKUP_WORK_DIR
    participant S3 as penyimpanan S3
    participant PDB as sai_platform

    B->>DB: mariadb-dump --all-databases
    Note over B,DB: sandi lewat BERKAS OPSI,<br/>bukan argumen (argumen terbaca `ps`)
    alt dump gagal
        B->>PDB: INSERT backup_runs (error)
        B-->>B: BERHENTI — tidak mengirim apa pun
    end
    DB-->>FS: dump.sql

    B->>V: baca dokumen + audit
    B->>FS: tar -czf arsip.tar.gz
    B->>FS: openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt
    Note over B,FS: enkripsi SEBELUM berkas<br/>meninggalkan mesin
    B->>FS: sha256sum atas CIPHERTEXT

    B->>S3: aws s3 cp arsip.enc
    B->>S3: aws s3 cp arsip.enc.sha256
    alt unggah gagal
        B->>PDB: INSERT backup_runs (error)
        B-->>B: TIDAK memangkas apa pun
    end

    B->>S3: pangkas yang > BACKUP_RETENTION_DAYS
    B->>PDB: INSERT backup_runs (ok)
```

### ⚠ Status terbukti: alur ini belum pernah selesai

| Bukti | Nilai |
|---|---|
| `/api/health` → `backup.status` | `"failing"` |
| `lastSuccessAt` | **`null`** |
| `lastAttemptAt` | `2026-10-11T06:31:14Z` (berjalan) |
| `backup_runs` | **54 baris** |
| `staleAfterHours` | 48 |

**Akar terbukti dari `.env`:** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
dan `BACKUP_S3_BUCKET` **tidak ada**. Yang ada: `BACKUP_ENCRYPTION_KEY`,
`BACKUP_RETENTION_DAYS`, `BACKUP_S3_PREFIX`.

Jadi langkah dump/tar/enkripsi 🔶 **kemungkinan** berjalan sampai `aws s3 cp`,
lalu gagal di sana — dan karena pemangkasan dikerjakan **paling akhir dan hanya
bila unggahan sukses**, tidak ada yang dihapus. Itu perilaku yang benar;
masalahnya tidak ada salinan yang **keluar dari mesin**.

**Konsekuensinya bukan teknis.** Pembukuan wajib disimpan sepuluh tahun
(UU KUP). Menjual langganan atas data itu tanpa cadangan luar-mesin adalah
risiko **hukum**. Prioritas **P0** di [dok 08](./08-PENILAIAN-ARSITEKTUR.md).

### Satu risiko yang menyertainya

`BACKUP_ENCRYPTION_KEY` ada di `.env` **pada mesin yang sama dengan datanya**.
❓ Belum dipastikan apakah ia disimpan di luar mesin. Cadangan yang berhasil pun
**tidak bisa dibuka** kalau kuncinya hilang bersama mesinnya.

## 6. Alur surel keluar

```mermaid
flowchart TD
    A["Pemicu"] --> B{"Membawa<br/>TOKEN AKSES?"}

    B -->|"Ya — undangan, atur-ulang<br/>sandi, verifikasi"| C["WAJIB pengaturan PLATFORM<br/>⚠ TIDAK PERNAH SMTP tenant"]
    B -->|"Tidak — faktur,<br/>pengingat pelanggan"| D{"Tenant punya<br/>SMTP sendiri?"}

    D -->|Ya| E["tenant_mail_settings"]
    D -->|Tidak| C

    C --> F{"platform.mail_settings<br/>ada & terjangkau?"}
    F -->|Ya| G["SMTP platform"]
    F -->|Tidak| H["Environment SMTP_*<br/>atau transport `file`"]

    E --> I["nodemailer"]
    G --> I
    H --> I
    I --> J["Penyedia SMTP"]

    style C fill:#ffeaea,stroke:#b55
    style J fill:#eef7ee,stroke:#5a8f5a
```

### Alur pengingat ke pelanggan — empat gerbang

Satu-satunya alur yang menghubungi orang **di luar** organisasi pelanggan,
dan karena itu digerbangi paling ketat:

```mermaid
flowchart LR
    A["remind:customers<br/>(langkah 4, TERAKHIR)"] --> B{"reminder_enabled?<br/>bawaan MATI"}
    B -->|tidak| X["berhenti"]
    B -->|ya| C{"reminder_tested_at?<br/>seseorang harus pernah<br/>menerima sendiri kalimatnya"}
    C -->|tidak| X2["TOLAK"]
    C -->|ya| D{"dalam jendela<br/>toleransi 2 hari?"}
    D -->|tidak| X3["lewati"]
    D -->|ya| E{"kunci unik<br/>(invoice, kind, due_key)"}
    E -->|sudah ada| X4["constraint menolak<br/>SEBELUM sendMail"]
    E -->|baru| F["sendMail →<br/>H-3 / H+1 / H+7"]

    style C fill:#ffeaea,stroke:#b55
    style F fill:#eef7ee,stroke:#5a8f5a
```

Gerbang kedua layak diperhatikan: **seseorang harus pernah menerima sendiri
kalimatnya lebih dulu**, atau penjadwal menolak. Dan jendela toleransi 2 hari
membuat "aktifkan" tidak pernah menjadi tombol yang mengirim ratusan surel ke
tunggakan lama sekaligus.

Satu pengingat **per FAKTUR**, bukan ringkasan — seorang pelanggan hanya
memikul fakturnya sendiri. Berbeda dari `notify:invoice-due` (kabar
**dalam-aplikasi**), yang justru **ringkasan**: kotak masuk berisi 80 baris
sama tak terbacanya dengan kotak masuk kosong. Dan kabar itu hanya kepada
anggota yang boleh membaca Piutang (`receivable.read`, matriks **EFEKTIF**),
karena badannya menyebut jumlah tunggakan dan nama pelanggan.

## 7. Aliran penyimpanan berkas

```mermaid
flowchart LR
    U["Pengguna unggah"] --> API["POST /api/upload<br/>requireApiPermission"]
    API --> V["validasi tipe & ukuran"]
    V --> S["data/documents/&lt;companyId&gt;/&lt;uuid&gt;.&lt;ext&gt;"]
    API --> D[("tabel documents<br/>di buku PT")]
    API --> A[("audit_logs")]

    S --> R["GET /api/t/{t}/{c}/documents/[id]/file"]
    R --> G["document.read<br/>+ baris ADA di buku PT aktif"]
    G --> B["byte"]

    style S fill:#eef7ee,stroke:#5a8f5a
    style G fill:#ffeaea,stroke:#b55
```

Perubahan di #367 layak dicatat karena ia menutup lubang nyata. Sampai issue
itu berkas mendarat di `public/uploads/` — **satu direktori bersama seluruh PT
seluruh tenant** — dengan nama yang mempertahankan nama asli pengguna, lalu
disajikan sebagai **berkas statis yang tidak melewati satu pun penjaga**.
Sekarang: di luar `public/`, nama `uuid`, dan hanya terjangkau lewat route
bertenant (#489) yang menuntut `document.read` **dan** menemukan barisnya di
basis data PT aktif.

`companyId` datang dari **konteks yang sudah dimasuki penjaga**, bukan dari
klien — pola yang sama dengan `lib/audit.ts`.

## 8. Ke mana data berhenti

| Data | Tempat berhenti | Retensi |
|---|---|---|
| Jurnal & buku besar | `journals`, `journal_lines` di buku PT | **Imutabel**; 10 tahun (UU KUP) |
| Dokumen transaksi | Tabel per jenis di buku PT | Mengikuti buku |
| Berkas lampiran | `data/documents/<companyId>/` | Mengikuti buku |
| Jejak audit PT | `audit_logs` (per buku) | Mengikuti buku |
| Jejak audit tenant | `tenant_audit_logs` (kendali) | **Selamat dari penghapusan tenant** — sengaja tanpa FK |
| Identitas & keanggotaan | `sai_control` | Sampai penghapusan akun |
| Langganan & tagihan | `sai_platform` | ❓ belum dipastikan |
| Jejak penjadwal | `scheduler_runs` (1.246 baris) | ❓ tanpa kebijakan pemangkasan yang terlihat |
| Jejak cadangan | `backup_runs` (54 baris) | ❓ sama |
| Arsip cadangan | S3 | `BACKUP_RETENTION_DAYS` — **tetapi belum ada arsip** |
| Surel pengembangan | `data/mail-outbox/*.eml` | ❓ tanpa pemangkasan |

**Berhenti berlangganan TIDAK menghapus buku** — itu keputusan sadar di
[`docs/COMPLIANCE.md §1`](../COMPLIANCE.md), karena kewajiban retensi 10 tahun
melekat pada pembukuan, bukan pada status langganan.

Lanjut: [07 Infrastruktur & Deploy](./07-INFRASTRUKTUR-DEPLOY.md)
