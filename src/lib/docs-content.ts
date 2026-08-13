/**
 * ISI dokumentasi sistem (issue #300) — prosa, bahasa Indonesia.
 *
 * ══ Kenapa terpisah dari `lib/docs.ts` ═════════════════════════════════════
 * `lib/docs.ts` ikut ke bundel PERAMBAN (menu Bantuan memutuskan tautan
 * kontekstualnya dari `usePathname()`). Prosa tidak dibutuhkan untuk keputusan
 * itu, dan berkas ini karena itu hanya diimpor halaman servernya. Yang menahan
 * keduanya tetap sejalan bukan disiplin melainkan `tsc`: `DOC_BLOCKS` bertipe
 * `Record<DocSlug, …>`, jadi halaman tanpa isi dan isi tanpa halaman sama-sama
 * ditolak sebelum dijalankan.
 *
 * ══ Aturan menulis di sini ═════════════════════════════════════════════════
 *  • **Kenapa dulu, langkah belakangan** (keputusan 5 issue #300). Urutan
 *    tombol menua setiap rilis; alasan tidak. Tanpa tangkapan layar.
 *  • **Jangan menulis ulang definisi istilah.** Kamus (`lib/labels.ts`, #21/#1)
 *    sudah memilikinya — pakai blok `istilah`, yang MEMBACANYA. Definisi yang
 *    disalin ke sini ditolak `tests/docs.test.ts`.
 *  • **Jangan mengetik daftar peran/izin.** Blok `matriks-izin` membangkitkan
 *    tabelnya dari `PERMISSION_ROLES`, dan halamannya menyebut dirinya BAWAAN
 *    yang bisa ditimpa (keputusan 4).
 *  • **Bahasa Indonesia**, dan pilihan itu ditampilkan kepada pembaca ber-`en`/
 *    `zh` sebagai pemberitahuan dalam bahasanya sendiri (keputusan 3), bukan
 *    dibiarkan terbaca sebagai terjemahan yang tertinggal.
 */

import type { DocSlug } from "@/lib/docs";
import type { TermKey } from "@/lib/labels";

/**
 * Blok prosa. Sengaja data bertipe, bukan Markdown:
 *
 *  • tanpa dependensi baru — repo ini tidak punya parser Markdown, dan menambah
 *    satu demi sepuluh halaman adalah harga yang salah;
 *  • `tsc` ikut memeriksa: `TermKey` yang salah ketik ditolak sebelum ia menjadi
 *    tautan mati, dan jenis blok baru tanpa cabang perender ditolak lewat
 *    `never` di `components/docs/doc-body.tsx`;
 *  • penjaga bisa MEMBACANYA tanpa merender apa pun.
 */
export type DocBlock =
  /** Satu paragraf. Satu gagasan; kalau butuh dua, tulis dua blok. */
  | { kind: "paragraf"; teks: string }
  /** Daftar berpoin — hal yang setara, bukan langkah berurutan. */
  | { kind: "poin"; butir: readonly string[] }
  /** Sub-judul di dalam halaman; jangkarnya diturunkan dari judulnya. */
  | { kind: "sub"; judul: string }
  /** Kotak "yang harus diketahui sebelum melanjutkan". */
  | { kind: "catatan"; teks: string }
  /**
   * Istilah dari kamus (#21/#1). Definisinya TIDAK ditulis di sini — perender
   * membacanya dari `TERMS` di `lib/labels.ts`, sumber yang sama yang dipakai
   * `<TermTooltip>` dan halaman `/glossary`.
   */
  | { kind: "istilah"; kunci: readonly TermKey[] }
  /** Matriks izin BAWAAN, dibangkitkan saat render (keputusan 4). */
  | { kind: "matriks-izin" };

