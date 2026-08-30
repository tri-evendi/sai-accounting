# Modul per jenis usaha

> Catatan arsitektur, dipindahkan dari issue #495 (catatan keputusan) supaya
> tidak terkubur di riwayat isu. Angka di sini diukur ulang terhadap kode pada
> **30 Agustus 2026** — bukan disalin dari isunya.
>
> ⚠ **Diperbarui setelah modul manufaktur dibangun.** Versi pertama dokumen ini
> menyatakan manufaktur tidak ada — benar saat ditulis, salah sehari kemudian.
> Sebuah dokumen rujukan yang basi lebih berbahaya daripada tidak ada, sebab
> orang berikutnya bertindak atasnya. Siapa pun yang mengubah daftar modul,
> kategori, atau pemetaan sumber daya **wajib** ikut memperbarui berkas ini.

## Pertanyaan yang dijawab dokumen ini

Analisis pengguna (24 Agustus 2026) menyimpulkan:

> *"Jangan semua perusahaan dipaksa menggunakan proses pembukuan yang sama.
> Sebaiknya SAI memiliki modul dasar yang sama, kemudian ditambah modul khusus
> sesuai jenis bisnisnya."*

**Kerangka itu sudah ada.** Yang kurang ISINYA, bukan kerangkanya. Kalimat itu
adalah satu-satunya alasan dokumen ini ditulis: tanpanya, orang berikutnya yang
membaca analisis tersebut akan mengusulkan membangun kerangkanya dari nol.

## Kerangkanya

```
kategori usaha  →  himpunan modul  →  izin · menu · bagan akun
BUSINESS_CATEGORIES  CATEGORY_MODULES     authz-effective · nav · coaTemplateFor
```

