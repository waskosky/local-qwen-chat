const STORAGE_KEY = "local-qwen-chat.conversations.v1";
const ACTIVE_KEY = "local-qwen-chat.active.v1";
const SETTINGS_KEY = "local-qwen-chat.settings.v1";
const THEME_KEY = "local-qwen-chat.theme.v1";
const MODEL = "qwen3.6-27b-q4";
const MODEL_QUANTIZATION = "Q4_K_M";
const MODEL_CHOICES = Object.freeze({
  q4: Object.freeze({ id: "qwen3.6-27b-q4", quantization: "Q4_K_M" }),
  q6: Object.freeze({ id: "qwen3.6-27b-q6", quantization: "Q6_K_L" }),
});

const DEFAULT_SETTINGS = Object.freeze({
  systemPrompt: "You are a precise, helpful local coding assistant. Prefer clear explanations and practical solutions. Put code in Markdown fenced code blocks with a language tag.",
  temperature: 0.6,
  maxTokens: 2048,
  thinking: true,
});

const icons = {
  assistant: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3 1.5 8 5 13l1.2-.9L3.3 8l2.9-4.1L5 3Zm6 0-1.2.9L12.7 8l-2.9 4.1 1.2.9 3.5-5L11 3ZM8.8 1.5 6.2 14.5h1.5l2.6-13H8.8Z"/></svg>',
  user: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5a3.25 3.25 0 1 0 0 6.5 3.25 3.25 0 0 0 0-6.5ZM3 14.25a5 5 0 0 1 10 0 .75.75 0 0 1-1.5 0 3.5 3.5 0 0 0-7 0 .75.75 0 0 1-1.5 0Z"/></svg>',
  copy: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.75 1A1.75 1.75 0 0 0 4 2.75v.5a.75.75 0 0 0 1.5 0v-.5a.25.25 0 0 1 .25-.25h7.5a.25.25 0 0 1 .25.25v7.5a.25.25 0 0 1-.25.25h-.5a.75.75 0 0 0 0 1.5h.5A1.75 1.75 0 0 0 15 10.25v-7.5A1.75 1.75 0 0 0 13.25 1h-7.5ZM2.75 4A1.75 1.75 0 0 0 1 5.75v7.5C1 14.22 1.78 15 2.75 15h7.5A1.75 1.75 0 0 0 12 13.25v-7.5A1.75 1.75 0 0 0 10.25 4h-7.5Zm-.25 1.75c0-.14.11-.25.25-.25h7.5c.14 0 .25.11.25.25v7.5a.25.25 0 0 1-.25.25h-7.5a.25.25 0 0 1-.25-.25v-7.5Z"/></svg>',
  clock: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm0 1.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Zm.75 2a.75.75 0 0 0-1.5 0V8c0 .2.08.39.22.53l2.25 2.25a.75.75 0 1 0 1.06-1.06L8.75 7.69V4.5Z"/></svg>',
  speed: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2a6 6 0 0 0-5.2 9 .75.75 0 1 0 1.3-.75 4.5 4.5 0 1 1 7.8 0 .75.75 0 1 0 1.3.75A6 6 0 0 0 8 2Zm3.03 3.97a.75.75 0 0 0-1.06 0L7.47 8.47a.75.75 0 1 0 1.06 1.06l2.5-2.5a.75.75 0 0 0 0-1.06ZM5.25 12a.75.75 0 0 0 0 1.5h5.5a.75.75 0 0 0 0-1.5h-5.5Z"/></svg>',
  tokens: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.75 2A1.75 1.75 0 0 0 1 3.75v3.5C1 8.22 1.78 9 2.75 9h3.5A1.75 1.75 0 0 0 8 7.25v-3.5A1.75 1.75 0 0 0 6.25 2h-3.5Zm7 5A1.75 1.75 0 0 0 8 8.75v3.5c0 .97.78 1.75 1.75 1.75h3.5A1.75 1.75 0 0 0 15 12.25v-3.5A1.75 1.75 0 0 0 13.25 7h-3.5Zm-7 3A1.75 1.75 0 0 0 1 11.75v.5C1 13.22 1.78 14 2.75 14h1.5A1.75 1.75 0 0 0 6 12.25v-.5A1.75 1.75 0 0 0 4.25 10h-1.5Zm7-7A1.75 1.75 0 0 0 8 4.75v.5C8 6.22 8.78 7 9.75 7h1.5A1.75 1.75 0 0 0 13 5.25v-.5A1.75 1.75 0 0 0 11.25 3h-1.5Z"/></svg>',
  message: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 2.75C1 1.78 1.78 1 2.75 1h10.5C14.22 1 15 1.78 15 2.75v7.5A1.75 1.75 0 0 1 13.25 12H7.5l-3.93 2.75A1 1 0 0 1 2 13.93V12.1A1.75 1.75 0 0 1 1 10.52V2.75Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .14.11.25.25.25h.75v2.47l3.53-2.47h6.22a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25H2.75Z"/></svg>',
  trash: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.5 1.75A.75.75 0 0 1 7.25 1h1.5a.75.75 0 0 1 .75.75V2h3.75a.75.75 0 0 1 0 1.5h-.56l-.72 10.03A1.59 1.59 0 0 1 10.38 15H5.62a1.59 1.59 0 0 1-1.58-1.47L3.31 3.5h-.56a.75.75 0 0 1 0-1.5H6.5v-.25ZM4.82 3.5l.71 9.92c0 .04.04.08.09.08h4.76c.05 0 .08-.04.09-.08l.71-9.92H4.82ZM6.75 5a.75.75 0 0 1 .75.75v5a.75.75 0 0 1-1.5 0v-5A.75.75 0 0 1 6.75 5Zm3.25.75a.75.75 0 0 0-1.5 0v5a.75.75 0 0 0 1.5 0v-5Z"/></svg>',
};

