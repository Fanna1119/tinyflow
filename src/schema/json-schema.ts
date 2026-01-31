/**
 * JSON Schema for Workflow Definition
 * Used for validation with AJV
 */

// We use a looser type here because AJV's strict JSONSchemaType
// has issues with optional properties and records
export const workflowJsonSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://tinyflow.dev/workflow.schema.json",
  title: "TinyFlow Workflow",
  description: "A workflow definition for TinyFlow execution",
  type: "object",
  required: ["id", "name", "version", "nodes", "edges", "flow"],
  additionalProperties: false,
  properties: {
    id: {
      type: "string",
      minLength: 1,
      description: "Unique workflow identifier",
    },
    name: {
      type: "string",
      minLength: 1,
      description: "Human-readable workflow name",
    },
    description: {
      type: "string",
      description: "Optional workflow description",
    },
    version: {
      type: "string",
      pattern: "^\\d+\\.\\d+\\.\\d+$",
      description: "Semantic version string",
    },
    nodes: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "functionId", "params", "position"],
        additionalProperties: false,
        properties: {
          id: {
            type: "string",
            minLength: 1,
          },
          functionId: {
            type: "string",
            minLength: 1,
          },
          params: {
            type: "object",
            additionalProperties: true,
          },
          runtime: {
            type: "object",
            additionalProperties: false,
            properties: {
              maxRetries: { type: "integer", minimum: 0 },
              timeout: { type: "integer", minimum: 0 },
              retryDelay: { type: "integer", minimum: 0 },
            },
          },
          envs: {
            type: "object",
            additionalProperties: { type: "string" },
          },
          position: {
            type: "object",
            required: ["x", "y"],
            additionalProperties: false,
            properties: {
              x: { type: "number" },
              y: { type: "number" },
            },
          },
          label: {
            type: "string",
          },
        },
      },
    },
    edges: {
      type: "array",
      items: {
        type: "object",
        required: ["from", "to", "action"],
        additionalProperties: false,
        properties: {
          from: {
            type: "string",
            minLength: 1,
          },
          to: {
            type: "string",
            minLength: 1,
          },
          action: {
            type: "string",
            enum: ["default", "success", "error", "condition"],
          },
          condition: {
            type: "string",
          },
        },
      },
    },
    flow: {
      type: "object",
      required: ["startNodeId"],
      additionalProperties: false,
      properties: {
        startNodeId: {
          type: "string",
          minLength: 1,
        },
        runtime: {
          type: "object",
          additionalProperties: false,
          properties: {
            maxRetries: { type: "integer", minimum: 0 },
            timeout: { type: "integer", minimum: 0 },
            retryDelay: { type: "integer", minimum: 0 },
          },
        },
        envs: {
          type: "object",
          additionalProperties: { type: "string" },
        },
      },
    },
    metadata: {
      type: "object",
      additionalProperties: false,
      properties: {
        author: { type: "string" },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
        tags: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
  },
} as const;

export type WorkflowSchema = typeof workflowJsonSchema;
