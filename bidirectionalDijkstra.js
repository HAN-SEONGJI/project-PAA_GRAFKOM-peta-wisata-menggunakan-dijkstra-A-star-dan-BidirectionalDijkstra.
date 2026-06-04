/**
 * bidirectionalDijkstra.js
 * Implementasi Bidirectional Dijkstra
 */

class MinHeapBi {
  constructor() {
    this.heap = [];
  }
  push(item) {
    this.heap.push(item);
    this._bubbleUp(this.heap.length - 1);
  }
  pop() {
    const top = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this._sinkDown(0);
    }
    return top;
  }
  get size() { return this.heap.length; }

  _bubbleUp(i) {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.heap[parent].dist <= this.heap[i].dist) break;
      [this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]];
      i = parent;
    }
  }

  _sinkDown(i) {
    const n = this.heap.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.heap[left].dist < this.heap[smallest].dist) smallest = left;
      if (right < n && this.heap[right].dist < this.heap[smallest].dist) smallest = right;
      if (smallest === i) break;
      [this.heap[smallest], this.heap[i]] = [this.heap[i], this.heap[smallest]];
      i = smallest;
    }
  }
}

export function bidirectionalDijkstra(graph, startId, goalId) {
  const distF = new Map(); // Forward distance
  const distB = new Map(); // Backward distance
  const prevF = new Map(); // Forward path
  const prevB = new Map(); // Backward path
  
  const pqF = new MinHeapBi();
  const pqB = new MinHeapBi();
  
  const visitedF = new Set();
  const visitedB = new Set();

  for (const id of graph.keys()) {
    distF.set(id, Infinity);
    distB.set(id, Infinity);
    prevF.set(id, null);
    prevB.set(id, null);
  }

  distF.set(startId, 0);
  distB.set(goalId, 0);
  
  pqF.push({ id: startId, dist: 0 });
  pqB.push({ id: goalId, dist: 0 });
  
  let bestDist = Infinity;
  let meetingNode = -1;

  while (pqF.size > 0 && pqB.size > 0) {
    const uF = pqF.pop();
    const uB = pqB.pop();
    
    // Stop condition: if the sum of minimum distances in both queues is >= bestDist
    if (uF.dist + uB.dist >= bestDist) {
      break;
    }
    
    // Process Forward
    if (!visitedF.has(uF.id) && uF.dist <= distF.get(uF.id)) {
      visitedF.add(uF.id);
      for (const { to: v, weight } of graph.get(uF.id)) {
        const alt = uF.dist + weight;
        if (alt < distF.get(v)) {
          distF.set(v, alt);
          prevF.set(v, uF.id);
          pqF.push({ id: v, dist: alt });
        }
        if (visitedB.has(v) && alt + distB.get(v) < bestDist) {
          bestDist = alt + distB.get(v);
          meetingNode = v;
        }
      }
    }
    
    // Process Backward
    if (!visitedB.has(uB.id) && uB.dist <= distB.get(uB.id)) {
      visitedB.add(uB.id);
      for (const { to: v, weight } of graph.get(uB.id)) {
        const alt = uB.dist + weight;
        if (alt < distB.get(v)) {
          distB.set(v, alt);
          prevB.set(v, uB.id);
          pqB.push({ id: v, dist: alt });
        }
        if (visitedF.has(v) && alt + distF.get(v) < bestDist) {
          bestDist = alt + distF.get(v);
          meetingNode = v;
        }
      }
    }
  }

  // Rekonstruksi hasil akhir menjadi satu 'dist' dan 'prev' seperti Dijkstra biasa
  // Tapi prev akan menunjuk dari tujuan ke awal, jadi kita perlu perbaiki.
  const dist = new Map();
  const prev = new Map();
  
  // Kalau tidak ketemu jalur
  if (meetingNode === -1) {
    for (const id of graph.keys()) {
      dist.set(id, Infinity);
      prev.set(id, null);
    }
    return { dist, prev };
  }
  
  // Karena struktur UI memanggil prev dari goal ke start: (curr = goalId; curr != startId; curr = prev[curr])
  // Kita buat prev map supaya goalId punya prev, prev-nya prev punya prev, dst sampai startId
  // Untuk prevF, arah sudah benar (start -> ... -> meetingNode)
  // Untuk prevB, arah terbalik (goal -> ... -> meetingNode). Kita perlu putar arahnya.
  
  // Isi dist dan prev dengan Infinity/null dulu
  for (const id of graph.keys()) {
    dist.set(id, Infinity);
    prev.set(id, null);
  }
  
  // Telusuri dari meetingNode ke startId
  let curr = meetingNode;
  while (curr !== startId && curr !== null) {
    let p = prevF.get(curr);
    prev.set(curr, p);
    curr = p;
  }
  
  // Telusuri dari meetingNode ke goalId (dan balik arah prev-nya)
  curr = meetingNode;
  while (curr !== goalId && curr !== null) {
    let p = prevB.get(curr);
    if (p !== null) {
      prev.set(p, curr);
    }
    curr = p;
  }
  
  // Set dist[goalId] ke total bobot agar UI bisa menampilkan Total Jarak
  dist.set(goalId, bestDist);
  
  return { dist, prev };
}
