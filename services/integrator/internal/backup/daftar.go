package backup

import (
	"context"
	"fmt"
	"sort"

	"github.com/jackc/pgx/v5"
)

// Peran sebuah basis data dalam pemasangan ini.
type Peran string

const (
	PeranKendali    Peran = "control"
	PeranPlatform   Peran = "platform"
	PeranPerusahaan Peran = "company"
	PeranLain       Peran = "other"
)

// Basis adalah satu basis data yang akan punya OBJEK DUMPNYA SENDIRI.
type Basis struct {
	Nama  string
	Peran Peran
	// CompanyID hanya terisi untuk PeranPerusahaan, dan itulah yang membuat
	// "pulihkan data PT ini saja" bisa dijawab tanpa menebak nama basis data.
	// Ia hanya terisi pada basis data di instans tempat PT itu TERDAFTAR —
	// salinan bernama sama di server lain (sisa pemindahan) berperan `other`.
	CompanyID *int32
	// Instans: kunci `db_instances` tempat basis data ini didump; kosong =
	// instans bawaan (server `CONTROL_DATABASE_URL`).
	Instans string
}

// InstansTercacah adalah instans tambahan yang berhasil dibaca `pg_database`-nya.
type InstansTercacah struct {
	Kunci       string
	VersiServer int
	// Pendump yang menyambung ke server instans INI — tidak pernah ke bawaan.
	Pendump Pendump
}

// InstansGagal adalah instans yang bukunya TIDAK bisa dicadangkan putaran ini.
type InstansGagal struct {
	Kunci string `json:"kunci"`
	Sebab string `json:"sebab"`
	// Basis data PT terdaftar di instans itu — yang tidak punya objek putaran ini.
	Basis []string `json:"basis,omitempty"`
}

// Cacah adalah hasil pencacahan: apa yang akan didump, dan apa yang HILANG.
type Cacah struct {
	// Basis: instans bawaan dulu (urut nama), lalu tiap instans tambahan
	// (urut kunci, lalu nama). Tanpa instans tambahan isinya sama persis
	// dengan sebelum tahap 4.
	Basis []Basis
	// Hilang adalah basis data yang TERDAFTAR di registry tapi tidak ada di
	// server instansnya. Ia bukan peringatan: cadangan yang kehilangan satu PT
	// adalah cadangan yang gagal untuk customer itu saja — dan itulah bentuk
	// kegagalan yang paling mudah tidak terlihat. Instans bawaan ditulis
	// `nama`, instans lain `nama@kunci`.
	Hilang []string
	// Instans tambahan yang tercacah, urut kunci.
	Instans []InstansTercacah
	// Instans yang tidak bisa dicacah sama sekali (env var tak diset, bentuk
	// namanya salah, server tak terjangkau). Instans lain TETAP dicadangkan,
	// tapi putarannya berakhir `error`.
	Gagal []InstansGagal
}

// ══ DUA SUMBER, DAN URUTANNYA MENENTUKAN ═══════════════════════════════════
//
// Yang DIDUMP datang dari `pg_database`, bukan dari registry. Daftar yang
// diturunkan dari registry akan melewatkan apa pun yang ada di server tapi
// tidak terdaftar — termasuk basis data yang sedang diadopsi, dan `sai_platform`
// yang memang tidak punya baris registry. Itu bentuk "hampir semua" yang sama
// yang membuat `--all-databases` dipilih di `scripts/backup.sh`.
//
// Yang DIPERIKSA datang dari registry. §6: setiap basis data terdaftar wajib
// punya objek dumpnya sendiri. Perbandingan dua arah inilah buktinya, dan tidak
// satu arah pun cukup sendiri.
//
// Integrator TIDAK membaca `PLATFORM_DATABASE_URL`, dan pencacahan lewat
// `pg_database` itulah yang membuatnya tidak perlu: bidang penagihan (#137)
// tetap dicadangkan tanpa integrator pernah memegang alamatnya.
//
// ══ PER INSTANS (tahap 4) ══════════════════════════════════════════════════
//
// Kedua arah itu berlaku PER INSTANS: PT yang terdaftar di instans X wajib
// punya objek yang didump DARI X. Basis data bernama sama di server lain —
// salinan `_moved_` yang belum diganti nama, atau buku yang sedang dipindah —
// tidak membuktikan apa pun tentang X, jadi ia didump sebagai `other` tanpa
// `companyId`.

// Kueri memenuhi `*pgxpool.Pool` maupun `*pgx.Conn`.
type Kueri interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

// Instans adalah satu baris `db_instances` yang ikut dicadangkan.
type Instans struct {
	Kunci  string
	EnvVar string
}

