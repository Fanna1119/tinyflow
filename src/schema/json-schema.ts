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
    $schema: {
      type: "string",
      description: "JSON Schema reference for IDE validation",
    },
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
          nodeType: {
            type: "string",
            enum: ["default", "clusterRoot", "subNode"],
            description: "Type of node for cluster grouping",
          },
          handles: {
            type: "array",
            items: {
              type: "object",
              required: ["id", "type"],
              additionalProperties: false,
              properties: {
                id: { type: "string", minLength: 1 },
                type: { type: "string", enum: ["source", "target"] },
                label: { type: "string" },
                position: {
                  type: "string",
                  enum: ["top", "bottom", "left", "right"],
                },
              },
            },
            description: "Custom handles for cluster root nodes",
          },
          parentId: {
            type: "string",
            description: "Parent cluster root node ID for sub-nodes",
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
            description:
              "Action that triggers this edge (default, success, error, next, complete, or custom)",
          },
          condition: {
            type: "string",
          },
          sourceHandle: {
            type: "string",
            description: "ID of the source handle for cluster connections",
          },
          targetHandle: {
            type: "string",
            description: "ID of the target handle",
          },
          edgeType: {
            type: "string",
            enum: ["default", "subnode"],
            description: "Type of edge for rendering",
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
      additionalProperties: true,
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
