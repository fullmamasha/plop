/**
 * Packs the built extension into a Chrome Web Store upload.
 *
 * The ZIP root must contain manifest.json, and it must hold nothing but what
 * the extension needs at runtime. The archive is written to Versions/, which
 * is not tracked: release artifacts belong on GitHub Releases and the Web
 * Store, never in the repository.
 */

import { createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { deflateRaw } from "node:zlib";
import { promisify } from "node:util";
import { version } from "./manifest.mjs";

const deflate = promisify(deflateRaw);
const SOURCE = "dist";
const OUT_DIR = "Versions";

/** Every file under `dir`, as paths relative to it, depth first. */
async function walk(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, base)));
    else out.push(relative(base, full).split(sep).join("/"));
  }
  return out.sort();
}

/* ---------------------------------------------------------------------- */
/* A minimal ZIP writer. The alternative is a dependency for something the  */
/* standard library already does most of.                                   */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function zip(files, destination) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const { name, data } of files) {
    const nameBytes = Buffer.from(name, "utf8");
    const compressed = await deflate(data, { level: 9 });
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);

    chunks.push(local, nameBytes, compressed);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(compressed.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);

    offset += local.length + nameBytes.length + compressed.length;
  }

  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);

  await new Promise((resolve, reject) => {
    const stream = createWriteStream(destination);
    stream.on("error", reject);
    stream.on("close", resolve);
    for (const chunk of chunks) stream.write(chunk);
    stream.write(directory);
    stream.write(end);
    stream.end();
  });
}

/* ---------------------------------------------------------------------- */

const names = await walk(SOURCE);

if (!names.includes("manifest.json")) {
  throw new Error("dist/manifest.json is missing: run the build first.");
}

const files = await Promise.all(
  names.map(async (name) => ({ name, data: await readFile(join(SOURCE, name)) }))
);

await mkdir(OUT_DIR, { recursive: true });
const destination = join(OUT_DIR, `plop-${version}-chrome.zip`);
await zip(files, destination);

const { size } = await stat(destination);
console.log(`${destination}  (${(size / 1024).toFixed(1)} KB, ${files.length} files)`);
for (const name of names) console.log(`  ${name}`);
