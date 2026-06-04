/**
 * main.js
 * File orkestrator — titik pusat yang menghubungkan semua modul.
 *
 * Yang dikerjakan file ini:
 *  - Inisialisasi canvas dan kamera saat halaman pertama dibuka
 *  - Nyimpen state global (node aktif, rute, animator, dll.)
 *  - Handle semua interaksi user: klik tombol, keyboard, scroll, drag
 *  - Jalankan game loop (render tiap frame via requestAnimationFrame)
 *  - Update info panel kanan secara real-time tiap frame
 *
 * Urutan boot saat halaman pertama load:
 *  1. Canvas di-resize ke ukuran container (SEBELUM Camera dibuat!)
 *  2. Camera dibuat dengan ukuran canvas yang sudah benar
 *  3. computeRoute() dipanggil → Dijkstra jalan untuk rute default
 *  4. requestAnimationFrame mulai → render loop berjalan terus
 */

import { buildGraph }                    from "./graph.js";
import { dijkstra }                      from "./dijkstra.js";
import { astar }                         from "./astar.js";
import { bidirectionalDijkstra }         from "./bidirectionalDijkstra.js";
import { reconstructPath, pathToCoords } from "./pathTracker.js";
import { Camera }                        from "./camera.js";
import { drawScene }                     from "./renderer.js";
import { Animator }                      from "./animator.js";
import { MapGenerator }                  from "./mapGen.js";

// ── CANVAS & CAMERA ──────────────────────────────────────────────
const canvas = document.getElementById("mapCanvas");
const ctx    = canvas.getContext("2d");

// PENTING: resize canvas ke ukuran container SEBELUM bikin Camera!
// Kalau Camera dibuat dulu, canvasW/H = 0 dan semua klik jadi meleset.
// Ini bug yang ditemukan saat audit — sekarang sudah difix di sini.
;(function initSize() {
  const c = canvas.parentElement;
  const rect = c.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width  = rect.width + "px";
  canvas.style.height = rect.height + "px";
})();

// Camera selalu menggunakan koordinat layar logika (logical pixels)
const camera = new Camera(canvas.parentElement.clientWidth, canvas.parentElement.clientHeight || canvas.parentElement.offsetHeight);

// ── STATE GLOBAL ─────────────────────────────────────────────────
const DEFAULT_SEED = "ANOMALI_5QUAD"; // Seed default yang epic
let currentSeed = DEFAULT_SEED;    // Seed peta saat ini
let lastSeedUsed = DEFAULT_SEED;   // Seed terakhir yang dieksekusi tombol
let showTiles  = false;  // Toggle rendering map tiles/grid

// Inisialisasi peta default menggunakan Infinite Chunk dengan seed "ANOMALI_5QUAD"
let chunkManager = new MapGenerator(DEFAULT_SEED);
chunkManager.ensureVisibleChunks({x: -1500, y: -1500}, {x: 3500, y: 3500});
let graphData = chunkManager.getGraphData();

let nodes      = graphData.nodes;  // array node yang sedang aktif di peta
let edges      = graphData.edges;  // array edge yang sedang aktif
let graph      = buildGraph(nodes, edges);  // adjacency list untuk Dijkstra

let startId    = null;   // Belum ada posisi awal saat load
let goalId     = null;   // Belum ada titik tujuan saat load
let routePath  = [];     // array ID node hasil Dijkstra yang sedang ditampilkan
let animator   = null;   // instance Animator, null kalau belum ada rute/animasi
let hoverId    = null;   // ID node yang sedang di-hover mouse, null kalau tidak ada
let selectMode = null;   // mode pemilihan: "start", "goal", atau null
let lastAnalysisMs = 0;  // waktu eksekusi Dijkstra terakhir (millisecond)

