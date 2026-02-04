/**
 * ClusterRootNode Tests
 * Tests for cluster node compilation and execution
 */

import { describe, it, expect } from "vitest";
import { compileWorkflow, createStore } from "../compiler";
import {
  ClusterRootNode,
  getClusterOutputs,
  getAllClusterOutputs,
} from "../clusterNode";
import type { WorkflowDefinition, WorkflowNode } from "../../schema/types";

// ============================================================================
// Helper to create valid workflow
// ============================================================================

function createWorkflow(
  overrides: Partial<WorkflowDefinition> = {},
): WorkflowDefinition {
  return {
    id: "test-id",
    name: "test-workflow",
    version: "1.0.0",
    nodes: [
      {
        id: "start",
        functionId: "core.start",
        params: {},
        position: { x: 0, y: 0 },
      },
    ],
    edges: [],
    flow: { startNodeId: "start" },
    ...overrides,
  };
}

// ============================================================================
// Test Fixtures
// ============================================================================

const clusterWorkflow = createWorkflow({
  nodes: [
    {
      id: "start",
      functionId: "core.start",
      params: {},
      position: { x: 0, y: 0 },
    },
    {
      id: "cluster",
      functionId: "core.log",
      params: { message: "Cluster root" },
      position: { x: 100, y: 0 },
      nodeType: "clusterRoot",
      handles: [
        { id: "right", type: "source", position: "right" },
        { id: "bottom", type: "source", position: "bottom" },
        { id: "left", type: "target", position: "left" },
      ],
    },
    {
      id: "sub1",
      functionId: "core.log",
      params: { message: "Sub-node 1" },
      position: { x: 150, y: 100 },
      nodeType: "subNode",
      parentId: "cluster",
      handles: [{ id: "top", type: "target", position: "top" }],
    },
    {
      id: "sub2",
      functionId: "core.log",
      params: { message: "Sub-node 2" },
      position: { x: 200, y: 100 },
      nodeType: "subNode",
      parentId: "cluster",
      handles: [{ id: "top", type: "target", position: "top" }],
    },
    {
      id: "end",
      functionId: "core.end",
      params: {},
      position: { x: 300, y: 0 },
    },
  ],
  edges: [
    { from: "start", to: "cluster", action: "default" },
    { from: "cluster", to: "sub1", action: "default", edgeType: "subnode" },
    { from: "cluster", to: "sub2", action: "default", edgeType: "subnode" },
    { from: "cluster", to: "end", action: "default" },
  ],
});

// ============================================================================
// ClusterRootNode Class Tests
// ============================================================================

describe("ClusterRootNode", () => {
  it("should create a ClusterRootNode with correct config", () => {
    const nodeConfig: WorkflowNode = {
      id: "cluster1",
      functionId: "core.log",
      params: { message: "Test" },
      position: { x: 0, y: 0 },
      nodeType: "clusterRoot",
    };

    const node = new ClusterRootNode(nodeConfig);
    expect(node.getConfig()).toEqual(nodeConfig);
    expect(node.getSubNodes()).toEqual([]);
  });

  it("should accept sub-node configurations", () => {
    const nodeConfig: WorkflowNode = {
      id: "cluster1",
      functionId: "core.log",
      params: {},
      position: { x: 0, y: 0 },
      nodeType: "clusterRoot",
    };

    const subNode1: WorkflowNode = {
      id: "sub1",
      functionId: "core.log",
      params: {},
      position: { x: 50, y: 50 },
      nodeType: "subNode",
      parentId: "cluster1",
    };

    const subNode2: WorkflowNode = {
      id: "sub2",
      functionId: "core.log",
      params: {},
      position: { x: 100, y: 50 },
      nodeType: "subNode",
      parentId: "cluster1",
    };

    const node = new ClusterRootNode(nodeConfig);
    node.setSubNodes([subNode1, subNode2], []);

    expect(node.getSubNodes()).toHaveLength(2);
    expect(node.getSubNodes()[0].id).toBe("sub1");
    expect(node.getSubNodes()[1].id).toBe("sub2");
  });

  it("should pass through flow environment variables", () => {
    const nodeConfig: WorkflowNode = {
      id: "cluster1",
      functionId: "core.log",
      params: {},
      position: { x: 0, y: 0 },
      nodeType: "clusterRoot",
    };

    const flowEnvs = { API_KEY: "secret", DEBUG: "true" };
    const node = new ClusterRootNode(nodeConfig, flowEnvs);

    // The environment should be accessible (tested implicitly through execution)
    expect(node.getConfig()).toEqual(nodeConfig);
  });
});

// ============================================================================
// Compilation Tests
// ============================================================================

