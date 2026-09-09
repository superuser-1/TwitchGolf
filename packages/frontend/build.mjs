import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as esbuild from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const outdir = resolve(here, "dist");
const serve = process.argv.includes("--serve");

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });
cpSync(resolve(here, "public"), outdir, { recursive: true });

/** @type {import("esbuild").BuildOptions} */
const options = {
  entryPoints: {
    video_component: resolve(here, "src/video_component.ts"),
    config: resolve(here, "src/config_page.ts"),
    dashboard: resolve(here, "src/dashboard_page.ts"),
  },
  bundle: true,
  format: "iife",
  target: "es2020",
  sourcemap: true,
  outdir,
  logLevel: "info",
};

if (serve) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  const { host, port } = await ctx.serve({ servedir: outdir, host: "127.0.0.1", port: 5180 });
  console.log(`frontend dev server: http://${host}:${port}/video_component.html`);
} else {
  await esbuild.build(options);
  console.log(`built -> ${outdir}`);
}
