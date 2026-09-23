// Packs dist-itch/ into a zip itch.io can actually unpack.
//
// PowerShell's Compress-Archive writes entry names with backslashes, which the
// ZIP spec forbids — it mandates forward slashes. Windows tools cope; itch's
// extractor does not, and treats `assets\index.js` as a single flat filename.
// The result is an upload where only the root index.html exists and every
// asset 404s, with nothing anywhere to say why.
//
// Node ships zlib but no archiver, so this writes the container by hand. That
// is a hundred lines, and it beats a dependency for something this small.

import { createWriteStream } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { deflateRawSync } from 'node:zlib';

const SOURCE = 'dist-itch';
const TARGET = 'hundred-level-laser-itch.zip';

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else out.push(full);
  }
  return out;
}

const files = (await walk(SOURCE)).sort();
const chunks = [];
const central = [];
let offset = 0;

for (const file of files) {
  // The one line this whole script exists for.
  const name = Buffer.from(relative(SOURCE, file).split(sep).join('/'), 'utf8');
  const body = await readFile(file);
  const deflated = deflateRawSync(body);
  // Deflate can grow already-compressed data, in which case store it as-is.
  const useDeflate = deflated.length < body.length;
  const data = useDeflate ? deflated : body;
  const method = useDeflate ? 8 : 0;
  const crc = crc32(body);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);            // version needed
  local.writeUInt16LE(0, 6);             // flags
  local.writeUInt16LE(method, 8);
  local.writeUInt16LE(0, 10);            // time
  local.writeUInt16LE(0x21, 12);         // date, arbitrary but valid
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(body.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);            // extra length

  chunks.push(local, name, data);

  const dir = Buffer.alloc(46);
  dir.writeUInt32LE(0x02014b50, 0);
  dir.writeUInt16LE(20, 4);              // version made by
  dir.writeUInt16LE(20, 6);              // version needed
  dir.writeUInt16LE(0, 8);
  dir.writeUInt16LE(method, 10);
  dir.writeUInt16LE(0, 12);
  dir.writeUInt16LE(0x21, 14);
  dir.writeUInt32LE(crc, 16);
  dir.writeUInt32LE(data.length, 20);
  dir.writeUInt32LE(body.length, 24);
  dir.writeUInt16LE(name.length, 28);
  dir.writeUInt16LE(0, 30);              // extra
  dir.writeUInt16LE(0, 32);              // comment
  dir.writeUInt16LE(0, 34);              // disk
  dir.writeUInt16LE(0, 36);              // internal attrs
  dir.writeUInt32LE(0, 38);              // external attrs
  dir.writeUInt32LE(offset, 42);
  central.push(dir, name);

  offset += local.length + name.length + data.length;
}

const centralBuf = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(0, 4);
end.writeUInt16LE(0, 6);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralBuf.length, 12);
end.writeUInt32LE(offset, 16);
end.writeUInt16LE(0, 20);

const zip = Buffer.concat([...chunks, centralBuf, end]);
await new Promise((res, rej) => {
  const out = createWriteStream(TARGET);
  out.on('error', rej).on('finish', res).end(zip);
});

const size = (await stat(TARGET)).size;
console.log(`${TARGET} — ${files.length} fichiers, ${(size / 1048576).toFixed(1)} Mo`);
