/**
 * animator.js
 * Ngurus pergerakan kendaraan di atas rute hasil Dijkstra.
 * add origin
 *
 * Dua tantangan utama yang diselesaikan file ini:
 *  1. Kendaraan harus bergerak MULUS di atas jalan — bukan lompat
 *     langsung dari node ke node, tapi melengkung mengikuti kurva Bézier
 *  2. Kendaraan harus MENGHADAP ke arah yang benar — kalau belok kiri,
 *     tampilan mobil ikut miring ke kiri
 *
 * Cara kerjanya:
 * Rute dari Dijkstra adalah array node [{x,y,label}, ...].
 * Tiap pasangan node berturutan membentuk satu "segmen".
 * Di tiap segmen, kendaraan bergerak dari titik A ke titik B
 * dengan mengikuti kurva Bézier kuadratik, bukan garis lurus.
 *
 * Posisi di kurva dihitung pakai parameter t (0 sampai 1).
 * t=0 = masih di titik A, t=1 = sudah di titik B.
 * Tiap frame, t ditambah berdasarkan kecepatan dan panjang segmen
 * supaya kendaraan jalan dengan kecepatan konstan meski panjang
 * tiap segmen berbeda-beda.
 *
 * Selain itu, file ini juga nyimpen data real-time seperti jarak
 * yang sudah ditempuh, kecepatan, ETA, dll. untuk info panel kanan.
 *
 * Kontributor: Sarah Fauziah (Route Reconstruction Specialist)
 */

import { getCubicControlPoints } from "./renderer.js";

// ─── SPRITE KENDARAAN ─────────────────────────────────────────────
// Load gambar car.png dari folder assets pas file ini pertama diload.
// Kalau berhasil, gambar mobil asli yang ditampilkan.
// Kalau gagal (misal file tidak ada), pakai gambar geometris sebagai fallback.


// ─── BEZIER POINT ─────────────────────────────────────────────────

/**
 * cubicBezierPoint(p0, cp1, cp2, p3, t)
 *
 * Ngitung posisi dan sudut kendaraan di kurva Bézier kubik
 * pada parameter t (0 = di p0, 1 = di p3).
 */
function cubicBezierPoint(p0, cp1, cp2, p3, t) {
  const mt = 1 - t;
  
  // Posisi di kurva
  const x = mt*mt*mt*p0.x + 3*mt*mt*t*cp1.x + 3*mt*t*t*cp2.x + t*t*t*p3.x;
  const y = mt*mt*mt*p0.y + 3*mt*mt*t*cp1.y + 3*mt*t*t*cp2.y + t*t*t*p3.y;
  
  // Arah gerak (turunan pertama) → untuk rotasi kendaraan
  const dx = 3*mt*mt*(cp1.x - p0.x) + 6*mt*t*(cp2.x - cp1.x) + 3*t*t*(p3.x - cp2.x);
  const dy = 3*mt*mt*(cp1.y - p0.y) + 6*mt*t*(cp2.y - cp1.y) + 3*t*t*(p3.y - cp2.y);
  
  return { x, y, angle: Math.atan2(dy, dx) };
}

// Panjang jejak (trail) yang tertinggal di belakang kendaraan — 32 titik
const TRAIL_MAX = 32;

// ─── CLASS ANIMATOR ───────────────────────────────────────────────

