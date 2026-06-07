/**
 * dijkstra.js
 * Implementasi algoritma Dijkstra untuk mencari rute terpendek
 * dari satu titik ke semua titik lain di dalam graf.
 *
 * Yang bikin implementasi ini lebih cepat dari versi polos O(V²):
 * kita pakai Min-Heap sebagai priority queue, sehingga kompleksitasnya
 * jadi O(E log V) — jauh lebih efisien untuk peta yang punya banyak edge.
 *
 * Kontributor: Ridho Ramadhani (Algorithm Developer)
 */

/**
 * ============================================================
 * MIN-HEAP (Priority Queue berbasis binary heap)
 * ============================================================
 *
 * Min-Heap adalah struktur data pohon biner di mana node paling
 * atas selalu berisi nilai terkecil. Kita pakai ini supaya
 * Dijkstra bisa ambil node dengan jarak terpendek dalam O(log n),
 * bukan O(n) kalau pakai array biasa.
 *
 * Cara kerjanya:
 * - push(): masukin elemen baru di akhir, lalu "naikan" (bubble up)
 *   ke posisi yang tepat supaya parent selalu lebih kecil dari child
 * - pop(): ambil elemen terkecil (paling atas), tukar dengan elemen
 *   terakhir, hapus yang terakhir, lalu "turunkan" (sink down)
 *   supaya urutan heap tetap valid
 *
 * Semua operasi ini O(log n) karena tinggi pohon = log(n).
 */
class MinHeap {
  constructor() {
    this.heap = [];  // array internal, indeks 0 = elemen terkecil
  }

  push(item) {
    this.heap.push(item);
    this._bubbleUp(this.heap.length - 1);  // naikan ke posisi yang bener
  }

  pop() {
    const top = this.heap[0];       // simpan elemen terkecil dulu
    const last = this.heap.pop();    // ambil elemen paling akhir
    // kalau masih ada isi, tukar elemen terakhir ke posisi atas
    // lalu turunkan ke posisi yang tepat
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  get size() { return this.heap.length; }

  /**
   * _bubbleUp(i)
   * Naikan elemen di indeks i ke atas sampai parent-nya lebih kecil
   * atau sudah sampai puncak. Dipanggil setelah push().
   *
   * Rumus parent dari node i: Math.floor((i-1) / 2)
   */
  _bubbleUp(i) {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      // Kalau parent sudah lebih kecil atau sama, posisi sudah benar
      if (this.heap[parent].dist <= this.heap[i].dist) break;
      // Tukar posisi dengan parent
      [this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]];
      i = parent;  // lanjut cek ke atas
    }
  }

  /**
   * _sinkDown(i)
   * Turunkan elemen di indeks i ke bawah sampai kedua child-nya lebih
   * besar atau sudah jadi daun. Dipanggil setelah pop().
   *
   * Child kiri dari node i: 2*i + 1
   * Child kanan dari node i: 2*i + 2
   */
  _sinkDown(i) {
    const n = this.heap.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      // Cari anak yang paling kecil di antara i, left, right
      if (left < n && this.heap[left].dist < this.heap[smallest].dist) smallest = left;
      if (right < n && this.heap[right].dist < this.heap[smallest].dist) smallest = right;
      // Kalau i sudah yang terkecil, posisi sudah benar
      if (smallest === i) break;
      // Tukar dengan anak yang terkecil
      [this.heap[smallest], this.heap[i]] = [this.heap[i], this.heap[smallest]];
      i = smallest;  // lanjut turun
    }
  }
}

/**
 * ============================================================
 * DIJKSTRA
 * ============================================================
 *
 * dijkstra(graph, startId)
 *
 * Mencari jarak terpendek dari startId ke semua node lain di graf.
 * Hasilnya adalah dua Map:
 *  - dist: jarak terpendek dari start ke tiap node
 *  - prev: node sebelumnya di jalur terpendek (untuk backtracking)
 *
 * Cara kerjanya step by step:
 *  1. Set semua jarak ke Infinity, kecuali start = 0
 *  2. Masukkan start ke priority queue dengan dist 0
 *  3. Ambil node dengan dist terkecil dari queue (node u)
 *  4. Kalau dist yang diambil sudah usang (ada yang lebih kecil
 *     sudah diproses), skip — ini trik lazy deletion
 *  5. Untuk tiap tetangga v dari u:
 *     hitung dist baru = dist[u] + bobot(u→v)
 *     kalau lebih kecil dari dist[v] yang tersimpan, update dan push
 *  6. Ulangi sampai queue kosong
 *
 * Kenapa pakai "prev"? Supaya kita bisa lacak balik jalurnya nanti.
 * Misal prev[5]=3, prev[3]=1, prev[1]=0 → artinya jalur: 0→1→3→5
 *
 * @param   {Map}    graph    Adjacency list hasil buildGraph()
 * @param   {number} startId  ID node titik asal
 * @returns {{ dist: Map<id,number>, prev: Map<id,id|null> }}
 */
export function dijkstra(graph, startId) {
  const dist = new Map();   // jarak terpendek dari start ke tiap node
  const prev = new Map();   // node sebelumnya di jalur terpendek
  const pq = new MinHeap();

  // Inisialisasi: semua jarak tak hingga, belum ada jalur
  for (const id of graph.keys()) {
    dist.set(id, Infinity);
    prev.set(id, null);
  }

  // Node awal jarak 0 dari dirinya sendiri
  dist.set(startId, 0);
  pq.push({ id: startId, dist: 0 });

  while (pq.size > 0) {
    const { id: u, dist: d } = pq.pop();

    // Skip kalau entry ini sudah ketinggalan zaman —
    // ada versi yang lebih baru dan lebih pendek yang sudah diproses
    if (d > dist.get(u)) continue;

    // Coba perbarui jarak ke semua tetangga dari u
    for (const { to: v, weight } of graph.get(u)) {
      const alt = dist.get(u) + weight;   // jarak kandidat via u
      if (alt < dist.get(v)) {
        // Ketemu jalur lebih pendek, update!
        dist.set(v, alt);
        prev.set(v, u);          // catat: ke v lewat u
        pq.push({ id: v, dist: alt });
      }
    }
  }

  return { dist, prev };
}
