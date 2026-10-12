-- ═══════════════════════════════════════════════════════════════════════════
-- SLUG PERUSAHAAN PERMANEN — padanan PostgreSQL dari migration kendali 0010
-- (rencana migrasi — docs/arsitektur/11-RENCANA-POSTGRESQL.md §10 Fase D)
--
-- ══ KENAPA BERKAS INI DITULIS TANGAN, SEMENTARA 0001 DIBANGKITKAN ══════════
-- `0001_baseline` dibangkitkan Prisma dari skema. Prisma TIDAK TAHU apa pun
-- tentang trigger: ia bukan bagian dari model. Diperiksa — baseline PostgreSQL
-- memuat NOL trigger.
--
-- Artinya, tanpa berkas ini, pindah ke PostgreSQL akan MENGHAPUS penjaga
-- keabadian slug tanpa satu pun galat, tanpa satu pun baris log, dan tanpa ada
-- yang menyadarinya sampai suatu `UPDATE` mengubah slug dan memutus setiap
-- tautan yang pernah dibagikan. Penjaga yang hilang diam-diam adalah bentuk
-- kehilangan terburuk, sebab tidak ada yang bisa menunjukkan kapan ia hilang.
--
-- `tests/pg-trigger-parity.test.ts` menolak setiap trigger MariaDB yang tidak
-- punya padanan di sini — jadi trigger KEDUA kelak tidak akan terlewat.
--
-- ══ TERJEMAHAN, BUKAN PENULISAN ULANG PERILAKU ════════════════════════════
-- Semantiknya dijaga sama persis dengan aslinya:
--
--   • Yang ditolak adalah NILAI yang berubah, bukan kolom yang ikut disebut di
--     SET. `SET slug = slug` dan penulisan baris penuh oleh ORM tetap LOLOS.
--     MariaDB memakai `<=>` (aman-NULL); PostgreSQL memakai
--     `IS DISTINCT FROM`, yang artinya sama persis.
--   • Pesannya sama kata per kata — ia menyebut ALASANNYA, sebab galat generik
--     akan membuat orang berikutnya mengira ini bug lalu mencari cara
--     melewatinya.
--   • `BEFORE UPDATE … FOR EACH ROW`, sama.
--
-- Yang BERBEDA hanya bentuknya: PostgreSQL menuntut fungsi terpisah, dan
-- `RAISE EXCEPTION` menggantikan `SIGNAL SQLSTATE '45000'`. SQLSTATE-nya
-- dipertahankan supaya kode yang menangkapnya (bila kelak ada) tetap cocok.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION companies_slug_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW.slug IS DISTINCT FROM OLD.slug THEN
    RAISE EXCEPTION
      'slug perusahaan permanen (#161): ia menyusun nama basis data dan URL. Nama boleh diubah; ganti slug perlu alias tersimpan.'
      USING ERRCODE = '45000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS companies_slug_immutable ON companies;

CREATE TRIGGER companies_slug_immutable
  BEFORE UPDATE ON companies
  FOR EACH ROW
  EXECUTE FUNCTION companies_slug_immutable();
