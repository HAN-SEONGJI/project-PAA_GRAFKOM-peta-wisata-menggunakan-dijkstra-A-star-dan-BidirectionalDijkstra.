/**
 * graph.js
 * File ini bertanggung jawab buat nyiapin struktur data graf sebelum
 * algoritma Dijkstra jalan. Intinya ada 3 hal yang dikerjakan di sini:
 *  1. Ngitung jarak antar dua titik (bobot edge) pakai rumus Euclidean
 *  2. Bikin adjacency list — struktur data yang nyimpen "siapa tetangga siapa"
 *  3. Ngecek apakah semua lokasi di peta bisa dicapai (tidak ada yang terisolasi)
 *
 * Kontributor: Muhamad Agus Farhan Talib (Data Architect)
 */

/**
 * euclidean(a, b)
 *
 * Ngitung jarak lurus antara dua titik koordinat di peta.
 * Rumusnya dari Pythagoras: jarak = akar( (x2-x1)² + (y2-y1)² )
 * Kenapa pakai Euclidean? Karena koordinat node kita pakai piksel layar,
 * dan jarak piksel yang paling masuk akal ya jarak garis lurus.
 * Ini yang nanti jadi bobot (weight) tiap edge di graf.
 *
 * Contoh: titik A (0,0) ke B (3,4) → jaraknya 5 piksel.
 */
export function euclidean(a, b) {
  const dx = b.x - a.x;  // selisih horizontal
  const dy = b.y - a.y;  // selisih vertikal
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * buildGraph(nodes, edges)
 *
 * Bikin adjacency list dari array nodes dan edges yang kita punya.
 * Adjacency list itu intinya Map di mana key-nya id node,
 * value-nya array berisi daftar tetangga beserta jaraknya.
 *
 * Contoh hasilnya:
 *   0 → [{to: 1, weight: 250.3}, {to: 2, weight: 180.0}]
 *   1 → [{to: 0, weight: 250.3}, {to: 3, weight: 95.5}]
 *   dst...
 *
 * Kenapa pakai Map bukan array biasa? Supaya lookup O(1) dan
 * lebih aman kalau node id-nya tidak mulai dari 0 atau tidak berurutan.
 *
 * Graf kita undirected (dua arah) — kalau A terhubung ke B,
 * otomatis B juga terhubung ke A dengan bobot yang sama.
 */
export function buildGraph(nodes, edges) {
  const graph = new Map();

  // Inisialisasi dulu semua node dengan array kosong
  // supaya tidak error saat Dijkstra coba akses node yang belum punya tetangga
  for (const node of nodes) {
    graph.set(node.id, []);
  }

  // Tiap edge [a, b] kita masukkan dua arah ke adjacency list
  // Bobot dihitung otomatis dari jarak Euclidean koordinat kedua node
  for (const [a, b] of edges) {
    const w = euclidean(nodes[a], nodes[b]);
    graph.get(a).push({ to: b, weight: w });
    graph.get(b).push({ to: a, weight: w });  // arah balik
  }

  return graph;
}

/**
 * isConnected(graph, startId)
 *
 * Ngecek apakah semua node di graf bisa dicapai dari startId.
 * Caranya pakai BFS (Breadth-First Search) — mulai dari startId,
 * terus kunjungi semua tetangga, tetangga dari tetangga, dst.
 *
 * Kalau di akhir jumlah node yang dikunjungi sama dengan total node
 * di graf, berarti semua lokasi terhubung dan tidak ada yang terisolasi.
 *
 * Ini penting banget untuk fitur Acak Peta — setelah peta digenerate
 * secara acak, kita harus pastiin tidak ada jalan buntu yang memisahkan
 * satu area dari area lain. Kalau ada node terisolasi, Dijkstra
 * tidak akan bisa nemuin rute ke sana.
 */
export function isConnected(graph, startId) {
  const visited = new Set([startId]);
  const queue   = [startId];

  while (queue.length > 0) {
    const current = queue.shift();
    for (const neighbor of graph.get(current)) {
      if (!visited.has(neighbor.to)) {
        visited.add(neighbor.to);
        queue.push(neighbor.to);
      }
    }
  }

  // Kalau semua node sudah dikunjungi, graf terhubung penuh
  return visited.size === graph.size;
}
