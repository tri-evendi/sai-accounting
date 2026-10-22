-- Pencabutan sesi (audit RBAC fase 3): versi sesi per pengguna. JWT menyimpan
-- angka ini saat login; revalidasi berkala membandingkannya dengan DB — beda
-- berarti sesi dicabut (ganti peran / reset kata sandi oleh admin).
ALTER TABLE `users` ADD COLUMN `session_version` INT NOT NULL DEFAULT 1;
