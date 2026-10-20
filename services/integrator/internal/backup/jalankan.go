package backup

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Pendump adalah apa pun yang bisa menghasilkan dump.
//
// Antarmuka, dan bukan `Perkakas` langsung, dengan satu alasan: tanpa ini
// `Jalankan` hanya bisa dijalankan di mesin yang punya `pg_dump` DAN server
// PostgreSQL yang berisi — yang berarti bagian paling menentukan jalur ini
// (urutan langkah, penanganan kegagalan di tengah, isi manifest) tidak pernah
// dilewati satu tes pun. Yang dipertukarkan hanya SUMBER byte-nya; enkripsi,
// sidik jari, pengiriman, dan manifest tetap kode yang sama persis.
type Pendump interface {
	DumpBasis(ctx context.Context, nama string, w io.Writer) error
	DumpGlobals(ctx context.Context, w io.Writer) error
}

// Opsi adalah satu putaran cadangan, seluruhnya.
type Opsi struct {
	Prefix      string
	Kunci       string // BACKUP_ENCRYPTION_KEY
	Perkakas    Pendump
	Tujuan      Tujuan
	Cacah       *Cacah
	NamaKendali string
	VersiServer int
	VersiKlien  int
	RetensiHari int
	DirKerja    string
	DirData     string // induk `documents` & `audit`
	Saat        time.Time
	// Catat dipanggil untuk tiap langkah; nil berarti diam. Disuntik supaya
	// pelarinya bisa melaporkan kemajuan ke tabel `jobs` tanpa paket ini tahu
	// apa pun tentang antrean.
	Catat func(pesan string)
	// Kemajuan dipanggil dengan persentase 0–100.
	Kemajuan func(persen int) error
}

// Hasil adalah apa yang dicatat ke jejak putaran.
type Hasil struct {
	Manifest  Manifest
	TotalByte int64
	// Status: `ok` bila artefaknya pergi ke LUAR mesin ini, `local` bila tidak.
	Status  string
	Dibuang []string
}

func (o Opsi) catat(format string, args ...any) {
	if o.Catat != nil {
		o.Catat(fmt.Sprintf(format, args...))
	}
}

// ══ URUTAN: CACAH → PERIKSA → DUMP → SANDI → SIDIK → KIRIM → MANIFEST → PANGKAS
//
// Dua sifat urutan ini yang membuat kegagalan tidak berbahaya, dan keduanya
// diwarisi apa adanya dari `scripts/backup.sh`:
//
//  1. Enkripsi terjadi SEBELUM berkas meninggalkan mesin, tidak pernah sesudah.
//  2. Pemangkasan dikerjakan PALING AKHIR, dan hanya bila pengirimannya
//     berhasil — cadangan lama baru dibuang setelah ada yang baru
//     menggantikannya di tempat tujuan. Kebalikannya bisa meninggalkan kita
//     tanpa cadangan sama sekali.
//
// Satu sifat BARU, dan ia yang menutup celah #5: setiap basis data diproses
// SATU PER SATU sampai objeknya terkirim, lalu berkas sementaranya dibuang.
// Jadi ruang cakram sementara yang dibutuhkan sebesar basis data TERBESAR,
// bukan sebesar seluruh pemasangan — dan pada mesin yang sudah sempit itu
// perbedaan antara berjalan dan tidak.

