/**
 * TerraLens icon generator — dependency-free.
 *
 * Renders the app icon (deep forest gradient + sunlight disc + leaf with
 * midrib) directly to RGBA pixels and encodes PNGs with Node's zlib.
 * Run:  node scripts/generate-icons.mjs
 *
 * Outputs (public/icons):
 *   icon-192.png          rounded corners, purpose "any"
 *   icon-512.png          rounded corners, purpose "any"
 *   icon-maskable-512.png full-bleed square (safe zone respected)
 *   apple-touch-icon.png  180px, full-bleed (iOS applies its own mask)
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

// ---------------------------------------------------------------- PNG encoding

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter: none
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------- geometry

const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

const mix = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

// Palette (design tokens, see globals.css).
const FOREST_LIGHT = hex("#2F6C4D");
const FOREST_DARK = hex("#16382B");
const SUN = hex("#F3BD3F");
const LEAF_TOP = hex("#F4F6E8");
const LEAF_BOTTOM = hex("#BFD9A0");
const MIDRIB = hex("#2A5A42");

/** Signed coverage of a point inside the icon composition. Returns RGBA (0-255). */
function sample(x, y, S, shape) {
  const cx = S / 2;
  const cy = S / 2;
  const px = x - cx;
  const py = y - cy;
  const r = Math.hypot(px - S * 0.06, py - S * 0.05);

  // Rounded-square (or square) background.
  let insideBg = true;
  if (shape.round) {
    const half = S / 2;
    const radius = S * 0.225;
    const qx = Math.abs(px) - (half - radius);
    const qy = Math.abs(py) - (half - radius);
    const d =
      qx <= 0 && qy <= 0
        ? Math.max(qx, qy) - radius
        : Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - radius;
    insideBg = d <= 0;
  }
  if (!insideBg) return [0, 0, 0, 0];

  // Background gradient: light forest top-left → deep forest bottom-right.
  const t = Math.min(1, Math.max(0, (x / S + y / S) / 2));
  let color = mix(FOREST_LIGHT, FOREST_DARK, t);

  // Subtle radial lift toward the sun corner.
  const sunX = S * 0.735;
  const sunY = S * 0.265;
  const sunR = S * 0.115;
  const sunDist = Math.hypot(x - sunX, y - sunY);
  const glow = Math.max(0, 1 - sunDist / (sunR * 2.6)) ** 2 * 0.22;
  color = mix(color, SUN, glow);

  // Sunlight disc.
  if (sunDist <= sunR) color = SUN;

  // Leaf: vesica piscis (intersection of two discs), rotated -34°,
  // long axis pointing up-right, drawn over the sun.
  const theta = -0.6;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const qx = px * cosT + py * sinT;
  const qy = -px * sinT + py * cosT;

  const h = S * 0.4; // half length
  const w = S * 0.165; // half width at the widest point
  const discR = (h * h + w * w) / (2 * w);
  const offset = (h * h - w * w) / (2 * w);

  const inLeaf = Math.hypot(qx - offset, qy) <= discR && Math.hypot(qx + offset, qy) <= discR;

  if (inLeaf) {
    const lt = Math.min(1, Math.max(0, (qy + h) / (2 * h)));
    color = mix(LEAF_TOP, LEAF_BOTTOM, lt);

    // Midrib: tapered line along the long axis.
    const ribHalf = S * 0.012 * (1 - (Math.abs(qy) / h) * 0.6);
    if (Math.abs(qx) <= ribHalf) color = mix(color, MIDRIB, 0.5);
  }

  return [color[0], color[1], color[2], 255];
}

/** Render one icon at `size` with 3×3 supersampling. */
function render(size, { round }) {
  const SS = 3;
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const [pr, pg, pb, pa] = sample(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS, size, {
            round,
          });
          const w = pa / 255;
          r += pr * w;
          g += pg * w;
          b += pb * w;
          a += pa;
        }
      }
      const n = SS * SS;
      const alpha = a / n;
      const i = (y * size + x) * 4;
      if (alpha > 0) {
        const wsum = a / 255;
        rgba[i] = Math.round(r / wsum);
        rgba[i + 1] = Math.round(g / wsum);
        rgba[i + 2] = Math.round(b / wsum);
      }
      rgba[i + 3] = Math.round(alpha);
    }
  }
  return encodePNG(size, size, rgba);
}

// --------------------------------------------------------------------- output

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  ["icon-192.png", render(192, { round: true })],
  ["icon-512.png", render(512, { round: true })],
  ["icon-maskable-512.png", render(512, { round: false })],
  ["apple-touch-icon.png", render(180, { round: false })],
];

for (const [name, buf] of targets) {
  const path = join(OUT_DIR, name);
  writeFileSync(path, buf);
  console.log(`${name}  ${buf.length} bytes`);
}