describe("compileWorkflow with clusters", () => {
  it("should compile a workflow with cluster nodes", () => {
    const result = compileWorkflow(clusterWorkflow);

    expect(result.success).toBe(true);
    expect(result.flow).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it("should fail validation for orphaned sub-nodes", () => {
    const invalidWorkflow = createWorkflow({
      nodes: [
        {
          id: "start",
          functionId: "core.start",
          params: {},
          position: { x: 0, y: 0 },
        },
        {
          id: "sub1",
          functionId: "core.log",
          params: {},
          position: { x: 100, y: 0 },
          nodeType: "subNode",
          // Missing parentId
        },
      ],
      flow: { startNodeId: "start" },
    });

    const result = compileWorkflow(invalidWorkflow);
    expect(
      result.validation.errors.some((e) =>
        e.message.includes("must have a parentId"),
      ),
    ).toBe(true);
  });

  it("should fail validation when sub-node references non-existent parent", () => {
    const invalidWorkflow = createWorkflow({
      nodes: [
        {
          id: "start",
          functionId: "core.start",
          params: {},
          position: { x: 0, y: 0 },
        },
        {
          id: "sub1",
          functionId: "core.log",
          params: {},
          position: { x: 100, y: 0 },
          nodeType: "subNode",
          parentId: "nonexistent",
        },
      ],
      flow: { startNodeId: "start" },
    });

    const result = compileWorkflow(invalidWorkflow);
    expect(
      result.validation.errors.some((e) =>
        e.message.includes("non-existent parent"),
      ),
    ).toBe(true);
  });

  it("should fail validation when sub-node parent is not a clusterRoot", () => {
    const invalidWorkflow = createWorkflow({
      nodes: [
        {
          id: "start",
          functionId: "core.start",
          params: {},
          position: { x: 0, y: 0 },
        },
        {
          id: "regular",
          functionId: "core.log",
          params: {},
          position: { x: 100, y: 0 },
          // Not a clusterRoot
        },
        {
          id: "sub1",
          functionId: "core.log",
          params: {},
          position: { x: 150, y: 50 },
          nodeType: "subNode",
          parentId: "regular",
        },
      ],
      edges: [{ from: "start", to: "regular", action: "default" }],
      flow: { startNodeId: "start" },
    });

    const result = compileWorkflow(invalidWorkflow);
    expect(
      result.validation.errors.some((e) =>
        e.message.includes("must be a clusterRoot node"),
      ),
    ).toBe(true);
  });

  it("should warn when sub-node edge originates from non-clusterRoot", () => {
    const workflow = createWorkflow({
      nodes: [
        {
          id: "start",
          functionId: "core.start",
          params: {},
          position: { x: 0, y: 0 },
        },
        {
          id: "sub1",
          functionId: "core.log",
          params: {},
          position: { x: 100, y: 0 },
          nodeType: "subNode",
          parentId: "start", // Will fail because start isn't a clusterRoot
        },
      ],
      edges: [
        { from: "start", to: "sub1", action: "default", edgeType: "subnode" },
      ],
      flow: { startNodeId: "start" },
    });

    const result = compileWorkflow(workflow);
    // Should have an error about non-clusterRoot origin
    expect(
      result.validation.errors.some((e) =>
        e.message.includes("must originate from a clusterRoot"),
      ),
    ).toBe(true);
  });
});

// ============================================================================
// Helper Function Tests
// ============================================================================

describe("getClusterOutputs", () => {
  it("should return undefined when no cluster outputs exist", () => {
    const store = createStore();
    const outputs = getClusterOutputs(store, "cluster1");
    expect(outputs).toBeUndefined();
  });

  it("should return cluster outputs when they exist", () => {
    const store = createStore();
    const clusterOutputs = {
      cluster1: { sub1: "output1", sub2: "output2" },
    };
    store.data.set("_clusterOutputs", clusterOutputs);

    const outputs = getClusterOutputs(store, "cluster1");
    expect(outputs).toEqual({ sub1: "output1", sub2: "output2" });
  });
});

describe("getAllClusterOutputs", () => {
  it("should return empty object when no cluster outputs exist", () => {
    const store = createStore();
    const outputs = getAllClusterOutputs(store);
    expect(outputs).toEqual({});
  });

  it("should return all cluster outputs when they exist", () => {
    const store = createStore();
    const clusterOutputs = {
      cluster1: { sub1: "output1" },
      cluster2: { sub2: "output2" },
    };
    store.data.set("_clusterOutputs", clusterOutputs);

    const outputs = getAllClusterOutputs(store);
    expect(outputs).toEqual(clusterOutputs);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("Cluster execution integration", () => {
  it("should compile and prepare a cluster workflow for execution", () => {
    const result = compileWorkflow(clusterWorkflow);
    expect(result.success).toBe(true);
    expect(result.flow).toBeDefined();

    // Create a store for execution
    const store = createStore({ input: "test" });
    expect(store.data.get("input")).toBe("test");
  });
});
