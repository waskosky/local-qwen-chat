import assert from "node:assert/strict";
import { Readable } from "node:stream";

import {
  addCodexModelMetadata,
  createResponsesSseTransform,
  restoreNamespacedFunctionCalls,
  rewriteResponsesRequest,
} from "../lib/codex-compat.mjs";

const request = {
  model: "qwen3.6-27b-q4",
  input: [
    { type: "message", role: "user", content: "Use the Roblox tool" },
    {
      type: "function_call",
      namespace: "mcp__rai",
      name: "studio_apply",
      arguments: "{}",
      call_id: "call_previous",
    },
  ],
  tools: [
    { type: "function", name: "exec_command", description: "Run a command", parameters: {} },
    {
      type: "namespace",
      name: "mcp__rai",
      description: "Roblox Studio",
      tools: [
        {
          type: "function",
          name: "studio_apply",
          description: "Read or update Studio",
          strict: false,
          parameters: { type: "object", properties: {} },
        },
      ],
    },
    { type: "web_search", external_web_access: true },
  ],
};

const rewritten = rewriteResponsesRequest(request);
assert.deepEqual(rewritten.body.tools.map((tool) => tool.name), [
  "exec_command",
  "mcp__rai__studio_apply",
]);
assert.equal(rewritten.body.input[1].name, "mcp__rai__studio_apply");
assert.equal("namespace" in rewritten.body.input[1], false);
assert.deepEqual(rewritten.droppedToolTypes, ["web_search"]);

const payload = {
  type: "response.output_item.done",
  item: {
    type: "function_call",
    name: "mcp__rai__studio_apply",
    arguments: "{}",
    call_id: "call_1",
  },
};
restoreNamespacedFunctionCalls(payload, rewritten.toolLookup);
assert.equal(payload.item.name, "studio_apply");
assert.equal(payload.item.namespace, "mcp__rai");

const sseInput = [
  "event: response.output_item.done\n",
  `data: ${JSON.stringify({
    type: "response.output_item.done",
    item: {
      type: "function_call",
      name: "mcp__rai__studio_apply",
      arguments: "{}",
      call_id: "call_2",
    },
  })}\n\n`,
  "data: [DONE]\n\n",
];
let sseOutput = "";
for await (const chunk of Readable.from(sseInput).pipe(createResponsesSseTransform(rewritten.toolLookup))) {
  sseOutput += chunk;
}
assert.match(sseOutput, /"name":"studio_apply"/);
assert.match(sseOutput, /"namespace":"mcp__rai"/);
assert.match(sseOutput, /data: \[DONE\]/);

const catalog = addCodexModelMetadata(
  {
    object: "list",
    data: [{ id: "qwen3.6-27b-q4", meta: { n_ctx: 8192 } }],
  },
  {
    q4: {
      key: "q4",
      id: "qwen3.6-27b-q4",
      label: "Qwen3.6 27B",
      quantization: "Q4_K_M",
      contextWindow: 8192,
      description: "Faster",
    },
  },
);
assert.equal(catalog.models[0].slug, "qwen3.6-27b-q4");
assert.equal(catalog.models[0].context_window, 8192);
assert.equal(catalog.models[0].multi_agent_version, "disabled");

process.stdout.write("Codex compatibility checks passed.\n");
