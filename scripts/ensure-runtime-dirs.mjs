import { mkdir } from "fs/promises";
import path from "path";

const dirs = [
  path.join(process.cwd(), "data", "audit"),
  path.join(process.cwd(), "public", "uploads"),
];

for (const dir of dirs) {
  await mkdir(dir, { recursive: true });
}
