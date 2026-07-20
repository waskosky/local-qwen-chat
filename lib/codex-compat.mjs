import { createHash } from "node:crypto";
import { Transform } from "node:stream";
import { StringDecoder } from "node:string_decoder";

const MAX_TOOL_NAME_LENGTH = 128;

const LOCAL_AGENT_INSTRUCTIONS = [
  "You are Codex, a local coding agent operating in the user's workspace.",
  "Follow developer, user, and AGENTS.md instructions in that order.",
  "Use the provided tools when they are needed or explicitly requested, and never invent tool results.",
  "Inspect relevant files and state before changing them, preserve unrelated work, and verify completed changes.",
  "Keep progress updates concise and continue until the requested outcome is genuinely handled.",
].join(" ");

function toolNameDigest(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export function flattenedToolName(namespace, name) {
  const candidate = `${namespace}__${name}`;
  if (candidate.length <= MAX_TOOL_NAME_LENGTH) return candidate;
  const suffix = `__${toolNameDigest(candidate)}`;
  return `${candidate.slice(0, MAX_TOOL_NAME_LENGTH - suffix.length)}${suffix}`;
}

function registerLookup(lookup, key, target) {
  if (!key) return;
  const current = lookup.get(key);
  if (current === undefined) {
    lookup.set(key, target);
    return;
  }
  if (current && (current.namespace !== target.namespace || current.name !== target.name)) {
    lookup.set(key, null);
  }
}

function registerToolAliases(lookup, namespace, name, flatName) {
  const target = { namespace, name };
  for (const alias of [
    flatName,
    `${namespace}__${name}`,
    `${namespace}.${name}`,
    `${namespace}/${name}`,
    `${namespace}:${name}`,
    name,
  ]) {
    registerLookup(lookup, alias, target);
  }
}

function flattenHistoricalFunctionCalls(value) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) flattenHistoricalFunctionCalls(item);
    return;
  }

  if (
    value.type === "function_call"
    && typeof value.namespace === "string"
    && typeof value.name === "string"
  ) {
    value.name = flattenedToolName(value.namespace, value.name);
    delete value.namespace;
  }

  for (const child of Object.values(value)) flattenHistoricalFunctionCalls(child);
}

export function rewriteResponsesRequest(input) {
  const body = JSON.parse(JSON.stringify(input));
  const toolLookup = new Map();
  const droppedToolTypes = new Set();

  if (Array.isArray(body.tools)) {
    const tools = [];
    for (const tool of body.tools) {
      if (tool?.type === "function") {
        tools.push(tool);
        continue;
      }
      if (tool?.type !== "namespace" || typeof tool.name !== "string" || !Array.isArray(tool.tools)) {
        if (typeof tool?.type === "string") droppedToolTypes.add(tool.type);
        continue;
      }

      for (const child of tool.tools) {
        if (child?.type !== "function" || typeof child.name !== "string") continue;
        const flatName = flattenedToolName(tool.name, child.name);
        registerToolAliases(toolLookup, tool.name, child.name, flatName);
        tools.push({ ...child, type: "function", name: flatName });
      }
    }
    body.tools = tools;
  }

  flattenHistoricalFunctionCalls(body.input);
  return { body, toolLookup, droppedToolTypes: [...droppedToolTypes] };
}

function resolveToolName(toolLookup, name) {
  const exact = toolLookup.get(name);
  if (exact) return exact;
  const normalized = name.replace(/[.:/]/g, "__");
  const normalizedMatch = toolLookup.get(normalized);
  return normalizedMatch || null;
}

export function restoreNamespacedFunctionCalls(value, toolLookup) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    for (const item of value) restoreNamespacedFunctionCalls(item, toolLookup);
    return value;
  }

  if (value.type === "function_call" && typeof value.name === "string") {
    const original = resolveToolName(toolLookup, value.name);
    if (original) {
      value.name = original.name;
      value.namespace = original.namespace;
    }
  }

  for (const child of Object.values(value)) restoreNamespacedFunctionCalls(child, toolLookup);
  return value;
}

export function transformResponsesSseBlock(block, toolLookup) {
  return block.split(/\r?\n/).map((line) => {
    const match = line.match(/^(data:\s*)(.*)$/);
    if (!match || match[2] === "[DONE]") return line;
    try {
      const payload = JSON.parse(match[2]);
      restoreNamespacedFunctionCalls(payload, toolLookup);
      return `${match[1]}${JSON.stringify(payload)}`;
    } catch {
      return line;
    }
  }).join("\n");
}

export function createResponsesSseTransform(toolLookup) {
  const decoder = new StringDecoder("utf8");
  let buffered = "";

  return new Transform({
    transform(chunk, _encoding, callback) {
      buffered += decoder.write(chunk);
      while (true) {
        const separator = buffered.match(/\r?\n\r?\n/);
        if (!separator || separator.index === undefined) break;
        const block = buffered.slice(0, separator.index);
        buffered = buffered.slice(separator.index + separator[0].length);
        this.push(`${transformResponsesSseBlock(block, toolLookup)}${separator[0]}`);
      }
      callback();
    },
    flush(callback) {
      buffered += decoder.end();
      if (buffered) this.push(transformResponsesSseBlock(buffered, toolLookup));
      callback();
    },
  });
}

function modelDataId(model) {
  return typeof model?.id === "string" ? model.id : typeof model?.model === "string" ? model.model : null;
}

function codexModelInfo(config, upstreamModel) {
  const contextWindow = Number(upstreamModel?.meta?.n_ctx) || config.contextWindow;
  return {
    slug: config.id,
    display_name: `${config.label} ${config.quantization}`,
    description: config.description,
    default_reasoning_level: "max",
    supported_reasoning_levels: [
      { effort: "none", description: "Answer without an extended reasoning trace" },
      { effort: "max", description: "Use the model's full reasoning mode" },
    ],
    shell_type: "unified_exec",
    visibility: "list",
    supported_in_api: true,
    priority: config.key === "q4" ? 10 : 20,
    additional_speed_tiers: [],
    service_tiers: [],
    default_service_tier: null,
    availability_nux: null,
    upgrade: null,
    base_instructions: LOCAL_AGENT_INSTRUCTIONS,
    model_messages: null,
    include_skills_usage_instructions: false,
    supports_reasoning_summaries: false,
    default_reasoning_summary: "none",
    support_verbosity: false,
    default_verbosity: null,
    apply_patch_tool_type: null,
    web_search_tool_type: "text",
    truncation_policy: { mode: "bytes", limit: 12000 },
    supports_parallel_tool_calls: false,
    supports_image_detail_original: false,
    context_window: contextWindow,
    max_context_window: contextWindow,
    auto_compact_token_limit: Math.floor(contextWindow * 0.60),
    comp_hash: `qwen3.6-${config.quantization}`,
    effective_context_window_percent: 65,
    experimental_supported_tools: [],
    input_modalities: ["text"],
    supports_search_tool: false,
    use_responses_lite: false,
    auto_review_model_override: null,
    tool_mode: "direct",
    multi_agent_version: "disabled",
  };
}

export function addCodexModelMetadata(catalog, modelConfigs) {
  const upstreamModels = Array.isArray(catalog?.data) ? catalog.data : [];
  const configs = Object.values(modelConfigs);
  const active = upstreamModels.flatMap((upstreamModel) => {
    const id = modelDataId(upstreamModel);
    const config = configs.find((candidate) => candidate.id === id);
    return config ? [codexModelInfo(config, upstreamModel)] : [];
  });
  return { ...catalog, models: active };
}
