const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[n] = c >>> 0;
    }
    return table;
})();

export function crc32(data: Uint8Array): number {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
        crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

export type ZipEntry = { name: string; data: Uint8Array };

function dosTime(date: Date): { time: number; date: number } {
    const time =
        (date.getSeconds() >> 1) | (date.getMinutes() << 5) | (date.getHours() << 11);
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = Math.max(date.getFullYear() - 1980, 0);
    return { time, date: day | (month << 5) | (year << 9) };
}

export function encodeZip(entries: ZipEntry[], now = new Date()): Uint8Array {
    const encoder = new TextEncoder();
    const locals: Uint8Array[] = [];
    const centrals: Uint8Array[] = [];
    let offset = 0;
    const stamp = dosTime(now);
    for (const entry of entries) {
        const name = encoder.encode(entry.name);
        const crc = crc32(entry.data);
        const local = new Uint8Array(30 + name.length + entry.data.length);
        const view = new DataView(local.buffer);
        view.setUint32(0, 0x04034b50, true);
        view.setUint16(4, 20, true);
        view.setUint16(6, 0, true);
        view.setUint16(8, 0, true);
        view.setUint16(10, stamp.time, true);
        view.setUint16(12, stamp.date, true);
        view.setUint32(14, crc, true);
        view.setUint32(18, entry.data.length, true);
        view.setUint32(22, entry.data.length, true);
        view.setUint16(26, name.length, true);
        view.setUint16(28, 0, true);
        local.set(name, 30);
        local.set(entry.data, 30 + name.length);
        locals.push(local);

        const central = new Uint8Array(46 + name.length);
        const centralView = new DataView(central.buffer);
        centralView.setUint32(0, 0x02014b50, true);
        centralView.setUint16(4, 20, true);
        centralView.setUint16(6, 20, true);
        centralView.setUint16(8, 0, true);
        centralView.setUint16(10, 0, true);
        centralView.setUint16(12, stamp.time, true);
        centralView.setUint16(14, stamp.date, true);
        centralView.setUint32(16, crc, true);
        centralView.setUint32(20, entry.data.length, true);
        centralView.setUint32(24, entry.data.length, true);
        centralView.setUint16(28, name.length, true);
        centralView.setUint16(30, 0, true);
        centralView.setUint16(32, 0, true);
        centralView.setUint16(34, 0, true);
        centralView.setUint16(36, 0, true);
        centralView.setUint32(38, 0, true);
        centralView.setUint32(42, offset, true);
        central.set(name, 46);
        centrals.push(central);
        offset += local.length;
    }
    const centralSize = centrals.reduce((sum, item) => sum + item.length, 0);
    const eocd = new Uint8Array(22);
    const eocdView = new DataView(eocd.buffer);
    eocdView.setUint32(0, 0x06054b50, true);
    eocdView.setUint16(4, 0, true);
    eocdView.setUint16(6, 0, true);
    eocdView.setUint16(8, entries.length, true);
    eocdView.setUint16(10, entries.length, true);
    eocdView.setUint32(12, centralSize, true);
    eocdView.setUint32(16, offset, true);
    eocdView.setUint16(20, 0, true);
    const total = offset + centralSize + eocd.length;
    const out = new Uint8Array(total);
    let cursor = 0;
    for (const local of locals) {
        out.set(local, cursor);
        cursor += local.length;
    }
    for (const central of centrals) {
        out.set(central, cursor);
        cursor += central.length;
    }
    out.set(eocd, cursor);
    return out;
}

export function decodeZip(bytes: Uint8Array): ZipEntry[] {
    let eocd = -1;
    const start = Math.max(0, bytes.length - 22 - 65535);
    for (let i = bytes.length - 22; i >= start; i--) {
        if (
            bytes[i] === 0x50 &&
            bytes[i + 1] === 0x4b &&
            bytes[i + 2] === 0x05 &&
            bytes[i + 3] === 0x06
        ) {
            eocd = i;
            break;
        }
    }
    if (eocd < 0) {
        throw new Error('zip 缺少结束目录');
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const count = view.getUint16(eocd + 8, true);
    let central = view.getUint32(eocd + 16, true);
    const decoder = new TextDecoder();
    const entries: ZipEntry[] = [];
    for (let n = 0; n < count; n++) {
        if (view.getUint32(central, true) !== 0x02014b50) {
            throw new Error('zip 中央目录损坏');
        }
        const method = view.getUint16(central + 10, true);
        const nameLength = view.getUint16(central + 28, true);
        const extraLength = view.getUint16(central + 30, true);
        const commentLength = view.getUint16(central + 32, true);
        const localOffset = view.getUint32(central + 42, true);
        const name = decoder.decode(bytes.subarray(central + 46, central + 46 + nameLength));
        if (method !== 0) {
            throw new Error(`暂不读取压缩条目 ${name}`);
        }
        const localNameLength = view.getUint16(localOffset + 26, true);
        const localExtraLength = view.getUint16(localOffset + 28, true);
        const size = view.getUint32(localOffset + 18, true);
        const dataStart = localOffset + 30 + localNameLength + localExtraLength;
        entries.push({ name, data: bytes.subarray(dataStart, dataStart + size) });
        central += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
}
