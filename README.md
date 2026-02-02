# TinyFlow Bundle

This bundle contains 1 workflow(s):

- **Agentic Support Ticket Handler** (`Agentic_Support_Ticket_Handler`)

## Usage

### As ES Module

```javascript
import { Agentic_Support_Ticket_Handler } from './bundle.mjs';

// Run a specific workflow
const result = await Agentic_Support_Ticket_Handler.runFlow({
  initialData: { /* your input data */ },
  env: { /* optional env overrides */ },
});

console.log(result.success, result.data);
```

### Individual Workflow API

Each workflow export has these methods:

- `runFlow(options)` - Execute the workflow
- `setEnv(key, value)` - Set environment variable
- `getEnv()` - Get current environment
- `getWorkflow()` - Get workflow definition

## HTTP Server

Start the server:

```bash
bun server.js
# or
PORT=3000 bun server.js
```

### Endpoints

| Endpoint | Method | Workflow |
|----------|--------|----------|
| `/api/agentic-support-ticket-handler` | POST | Agentic Support Ticket Handler |

### Example Request

```bash
curl -X POST http://localhost:3000/api/agentic-support-ticket-handler \
  -H "Content-Type: application/json" \
  -d '{"initialData": {}}'
```
