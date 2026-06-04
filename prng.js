/**
 * prng.js
 * Modul Pembangkit Angka Semu (Pseudorandom Number Generator)
 * Memastikan pembuatan peta dan render elemen visual konsisten 
 * jika diberikan seed yang sama (Konsep Minecraft).
 */

// Simple string hash function (djb2) to convert string seed to an integer
export function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash >>> 0;
}

/**
 * makeRng(seedStr)
 * Mengembalikan fungsi yang menghasilkan angka acak 0-1 secara konsisten
 * berdasarkan seed yang diberikan. Menggunakan algoritma hashing/splitmix32.
 */
export function makeRng(seedStr) {
  // Jika seed kosong, gunakan waktu saat ini sebagai seed
  if (!seedStr) {
    seedStr = Date.now().toString();
  }
  
  let s = (hashString(seedStr.toString()) ^ 0xdeadbeef) >>> 0;
  
  return () => {
    s = Math.imul(s ^ (s >>> 15), s | 1);
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
    return ((s ^ (s >>> 14)) >>> 0) / 0xffffffff;
  };
}
