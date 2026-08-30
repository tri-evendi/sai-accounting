# Modul per jenis usaha

> Catatan arsitektur, dipindahkan dari issue #495 (catatan keputusan) supaya
> tidak terkubur di riwayat isu. Angka di sini diukur ulang terhadap kode pada
> 29 Agustus 2026 — bukan disalin dari isunya.

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
| Daftar modul (10) | `src/lib/business-modules.ts` → `BUSINESS_MODULES` |
| Kategori usaha (4) | `BUSINESS_CATEGORIES` — `commodity_trading`, `distribution`, `services`, `custom` |
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
| **Manufaktur** | ⛔ Hanya potongan terkecilnya: jenis gerakan `process` untuk susut proses (#490). BOM / production order / WIP / tenaga kerja / overhead tidak ada. |

## Kenapa manufaktur berhenti di situ

Alasannya bukan kesulitan teknis, melainkan **akun yang tidak bisa diisi**:
WIP, tenaga kerja langsung, dan overhead tidak bisa diposting oleh mekanisme
mana pun yang ada hari ini. Menambahkan akunnya lebih dulu menghasilkan akun
bersaldo nol selamanya yang tetap muncul di setiap pemilih akun — persis yang
diperingatkan `coa-seeding.ts`.

Urutan yang benar karena itu: **mesin postingnya lebih dulu, akunnya menyusul** —
sama seperti biaya impor, yang butuh dokumen penyesuaian harga pokok (#533)
sebelum akun bea masuk & freight masuk akal.
