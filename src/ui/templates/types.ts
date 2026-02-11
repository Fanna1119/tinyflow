/**
 * Workflow Template Types
 *
 * Templates are pre-built workflow patterns that users can insert
 * with one click. They provide nodes, edges, and metadata.
 */

import type { WorkflowNode, WorkflowEdge } from "../../schema/types";

/** A single workflow template */
export interface WorkflowTemplate {
  /** Unique template ID */
  id: string;
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Category for grouping */
  category: TemplateCategory;
  /** Icon name (Lucide icon) */
  icon: string;
  /** Difficulty tag */
  difficulty: "beginner" | "intermediate" | "advanced";
  /** Tags for search */
  tags: string[];
  /** Nodes to insert */
  nodes: WorkflowNode[];
  /** Edges to connect nodes */
  edges: WorkflowEdge[];
  /** Which node starts the flow */
  startNodeId: string;
}

/** Template categories */
export type TemplateCategory =
  | "Getting Started"
  | "Data Processing"
  | "API & HTTP"
  | "Control Flow"
  | "Patterns";

/**
 * A multi-node pattern that can be inserted into an existing workflow.
 * Unlike templates (which replace the entire canvas), patterns are
 * dropped at a position and optionally auto-connected to nearby nodes.
 */
export interface WorkflowPattern {
  /** Unique pattern ID */
  id: string;
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Icon name (Lucide icon) */
  icon: string;
  /** Node definitions (positions are relative offsets) */
  nodes: WorkflowNode[];
  /** Internal edges between the pattern's nodes */
  edges: WorkflowEdge[];
}