// ── REFERENSI ELEMEN HTML ────────────────────────────────────────
// Tombol-tombol di toolbar
const btnStart    = document.getElementById("btnStart");
const btnRandMap  = document.getElementById("btnRandMap");
const btnRandPos  = document.getElementById("btnRandPos");
const btnSetStart = document.getElementById("btnSetStart");
const btnSetGoal  = document.getElementById("btnSetGoal");
const btnReset    = document.getElementById("btnReset");
const seedInput   = document.getElementById("seedInput");
const btnToggleTiles= document.getElementById("btnToggleTiles");
const algoSelect  = document.getElementById("algoSelect");
const navAlgorithm = document.getElementById("navAlgorithm");

// Indikator status di pojok kiri panel (dot + teks)
const statusDot    = document.querySelector(".status-dot");
const statusText   = document.getElementById("statusText");
const progressFill = document.getElementById("progressFill");

// Kartu "Perencanaan Rute" — diupdate setelah Dijkstra selesai
const navStart        = document.getElementById("navStart");
const navGoal         = document.getElementById("navGoal");
const navRoute        = document.getElementById("navRoute");
const navTotalDist    = document.getElementById("navTotalDist");
const navHops         = document.getElementById("navHops");
const navAnalysisTime = document.getElementById("navAnalysisTime");

// Kartu "Live Navigation" — diupdate tiap frame saat animasi berjalan
const liveProgressFill = document.getElementById("liveProgressFill");
const liveProgressPct  = document.getElementById("liveProgressPct");
const livePosX         = document.getElementById("livePosX");
const livePosY         = document.getElementById("livePosY");
const liveSegment      = document.getElementById("liveSegment");
const liveSpeed        = document.getElementById("liveSpeed");
const liveTraveled     = document.getElementById("liveTraveled");
const liveRemain       = document.getElementById("liveRemain");
const liveElapsed      = document.getElementById("liveElapsed");
const liveETA          = document.getElementById("liveETA");
const liveAngle        = document.getElementById("liveAngle");

// Kartu "Statistik Peta" — diupdate tiap frame (zoom berubah saat scroll)
const navNodes     = document.getElementById("navNodes");
const navEdges     = document.getElementById("navEdges");
const navConnected = document.getElementById("navConnected");
const navZoom      = document.getElementById("navZoom");

// ── FUNGSI BANTU UI ───────────────────────────────────────────────

/**
 * setStatus(msg, type)
 * Ganti teks dan warna dot status di panel kanan.
 * type: "ready" (hijau), "processing" (kuning berkedip),
 *       "done" (ungu), "error" (merah)
 */
function setStatus(msg, type = "ready") {
  statusDot.className   = `status-dot status-${type}`;
  statusText.textContent = msg;
}

/**
 * setProgress(pct)
 * Atur lebar progress bar 0-100%.
 * Dipanggil saat Dijkstra sedang jalan supaya user tidak merasa
 * aplikasi hang.
 */
function setProgress(pct) {
  progressFill.style.width = pct + "%";
}

// Toast notifikasi kecil yang muncul sebentar lalu hilang sendiri
const toast = document.getElementById("toast");
let _toastTimer = null;
function showToast(msg) {
  toast.textContent = msg;
  toast.style.opacity = "1";
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { toast.style.opacity = "0"; }, 1800);
}

/**
 * showAlert(msg)
 * Popup besar di tengah layar — dipakai saat kendaraan sampai tujuan.
 * Hilang sendiri setelah 2.5 detik.
 */
function showAlert(msg) {
  const el = document.createElement("div");
  el.className   = "alert-popup";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => document.body.removeChild(el), 2500);
}

/**
 * fmtSec(s)
 * Format detik jadi string yang lebih enak dibaca.
 * Kalau < 60 detik: "12.5s", kalau >= 60: "1m 05s"
 */
function fmtSec(s) {
  if (s == null) return "—";
  if (s < 60)   return s.toFixed(1) + "s";
  const m   = Math.floor(s / 60);
  const sec = (s % 60).toFixed(0).padStart(2, "0");
  return `${m}m ${sec}s`;
}

/**
 * fmtDeg(rad)
 * Ubah sudut radian ke derajat 0-360° untuk ditampilkan di info panel.
 * ctx.rotate() pakai radian, tapi user lebih mudah ngerti derajat.
 */
