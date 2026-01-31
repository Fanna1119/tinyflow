#!/usr/bin/env node

/**
 * TinyFlow CLI
 * Command-line interface for running and building workflows
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname, join, basename } from "path";
import { parseArgs } from "util";
import { runWorkflowFromJson } from "../runtime";
import { compileWorkflowFromJson } from "../compiler";
import { parseWorkflow } from "../schema";
import { registry } from "../registry";
import { buildBundleFromJson } from "../bundle";

// ============================================================================
// CLI Helpers
// ============================================================================

const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};

function log(message: string, color?: keyof typeof colors): void {
  if (color) {
    console.log(`${colors[color]}${message}${colors.reset}`);
  } else {
    console.log(message);
  }
}

function logError(message: string): void {
  console.error(`${colors.red}Error: ${message}${colors.reset}`);
}

function logSuccess(message: string): void {
  log(`✓ ${message}`, "green");
}

function logWarning(message: string): void {
  log(`⚠ ${message}`, "yellow");
}

function logInfo(message: string): void {
  log(`ℹ ${message}`, "cyan");
}

// ============================================================================
// Commands
// ============================================================================

async function runCommand(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      input: { type: "string", short: "i" },
      env: { type: "string", short: "e", multiple: true },
      verbose: { type: "boolean", short: "v", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(`
Usage: tinyflow run <workflow.json> [options]

Options:
  -i, --input <json>   Initial input data as JSON string
  -e, --env <K=V>      Environment variable (can be repeated)
  -v, --verbose        Show detailed execution logs
  -h, --help           Show this help message

Example:
  tinyflow run workflow.json -i '{"name":"test"}' -e API_KEY=xxx
`);
    return;
  }

  const workflowPath = positionals[0];
  if (!workflowPath) {
    logError("No workflow file specified");
    process.exit(1);
  }

  // Resolve workflow path
  const resolvedPath = resolve(process.cwd(), workflowPath);
  if (!existsSync(resolvedPath)) {
    logError(`Workflow file not found: ${resolvedPath}`);
    process.exit(1);
  }

  // Read workflow
  const json = readFileSync(resolvedPath, "utf-8");

  // Parse initial data
  let initialData: Record<string, unknown> = {};
  if (values.input) {
    try {
      initialData = JSON.parse(values.input);
    } catch (e) {
      logError(
        `Invalid input JSON: ${e instanceof Error ? e.message : "Unknown error"}`,
      );
      process.exit(1);
    }
  }

  // Parse environment variables
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
  };
  if (values.env) {
    for (const e of values.env) {
      const [key, ...valueParts] = e.split("=");
      if (key) {
        env[key] = valueParts.join("=");
      }
    }
  }

  // Load .env file if present
  const envPath = resolve(dirname(resolvedPath), ".env");
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        if (key) {
          env[key] = valueParts.join("=");
        }
      }
    }
    logInfo(`Loaded environment from ${envPath}`);
  }

  logInfo(`Running workflow: ${workflowPath}`);
  log(`Registered functions: ${registry.size}`, "dim");

  // Run workflow
  const result = await runWorkflowFromJson(json, {
    initialData,
    env,
    onLog: values.verbose ? (msg) => log(`  ${msg}`, "dim") : undefined,
  });

  // Output results
  console.log("");
  if (result.success) {
    logSuccess(`Workflow completed in ${result.duration.toFixed(2)}ms`);
  } else {
    logError(`Workflow failed: ${result.error?.message}`);
    if (result.error?.nodeId) {
      log(`  at node: ${result.error.nodeId}`, "dim");
    }
  }

  // Show logs
  if (values.verbose && result.logs.length > 0) {
    console.log("\nExecution logs:");
    for (const logLine of result.logs) {
      log(`  ${logLine}`, "dim");
    }
  }

  // Show final store state
  if (values.verbose && result.store.data.size > 0) {
    console.log("\nFinal store state:");
    for (const [key, value] of result.store.data) {
      log(`  ${key}: ${JSON.stringify(value)}`, "dim");
    }
  }

  process.exit(result.success ? 0 : 1);
}

async function buildCommand(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      output: { type: "string", short: "o" },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(`
Usage: tinyflow build <workflow.json> [options]

Options:
  -o, --output <dir>   Output directory (default: ./dist)
  -h, --help           Show this help message

Example:
  tinyflow build workflow.json -o ./build
`);
    return;
  }

  const workflowPath = positionals[0];
  if (!workflowPath) {
    logError("No workflow file specified");
    process.exit(1);
  }

  const resolvedPath = resolve(process.cwd(), workflowPath);
  if (!existsSync(resolvedPath)) {
    logError(`Workflow file not found: ${resolvedPath}`);
    process.exit(1);
  }

  const json = readFileSync(resolvedPath, "utf-8");
  const outputDir = resolve(process.cwd(), values.output ?? "./dist");

  logInfo(`Building workflow: ${workflowPath}`);

  // Parse and validate
  const { workflow, validation } = parseWorkflow(json, registry.getIds());

  if (validation.warnings.length > 0) {
    for (const warn of validation.warnings) {
      logWarning(`${warn.path}: ${warn.message}`);
    }
  }

  if (!validation.valid || !workflow) {
    for (const err of validation.errors) {
      logError(`${err.path}: ${err.message}`);
    }
    process.exit(1);
  }

  // Compile to verify
  const compilation = compileWorkflowFromJson(json);
  if (!compilation.success) {
    for (const err of compilation.errors) {
      logError(err);
    }
    process.exit(1);
  }

  // Create output directory
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Write workflow JSON
  const workflowOutputPath = join(outputDir, "workflow.json");
  writeFileSync(workflowOutputPath, JSON.stringify(workflow, null, 2));
  logSuccess(`Wrote workflow to ${workflowOutputPath}`);

  // Write manifest
  const manifest = {
    name: workflow.name,
    version: workflow.version,
    description: workflow.description,
    startNodeId: workflow.flow.startNodeId,
    nodeCount: workflow.nodes.length,
    edgeCount: workflow.edges.length,
    functions: workflow.nodes.map((n) => n.functionId),
    builtAt: new Date().toISOString(),
  };
  const manifestPath = join(outputDir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  logSuccess(`Wrote manifest to ${manifestPath}`);

  // Copy .env if present
  const envPath = resolve(dirname(resolvedPath), ".env");
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, "utf-8");
    const envOutputPath = join(outputDir, ".env.example");
    // Strip values for security
    const stripped = envContent
      .split("\n")
      .map((line) => {
        if (line.startsWith("#") || !line.includes("=")) return line;
        const [key] = line.split("=");
        return `${key}=`;
      })
      .join("\n");
    writeFileSync(envOutputPath, stripped);
    logSuccess(`Wrote env template to ${envOutputPath}`);
  }

  console.log("");
  logSuccess(`Build complete! Output: ${outputDir}`);
}

async function bundleCommand(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      output: { type: "string", short: "o" },
      format: { type: "string", short: "f", default: "esm" },
      env: { type: "string", short: "e", multiple: true },
      minify: { type: "boolean", short: "m", default: false },
      standalone: { type: "boolean", short: "s", default: true },
      global: { type: "string", short: "g", default: "TinyFlow" },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(`
Usage: tinyflow bundle <workflow.json> [options]

Generates a standalone JavaScript bundle with the workflow embedded.
The bundle exports runFlow(), setEnv(), getEnv(), and getWorkflow() functions.

Options:
  -o, --output <file>    Output file path (default: workflow.bundle.js)
  -f, --format <format>  Output format: esm, cjs, iife (default: esm)
  -e, --env <K=V>        Default environment variable (can be repeated)
  -m, --minify           Minify the output
  -s, --standalone       Include embedded runtime (default: true)
  --global <name>        Global variable name for IIFE format (default: TinyFlow)
  -h, --help             Show this help message

Examples:
  tinyflow bundle workflow.json -o ./dist/flow.js
  tinyflow bundle workflow.json -f cjs -o ./dist/flow.cjs
  tinyflow bundle workflow.json -f iife --global MyFlow -m
  tinyflow bundle workflow.json -e API_KEY=xxx -e MODE=prod
`);
    return;
  }

  const workflowPath = positionals[0];
  if (!workflowPath) {
    logError("No workflow file specified");
    process.exit(1);
  }

  const resolvedPath = resolve(process.cwd(), workflowPath);
  if (!existsSync(resolvedPath)) {
    logError(`Workflow file not found: ${resolvedPath}`);
    process.exit(1);
  }

  const json = readFileSync(resolvedPath, "utf-8");

  // Parse environment variables
  const defaultEnv: Record<string, string> = {};
  if (values.env) {
    for (const e of values.env) {
      const [key, ...valueParts] = e.split("=");
      if (key) {
        defaultEnv[key] = valueParts.join("=");
      }
    }
  }

  // Load .env file if present
  const envPath = resolve(dirname(resolvedPath), ".env");
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        if (key && !defaultEnv[key]) {
          // Command line takes precedence
          defaultEnv[key] = valueParts.join("=");
        }
      }
    }
    logInfo(`Loaded default environment from ${envPath}`);
  }

  // Determine output format
  const format = (values.format as "esm" | "cjs" | "iife") || "esm";
  if (!["esm", "cjs", "iife"].includes(format)) {
    logError(`Invalid format: ${format}. Use: esm, cjs, or iife`);
    process.exit(1);
  }

  // Determine output file
  const ext = format === "cjs" ? ".cjs" : ".js";
  const defaultOutput = join(
    dirname(resolvedPath),
    `${basename(workflowPath, ".json")}.bundle${ext}`,
  );
  const outputPath = resolve(process.cwd(), values.output ?? defaultOutput);

  logInfo(`Bundling workflow: ${workflowPath}`);
  log(`  Format: ${format}`, "dim");
  log(`  Minify: ${values.minify}`, "dim");
  log(`  Standalone: ${values.standalone}`, "dim");
  if (format === "iife") {
    log(`  Global name: ${values.global}`, "dim");
  }
  if (Object.keys(defaultEnv).length > 0) {
    log(`  Default env: ${Object.keys(defaultEnv).join(", ")}`, "dim");
  }

  // Build bundle
  const result = await buildBundleFromJson(json, {
    format,
    defaultEnv,
    minify: values.minify,
    includeRuntime: values.standalone,
    globalName: values.global,
  });

  if (!result.success) {
    logError(result.error ?? "Unknown error");
    process.exit(1);
  }

  // Ensure output directory exists
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Write bundle
  writeFileSync(outputPath, result.code!);

  console.log("");
  logSuccess(`Bundle created: ${outputPath}`);
  log(`  Size: ${(result.code!.length / 1024).toFixed(2)} KB`, "dim");

  // Show usage hint
  console.log("\nUsage:");
  if (format === "esm") {
    log(
      `  import { runFlow, setEnv } from './${basename(outputPath)}';`,
      "cyan",
    );
  } else if (format === "cjs") {
    log(
      `  const { runFlow, setEnv } = require('./${basename(outputPath)}');`,
      "cyan",
    );
  } else {
    log(`  <script src="${basename(outputPath)}"></script>`, "cyan");
    log(`  ${values.global}.runFlow().then(console.log);`, "cyan");
  }
}

async function validateCommand(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(`
Usage: tinyflow validate <workflow.json>

Validates a workflow JSON file against the schema and checks function references.

Example:
  tinyflow validate workflow.json
`);
    return;
  }

  const workflowPath = positionals[0];
  if (!workflowPath) {
    logError("No workflow file specified");
    process.exit(1);
  }

  const resolvedPath = resolve(process.cwd(), workflowPath);
  if (!existsSync(resolvedPath)) {
    logError(`Workflow file not found: ${resolvedPath}`);
    process.exit(1);
  }

  const json = readFileSync(resolvedPath, "utf-8");

  logInfo(`Validating workflow: ${workflowPath}`);
  log(`Registered functions: ${registry.size}`, "dim");

  const { workflow, validation } = parseWorkflow(json, registry.getIds());

  // Show warnings
  if (validation.warnings.length > 0) {
    console.log("\nWarnings:");
    for (const warn of validation.warnings) {
      logWarning(`${warn.path}: ${warn.message}`);
    }
  }

  // Show errors
  if (validation.errors.length > 0) {
    console.log("\nErrors:");
    for (const err of validation.errors) {
      logError(`${err.path}: ${err.message}`);
    }
  }

  console.log("");
  if (validation.valid) {
    logSuccess("Workflow is valid!");
    if (workflow) {
      log(`  Name: ${workflow.name}`, "dim");
      log(`  Version: ${workflow.version}`, "dim");
      log(`  Nodes: ${workflow.nodes.length}`, "dim");
      log(`  Edges: ${workflow.edges.length}`, "dim");
    }
  } else {
    logError("Workflow validation failed");
  }

  process.exit(validation.valid ? 0 : 1);
}

async function listCommand(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      json: { type: "boolean", short: "j", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(`
Usage: tinyflow list [options]

Lists all registered functions available for use in workflows.

Options:
  -j, --json    Output as JSON
  -h, --help    Show this help message
`);
    return;
  }

  const metadata = registry.getAllMetadata();

  if (values.json) {
    console.log(JSON.stringify(metadata, null, 2));
    return;
  }

  const byCategory = registry.getMetadataByCategory();

  console.log("\nRegistered Functions:\n");

  for (const [category, functions] of byCategory) {
    log(`${category}:`, "cyan");
    for (const fn of functions) {
      log(`  ${fn.id}`, "green");
      log(`    ${fn.description}`, "dim");
    }
    console.log("");
  }

  log(`Total: ${metadata.length} functions`, "dim");
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    console.log(`
TinyFlow CLI - Visual workflow authoring and execution

Usage: tinyflow <command> [options]

Commands:
  run <workflow.json>       Execute a workflow
  build <workflow.json>     Build a distributable artifact
  bundle <workflow.json>    Generate standalone JS bundle
  validate <workflow.json>  Validate a workflow file
  list                      List registered functions

Options:
  -h, --help                Show help for a command

Examples:
  tinyflow run workflow.json -v
  tinyflow build workflow.json -o ./dist
  tinyflow bundle workflow.json -f esm -o ./flow.js
  tinyflow validate workflow.json
  tinyflow list --json
`);
    return;
  }

  const commandArgs = args.slice(1);

  switch (command) {
    case "run":
      await runCommand(commandArgs);
      break;
    case "build":
      await buildCommand(commandArgs);
      break;
    case "bundle":
      await bundleCommand(commandArgs);
      break;
    case "validate":
      await validateCommand(commandArgs);
      break;
    case "list":
      await listCommand(commandArgs);
      break;
    default:
      logError(`Unknown command: ${command}`);
      console.log('Run "tinyflow --help" for usage information.');
      process.exit(1);
  }
}

main().catch((e) => {
  logError(e instanceof Error ? e.message : "Unknown error");
  process.exit(1);
});
