/**
 * Registry Module
 * Exports registry and all built-in functions
 */

// Core registry
export * from "./registry";

// Load all built-in functions (side effects: registers functions)
import "./functions/core";
import "./functions/transform";
import "./functions/control";
import "./functions/http";
import "./functions/llm";
import "./functions/memory";
import "./functions/database";
