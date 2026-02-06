#!/usr/bin/env bun
/*
 * validate-examples.ts
 * Validate all JSON workflows in the `examples/` folder using the project's validator.
 * Run with: `bun run scripts/validate-examples.ts`
 */

import { promises as fs } from "fs";
import path from "path";

import { validateWorkflow } from "../src/schema/validator";
import { registry } from "../src/registry";
import { runWorkflow } from "../src/runtime";

const EXAMPLES_DIR = path.resolve(process.cwd(), "examples");

async function findJsonFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findJsonFiles(full)));
    } else if (
      entry.isFile() &&
      entry.name.toLowerCase().endsWith(".json") &&
      !entry.name.includes("schema")
    ) {
      files.push(full);
    }
  }
  return files;
}

function printError(err: { path: string; message: string }) {
  console.log(`  - ${err.path}: ${err.message}`);
}

async function run() {
  console.log("Validating examples in:", EXAMPLES_DIR);

  let files: string[];
  try {
    files = await findJsonFiles(EXAMPLES_DIR);
  } catch (e) {
    console.error("Failed to read examples directory:", e);
    process.exit(2);
    return;
  }

  if (files.length === 0) {
    console.log("No JSON files found in examples/");
    return;
  }

  const registered = registry.getIds();

  let validCount = 0;
  let invalidCount = 0;
  const failedFiles: string[] = [];
  const succeededFiles: string[] = [];

  for (const file of files) {
    process.stdout.write(`Checking ${path.relative(process.cwd(), file)} ... `);
    try {
      const raw = await fs.readFile(file, "utf-8");
      const parsed = JSON.parse(raw);
      const result = validateWorkflow(parsed, registered);

      if (result.valid) {
        // Schema valid — now attempt to execute and ensure it reaches core.end
        const execResult = await runWorkflow(parsed as any, {});

        if (!execResult.success) {
          invalidCount++;
          failedFiles.push(path.relative(process.cwd(), file));
          console.log("RUNTIME-FAIL");
          console.log(" Execution errors:");
          for (const l of execResult.logs) console.log(`  - ${l}`);
        } else {
          // Check for core.end execution in nodeResults
          const endNodeIds = (parsed.nodes || [])
            .filter((n: any) => n.functionId === "core.end")
            .map((n: any) => n.id);

          let reachedEnd = false;
          if (endNodeIds.length > 0) {
            for (const id of endNodeIds) {
              const nr = execResult.store.nodeResults.get(id);
              if (nr && nr.success) {
                reachedEnd = true;
                break;
              }
            }
          }

          if (!reachedEnd) {
            invalidCount++;
            failedFiles.push(path.relative(process.cwd(), file));
            console.log("NO-END");
            console.log(
              " Did not reach core.end (no successful core.end node)",
            );
          } else {
            validCount++;
            succeededFiles.push(path.relative(process.cwd(), file));
            console.log("OK");
          }
        }
      } else {
        invalidCount++;
        failedFiles.push(path.relative(process.cwd(), file));
        console.log("INVALID");
        if (result.errors.length > 0) {
          console.log(" Errors:");
          for (const e of result.errors) printError(e);
        }
        if (result.warnings.length > 0) {
          console.log(" Warnings:");
          for (const w of result.warnings) printError(w);
        }
      }
    } catch (e) {
      invalidCount++;
      console.log("ERROR");
      console.error(
        `  Failed to parse ${file}:`,
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  console.log("\nSummary:");
  console.log(`  Valid:   ${validCount}`);
  console.log(`  Invalid: ${invalidCount}`);

  if (failedFiles.length > 0) {
    // Print failed file names in red
    const red = (s: string) => `\u001b[31m${s}\u001b[0m`;
    console.log("\nFailed files:");
    for (const f of failedFiles) {
      console.log(red(`  ${f}`));
    }
    process.exitCode = 1;
  }

  if (succeededFiles.length > 0) {
    const green = (s: string) => `\u001b[32m${s}\u001b[0m`;
    console.log("\nSucceeded files:");
    for (const f of succeededFiles) {
      console.log(green(`  ${f}`));
    }
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(2);
});
