/**
 * Node Types Configuration
 * Exported separately to satisfy React Fast Refresh requirements
 */

import { FunctionNode, ErrorNode } from "./CustomNodes";

export const nodeTypes = {
  function: FunctionNode,
  error: ErrorNode,
};