const MESIN_AKUNTANSI: readonly DocBlock[] = [
    {
      kind: "paragraf",
      teks:
        "Aplikasi ini punya dua lapisan, dan hanya satu yang Anda lihat. Di permukaan ada formulir bahasa tugas: “Catat Penjualan”, “Terima Uang”, “Kurangi Stok”. Di bawahnya ada satu mesin akuntansi baku yang menerjemahkan setiap formulir itu menjadi jurnal — catatan berpasangan yang jumlah kiri dan kanannya selalu sama. Itulah arti “simple surface, standard engine”: permukaannya boleh ramah, tetapi angka yang keluar harus sama dengan angka yang diminta akuntan publik.",
    },
    {
      kind: "paragraf",
      teks:
        "Konsekuensinya nyata bagi Anda: satu formulir bisa menyentuh beberapa akun sekaligus, dan Anda tidak perlu memilih akunnya. Faktur penjualan senilai Rp 100 juta dengan PPN 11% tidak menambah “pendapatan Rp 111 juta” — ia menambah piutang Rp 111 juta, pendapatan Rp 100 juta, dan utang PPN Rp 11 juta. Sebelas juta itu bukan uang perusahaan; ia dititipkan untuk negara. Mesinnya yang tahu, bukan Anda.",
    },
    { kind: "sub", judul: "Kenapa jurnal dibalik, bukan dihapus" },
    {
      kind: "paragraf",
      teks:
        "Kalau sebuah transaksi salah, aplikasi ini tidak menghapus jurnalnya. Ia membuat jurnal BARU yang isinya kebalikan — debit menjadi kredit, kredit menjadi debit — sehingga saldonya kembali seperti sebelum transaksi itu ada. Jurnal aslinya tetap terbaca, dan pembatalnya tercatat di sebelahnya.",
    },
    {
      kind: "paragraf",
      teks:
        "Alasannya bukan kehati-hatian yang berlebihan, melainkan aritmetika. Setiap laporan yang pernah Anda cetak, kirim ke bank, atau lampirkan ke SPT dihitung dari jurnal pada hari itu. Kalau jurnalnya bisa hilang, laporan yang sudah keluar kehilangan sumbernya: tidak ada cara membuktikan angka yang Anda kirim bulan lalu pernah benar. Membalik menyimpan kedua kenyataan — yang pernah tercatat, dan yang berlaku sekarang.",
    },
    {
      kind: "poin",
      butir: [
        "Yang menghilang dari saldo adalah dampaknya, bukan catatannya.",
        "Tanggal jurnal pembalik adalah tanggal koreksinya, bukan tanggal transaksi aslinya — karena itulah laporan bulan lalu tidak berubah surut.",
        "Alasan pembatalan ikut disimpan; enam bulan kemudian ia satu-satunya yang bisa menjelaskan kenapa ada dua baris yang saling meniadakan.",
      ],
    },
    { kind: "sub", judul: "Daftar Akun bukan daftar kategori" },
    {
      kind: "paragraf",
      teks:
        "Daftar Akun (bagan akun) menentukan bentuk setiap laporan. Menambah akun berarti menambah baris di neraca atau laba/rugi; memindahkan sebuah akun ke tipe yang lain memindahkan angkanya antar-laporan. Karena itu halaman ini hanya terbuka untuk peran berakses penuh, dan hanya saat Mode Akuntan menyala — bukan karena isinya rahasia, melainkan karena kesalahan di sini tidak pernah tampak sebagai kesalahan; ia tampak sebagai laporan yang wajar dengan angka di tempat yang salah.",
    },
    { kind: "istilah", kunci: ["jurnal", "buku_besar", "akun_perkiraan"] },
  ];

const PERIODE: readonly DocBlock[] = [
    {
      kind: "paragraf",
      teks:
        "Menutup periode berarti menyatakan satu bulan SELESAI: sesudah itu tidak ada transaksi baru yang boleh mendarat di dalamnya, dan tidak ada transaksi lama di dalamnya yang boleh diubah. Aplikasi menolaknya di server, bukan menyembunyikan tombolnya — jadi penolakannya berlaku juga untuk impor, penyesuaian stok, dan setiap jalur yang belum terbayang saat halaman ini ditulis.",
    },
    {
      kind: "paragraf",
      teks:
        "Kenapa perlu: laporan bulanan diberikan kepada pihak luar — bank, pemegang saham, kantor pajak. Sekali angka itu keluar, ia menjadi janji. Tanpa kunci, sebuah faktur yang disimpan hari ini dengan tanggal dua bulan lalu akan mengubah laporan yang sudah dikirim, tanpa satu pun tanda di layar. Yang menemukannya bukan Anda, melainkan orang yang membandingkan dua salinan laporan yang seharusnya sama.",
    },
    { kind: "sub", judul: "Kalau ternyata ada yang salah di bulan terkunci" },
    {
      kind: "paragraf",
      teks:
        "Jawabannya sama dengan jawaban akuntansi sejak dulu: koreksi dicatat di bulan BERJALAN, bukan disisipkan mundur. Anda membuat transaksi baru bertanggal hari ini yang membetulkan dampaknya. Laporan bulan lalu tetap seperti yang sudah dikirim; laporan bulan ini memuat koreksinya, dan selisihnya bisa dijelaskan karena ada barisnya.",
    },
    {
      kind: "catatan",
      teks:
        "Membuka kembali periode yang sudah dikunci memang mungkin, dan sengaja dibuat merepotkan: ia kewenangan peran berakses penuh dan tercatat di jejak audit. Kalau sebuah bulan perlu dibuka dua kali, yang bermasalah biasanya bukan bulannya melainkan kapan ia ditutup.",
    },
    { kind: "istilah", kunci: ["tutup_periode", "saldo_awal"] },
  ];

