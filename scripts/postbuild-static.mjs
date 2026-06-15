import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const source = resolve(root, "public", ".htaccess");
const targets = [
  resolve(root, ".vercel", "output", "static", ".htaccess"),
  resolve(root, "dist", "client", ".htaccess"),
];

if (!existsSync(source)) {
  process.exit(0);
}

for (const target of targets) {
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}
