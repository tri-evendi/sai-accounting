-- ═══════════════════════════════════════════════════════════════════════════
-- Peran SISTEM yang hilang sejak pindah ke PostgreSQL.
--
-- Baseline PostgreSQL (0001) membuat tabel `roles` tetapi tidak menyemai empat
-- peran sistem yang dulu disemai migration MariaDB 0031 (bos/core/ptg) dan
-- 0032 (ganti nama + administrator). Akibatnya di setiap buku yang dibuat
-- sesudah pindah: "Undang Pengguna" ditolak "Peran itu tidak dikenal atau
-- sudah dinonaktifkan", dan pemilih peran menampilkan kunci mentah.
--
-- Idempoten: ON CONFLICT pada `roles_key_key` membiarkan baris yang sudah ada
-- (termasuk label yang diubah pelanggan) apa adanya. Buku lama yang dipindah
-- dari MariaDB sudah punya keempatnya, jadi di sana migration ini tidak
-- mengubah apa pun. Expand-only: hanya menambah baris.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO "roles" ("key", "label", "is_system", "is_active", "created_at", "updated_at") VALUES
    ('managing_director', 'Direktur Utama',       true, true, CURRENT_TIMESTAMP AT TIME ZONE 'UTC', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    ('finance_manager',   'Manajer Keuangan',     true, true, CURRENT_TIMESTAMP AT TIME ZONE 'UTC', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    ('warehouse_head',    'Kepala Gudang',        true, true, CURRENT_TIMESTAMP AT TIME ZONE 'UTC', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    ('administrator',     'Administrator Sistem', true, true, CURRENT_TIMESTAMP AT TIME ZONE 'UTC', CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
ON CONFLICT ("key") DO NOTHING;
