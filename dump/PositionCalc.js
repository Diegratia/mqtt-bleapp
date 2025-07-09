const canvas = document.getElementById("simulationCanvas");
const ctx = canvas.getContext("2d");

// Koordinat gateway
const gate1 = { pos_px_x: 100, pos_px_y: 100 };
const gate2 = { pos_px_x: 200, pos_px_y: 150 };
const scale = 3.8;

// Data JSON dari input
const data = [
  {
    id: 3,
    gateway_id: 2,
    type: 4,
    dmac: "BC572905DB80",
    refpower: -59,
    rssi: -65,
    vbatt: "\\N",
    temp: "\\N",
    time: "2025-05-29 05:47:56,880",
    meter: 1.88005408984861,
    calc_dist: 7.14420554142471,
    gmac: "282C02227F53",
    measure: -59,
  },
  {
    id: 7,
    gateway_id: 1,
    type: 4,
    dmac: "BC572905DB80",
    refpower: -59,
    rssi: -65,
    vbatt: "\\N",
    temp: "\\N",
    time: "2025-05-29 05:48:05,580",
    meter: "2,09721437756176",
    calc_dist: "7,96941463473468",
    gmac: "282C02227F53",
    measure: -59,
  },
  {
    id: 11,
    gateway_id: 1,
    type: 4,
    dmac: "BC572905DB80",
    refpower: -59,
    rssi: -65,
    vbatt: "\\N",
    temp: "\\N",
    time: "2025-05-29 05:48:14,893",
    meter: "2,01063958237826",
    calc_dist: "7,64043041303738",
    gmac: "282C02227F53",
    measure: -59,
  },
];

// Fungsi untuk menghasilkan piksel pada garis menggunakan algoritma Bresenham
function getLinePixels(x0, y0, x1, y1) {
  const pixels = [];
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);

  let dx = Math.abs(x1 - x0);
  let dy = Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1;
  let sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    pixels.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    let e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
  return pixels;
}

// Fungsi untuk menghasilkan area deteksi (±3 piksel) sebagai array string
function getDetectionArea() {
  const linePixels = getLinePixels(
    gate1.pos_px_x,
    gate1.pos_px_y,
    gate2.pos_px_x,
    gate2.pos_px_y
  );
  const detectionArea = new Set();

  linePixels.forEach(([x, y]) => {
    for (let dx = -3; dx <= 3; dx++) {
      for (let dy = -3; dy <= 3; dy++) {
        const newX = x + dx;
        const newY = y + dy;
        // Periksa jarak ke garis menggunakan rumus jarak titik ke garis
        const distToLine = Math.abs(
          ((gate2.pos_px_y - gate1.pos_px_y) * newX -
            (gate2.pos_px_x - gate1.pos_px_x) * newY +
            gate2.pos_px_x * gate1.pos_px_y -
            gate2.pos_px_y * gate1.pos_px_x) /
            Math.hypot(
              gate2.pos_px_x - gate1.pos_px_x,
              gate2.pos_px_y - gate1.pos_px_y
            )
        );
        if (distToLine <= 3) {
          detectionArea.add(`(${newX},${newY})`);
        }
      }
    }
  });

  return Array.from(detectionArea);
}

// JSON statis untuk area deteksi dalam format string "(x,y)"
const detectionArea = getDetectionArea();

// Fungsi untuk menggambar garis imajiner
function drawImaginaryLine() {
  ctx.beginPath();
  ctx.moveTo(gate1.pos_px_x, gate1.pos_px_y);
  ctx.lineTo(gate2.pos_px_x, gate2.pos_px_y);
  ctx.strokeStyle = "blue";
  ctx.lineWidth = 7; // Lebar total 7 piksel
  ctx.stroke();
}

// Fungsi untuk menggambar area deteksi (untuk debugging)
function drawDetectionArea() {
  detectionArea.forEach((str) => {
    const [x, y] = str
      .match(/\((\d+),(\d+)\)/)
      .slice(1)
      .map(Number);
    ctx.fillStyle = "rgba(0, 0, 255, 0.1)";
    ctx.fillRect(x, y, 1, 1);
  });
}

// Fungsi untuk menghitung jarak piksel antar gateway
function getPixelDistance() {
  return Math.hypot(
    gate2.pos_px_x - gate1.pos_px_x,
    gate2.pos_px_y - gate1.pos_px_y
  );
}

// Fungsi untuk menentukan posisi tag pada garis
function getTagPosition(calc_dist1, calc_dist2) {
  const pixelDistance = getPixelDistance();
  const totalDist = (calc_dist1 + calc_dist2) / scale; // Total jarak dalam piksel
  if (totalDist === 0) return null;

  // Interpolasi linier untuk posisi tag
  const ratio = calc_dist1 / (calc_dist1 + calc_dist2);
  const x = gate1.pos_px_x + ratio * (gate2.pos_px_x - gate1.pos_px_x);
  const y = gate1.pos_px_y + ratio * (gate2.pos_px_y - gate1.pos_px_y);

  // Periksa apakah posisi berada dalam area deteksi
  const nearestPixel = `(${Math.round(x)},${Math.round(y)})`;
  if (!detectionArea.includes(nearestPixel)) {
    return null;
  }

  return { x, y };
}

// Fungsi untuk menggambar tag
function drawTag(x, y, id) {
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, 2 * Math.PI);
  ctx.fillStyle = "red";
  ctx.fill();
  ctx.font = "12px Arial";
  ctx.fillText(`ID: ${id}`, x + 10, y);
}

// Fungsi untuk menggambar gateway
function drawGateways() {
  ctx.beginPath();
  ctx.arc(gate1.pos_px_x, gate1.pos_px_y, 8, 0, 2 * Math.PI);
  ctx.fillStyle = "green";
  ctx.fill();
  ctx.font = "12px Arial";
  ctx.fillText("Gate 1", gate1.pos_px_x + 10, gate1.pos_px_y);

  ctx.beginPath();
  ctx.arc(gate2.pos_px_x, gate2.pos_px_y, 8, 0, 2 * Math.PI);
  ctx.fillStyle = "green";
  ctx.fill();
  ctx.fillText("Gate 2", gate2.pos_px_x + 10, gate2.pos_px_y);
}

// Fungsi utama untuk memproses data dan menggambar
function drawSimulation() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawDetectionArea(); // Untuk visualisasi area deteksi
  drawImaginaryLine();
  drawGateways();

  // Kelompokkan data berdasarkan dmac untuk mendapatkan jarak dari kedua gateway
  const tags = {};
  data.forEach((entry) => {
    const dmac = entry.dmac;
    if (!tags[dmac]) tags[dmac] = {};
    tags[dmac][entry.gateway_id] = parseFloat(entry.calc_dist);
    tags[dmac].id = entry.id;
  });

  // Gambar tag berdasarkan jarak dari dua gateway
  for (const dmac in tags) {
    const tag = tags[dmac];
    if (tag[1] && tag[2]) {
      // Pastikan ada data dari kedua gateway
      const pos = getTagPosition(tag[1], tag[2]);
      if (pos) {
        drawTag(pos.x, pos.y, tag.id);
      }
    }
  }

  // Log JSON statis untuk debugging
  console.log("Detection Area JSON:", JSON.stringify(detectionArea));
}

// Jalankan simulasi
drawSimulation();