// Jalankan menjalankan satu putaran cadangan penuh.
func Jalankan(ctx context.Context, o Opsi) (*Hasil, error) {
	if o.Kunci == "" {
		return nil, errors.New(
			"BACKUP_ENCRYPTION_KEY belum diset. Cadangan TIDAK PERNAH dikirim tanpa " +
				"sandi: isinya seluruh pembukuan setiap customer")
	}
	if o.Cacah == nil || len(o.Cacah.Basis) == 0 {
		return nil, errors.New("pencacahan basis data kosong — tidak ada yang dicadangkan")
	}

	// ══ BASIS DATA TERDAFTAR YANG HILANG MENGGAGALKAN PUTARAN ════════════════
	//
	// Bukan peringatan, dan bukan dicatat lalu dilanjutkan: cadangan yang
	// kehilangan satu PT adalah cadangan yang GAGAL untuk customer itu, dan
	// putaran yang melaporkan `ok` atas keadaan itu adalah tepat bentuk
	// kegagalan yang §6 menyuruh dibuktikan hilang.
	if len(o.Cacah.Hilang) > 0 {
		return nil, fmt.Errorf(
			"%d basis data TERDAFTAR tidak ada di server: %s — putaran dihentikan "+
				"sebelum satu objek pun dikirim, sebab cadangan yang kehilangan satu PT "+
				"adalah cadangan yang gagal untuk customer itu",
			len(o.Cacah.Hilang), strings.Join(o.Cacah.Hilang, ", "))
	}

	if err := PeriksaVersi(o.VersiKlien, o.VersiServer); err != nil {
		return nil, err
	}

	putaran := NamaPutaran(o.Prefix, o.Saat)
	o.catat("putaran %s → %s (%d basis data)", putaran, o.Tujuan.Nama(), len(o.Cacah.Basis))

	kerja := filepath.Join(o.DirKerja, putaran)
	if err := os.MkdirAll(kerja, 0o700); err != nil {
		return nil, fmt.Errorf("buat direktori kerja: %w", err)
	}
	defer func() { _ = os.RemoveAll(kerja) }()

	m := Manifest{
		Versi:               1,
		Putaran:             putaran,
		MulaiPada:           o.Saat.UTC(),
		Enkripsi:            LabelEnkripsi,
		VersiServer:         o.VersiServer,
		VersiKlien:          o.VersiKlien,
		PerusahaanTerdaftar: 0,
	}
	for _, b := range o.Cacah.Basis {
		if b.Peran == PeranPerusahaan {
			m.PerusahaanTerdaftar++
		}
	}

	var total int64
	// Langkah = setiap basis data + globals + berkas + manifest.
	langkahTotal := len(o.Cacah.Basis) + 3
	langkah := 0
	maju := func() error {
		langkah++
		if o.Kemajuan == nil {
			return nil
		}
		return o.Kemajuan(langkah * 100 / langkahTotal)
	}

	// ── 1. Satu objek per basis data ──────────────────────────────────────
	for _, b := range o.Cacah.Basis {
		kunci := fmt.Sprintf("db-%s.dump.enc", b.Nama)
		o.catat("dump %s (%s)", b.Nama, b.Peran)
		basis := b
		obj, err := o.satuObjek(ctx, kerja, putaran, kunci, JenisBasis, &basis,
			func(w io.Writer) error { return o.Perkakas.DumpBasis(ctx, basis.Nama, w) })
		if err != nil {
			return nil, err
		}
		m.Objek = append(m.Objek, *obj)
		total += obj.Bytes
		if err := maju(); err != nil {
			return nil, err
		}
	}

	// ── 2. Peran & hak akses tingkat server ───────────────────────────────
	//
	// WAJIB ada: dump per basis data tidak memuat satu pun peran, jadi
	// pemasangan yang dipulihkan dari dump-dump itu saja akan berisi data
	// lengkap yang tidak bisa dimasuki siapa pun.
	o.catat("dump peran & hak akses tingkat server")
	obj, err := o.satuObjek(ctx, kerja, putaran, "globals.sql.enc", JenisGlobals, nil,
		func(w io.Writer) error { return o.Perkakas.DumpGlobals(ctx, w) })
	if err != nil {
		return nil, err
	}
	m.Objek = append(m.Objek, *obj)
	total += obj.Bytes
	if err := maju(); err != nil {
		return nil, err
	}

	// ── 3. Berkas yang hidup di luar basis data (#367/#370) ───────────────
	o.catat("kemas data/documents + data/audit")
	obj, err = o.satuObjek(ctx, kerja, putaran, "berkas.tar.gz.enc", JenisBerkas, nil,
		func(w io.Writer) error { return kemasBerkas(o.DirData, w) })
	if err != nil {
		return nil, err
	}
	m.Objek = append(m.Objek, *obj)
	total += obj.Bytes
	if err := maju(); err != nil {
		return nil, err
	}

	// ── 4. Manifest — PALING AKHIR di antara objek ────────────────────────
	//
	// Urutannya bermakna: manifest yang ada berarti putarannya LENGKAP.
	// Manifest yang ditulis lebih dulu akan menjanjikan objek yang belum ada,
	// dan janji itu baru ditemukan salah pada hari pemulihan.
	m.SelesaiPada = time.Now().UTC()
	isi, err := m.JSON()
	if err != nil {
		return nil, err
	}
	if err := o.Tujuan.Simpan(ctx, putaran+"/"+NamaManifest, bytes.NewReader(isi)); err != nil {
		return nil, fmt.Errorf("kirim manifest: %w", err)
	}
	if err := maju(); err != nil {
		return nil, err
	}

	status := "local"
	if o.Tujuan.LuarMesin() {
		status = "ok"
	}

	// ── 5. Pangkas — hanya setelah seluruh pengiriman sukses ──────────────
	dibuang, err := o.pangkas(ctx)
	if err != nil {
		// Pemangkasan yang gagal TIDAK menggagalkan putaran: artefaknya sudah
		// terkirim, dan cadangan yang berhasil lalu dilaporkan gagal karena
		// kebersihan adalah kebalikan dari yang diminta.
		o.catat("⚠ pemangkasan gagal (dilewati): %v", err)
	}

	return &Hasil{Manifest: m, TotalByte: total, Status: status, Dibuang: dibuang}, nil
}

