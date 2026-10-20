package backup

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"time"
)

// Tujuan adalah ke mana objek cadangan pergi.
//
// Antarmuka, dan bukan satu implementasi ber-`if`: separuh dari apa yang harus
// dibuktikan tentang jalur ini — tata letak kunci, pemangkasan, urutan
// langkah — bisa diuji tanpa satu pun penyimpanan sungguhan begitu tujuannya
// bisa ditukar.
type Tujuan interface {
	// Nama untuk log dan untuk jejak putaran.
	Nama() string

	// LuarMesin membedakan `ok` dari `local` di `backup_runs.status`.
	//
	// Satu kata ini yang menentukan apakah permukaan kesehatan berkata benar:
	// `ok` berarti ada salinan DI LUAR mesin ini. Salinan di cakram yang sama
	// dengan basis datanya tidak menyelamatkan dari kehilangan mesin, dan
	// `backupHealth` mencari keberhasilan dengan `status = "ok"` — jadi nilai
	// yang terpisah inilah yang mencegah salinan lokal mengisi `lastSuccessAt`.
	LuarMesin() bool

	// Simpan menulis satu objek. Kunci relatif terhadap akar tujuan.
	Simpan(ctx context.Context, kunci string, r io.Reader) error

	// DaftarPutaran memulangkan nama direktori putaran yang ada di tujuan.
	DaftarPutaran(ctx context.Context) ([]string, error)

	// BuangPutaran membuang satu putaran beserta seluruh objeknya.
	BuangPutaran(ctx context.Context, putaran string) error
}

// ── Nama putaran ───────────────────────────────────────────────────────────
//
// `<prefix>-<stamp>` — bentuk yang SAMA dengan `scripts/backup.sh`, dan itu
// bukan kebetulan: `prove-backup-restore` menemukan artefak dengan pola ini,
// dan runbook menyebutnya. Yang berubah hanyalah bahwa ia kini sebuah
// DIREKTORI berisi satu objek per basis data, bukan satu berkas tunggal.

// PolaPutaran cocok dengan `sai-20261020T114500Z`.
var PolaPutaran = regexp.MustCompile(`^([a-z0-9-]+)-(\d{8})T\d{6}Z$`)

// NamaPutaran merakit nama direktori putaran.
func NamaPutaran(prefix string, saat time.Time) string {
	return fmt.Sprintf("%s-%s", prefix, saat.UTC().Format("20060102T150405Z"))
}

// TanggalPutaran menarik `YYYYMMDD` dari nama putaran. "" bila bukan putaran.
func TanggalPutaran(nama, prefix string) string {
	m := PolaPutaran.FindStringSubmatch(nama)
	if m == nil || m[1] != prefix {
		return ""
	}
	return m[2]
}

// ══ PEMANGKASAN: MURNI, DAN SELALU MENYISAKAN YANG TERBARU ═════════════════
//
// Dua aturan, dan yang kedua tidak ada di jalur S3 `scripts/backup.sh` yang
// lama — ia hanya ada di jalur lokal. Di sini ia berlaku untuk KEDUANYA, dan
// itu koreksi yang disengaja:
//
// Sebuah mesin yang mati sebulan lalu hidup kembali akan menyalakan pemangkas
// yang menghapus salinan terakhirnya sendiri — kegagalan yang bentuknya persis
// seperti keberhasilan. Di S3 "retensi 30 hari tanpa pengecualian" terasa aman
// karena ada sumber lain; pada pemasangan on-premise yang bucket-nya satu-satu,
// tidak ada sumber lain. Satu aturan untuk keduanya menghapus pertanyaan
// "tujuan mana yang berlaku di pemasangan ini".
//
// Dan urutannya: pemangkasan PALING AKHIR, hanya setelah pengiriman sukses.
// Kebalikannya bisa meninggalkan kita tanpa cadangan sama sekali.