// PerusahaanTerdaftar adalah satu baris `companies`.
type PerusahaanTerdaftar struct {
	ID    int32
	Basis string
	// Instans: `db_instance_key`; kosong = bawaan.
	Instans string
}

// Registry adalah bacaan basis data kendali yang dibutuhkan pencacahan.
type Registry struct {
	Perusahaan []PerusahaanTerdaftar
	// Instans tambahan yang AKTIF atau MASIH DITEMPATI satu PT. Instans
	// nonaktif yang masih ditempati tetap ikut: menonaktifkannya tidak
	// memindahkan buku siapa pun, dan buku yang tidak dicadangkan karena
	// sebuah bendera adalah buku yang tidak dicadangkan.
	Instans []Instans
}

// BacaRegistry membaca `companies` + `db_instances` dari basis data kendali.
// Hanya-baca: pohon Go tidak menulis tabel ini.
func BacaRegistry(ctx context.Context, kendali Kueri) (*Registry, error) {
	reg, err := kendali.Query(ctx, `SELECT id, database_name, db_instance_key FROM companies`)
	if err != nil {
		return nil, fmt.Errorf("baca registry perusahaan: %w", err)
	}
	r := &Registry{}
	ditempati := map[string]bool{}
	for reg.Next() {
		var p PerusahaanTerdaftar
		var kunci *string
		if err := reg.Scan(&p.ID, &p.Basis, &kunci); err != nil {
			reg.Close()
			return nil, fmt.Errorf("baca baris registry: %w", err)
		}
		if kunci != nil {
			p.Instans = *kunci
			ditempati[*kunci] = true
		}
		r.Perusahaan = append(r.Perusahaan, p)
	}
	reg.Close()
	if err := reg.Err(); err != nil {
		return nil, fmt.Errorf("baca registry perusahaan: %w", err)
	}

	ins, err := kendali.Query(ctx,
		`SELECT key, url_env_var, is_active FROM db_instances ORDER BY key`)
	if err != nil {
		return nil, fmt.Errorf("baca db_instances: %w", err)
	}
	defer ins.Close()
	for ins.Next() {
		var i Instans
		var aktif bool
		if err := ins.Scan(&i.Kunci, &i.EnvVar, &aktif); err != nil {
			return nil, fmt.Errorf("baca baris db_instances: %w", err)
		}
		if aktif || ditempati[i.Kunci] {
			r.Instans = append(r.Instans, i)
		}
	}
	if err := ins.Err(); err != nil {
		return nil, fmt.Errorf("baca db_instances: %w", err)
	}
	return r, nil
}

// BasisDiServer mencacah basis data yang bisa didump di satu server.
func BasisDiServer(ctx context.Context, q Kueri) ([]string, error) {
	// `datallowconn = false` dikecualikan: `pg_dump` tidak bisa menyambung ke
	// sana sama sekali, jadi memasukkannya menjamin satu kegagalan per putaran.
	rows, err := q.Query(ctx, `
		SELECT datname FROM pg_database
		 WHERE datistemplate = false AND datallowconn = true
		 ORDER BY datname`)
	if err != nil {
		return nil, fmt.Errorf("cacah pg_database: %w", err)
	}
	defer rows.Close()
	var nama []string
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			return nil, fmt.Errorf("baca datname: %w", err)
		}
		nama = append(nama, n)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("cacah pg_database: %w", err)
	}
	return nama, nil
}

// ServerInstans adalah hasil membuka satu instans tambahan.
type ServerInstans struct {
	Basis       []string
	VersiServer int
	Pendump     Pendump
}

// PembukaInstans membuka satu instans tambahan: membaca `pg_database`-nya dan
// menyiapkan pendump yang menyambung ke server ITU. Galatnya menjadi
// `InstansGagal`, bukan galat putaran.
type PembukaInstans func(ctx context.Context, ins Instans) (*ServerInstans, error)

// Daftar mencacah basis data yang akan dicadangkan, di semua instans.
func Daftar(
	ctx context.Context, kendali Kueri, namaKendali string, buka PembukaInstans,
) (*Cacah, error) {
	bawaan, err := BasisDiServer(ctx, kendali)
	if err != nil {
		return nil, err
	}
	reg, err := BacaRegistry(ctx, kendali)
	if err != nil {
		return nil, err
	}
	server := map[string]*ServerInstans{}
	gagal := map[string]string{}
	for _, ins := range reg.Instans {
		s, err := buka(ctx, ins)
		if err != nil {
			gagal[ins.Kunci] = err.Error()
			continue
		}
		server[ins.Kunci] = s
	}
	return Rakit(namaKendali, reg, bawaan, server, gagal), nil
}