function fmtDeg(rad) {
  let deg = (rad * 180 / Math.PI) % 360;
  if (deg < 0) deg += 360;
  return Math.round(deg) + "°";
}

// ── UPDATE INFO PANEL ─────────────────────────────────────────────

/**
 * updateMapStats()
 * Refresh kartu "Statistik Peta" di panel kanan.
 * Dipanggil tiap frame supaya persentase zoom selalu up-to-date
 * saat user lagi scroll.
 */
function updateMapStats() {
  navNodes.textContent     = nodes.length;
  navEdges.textContent     = edges.length;
  navConnected.textContent = "✔";  // selalu true karena kita pakai Prim MST
  navZoom.textContent      = (camera.zoom * 100).toFixed(0) + "%";
}

/**
 * updateRoutePanel(path, dist)
 * Update kartu "Perencanaan Rute" setelah Dijkstra selesai.
 * Nampilin nama asal, tujuan, urutan rute, total jarak,
 * jumlah hops (berapa persimpangan dilewati), dan waktu analisis.
 */
function updateRoutePanel(path, dist) {
  const startNode = startId !== null ? nodes.find(n => n.id === startId) : null;
  const goalNode  = goalId !== null ? nodes.find(n => n.id === goalId) : null;
  navStart.textContent = startNode?.label ?? (startId !== null ? `Node ${startId}` : "Belum dipilih");
  navGoal.textContent  = goalNode?.label  ?? (goalId !== null ? `Node ${goalId}` : "Belum dipilih");

  if (!path.length) {
    navRoute.textContent        = "Tidak ada rute";
    navTotalDist.textContent    = "—";
    navHops.textContent         = "—";
    navAnalysisTime.textContent = lastAnalysisMs + " ms";
    return;
  }

  // Urutan rute: "Gerbang Masuk → Wahana Permainan → Penginapan"
  navRoute.textContent        = path.map(id => nodes.find(n => n.id === id)?.label ?? id).join(" → ");
  navTotalDist.textContent    = Math.round(dist) + " px";
  navHops.textContent         = (path.length - 1) + " hop";  // jumlah edge yang dilewati
  navAnalysisTime.textContent = lastAnalysisMs + " ms";
}

/**
 * updateLivePanel()
 * Update kartu "Live Navigation" tiap frame saat animasi berjalan.
 * Data diambil langsung dari properti Animator yang diupdate di update().
 * Kalau tidak ada animator, semua field di-reset ke "—".
 */
function updateLivePanel() {
  if (!animator) {
    // Tidak ada animasi aktif — reset semua ke strip
    liveProgressFill.style.width = "0%";
    liveProgressPct.textContent  = "0%";
    livePosX.textContent         = "—";
    livePosY.textContent         = "—";
    liveSegment.textContent      = "—";
    liveSpeed.textContent        = "—";
    liveTraveled.textContent     = "—";
    liveRemain.textContent       = "—";
    liveElapsed.textContent      = "—";
    liveETA.textContent          = "—";
    liveAngle.textContent        = "—";
    return;
  }

  const a   = animator;
  const pct = a.progressPct.toFixed(1);

  liveProgressFill.style.width = pct + "%";
  liveProgressPct.textContent  = Math.round(a.progressPct) + "%";
  livePosX.textContent         = Math.round(a.x);   // koordinat world, bukan piksel layar
  livePosY.textContent         = Math.round(a.y);
  liveSegment.textContent      = a.currentSegLabel || "—";
  liveSpeed.textContent        = Math.round(a.currentSpeedPx) + " px/s";
  liveTraveled.textContent     = Math.round(a.distanceTraveled) + " px";
  liveRemain.textContent       = Math.round(a.distToGoal) + " px";
  liveElapsed.textContent      = fmtSec(a.elapsedSec);
  // ETA hanya ditampilkan kalau sedang berjalan, kalau done tampilkan "Tiba!"
  liveETA.textContent          = a.running ? fmtSec(a.getETA()) : (a.done ? "Tiba!" : "—");
  liveAngle.textContent        = fmtDeg(a.angle);
}