const elements = {
  body: document.body,
  chatScroll: document.querySelector("#chatScroll"),
  clearHistoryButton: document.querySelector("#clearHistoryButton"),
  composer: document.querySelector("#composer"),
  conversation: document.querySelector("#conversation"),
  currentModelName: document.querySelector("#currentModelName"),
  emptyState: document.querySelector("#emptyState"),
  historyList: document.querySelector("#historyList"),
  maxTokensInput: document.querySelector("#maxTokensInput"),
  menuButton: document.querySelector("#menuButton"),
  messageList: document.querySelector("#messageList"),
  modelMenu: document.querySelector("#modelMenu"),
  modelSelector: document.querySelector("#modelSelector"),
  modelSelectorButton: document.querySelector("#modelSelectorButton"),
  newChatButton: document.querySelector("#newChatButton"),
  promptInput: document.querySelector("#promptInput"),
  resetSettingsButton: document.querySelector("#resetSettingsButton"),
  saveSettingsButton: document.querySelector("#saveSettingsButton"),
  sendButton: document.querySelector("#sendButton"),
  settingsButton: document.querySelector("#settingsButton"),
  settingsDialog: document.querySelector("#settingsDialog"),
  settingsForm: document.querySelector("#settingsForm"),
  sidebarClose: document.querySelector("#sidebarClose"),
  sidebarModelQuantization: document.querySelector("#sidebarModelQuantization"),
  sidebarModelState: document.querySelector("#sidebarModelState"),
  sidebarScrim: document.querySelector("#sidebarScrim"),
  statusPill: document.querySelector("#statusPill"),
  statusText: document.querySelector("#statusText"),
  systemPrompt: document.querySelector("#systemPrompt"),
  temperatureInput: document.querySelector("#temperatureInput"),
  themeButton: document.querySelector("#themeButton"),
  thinkingToggle: document.querySelector("#thinkingToggle"),
  toast: document.querySelector("#toast"),
};

let conversations = readJson(STORAGE_KEY, []);
if (!Array.isArray(conversations)) conversations = [];
conversations = conversations.filter((item) => item && Array.isArray(item.messages));

let activeId = localStorage.getItem(ACTIVE_KEY);
if (!conversations.some((item) => item.id === activeId)) activeId = null;

let settings = { ...DEFAULT_SETTINGS, ...readJson(SETTINGS_KEY, {}) };
settings.temperature = clampNumber(settings.temperature, 0, 2, DEFAULT_SETTINGS.temperature);
settings.maxTokens = clampNumber(settings.maxTokens, 128, 6144, DEFAULT_SETTINGS.maxTokens);
settings.thinking = settings.thinking !== false;

let generating = false;
let generationController = null;
let toastTimer = null;
let modelReady = false;
let modelSwitching = false;
let modelStatus = null;
let modelStatusRequest = null;
let modelInfo = {
  id: MODEL,
  quantization: MODEL_QUANTIZATION,
  contextWindow: 8192,
  parameterCount: 27_320_697_856,
  sizeBytes: 17_984_872_960,
};

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function clampNumber(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function activeConversation() {
  return conversations.find((item) => item.id === activeId) || null;
}

function saveState() {
  const trimmed = [...conversations]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 50);
  conversations = trimmed;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
  else localStorage.removeItem(ACTIVE_KEY);
}

function createConversation() {
  const now = Date.now();
  const conversation = {
    id: makeId(),
    title: "New conversation",
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  conversations.unshift(conversation);
  activeId = conversation.id;
  saveState();
  return conversation;
}

function newChat() {
  stopGeneration();
  activeId = null;
  saveState();
  renderAll();
  closeSidebar();
  elements.promptInput.focus();
}

function selectConversation(id) {
  if (id === activeId) {
    closeSidebar();
    return;
  }
  stopGeneration();
  activeId = id;
  saveState();
  renderAll();
  closeSidebar();
  scrollToBottom(false);
}

function deleteConversation(id) {
  if (id === activeId) stopGeneration();
  conversations = conversations.filter((item) => item.id !== id);
  if (id === activeId) activeId = conversations[0]?.id || null;
  saveState();
  renderAll();
}

function renderAll() {
  renderHistory();
  renderConversation();
  updateComposerState();
}

function renderHistory() {
  elements.historyList.replaceChildren();
  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
  if (!sorted.length) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "Your chats will appear here.";
    elements.historyList.append(empty);
    elements.clearHistoryButton.hidden = true;
    return;
  }

  elements.clearHistoryButton.hidden = false;
  for (const conversation of sorted) {
    const wrapper = document.createElement("div");
    wrapper.className = `history-item${conversation.id === activeId ? " active" : ""}`;
    wrapper.dataset.id = conversation.id;

    const open = document.createElement("button");
    open.type = "button";
    open.className = "history-open";
    open.title = conversation.title;
    open.innerHTML = `${icons.message}<span class="history-title"></span>`;
    open.querySelector(".history-title").textContent = conversation.title;
    open.addEventListener("click", () => selectConversation(conversation.id));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "history-delete";
    remove.title = "Delete conversation";
    remove.setAttribute("aria-label", `Delete ${conversation.title}`);
    remove.innerHTML = icons.trash;
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteConversation(conversation.id);
    });

    wrapper.append(open, remove);
    elements.historyList.append(wrapper);
  }
}