// Rakit menyusun pencacahan dari bacaan yang sudah ada. Murni — diuji tanpa
// satu server pun.
func Rakit(
	namaKendali string,
	reg *Registry,
	bawaan []string,
	server map[string]*ServerInstans,
	gagal map[string]string,
) *Cacah {
	// Perusahaan per instans ("" = bawaan).
	milik := map[string]map[string]int32{"": {}}
	for _, i := range reg.Instans {
		milik[i.Kunci] = map[string]int32{}
	}
	tanpaInstans := map[string][]string{}
	for _, p := range reg.Perusahaan {
		m, ada := milik[p.Instans]
		if !ada {
			// FK menolak keadaan ini; bila tetap terjadi, ia GAGAL, bukan
			// diam-diam dicari di server bawaan.
			tanpaInstans[p.Instans] = append(tanpaInstans[p.Instans], p.Basis)
			continue
		}
		m[p.Basis] = p.ID
	}

	c := &Cacah{}
	c.Basis, c.Hilang = rakitServer("", bawaan, namaKendali, milik[""])

	kunci := make([]string, 0, len(reg.Instans))
	for _, i := range reg.Instans {
		kunci = append(kunci, i.Kunci)
	}
	sort.Strings(kunci)
	for _, k := range kunci {
		if sebab, ada := gagal[k]; ada {
			c.Gagal = append(c.Gagal, InstansGagal{Kunci: k, Sebab: sebab, Basis: urutKunci(milik[k])})
			continue
		}
		s := server[k]
		if s == nil {
			c.Gagal = append(c.Gagal, InstansGagal{
				Kunci: k, Sebab: "instans tidak dibuka", Basis: urutKunci(milik[k]),
			})
			continue
		}
		basis, hilang := rakitServer(k, s.Basis, "", milik[k])
		c.Basis = append(c.Basis, basis...)
		c.Hilang = append(c.Hilang, hilang...)
		c.Instans = append(c.Instans, InstansTercacah{Kunci: k, VersiServer: s.VersiServer, Pendump: s.Pendump})
	}
	for k, nama := range tanpaInstans {
		sort.Strings(nama)
		c.Gagal = append(c.Gagal, InstansGagal{
			Kunci: k, Sebab: "instans tidak ada di db_instances", Basis: nama,
		})
	}
	sort.SliceStable(c.Gagal, func(a, b int) bool { return c.Gagal[a].Kunci < c.Gagal[b].Kunci })
	return c
}

// rakitServer memberi peran pada basis data satu server dan mencari PT
// terdaftar di instans itu yang tidak ada di servernya.
func rakitServer(
	instans string, namaServer []string, namaKendali string, perusahaan map[string]int32,
) ([]Basis, []string) {
	adaDiServer := map[string]bool{}
	var basis []Basis
	for _, nama := range namaServer {
		adaDiServer[nama] = true
		b := Basis{Nama: nama, Peran: perankan(nama, instans, namaKendali, perusahaan), Instans: instans}
		if id, ada := perusahaan[nama]; ada {
			salinan := id
			b.CompanyID = &salinan
		}
		basis = append(basis, b)
	}
	var hilang []string
	for nama := range perusahaan {
		if adaDiServer[nama] {
			continue
		}
		if instans != "" {
			nama += "@" + instans
		}
		hilang = append(hilang, nama)
	}
	sort.Strings(hilang)
	return basis, hilang
}

func urutKunci(m map[string]int32) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// perankan memberi label pada sebuah basis data.
//
// Labelnya untuk MANUSIA yang membaca manifest pada hari pemulihan — ia tidak
// mengubah apa pun yang didump. `other` sengaja ada dan sengaja TIDAK
// dikecualikan: basis data yang tidak kita kenali tetap dicadangkan, sebab
// daftar yang membuang "yang kelihatannya bukan milik kita" adalah daftar yang
// akan membuang basis data sebuah PT pada hari seseorang menamainya di luar
// pola.
//
// `control` dan `platform` hanya hidup di instans bawaan; basis data bernama
// sama di instans lain berperan `other`.
func perankan(nama, instans, namaKendali string, perusahaan map[string]int32) Peran {
	switch {
	case instans == "" && nama == namaKendali:
		return PeranKendali
	case instans == "" && nama == "sai_platform":
		return PeranPlatform
	default:
		if _, ada := perusahaan[nama]; ada {
			return PeranPerusahaan
		}
		return PeranLain
	}
}