// ── HITUNG RUTE ───────────────────────────────────────────────────

/**
 * computeRoute()
 * Fungsi inti yang menjalankan Dijkstra dan mempersiapkan animator.
 *
 * Urutan kerjanya:
 *  1. Tampilkan status "Menganalisis..." dan progress bar
 *  2. Jalankan Dijkstra dari startId (sambil ukur waktu eksekusi)
 *  3. Rekonstruksi jalur dari hasil Dijkstra
 *  4. Update info panel dengan hasil rute
 *  5. Bikin instance Animator baru yang siap dijalankan
 *
 * performance.now() dipakai untuk ukur waktu eksekusi Dijkstra
 * dengan presisi sub-milidetik — hasilnya ditampilkan di info panel
 * sebagai "Waktu Analisis".
 */
function computeRoute() {
  if (startId === null || goalId === null) {
    routePath = [];
    animator = null;
    updateRoutePanel([], 0);
    setStatus(startId === null ? "Pilih titik asal" : "Pilih titik tujuan", "processing");
    return;
  }

  setStatus("Menganalisis...", "processing");
  setProgress(30);

  const t0 = performance.now();
  let dist, prev;
  const algo = algoSelect.value;
  
  if (algo === "dijkstra") {
    const res = dijkstra(graph, startId);
    dist = res.dist; prev = res.prev;
    navAlgorithm.textContent = "Dijkstra";
  } else if (algo === "astar") {
    const res = astar(graph, nodes, startId, goalId);
    dist = res.dist; prev = res.prev;
    navAlgorithm.textContent = "A* (A-Star)";
  } else if (algo === "bidirectional") {
    const res = bidirectionalDijkstra(graph, startId, goalId);
    dist = res.dist; prev = res.prev;
    navAlgorithm.textContent = "Bi-Dijkstra";
  }
  
  const path = reconstructPath(prev, startId, goalId);
  lastAnalysisMs = Math.round(performance.now() - t0);

  routePath = path;
  animator  = null;  // reset animator lama

  setProgress(100);

  if (!path.length) {
    // Dijkstra tidak bisa nemuin jalur — kemungkinan graf tidak terhubung
    setStatus("Rute tidak ditemukan", "error");
    updateRoutePanel([], 0);
    setTimeout(() => setProgress(0), 800);
    return;
  }

  const d = dist.get(goalId);
  setStatus("Rute ditemukan!", "done");
  updateRoutePanel(path, d);
  // Siapkan animator dengan koordinat rute — kecepatan 130 px/detik
  animator = new Animator(pathToCoords(path, nodes), 130);
  // Setelah 900ms, progress bar dikosongkan dan status kembali ke "Siap"
  setTimeout(() => { setProgress(0); setStatus("Siap", "ready"); }, 900);
}

// ── LOGIKA TOMBOL UTAMA ───────────────────────────────────────────

/**
 * doStartPause()
 * Handle tombol Start/Pause dan keyboard Spasi.
 * Tiga kondisi yang mungkin:
 *  1. Belum ada animator → hitung rute dulu, lalu langsung start
 *  2. Animator sudah selesai → reset dan start ulang dari awal
 *  3. Animator sedang jalan → toggle pause/resume
 */
function doStartPause() {
  if (!animator) {
    computeRoute();
    if (animator) {
      animator.start();
      btnStart.textContent = "⏸ Pause";
      setStatus("Navigasi berjalan...", "processing");
    }
    return;
  }
  if (animator.done) {
    // Sudah sampai tujuan, mau jalan lagi dari awal
    animator.reset();
    animator.start();
    btnStart.textContent = "⏸ Pause";
    setStatus("Navigasi berjalan...", "processing");
  } else {
    // Toggle antara jalan dan pause
    animator.toggle();
    if (animator.running) {
      btnStart.textContent = "⏸ Pause";
      setStatus("Navigasi berjalan...", "processing");
    } else {
      btnStart.textContent = "▶ Start";
      setStatus("Dijeda", "ready");
    }
  }
}

