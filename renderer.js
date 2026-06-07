/**
 * renderer.js — Peta Kawasan Wisata Realistis (Top-Down)
 *
 * Layer gambar (bawah ke atas):
 *  1. Terrain rumput + variasi warna
 *  2. Trotoar (beige)
 *  3. Jalan aspal (abu gelap, Bezier)
 *  4. Marka jalan (putih putus-putus)
 *  5. Pohon & semak di pinggir jalan
 *  6. Bangunan tiap lokasi wisata
 *  7. Tiang lampu jalan
 *  8. Rute Dijkstra highlight (kuning)
 *  9. Node marker + bendera
 *
 * Kontributor: Monalisa Dwi Cantika (Weight & Distance Logic)
 */

/* ================================================================
   SEEDED RNG — gambar stabil, berubah hanya saat peta diacak
   ================================================================ */
function makeRng(seed) {
  let s = (seed ^ 0xdeadbeef) >>> 0;
  return () => {
    s = Math.imul(s ^ (s >>> 15), s | 1);
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
    return ((s ^ (s >>> 14)) >>> 0) / 0xffffffff;
  };
}

/* ================================================================
   BEZIER HELPERS (MATEMATIKA GRAFIKA MURNI)
   ================================================================ */

/**
 * getCubicBezierPoints(a, b, f, n)
 * Implementasi matematis Kurva Bezier Kubik secara mandiri tanpa
 * mengandalkan fungsi instan dari Canvas API (bezierCurveTo / quadraticCurveTo).
 * Menggunakan interpolasi polinomial P(t) = (1-t)^3*P0 + 3(1-t)^2*t*P1 + 3(1-t)*t^2*P2 + t^3*P3
 */
export function getCubicControlPoints(a, b, f = 0.35) {
  const [p, q] = (a.x < b.x || (a.x === b.x && a.y <= b.y)) ? [a, b] : [b, a];
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  
  const cp1 = { x: p.x + dx * 0.33 + nx * len * f, y: p.y + dy * 0.33 + ny * len * f };
  const cp2 = { x: p.x + dx * 0.66 - nx * len * f, y: p.y + dy * 0.66 - ny * len * f };
  
  return { p, cp1, cp2, q, isReversed: p !== a };
}

export function getCubicBezierPoints(a, b, f = 0.35, n = 24) {
  const { p, cp1, cp2, q, isReversed } = getCubicControlPoints(a, b, f);

  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const mt = 1 - t;
    const x = mt * mt * mt * p.x + 3 * mt * mt * t * cp1.x + 3 * mt * t * t * cp2.x + t * t * t * q.x;
    const y = mt * mt * mt * p.y + 3 * mt * mt * t * cp1.y + 3 * mt * t * t * cp2.y + t * t * t * q.y;
    pts.push({ x, y });
  }
  
  if (isReversed) pts.reverse();
  
  return pts;
}

/* ================================================================
   LAYER 1: TERRAIN RUMPUT
   ================================================================ */
