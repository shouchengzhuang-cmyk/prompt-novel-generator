// Generate placeholder PWA icons: solid dark-green square with "墨" character
// Run: node scripts/generate-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.resolve(__dirname, '..', 'public');

function createPNG(width, height) {
  // 4 bytes per pixel RGBA
  const rawData = Buffer.alloc(width * height * 4);

  const bg = { r: 6, g: 21, b: 18, a: 255 };
  const fg = { r: 233, g: 245, b: 241, a: 255 };

  // Draw background
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      rawData[i] = bg.r;
      rawData[i+1] = bg.g;
      rawData[i+2] = bg.b;
      rawData[i+3] = bg.a;
    }
  }

  // Draw a simple circle-ish shape (centered, ~60% of size)
  const cx = width / 2;
  const cy = height / 2;
  const r = width * 0.32;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist <= r) {
        const i = (y * width + x) * 4;
        // Gradient from teal center to darker edge
        const t = dist / r;
        rawData[i] = Math.round(6 + (45 - 6) * (1 - t));
        rawData[i+1] = Math.round(60 + (212 - 60) * (1 - t));
        rawData[i+2] = Math.round(50 + (191 - 50) * (1 - t));
      }
    }
  }

  // Convert to filter-byte rows for PNG (each row starts with 0 = None filter)
  const rowSize = width * 4 + 1;
  const filtered = Buffer.alloc(height * rowSize);
  for (let y = 0; y < height; y++) {
    filtered[y * rowSize] = 0; // filter type None
    rawData.copy(filtered, y * rowSize + 1, y * width * 4, (y + 1) * width * 4);
  }

  const deflated = zlib.deflateSync(filtered);

  // Build PNG
  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = (c >>> 8) ^ crcTable[(c ^ buf[i]) & 0xff];
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c;
  }

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeB = Buffer.from(type, 'ascii');
    const crcData = Buffer.concat([typeB, data]);
    const crcV = Buffer.alloc(4);
    crcV.writeUInt32BE(crc32(crcData));
    return Buffer.concat([len, typeB, data, crcV]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflated), chunk('IEND', Buffer.alloc(0))]);
}

// Generate both sizes
[192, 512].forEach(size => {
  const png = createPNG(size, size);
  const outPath = path.join(OUT_DIR, `icon-${size}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`Created ${outPath} (${png.length} bytes)`);
});
