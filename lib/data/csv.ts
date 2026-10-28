import { crc32, deflateRawSync } from "node:zlib";

export type CsvCell = string | number | boolean | Date | null | undefined;

const BOM = "﻿";
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

function cellText(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/**
 * One RFC 4180 field. Text that a spreadsheet would run as a formula (leading = + - @, tab or CR)
 * gets a leading apostrophe, except plain numbers such as a negative opening balance.
 */
export function csvField(value: CsvCell): string {
  let text = cellText(value);
  if (/^[=+\-@\t\r]/.test(text) && !PLAIN_NUMBER.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** A CSV document with a header row, CRLF line ends and a UTF-8 BOM so Excel reads it correctly. */
export function toCsv(columns: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  return BOM + [columns, ...rows].map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n";
}

export type ZipEntry = { name: string; content: string };

/** Minimal ZIP writer (deflate, UTF-8 names), enough for a handful of text files. */
export function zipFiles(entries: readonly ZipEntry[], modified: Date): Buffer {
  const dosTime = (modified.getUTCHours() << 11) | (modified.getUTCMinutes() << 5) | (modified.getUTCSeconds() >> 1);
  const dosDate = ((Math.max(modified.getUTCFullYear(), 1980) - 1980) << 9) | ((modified.getUTCMonth() + 1) << 5) | modified.getUTCDate();

  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const raw = Buffer.from(entry.content, "utf8");
    const packed = deflateRawSync(raw);
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, packed);

    const entryHeader = Buffer.alloc(46);
    entryHeader.writeUInt32LE(0x02014b50, 0);
    entryHeader.writeUInt16LE(20, 4); // version made by
    local.copy(entryHeader, 6, 4, 30); // version needed .. name length, same as the local header
    entryHeader.writeUInt32LE(offset, 42);
    central.push(entryHeader, name);

    offset += local.length + name.length + packed.length;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...central, end]);
}