const PERSETUJUAN: readonly DocBlock[] = [
    {
      kind: "paragraf",
      teks:
        "Aturan Persetujuan menetapkan ambang: di atas nominal tertentu, sebuah dokumen tidak langsung berlaku melainkan masuk antrean dan menunggu peran tertentu memutuskannya. Ambang dan peran penyetujunya di-SNAPSHOT saat pengajuan dibuat — mengubah aturan hari ini tidak mengubah siapa yang harus memutuskan pengajuan yang sudah berjalan.",
    },
    {
      kind: "paragraf",
      teks:
        "Yang tertahan adalah DAMPAKNYA, bukan pekerjaannya. Dokumennya tetap tersimpan, tetap bisa dibaca, tetap bisa diperbaiki. Yang belum terjadi adalah jurnalnya. Karena itu antrean yang menumpuk bukan sekadar ketidaknyamanan administratif: selama ia menumpuk, saldo yang Anda lihat belum memuat dokumen-dokumen itu.",
    },
    {
      kind: "poin",
      butir: [
        "Antrean terbuka untuk semua peran — penyetuju melihat yang harus ia putuskan, pemohon melihat kabar pengajuannya. Yang dibatasi adalah siapa yang boleh MEMUTUS.",
        "Penolakan bukan penghapusan: dokumennya kembali ke pemohon beserta catatan alasannya, dan bisa diajukan ulang.",
        "Menyetujui adalah tindakan yang mengikat dan tercatat namanya. Itu sebabnya keputusan diambil di dalam dialog konfirmasi, bukan dari satu ketukan di baris daftar.",
      ],
    },
  ];

const PENJUALAN: readonly DocBlock[] = [
    {
      kind: "paragraf",
      teks:
        "Satu penjualan melewati tiga peristiwa yang terjadi pada waktu berbeda, dan masing-masing mengubah hal yang berbeda. Kontrak adalah kesepakatan: belum ada uang, belum ada barang yang berpindah, dan belum ada satu pun jurnal. Tagihan penjualan adalah pengakuan bahwa Anda BERHAK atas uangnya: di sinilah piutang dan pendapatan lahir. Surat jalan adalah barangnya keluar: di sinilah stok berkurang.",
    },
    {
      kind: "paragraf",
      teks:
        "Menggabungkan ketiganya menjadi satu formulir akan terasa lebih sederhana selama seminggu dan salah selamanya sesudahnya. Ekspor komoditas hampir tidak pernah rapi: kontrak ditandatangani Januari, barang dikirim Maret dalam dua pengiriman, pembayaran datang April sebagian. Kalau ketiganya satu dokumen, Anda harus memilih satu tanggal untuk tiga peristiwa — dan laporan mana pun yang memakai tanggal itu akan salah untuk dua di antaranya.",
    },
    { kind: "sub", judul: "Kenapa Catat Penjualan tetap ada" },
    {
      kind: "paragraf",
      teks:
        "Untuk penjualan yang memang selesai sekaligus, wisaya “Catat Penjualan” mengisi ketiganya dalam satu jalan berpandu. Ia bukan jalur pintas yang melewati mesin — ia tetap membuat dokumen yang sama dan jurnal yang sama; yang dihemat hanya perpindahan halaman.",
    },
    { kind: "sub", judul: "Piutang dan retur" },
    {
      kind: "poin",
      butir: [
        "“Pelanggan Belum Bayar” bukan daftar terpisah yang Anda isi sendiri: ia adalah tagihan yang belum lunas, dihitung ulang setiap kali sebuah pembayaran dicatat.",
        "Retur tidak menghapus faktur aslinya. Ia dokumen tersendiri yang membalik sebagian dampaknya — persis alasan yang sama dengan jurnal pembalik.",
        "Valas menyimpan tiga angka sekaligus: mata uang, kurs, dan nilai rupiahnya. Tanpa ketiganya, laba selisih kurs tidak bisa dihitung, dan sebuah angka tanpa mata uang di aplikasi ekspor bisa terbaca tujuh belas ribu kali lebih besar dari yang dimaksud.",
      ],
    },
    { kind: "istilah", kunci: ["kontrak", "faktur", "surat_jalan", "piutang", "retur"] },
  ];