function drawTerrain(ctx, nodes, camera) {
  let x0, y0, w, h;

  if (camera) {
    const tl = camera.screenToWorld(0, 0);
    const br = camera.screenToWorld(ctx.canvas.width, ctx.canvas.height);
    // Tambahkan margin agar tidak robek saat pan
    x0 = tl.x - 200;
    y0 = tl.y - 200;
    w = (br.x - tl.x) + 400;
    h = (br.y - tl.y) + 400;
  } else {
    // Fallback jika tidak ada kamera
    if (!nodes.length) return;
    let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
    for (const n of nodes) {
      if (n.x<minX) minX=n.x; if (n.y<minY) minY=n.y;
      if (n.x>maxX) maxX=n.x; if (n.y>maxY) maxY=n.y;
    }
    const pad=120; x0=minX-pad; y0=minY-pad; w=maxX-minX+pad*2; h=maxY-minY+pad*2;
  }

  // Aspal perkotaan (abu gelap/beton) - BACKGROUND FILL UNLIMITED
  ctx.fillStyle = "#333a40";
  ctx.fillRect(x0, y0, w, h);

  // Variasi patch beton/aspal menggunakan Spatial Hashing (Infinite)
  const blockSize = 600;
  const startC = Math.floor(x0 / blockSize);
  const endC = Math.floor((x0 + w) / blockSize);
  const startR = Math.floor(y0 / blockSize);
  const endR = Math.floor((y0 + h) / blockSize);

  for (let c = startC; c <= endC; c++) {
    for (let r = startR; r <= endR; r++) {
      const rng = makeRng(c * 17 + r * 31); // Seed statis per blok koordinat
      const patchesCount = 2 + Math.floor(rng() * 4); // 2-5 patch per blok

      for (let i = 0; i < patchesCount; i++) {
        const px = (c * blockSize) + rng() * blockSize;
        const py = (r * blockSize) + rng() * blockSize;
        const pr = 18 + rng() * 55;
        ctx.fillStyle = rng() > 0.5 ? "rgba(45,55,65,0.4)" : "rgba(35,45,55,0.32)";
        ctx.beginPath();
        ctx.ellipse(px, py, pr, pr * 0.65, rng() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Taman oval raksasa di pusat kota (landmark di 0,0)
  // Karena map infinite, kita letakkan landmark pusat di 0,0
  if (x0 < 500 && x0+w > -500 && y0 < 500 && y0+h > -500) {
    const grd = ctx.createRadialGradient(0,0,10,0,0,300);
    grd.addColorStop(0,"rgba(60,70,80,0.5)");
    grd.addColorStop(1,"rgba(51,58,64,0)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.ellipse(0,0,350,220,0,0,Math.PI*2);
    ctx.fill();
  }
}

/* ================================================================
   LAYER 2+3+4: JALAN (TROTOAR + ASPAL + MARKA)
   ================================================================ */


  // Trotoar beige
  tracePath();
  ctx.strokeStyle="#c8b882"; ctx.lineWidth=30; ctx.lineCap="round"; ctx.lineJoin="round"; ctx.setLineDash([]); ctx.stroke();

  // Aspal gelap
  tracePath();
  ctx.strokeStyle="#2e2e2e"; ctx.lineWidth=20; ctx.lineCap="round"; ctx.lineJoin="round"; ctx.stroke();

  // Batas tepi jalan (putih tipis)
  tracePath();
  ctx.strokeStyle="rgba(200,200,200,0.25)"; ctx.lineWidth=21; ctx.lineCap="round"; ctx.lineJoin="round"; ctx.setLineDash([]);
  ctx.stroke();

  // Marka tengah putus-putus
  tracePath();
  ctx.strokeStyle="rgba(255,255,255,0.5)"; ctx.lineWidth=1.8; ctx.lineCap="round"; ctx.lineJoin="round"; ctx.setLineDash([14,16]); ctx.stroke();
  ctx.setLineDash([]);
}

export function drawEdges(ctx, nodes, edges, highlightPath=[]) {
  // Gambar semua jalan
  for (const [a,b] of edges) drawOneRoad(ctx, nodes[a], nodes[b]);

  // Rute highlight kuning
  const rSet = new Set();
  for (let i=0; i<highlightPath.length-1; i++)
    rSet.add([highlightPath[i],highlightPath[i+1]].sort().join("-"));

  for (const [a,b] of edges) {
    if (!rSet.has([a,b].sort().join("-"))) continue;
    const na=nodes[a], nb=nodes[b];
    const pts = getCubicBezierPoints(na, nb, 0.25, 24);

    const tracePath = () => {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
    };

    // Glow luar
    tracePath();
    ctx.strokeStyle="rgba(251,191,36,0.3)"; ctx.lineWidth=20; ctx.lineCap="round"; ctx.lineJoin="round"; ctx.stroke();

    // Garis kuning
    tracePath();
    ctx.strokeStyle="#fbbf24"; ctx.lineWidth=6; ctx.lineCap="round"; ctx.lineJoin="round"; ctx.stroke();

    // Panah arah
    for (let i=1; i<pts.length-1; i+=4) {
      const p=pts[i], q=pts[Math.min(i+1,pts.length-1)];
      const ang=Math.atan2(q.y-p.y,q.x-p.x);
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(ang);
      ctx.fillStyle="rgba(251,191,36,0.75)";
      ctx.beginPath(); ctx.moveTo(7,0); ctx.lineTo(-4,4); ctx.lineTo(-4,-4);
      ctx.closePath(); ctx.fill(); ctx.restore();
    }
  }
}

/* ================================================================
   LAYER 5: POHON & SEMAK
   ================================================================ */
function drawTree(ctx, x, y, r, rng) {
  // Bayangan
  ctx.fillStyle="rgba(0,0,0,0.2)";
  ctx.beginPath(); ctx.ellipse(x+3,y+4,r*0.9,r*0.5,0.4,0,Math.PI*2); ctx.fill();
  // Lapisan bawah
  ctx.fillStyle=`hsl(${112+rng()*22},${52+rng()*18}%,${20+rng()*9}%)`;
  ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  // Lapisan atas
  ctx.fillStyle=`hsl(${118+rng()*18},${58+rng()*18}%,${30+rng()*12}%)`;
  ctx.beginPath(); ctx.arc(x-r*0.18,y-r*0.18,r*0.68,0,Math.PI*2); ctx.fill();
  // Highlight
  ctx.fillStyle="rgba(180,255,120,0.12)";
  ctx.beginPath(); ctx.arc(x-r*0.3,y-r*0.33,r*0.32,0,Math.PI*2); ctx.fill();
}

function drawShrub(ctx, x, y, rng) {
  const r=6+rng()*5;
  for (let i=0;i<4;i++) {
    ctx.fillStyle=`hsl(${108+rng()*28},${48+rng()*22}%,${18+rng()*14}%)`;
    ctx.beginPath(); ctx.arc(x+(rng()-0.5)*r,y+(rng()-0.5)*r,r*0.52,0,Math.PI*2); ctx.fill();
  }
}

export function drawTrees(ctx, nodes, edges) {
  // Pohon di pinggir jalan (Gunakan RNG per-edge agar culling tidak merusak sequence)
  for (const [a,b] of edges) {
    const rng = makeRng(a * 31 + b * 17);
    const na=nodes[a],nb=nodes[b];
    const pts=getCubicBezierPoints(na, nb, 0.25, 24);
    for (let i=1;i<pts.length-1;i+=3) {
      if (rng()>0.5) continue;
      const p=pts[i];
      const dx=pts[Math.min(i+1,pts.length-1)].x-pts[Math.max(i-1,0)].x;
      const dy=pts[Math.min(i+1,pts.length-1)].y-pts[Math.max(i-1,0)].y;
      const len=Math.sqrt(dx*dx+dy*dy)||1;
      const side=rng()>0.5?1:-1;
      const ox=-dy/len*(17+rng()*9)*side;
      const oy= dx/len*(17+rng()*9)*side;
      const r=8+rng()*8;
      rng()>0.28 ? drawTree(ctx,p.x+ox,p.y+oy,r,rng) : drawShrub(ctx,p.x+ox,p.y+oy,rng);
    }
  }

  // Cluster pohon acak: Tautkan cluster pada Node ID agar stabil (tidak terpengaruh array length saat chunk nambah)
  for (const nd of nodes) {
    const clusterRng = makeRng(nd.id * 53 + (nd.y | 0));
    if (clusterRng() > 0.25) continue; // Hanya 25% node yang dikelilingi cluster taman

    const bx = nd.x + (clusterRng() - 0.5) * 160;
    const by = nd.y + (clusterRng() - 0.5) * 160;
    const cnt = 3 + Math.floor(clusterRng() * 5);
    for (let t = 0; t < cnt; t++) {
      const tx = bx + (clusterRng() - 0.5) * 45;
      const ty = by + (clusterRng() - 0.5) * 45;
      clusterRng() > 0.3 ? drawTree(ctx, tx, ty, 9 + clusterRng() * 7, clusterRng) : drawShrub(ctx, tx, ty, clusterRng);
    }
  }
}

/* ================================================================
   LAYER 6: IKON LOKASI WISATA — REALISTIS TOP-DOWN
   Setiap lokasi punya gambar unik yang langsung dikenali.
   ================================================================ */

/** Helper: shadow tipis di bawah struktur */
function shadow(ctx, x, y, w, h, r=3) {
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath(); ctx.roundRect(x+3,y+4,w,h,r); ctx.fill();
}

/** Helper: dinding + atap blok bangunan standar */
function block(ctx, x, y, w, h, wallColor, roofColor, rx=3) {
  shadow(ctx, x, y, w, h, rx);
  ctx.fillStyle = wallColor; ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, rx); ctx.fill(); ctx.stroke();
  ctx.fillStyle = roofColor;
  ctx.beginPath(); ctx.roundRect(x, y, w, h*0.32, rx); ctx.fill();
}

/** Helper: jendela berpendar */
function windows(ctx, ...rects) {
  ctx.fillStyle = "rgba(255,248,180,0.8)";
  ctx.strokeStyle = "rgba(180,160,60,0.5)"; ctx.lineWidth = 0.5;
  for (const [x,y,w,h] of rects) {
    ctx.beginPath(); ctx.roundRect(x,y,w,h,1); ctx.fill(); ctx.stroke();
  }
}

/* ───────────────────────────────────────────────────────────────────
   1. GERBANG MASUK — Gapura megah 2 menara + lengkung
   ─────────────────────────────────────────────────────────────────── */
function iconGerbangMasuk(ctx, nd) {
  const x=nd.x, y=nd.y-34;

  // Lantai gerbang (batu bata)
  ctx.fillStyle="#c9a96e"; ctx.strokeStyle="rgba(0,0,0,0.2)"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.roundRect(x-26,y+2,52,18,2); ctx.fill(); ctx.stroke();
  // Pola bata
  ctx.strokeStyle="rgba(120,80,30,0.35)"; ctx.lineWidth=0.7;
  for (let bx=-22;bx<22;bx+=8) { ctx.beginPath(); ctx.moveTo(x+bx,y+2); ctx.lineTo(x+bx,y+20); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(x-26,y+10); ctx.lineTo(x+26,y+10); ctx.stroke();

  // Menara kiri
  shadow(ctx, x-26,y-22,13,28,2);
  ctx.fillStyle="#8b5e3c"; ctx.strokeStyle="rgba(0,0,0,0.3)"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.roundRect(x-26,y-22,13,28,2); ctx.fill(); ctx.stroke();
  ctx.fillStyle="#6b3a1f";
  ctx.beginPath(); ctx.roundRect(x-26,y-22,13,9,2); ctx.fill();
  windows(ctx, [x-23,y-13,4,5], [x-23,y-5,4,5]);

  // Menara kanan
  shadow(ctx, x+13,y-22,13,28,2);
  ctx.fillStyle="#8b5e3c"; ctx.strokeStyle="rgba(0,0,0,0.3)"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.roundRect(x+13,y-22,13,28,2); ctx.fill(); ctx.stroke();
  ctx.fillStyle="#6b3a1f";
  ctx.beginPath(); ctx.roundRect(x+13,y-22,13,9,2); ctx.fill();
  windows(ctx, [x+16,y-13,4,5], [x+16,y-5,4,5]);

  // Lengkung tengah
  ctx.fillStyle="#c0392b"; ctx.strokeStyle="rgba(0,0,0,0.3)"; ctx.lineWidth=1;
  ctx.beginPath();
  ctx.moveTo(x-13,y+2); ctx.lineTo(x-13,y-14);
  ctx.quadraticCurveTo(x-13,y-22,x,y-26);
  ctx.quadraticCurveTo(x+13,y-22,x+13,y-14);
  ctx.lineTo(x+13,y+2); ctx.lineTo(x+10,y+2);
  ctx.lineTo(x+10,y-12); ctx.quadraticCurveTo(x+10,y-19,x,y-22);
  ctx.quadraticCurveTo(x-10,y-19,x-10,y-12);
  ctx.lineTo(x-10,y+2); ctx.closePath();
  ctx.fill(); ctx.stroke();

  // Ornamen puncak menara
  for (const sx of [-20, 20]) {
    ctx.fillStyle="#f39c12";
    ctx.beginPath(); ctx.arc(x+sx,y-25,3,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#e67e22";
    ctx.beginPath(); ctx.moveTo(x+sx,y-30); ctx.lineTo(x+sx-3,y-25); ctx.lineTo(x+sx+3,y-25);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle="#f1c40f";
  ctx.beginPath(); ctx.arc(x,y-28,4,0,Math.PI*2); ctx.fill();

  // Tanda
  ctx.font="bold 5px 'Courier New',monospace";
  ctx.fillStyle="#fef9c3"; ctx.textAlign="center"; ctx.textBaseline="middle";
  ctx.fillText("KOTA SELATAN",x,y-6);
}

/* ───────────────────────────────────────────────────────────────────
   2. WAHANA PERMAINAN — Bianglala + tenda warna-warni
   ─────────────────────────────────────────────────────────────────── */
function iconWahana(ctx, nd) {
  const x=nd.x, y=nd.y-28;

  // Tenda besar (top-down = oval warna-warni)
  const cols=["#e74c3c","#f39c12","#2ecc71","#3498db","#9b59b6","#e74c3c"];
  const segments=6;
  for (let i=0;i<segments;i++) {
    const a1=(i/segments)*Math.PI*2 - Math.PI/2;
    const a2=((i+1)/segments)*Math.PI*2 - Math.PI/2;
    ctx.fillStyle=cols[i];
    ctx.beginPath(); ctx.moveTo(x,y);
    ctx.arc(x,y,20,a1,a2); ctx.closePath(); ctx.fill();
  }
  // Ring tengah
  ctx.fillStyle="#fff"; ctx.strokeStyle="rgba(0,0,0,0.2)"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.arc(x,y,5,0,Math.PI*2); ctx.fill(); ctx.stroke();

  // Gondola kecil di sekeliling bianglala
  for (let i=0;i<6;i++) {
    const ang=(i/6)*Math.PI*2;
    const gx=x+Math.cos(ang)*18, gy=y+Math.sin(ang)*18;
    ctx.fillStyle=cols[i]; ctx.strokeStyle="#fff"; ctx.lineWidth=0.8;
    ctx.beginPath(); ctx.arc(gx,gy,3.5,0,Math.PI*2); ctx.fill(); ctx.stroke();
  }

  // Tiang penyangga
  ctx.strokeStyle="rgba(0,0,0,0.4)"; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(x,y+20); ctx.lineTo(x,y+30); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x-15,y+22); ctx.lineTo(x,y+30); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x+15,y+22); ctx.lineTo(x,y+30); ctx.stroke();

  // Label
  ctx.font="bold 6px 'Courier New',monospace";
  ctx.fillStyle="#1a1a2e"; ctx.textAlign="center"; ctx.textBaseline="middle";
  ctx.fillStyle="rgba(0,0,0,0.6)";
  ctx.beginPath(); ctx.roundRect(x-16,y+30,32,10,2); ctx.fill();
  ctx.fillStyle="#fff"; ctx.fillText("BALAI",x,y+35);
}

/* ───────────────────────────────────────────────────────────────────
   3. SPOT FOTO — Podium foto + bintang + frame
   ─────────────────────────────────────────────────────────────────── */
function iconSpotFoto(ctx, nd) {
  const x=nd.x, y=nd.y-28;

  // Backdrop / latar foto (persegi panjang bercat)
  shadow(ctx, x-22,y-18,44,36,4);
  ctx.fillStyle="#0e7c6a"; ctx.strokeStyle="#0a5c4e"; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.roundRect(x-22,y-18,44,36,4); ctx.fill(); ctx.stroke();

  // Bingkai foto
  ctx.strokeStyle="#f1c40f"; ctx.lineWidth=3;
  ctx.beginPath(); ctx.roundRect(x-17,y-13,34,26,2); ctx.stroke();

  // Ikon kamera di tengah
  ctx.fillStyle="#fff"; ctx.strokeStyle="rgba(0,0,0,0.3)"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.roundRect(x-10,y-6,20,14,3); ctx.fill(); ctx.stroke();
  ctx.fillStyle="#0e7c6a";
  ctx.beginPath(); ctx.arc(x,y+1,5,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#b8d4d0";
  ctx.beginPath(); ctx.arc(x,y+1,3.5,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#fff";
  ctx.beginPath(); ctx.arc(x-0.8,y+0.2,1.5,0,Math.PI*2); ctx.fill();
  // Tombol shutter
  ctx.fillStyle="#e74c3c";
  ctx.beginPath(); ctx.arc(x+7,y-3,2,0,Math.PI*2); ctx.fill();

  // Bintang hiasan
  const starColor="#f1c40f";
  function star(sx,sy,sr) {
    ctx.fillStyle=starColor;
    ctx.beginPath();
    for(let i=0;i<5;i++){
      const a=(i*4*Math.PI/5)-Math.PI/2;
      const b=a+2*Math.PI/10;
      i===0?ctx.moveTo(sx+Math.cos(a)*sr,sy+Math.sin(a)*sr):ctx.lineTo(sx+Math.cos(a)*sr,sy+Math.sin(a)*sr);
      ctx.lineTo(sx+Math.cos(b)*sr*0.4,sy+Math.sin(b)*sr*0.4);
    }
    ctx.closePath(); ctx.fill();
  }
  star(x-18,y-14,3.5); star(x+18,y-14,3.5);
  star(x-18,y+14,3); star(x+18,y+14,3);
}

/* ───────────────────────────────────────────────────────────────────
   4. PUSAT KULINER — Atap tenda warung + meja kursi
   ─────────────────────────────────────────────────────────────────── */
function iconPusatKuliner(ctx, nd, isAlt=false) {
  const x=nd.x, y=nd.y-26;
  const roofCol = isAlt ? "#c0392b" : "#d35400";
  const tentStripe = isAlt ? "#e74c3c" : "#e67e22";

  // Lapak 3 warung berderet
  const stalls = [-18, 0, 18];
  for (let i=0;i<stalls.length;i++) {
    const sx=x+stalls[i], sy=y;
    // Badan warung
    shadow(ctx, sx-9,sy-8,18,20,2);
    ctx.fillStyle="#fef9c3"; ctx.strokeStyle="rgba(0,0,0,0.2)"; ctx.lineWidth=1;
    ctx.beginPath(); ctx.roundRect(sx-9,sy-8,18,20,2); ctx.fill(); ctx.stroke();
    // Tenda warung (segitiga)
    ctx.fillStyle=i%2===0?roofCol:tentStripe;
    ctx.beginPath(); ctx.moveTo(sx-11,sy-8); ctx.lineTo(sx,sy-18); ctx.lineTo(sx+11,sy-8);
    ctx.closePath(); ctx.fill();
    // Counter
    ctx.fillStyle="#d4a76a";
    ctx.beginPath(); ctx.roundRect(sx-7,sy+5,14,5,1); ctx.fill();
    // Makanan di counter (titik kecil berwarna)
    ctx.fillStyle="#e74c3c"; ctx.beginPath(); ctx.arc(sx-3,sy+7.5,2,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#f39c12"; ctx.beginPath(); ctx.arc(sx+1,sy+7.5,2,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#27ae60"; ctx.beginPath(); ctx.arc(sx+5,sy+7.5,2,0,Math.PI*2); ctx.fill();
  }

  // Meja + kursi outdoor (2 meja di depan)
  for (const mx of [-10,10]) {
    ctx.fillStyle="#a0522d"; ctx.strokeStyle="rgba(0,0,0,0.3)"; ctx.lineWidth=0.8;
    ctx.beginPath(); ctx.arc(x+mx,y+28,4,0,Math.PI*2); ctx.fill(); ctx.stroke();
    // Kursi 4 titik
    ctx.fillStyle="#8b4513";
    for (const [cx,cy] of [[x+mx-7,y+28],[x+mx+7,y+28],[x+mx,y+22],[x+mx,y+34]]) {
      ctx.beginPath(); ctx.arc(cx,cy,2,0,Math.PI*2); ctx.fill();
    }
  }
}

/* ───────────────────────────────────────────────────────────────────
   5. TOILET — Bangunan WC dengan simbol pria & wanita
   ─────────────────────────────────────────────────────────────────── */
function iconToilet(ctx, nd) {
  const x=nd.x, y=nd.y-26;

  // Bangunan utama
  shadow(ctx, x-22,y-16,44,34,3);
  ctx.fillStyle="#ecf0f1"; ctx.strokeStyle="#bdc3c7"; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.roundRect(x-22,y-16,44,34,3); ctx.fill(); ctx.stroke();

  // Atap
  ctx.fillStyle="#95a5a6";
  ctx.beginPath(); ctx.roundRect(x-22,y-16,44,10,3); ctx.fill();

  // Partisi tengah
  ctx.strokeStyle="#bdc3c7"; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(x,y-6); ctx.lineTo(x,y+18); ctx.stroke();

  // Simbol PRIA (kiri) — lingkaran + tubuh
  ctx.fillStyle="#3498db";
  ctx.beginPath(); ctx.arc(x-11,y-2,4,0,Math.PI*2); ctx.fill(); // kepala
  ctx.beginPath();
  ctx.moveTo(x-11,y+2); ctx.lineTo(x-11,y+11);
  ctx.moveTo(x-15,y+5); ctx.lineTo(x-7,y+5);   // tangan
  ctx.moveTo(x-14,y+11); ctx.lineTo(x-11,y+18); // kaki kiri
  ctx.moveTo(x-8,y+11);  ctx.lineTo(x-11,y+18); // kaki kanan
  ctx.strokeStyle="#3498db"; ctx.lineWidth=2.5; ctx.stroke();

  // Simbol WANITA (kanan) — lingkaran + rok segitiga
  ctx.fillStyle="#e91e63";
  ctx.beginPath(); ctx.arc(x+11,y-2,4,0,Math.PI*2); ctx.fill(); // kepala
  ctx.beginPath(); ctx.moveTo(x+11,y+2); ctx.lineTo(x+11,y+7); ctx.stroke(); // badan
  ctx.beginPath();
  ctx.moveTo(x+6,y+7); ctx.lineTo(x+11,y+18); ctx.lineTo(x+16,y+7);
  ctx.closePath(); ctx.fillStyle="#e91e63"; ctx.fill(); // rok
  ctx.beginPath();
  ctx.moveTo(x+8,y+5); ctx.lineTo(x+14,y+5); // tangan
  ctx.strokeStyle="#e91e63"; ctx.lineWidth=2.5; ctx.stroke();

  // Tanda POM BENSIN
  ctx.font="bold 6px 'Courier New',monospace";
  ctx.fillStyle="#7f8c8d"; ctx.textAlign="center"; ctx.textBaseline="middle";
  ctx.fillText("GAS",x,y-11);
}

/* ───────────────────────────────────────────────────────────────────
   6. AREA BERMAIN AIR — Water park dengan seluncuran & kolam
   ─────────────────────────────────────────────────────────────────── */
function iconAreaAir(ctx, nd, rng) {
  const x=nd.x, y=nd.y-24;

  // Kolam utama (biru, bentuk organik)
  ctx.fillStyle="#1a9fd4"; ctx.strokeStyle="#1a7eb8"; ctx.lineWidth=1.5;
  ctx.beginPath();
  ctx.ellipse(x,y+5,24,16,0,0,Math.PI*2); ctx.fill(); ctx.stroke();

  // Kilap air
  ctx.fillStyle="rgba(255,255,255,0.3)";
  ctx.beginPath(); ctx.ellipse(x-8,y,9,5,-0.4,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x+7,y+7,6,3,0.5,0,Math.PI*2); ctx.fill();

  // Gelombang air
  ctx.strokeStyle="rgba(255,255,255,0.4)"; ctx.lineWidth=1.5;
  for (let wx=-14;wx<14;wx+=8) {
    ctx.beginPath();
    ctx.moveTo(x+wx,y+10);
    ctx.quadraticCurveTo(x+wx+2,y+7,x+wx+4,y+10);
    ctx.stroke();
  }

  // Seluncuran spiral (kiri atas)
  ctx.strokeStyle="#e74c3c"; ctx.lineWidth=3; ctx.lineCap="round";
  ctx.beginPath();
  ctx.moveTo(x-22,y-18);
  ctx.quadraticCurveTo(x-14,y-22,x-8,y-14);
  ctx.quadraticCurveTo(x-2,y-6,x-10,y+4);
  ctx.stroke();
  // Platform atas seluncuran
  ctx.fillStyle="#f39c12";
  ctx.beginPath(); ctx.roundRect(x-27,y-22,10,8,2); ctx.fill();

  // Seluncuran lurus (kanan)
  ctx.strokeStyle="#27ae60"; ctx.lineWidth=3;
  ctx.beginPath();
  ctx.moveTo(x+22,y-16); ctx.lineTo(x+10,y+2); ctx.stroke();
  ctx.fillStyle="#f39c12";
  ctx.beginPath(); ctx.roundRect(x+17,y-22,12,8,2); ctx.fill();

  // Tangga naik
  ctx.strokeStyle="#e67e22"; ctx.lineWidth=1.5;
  for (let step=0;step<3;step++) {
    ctx.beginPath();
    ctx.moveTo(x+17,y-8+step*5); ctx.lineTo(x+29,y-8+step*5); ctx.stroke();
  }
}

/* ───────────────────────────────────────────────────────────────────
   7. PENGINAPAN / HOTEL — Gedung L-shape top-down + kamar + kolam
   ─────────────────────────────────────────────────────────────────── */
function iconPenginapan(ctx, nd) {
  const x=nd.x, y=nd.y-26;

  // Sayap kiri gedung
  shadow(ctx, x-24,y-18,28,38,3);
  ctx.fillStyle="#7a5c3a"; ctx.strokeStyle="rgba(0,0,0,0.35)"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.roundRect(x-24,y-18,28,38,3); ctx.fill(); ctx.stroke();
  ctx.fillStyle="#5c3d22"; // atap
  ctx.beginPath(); ctx.roundRect(x-24,y-18,28,11,3); ctx.fill();

  // Sayap kanan (lebih pendek)
  shadow(ctx, x+4,y-10,18,28,3);
  ctx.fillStyle="#7a5c3a"; ctx.strokeStyle="rgba(0,0,0,0.35)"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.roundRect(x+4,y-10,18,28,3); ctx.fill(); ctx.stroke();
  ctx.fillStyle="#5c3d22";
  ctx.beginPath(); ctx.roundRect(x+4,y-10,18,9,3); ctx.fill();

  // Grid kamar — sayap kiri
  for (let row=0;row<3;row++) {
    for (let col=0;col<3;col++) {
      const occupied = (row+col)%3 !== 2;
      ctx.fillStyle = occupied ? "rgba(255,248,180,0.75)" : "rgba(80,80,80,0.4)";
      ctx.strokeStyle="rgba(0,0,0,0.2)"; ctx.lineWidth=0.5;
      ctx.beginPath(); ctx.roundRect(x-22+col*9,y-5+row*9,7,7,1); ctx.fill(); ctx.stroke();
    }
  }
  // Grid kamar — sayap kanan
  for (let row=0;row<2;row++) {
    for (let col=0;col<2;col++) {
      ctx.fillStyle = "rgba(255,248,180,0.75)";
      ctx.strokeStyle="rgba(0,0,0,0.2)"; ctx.lineWidth=0.5;
      ctx.beginPath(); ctx.roundRect(x+6+col*8,y+1+row*9,6,7,1); ctx.fill(); ctx.stroke();
    }
  }

  // Mini kolam renang hotel
  ctx.fillStyle="#5dade2"; ctx.strokeStyle="#2980b9"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.roundRect(x+5,y+20,16,8,3); ctx.fill(); ctx.stroke();
  ctx.fillStyle="rgba(255,255,255,0.25)";
  ctx.beginPath(); ctx.ellipse(x+11,y+23,5,3,0,0,Math.PI*2); ctx.fill();

  // Tanda Rumah Sakit
  ctx.font="bold 12px 'Courier New',monospace";
  ctx.fillStyle="rgba(255,100,100,0.8)"; ctx.textAlign="center"; ctx.textBaseline="middle";
  ctx.fillText("+",x-10,y-12);
}

/* ───────────────────────────────────────────────────────────────────
   8. TAMAN BUNGA — Pola bunga geometris + gazebo
   ─────────────────────────────────────────────────────────────────── */
function iconTamanBunga(ctx, nd, rng) {
  const x=nd.x, y=nd.y-22;

  // Area taman (rumput hijau)
  ctx.fillStyle="#27ae60"; ctx.strokeStyle="#1e8449"; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.roundRect(x-24,y-18,48,38,20); ctx.fill(); ctx.stroke();

  // Path taman (jalan setapak)
  ctx.strokeStyle="#d4b896"; ctx.lineWidth=4;
  ctx.beginPath(); ctx.moveTo(x,y-18); ctx.lineTo(x,y+20); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x-24,y); ctx.lineTo(x+24,y); ctx.stroke();

  // Bunga di 4 kuadran
  const flowerPatterns=[
    {x:x-13,y:y-10,col:"#e74c3c"},{x:x+13,y:y-10,col:"#f1c40f"},
    {x:x-13,y:y+10,col:"#9b59b6"},{x:x+13,y:y+10,col:"#e91e63"},
  ];
  for (const f of flowerPatterns) {
    // Kelopak
    for (let p=0;p<6;p++) {
      const pa=p/6*Math.PI*2;
      ctx.fillStyle=f.col;
      ctx.beginPath(); ctx.ellipse(f.x+Math.cos(pa)*5,f.y+Math.sin(pa)*5,3,2,pa,0,Math.PI*2);
      ctx.fill();
    }
    // Putik tengah
    ctx.fillStyle="#f9ca24";
    ctx.beginPath(); ctx.arc(f.x,f.y,3,0,Math.PI*2); ctx.fill();
  }

  // Gazebo di tengah (lingkaran atap merah)
  ctx.fillStyle="#c0392b"; ctx.strokeStyle="#922b21"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.arc(x,y,7,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.fillStyle="#e74c3c";
  ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#f39c12";
  ctx.beginPath(); ctx.arc(x,y,2,0,Math.PI*2); ctx.fill();

  // Tiang gazebo
  ctx.strokeStyle="rgba(0,0,0,0.35)"; ctx.lineWidth=1;
  for (let p=0;p<4;p++) {
    const ang=p/4*Math.PI*2+Math.PI/4;
    ctx.beginPath();
    ctx.moveTo(x+Math.cos(ang)*7,y+Math.sin(ang)*7);
    ctx.lineTo(x+Math.cos(ang)*12,y+Math.sin(ang)*12);
    ctx.stroke();
  }
}

/* ───────────────────────────────────────────────────────────────────
   9. KOLAM RENANG — Olympic pool + lane lines + diving board
   ─────────────────────────────────────────────────────────────────── */
function iconKolamRenang(ctx, nd) {
  const x=nd.x, y=nd.y-24;

  // Tepi kolam (putih/abu)
  shadow(ctx, x-24,y-16,48,38,4);
  ctx.fillStyle="#d6eaf8"; ctx.strokeStyle="#85c1e9"; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.roundRect(x-24,y-16,48,38,4); ctx.fill(); ctx.stroke();

  // Air kolam
  ctx.fillStyle="#1a9fd4"; ctx.strokeStyle="#1a7eb8"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.roundRect(x-20,y-12,40,28,3); ctx.fill(); ctx.stroke();

  // Lane lines (5 jalur)
  const laneColors=["#f39c12","#fff","#f39c12","#fff","#f39c12"];
  for (let i=0;i<5;i++) {
    ctx.strokeStyle=laneColors[i]; ctx.lineWidth=1.2; ctx.setLineDash([4,3]);
    ctx.beginPath(); ctx.moveTo(x-20,y-7+i*5.5); ctx.lineTo(x+20,y-7+i*5.5); ctx.stroke();
  }
  ctx.setLineDash([]);

  // Angka jalur
  ctx.font="5px 'Courier New',monospace"; ctx.fillStyle="rgba(255,255,255,0.5)";
  ctx.textAlign="center"; ctx.textBaseline="middle";
  for (let i=0;i<5;i++) ctx.fillText(i+1, x-22, y-5+i*5.5);

  // Kilap air
  ctx.fillStyle="rgba(255,255,255,0.22)";
  ctx.beginPath(); ctx.ellipse(x-8,y-5,10,5,-0.3,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x+8,y+8,7,4,0.4,0,Math.PI*2); ctx.fill();

  // Papan loncat (diving board)
  ctx.fillStyle="#f39c12"; ctx.strokeStyle="#d68910"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.roundRect(x+18,y-14,8,5,1); ctx.fill(); ctx.stroke();
  ctx.strokeStyle="#d68910"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(x+22,y-9); ctx.lineTo(x+22,y-12); ctx.stroke();

  // Tangga masuk kolam
  ctx.fillStyle="#aed6f1"; ctx.strokeStyle="#85c1e9"; ctx.lineWidth=0.8;
  for (let s=0;s<3;s++) {
    ctx.beginPath(); ctx.roundRect(x-24,y+6+s*4,5,3,1); ctx.fill(); ctx.stroke();
  }
}

/* ───────────────────────────────────────────────────────────────────
   10. AREA PARKIR — Lot parkir dengan mobil top-down
   ─────────────────────────────────────────────────────────────────── */
function iconAreaParkir(ctx, nd, rng) {
  const x=nd.x, y=nd.y-22;

  // Lantai aspal
  shadow(ctx, x-24,y-18,48,38,3);
  ctx.fillStyle="#3a3a3a"; ctx.strokeStyle="#4a4a4a"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.roundRect(x-24,y-18,48,38,3); ctx.fill(); ctx.stroke();

  // Garis slot parkir (4 kolom x 2 baris)
  ctx.strokeStyle="rgba(255,255,255,0.55)"; ctx.lineWidth=1;
  for (let col=0;col<5;col++) {
    ctx.beginPath(); ctx.moveTo(x-22+col*11,y-16); ctx.lineTo(x-22+col*11,y+20); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(x-22,y+0); ctx.lineTo(x+22,y+0); ctx.stroke();

  // Mobil parkir (top-down, kotak berwarna kecil) — 6 slot
  const carCols=["#e74c3c","#3498db","#f1c40f","#2ecc71","#9b59b6","#e67e22"];
  const slots=[
    [x-18,y-12],[x-7,y-12],[x+4,y-12],
    [x-18,y+4], [x-7,y+4], [x+4,y+4],
  ];
  for (let i=0;i<slots.length;i++) {
    if (rng()>0.3) { // tidak semua slot terisi
      const [sx,sy]=slots[i];
      ctx.fillStyle=carCols[i]; ctx.strokeStyle="rgba(0,0,0,0.4)"; ctx.lineWidth=0.8;
      ctx.beginPath(); ctx.roundRect(sx,sy,8,10,1.5); ctx.fill(); ctx.stroke();
      // Kaca depan mobil
      ctx.fillStyle="rgba(200,230,255,0.6)";
      ctx.beginPath(); ctx.roundRect(sx+1,sy+1,6,3,1); ctx.fill();
    }
  }

  // Tanda P besar
  ctx.font="bold 14px 'Courier New',monospace";
  ctx.fillStyle="rgba(255,255,255,0.18)"; ctx.textAlign="center"; ctx.textBaseline="middle";
  ctx.fillText("P",x+17,y+10);

  // Rambu arah
  ctx.fillStyle="#f1c40f"; ctx.strokeStyle="#d4ac0d"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.roundRect(x+19,y-18,6,12,1); ctx.fill(); ctx.stroke();
  ctx.font="bold 6px 'Courier New',monospace";
  ctx.fillStyle="#1a1a1a"; ctx.textAlign="center";
  ctx.fillText("P",x+22,y-12);
}

/* ───────────────────────────────────────────────────────────────────
   11. MUSHOLA — Kubah + menara + bulan bintang
   ─────────────────────────────────────────────────────────────────── */
function iconMushola(ctx, nd) {
  const x=nd.x, y=nd.y-28;

  // Lantai / halaman mushola
  ctx.fillStyle="#d4c5a9"; ctx.strokeStyle="#b8a88a"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.roundRect(x-22,y-10,44,36,3); ctx.fill(); ctx.stroke();

  // Bangunan utama (persegi)
  shadow(ctx, x-14,y-16,28,26,2);
  ctx.fillStyle="#1a5276"; ctx.strokeStyle="#154360"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.roundRect(x-14,y-16,28,26,2); ctx.fill(); ctx.stroke();

  // Kubah utama (setengah lingkaran atas)
  ctx.fillStyle="#1f618d"; ctx.strokeStyle="#154360"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.arc(x,y-16,14,Math.PI,0); ctx.closePath(); ctx.fill(); ctx.stroke();
  // Kubah strip terang
  ctx.fillStyle="#2471a3";
  ctx.beginPath(); ctx.arc(x,y-16,10,Math.PI,0); ctx.closePath(); ctx.fill();
  ctx.fillStyle="#2980b9";
  ctx.beginPath(); ctx.arc(x,y-16,6,Math.PI,0); ctx.closePath(); ctx.fill();

  // Mihrab (lengkung di tengah bangunan)
  ctx.fillStyle="#d4ac0d"; ctx.strokeStyle="#b7950b"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.arc(x,y+2,6,Math.PI,0); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle="#1a5276";
  ctx.beginPath(); ctx.roundRect(x-4,y+2,8,8,0); ctx.fill();

  // Menara kiri
  ctx.fillStyle="#154360"; ctx.strokeStyle="rgba(0,0,0,0.3)"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.roundRect(x-24,y-14,7,28,2); ctx.fill(); ctx.stroke();
  // Kubah menara
  ctx.fillStyle="#1f618d";
  ctx.beginPath(); ctx.arc(x-20.5,y-14,3.5,Math.PI,0); ctx.closePath(); ctx.fill();

  // Menara kanan
  ctx.fillStyle="#154360"; ctx.strokeStyle="rgba(0,0,0,0.3)"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.roundRect(x+17,y-14,7,28,2); ctx.fill(); ctx.stroke();
  ctx.fillStyle="#1f618d";
  ctx.beginPath(); ctx.arc(x+20.5,y-14,3.5,Math.PI,0); ctx.closePath(); ctx.fill();

  // Bulan sabit & bintang di puncak kubah
  ctx.fillStyle="#d4ac0d"; ctx.strokeStyle="#b7950b"; ctx.lineWidth=0.8;
  // Tiang
  ctx.strokeStyle="#d4ac0d"; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(x,y-30); ctx.lineTo(x,y-34); ctx.stroke();
  // Bulan sabit
  ctx.fillStyle="#d4ac0d";
  ctx.beginPath(); ctx.arc(x,y-36,4,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#1a5276"; // potong lingkaran
  ctx.beginPath(); ctx.arc(x+2,y-36,3.2,0,Math.PI*2); ctx.fill();
  // Bintang kecil
  ctx.fillStyle="#d4ac0d";
  ctx.beginPath(); ctx.arc(x+4,y-39,1.5,0,Math.PI*2); ctx.fill();

  // Tiang menara kanan
  ctx.strokeStyle="#d4ac0d"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(x+20.5,y-18); ctx.lineTo(x+20.5,y-21); ctx.stroke();
  ctx.fillStyle="#d4ac0d";
  ctx.beginPath(); ctx.arc(x+20.5,y-22,1.8,0,Math.PI*2); ctx.fill();
}

/* ───────────────────────────────────────────────────────────────────
   12. KIOS SOUVENIR — Deretan booth + etalase
   ─────────────────────────────────────────────────────────────────── */
function iconKiosSouvenir(ctx, nd, rng) {
  const x=nd.x, y=nd.y-24;

  // Latar area kios
  shadow(ctx, x-24,y-18,48,38,4);
  ctx.fillStyle="#4a235a"; ctx.strokeStyle="#6c3483"; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.roundRect(x-24,y-18,48,38,4); ctx.fill(); ctx.stroke();

  // 3 booth souvenir
  const boothCols=["#8e44ad","#7d3c98","#6c3483"];
  for (let i=0;i<3;i++) {
    const bx=x-18+i*18, by=y-12;
    // Badan booth
    ctx.fillStyle=boothCols[i]; ctx.strokeStyle="rgba(0,0,0,0.3)"; ctx.lineWidth=1;
    ctx.beginPath(); ctx.roundRect(bx-7,by,14,24,2); ctx.fill(); ctx.stroke();
    // Tenda awning
    ctx.fillStyle=i%2===0?"#f1c40f":"#e74c3c";
    ctx.beginPath();
    ctx.moveTo(bx-9,by); ctx.lineTo(bx,by-8); ctx.lineTo(bx+9,by);
    ctx.closePath(); ctx.fill();
    // Etalase
    ctx.fillStyle="rgba(255,255,255,0.15)"; ctx.strokeStyle="rgba(255,255,255,0.3)"; ctx.lineWidth=0.5;
    ctx.beginPath(); ctx.roundRect(bx-5,by+3,10,8,1); ctx.fill(); ctx.stroke();
    // Produk di etalase (titik warna)
    const pCols=["#e74c3c","#3498db","#2ecc71","#f39c12"];
    for (let p=0;p<4;p++) {
      ctx.fillStyle=pCols[p];
      ctx.beginPath(); ctx.arc(bx-3+p*2,by+7,1.2,0,Math.PI*2); ctx.fill();
    }
    // Papan nama booth
    ctx.fillStyle="#f1c40f"; ctx.strokeStyle="#d4ac0d"; ctx.lineWidth=0.5;
    ctx.beginPath(); ctx.roundRect(bx-6,by+14,12,4,1); ctx.fill(); ctx.stroke();
  }

  // Banner "KIOS BAJU" di atas
  ctx.fillStyle="#f1c40f"; ctx.strokeStyle="#d4ac0d"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.roundRect(x-20,y-18,40,8,2); ctx.fill(); ctx.stroke();
  ctx.font="bold 5px 'Courier New',monospace";
  ctx.fillStyle="#4a235a"; ctx.textAlign="center"; ctx.textBaseline="middle";
  ctx.fillText("KIOS BAJU",x,y-14);

  // Pengunjung (titik-titik kecil di bawah)
  for (let v=0;v<4;v++) {
    ctx.fillStyle=["#e74c3c","#3498db","#2ecc71","#f39c12"][v];
    ctx.beginPath(); ctx.arc(x-12+v*8,y+22,2.5,0,Math.PI*2); ctx.fill();
  }
}

/* ───────────────────────────────────────────────────────────────────
   DISPATCHER: pilih fungsi ikon sesuai label
   ─────────────────────────────────────────────────────────────────── */
export function drawBuildings(ctx, nodes) {
  for (const nd of nodes) {
    // RNG per-bangunan berdasarkan ID agar tetap stabil meski dicull
    const rng = makeRng(nd.id * 31 + (nd.x | 0));
    const r = () => rng();
    switch (nd.label) {
      case "Gerbang Kota":      iconGerbangMasuk(ctx, nd); break;
      case "Balai Kota":        iconWahana(ctx, nd); break;
      case "Monumen Kota":      iconSpotFoto(ctx, nd); break;
      case "Pasar Tradisional": iconPusatKuliner(ctx, nd, false); break;
      case "Pusat Makanan":     iconPusatKuliner(ctx, nd, true); break;
      case "Pom Bensin":        iconToilet(ctx, nd); break;
      case "Taman Air":         iconAreaAir(ctx, nd, r); break;
      case "Rumah Sakit":       iconPenginapan(ctx, nd); break;
      case "Taman Kota":        iconTamanBunga(ctx, nd, r); break;
      case "Kolam Renang Umum": iconKolamRenang(ctx, nd); break;
      case "Area Parkir Pusat": iconAreaParkir(ctx, nd, r); break;
      case "Masjid Raya":       iconMushola(ctx, nd); break;
      case "Kios Baju":         iconKiosSouvenir(ctx, nd, r); break;
      default: {
        // Fallback bangunan generik
        const bx=nd.x+(r()-0.5)*20, by=nd.y-28;
        shadow(ctx,bx-16,by-12,32,24,3);
        ctx.fillStyle="#5d6d7e"; ctx.strokeStyle="rgba(0,0,0,0.35)"; ctx.lineWidth=1;
        ctx.beginPath(); ctx.roundRect(bx-16,by-12,32,24,3); ctx.fill(); ctx.stroke();
        ctx.fillStyle="#85929e";
        ctx.beginPath(); ctx.roundRect(bx-16,by-12,32,8,3); ctx.fill();
        windows(ctx,[bx-10,by-2,6,5],[bx+4,by-2,6,5]);
      }
    }
  }
}

/* ================================================================
   LAYER 7: TIANG LAMPU JALAN
/* ================================================================
   LAYER 7: TIANG LAMPU JALAN
   ================================================================ */
export function drawStreetLamps(ctx, nodes, edges) {
  for (const [a,b] of edges) {
    const rng = makeRng(a * 17 + b * 43); // RNG per-edge
    const na=nodes[a], nb=nodes[b];
    const pts=getCubicBezierPoints(na, nb, 0.25, 24);
    for (let i=1;i<pts.length-1;i+=5) {
      if (rng()>0.6) continue;
      const p=pts[i];
      const dx=pts[Math.min(i+1,pts.length-1)].x-pts[Math.max(i-1,0)].x;
      const dy=pts[Math.min(i+1,pts.length-1)].y-pts[Math.max(i-1,0)].y;
      const len=Math.sqrt(dx*dx+dy*dy)||1;
      const side=rng()>0.5?1:-1;
      const ox=-dy/len*15*side, oy=dx/len*15*side;
      const lx=p.x+ox, ly=p.y+oy;
      // Tiang
      ctx.strokeStyle="#9ca3af"; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(lx,ly); ctx.lineTo(lx,ly-13);
      ctx.lineTo(lx+5*side,ly-15); ctx.stroke();
      // Lampu
      ctx.fillStyle="#fef08a"; ctx.strokeStyle="#ca8a04"; ctx.lineWidth=0.8;
      ctx.beginPath(); ctx.arc(lx+5*side,ly-15,3.2,0,Math.PI*2);
      ctx.fill(); ctx.stroke();
      // Cahaya
      const grd=ctx.createRadialGradient(lx+5*side,ly-15,0,lx+5*side,ly-15,14);
      grd.addColorStop(0,"rgba(254,240,138,0.2)"); grd.addColorStop(1,"rgba(254,240,138,0)");
      ctx.fillStyle=grd;
      ctx.beginPath(); ctx.arc(lx+5*side,ly-15,14,0,Math.PI*2); ctx.fill();
    }
  }
}

/* ================================================================
   LAYER 8: BOBOT JARAK
   ================================================================ */
export function drawWeights(ctx, nodes, edges) {
  ctx.font="10px 'Courier New',monospace";
  ctx.textAlign="center"; ctx.textBaseline="middle";
  for (const [a,b] of edges) {
    const na=nodes[a], nb=nodes[b];
    // Ambil titik tengah dari kurva bezier untuk teks bobot
    const pts = getCubicBezierPoints(na, nb, 0.25, 24);
    const midPoint = pts[Math.floor(pts.length / 2)];
    const tx = midPoint.x;
    const ty = midPoint.y;
    const d=Math.round(Math.sqrt((nb.x-na.x)**2+(nb.y-na.y)**2));
    ctx.fillStyle="rgba(10,15,30,0.78)";
    ctx.beginPath(); ctx.roundRect(tx-14,ty-8,28,16,4); ctx.fill();
    ctx.fillStyle="#94a3b8"; ctx.fillText(d,tx,ty);
  }
}

/* ================================================================
   LAYER 9: NODE MARKERS
   ================================================================ */
export function drawNodes(ctx, nodes, startId, goalId, hoverId=null) {
  const time = performance.now() / 300; // For pulsing animation
  
  for (const nd of nodes) {
    const isStart=nd.id===startId, isGoal=nd.id===goalId, isHover=nd.id===hoverId;
    const r=isHover?15:12;

    if (isStart||isGoal) {
      // Animated Pulse Rings
      const pulseRadius = r + 7 + Math.sin(time) * 4;
      ctx.beginPath(); ctx.arc(nd.x,nd.y,pulseRadius,0,Math.PI*2);
      ctx.fillStyle=isStart?"rgba(34,197,94,0.3)":"rgba(239,68,68,0.3)"; ctx.fill();
      
      // Outer rigid ring
      ctx.beginPath(); ctx.arc(nd.x,nd.y,r+12,0,Math.PI*2);
      ctx.strokeStyle=isStart?"rgba(34,197,94,0.8)":"rgba(239,68,68,0.8)"; 
      ctx.lineWidth=2;
      ctx.stroke();
    }
    // Bayangan
    ctx.fillStyle="rgba(0,0,0,0.3)";
    ctx.beginPath(); ctx.arc(nd.x+2,nd.y+2,r,0,Math.PI*2); ctx.fill();
    // Node
    ctx.beginPath(); ctx.arc(nd.x,nd.y,r,0,Math.PI*2);
    ctx.fillStyle=isStart?"#22c55e":isGoal?"#ef4444":"#6366f1"; ctx.fill();
    ctx.strokeStyle=isHover?"#fbbf24":"#fff"; ctx.lineWidth=isHover?2.5:1.5; ctx.stroke();
    // Dot tengah
    ctx.fillStyle="rgba(255,255,255,0.7)";
    ctx.beginPath(); ctx.arc(nd.x,nd.y,3.5,0,Math.PI*2); ctx.fill();
    
    // Dashed ring untuk start/goal
    if (isStart||isGoal) {
      ctx.beginPath(); ctx.arc(nd.x,nd.y,r+5,0,Math.PI*2);
      ctx.strokeStyle=isStart?"#22c55e":"#ef4444"; ctx.lineWidth=2;
      ctx.setLineDash([5,4]); ctx.stroke(); ctx.setLineDash([]);
    }
    if (isStart) _flag(ctx,nd.x,nd.y-r-10,"#22c55e","START", time);
    if (isGoal)  _flag(ctx,nd.x,nd.y-r-10,"#ef4444","TUJUAN", time);
  }
}

function _flag(ctx,x,y,color,label, time) {
  // Animasi mengambang (bobbing)
  const floatY = y + Math.sin(time * 0.8) * 3;
  
  // Bayangan Bendera
  ctx.strokeStyle="rgba(0,0,0,0.3)"; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(x+2,floatY+2); ctx.lineTo(x+2,floatY-28+2); ctx.stroke();
  
  ctx.strokeStyle=color; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(x,floatY); ctx.lineTo(x,floatY-32); ctx.stroke();
  ctx.fillStyle=color;
  ctx.beginPath(); ctx.moveTo(x,floatY-32); ctx.lineTo(x+28,floatY-25); ctx.lineTo(x,floatY-18);
  ctx.closePath(); ctx.fill();
  ctx.font="bold 8px 'Courier New',monospace";
  ctx.fillStyle="#fff"; ctx.textAlign="left"; ctx.textBaseline="middle";
  ctx.fillText(label,x+4,floatY-25);
}

/* ================================================================
   ENTRY POINTS — dipanggil main.js
   ================================================================ */

/** drawBackground: hanya terrain (dipanggil pertama oleh main.js) */
export function drawBackground(ctx, nodes) {
  if (nodes && nodes.length) drawTerrain(ctx, nodes);
}

/* ================================================================
   LAYER MAP TILES / GRID (GOOGLE MAPS CONCEPT)
   ================================================================ */
function drawMapTilesGrid(ctx, camera) {
  const TILE_SIZE = 256;
  const wTopLeft = camera.screenToWorld(0, 0);
  const wBottomRight = camera.screenToWorld(ctx.canvas.width, ctx.canvas.height);

  const startCol = Math.floor(wTopLeft.x / TILE_SIZE);
  const endCol = Math.ceil(wBottomRight.x / TILE_SIZE);
  const startRow = Math.floor(wTopLeft.y / TILE_SIZE);
  const endRow = Math.ceil(wBottomRight.y / TILE_SIZE);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  ctx.lineWidth = 2;
  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
  ctx.font = "bold 14px 'Courier New', monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  for (let c = startCol; c <= endCol; c++) {
    for (let r = startRow; r <= endRow; r++) {
      const x = c * TILE_SIZE;
      const y = r * TILE_SIZE;
      ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
      ctx.fillText(`Tile ${c},${r}`, x + 8, y + 8);
    }
  }
}

/**
 * drawScene: render semua layer dalam urutan yang benar.
 * main.js memanggil ini satu kali per frame.
 */
export function drawScene(ctx, nodes, edges, routePath, startId, goalId, hoverId, camera=null, showTiles=false) {
  let visibleNodes = nodes;
  let visibleEdges = edges;

  // Frustum Culling / Tile Culling (Optimasi Google Maps)
  if (camera) {
    const margin = 300; 
    const wTopLeft = camera.screenToWorld(0, 0);
    const wBottomRight = camera.screenToWorld(ctx.canvas.width, ctx.canvas.height);
    
    const minX = wTopLeft.x - margin;
    const maxX = wBottomRight.x + margin;
    const minY = wTopLeft.y - margin;
    const maxY = wBottomRight.y + margin;

    visibleNodes = nodes.filter(n => n.x >= minX && n.x <= maxX && n.y >= minY && n.y <= maxY);
    const visNodeSet = new Set(visibleNodes.map(n => n.id));
    visibleEdges = edges.filter(([a, b]) => visNodeSet.has(a) || visNodeSet.has(b));
  }

  drawTerrain(ctx, nodes, camera); // Menggunakan camera untuk Infinite Terrain
  
  if (showTiles && camera) {
    drawMapTilesGrid(ctx, camera);
  }

  // Pass original 'nodes' array for edges because indices a and b map to nodes array!
  drawEdges(ctx, nodes, visibleEdges, routePath);
  drawTrees(ctx, nodes, visibleEdges);
  drawBuildings(ctx, visibleNodes);
  drawStreetLamps(ctx, nodes, visibleEdges);
  drawWeights(ctx, nodes, visibleEdges);
  drawNodes(ctx, visibleNodes, startId, goalId, hoverId);
}
