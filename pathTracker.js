/**
 * pathTracker.js
 * File ini ngurusin dua hal setelah Dijkstra selesai jalan:
 *  1. Ngerekonstruksi urutan node dari start ke goal (backtracking)
 *  2. Ngubah array ID node jadi array koordinat (x, y) buat animator
 *
 * Kenapa dipisah dari dijkstra.js? Karena Dijkstra tugasnya cuma
 * ngitung jarak dan nyimpen "prev" map. Gimana cara baca hasilnya
 * itu urusan file ini — biar tanggung jawabnya jelas.
 *
 * Kontributor: Sarah Fauziah (Route Reconstruction Specialist)
 */

/**
 * reconstructPath(prev, startId, goalId)
 *
 * Lacak balik jalur terpendek dari goalId ke startId
 * menggunakan map "prev" yang dihasilkan Dijkstra.
 *
 * Cara kerjanya:
 * Dijkstra nyimpen prev[v] = u, artinya "untuk sampai ke v, lewat u".
 * Kita bisa ikutin rantai ini mundur dari goal sampai ke start:
 *   goal → prev[goal] → prev[prev[goal]] → ... → start
 *
 * Karena kita lacak mundur, tiap node kita taruh di depan array
 * pakai unshift() supaya hasilnya urut dari start ke goal.
 *
 * Contoh:
 *   prev = {5: 3, 3: 1, 1: 0, 0: null}
 *   reconstructPath(prev, 0, 5) → [0, 1, 3, 5]
 *
 * Kalau goal tidak bisa dicapai (prev[goal] tidak nyambung ke start),
 * fungsi ini return array kosong [] sebagai tanda "tidak ada rute".
 *
 * @param   {Map}    prev     Hasil prev dari dijkstra()
 * @param   {number} startId  ID node titik asal
 * @param   {number} goalId   ID node titik tujuan
 * @returns {number[]}        Array ID node dari start ke goal, atau []
 */
export function reconstructPath(prev, startId, goalId) {
  const path = [];
  let cur = goalId;

  // Lacak mundur dari goal ke start lewat rantai prev
  while (cur !== null && cur !== undefined) {
    path.unshift(cur);         // taruh di depan supaya urutan benar
    if (cur === startId) break; // sudah sampai titik asal, selesai
    cur = prev.get(cur);        // lanjut ke node sebelumnya
  }

  // Kalau node pertama bukan startId, berarti rantai terputus
  // (goal tidak terhubung ke start) → return array kosong
  return path[0] === startId ? path : [];
}

/**
 * pathToCoords(path, nodes)
 *
 * Mengubah array ID node (hasil reconstructPath) menjadi array
 * objek koordinat lengkap dengan label nama lokasi.
 *
 * Kenapa perlu fungsi ini? Animator tidak tahu soal ID node —
 * dia butuh koordinat (x, y) dan nama lokasi buat ditampilin
 * di info panel "Segmen Aktif". Fungsi ini yang jembatani keduanya.
 *
 * Contoh:
 *   path = [0, 1, 3]
 *   nodes = [{id:0, x:340, y:700, label:"Gerbang Masuk"}, ...]
 *   hasilnya: [{x:340, y:700, label:"Gerbang Masuk"}, ...]
 *
 * Kita pakai nodes.find() bukan nodes[id] supaya aman kalau
 * suatu saat urutan array tidak sama persis dengan ID-nya.
 *
 * @param   {number[]} path    Array ID node dari reconstructPath()
 * @param   {Object[]} nodes   Array data node lengkap
 * @returns {{x,y,label}[]}    Array koordinat untuk animator
 */
export function pathToCoords(path, nodes) {
  return path.map(id => {
    const n = nodes.find(n => n.id === id);
    return { x: n.x, y: n.y, label: n.label };
  });
}
