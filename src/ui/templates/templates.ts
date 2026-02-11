/**
 * Built-in Workflow Templates & Patterns
 *
 * Templates and patterns are now stored as JSON files in the
 * /templates and /patterns directories respectively, loaded
 * dynamically via the server API.
 */

export type {
  WorkflowTemplate,
  WorkflowPattern,
  TemplateCategory,
} from "./types";
export {
  fetchTemplates,
  fetchPatterns,
  savePattern,
  deletePattern,
} from "../utils/serverApi";
