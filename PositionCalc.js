// g1
const pos_x1 = 0;
const pos_y1 = 0;
const pos_px_x1 = 100;
const pos_px_y1 = 100;

// g2
const pos_x2 = 0;
const pos_y2 = 0;
const pos_px_x2 = 200;
const pos_px_y2 = 150;

const scale = 3.8;

// konversi
const gate1_x = pos_px_x1 * scale;
const gate1_y = pos_px_y1 * scale;

const gate2_x = pos_px_x2 * scale;
const gate2_y = pos_px_y2 * scale;

// jarak
const delta_x = gate2_x - gate1_x;
const delta_y = gate2_y - gate1_y;

const jarak_meter = Math.hypot(delta_x, delta_y); // √(76² + 76²)

const jarak_pixel = Math.hypot(pos_px_x2 - pos_px_x1, pos_px_y2 - pos_px_y1);

console.log(` ${jarak_meter.toFixed(2)} meter`);
console.log(` ${jarak_pixel.toFixed(2)} pixel`);