const STOK: readonly DocBlock[] = [
    {
      kind: "paragraf",
      teks:
        "Angka stok di layar bukan angka yang disimpan lalu diperbarui. Ia hasil penjumlahan seluruh mutasi: pembelian menambah, surat jalan mengurangi, retur mengembalikan, penyesuaian membetulkan. Itu sebabnya tidak ada kolom yang bisa Anda ketik ulang — mengetik ulang akan menghasilkan angka yang tidak bisa ditelusuri ke satu peristiwa pun.",
    },
    {
      kind: "paragraf",
      teks:
        "Alasannya bukan kerapian: persediaan adalah UANG di neraca. Menaikkan stok 10 ton berarti menaikkan aset perusahaan sebesar nilai 10 ton itu, dan nilai itu harus datang dari suatu tempat — pembelian, atau pengakuan bahwa sebelumnya kurang catat. Kartu Stok adalah tempat pertanyaan “dari mana angka ini” dijawab, baris per baris.",
    },
    { kind: "sub", judul: "Hitung ulang stok (opname) adalah pengakuan, bukan penimpaan" },
    {
      kind: "paragraf",
      teks:
        "Saat Anda menghitung fisik gudang dan hasilnya berbeda dari catatan, aplikasi tidak menimpa catatan dengan hasil hitungan. Ia mencatat SELISIHNYA sebagai penyesuaian berjurnal: stok bertambah atau berkurang, dan lawannya adalah akun selisih persediaan yang masuk ke laba/rugi. Selisih persediaan adalah biaya — barang yang susut, rusak, atau tidak pernah tercatat keluar — dan menyembunyikannya sebagai “koreksi angka” berarti menyembunyikan biaya.",
    },
    {
      kind: "catatan",
      teks:
        "Barang tanpa dasar biaya muncul sebagai “—”, tidak pernah sebagai nol. Nol berarti “gratis”, dan menjumlahkannya sebagai nol menyusutkan nilai persediaan tanpa satu pun tanda di layar. Jumlah baris yang dikecualikan selalu disebut di bawah tabelnya.",
    },
    { kind: "istilah", kunci: ["persediaan", "kartu_stok", "stok_opname"] },
  ];

const KAS: readonly DocBlock[] = [
    {
      kind: "paragraf",
      teks:
        "Buku Kas & Bank adalah catatan Anda: setiap uang masuk dan keluar yang sudah Anda catat. Rekening koran adalah catatan bank. Keduanya boleh berbeda, dan perbedaan yang wajar punya nama — cek yang belum dicairkan, transfer yang masuk sebelum Anda mencatatnya, biaya administrasi yang hanya bank tahu.",
    },
    {
      kind: "paragraf",
      teks:
        "Rekonsiliasi bukan menyamakan dua angka dengan mengubah salah satunya. Ia mencocokkan baris per baris, lalu menyisakan daftar hal yang belum bertemu pasangannya. Daftar sisa itulah hasil sebenarnya: setiap barisnya adalah pertanyaan yang punya jawaban — dan sebuah selisih yang tidak bisa dijelaskan baris per baris adalah selisih yang belum selesai, berapa pun kecilnya.",
    },
    {
      kind: "poin",
      butir: [
        "Yang dicocokkan adalah transaksi, bukan total. Dua kesalahan yang kebetulan saling meniadakan menghasilkan total yang cocok dan buku yang salah.",
        "Setelah sebuah periode rekonsiliasi dikunci, baris di dalamnya tidak lagi bisa dicocokkan ulang — alasannya sama dengan kunci periode.",
        "Biaya bank yang ditemukan saat mencocokkan tetap harus dicatat sebagai transaksi kas; ia beban, bukan penyesuaian angka.",
      ],
    },
    { kind: "istilah", kunci: ["kas_bank", "rekonsiliasi_bank"] },
  ];

