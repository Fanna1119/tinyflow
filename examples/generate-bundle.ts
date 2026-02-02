#!/usr/bin/env bun

/**
 * Example: Generate production bundle with Bun server and Docker files
 *
 * Usage:
 *   bun examples/generate-bundle.ts [workflow.json]
 */

import { buildBundle } from "../src/bundle";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";

async function main() {
  const workflowPath = process.argv[2] || "examples/webhook-flow.json";
  const outputDir = "dist";

  console.log("📦 TinyFlow Bundle Generator\n");
  console.log(`Loading workflow: ${workflowPath}`);

  // Load workflow
  const workflowJson = await readFile(workflowPath, "utf-8");
  const workflow = JSON.parse(workflowJson);

  console.log(`✓ Loaded workflow: ${workflow.flow.name}\n`);

  // Generate bundle with server and Docker files
  console.log("Generating bundle...");
  const result = await buildBundle({
    workflow,
    format: "esm",
    bundleFilename: "bundle.mjs",
    includeServer: true,
    serverPort: 3000,
    emitDocker: true,
    emitCompose: true,
    minify: false,
    defaultEnv: workflow.flow.envs || {},
  });

  if (!result.success) {
    console.error("✗ Bundle generation failed:", result.error);
    process.exit(1);
  }

  console.log("✓ Bundle generated successfully\n");

  // Create output directory
  await mkdir(outputDir, { recursive: true });

  // Write all generated files
  console.log("Writing files:");
  for (const [filename, content] of Object.entries(result.files || {})) {
    const filepath = join(outputDir, filename);
    await writeFile(filepath, content);
    console.log(`  ✓ ${filename} (${(content.length / 1024).toFixed(1)} KB)`);
  }

  console.log("\n✅ Production bundle ready!\n");
  console.log("Next steps:");
  console.log("  1. Review generated files in dist/");
  console.log("  2. Test locally:   bun dist/server.js");
  console.log("  3. Deploy:         cd dist && docker-compose up -d");
  console.log("\nAPI endpoint:");
  console.log("  POST http://localhost:3000/run");
  console.log('  Body: { "initialData": {...}, "env": {...} }');
}

main().catch(console.error);