export class Animator {
  /**
   * constructor(coordPath, speed)
   *
   * @param {Array<{x,y,label}>} coordPath  Rute sebagai koordinat world,
   *                                         hasil pathToCoords() dari pathTracker
   * @param {number}             speed       Kecepatan dalam piksel per detik
   */
  constructor(coordPath, speed = 130) {
    this.path  = coordPath;
    this.speed = speed;

    // Posisi kendaraan di dalam rute
    this.segmentIndex = 0;   // sedang di segmen ke berapa (antara path[i] dan path[i+1])
    this.t = 0;              // posisi di dalam segmen ini (0.0 s/d 1.0)

    this.running = false;    // true = sedang jalan, false = pause/belum mulai
    this.done    = false;    // true = sudah sampai tujuan

    // Posisi dan orientasi kendaraan yang ditampilkan di canvas
    this.x     = coordPath[0]?.x ?? 0;
    this.y     = coordPath[0]?.y ?? 0;
    this.angle = 0;   // sudut rotasi dalam radian, 0 = menghadap kanan

    this._trail = [];  // array posisi terakhir untuk efek jejak

    // ── Data yang di-expose ke info panel (diupdate tiap frame) ──
    this.distanceTraveled = 0;   // total jarak yang sudah ditempuh (px)
    this.totalDistance    = 0;   // total panjang seluruh rute (px)
    this.progressPct      = 0;   // persentase kemajuan 0-100
    this.elapsedSec       = 0;   // waktu berjalan dalam detik
    this.currentSpeedPx   = 0;   // kecepatan aktual (rolling average, px/detik)
    this.currentSegLabel  = "";  // nama segmen aktif, misal "Gerbang → Wahana"
    this.distToGoal       = 0;   // sisa jarak ke tujuan (px)

    // ── Pra-hitung panjang tiap segmen ──────────────────────────
    // Kenapa perlu ini? Karena kita mau kecepatan kendaraan konsisten
    // dalam px/detik, bukan dalam "satuan t per detik".
    // Kalau segmen panjang, t naik pelan. Kalau pendek, t naik cepat.
    // Dengan tau panjang segmen, kita bisa hitung berapa t harus naik
    // per frame: dtNorm = (dt * speed) / panjangSegmen
    //
    // Panjang kurva Bézier diaproximasi dengan sampling 20 titik
    // dan jumlah jarak antar titik-titik itu.
    this._segLen = [];
    for (let i = 0; i < coordPath.length - 1; i++) {
      const a = coordPath[i], b = coordPath[i + 1];
      const { p, cp1, cp2, q, isReversed } = getCubicControlPoints(a, b, 0.25);
      
      let len = 0;
      let prev = cubicBezierPoint(p, cp1, cp2, q, 0);
      for (let s = 1; s <= 20; s++) {
        const cur = cubicBezierPoint(p, cp1, cp2, q, s / 20);
        len += Math.sqrt((cur.x - prev.x) ** 2 + (cur.y - prev.y) ** 2);
        prev = cur;
      }
      this._segLen.push(len);
    }

    // Total panjang seluruh rute = jumlah semua segmen
    this.totalDistance = this._segLen.reduce((s, v) => s + v, 0);
    this.distToGoal    = this.totalDistance;

    // Jarak kumulatif dari awal rute sampai awal tiap segmen
    // Contoh: segLen = [100, 150, 80] → cumLen = [0, 100, 250]
    // Ini untuk hitung distanceTraveled tanpa loop tiap frame
    this._cumLen = [];
    let acc = 0;
    for (const l of this._segLen) { this._cumLen.push(acc); acc += l; }

    // Buffer kecepatan untuk rolling average (8 frame terakhir)
    // Rolling average bikin tampilan kecepatan di info panel tidak
    // loncat-loncat karena variasi antar frame
    this._speedBuf = [];
  }

  // Reset waktu berjalan saat start (bukan saat konstruksi)
  start()  { this.running = true; this.elapsedSec = 0; }
  pause()  { this.running = false; }
  toggle() { this.running = !this.running; }

  /**
   * reset()
   * Kembalikan kendaraan ke posisi awal rute tanpa bikin Animator baru.
   * Semua counter dan state dikembalikan ke nilai awal.
   */
  reset() {
    this.segmentIndex     = 0;
    this.t                = 0;
    this.running          = false;
    this.done             = false;
    this.x                = this.path[0]?.x ?? 0;
    this.y                = this.path[0]?.y ?? 0;
    this.angle            = 0;
    this._trail           = [];
    this.distanceTraveled = 0;
    this.progressPct      = 0;
    this.elapsedSec       = 0;
    this.currentSpeedPx   = 0;
    this.distToGoal       = this.totalDistance;
    this._speedBuf        = [];
  }

  /**
   * getETA()
   * Hitung estimasi waktu tersisa sampai tujuan dalam detik.
   * Caranya sederhana: sisa jarak dibagi kecepatan saat ini.
   * Return null kalau kendaraan masih diam (kecepatan < 1 px/detik)
   * supaya info panel tidak nampilin angka aneh di awal.
   */
  getETA() {
    if (this.currentSpeedPx < 1) return null;
    return this.distToGoal / this.currentSpeedPx;
  }