function renderConversation() {
  const conversation = activeConversation();
  const hasMessages = Boolean(conversation?.messages.length);
  elements.emptyState.hidden = hasMessages;
  elements.messageList.replaceChildren();
  if (!hasMessages) return;

  for (const message of conversation.messages) {
    if (!message.id) message.id = makeId();
    elements.messageList.append(createMessageElement(message));
  }
}

function createMessageElement(message) {
  const row = document.createElement("article");
  const roleClass = message.role === "user" ? "user-message" : "assistant-message";
  row.className = `message-row ${roleClass}${message.error ? " error-message" : ""}`;
  row.dataset.messageId = message.id;

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.innerHTML = message.role === "user" ? icons.user : icons.assistant;

  const main = document.createElement("div");
  main.className = "message-main";
  const header = document.createElement("div");
  header.className = "message-header";

  const author = document.createElement("span");
  author.className = "message-author";
  author.textContent = message.role === "user" ? "You" : "Qwen";

  const actions = document.createElement("div");
  actions.className = "message-actions";
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "message-action copy-message";
  copy.title = "Copy message";
  copy.setAttribute("aria-label", "Copy message");
  copy.innerHTML = icons.copy;
  copy.addEventListener("click", () => copyText(message.content || "", "Message copied"));
  actions.append(copy);
  header.append(author, actions);

  const reasoningSlot = document.createElement("div");
  reasoningSlot.className = "reasoning-slot";
  const content = document.createElement("div");
  content.className = "message-content";
  const statsSlot = document.createElement("div");
  statsSlot.className = "response-stats-slot";
  main.append(header, reasoningSlot, content, statsSlot);
  row.append(avatar, main);
  fillMessageElement(row, message);
  return row;
}

function fillMessageElement(row, message) {
  row.classList.toggle("error-message", Boolean(message.error));
  const reasoningSlot = row.querySelector(".reasoning-slot");
  const content = row.querySelector(".message-content");
  const statsSlot = row.querySelector(".response-stats-slot");

  if (message.reasoning) {
    reasoningSlot.innerHTML = `<details class="reasoning-panel"${message.pending && !message.content ? " open" : ""}><summary>${message.pending && !message.content ? "Thinking…" : "Reasoning"}</summary><div class="reasoning-content">${renderMarkdown(message.reasoning)}</div></details>`;
  } else {
    reasoningSlot.replaceChildren();
  }

  if (message.pending && !message.content) {
    content.innerHTML = '<div class="typing-dots" aria-label="Qwen is responding"><span></span><span></span><span></span></div>';
  } else {
    content.innerHTML = renderMarkdown(message.content || "");
  }

  if (message.role === "assistant" && !message.pending && message.stats) {
    statsSlot.innerHTML = renderResponseStats(message.stats);
  } else {
    statsSlot.replaceChildren();
  }
}

