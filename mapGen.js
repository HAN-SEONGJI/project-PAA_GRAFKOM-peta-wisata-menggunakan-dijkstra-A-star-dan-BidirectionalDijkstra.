/**
 * mapGen.js
 * Pembangkit peta prosedural tak terbatas (Infinite Chunk-Based).
 * Menggunakan sistem lazy loading, dengan penyesuaian khusus:
 * - Titik (0,0) adalah Pusat Kuliner / Hub.
 * - Titik (0,1) adalah Gerbang Masuk & Parkir.
 * - Chunk lain memunculkan Wahana dan Spot rekreasi.
 * - genereate map dari node ke node dan edge nya untuk menghubungkan jalan nya dengan graph
 */

import { makeRng } from "./prng.js";

const HUB_LABELS = ["Pusat Makanan", "Taman Kota"];
const GATE_LABELS = ["Gerbang Kota", "Area Parkir Pusat", "Toilet"];
const RIDE_LABELS = [
  "Balai Kota", // Wahana
  "Taman Air", "Kolam Renang Umum",
  "Kios Baju", "Masjid Raya", "Monumen Kota" // Spot Foto
];

const CHUNK_SIZE = 1200;

function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export class MapGenerator {
  constructor(seedStr) {
    this.seedStr = seedStr || "DEFAULT";
    this.chunks = new Map(); // key "cx,cy" -> { nodes: [], localEdges: [] }
    this.allNodes = [];
    this.stitchEdges = []; // edges penghubung antar chunk
    this.currentEdges = []; // gabungan localEdges + stitchEdges
    this.globalNodeId = 0;
  }

  ensureVisibleChunks(wTopLeft, wBottomRight) {
    const startCol = Math.floor((wTopLeft.x) / CHUNK_SIZE) - 1;
    const endCol   = Math.floor((wBottomRight.x) / CHUNK_SIZE) + 1;
    const startRow = Math.floor((wTopLeft.y) / CHUNK_SIZE) - 1;
    const endRow   = Math.floor((wBottomRight.y) / CHUNK_SIZE) + 1;

    let generatedNew = false;

    for (let c = startCol; c <= endCol; c++) {
      for (let r = startRow; r <= endRow; r++) {
        const key = `${c},${r}`;
        if (!this.chunks.has(key)) {
          this.generateChunk(c, r);
          generatedNew = true;
        }
      }
    }

    if (generatedNew) {
      this.rebuildGlobalArrays();
    }
    
    return generatedNew;
  }

  generateChunk(cx, cy) {
    const rng = makeRng(`${this.seedStr}_${cx}_${cy}`);
    const chunkNodes = [];
    
    // Tentukan label khusus berdasarkan koordinat chunk (Theme Logis Kawasan Wisata)
    let availableLabels = [];
    if (cx === 0 && cy === 0) {
      availableLabels = [...HUB_LABELS];
    } else if (cx === 0 && cy === 1) {
      availableLabels = [...GATE_LABELS];
    } else {
      // Ambil beberapa label wahana acak untuk chunk ini
      const numRides = 2 + Math.floor(rng() * 3);
      for(let i=0; i<numRides; i++) {
        availableLabels.push(RIDE_LABELS[Math.floor(rng() * RIDE_LABELS.length)]);
      }
    }

    const numNodes = availableLabels.length;
    const startX = cx * CHUNK_SIZE;
    const startY = cy * CHUNK_SIZE;
    const margin = 200;

    let tries = 0;
    while (chunkNodes.length < numNodes && tries < 150) {
      tries++;
      const x = startX + margin + rng() * (CHUNK_SIZE - 2 * margin);
      const y = startY + margin + rng() * (CHUNK_SIZE - 2 * margin);

      if (chunkNodes.some(n => dist(n, { x, y }) < 250)) continue;

      const label = availableLabels[chunkNodes.length];
      chunkNodes.push({
        id: this.globalNodeId++,
        label,
        x: Math.round(x),
        y: Math.round(y),
        chunkKey: `${cx},${cy}`
      });
    }

    // Sambungkan node DI DALAM chunk menggunakan Prim's MST
    const localEdges = [];
    if (chunkNodes.length > 1) {
      const inTree = new Set([0]);
      while (inTree.size < chunkNodes.length) {
        let best = null, bestDist = Infinity;
        for (const a of inTree) {
          for (let b = 0; b < chunkNodes.length; b++) {
            if (inTree.has(b)) continue;
            const d = dist(chunkNodes[a], chunkNodes[b]);
            if (d < bestDist) { bestDist = d; best = [a, b]; }
          }
        }
        if (best) {
          localEdges.push([chunkNodes[best[0]].id, chunkNodes[best[1]].id]);
          inTree.add(best[1]);
        }
      }
      // Hapus sistem loop/cincin (grid kotak).
      // Membiarkan Prim's MST secara alami membentuk pohon hierarkis (Tree Structure)
      // Node akan bercabang secara logis dari pusat tanpa membentuk jaring abstrak.
    }

    const chunkData = { nodes: chunkNodes, localEdges };
    this.chunks.set(`${cx},${cy}`, chunkData);
    this.allNodes.push(...chunkNodes);

    // Stitching (Jahit) ke chunk tetangga (Hanya 1 jalan per tetangga agar graf menyatu tapi tidak saling tumpang tindih)
    this.stitchToNeighbor(cx, cy, cx - 1, cy);
    this.stitchToNeighbor(cx, cy, cx, cy - 1);
    this.stitchToNeighbor(cx, cy, cx + 1, cy);
    this.stitchToNeighbor(cx, cy, cx, cy + 1);
  }

  stitchToNeighbor(cx, cy, nx, ny) {
    const nKey = `${nx},${ny}`;
    if (!this.chunks.has(nKey)) return;

    const c1 = this.chunks.get(`${cx},${cy}`);
    const c2 = this.chunks.get(nKey);
    if (!c1.nodes.length || !c2.nodes.length) return;

    const potentialEdges = [];
    for (const n1 of c1.nodes) {
      for (const n2 of c2.nodes) {
        potentialEdges.push({ a: n1.id, b: n2.id, d: dist(n1, n2) });
      }
    }
    
    // Urutkan berdasarkan jarak terpendek
    potentialEdges.sort((x, y) => x.d - y.d);
    
    // Hubungkan minimal 2 pasang node terdekat antar chunk 
    // TANPA batasan jarak agar TIDAK ADA CHUNK YANG TERISOLASI
    const edgesToAdd = Math.min(2, potentialEdges.length);
    for (let i = 0; i < edgesToAdd; i++) {
      const e = potentialEdges[i];
      const [a, b] = [e.a, e.b].sort((x, y) => x - y);
      if (!this.stitchEdges.some(se => se[0] === a && se[1] === b)) {
        this.stitchEdges.push([a, b]);
      }
    }
  }

  rebuildGlobalArrays() {
    const edgeSet = new Set();
    const newEdges = [];
    
    const addEdge = (a, b) => {
      const min = Math.min(a, b);
      const max = Math.max(a, b);
      const key = `${min}-${max}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        newEdges.push([min, max]);
      }
    };

    for (const e of this.stitchEdges) addEdge(e[0], e[1]);
    for (const chunk of this.chunks.values()) {
      for (const e of chunk.localEdges) addEdge(e[0], e[1]);
    }
    
    this.currentEdges = newEdges;
  }

  getGraphData() {
    return { nodes: this.allNodes, edges: this.currentEdges };
  }
}