const SALDO_AWAL: readonly DocBlock[] = [
    {
      kind: "paragraf",
      teks:
        "Perusahaan Anda tidak lahir pada hari aplikasi ini dipasang. Sudah ada uang di bank, pelanggan yang belum bayar, utang ke pemasok, dan barang di gudang. Saldo awal adalah cara memberi tahu mesinnya keadaan itu, sekali, sebagai satu jurnal bertanggal sehari sebelum Anda mulai.",
    },
    {
      kind: "paragraf",
      teks:
        "Kalau dilewati, tidak ada yang gagal — dan itu justru masalahnya. Aplikasi akan bekerja dengan sempurna di atas asumsi bahwa perusahaan Anda dimulai dari nol: laba bulan pertama akan terlihat luar biasa (karena penerimaan piutang lama tercatat sebagai pendapatan baru), neraca tidak akan seimbang dengan kenyataan, dan yang menemukannya adalah akuntan Anda beberapa bulan kemudian.",
    },
    {
      kind: "poin",
      butir: [
        "Saldo awal dimasukkan SEBELUM transaksi pertama. Sesudahnya ia masih bisa dibetulkan, tetapi setiap laporan yang sudah dicetak di antaranya salah.",
        "Piutang dan utang dimasukkan per pelanggan/pemasok, bukan sebagai satu total — kalau tidak, tidak ada yang bisa menjawab “siapa yang belum bayar”.",
        "Jumlah sisi kiri dan kanan harus sama. Selisihnya bukan untuk dibulatkan; ia berarti ada yang belum dihitung.",
      ],
    },
    { kind: "istilah", kunci: ["saldo_awal", "neraca"] },
  ];

const PERAN_IZIN: readonly DocBlock[] = [
    {
      kind: "paragraf",
      teks:
        "Akses di aplikasi ini tidak ditentukan oleh jabatan melainkan oleh IZIN: kalimat kecil seperti “melihat tagihan penjualan” atau “menulis jurnal manual”. Setiap peran memegang sekumpulan izin, dan setiap halaman maupun titik API menyebut izin yang dituntutnya. Itu sebabnya menyembunyikan sebuah menu tidak pernah dianggap pengamanan: yang menolak adalah server, pada permintaannya, bukan menu yang tidak digambar.",
    },
    {
      kind: "catatan",
      teks:
        "Tabel di bawah adalah BAWAAN — titik awal yang dibawa aplikasi, bukan keadaan perusahaan Anda. Dua hal membuatnya bergerak: setiap sel bisa ditimpa dari halaman Hak Akses (peran boleh diberi atau dicabut izin di luar bawaan ini), dan peran itu sendiri adalah data — Direktur Utama bisa membuat peran yang belum ada saat halaman ini ditulis. Yang berlaku di perusahaan Anda hanya terbaca dari dalam aplikasi, di halaman Hak Akses.",
    },
    { kind: "matriks-izin" },
    { kind: "sub", judul: "Dua lingkup yang tidak pernah bercampur" },
    {
      kind: "paragraf",
      teks:
        "Izin PERUSAHAAN menjawab “boleh apa di dalam buku PT ini” dan datang dari keanggotaan Anda di PT itu. Izin AKUN (tenant) menjawab pertanyaan yang harus terjawab justru ketika Anda belum punya satu pun PT: boleh membuat perusahaan baru, boleh menyentuh langganan, boleh mengundang orang. Keduanya sengaja tidak pernah dicampur — memaksa “boleh membuat perusahaan” lewat keanggotaan di sebuah perusahaan melahirkan ayam-dan-telur yang membuat pelanggan baru tidak pernah bisa mulai.",
    },
    { kind: "sub", judul: "Mode Akuntan bukan peran" },
    {
      kind: "paragraf",
      teks:
        "Jurnal, buku besar, dan daftar akun hanya muncul saat Mode Akuntan menyala. Itu SAKELAR TAMPILAN, bukan izin: mematikannya menyembunyikan permukaan yang membingungkan staf non-akuntan, tetapi tidak memberi siapa pun akses yang tidak ia punya, dan tidak mencabut akses siapa pun. Yang memutuskan tetap izinnya.",
    },
  ];