  /**
   * update(dt)
   *
   * Dipanggil tiap frame dari render loop di main.js.
   * dt = delta time dalam detik (waktu sejak frame sebelumnya).
   *
   * Yang dikerjakan per frame:
   *  1. Hitung berapa t harus naik (= kecepatan / panjang segmen)
   *  2. Update posisi kendaraan di kurva Bézier
   *  3. Kalau t sudah >= 1, pindah ke segmen berikutnya
   *  4. Update semua data real-time (jarak, kecepatan, progress, dll.)
   */
  update(dt) {
    if (!this.running || this.done) return;

    const i = this.segmentIndex;
    if (i >= this.path.length - 1) {
      // Sudah lewat segmen terakhir, tandai selesai
      this.done = true; this.running = false; return;
    }

    const a  = this.path[i], b = this.path[i + 1];
    const { p, cp1, cp2, q, isReversed } = getCubicControlPoints(a, b, 0.25);
    const len = this._segLen[i];

    // Naikan t sebanding dengan kecepatan dan berbanding terbalik
    // dengan panjang segmen — ini yang bikin kecepatan konstan
    const dtNorm = len > 0 ? (dt * this.speed) / len : 1;
    this.t += dtNorm;

    // Tambah waktu berjalan
    this.elapsedSec += dt;

    // Hitung jarak yang sudah ditempuh dari awal rute
    // cumLen[i] = jarak dari awal rute sampai awal segmen i
    // t * len = jarak di dalam segmen i yang sudah ditempuh
    this.distanceTraveled = Math.min(
      this._cumLen[i] + this.t * len,
      this.totalDistance
    );
    this.distToGoal  = Math.max(0, this.totalDistance - this.distanceTraveled);
    this.progressPct = this.totalDistance > 0
      ? (this.distanceTraveled / this.totalDistance) * 100 : 0;

    // Update rolling average kecepatan (jarak frame ini / dt = px/detik)
    // Rolling average biar tampilan tidak loncat-loncat
    const frameDist = dt * this.speed;
    this._speedBuf.push(frameDist / dt);
    if (this._speedBuf.length > 8) this._speedBuf.shift();
    this.currentSpeedPx = this._speedBuf.reduce((s, v) => s + v, 0) / this._speedBuf.length;

    // Nama segmen aktif untuk info panel ("NodeA → NodeB")
    this.currentSegLabel = `${this.path[i].label} → ${this.path[i + 1].label}`;

    // Kalau t sudah melewati 1.0, kendaraan sudah selesai di segmen ini
    // Reset t dan pindah ke segmen berikutnya
    if (this.t >= 1) {
      this.t = 0;
      this.segmentIndex++;
      if (this.segmentIndex >= this.path.length - 1) {
        // Sudah di segmen terakhir dan selesai → snap ke posisi tujuan persis
        this.x = b.x; this.y = b.y;
        this.distanceTraveled = this.totalDistance;
        this.distToGoal = 0; this.progressPct = 100;
        this.done = true; this.running = false; return;
      }
    }

    // Ambil posisi dan sudut di kurva pada t saat ini
    const activeT = Math.min(this.t, 1);
    const evalT = isReversed ? 1 - activeT : activeT;
    const pos = cubicBezierPoint(p, cp1, cp2, q, evalT);
    
    // Kalau reversed, arah angle dibalik
    this.x     = pos.x;
    this.y     = pos.y;
    this.angle = isReversed ? pos.angle + Math.PI : pos.angle;

    // Simpan posisi ke buffer jejak
    this._trail.push({ x: this.x, y: this.y });
    if (this._trail.length > TRAIL_MAX) this._trail.shift();
  }

  /**
   * draw(ctx)
   *
   * Gambar jejak kendaraan dan kendaraan itu sendiri ke canvas.
   * Dipanggil di render loop setelah drawScene() supaya kendaraan
   * muncul di atas semua elemen peta.
   *
   * Jejak (trail) digambar sebagai garis yang makin transparan dan
   * makin tipis ke belakang — efek visual "bekas roda".
   *
   * Kendaraan digambar dengan ctx.rotate(this.angle) supaya
   * otomatis menghadap ke arah yang tepat sesuai kurva jalan.
   */
  draw(ctx) {
    if (!this.path.length) return;

    // ── Gambar jejak ──
    if (this._trail.length >= 2) {
      ctx.save();
      for (let i = 1; i < this._trail.length; i++) {
        // Makin ke depan (index besar) = makin pekat dan tebal
        const alpha = (i / this._trail.length) * 0.45;
        const width = (i / this._trail.length) * 5;
        ctx.strokeStyle = `rgba(245,158,11,${alpha.toFixed(2)})`;
        ctx.lineWidth   = width;
        ctx.lineCap     = "round";
        ctx.beginPath();
        ctx.moveTo(this._trail[i - 1].x, this._trail[i - 1].y);
        ctx.lineTo(this._trail[i].x,     this._trail[i].y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ── Gambar kendaraan ──
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);  // putar sesuai arah gerak

    if (_spr.car) {
      // Pakai gambar sprite car.png — 36x24px, dibuat menghadap kanan (angle 0)
      const W = 36, H = 24;
      ctx.drawImage(_spr.car, -W / 2, -H / 2, W, H);
    } else {
      // Fallback geometris kalau sprite gagal load —
      // terdiri dari bayangan, badan, kaca, dan 4 roda
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath(); ctx.ellipse(2, 3, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#f59e0b";
      ctx.beginPath(); ctx.roundRect(-13, -8, 26, 16, 4); ctx.fill();
      ctx.fillStyle = "rgba(15,23,42,0.7)";
      ctx.beginPath(); ctx.roundRect(2, -6, 9, 12, 2); ctx.fill();
      ctx.fillStyle = "#1e293b";
      [[-8, -9], [6, -9], [-8, 9], [6, 9]].forEach(([wx, wy]) => {
        ctx.beginPath(); ctx.ellipse(wx, wy, 3, 3, 0, 0, Math.PI * 2); ctx.fill();
      });
    }

    ctx.restore();
  }
}
