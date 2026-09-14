// Node-only local prototype storage. No filesystem modules enter the production bundle.
// Files live outside public/ and are excluded by web/.gitignore's /work/ rule.
export interface StateStore {
  load(): unknown;
  save(value: unknown): void;
}

export function localStateStore(name: string, directory?: string): StateStore {
  if (process.env.NODE_ENV === "production") throw new Error("Local storage is disabled in production");
  if (!/^[a-z-]+$/.test(name)) throw new Error("Invalid local state name");
  const fs = process.getBuiltinModule("node:fs");
  const path = process.getBuiltinModule("node:path");
  const root = path.resolve(directory ?? "work/local-agent-state");
  fs.mkdirSync(root, { recursive: true });
  const file = path.join(root, `${name}.json`);
  return {
    load() {
      if (!fs.existsSync(file)) return null;
      // Corrupt or incompatible data must fail closed, never silently start empty.
      return JSON.parse(fs.readFileSync(file, "utf8"), (_key, value) => {
        if (value && value.__bytes === true && typeof value.base64 === "string") return new Uint8Array(Buffer.from(value.base64, "base64"));
        return value;
      });
    },
    save(value) {
      const encoded = JSON.stringify(value, (_key, item) => item instanceof Uint8Array ? { __bytes: true, base64: Buffer.from(item).toString("base64") } : item);
      const temporary = `${file}.${crypto.randomUUID()}.tmp`;
      const fd = fs.openSync(temporary, "wx", 0o600);
      try { fs.writeFileSync(fd, encoded, "utf8"); fs.fsyncSync(fd); }
      finally { fs.closeSync(fd); }
      fs.renameSync(temporary, file);
    },
  };
}
