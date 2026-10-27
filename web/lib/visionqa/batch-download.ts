export type BatchReportRow = {
  fileName: string;
  score: number | null;
  decision: string;
  humanRealism: number | null;
  photographyRealism: number | null;
  materialRealism: number | null;
  commercialValue: number | null;
  repairPrompt: string;
};

const encoder = new TextEncoder();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function u32(value: number): Uint8Array {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function safeZipName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 180) || "image";
}

export async function createStoredZip(files: File[]): Promise<Blob> {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const [index, file] of files.entries()) {
    const data = new Uint8Array(await file.arrayBuffer());
    const name = encoder.encode(`${String(index + 1).padStart(2, "0")}-${safeZipName(file.name)}`);
    const crc = crc32(data);
    const localHeader = concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name,
    ]);
    localParts.push(localHeader, data);
    centralParts.push(concat([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0),
      u16(0), u16(0), u16(0), u32(0), u32(offset), name,
    ]));
    offset += localHeader.length + data.length;
  }

  const central = concat(centralParts);
  const end = concat([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(central.length), u32(offset), u16(0),
  ]);
  return new Blob([concat([...localParts, central, end]) as BlobPart], {
    type: "application/zip",
  });
}

function csvCell(value: string | number | null): string {
  const text = value === null ? "未评估" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function createBatchCsv(rows: BatchReportRow[]): Blob {
  const headers = [
    "文件名", "综合评分", "门禁结论", "真人真实性", "摄影真实性",
    "材质真实性", "商品表达效能", "优化Prompt",
  ];
  const lines = [
    headers.map(csvCell).join(","),
    ...rows.map((row) => [
      row.fileName, row.score, row.decision, row.humanRealism,
      row.photographyRealism, row.materialRealism, row.commercialValue,
      row.repairPrompt,
    ].map(csvCell).join(",")),
  ];
  return new Blob(["\ufeff", lines.join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
