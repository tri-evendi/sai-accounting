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
//
// Ia DIPULANGKAN BERSAMA galat `*GalatInstans` bila satu instans tambahan
// gagal: objek instans lain sudah terkirim, dan jejak putarannya tetap harus
// menyebut di mana mereka berada.
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

	// ══ INSTANS TAMBAHAN (tahap 4) ══════════════════════════════════════════
	//
	// Instans yang tidak bisa dicacah, atau yang servernya lebih baru daripada
	// `pg_dump` di sini, GAGAL SENDIRI: instans lain tetap dicadangkan, sebab
	// satu env var yang lupa disalin tidak boleh membuat buku semua PT lain
	// ikut tanpa salinan. Tapi putarannya berakhir `error` — tidak pernah
	// `ok` — dan pemangkasan dilewati, sebab putaran lama mungkin satu-satunya
	// salinan buku di instans yang gagal.
	gagal := append([]InstansGagal(nil), o.Cacah.Gagal...)
	pendump := map[string]Pendump{"": o.Perkakas}
	var infoInstans []InfoInstans
	for _, ins := range o.Cacah.Instans {
		if err := PeriksaVersi(o.VersiKlien, ins.VersiServer); err != nil {
			gagal = append(gagal, InstansGagal{
				Kunci: ins.Kunci, Sebab: err.Error(), Basis: perusahaanDi(o.Cacah, ins.Kunci),
			})
			continue
		}
		pendump[ins.Kunci] = ins.Pendump
		infoInstans = append(infoInstans, InfoInstans{Kunci: ins.Kunci, VersiServer: ins.VersiServer})
	}
	var dicadangkan []Basis
	for _, b := range o.Cacah.Basis {
		if _, ada := pendump[b.Instans]; ada {
			dicadangkan = append(dicadangkan, b)
			continue
		}
		if !instansGagal(gagal, b.Instans) {
			return nil, fmt.Errorf("basis data %s menunjuk instans %q yang tidak tercacah", b.Nama, b.Instans)
		}
	}

	putaran := NamaPutaran(o.Prefix, o.Saat)
	o.catat("putaran %s → %s (%d basis data)", putaran, o.Tujuan.Nama(), len(dicadangkan))
	for _, g := range gagal {
		o.catat("✗ instans %s GAGAL (%d PT tanpa salinan putaran ini): %s", g.Kunci, len(g.Basis), g.Sebab)
	}

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
		Instans:             infoInstans,
		InstansGagal:        gagal,
	}
	for _, b := range dicadangkan {
		if b.Peran == PeranPerusahaan {
			m.PerusahaanTerdaftar++
		}
	}
	for _, g := range gagal {
		m.PerusahaanTerdaftar += len(g.Basis)
	}

	var total int64
	// Langkah = setiap basis data + globals per server + berkas + manifest.
	langkahTotal := len(dicadangkan) + len(infoInstans) + 3
	langkah := 0
	maju := func() error {
		langkah++
		if o.Kemajuan == nil {
			return nil
		}
		return o.Kemajuan(langkah * 100 / langkahTotal)
	}

	// ── 1. Satu objek per basis data ──────────────────────────────────────
	for _, b := range dicadangkan {
		kunci := KunciBasis(b.Instans, b.Nama)
		o.catat("dump %s (%s)", labelBasis(b), b.Peran)
		basis := b
		pd := pendump[b.Instans]
		obj, err := o.satuObjek(ctx, kerja, putaran, kunci, JenisBasis, &basis,
			func(w io.Writer) error { return pd.DumpBasis(ctx, basis.Nama, w) })
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
	//
	// SATU PER SERVER: peran di server instans tambahan bukan peran di server
	// bawaan, dan dump bukunya tidak bisa dimasuki tanpa peran servernya.
	o.catat("dump peran & hak akses tingkat server")
	obj, err := o.satuObjek(ctx, kerja, putaran, KunciGlobals(""), JenisGlobals, nil,
		func(w io.Writer) error { return o.Perkakas.DumpGlobals(ctx, w) })
	if err != nil {
		return nil, err
	}
	m.Objek = append(m.Objek, *obj)
	total += obj.Bytes
	if err := maju(); err != nil {
		return nil, err
	}
	for _, ins := range infoInstans {
		o.catat("dump peran & hak akses instans %s", ins.Kunci)
		pd := pendump[ins.Kunci]
		obj, err := o.satuObjek(ctx, kerja, putaran, KunciGlobals(ins.Kunci), JenisGlobals, nil,
			func(w io.Writer) error { return pd.DumpGlobals(ctx, w) })
		if err != nil {
			return nil, err
		}
		obj.Instans = ins.Kunci
		m.Objek = append(m.Objek, *obj)
		total += obj.Bytes
		if err := maju(); err != nil {
			return nil, err
		}
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

	if len(gagal) > 0 {
		// Putaran SEBAGIAN: objeknya terkirim dan manifest menyebut instans
		// yang tidak ikut. Statusnya `error`, dan TIDAK ada pemangkasan.
		status = "error"
		return &Hasil{Manifest: m, TotalByte: total, Status: status}, &GalatInstans{Gagal: gagal}
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

	// Kunci instans tambahan memuat subdirektori (`instans/<kunci>/…`).
	if err := os.MkdirAll(filepath.Dir(mentah), 0o700); err != nil {
		return nil, fmt.Errorf("buat direktori kerja %s: %w", filepath.Dir(mentah), err)
	}

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
		obj.Instans = basis.Instans
	}
	return obj, nil
}

// ══ NAMA OBJEK ═════════════════════════════════════════════════════════════
//
// Instans bawaan: `db-<nama>.dump.enc` dan `globals.sql.enc`, PERSIS seperti
// sebelum tahap 4 — runbook pemulihan di PRODUCTION.md dan
// `prove-backup-restore` menyebut nama-nama itu, dan pemasangan satu server
// tidak boleh melihat satu byte pun berubah.
//
// Instans tambahan: `instans/<kunci>/db-<nama>.dump.enc` dan
// `instans/<kunci>/globals.sql.enc`. Subdirektori, bukan sufiks: nama basis
// data yang SAMA bisa hidup di dua server sekaligus (selama pemindahan), dan
// dua objek yang namanya hanya berbeda sufiks adalah dua objek yang akan
// tertukar pada hari pemulihan.

// AwalanInstans adalah direktori objek instans tambahan di dalam putaran.
const AwalanInstans = "instans/"

// KunciBasis memulangkan kunci objek dump satu basis data.
func KunciBasis(instans, nama string) string {
	return awalan(instans) + "db-" + nama + ".dump.enc"
}

// KunciGlobals memulangkan kunci objek peran & hak akses satu server.
func KunciGlobals(instans string) string {
	return awalan(instans) + "globals.sql.enc"
}

func awalan(instans string) string {
	if instans == "" {
		return ""
	}
	return AwalanInstans + instans + "/"
}

func labelBasis(b Basis) string {
	if b.Instans == "" {
		return b.Nama
	}
	return b.Nama + "@" + b.Instans
}

// GalatInstans: satu atau lebih instans tambahan tidak dicadangkan putaran ini.
type GalatInstans struct {
	Gagal []InstansGagal
}

func (g *GalatInstans) Error() string {
	bagian := make([]string, 0, len(g.Gagal))
	for _, x := range g.Gagal {
		bagian = append(bagian, fmt.Sprintf("%s (%d PT: %s): %s",
			x.Kunci, len(x.Basis), strings.Join(x.Basis, ", "), x.Sebab))
	}
	return fmt.Sprintf(
		"%d instans basis data TIDAK dicadangkan — %s. Objek instans lain sudah "+
			"terkirim dan manifest menyebut yang tidak ikut; pemangkasan dilewati",
		len(g.Gagal), strings.Join(bagian, "; "))
}

func perusahaanDi(c *Cacah, instans string) []string {
	var out []string
	for _, b := range c.Basis {
		if b.Instans == instans && b.Peran == PeranPerusahaan {
			out = append(out, b.Nama)
		}
	}
	return out
}

func instansGagal(gagal []InstansGagal, kunci string) bool {
	for _, g := range gagal {
		if g.Kunci == kunci {
			return true
		}
	}
	return false
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