| Bagian | Tempat |
|---|---|
| Daftar modul (11) | `src/lib/business-modules.ts` → `BUSINESS_MODULES` |
| Kategori usaha (5) | `BUSINESS_CATEGORIES` — `commodity_trading`, `distribution`, `services`, `manufacturing`, `custom` |
| Modul OPT-IN | `OPT_IN_MODULES` — tidak ikut bawaan "kolom kosong", dan tidak ikut preset yang tidak menyebutnya |
| Preset kategori → modul | `CATEGORY_MODULES` |
| Penegakan | `src/lib/authz-effective.ts` (lapisan KEEMPAT: bawaan → override peran → override pengguna → **modul**) |
| Bagan akun mengikuti modul | `src/lib/coa-template.ts` → `coaTemplateFor` |
| Layar | `/modules` (halaman sendiri sejak #538) + `api/company-settings/modules` |
| Penjaga | `tests/business-modules.test.ts`, `-enforcement`, `-ledger` |

Permukaannya: **10 berkas** menyebut kategori/preset secara langsung, **23
berkas** menyentuh kerangka modul secara keseluruhan (di luar `src/generated`).

> Isu #495 menyebut angka 27. Diukur ulang, yang benar 10 (sempit) / 23 (luas).
> Perbedaannya bukan penting — yang penting kerangkanya nyata dan dipakai luas.

## Tiga aturan yang tidak boleh dilanggar

Disalin dari kepala `business-modules.ts`, tempat penegakannya berada:

1. **Modul tidak pernah menggerbangi buku besar.** Perusahaan yang pernah
   memposting jurnal dari kontrak lalu mematikan modul `trading` tetap memiliki
   jurnal itu, dan setiap laporan tetap rekonsiliasi. Yang digerbangi hanya
   ANTARMUKA dan PEMBUATAN transaksi baru. Karena itu tak satu pun modul
   pelaporan/posting boleh mengimpor `business-modules.ts` — dijaga
   `tests/business-modules-ledger.test.ts`.
2. **Izin ≠ modul.** "Anda tidak punya akses" (peran) dan "fitur ini belum aktif
   untuk perusahaan Anda" (modul) adalah dua kalimat untuk dua keadaan. Mematikan
   modul tidak menyentuh satu baris pun override izin.
3. **Anti-lockout.** `core_accounting` selalu aktif dan tak bisa dimatikan — di
   dalamnya ada `authz.manage` & `user.manage`. Ditegakkan di server
   (`validateEnabledModules`), bukan checkbox yang di-`disabled`.

## Dua rambu untuk siapa pun yang menambah modul jenis usaha baru

Keduanya berasal dari #495 dan tetap berlaku:

- **Menu yang disembunyikan bukan modul.** Sakelar "jenis perusahaan" yang hanya
  menyembunyikan menu tanpa mengubah apa pun di belakangnya menambah beban
  konfigurasi tanpa menambah kemampuan.
- **Jangan menulis mesin persediaan kedua.** Yang ada sekarang — rata-rata
  tertimbang, gerakan sebagai baris dan bukan kolom saldo — sudah benar dan
  sudah teruji.

Konsekuensinya konkret: kategori baru yang tidak membawa **akun sendiri**
(`coaTemplateFor`) atau **perilaku sendiri** (jenis dokumen, aturan posting)
jatuh tepat ke rambu pertama.

## Keadaan per jenis usaha

Diukur terhadap kode, 29 Agustus 2026.

| Jenis | Keadaan |
|---|---|
| **Trading** | ✅ Lengkap. Wisaya pembelian menulis `stock_movements` `in` ber-`unit_cost`; HPP rata-rata tertimbang. |
| **Export** | ✅ Lengkap. Multi-currency + `rate`/`base_amount`, `fx_gain_loss`, dan jenis dokumen `packing_list`/`peb`/`bl`/`coo` (#511). |
| **Import** | ✅ Biaya impor (landed cost) mendarat di #510/#533 — `/landed-costs`, aturan posting `landed_cost`, migrasi 0056, tiga berkas tes. ⚠ Belum pernah dipakai di produksi (0 dokumen). |
| **Jasa** | ✅ Job costing sederhana: `CostCenter` (#98) + Laba Rugi per Proyek (#531). |
| **Manufaktur** | ✅ Lengkap sejak #543/#544: resep bertingkat, stasiun kerja & routing, perintah produksi, Barang Dalam Proses (1106), penyerapan upah (5103) & overhead (5104), dan laporan selisih. Modul **opt-in** — tidak pernah menyala sendiri. |

## Manufaktur: urutan yang dipakai membangunnya

Kekhawatiran yang menahannya dulu benar dan tetap dihormati — **akun yang tidak
bisa diisi**: WIP, upah langsung, dan overhead tidak bisa diposting mekanisme
mana pun sebelum ada perintah produksi. Menambahkan akunnya lebih dulu
menghasilkan akun bersaldo nol selamanya yang tetap muncul di setiap pemilih
akun, persis yang diperingatkan `coa-seeding.ts`.

Karena itu urutannya: **mesin postingnya lebih dulu, akunnya menyusul.**

| Tahap | Isi | Akun |
|---|---|---|
| 1 (migrasi 0060) | Resep, stasiun kerja, routing, biaya standar | tidak ada |
| 2 (migrasi 0061) | Perintah produksi, WIP, tiga jurnal, jalur tulis | 1106, 5103, 5104 lahir di sini |
| 3 | Selisih rencana vs kenyataan | tidak ada |
| 4 | Modul opt-in, izin, tiga layar | tidak ada |

Urutan yang sama sudah terbukti pada biaya impor (#533): dokumen penyesuaian
harga pokok lebih dulu, akun bea masuk & freight menyusul.

### Dua penjaga yang tidak boleh hilang

1. **`stock_movements.production_order_id` menolak jurnal HPP.** Bahan yang
   keluar ke produksi menjadi Barang Dalam Proses, bukan HPP, dan jurnalnya
   terbit SEKALI dari perintahnya. Tanpa penolakan itu satu `repostForSource`
   membebankan HPP di ATAS nilai yang sudah pindah ke WIP — dua kali, **kedua
   jurnalnya seimbang**, jadi tak satu pun penjaga jurnal mengeluh.
2. **Akun manufaktur bertanda `module: "manufacturing"`, bukan `inventory`.**
   Kolom itu mengatur PENYEMAIAN, bukan menu. Bertanda `inventory` (yang sudah
   lama aktif di setiap buku), ketiganya tidak akan pernah tersemai — dan
   perintah produksi pertama berhenti dengan `MissingMappingError`.

### Selisih adalah informasi, bukan jurnal

Buku ini memakai biaya sesungguhnya: WIP menampung nilai nyata dan barang jadi
menerima seluruhnya, jadi tidak ada sisa untuk dijurnal. Selisih **harga** bahan
dan selisih **tarif** upah sengaja tidak ada — keduanya menuntut angka standar
yang tidak disimpan di mana pun, dan menghitungnya terhadap dirinya sendiri
selalu menghasilkan nol. Nol yang berbohong lebih buruk daripada kolom yang
tidak ada.

## Koreksi pemetaan sumber daya (30 Agustus 2026)

Tinjauan seluruh modul menemukan dua sumber daya yang digerbangi modul yang
tidak memilikinya, dan akibatnya terukur:

    distribution TIDAK bisa: delivery_order.read/write, return.read/write

Perusahaan grosir bisa menerbitkan faktur tetapi tidak bisa mengirim barangnya
maupun mencatat yang dikembalikan pelanggannya. Bukti bahwa ini salah pemetaan
ada di **skema**, bukan di selera:

- `sales_returns.invoice_id` **WAJIB** — retur selalu menunjuk faktur → `sales`;
- `delivery_orders.contract_id` **NULLABLE** — surat jalan tak pernah menuntut
  kontrak, dan ia menulis gerakan stok + memposting HPP → `inventory`.

`return` → `sales`, `delivery_order` → `inventory`. Yang tersisa di `trading`
memang khas perdagangan berjangka ekspor: kontrak dan penerima barang.

### MODUL ≠ KELOMPOK MENU

Kekeliruan yang sempat terjadi saat koreksi itu, dan sengaja dicatat di sini:
surat jalan berpindah MODUL ke `inventory`, tetapi TEMPATNYA di menu tetap di
kelompok "Penjualan". Modul menjawab *siapa boleh memakainya*; kelompok menu
menjawab *di mana orang mencarinya*. Orang mencari surat jalan di alur menjual,
bukan di alur gudang. Dua pertanyaan berbeda, dua jawaban yang boleh berbeda.