const PAKET: readonly DocBlock[] = [
    {
      kind: "paragraf",
      teks:
        "Satu akun pelanggan boleh memegang beberapa perusahaan (PT). Yang membedakan paket bukan “fitur mana yang dinyalakan” melainkan kuota: berapa perusahaan dan berapa pengguna yang boleh ada di dalamnya. Kuota diperiksa saat Anda menambah, bukan sebagai tagihan kejutan di akhir bulan.",
    },
    { kind: "sub", judul: "Kenapa setiap PT punya buku yang benar-benar terpisah" },
    {
      kind: "paragraf",
      teks:
        "Buku besar setiap PT hidup di basis datanya sendiri — bukan sebagai kolom “milik perusahaan mana” di dalam satu tabel bersama. Bedanya baru terasa pada kegagalan: dengan satu tabel bersama, sebuah kueri yang lupa menyaring perusahaan akan mengembalikan transaksi PT lain, dan tidak ada satu pun galat yang muncul. Dengan basis data terpisah, tidak ada yang bisa dikembalikan — jalur yang kehilangan konteks perusahaan GAGAL, keras, di tempat kejadiannya.",
    },
    {
      kind: "poin",
      butir: [
        "Yang berpindah saat Anda berganti perusahaan adalah seluruh buku, bukan sebuah penyaring. Nama PT yang sedang dibuka karena itu selalu terlihat di bilah atas.",
        "Pengguna, daftar perusahaan, dan keanggotaan tinggal di satu tempat bersama — orang yang sama boleh masuk ke beberapa PT dengan peran yang berbeda di masing-masing.",
        "Alamat setiap halaman memuat nama akun dan nama perusahaan, jadi tautan yang Anda salin selalu menunjuk buku yang sama saat dibuka orang lain.",
        "Nama perusahaan boleh diganti kapan saja; alamat pendeknya (slug) tidak — ia ikut menyusun nama basis datanya, dan setiap tautan yang pernah dibagikan berdiri di atasnya.",
      ],
    },
  ];

const DATA_ANDA: readonly DocBlock[] = [
    {
      kind: "paragraf",
      teks:
        "Seluruh pembukuan setiap PT Anda bisa diunduh sendiri, kapan saja, tanpa meminta kepada siapa pun. Itu keputusan yang sengaja: data pembukuan adalah milik Anda, dan hak untuk mengambilnya tidak boleh bergantung pada hubungan yang sedang baik dengan penyedia layanannya.",
    },
    {
      kind: "poin",
      butir: [
        "Ekspor tetap bekerja ketika langganan sedang tertunggak dan seluruh PT dalam keadaan hanya-baca. Justru dalam keadaan itulah ia paling dibutuhkan.",
        "Permintaan penghapusan akun adalah permintaan, bukan tombol yang langsung menghapus — ia mengakhiri kontrak, dan pelaksanaannya berjalan sebagai proses dengan tenggang waktu.",
        "Sebagian jejak audit tidak ikut terhapus melainkan dianonimkan. Catatan “siapa menyetujui pembayaran ini” adalah bagian dari pembukuan pihak lain juga, dan menghapusnya berarti melubangi buku yang masih harus dipertanggungjawabkan.",
      ],
    },
    {
      kind: "catatan",
      teks:
        "Naskah hukumnya — Syarat Layanan dan Kebijakan Privasi — berdiri sebagai halaman tersendiri dan bisa dibaca sebelum Anda menyetujuinya. Halaman ini menjelaskan mekanismenya di dalam produk; kalau keduanya berselisih, yang mengikat adalah naskah hukumnya.",
    },
  ];