/**
 * doRandMap()
 * Handle tombol "Acak Peta" dan keyboard R.
 * Bikin peta baru secara prosedural, rebuild graph, hitung ulang rute.
 * Titik asal selalu node 0, tujuan node terakhir setelah diacak.
 */
function doRandMap() {
  setStatus("Membuat peta baru...", "processing");
  setProgress(40);

  // Ambil seed dari input, jika kosong atau sama dengan seed yang terakhir diacak (user tidak mengetik manual), buat seed acak baru!
  let inputVal = seedInput.value.trim();
  if (!inputVal || inputVal === lastSeedUsed) {
    currentSeed = Math.random().toString(36).substring(2, 8).toUpperCase();
    seedInput.value = currentSeed;
  } else {
    currentSeed = inputVal;
  }
  lastSeedUsed = currentSeed;

  chunkManager = new MapGenerator(currentSeed);
  
  // Paksa generate chunk awal di posisi kamera saat ini
  const wTopLeft = camera.screenToWorld(0, 0);
  const wBottomRight = camera.screenToWorld(canvas.width, canvas.height);
  chunkManager.ensureVisibleChunks(wTopLeft, wBottomRight);

  const r = chunkManager.getGraphData();
  nodes = r.nodes;
  edges = r.edges;
  graph = buildGraph(nodes, edges);
  startId = null;
  goalId  = null;
  routePath = [];
  animator  = null;
  btnStart.textContent = "▶ Start";

  setProgress(80);
  computeRoute();
  showToast("Peta diacak!");
}

/**
 * doReset()
 * Kembalikan semua ke state awal — peta default Infinite Chunk,
 * rute default Gerbang Masuk → Penginapan, tidak ada animasi.
 */
function doReset() {
  if (animator) animator.pause();
  animator   = null;
  routePath  = [];
  selectMode = null;
  btnStart.textContent = "▶ Start";
  btnSetStart.classList.remove("active");
  btnSetGoal.classList.remove("active");

  // Kembalikan ke data peta default (Infinite Chunk dengan Seed DEFAULT)
  currentSeed = DEFAULT_SEED;
  lastSeedUsed = DEFAULT_SEED;
  seedInput.value = ""; // Kosongkan form UI
  
  chunkManager = new MapGenerator(DEFAULT_SEED);
  chunkManager.ensureVisibleChunks({x: -1500, y: -1500}, {x: 3500, y: 3500});
  const graphData = chunkManager.getGraphData();

  nodes   = graphData.nodes;
  edges   = graphData.edges;
  graph   = buildGraph(nodes, edges);
  startId = null;
  goalId  = null;

  computeRoute();
  setStatus("Sistem direset", "ready");
  showToast("Reset!");
}

// ── EVENT LISTENER TOMBOL ─────────────────────────────────────────
btnStart.addEventListener("click", doStartPause);
btnRandMap.addEventListener("click", doRandMap);
btnReset.addEventListener("click", doReset);
btnToggleTiles.addEventListener("click", () => {
  showTiles = !showTiles;
  btnToggleTiles.textContent = showTiles ? "▣ Map Tiles: ON" : "▢ Map Tiles: OFF";
  btnToggleTiles.style.background = showTiles ? "#22c55e" : "#4b5563";
});
algoSelect.addEventListener("change", () => {
  if (startId !== null && goalId !== null) {
    animator = null;
    btnStart.textContent = "▶ Start";
    computeRoute();
  }
});

// Acak posisi asal tanpa mengacak tujuan atau peta — berguna untuk
// coba-coba rute berbeda menuju satu titik yang sama
btnRandPos.addEventListener("click", () => {
  const ids = nodes.map(n => n.id);
  // Hanya acak posisi awal
  startId = ids[Math.floor(Math.random() * ids.length)]; 
  
  // Kosongkan tujuan agar user harus menset ulang
  goalId = null;
  
  // Kosongkan rute sementara
  routePath = []; 
  animator = null; 
  btnStart.textContent = "▶ Start";
  
  // Hitung ulang (akan mereset tampilan karena goalId = null)
  computeRoute();
  showToast("Posisi Awal diacak!");
});