// satuObjek menulis satu objek: dump → sandi → sidik → kirim → buang sementara.
func (o Opsi) satuObjek(
	ctx context.Context,
	kerja, putaran, kunci string,
	jenis JenisObjek,
	basis *Basis,
	hasilkan func(io.Writer) error,
) (*Objek, error) {
	mentah := filepath.Join(kerja, kunci+".mentah")
	tersandi := filepath.Join(kerja, kunci)
	// Berkas sementara dibuang SEGERA setelah objeknya terkirim, bukan di akhir
	// putaran: itulah yang membuat puncak pemakaian cakram sebesar basis data
	// terbesar alih-alih sebesar seluruh pemasangan.
	defer func() {
		_ = os.Remove(mentah)
		_ = os.Remove(tersandi)
	}()

	// Dump ke cakram, bukan ke pipa. `PutObject` menuntut pembaca yang bisa
	// di-seek untuk menandatangani payload-nya; pipa dari `pg_dump` tidak bisa.
	f, err := os.OpenFile(mentah, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return nil, fmt.Errorf("buat %s: %w", mentah, err)
	}
	if err := hasilkan(f); err != nil {
		_ = f.Close()
		return nil, err
	}
	if err := f.Close(); err != nil {
		return nil, fmt.Errorf("tutup %s: %w", mentah, err)
	}

	masuk, err := os.Open(mentah) //nolint:gosec // jalur dirakit dari DirKerja
	if err != nil {
		return nil, fmt.Errorf("buka %s: %w", mentah, err)
	}
	keluar, err := os.OpenFile(tersandi, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		_ = masuk.Close()
		return nil, fmt.Errorf("buat %s: %w", tersandi, err)
	}
	sidik, ditulis, err := Sandikan(keluar, masuk, o.Kunci)
	_ = masuk.Close()
	if cerr := keluar.Close(); err == nil && cerr != nil {
		err = cerr
	}
	if err != nil {
		return nil, fmt.Errorf("sandikan %s: %w", kunci, err)
	}
	// Berkas mentah dibuang SEBELUM pengiriman: ia plaintext seluruh pembukuan,
	// dan ia tidak dibutuhkan lagi sejak detik ini.
	_ = os.Remove(mentah)

	kirim, err := os.Open(tersandi) //nolint:gosec // jalur dirakit dari DirKerja
	if err != nil {
		return nil, fmt.Errorf("buka %s: %w", tersandi, err)
	}
	err = o.Tujuan.Simpan(ctx, putaran+"/"+kunci, kirim)
	_ = kirim.Close()
	if err != nil {
		return nil, err
	}

	// Sidik jari sebagai objek tetangga: itulah bentuk yang sudah dipakai
	// `scripts/backup.sh`, dan `prove-backup-restore` mencarinya. Ia ADA di
	// manifest juga — dua tempat, sebab manifest bisa hilang sementara objek
	// tetangga ikut terunduh bersama berkasnya.
	if err := o.Tujuan.Simpan(ctx, putaran+"/"+kunci+".sha256",
		strings.NewReader(fmt.Sprintf("%s  %s\n", sidik, kunci))); err != nil {
		return nil, fmt.Errorf("kirim sidik jari %s: %w", kunci, err)
	}

	obj := &Objek{Kunci: kunci, Jenis: jenis, Bytes: ditulis, SHA256: sidik}
	if basis != nil {
		obj.Basis = basis.Nama
		obj.Peran = basis.Peran
		obj.CompanyID = basis.CompanyID
	}
	return obj, nil
}