/** Isi setiap halaman, dikunci pada daftar isi lewat `DocSlug`. */
const LAPORAN: readonly DocBlock[] = [
    {
      kind: "paragraf",
      teks:
        "Hampir setiap laporan di aplikasi ini menanyakan tanggal sebelum menampilkan satu angka pun, dan itu bukan formalitas. Buku besar bukan daftar saldo melainkan daftar KEJADIAN, masing-masing bertanggal. “Berapa laba saya” tidak punya jawaban sampai Anda menyebutkan sejak kapan sampai kapan — sama seperti “berapa jarak yang saya tempuh” tidak punya jawaban tanpa menyebut dari kapan dihitung.",
    },
    {
      kind: "paragraf",
      teks:
        "Karena itu ada dua jenis laporan, dan membedakannya adalah satu-satunya hal yang benar-benar perlu Anda hafal. Laporan PERIODE menjumlahkan apa yang terjadi di antara dua tanggal: Laba/Rugi, Arus Kas, Penjualan per Pelanggan. Laporan POSISI memotret keadaan pada SATU tanggal: Neraca, Neraca Saldo, Nilai Persediaan. Yang pertama bertanya “apa yang terjadi”, yang kedua bertanya “apa yang saya punya sekarang”.",
    },
    { kind: "sub", judul: "Kenapa laporan yang sama bisa memberi dua angka" },
    {
      kind: "paragraf",
      teks:
        "Kalau laporan yang Anda buka hari ini berbeda dengan salinan yang dicetak minggu lalu untuk periode yang sama, biasanya bukan aplikasinya yang berubah pikiran. Tiga sebab yang paling sering, semuanya wajar: ada transaksi baru yang dicatat mundur ke periode itu; ada dokumen yang tadinya menunggu persetujuan lalu jurnalnya terbit; atau periodenya memang belum ditutup, sehingga isinya memang masih boleh bertambah.",
    },
    {
      kind: "paragraf",
      teks:
        "Itulah hubungan antara halaman ini dan Tutup Buku. Selama sebuah bulan masih terbuka, laporannya adalah gambaran sementara — benar hari ini, dan boleh berubah besok. Menutup bulan mengubahnya menjadi angka yang tidak bisa bergerak lagi. Laporan yang diberikan kepada bank, pemegang saham, atau kantor pajak sebaiknya diambil dari bulan yang sudah ditutup.",
    },
    { kind: "sub", judul: "Angka di beranda dan angka di laporan" },
    {
      kind: "paragraf",
      teks:
        "Kartu di beranda dan laporan cetak bisa menyebut angka yang berbeda pada hari yang sama, dan keduanya benar. Beranda meringkas periode berjalan sampai detik ini; laporan menjawab persis periode yang Anda minta. Kalau keduanya harus cocok, samakan dulu periodenya — hampir semua selisih yang dilaporkan orang berakhir di sini.",
    },
    {
      kind: "poin",
      butir: [
        "Setiap laporan bisa diekspor ke PDF atau Excel, dan berkasnya memuat periode yang dipakai di kepala halaman — jadi salinan yang beredar tidak pernah kehilangan konteksnya.",
        "Nilai ditampilkan dalam IDR, yaitu nilai dasar buku besar. Transaksi valas sudah dikonversi memakai kurs yang tercatat pada dokumennya, bukan kurs hari ini.",
        "Pilahan per pusat biaya hanya ditawarkan pada Laba/Rugi. Neraca sengaja tidak: menyaring neraca per unit membuat sisi kiri dan kanannya tidak lagi seimbang, kecuali ada akun antar-unit yang menjembataninya.",
        "Realisasi vs Anggaran membaca angka realisasinya dari buku besar yang sama dengan Laba/Rugi — jadi kalau keduanya berbeda, yang berbeda adalah periodenya, bukan sumbernya.",
      ],
    },
    {
      kind: "catatan",
      teks:
        "Laporan tidak pernah menghitung ulang apa pun sendiri. Ia menjumlahkan jurnal yang sudah ada. Kalau sebuah angka terasa salah, yang perlu dicari bukan “rumusnya di mana” melainkan transaksi mana yang menyusunnya — dan setiap laporan bisa ditelusuri sampai ke barisnya.",
    },
    { kind: "istilah", kunci: ["laba_rugi", "neraca", "tutup_periode"] },
  ];

export const DOC_BLOCKS: Record<DocSlug, readonly DocBlock[]> = {
  "mesin-akuntansi": MESIN_AKUNTANSI,
  "periode-terkunci": PERIODE,
  "persetujuan": PERSETUJUAN,
  "alur-penjualan": PENJUALAN,
  "stok": STOK,
  "kas-dan-bank": KAS,
  "saldo-awal": SALDO_AWAL,
  "peran-dan-izin": PERAN_IZIN,
  "paket-dan-perusahaan": PAKET,
  "membaca-laporan": LAPORAN,
  "data-anda": DATA_ANDA,
};