// PilihUntukDibuang memulangkan nama putaran yang sudah melewati retensi.
//
// `putaran` adalah daftar nama apa adanya dari tujuan; yang tidak cocok dengan
// pola diabaikan, bukan dibuang — direktori yang bukan milik kita tidak boleh
// disentuh pemangkas kita.
func PilihUntukDibuang(putaran []string, prefix string, sebelum time.Time) []string {
	type baris struct{ nama, tanggal string }
	var milik []baris
	for _, n := range putaran {
		if t := TanggalPutaran(n, prefix); t != "" {
			milik = append(milik, baris{n, t})
		}
	}
	if len(milik) == 0 {
		return nil
	}
	sort.Slice(milik, func(i, j int) bool { return milik[i].nama < milik[j].nama })
	terbaru := milik[len(milik)-1].nama

	ambang := sebelum.UTC().Format("20060102")
	var buang []string
	for _, b := range milik {
		if b.nama == terbaru {
			continue
		}
		if b.tanggal < ambang {
			buang = append(buang, b.nama)
		}
	}
	return buang
}

// ── Tujuan: cakram ─────────────────────────────────────────────────────────

// Cakram menyimpan ke direktori di mesin ini.
type Cakram struct{ Akar string }

// NewCakram membuat tujuan cakram.
func NewCakram(akar string) *Cakram { return &Cakram{Akar: akar} }

// Nama memulangkan jalur akarnya.
func (c *Cakram) Nama() string { return c.Akar }

// LuarMesin selalu false — itulah seluruh maksud tipe ini.
func (c *Cakram) LuarMesin() bool { return false }

// Simpan menulis objek lewat berkas sementara lalu me-rename-nya.
//
// `.partial` lalu `rename`, dan bukan tulis langsung: penulisan yang terputus
// di tengah meninggalkan berkas setengah yang NAMANYA TAMPAK SAH — dan nama
// yang tampak sah itulah yang akan dipercaya pada hari pemulihan. `rename` di
// satu filesystem bersifat atomik.
func (c *Cakram) Simpan(_ context.Context, kunci string, r io.Reader) error {
	penuh := filepath.Join(c.Akar, kunci)
	if err := os.MkdirAll(filepath.Dir(penuh), 0o700); err != nil {
		return fmt.Errorf("buat direktori %s: %w", filepath.Dir(penuh), err)
	}
	sementara := penuh + ".partial"
	f, err := os.OpenFile(sementara, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return fmt.Errorf("buat %s: %w", sementara, err)
	}
	if _, err := io.Copy(f, r); err != nil {
		_ = f.Close()
		_ = os.Remove(sementara)
		return fmt.Errorf("tulis %s: %w", sementara, err)
	}
	// `Sync` sebelum rename: tanpanya, mesin yang mati seketika sesudah putaran
	// bisa bangun dengan nama yang sah di atas isi yang belum sampai ke cakram.
	if err := f.Sync(); err != nil {
		_ = f.Close()
		return fmt.Errorf("sync %s: %w", sementara, err)
	}
	if err := f.Close(); err != nil {
		return fmt.Errorf("tutup %s: %w", sementara, err)
	}
	if err := os.Rename(sementara, penuh); err != nil {
		return fmt.Errorf("pindahkan %s: %w", penuh, err)
	}
	return nil
}

// DaftarPutaran membaca direktori tingkat pertama di bawah akar.
func (c *Cakram) DaftarPutaran(_ context.Context) ([]string, error) {
	entri, err := os.ReadDir(c.Akar)
	if os.IsNotExist(err) {
		// Volume yang baru dibuat datang kosong, dan satu direktori yang hilang
		// bukan kegagalan — ia hanya berarti belum ada putaran.
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("baca %s: %w", c.Akar, err)
	}
	var nama []string
	for _, e := range entri {
		if e.IsDir() {
			nama = append(nama, e.Name())
		}
	}
	return nama, nil
}

// BuangPutaran menghapus satu direktori putaran.
func (c *Cakram) BuangPutaran(_ context.Context, putaran string) error {
	if TanggalPutaran(putaran, prefixDari(putaran)) == "" {
		// Pemangkas yang bisa diminta menghapus jalur arbitrer adalah satu salah
		// panggil dari menghapus hal lain.
		return fmt.Errorf("menolak membuang %q — bukan nama putaran", putaran)
	}
	if err := os.RemoveAll(filepath.Join(c.Akar, putaran)); err != nil {
		return fmt.Errorf("buang %s: %w", putaran, err)
	}
	return nil
}

func prefixDari(putaran string) string {
	m := PolaPutaran.FindStringSubmatch(putaran)
	if m == nil {
		return ""
	}
	return m[1]
}
