/**
 * Node Types Configuration
 * Exported separately to satisfy React Fast Refresh requirements
 */

import {
  FunctionNode,
  ErrorNode,
  ClusterRootNode,
  SubNode,
} from "./CustomNodes";

export const nodeTypes = {
  function: FunctionNode,
  error: ErrorNode,
  clusterRoot: ClusterRootNode,
  subNode: SubNode,
};
