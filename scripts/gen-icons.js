// 生成 tabBar 图标（81x81 PNG，普通/选中两种颜色），仅用 Node 内置模块。
// 用法：node gen-icons.js
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const SIZE = 81;
const SS = 3; // 超采样倍数（抗锯齿）
const COLORS = {
    normal: [168, 159, 148], // #a89f94
    active: [199, 141, 0],   // #c78d00
};

// ---------- PNG 编码 ----------
const CRC_TABLE = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[n] = c;
    }
    return table;
})();

function crc32(buf) {
    let crc = -1;
    for (let i = 0; i < buf.length; i++) {
        crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
    }
    return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
    return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;  // bit depth
    ihdr[9] = 6;  // color type RGBA
    const stride = width * 4;
    const raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (stride + 1)] = 0; // filter none
        rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    }
    return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- 图形（在 81x81 坐标系内的覆盖判定） ----------
function dist2seg(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = x1 + t * dx;
    const cy = y1 + t * dy;
    return Math.hypot(px - cx, py - cy);
}

function inTriangle(px, py, ax, ay, bx, by, cx, cy) {
    const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
    const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
    const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
    const neg = d1 < 0 || d2 < 0 || d3 < 0;
    const pos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(neg && pos);
}

function shapeHome(x, y) {
    // 屋顶三角形 + 房身矩形
    if (inTriangle(x, y, 40.5, 14, 11, 40, 70, 40)) return true;
    return x >= 18 && x <= 63 && y >= 36 && y <= 68;
}

function shapeOrders(x, y) {
    // 三条胶囊形横杠
    return dist2seg(x, y, 24, 25, 57, 25) <= 5 ||
        dist2seg(x, y, 24, 40.5, 57, 40.5) <= 5 ||
        dist2seg(x, y, 24, 56, 57, 56) <= 5;
}

function shapeProfile(x, y) {
    // 头部圆 + 肩部半椭圆
    if (Math.hypot(x - 40.5, y - 27) <= 12) return true;
    if (y > 62) return false;
    const dx = (x - 40.5) / 22;
    const dy = (y - 62) / 15;
    return dx * dx + dy * dy <= 1;
}

// ---------- 渲染 ----------
function render(shape, color) {
    const big = SIZE * SS;
    const rgba = Buffer.alloc(SIZE * SIZE * 4);
    const [r, g, b] = color;
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            let hits = 0;
            for (let sy = 0; sy < SS; sy++) {
                for (let sx = 0; sx < SS; sx++) {
                    const px = (x * SS + sx + 0.5) / SS;
                    const py = (y * SS + sy + 0.5) / SS;
                    if (shape(px, py)) hits++;
                }
            }
            const alpha = Math.round((hits / (SS * SS)) * 255);
            const idx = (y * SIZE + x) * 4;
            rgba[idx] = r;
            rgba[idx + 1] = g;
            rgba[idx + 2] = b;
            rgba[idx + 3] = alpha;
        }
    }
    return rgba;
}

const OUT_DIR = path.join(__dirname, '..', 'sunflower', 'icons');
fs.mkdirSync(OUT_DIR, { recursive: true });

const ICONS = [
    { name: 'icon-home', shape: shapeHome },
    { name: 'icon-orders', shape: shapeOrders },
    { name: 'icon-profile', shape: shapeProfile },
];

for (const icon of ICONS) {
    for (const variant of ['normal', 'active']) {
        const rgba = render(icon.shape, COLORS[variant]);
        const png = encodePNG(SIZE, SIZE, rgba);
        const file = path.join(OUT_DIR, variant === 'normal' ? icon.name + '.png' : icon.name + '-active.png');
        fs.writeFileSync(file, png);
        console.log('written:', file, png.length, 'bytes');
    }
}
console.log('done');
