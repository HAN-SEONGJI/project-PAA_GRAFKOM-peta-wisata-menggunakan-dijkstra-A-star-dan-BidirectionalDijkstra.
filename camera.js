/**
 * camera.js
 * Ngurus sistem kamera untuk peta — zoom in/out dan geser peta (pan).
 *
 * Konsep dasarnya: peta kita punya dua sistem koordinat:
 *  - World Space: koordinat asli node dan jalan di peta (misal x:340, y:700)
 *  - Screen Space: koordinat piksel di layar yang dilihat user
 *
 * Kamera yang ngatur "jendela pandang" — bagian mana dari world yang
 * terlihat di layar, dan seberapa besar/kecil peta ditampilkan.
 * Semua transformasi gambar ke canvas pakai matrix dari kamera ini.
 *
 * Kontributor: Salma Nursafira (Input & State Manager)
 */

export class Camera {
  constructor(canvasW, canvasH) {
    this.canvasW = canvasW;    // lebar canvas dalam piksel
    this.canvasH = canvasH;    // tinggi canvas dalam piksel

    // Titik world yang ada di tengah layar saat ini
    this.x = 1000;
    this.y = 900;

    // Level zoom saat ini (1.0 = 100%, 0.5 = setengah, 2.0 = dua kali)
    // Default 0.4 supaya peta besar bisa terlihat sebagian besar
    this.zoom    = 0.4;
    this.minZoom = 0.15;   // paling jauh yang boleh di-zoom out
    this.maxZoom = 4.0;    // paling dekat yang boleh di-zoom in

    // State untuk drag/pan — nyimpen posisi mouse saat mulai drag
    // dan posisi kamera saat itu supaya bisa hitung delta perpindahan
    this._drag  = false;
    this._dragS = { x: 0, y: 0 };   // posisi mouse saat mousedown
    this._camS  = { x: 0, y: 0 };   // posisi kamera saat mousedown
  }

  /**
   * applyTransform(ctx)
   *
   * Terapkan matrix transformasi kamera ke canvas context sebelum
   * menggambar apapun. Semua gambar setelah ini akan pakai koordinat
   * world space, dan canvas yang ngurus konversinya ke screen.
   *
   * Rumus transformasi:
   *   screenX = (worldX - cam.x) * zoom + canvasW/2
   *   screenY = (worldY - cam.y) * zoom + canvasH/2
   *
   * Atau dalam bentuk matrix setTransform(a,b,c,d,e,f):
   *   a = zoom (skala x)
   *   d = zoom (skala y)
   *   e = canvasW/2 - cam.x * zoom  (offset x)
   *   f = canvasH/2 - cam.y * zoom  (offset y)
   *
   * Ini dipanggil di awal tiap frame render, sebelum drawScene().
   */
  applyTransform(ctx) {
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(
      this.zoom * dpr, 0,
      0, this.zoom * dpr,
      (this.canvasW / 2 - this.x * this.zoom) * dpr,
      (this.canvasH / 2 - this.y * this.zoom) * dpr
    );
  }

  /**
   * screenToWorld(sx, sy)
   *
   * Balik dari koordinat layar ke koordinat world.
   * Ini kebalikan dari applyTransform() — dipakai saat user klik
   * di canvas dan kita perlu tahu node mana yang diklik.
   *
   * Rumus invers dari transformasi di atas:
   *   worldX = (screenX - canvasW/2) / zoom + cam.x
   *   worldY = (screenY - canvasH/2) / zoom + cam.y
   */
  screenToWorld(sx, sy) {
    return {
      x: (sx - this.canvasW / 2) / this.zoom + this.x,
      y: (sy - this.canvasH / 2) / this.zoom + this.y,
    };
  }

  /**
   * zoomAt(delta, sx, sy)
   *
   * Zoom in atau out, tapi dengan mempertahankan posisi titik yang
   * sedang ditunjuk kursor. Tanpa ini, setiap zoom akan "lompat" karena
   * titik tengah layar berubah relatif terhadap peta.
   *
   * Caranya:
   *  1. Hitung koordinat world dari titik kursor SEBELUM zoom berubah
   *  2. Ubah level zoom
   *  3. Hitung posisi kamera baru supaya titik world yang sama masih
   *     ada di posisi kursor yang sama di layar
   *
   * delta positif = scroll ke atas = zoom in (faktor 1.12)
   * delta negatif = scroll ke bawah = zoom out (faktor 0.9)
   * Zoom selalu di-clamp antara minZoom dan maxZoom.
   */
  zoomAt(delta, sx, sy) {
    const factor  = delta > 0 ? 1.12 : 0.9;
    const newZoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));

    // Simpan titik world yang ada di bawah kursor sebelum zoom berubah
    const wx = (sx - this.canvasW / 2) / this.zoom + this.x;
    const wy = (sy - this.canvasH / 2) / this.zoom + this.y;

    // Update zoom
    this.zoom = newZoom;

    // Sesuaikan posisi kamera supaya titik world tadi masih di tempat yang sama
    this.x = wx - (sx - this.canvasW / 2) / this.zoom;
    this.y = wy - (sy - this.canvasH / 2) / this.zoom;
  }

  /**
   * onMouseDown, onMouseMove, onMouseUp
   *
   * Handler untuk drag (klik tahan + geser) buat pan/scroll peta.
   * Simpel: catat posisi mouse dan kamera saat mulai drag,
   * lalu tiap frame hitung selisih posisi mouse dan geser kamera sebesar itu
   * (dibagi zoom supaya kecepatan pan konsisten di semua level zoom).
   */
  onMouseDown(sx, sy) {
    this._drag  = true;
    this._dragS = { x: sx, y: sy };      // posisi awal mouse
    this._camS  = { x: this.x, y: this.y }; // posisi awal kamera
  }

  onMouseMove(sx, sy) {
    if (!this._drag) return;
    // Delta mouse dibagi zoom supaya kalau lagi zoom out, drag-nya
    // tidak terasa terlalu cepat
    this.x = this._camS.x - (sx - this._dragS.x) / this.zoom;
    this.y = this._camS.y - (sy - this._dragS.y) / this.zoom;
  }

  onMouseUp() { this._drag = false; }

  get isDragging() { return this._drag; }

  // Dipanggil saat window diresize supaya canvas yang baru tetap
  // pakai transformasi yang benar
  resize(w, h) { this.canvasW = w; this.canvasH = h; }
}