func (o Opsi) pangkas(ctx context.Context) ([]string, error) {
	if o.RetensiHari <= 0 {
		return nil, nil
	}
	ada, err := o.Tujuan.DaftarPutaran(ctx)
	if err != nil {
		return nil, err
	}
	ambang := o.Saat.AddDate(0, 0, -o.RetensiHari)
	buang := PilihUntukDibuang(ada, o.Prefix, ambang)
	var sudah []string
	for _, p := range buang {
		if err := o.Tujuan.BuangPutaran(ctx, p); err != nil {
			o.catat("⚠ gagal membuang %s (dilewati): %v", p, err)
			continue
		}
		o.catat("buang putaran %s", p)
		sudah = append(sudah, p)
	}
	return sudah, nil
}

// kemasBerkas menulis `documents` dan `audit` sebagai satu tar.gz.
//
// `archive/tar` dari pustaka baku, bukan biner `tar`: satu perkakas luar lebih
// sedikit di image, dan galatnya bertipe alih-alih kode keluar yang harus
// diurai. Direktori yang TIDAK ADA dilewati tanpa menggagalkan putaran —
// pemasangan baru belum punya satu dokumen pun, dan itu bukan kegagalan
// cadangan.
func kemasBerkas(dirData string, w io.Writer) error {
	gz := gzip.NewWriter(w)
	tw := tar.NewWriter(gz)

	for _, sub := range []string{"documents", "audit"} {
		akar := filepath.Join(dirData, sub)
		if _, err := os.Stat(akar); os.IsNotExist(err) {
			continue
		}
		if err := tambahkanPohon(tw, dirData, akar); err != nil {
			return err
		}
	}

	if err := tw.Close(); err != nil {
		return fmt.Errorf("tutup tar: %w", err)
	}
	if err := gz.Close(); err != nil {
		return fmt.Errorf("tutup gzip: %w", err)
	}
	return nil
}

func tambahkanPohon(tw *tar.Writer, dasar, akar string) error {
	return filepath.Walk(akar, func(jalur string, info os.FileInfo, err error) error {
		if err != nil {
			return fmt.Errorf("telusuri %s: %w", jalur, err)
		}
		rel, err := filepath.Rel(dasar, jalur)
		if err != nil {
			return fmt.Errorf("jalur relatif %s: %w", jalur, err)
		}
		// Tautan simbolik dilewati: mengikutinya bisa menyalin apa pun yang
		// ditunjuknya ke dalam arsip — termasuk yang di luar direktori data.
		if info.Mode()&os.ModeSymlink != 0 {
			return nil
		}
		h, err := tar.FileInfoHeader(info, "")
		if err != nil {
			return fmt.Errorf("kepala tar %s: %w", jalur, err)
		}
		h.Name = filepath.ToSlash(rel)
		if err := tw.WriteHeader(h); err != nil {
			return fmt.Errorf("tulis kepala %s: %w", rel, err)
		}
		if !info.Mode().IsRegular() {
			return nil
		}
		f, err := os.Open(jalur) //nolint:gosec // jalur dari Walk di bawah DirData
		if err != nil {
			return fmt.Errorf("buka %s: %w", jalur, err)
		}
		defer func() { _ = f.Close() }()
		if _, err := io.Copy(tw, f); err != nil {
			return fmt.Errorf("salin %s: %w", rel, err)
		}
		return nil
	})
}
