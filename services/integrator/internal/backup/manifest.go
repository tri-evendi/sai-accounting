package backup

import (
	"encoding/json"
	"fmt"
	"time"
)

// ══ KENAPA MANIFEST ADALAH OBJEK, BUKAN HANYA BARIS DI BASIS DATA ══════════
//
// Jejak putaran tetap ditulis ke `backup_runs` seperti sebelumnya. Tapi pada
// hari pemulihan, basis data kendali bisa PERSIS yang hilang — dan baris
// riwayat yang menjelaskan di mana dump setiap PT berada akan hilang bersamanya.
// Jadi manifestnya ikut dikirim sebagai objek di dalam putarannya sendiri,
// dan ia satu-satunya objek yang bisa dibaca tanpa kunci enkripsi.
//
// Ia TIDAK memuat isi buku: hanya nama basis data, ukuran, sidik jari, dan
// versi server. Itu yang dibutuhkan untuk menjawab tiga pertanyaan pemulihan —
// apa saja yang ada, mana yang milik PT ini, dan apakah berkasnya masih utuh —
// tanpa membuka satu objek pun.

// JenisObjek membedakan isi sebuah objek cadangan.
type JenisObjek string

const (
	// JenisBasis: dump satu basis data, format custom `pg_dump -Fc`.
	JenisBasis JenisObjek = "database"
	// JenisGlobals: peran & hak akses tingkat server, `pg_dumpall --globals-only`.
	JenisGlobals JenisObjek = "globals"
	// JenisBerkas: `data/documents` + `data/audit` (#367/#370), hidup di luar DB.
	JenisBerkas JenisObjek = "files"
)

// Objek adalah satu berkas di dalam sebuah putaran.
type Objek struct {
	Kunci     string     `json:"kunci"`
	Jenis     JenisObjek `json:"jenis"`
	Basis     string     `json:"basis,omitempty"`
	Peran     Peran      `json:"peran,omitempty"`
	CompanyID *int32     `json:"companyId,omitempty"`
	// Instans: kunci `db_instances` server asal objek ini. KOSONG (dan tidak
	// ditulis) untuk instans bawaan, supaya manifest pemasangan satu server
	// tetap sama persis dengan sebelum tahap 4.
	Instans string `json:"instans,omitempty"`
	Bytes   int64  `json:"bytes"`
	// SHA256 atas CIPHERTEXT. AES-CBC tidak membawa pemeriksaan keutuhan
	// sendiri, jadi tanpa angka ini cadangan yang rusak di tengah jalan baru
	// ketahuan pada hari kita paling tidak ingin menemukannya.
	SHA256 string `json:"sha256"`
}

// Manifest adalah daftar isi satu putaran cadangan.
type Manifest struct {
	Versi       int       `json:"versi"`
	Putaran     string    `json:"putaran"`
	MulaiPada   time.Time `json:"mulaiPada"`
	SelesaiPada time.Time `json:"selesaiPada"`

	// Enkripsinya disebut APA ADANYA supaya prosedur pemulihan tidak perlu
	// ditebak dari nama berkas. Lihat `sandi.go` untuk alasan formatnya.
	Enkripsi string `json:"enkripsi"`

	VersiServer int `json:"versiServer"`
	VersiKlien  int `json:"versiKlien"`

	Objek []Objek `json:"objek"`

	// Perusahaan yang terdaftar di registry saat putaran ini berjalan. Angka
	// ini yang membuat "apakah cadangannya melewatkan PT baru?" bisa dijawab
	// tanpa menebak — bandingkan dengan jumlah objek ber-peran `company`.
	PerusahaanTerdaftar int `json:"perusahaanTerdaftar"`

	// Instans tambahan yang ikut dicadangkan (tahap 4). Tidak ditulis bila
	// hanya ada instans bawaan.
	Instans []InfoInstans `json:"instans,omitempty"`

	// Instans yang TIDAK ikut. Manifest yang memuat bidang ini adalah putaran
	// SEBAGIAN: setiap objek yang disebutnya ada dan utuh, tapi buku PT yang
	// tercantum di sini tidak punya salinan di putaran ini. Jejaknya `error`,
	// dan `prove-backup-restore` menolak putaran ini.
	InstansGagal []InstansGagal `json:"instansGagal,omitempty"`
}

// InfoInstans: satu instans tambahan di dalam putaran.
type InfoInstans struct {
	Kunci       string `json:"kunci"`
	VersiServer int    `json:"versiServer"`
}

// NamaManifest adalah kunci manifest di dalam putarannya.
const NamaManifest = "manifest.json"

// LabelEnkripsi menyebut format artefaknya apa adanya.
const LabelEnkripsi = "openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt"

// JSON merakit manifest menjadi byte yang siap dikirim.
//
// Ber-indentasi, dan itu disengaja: ia dibaca MANUSIA pada hari pemulihan,
// kadang dengan `cat` di terminal tanpa `jq`. Beberapa ratus byte tambahan
// adalah harga yang tidak perlu dipikirkan.
func (m Manifest) JSON() ([]byte, error) {
	b, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("rakit manifest: %w", err)
	}
	return append(b, '\n'), nil
}

// BasisPerusahaan memulangkan objek dump milik satu perusahaan.
//
// Inilah yang menjawab permintaan yang melahirkan celah #5: "pulihkan data
// kami saja ke keadaan Selasa". Tanpa objek per basis data, jawabannya menuntut
// memulihkan SELURUH pemasangan ke server bayangan lebih dulu.
//
// `companyId` hanya terisi pada objek dari instans tempat PT itu TERDAFTAR,
// jadi salinan bernama sama di server lain tidak pernah terpilih di sini.
func (m Manifest) BasisPerusahaan(companyID int32) *Objek {
	for i := range m.Objek {
		o := &m.Objek[i]
		if o.Jenis == JenisBasis && o.CompanyID != nil && *o.CompanyID == companyID {
			return o
		}
	}
	return nil
}
