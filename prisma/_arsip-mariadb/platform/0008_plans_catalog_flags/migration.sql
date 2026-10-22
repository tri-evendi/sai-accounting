-- ─────────────────────────────────────────────────────────────────────────────
-- Katalog paket: tiga keputusan KOMERSIAL yang selama ini tidak punya tempat.
--
-- Sampai sekarang `plans` hanya mengenal `is_active`, dan katalog publik
-- diturunkan langsung darinya. Tiga hal karena itu tidak bisa dinyatakan sama
-- sekali — dan ketiganya bukan urusan tampilan melainkan keputusan penjualan
-- yang harus bisa diubah tanpa menggelar kode:
--
--   * `is_public` — paket yang SAH tapi TIDAK DIJUAL. `internal` adalah paket
--     pemakaian penyedia sendiri (pt-sai); ia wajib `is_active` supaya putaran
--     adopsi yatim (#152) bisa menyembuhkan tenant internal, tetapi memajangnya
--     di halaman harga berarti menawarkan "Rp 0, 10 PT, 50 pengguna" kepada
--     publik. Sebelum kolom ini, halaman pendaratan memang menampilkannya.
--   * `contact_only` — paket yang harganya DIRUNDINGKAN, bukan dipajang
--     (Enterprise). Menaruh Rp 0 untuk paket seperti itu bukan sekadar jelek:
--     ia berarti tombol swalayan menghitung prorata dari nol, yaitu naik paket
--     GRATIS. Karena itu kolom ini juga dibaca PENJAGA di jalur pindah paket,
--     bukan hanya oleh kartu harganya.
--   * `is_recommended` — paket yang disorot di halaman harga. Pilihan itu milik
--     yang menjual, bukan aturan yang ditebak kode ("yang tengah", "yang
--     termahal") dan bukan pula variabel environment yang harus digelar ulang.
--
-- SEMUANYA BER-DEFAULT AMAN: paket lama tetap publik, tetap berharga, dan tidak
-- ada yang tiba-tiba tersorot. Migration ini karena itu tidak mengubah satu pun
-- perilaku sampai seseorang mengisinya (lihat `scripts/seed-plans.ts`).
--
-- `is_recommended` sengaja TIDAK dijadikan unik: dua paket tersorot adalah
-- kesalahan penjualan yang murah diperbaiki, sedangkan constraint unik pada
-- kolom boolean menolak juga keadaan yang sah (nol paket tersorot) di sebagian
-- mesin dan menyulitkan penggantian sorotan (harus mematikan dulu, baru
-- menyalakan) — kompleksitas yang tidak sebanding.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE `plans`
  ADD COLUMN `is_public` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `contact_only` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `is_recommended` BOOLEAN NOT NULL DEFAULT false;

-- Katalog publik selalu disaring dua kolom sekaligus.
CREATE INDEX `plans_is_active_is_public_idx` ON `plans` (`is_active`, `is_public`);
