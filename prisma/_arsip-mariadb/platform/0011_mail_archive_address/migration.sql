-- SALINAN SENYAP SUREL KELUAR — alamat arsip pemilik.
--
-- KENAPA: pemilik ingin melihat setiap pesan yang keluar dari aplikasi tanpa
-- harus membuka kotak masuk `support@`. Satu kolom, satu tempat pemasangan
-- (`sendMail`), sehingga tidak ada pengirim yang bisa lupa.
--
-- BCC, BUKAN CC. CC menampilkan alamat ini kepada SETIAP penerima; alamat
-- pribadi yang tersebar ke seluruh basis pelanggan tidak bisa ditarik kembali.
--
-- ⚠ TIDAK berlaku untuk surel yang membawa TOKEN AKSES — atur-ulang kata sandi,
-- undangan, verifikasi pendaftaran, permintaan penghapusan tenant. Kotak arsip
-- yang memuat tautan atur-ulang berarti siapa pun yang bisa membacanya dapat
-- mengambil alih akun mana pun, dan "hanya pemilik yang membacanya" adalah
-- asumsi tentang kotak surel pihak ketiga yang tidak bisa dijamin kode ini.
-- Pengecualiannya ditegakkan `MailMessage.sensitive` di lib/mailer-core.ts,
-- bukan oleh kehati-hatian pemanggil.
ALTER TABLE `mail_settings`
  ADD COLUMN `archive_address` VARCHAR(191) NULL AFTER `password_tag`;