function updateMessage(message) {
  const row = [...elements.messageList.querySelectorAll(".message-row")]
    .find((item) => item.dataset.messageId === message.id);
  if (row) fillMessageElement(row, message);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isFiniteNumber(value) {
  return value !== null && value !== "" && typeof value !== "boolean" && Number.isFinite(Number(value));
}

function formatDuration(milliseconds) {
  if (!isFiniteNumber(milliseconds)) return "—";
  const value = Math.max(0, Number(milliseconds));
  if (value < 1000) return `${Math.round(value)} ms`;
  if (value < 10_000) return `${(value / 1000).toFixed(2)} s`;
  if (value < 60_000) return `${(value / 1000).toFixed(1)} s`;
  const minutes = Math.floor(value / 60_000);
  const seconds = Math.round((value % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function formatRate(value) {
  if (!isFiniteNumber(value)) return "—";
  return `${Number(value).toFixed(1)} tok/s`;
}

function formatCount(value) {
  if (!isFiniteNumber(value)) return "—";
  return Math.round(Number(value)).toLocaleString();
}

function formatBytes(value) {
  if (!isFiniteNumber(value)) return "";
  return `${(Number(value) / 1024 ** 3).toFixed(1)} GiB`;
}

function formatParameters(value) {
  if (!isFiniteNumber(value)) return "";
  return `${(Number(value) / 1_000_000_000).toFixed(1)}B`;
}

function formatCompletedAt(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function statItem(label, value, note = "") {
  if (!value || value === "—") return "";
  return `<div class="stat-item"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>${note ? `<small>${escapeHtml(note)}</small>` : ""}</div>`;
}

function renderResponseStats(stats) {
  if (!stats || typeof stats !== "object") return "";
  const totalTime = formatDuration(stats.totalMs);
  const generatedTokens = isFiniteNumber(stats.generatedTokens) ? `${formatCount(stats.generatedTokens)} tokens` : "";
  const generationRate = isFiniteNumber(stats.generationTokensPerSecond) ? formatRate(stats.generationTokensPerSecond) : "";
  const outcomeLabel = stats.outcome === "stopped" ? "Stopped" : stats.outcome === "error" ? "Failed" : "Completed";

  const summaryParts = [
    `<span class="stats-summary-item">${icons.clock}<span>${escapeHtml(totalTime)}</span></span>`,
  ];
  if (generationRate) summaryParts.push(`<span class="stats-summary-item">${icons.speed}<span>${escapeHtml(generationRate)}</span></span>`);
  if (generatedTokens) summaryParts.push(`<span class="stats-summary-item">${icons.tokens}<span>${escapeHtml(generatedTokens)}</span></span>`);

  const promptNote = [
    isFiniteNumber(stats.promptMs) ? formatDuration(stats.promptMs) : "",
    isFiniteNumber(stats.promptTokensPerSecond) ? formatRate(stats.promptTokensPerSecond) : "",
  ].filter(Boolean).join(" · ");
  const generationNote = [
    isFiniteNumber(stats.generationMs) ? formatDuration(stats.generationMs) : "",
    generationRate,
  ].filter(Boolean).join(" · ");

  const totalTokens = isFiniteNumber(stats.totalTokens) ? Number(stats.totalTokens) : null;
  const contextWindow = isFiniteNumber(stats.contextWindow) ? Number(stats.contextWindow) : null;
  const contextNote = totalTokens !== null && contextWindow
    ? `${Math.min(100, totalTokens / contextWindow * 100).toFixed(1)}% of context window`
    : "";
  const cachedTokens = isFiniteNumber(stats.cachedTokens) ? Number(stats.cachedTokens) : null;
  const promptTokens = isFiniteNumber(stats.promptTokens) ? Number(stats.promptTokens) : null;
  const cacheNote = cachedTokens !== null && promptTokens
    ? `${Math.min(100, cachedTokens / promptTokens * 100).toFixed(1)}% of prompt`
    : "";

  const items = [
    statItem("Total elapsed", totalTime, "browser wall clock"),
    statItem("First token", formatDuration(stats.timeToFirstTokenMs), "time to first token"),
    statItem("Prompt", promptTokens !== null ? `${formatCount(promptTokens)} tokens` : "", promptNote),
    statItem("Generation", generatedTokens, generationNote),
    statItem("Context used", totalTokens !== null && contextWindow ? `${formatCount(totalTokens)} / ${formatCount(contextWindow)}` : "", contextNote),
    statItem("Prompt cache", cachedTokens !== null ? `${formatCount(cachedTokens)} tokens` : "", cacheNote),
    statItem("Server work", formatDuration(stats.serverMs), "prompt + generation"),
    statItem("Other overhead", formatDuration(stats.overheadMs), "queue + network + UI"),
  ].filter(Boolean).join("");

  const modelBits = [
    stats.model,
    stats.quantization,
    isFiniteNumber(stats.parameterCount) ? `${formatParameters(stats.parameterCount)} parameters` : "",
    isFiniteNumber(stats.modelSizeBytes) ? formatBytes(stats.modelSizeBytes) : "",
    stats.thinking ? "thinking on" : "thinking off",
    isFiniteNumber(stats.temperature) ? `temperature ${Number(stats.temperature).toFixed(1)}` : "",
    stats.finishReason ? `finish: ${stats.finishReason}` : "",
  ].filter(Boolean);
  const runtime = stats.systemFingerprint ? String(stats.systemFingerprint).split("-")[0] : "";
  if (runtime) modelBits.push(`llama.cpp ${runtime}`);
  const completedAt = formatCompletedAt(stats.completedAt);

  return `<details class="response-stats"><summary><span class="stats-summary">${summaryParts.join("")}</span><span class="stats-outcome stats-outcome-${escapeHtml(stats.outcome || "completed")}">${escapeHtml(outcomeLabel)}</span><span class="stats-details-label">Details</span></summary><dl class="stats-grid">${items}</dl><div class="stats-footer"${stats.systemFingerprint ? ` title="${escapeHtml(stats.systemFingerprint)}"` : ""}><span>${escapeHtml(modelBits.join(" · "))}</span>${completedAt ? `<span>Finished ${escapeHtml(completedAt)}</span>` : ""}</div></details>`;
}

function renderInline(value) {
  return String(value)
    .split(/(`[^`\n]+`)/g)
    .map((part) => {
      if (part.startsWith("`") && part.endsWith("`")) {
        return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      }
      return escapeHtml(part)
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/__([^_]+)__/g, "<strong>$1</strong>")
        .replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,!?:;])/g, "$1<em>$2</em>");
    })
    .join("");
}

function renderMarkdown(source) {
  if (!source) return "";
  const codeBlocks = [];
  const tokenized = String(source).replace(/```([^\n`]*)\n?([\s\S]*?)```/g, (_match, language, code) => {
    const index = codeBlocks.length;
    codeBlocks.push({ language: language.trim() || "text", code: code.replace(/\n$/, "") });
    return `\n\u0000CODE${index}\u0000\n`;
  });

  const lines = tokenized.replace(/\r\n?/g, "\n").split("\n");
  const output = [];
  let paragraph = [];
  let listType = null;
  let listItems = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    output.push(`<p>${paragraph.map(renderInline).join("<br>")}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!listItems.length) return;
    output.push(`<${listType}>${listItems.map((item) => `<li>${renderInline(item)}</li>`).join("")}</${listType}>`);
    listType = null;
    listItems = [];
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
  };

  for (const line of lines) {
    const codeMatch = line.match(/^\u0000CODE(\d+)\u0000$/);
    if (codeMatch) {
      flushAll();
      const block = codeBlocks[Number(codeMatch[1])];
      output.push(`<div class="code-block"><div class="code-header"><span>${escapeHtml(block.language)}</span><button class="copy-code" type="button">${icons.copy}<span>Copy</span></button></div><pre><code>${escapeHtml(block.code)}</code></pre></div>`);
      continue;
    }

    if (!line.trim()) {
      flushAll();
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushAll();
      const level = heading[1].length;
      output.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const nextType = unordered ? "ul" : "ol";
      if (listType && listType !== nextType) flushList();
      listType = nextType;
      listItems.push((unordered || ordered)[1]);
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flushAll();
      output.push(`<blockquote>${renderInline(quote[1])}</blockquote>`);
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushAll();
  return output.join("");
}

function titleFromPrompt(prompt) {
  const clean = prompt.replace(/```[\s\S]*?```/g, "code snippet").replace(/\s+/g, " ").trim();
  if (!clean) return "New conversation";
  return clean.length > 48 ? `${clean.slice(0, 47)}…` : clean;
}

function autoGrow() {
  elements.promptInput.style.height = "auto";
  elements.promptInput.style.height = `${Math.min(elements.promptInput.scrollHeight, 210)}px`;
  updateComposerState();
}

function updateComposerState() {
  const unavailable = !modelReady || modelSwitching;
  elements.composer.classList.toggle("generating", generating);
  elements.composer.classList.toggle("model-unavailable", unavailable);
  elements.promptInput.disabled = unavailable;
  elements.promptInput.placeholder = unavailable
    ? (modelSwitching ? `Loading ${modelInfo.quantization}…` : "The local model is offline…")
    : "Ask Qwen about your code…";
  elements.sendButton.disabled = unavailable || (!generating && !elements.promptInput.value.trim());
  elements.sendButton.setAttribute("aria-label", unavailable ? "Model is loading" : (generating ? "Stop generation" : "Send message"));
}

function scrollToBottom(smooth = true) {
  requestAnimationFrame(() => {
    elements.chatScroll.scrollTo({
      top: elements.chatScroll.scrollHeight,
      behavior: smooth && !window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "auto",
    });
  });
}

function createResponseTelemetry() {
  return {
    startedAt: performance.now(),
    headersAt: null,
    firstTokenAt: null,
    lastTokenAt: null,
    finishedAt: null,
    model: modelInfo.id || MODEL,
    quantization: modelInfo.quantization || MODEL_QUANTIZATION,
    contextWindow: modelInfo.contextWindow,
    parameterCount: modelInfo.parameterCount,
    modelSizeBytes: modelInfo.sizeBytes,
    systemFingerprint: "",
    finishReason: "",
    usage: null,
    timings: null,
    thinking: settings.thinking,
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
    outcome: "completed",
  };
}

function finalizeResponseStats(telemetry) {
  const timings = telemetry.timings || {};
  const usage = telemetry.usage || {};
  const promptTokens = usage.prompt_tokens ?? timings.prompt_n;
  const generatedTokens = usage.completion_tokens ?? timings.predicted_n;
  const totalTokens = usage.total_tokens ?? (
    isFiniteNumber(promptTokens) && isFiniteNumber(generatedTokens)
      ? Number(promptTokens) + Number(generatedTokens)
      : null
  );
  const cachedTokens = usage.prompt_tokens_details?.cached_tokens ?? timings.cache_n;
  const promptMs = timings.prompt_ms;
  const generationMs = timings.predicted_ms;
  const serverMs = [promptMs, generationMs]
    .filter(isFiniteNumber)
    .reduce((sum, value) => sum + Number(value), 0);
  const totalMs = Math.max(0, (telemetry.finishedAt ?? performance.now()) - telemetry.startedAt);

  return {
    version: 1,
    outcome: telemetry.outcome,
    model: telemetry.model || MODEL,
    quantization: telemetry.quantization || MODEL_QUANTIZATION,
    contextWindow: telemetry.contextWindow,
    parameterCount: telemetry.parameterCount,
    modelSizeBytes: telemetry.modelSizeBytes,
    systemFingerprint: telemetry.systemFingerprint,
    finishReason: telemetry.finishReason || telemetry.outcome,
    thinking: telemetry.thinking,
    temperature: telemetry.temperature,
    maxTokens: telemetry.maxTokens,
    totalMs,
    responseHeadersMs: isFiniteNumber(telemetry.headersAt) ? telemetry.headersAt - telemetry.startedAt : null,
    timeToFirstTokenMs: isFiniteNumber(telemetry.firstTokenAt) ? telemetry.firstTokenAt - telemetry.startedAt : null,
    outputStreamMs: isFiniteNumber(telemetry.firstTokenAt) && isFiniteNumber(telemetry.lastTokenAt)
      ? telemetry.lastTokenAt - telemetry.firstTokenAt
      : null,
    promptTokens,
    generatedTokens,
    totalTokens,
    cachedTokens,
    promptMs,
    generationMs,
    promptTokensPerSecond: timings.prompt_per_second,
    generationTokensPerSecond: timings.predicted_per_second,
    serverMs: serverMs || null,
    overheadMs: serverMs ? Math.max(0, totalMs - serverMs) : null,
    completedAt: Date.now(),
  };
}

async function sendMessage() {
  if (generating) {
    stopGeneration();
    return;
  }

  if (!modelReady || modelSwitching) {
    showToast(modelSwitching ? "Wait for the selected model to finish loading" : "The local model is not ready");
    return;
  }

  const prompt = elements.promptInput.value.trim();
  if (!prompt) return;

  const conversation = activeConversation() || createConversation();
  const now = Date.now();
  const userMessage = { id: makeId(), role: "user", content: prompt, createdAt: now };
  const assistantMessage = { id: makeId(), role: "assistant", content: "", reasoning: "", createdAt: now, pending: true };
  conversation.messages.push(userMessage, assistantMessage);
  if (conversation.messages.length === 2) conversation.title = titleFromPrompt(prompt);
  conversation.updatedAt = now;

  elements.promptInput.value = "";
  autoGrow();
  generating = true;
  generationController = new AbortController();
  saveState();
  renderAll();
  scrollToBottom(false);

  const apiMessages = conversation.messages
    .filter((message) => !(message.role === "assistant" && message.id === assistantMessage.id))
    .map(({ role, content }) => ({ role, content }));
  if (settings.systemPrompt.trim()) {
    apiMessages.unshift({ role: "system", content: settings.systemPrompt.trim() });
  }

  const telemetry = createResponseTelemetry();
  try {
    const response = await fetch("/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelInfo.id || MODEL,
        messages: apiMessages,
        stream: true,
        stream_options: { include_usage: true },
        temperature: settings.temperature,
        max_tokens: settings.maxTokens,
        chat_template_kwargs: { enable_thinking: settings.thinking },
      }),
      signal: generationController.signal,
    });
    telemetry.headersAt = performance.now();

    if (!response.ok) {
      let message = `The local model returned HTTP ${response.status}.`;
      try {
        const payload = await response.json();
        message = payload?.error?.message || message;
      } catch {
        // Keep the status-based message.
      }
      throw new Error(message);
    }
    if (!response.body) throw new Error("The local model returned an empty stream.");

    await consumeEventStream(response.body, assistantMessage, telemetry);
    assistantMessage.pending = false;
    if (!assistantMessage.content && !assistantMessage.reasoning) {
      assistantMessage.content = "The model completed without returning text.";
    }
  } catch (error) {
    assistantMessage.pending = false;
    if (error.name === "AbortError") {
      telemetry.outcome = "stopped";
      telemetry.finishReason ||= "stopped";
      if (!assistantMessage.content && !assistantMessage.reasoning) {
        assistantMessage.content = "*Generation stopped.*";
      }
    } else {
      telemetry.outcome = "error";
      telemetry.finishReason ||= "error";
      assistantMessage.error = true;
      assistantMessage.content = error.message || "Could not reach the local model.";
    }
  } finally {
    telemetry.finishedAt = performance.now();
    assistantMessage.stats = finalizeResponseStats(telemetry);
    generating = false;
    generationController = null;
    conversation.updatedAt = Date.now();
    saveState();
    renderHistory();
    updateMessage(assistantMessage);
    updateComposerState();
    scrollToBottom(false);
    elements.promptInput.focus();
    refreshModelStatus();
  }
}

async function consumeEventStream(stream, assistantMessage, telemetry) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const processEvent = (eventText) => {
    const data = eventText
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim();
    if (!data) return false;
    if (data === "[DONE]") return true;

    let payload;
    try {
      payload = JSON.parse(data);
    } catch {
      return false;
    }
    if (payload.error) throw new Error(payload.error.message || "The local model reported an error.");
    if (payload.model) telemetry.model = payload.model;
    if (payload.system_fingerprint) telemetry.systemFingerprint = payload.system_fingerprint;
    if (payload.usage) telemetry.usage = payload.usage;
    if (payload.timings) telemetry.timings = payload.timings;

    const choice = payload.choices?.[0] || {};
    const delta = choice.delta || {};
    if (choice.finish_reason) telemetry.finishReason = choice.finish_reason;
    let emittedToken = false;
    if (typeof delta.content === "string") {
      assistantMessage.content += delta.content;
      emittedToken ||= delta.content.length > 0;
    }
    const reasoning = delta.reasoning_content ?? delta.reasoning ?? delta.thinking;
    if (typeof reasoning === "string") {
      assistantMessage.reasoning += reasoning;
      emittedToken ||= reasoning.length > 0;
    }
    if (emittedToken) {
      const now = performance.now();
      telemetry.firstTokenAt ??= now;
      telemetry.lastTokenAt = now;
    }
    updateMessage(assistantMessage);
    scrollToBottom(false);
    return false;
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    buffer = buffer.replaceAll("\r\n", "\n");
    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const eventText = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      if (processEvent(eventText)) {
        await reader.cancel();
        return;
      }
    }
    if (done) break;
  }
  if (buffer.trim()) processEvent(buffer);
}

function stopGeneration() {
  generationController?.abort();
}

async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMessage);
  } catch {
    showToast("Clipboard permission was denied");
  }
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 1600);
}

function openSidebar() {
  elements.body.classList.add("sidebar-open");
}

function closeSidebar() {
  elements.body.classList.remove("sidebar-open");
}

function applyTheme(theme) {
  const normalized = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = normalized;
  document.querySelector('meta[name="theme-color"]').content = normalized === "dark" ? "#0d1117" : "#ffffff";
  localStorage.setItem(THEME_KEY, normalized);
}

function openSettings() {
  elements.systemPrompt.value = settings.systemPrompt;
  elements.temperatureInput.value = String(settings.temperature);
  elements.maxTokensInput.value = String(settings.maxTokens);
  elements.settingsDialog.showModal();
}

function saveSettings() {
  settings = {
    systemPrompt: elements.systemPrompt.value.trim(),
    temperature: clampNumber(elements.temperatureInput.value, 0, 2, DEFAULT_SETTINGS.temperature),
    maxTokens: clampNumber(elements.maxTokensInput.value, 128, 6144, DEFAULT_SETTINGS.maxTokens),
    thinking: elements.thinkingToggle.checked,
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  showToast("Settings saved");
}

function resetSettingsForm() {
  elements.systemPrompt.value = DEFAULT_SETTINGS.systemPrompt;
  elements.temperatureInput.value = String(DEFAULT_SETTINGS.temperature);
  elements.maxTokensInput.value = String(DEFAULT_SETTINGS.maxTokens);
}

function closeModelMenu() {
  elements.modelMenu.hidden = true;
  elements.modelSelectorButton.setAttribute("aria-expanded", "false");
}

function toggleModelMenu() {
  const willOpen = elements.modelMenu.hidden;
  elements.modelMenu.hidden = !willOpen;
  elements.modelSelectorButton.setAttribute("aria-expanded", String(willOpen));
  if (willOpen) refreshModelStatus();
}

function modelStatusLabel(status) {
  return ({
    ready: "Active",
    loading: "Loading",
    stopping: "Stopping",
    error: "Error",
    stopped: "Stopped",
    unavailable: "Not installed",
  })[status] || "Unknown";
}

function renderModelStatus(payload) {
  modelStatus = payload;
  const transition = payload?.transition || null;
  const switching = transition?.phase === "switching";
  const serving = payload?.models?.find((model) => model.key === payload.servingModel) || null;
  const displayKey = switching
    ? transition.target
    : (payload?.servingModel || payload?.activeModel || payload?.selectedModel || "q4");
  const displayed = payload?.models?.find((model) => model.key === displayKey)
    || { key: displayKey, ...MODEL_CHOICES[displayKey], status: "stopped" };

  modelReady = serving?.status === "ready";
  modelSwitching = switching || ["loading", "stopping"].includes(displayed.status);
  modelInfo = {
    id: displayed.id || MODEL_CHOICES[displayKey]?.id || modelInfo.id,
    quantization: displayed.quantization || MODEL_CHOICES[displayKey]?.quantization || modelInfo.quantization,
    contextWindow: Number(displayed.contextWindow) || modelInfo.contextWindow,
    parameterCount: Number(displayed.parameterCount) || modelInfo.parameterCount,
    sizeBytes: Number(displayed.sizeBytes) || modelInfo.sizeBytes,
  };

  elements.currentModelName.textContent = modelInfo.id;
  elements.modelSelectorButton.title = `Current model: ${modelInfo.quantization}`;
  elements.sidebarModelQuantization.textContent = modelInfo.quantization;
  elements.sidebarModelState.textContent = modelReady ? "ready locally" : (modelSwitching ? "loading locally" : "offline");

  for (const option of elements.modelMenu.querySelectorAll(".model-option")) {
    const model = payload?.models?.find((item) => item.key === option.dataset.model);
    const status = model?.status || "stopped";
    option.classList.remove("ready", "loading", "stopping", "error", "stopped", "unavailable");
    option.classList.add(status);
    option.setAttribute("aria-selected", String(option.dataset.model === displayKey));
    option.disabled = modelSwitching || model?.installed === false;
    const state = option.querySelector("[data-model-state]");
    if (state) state.textContent = modelStatusLabel(status);
  }

  elements.statusPill.classList.remove("ready", "offline", "switching");
  if (switching) {
    const target = payload.models?.find((model) => model.key === transition.target);
    elements.statusPill.classList.add("switching");
    elements.statusText.textContent = `Loading ${target?.quantization || transition.target.toUpperCase()}`;
  } else if (transition?.phase === "error") {
    elements.statusPill.classList.add("offline");
    elements.statusText.textContent = "Switch failed";
  } else if (modelReady) {
    elements.statusPill.classList.add("ready");
    elements.statusText.textContent = `${serving.quantization} ready`;
  } else if (displayed.status === "loading") {
    elements.statusPill.classList.add("switching");
    elements.statusText.textContent = `Loading ${displayed.quantization}`;
  } else {
    elements.statusPill.classList.add("offline");
    elements.statusText.textContent = "Model offline";
  }
  updateComposerState();
}

async function refreshModelStatus() {
  if (modelStatusRequest) return modelStatusRequest;
  modelStatusRequest = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    try {
      const response = await fetch("/api/models", { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      renderModelStatus(await response.json());
    } catch {
      modelReady = false;
      modelSwitching = false;
      elements.statusPill.classList.remove("ready", "switching");
      elements.statusPill.classList.add("offline");
      elements.statusText.textContent = "App offline";
      updateComposerState();
    } finally {
      clearTimeout(timeout);
    }
  })().finally(() => {
    modelStatusRequest = null;
  });
  return modelStatusRequest;
}

async function switchToModel(key) {
  if (!MODEL_CHOICES[key] || modelSwitching) return;
  if (modelStatus?.servingModel === key && modelReady) {
    closeModelMenu();
    return;
  }

  closeModelMenu();
  if (generating) stopGeneration();
  const choice = MODEL_CHOICES[key];
  modelSwitching = true;
  modelReady = false;
  modelInfo = { ...modelInfo, ...choice };
  elements.currentModelName.textContent = choice.id;
  elements.sidebarModelQuantization.textContent = choice.quantization;
  elements.sidebarModelState.textContent = "loading locally";
  elements.statusPill.classList.remove("ready", "offline");
  elements.statusPill.classList.add("switching");
  elements.statusText.textContent = `Loading ${choice.quantization}`;
  updateComposerState();
  showToast(`Switching to ${choice.quantization}…`);

  try {
    const response = await fetch("/api/models", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Local-Qwen-Action": "switch-model",
      },
      body: JSON.stringify({ model: key }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || `Switch failed with HTTP ${response.status}`);
    renderModelStatus(payload);
  } catch (error) {
    modelSwitching = false;
    showToast(error.message || "Could not switch models");
    await refreshModelStatus();
  }
}

elements.composer.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage();
});

elements.promptInput.addEventListener("input", autoGrow);
elements.promptInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    elements.composer.requestSubmit();
  }
});

elements.newChatButton.addEventListener("click", newChat);
elements.menuButton.addEventListener("click", openSidebar);
elements.sidebarClose.addEventListener("click", closeSidebar);
elements.sidebarScrim.addEventListener("click", closeSidebar);
elements.modelSelectorButton.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleModelMenu();
});
elements.modelMenu.addEventListener("click", (event) => {
  const option = event.target.closest("[data-model]");
  if (option) switchToModel(option.dataset.model);
});
document.addEventListener("click", (event) => {
  if (!elements.modelSelector.contains(event.target)) closeModelMenu();
});

elements.clearHistoryButton.addEventListener("click", () => {
  if (!conversations.length || !window.confirm("Delete all locally saved conversations?")) return;
  stopGeneration();
  conversations = [];
  activeId = null;
  saveState();
  renderAll();
});

document.querySelector("#suggestionGrid").addEventListener("click", (event) => {
  const button = event.target.closest("[data-prompt]");
  if (!button) return;
  elements.promptInput.value = button.dataset.prompt;
  autoGrow();
  elements.promptInput.focus();
  elements.promptInput.setSelectionRange(elements.promptInput.value.length, elements.promptInput.value.length);
});

elements.messageList.addEventListener("click", (event) => {
  const button = event.target.closest(".copy-code");
  if (!button) return;
  const code = button.closest(".code-block")?.querySelector("code")?.textContent || "";
  copyText(code, "Code copied");
});

elements.themeButton.addEventListener("click", () => {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});

elements.settingsButton.addEventListener("click", openSettings);
elements.resetSettingsButton.addEventListener("click", resetSettingsForm);
elements.settingsForm.addEventListener("submit", (event) => {
  if (event.submitter !== elements.saveSettingsButton) return;
  event.preventDefault();
  saveSettings();
  elements.settingsDialog.close();
});

elements.settingsDialog.addEventListener("click", (event) => {
  if (event.target !== elements.settingsDialog) return;
  const rect = elements.settingsDialog.getBoundingClientRect();
  const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
  if (!inside) elements.settingsDialog.close();
});

elements.thinkingToggle.addEventListener("change", () => {
  settings.thinking = elements.thinkingToggle.checked;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
});

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    newChat();
  }
  if (event.key === "Escape") {
    closeSidebar();
    closeModelMenu();
  }
});

const savedTheme = localStorage.getItem(THEME_KEY);
applyTheme(savedTheme || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
elements.thinkingToggle.checked = settings.thinking;
renderAll();
autoGrow();
refreshModelStatus();
setInterval(refreshModelStatus, 2500);