// Set Asal: klik tombol → masuk mode "start" → klik node di peta
btnSetStart.addEventListener("click", () => {
  selectMode = selectMode === "start" ? null : "start";  // toggle mode
  btnSetStart.classList.toggle("active", selectMode === "start");
  btnSetGoal.classList.remove("active");
  setStatus(selectMode === "start" ? "Klik node → ASAL" : "Siap",
            selectMode === "start" ? "processing" : "ready");
});

// Set Tujuan: klik tombol → masuk mode "goal" → klik node di peta
btnSetGoal.addEventListener("click", () => {
  selectMode = selectMode === "goal" ? null : "goal";
  btnSetGoal.classList.toggle("active", selectMode === "goal");
  btnSetStart.classList.remove("active");
  setStatus(selectMode === "goal" ? "Klik node → TUJUAN" : "Siap",
            selectMode === "goal" ? "processing" : "ready");
});

// ── KEYBOARD SHORTCUTS ────────────────────────────────────────────
// Dicek dengan e.target supaya tidak aktif saat user lagi ngetik di input form
window.addEventListener("keydown", e => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  if (e.code === "Space") {
    e.preventDefault();  // cegah halaman scroll saat tekan spasi
    doStartPause();
    showToast(animator?.running ? "▶ Berjalan" : "⏸ Pause");
  }
  if (e.code === "KeyR") {
    e.preventDefault();
    doRandMap();
  }
});

// ── EVENT MOUSE ───────────────────────────────────────────────────

// Scroll = zoom — { passive: false } wajib supaya e.preventDefault() bisa jalan
canvas.addEventListener("wheel", e => {
  e.preventDefault();
  camera.zoomAt(-e.deltaY, e.offsetX, e.offsetY);
  // Update tampilan zoom langsung tanpa tunggu frame berikutnya
  navZoom.textContent = (camera.zoom * 100).toFixed(0) + "%";
}, { passive: false });

// Klik kiri = mulai drag
canvas.addEventListener("mousedown", e => {
  if (e.button === 0) camera.onMouseDown(e.offsetX, e.offsetY);
});

// Gerak mouse = update kamera (kalau drag) atau deteksi hover node
canvas.addEventListener("mousemove", e => {
  camera.onMouseMove(e.offsetX, e.offsetY);

  if (!camera.isDragging) {
    // Konversi posisi mouse ke koordinat world untuk deteksi node
    const w = camera.screenToWorld(e.offsetX, e.offsetY);
    hoverId = null;
    for (const n of nodes) {
      // Radius hit 22px — cukup besar supaya mudah diklik tapi tidak overlap
      if (Math.sqrt((n.x - w.x) ** 2 + (n.y - w.y) ** 2) < 22) {
        hoverId = n.id;
        break;
      }
    }
    canvas.style.cursor = hoverId !== null ? "pointer" : "grab";
  }
});

// Mouse lepas = selesai drag ATAU pilih node (kalau mode seleksi aktif)
canvas.addEventListener("mouseup", e => {
  if (camera.isDragging) {
    camera.onMouseUp();
    return;
  }

  // Kalau mode seleksi aktif dan klik mengenai node, set start/goal
  if (!selectMode) return;
  const w = camera.screenToWorld(e.offsetX, e.offsetY);
  for (const n of nodes) {
    if (Math.sqrt((n.x - w.x) ** 2 + (n.y - w.y) ** 2) < 22) {
      if (selectMode === "start") startId = n.id;
      else                        goalId  = n.id;
      // Keluar dari mode seleksi, reset tombol
      selectMode = null;
      btnSetStart.classList.remove("active");
      btnSetGoal.classList.remove("active");
      animator = null; btnStart.textContent = "▶ Start";
      computeRoute();
      break;
    }
  }
});

