#!/usr/bin/env node
/**
 * PGLite loads pglite.data next to the bundled server chunk. Nitro does not
 * copy those WASM assets, so a production preview without DATABASE_URL crashes
 * on boot. Skip when Neon is configured — that path never loads PGLite.
 */
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

if (process.env.DATABASE_URL?.trim()) process.exit(0);

const destDir = ".vercel/output/functions/__server.func/_libs";
const srcDir = "node_modules/@electric-sql/pglite/dist";
if (!existsSync(destDir) || !existsSync(srcDir)) process.exit(0);

for (const name of ["pglite.data", "pglite.wasm", "initdb.wasm"]) {
  const from = join(srcDir, name);
  if (existsSync(from)) copyFileSync(from, join(destDir, name));
}
