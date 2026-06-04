/**
 * astar.js
 * Implementasi A* (A-Star) Search Algorithm
 */

import { euclidean } from './graph.js';

class MinHeapAStar {
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
      if (this.heap[parent].f <= this.heap[i].f) break;
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
      if (left < n && this.heap[left].f < this.heap[smallest].f) smallest = left;
      if (right < n && this.heap[right].f < this.heap[smallest].f) smallest = right;
      if (smallest === i) break;
      [this.heap[smallest], this.heap[i]] = [this.heap[i], this.heap[smallest]];
      i = smallest;
    }
  }
}

export function astar(graph, nodes, startId, goalId) {
  const dist = new Map();
  const prev = new Map();
  const pq = new MinHeapAStar();

  for (const id of graph.keys()) {
    dist.set(id, Infinity);
    prev.set(id, null);
  }

  dist.set(startId, 0);
  const hStart = euclidean(nodes[startId], nodes[goalId]);
  pq.push({ id: startId, f: hStart, g: 0 });

  while (pq.size > 0) {
    const { id: u, f, g } = pq.pop();

    if (u === goalId) break; // Sampai di tujuan, langsung berhenti
    if (g > dist.get(u)) continue;

    for (const { to: v, weight } of graph.get(u)) {
      const alt = g + weight;
      if (alt < dist.get(v)) {
        dist.set(v, alt);
        prev.set(v, u);
        const h = euclidean(nodes[v], nodes[goalId]);
        pq.push({ id: v, f: alt + h, g: alt });
      }
    }
  }

  return { dist, prev };
}