// Kalau mouse keluar canvas saat drag, hentikan drag supaya tidak nge-bug
canvas.addEventListener("mouseleave", () => camera.onMouseUp());

// ── RESIZE WINDOW ─────────────────────────────────────────────────
// Sesuaikan ukuran canvas kalau jendela browser diubah ukurannya
window.addEventListener("resize", () => {
  const c = canvas.parentElement;
  const rect = c.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width  = rect.width + "px";
  canvas.style.height = rect.height + "px";
  camera.resize(rect.width, rect.height);
});

// ── CALLBACK ANIMASI SELESAI ──────────────────────────────────────

/**
 * onAnimDone()
 * Dipanggil tepat satu kali saat kendaraan sampai di tujuan.
 * Logika di render loop (wasDone / animator.done) yang memastikan
 * fungsi ini hanya dipanggil SEKALI — saat transisi dari tidak-selesai
 * ke selesai.
 */
function onAnimDone() {
  btnStart.textContent = "▶ Start";
  setStatus("Sampai di tujuan!", "done");
  showAlert("🎉 Mobil sampai ke tujuan!");
  setTimeout(() => setStatus("Siap", "ready"), 3000);
}

// ── RENDER LOOP ───────────────────────────────────────────────────

/**
 * render(ts)
 * Game loop utama — dipanggil oleh browser ~60 kali per detik.
 * ts = timestamp dalam millisecond dari browser.
 *
 * Urutan tiap frame:
 *  1. Hitung dt (delta time) — waktu sejak frame sebelumnya
 *     Di-cap di 0.05 detik supaya tidak ada lompatan besar
 *     kalau tab browser tidak aktif beberapa saat
 *  2. Update posisi animator
 *  3. Cek apakah animasi baru saja selesai (wasDone false → done true)
 *  4. Reset transform canvas dan clear layar
 *  5. Gambar semua layer peta via drawScene()
 *  6. Gambar kendaraan di atas peta
 *  7. Update info panel
 *  8. Minta frame berikutnya
 */
let lastTime = 0;
function render(ts) {
  const dt = Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;

  if (animator) {
    const wasDone = animator.done;
    animator.update(dt);
    // Deteksi transisi: baru saja selesai di frame ini
    if (!wasDone && animator.done) onAnimDone();
  }

  // Reset transform canvas ke identitas sebelum clear
  // (kalau tidak di-reset, clearRect tidak bekerja dengan benar)
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Cek dan generate Chunk baru secara dinamis jika kamera bergeser
  if (chunkManager) {
    const wTopLeft = camera.screenToWorld(0, 0);
    const wBottomRight = camera.screenToWorld(canvas.width, canvas.height);
    if (chunkManager.ensureVisibleChunks(wTopLeft, wBottomRight)) {
      const r = chunkManager.getGraphData();
      nodes = r.nodes;
      edges = r.edges;
      graph = buildGraph(nodes, edges);
      // Rute tidak dihitung ulang secara otomatis agar mobil tidak terganggu
    }
  }

  // Terapkan transformasi kamera (zoom + pan)
  camera.applyTransform(ctx);

  // Gambar semua layer peta dari bawah ke atas:
  // terrain → jalan → pohon → bangunan → lampu → bobot → marker node
  drawScene(ctx, nodes, edges, routePath, startId, goalId, hoverId, camera, showTiles);

  // Gambar kendaraan terakhir supaya muncul di atas semua elemen peta
  if (animator) animator.draw(ctx);

  // Refresh info panel — dilakukan tiap frame karena live data
  // terus berubah saat animasi berjalan
  updateLivePanel();
  updateMapStats();

  requestAnimationFrame(render);
}

// ── BOOT ──────────────────────────────────────────────────────────
// Hitung rute default dulu 
// sebelum render loop mulai supaya rute sudah siap di frame pertama
computeRoute();
requestAnimationFrame(render);
