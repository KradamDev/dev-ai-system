/* ═══════════════════════════════════════════════════════════
   DEV'S AI SYSTEM — SCRIPT
   §1   API Keys  (BYOK — loaded from localStorage)
   §1b  BYOK Key Store
   §2   Provider Definitions
   §3   Category Model Arrays  (flat ordered priority lists)
   §4   Provider Availability
   §5   OpenRouter Key Rotation
   §6   Intent Classifier  (Groq GPT-OSS 20B · Gemini 3.5 Flash-Lite)
   §6b  Web-Search Consensus  (3 randomized models)
   §7   Model Selection
   §8   API Call Layer
   §9   Response Orchestrator
   §10  Card Helpers
   §11  Card State & DOM
   §12  Sidebar
   §13  Extra Cards  (sidebar-click prepend)
   §14  Submit
   §15  Card Actions & Key Handler
   §16  Matrix Rain
   §16b Mobile Nav Drawer
   §17  Document Export  (PDF + DOCX, browser-only)
   
   ── NOV 2026 DEPRECATION PASS ────────────────────────────
   · HUGGINGFACE removed — the legacy serverless Inference API
     (api-inference.huggingface.co) is retired; chat models are now
     served only through the router.huggingface.co Inference Providers.
   · GITHUB removed — GitHub Models was fully retired on 2026-07-30
     (playground, catalog, inference API and BYOK all withdrawn).
   · GROQ — llama-3.1-8b-instant / llama-3.3-70b-versatile shut down
     2026-08-16 → openai/gpt-oss-20b / qwen/qwen3.6-27b.
   · GEMINI — 2.5 family retired → gemini-3.8-flash, gemini-3.6-flash,
     gemini-3.5-flash-lite.
   
   ── RUNTIME AUDIT (14 Nov 2026) ─────────────────────────
   · SAMBANOVA removed — api.sambanova.ai sends no CORS headers by
     design ("we do not allow cors"), so every call from a browser
     fails as "Failed to fetch" whatever the model id. Not a model
     problem: only re-add it behind a server-side proxy.
   · CEREBRAS removed — down to two Shared Inference models, both of
     which were failing here. Dropped entirely.
   · GROQ trimmed to the three ids a normal account can still call —
     openai/gpt-oss-120b, qwen/qwen3.8-27b, openai/gpt-oss-20b.
     Retired: llama-4-maverick, llama-4-scout, kimi-k2-instruct,
     qwen3.6-27b, compound-beta, compound-beta-mini.
   · OPENROUTER rebuilt from the live :free tier — 21 of 24 ids were
     dead (404 "unavailable for free"). Kept nemotron-3-ultra,
     north-mini-code and openrouter/free; added nemotron-3.5-super-vl,
     nemotron-3.5-lightning, nemotron-3-nano-omni-reasoning and
     dots-3-note-preview. The free tier rotates weekly — re-check it.
   · NEW §6b — the web-search yes/no question is now settled by a
     consensus of three models drawn at random from the live speed and
     mid tiers, rather than riding along with the intent vote.
   · BYOK — no key material lives in this file any more. Keys are typed
     into the KEYS panel and kept in this browser's localStorage under
     "devai.byok.v1", then read back on boot by loadKeys().
   · Search status is now a single line: whether a search ran, through
     which API (Tavily/Exa), and which model's vote called for it.
═══════════════════════════════════════════════════════════ */


// ─────────────────────────────────────────
//  §0. BUILD STAMP
//  Logged at startup, so you can tell at a
//  glance which script.js this browser got.
// ─────────────────────────────────────────
const APP_VERSION = "2026-11-14";


// ─────────────────────────────────────────
//  §1. API KEYS
// ─────────────────────────────────────────
const KEYS = {
  groq:       "",
  gemini:     "",
  mistral:    "",
  openrouter: [],
};

// ─────────────────────────────────────────
//  §1b. BYOK KEY STORE
//  Keys live in this browser's localStorage,
//  never in this file. They are written by
//  the KEYS panel and read back on boot.
// ─────────────────────────────────────────
const STORE_KEY = "devai.byok.v1";

const KEY_FIELDS = [
  { id: "groq",       label: "Groq",       url: "https://console.groq.com/keys",
    hint: "console.groq.com — generous free tier",           placeholder: "gsk_…" },
  { id: "gemini",     label: "Gemini",     url: "https://aistudio.google.com/apikey",
    hint: "aistudio.google.com — free tier",                 placeholder: "AIza…" },
  { id: "mistral",    label: "Mistral",    url: "https://console.mistral.ai/api-keys",
    hint: "console.mistral.ai — free Experiment tier",       placeholder: "…" },
  { id: "openrouter", label: "OpenRouter", url: "https://openrouter.ai/keys",
    hint: "openrouter.ai — up to 3 keys, comma-separated",   placeholder: "sk-or-v1-…", multi: true },
  { id: "tavily",     label: "Tavily",     url: "https://app.tavily.com/home",
    hint: "app.tavily.com — web search, 1 000 free/mo",      placeholder: "tvly-…", search: true },
  { id: "exa",        label: "Exa",        url: "https://dashboard.exa.ai/api-keys",
    hint: "dashboard.exa.ai — search fallback",              placeholder: "…", search: true },
];

function readKeyStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) { return {}; }
}

function writeKeyStore(store) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); return true; }
  catch (_) { return false; }
}

/** Accept "a, b c" or an array and return a clean list of keys. */
function splitKeys(v) {
  const list = Array.isArray(v) ? v : String(v || "").split(/[\s,]+/);
  return list.map(s => String(s).trim()).filter(Boolean);
}

/** Copy the saved store into KEYS / SEARCH_KEYS. */
/** Copy an in-memory store object into KEYS / SEARCH_KEYS. */
function applyKeyStore(store) {
  for (const f of KEY_FIELDS) {
    const v = store[f.id];
    if (f.search)      SEARCH_KEYS[f.id] = (typeof v === "string") ? v : "";
    else if (f.multi)  KEYS[f.id]        = splitKeys(v);
    else               KEYS[f.id]        = (typeof v === "string") ? v : "";
  }
}

/** Copy the saved store into KEYS / SEARCH_KEYS. */
function loadKeys() {
  applyKeyStore(readKeyStore());
}

/** True when this browser refuses to persist (private mode, blocked storage). */
function storageAvailable() {
  try {
    localStorage.setItem("devai.probe", "1");
    localStorage.removeItem("devai.probe");
    return true;
  } catch (_) { return false; }
}

/** Build the input rows once, then keep their values in sync. */
function _buildKeyFields() {
  const host = document.getElementById("keys-fields");
  if (!host || host.dataset.built === "1") return;
  host.innerHTML = KEY_FIELDS.map(f => `
    <div style="margin-bottom:11px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
        <span style="font-size:11px;letter-spacing:0.6px;color:#c8e6c8;">${f.label.toUpperCase()}</span>
        <span id="key-dot-${f.id}" style="font-size:10px;color:#6b7f6b;">○ EMPTY</span>
      </div>
      <input id="key-input-${f.id}" type="password" autocomplete="off" spellcheck="false"
             placeholder="${f.placeholder}"
             style="width:100%;box-sizing:border-box;background:#04140a;border:1px solid #1f3a1f;
                    border-radius:6px;padding:8px 10px;color:#c8e6c8;font-size:12px;
                    font-family:'Courier New',monospace;outline:none;">
      <div style="font-size:10px;color:#5f7a5f;margin-top:3px;">
        ${f.hint} ·
        <a href="${f.url}" target="_blank" rel="noopener noreferrer"
           style="color:#00ff41;text-decoration:none;">get a key ↗</a>
      </div>
    </div>`).join("");
  host.dataset.built = "1";
}

/** Repaint the panel from whatever KEYS currently holds. */
function renderKeysModal() {
  _buildKeyFields();
  for (const f of KEY_FIELDS) {
    const input = document.getElementById(`key-input-${f.id}`);
    if (!input) continue;
    const val = f.search ? SEARCH_KEYS[f.id] : KEYS[f.id];
    input.value = Array.isArray(val) ? val.join(", ") : (val || "");
    const dot  = document.getElementById(`key-dot-${f.id}`);
    const isSet = Array.isArray(val) ? val.length > 0 : !!val;
    if (dot) {
      dot.textContent = isSet ? "● SET" : "○ EMPTY";
      dot.style.color = isSet ? "#00ff41" : "#6b7f6b";
    }
  }
  const summary = document.getElementById("keys-summary");
  if (summary) {
    const ready = PROVIDER_CHAIN.filter(p => isProviderConfigured(p)).map(p => p.name);
    summary.textContent = ready.length
      ? `${ready.length} provider${ready.length === 1 ? "" : "s"} ready · ${ready.join(" · ")}`
      : "No provider keys yet — paste at least one to run a prompt.";
  }
}

function openKeysModal() {
  closeNav();
  renderKeysModal();
  const m = document.getElementById("keys-modal");
  if (m) m.style.display = "flex";
  const fb = document.getElementById("keys-feedback");
  if (fb) fb.textContent = "";
}

function closeKeysModal() {
  const m = document.getElementById("keys-modal");
  if (m) m.style.display = "none";
}

function toggleKeyVisibility() {
  const btn = document.getElementById("keys-toggle-btn");
  const show = btn && btn.dataset.shown !== "1";
  for (const f of KEY_FIELDS) {
    const input = document.getElementById(`key-input-${f.id}`);
    if (input) input.type = show ? "text" : "password";
  }
  if (btn) {
    btn.dataset.shown = show ? "1" : "0";
    btn.textContent   = show ? "🙈 HIDE" : "👁 SHOW";
  }
}

/** Persist the panel's contents and apply them immediately. */
function saveKeys() {
  const store = {};
  for (const f of KEY_FIELDS) {
    const el = document.getElementById(`key-input-${f.id}`);
    if (!el) continue;
    store[f.id] = f.multi ? splitKeys(el.value) : el.value.trim();
  }
  const ok = writeKeyStore(store);
  if (ok) loadKeys();          // reload from storage when it persisted
  else    applyKeyStore(store); // otherwise keep them live for this tab only

  renderKeysModal();
  renderSidebarModels();
  updateSidebarHighlights();
  updateProviderBadge();

  const fb = document.getElementById("keys-feedback");
  if (fb) {
    fb.style.color = ok ? "#00ff41" : "#ffb347";
    fb.textContent = ok
      ? "✓ Saved to this browser. Keys never touch script.js."
      : "⚠ Storage is blocked here — the keys work for this tab only and vanish on reload.";
  }
}

function clearKeys() {
  try { localStorage.removeItem(STORE_KEY); } catch (_) {}
  for (const f of KEY_FIELDS) {
    const el = document.getElementById(`key-input-${f.id}`);
    if (el) el.value = "";
  }
  loadKeys();
  renderKeysModal();
  renderSidebarModels();
  updateSidebarHighlights();
  updateProviderBadge();

  const fb = document.getElementById("keys-feedback");
  if (fb) { fb.style.color = "#ff8080"; fb.textContent = "✗ All saved keys removed from this browser."; }
}
/* ═══════════════════════════════════════════════════════════
   DEV'S AI SYSTEM — HYBRID SEARCH MODULE
   §A  Search Configuration & Keys
   §B  Core Search Function  (Tavily-first → Exa fallback)
   §C  Result Formatter
   §D  Prompt Augmentation Helper

   HOW TO INTEGRATE:
   1. Paste §A–§D anywhere after §1 (KEYS) in script.js
      — recommended: right after the KEYS block, before §2.
   2. In submitPrompt(), after classifyIntent() resolves,
      call augmentWithSearch() and await it — see §D usage note.
═══════════════════════════════════════════════════════════ */


// ─────────────────────────────────────────
//  §A. SEARCH CONFIGURATION & KEYS
// ─────────────────────────────────────────

const SEARCH_KEYS = {
  tavily: "",
  exa:    "",
};

const SEARCH_CONFIG = {
  // Set to false to disable search entirely without removing the code
  enabled: true,

  // Auto-trigger for these intent categories; always off for "general"
  autoTrigger: ["research", "reasoning", "coding", "general", "summarization", "creative"],

  // Tavily
  tavilyEndpoint: "https://api.tavily.com/search",
  tavilyParams: {
    search_depth: "basic",   // costs 2 credits; use "basic" to save quota
    include_answer: true,       // returns an AI-synthesised answer at the top
    include_raw_content: false,
    max_results: 5,
  },

  // Exa — Neural search endpoint (returns semantically ranked results, ideal for RAG)
  // Uses the /search endpoint with contents summaries for rich snippet extraction
  exaEndpoint: "https://api.exa.ai/search",
  exaParams: {
    numResults:          5,
    type:                "neural",   // "neural" = semantic; "keyword" = traditional
    useAutoprompt:       true,       // Exa rewrites the query for better recall
    contents: {
      summary: { query: "" },        // query is overwritten per-call in _exaSearch()
    },
  },

  // Timeouts
  tavilyTimeoutMs: 12000,
  exaTimeoutMs:    10000,
};


// ─────────────────────────────────────────
//  §B. CORE SEARCH FUNCTION
//      Returns a normalised result object.
//      Never throws — always resolves.
// ─────────────────────────────────────────

/**
 * @typedef {Object} SearchResult
 * @property {'tavily'|'exa'|'none'} source   - Which provider returned data
 * @property {string|null}             answer    - AI-synthesised answer (Tavily only)
 * @property {Array<{title,url,snippet}>} results - Top web results
 * @property {string|null}             error     - Human-readable error, if any
 */

/**
 * Performs a hybrid web search.
 * Tries Tavily first (deep, AI-ready). On 429 / timeout / key missing,
 * falls back to Exa Search automatically.
 *
 * @param {string} query
 * @returns {Promise<SearchResult>}
 */
async function performWebSearch(query) {
  const empty = { source: "none", answer: null, results: [], error: null };
  if (!SEARCH_CONFIG.enabled) return empty;

  const tavilyKey = SEARCH_KEYS.tavily;
  const exaKey    = SEARCH_KEYS.exa;
  const hasT = tavilyKey && !tavilyKey.startsWith("YOUR_");
  const hasE = exaKey    && !exaKey.startsWith("YOUR_");

  if (!hasT && !hasE) {
    return { ...empty, error: "No search API keys configured." };
  }

  // ── Try Tavily ────────────────────────────────────────────────
  if (hasT) {
    const tavilyResult = await _tavilySearch(query, tavilyKey);
    if (tavilyResult.ok) return tavilyResult.data;

    // Only fall through on rate-limit or network errors — not on bad keys
    const shouldFallback =
      tavilyResult.status === 429   ||   // rate limited
      tavilyResult.status === 0     ||   // network / timeout
      tavilyResult.status === 503;       // service unavailable

    if (!shouldFallback) {
      // Hard failure (401, 400 etc.) — surface the error, don't try Exa
      return {
        ...empty,
        error: `Tavily error ${tavilyResult.status}: ${tavilyResult.message}`,
      };
    }

    console.warn(`[Search] Tavily returned ${tavilyResult.status} — falling back to Exa.`);
  }

  // ── Try Exa ───────────────────────────────────────────────────
  if (hasE) {
    const exaResult = await _exaSearch(query, exaKey);
    if (exaResult.ok) return exaResult.data;

    return {
      ...empty,
      error: `Exa error ${exaResult.status}: ${exaResult.message}`,
    };
  }

  return { ...empty, error: "All search providers exhausted." };
}


// ── Internal: Tavily ──────────────────────────────────────────
async function _tavilySearch(query, apiKey) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), SEARCH_CONFIG.tavilyTimeoutMs);

  try {
    const res = await fetch(SEARCH_CONFIG.tavilyEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        ...SEARCH_CONFIG.tavilyParams,
      }),
      signal: ctrl.signal,
    });

    clearTimeout(tid);

    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { const j = await res.json(); msg = j?.detail || j?.message || msg; } catch (_) {}
      return { ok: false, status: res.status, message: msg };
    }

    const json = await res.json();

    // Normalise
    const results = (json.results || []).map(r => ({
      title:   r.title   || "",
      url:     r.url     || "",
      snippet: r.content || r.snippet || "",
    }));

    return {
      ok: true,
      data: {
        source:  "tavily",
        answer:  json.answer || null,
        results,
        error:   null,
      },
    };

  } catch (err) {
    clearTimeout(tid);
    const isAbort = err.name === "AbortError";
    return {
      ok:      false,
      status:  0,
      message: isAbort ? "Tavily request timed out." : err.message,
    };
  }
}


// ── Internal: Exa ────────────────────────────────────────────
async function _exaSearch(query, apiKey) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), SEARCH_CONFIG.exaTimeoutMs);

  // Clone params and inject the per-call summary query
  const body = {
    query,
    ...SEARCH_CONFIG.exaParams,
    contents: {
      summary: { query },           // Exa generates summaries scoped to the query
    },
  };

  try {
    const res = await fetch(SEARCH_CONFIG.exaEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key":    apiKey,     // Exa uses x-api-key, not Bearer
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });

    clearTimeout(tid);

    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { const j = await res.json(); msg = j?.message || j?.error || msg; } catch (_) {}
      return { ok: false, status: res.status, message: msg };
    }

    const json = await res.json();

    // Normalise — Exa returns { results: [ { title, url, summary, ... } ] }
    const results = (json.results || []).slice(0, 5).map(r => ({
      title:   r.title   || "",
      url:     r.url     || "",
      snippet: r.summary || r.text || r.highlights?.[0] || "",
    }));

    return {
      ok: true,
      data: {
        source:  "exa",
        answer:  null,               // Exa doesn't synthesise a top-level answer
        results,
        error:   null,
      },
    };

  } catch (err) {
    clearTimeout(tid);
    const isAbort = err.name === "AbortError";
    return {
      ok:      false,
      status:  0,
      message: isAbort ? "Exa request timed out." : err.message,
    };
  }
}


// ─────────────────────────────────────────
//  §C. RESULT FORMATTER
//      Converts a SearchResult into a
//      compact plain-text context block.
// ─────────────────────────────────────────

/**
 * Formats search results into a concise context block
 * suitable for prepending to an LLM prompt.
 *
 * @param {SearchResult} searchResult
 * @param {string}       originalQuery
 * @returns {string}  Formatted context block, or "" if no results.
 */
function formatSearchContext(searchResult, originalQuery) {
  if (!searchResult || searchResult.source === "none") return "";
  if (!searchResult.results?.length && !searchResult.answer) return "";

  const lines = [];
  const providerLabel = searchResult.source === "tavily" ? "Tavily (advanced)" : "Exa (neural)";

  lines.push(`[WEB SEARCH CONTEXT — ${providerLabel}]`);
  lines.push(`Query: "${originalQuery}"`);
  lines.push("");

  // AI-synthesised answer (Tavily only)
  if (searchResult.answer) {
    lines.push("Summary:");
    lines.push(searchResult.answer.trim());
    lines.push("");
  }

  // Top results
  if (searchResult.results.length) {
    lines.push("Sources:");
    searchResult.results.forEach((r, i) => {
      lines.push(`${i + 1}. ${r.title}`);
      if (r.url)     lines.push(`   URL: ${r.url}`);
      if (r.snippet) lines.push(`   ${r.snippet.slice(0, 280).trim()}…`);
    });
  }

  lines.push("");
  lines.push("[END WEB CONTEXT — answer using the above as supporting information]");
  lines.push("");

  return lines.join("\n");
}

// Used ONLY for intent classification — never for main responses
const CLASSIFIER_MODEL = "openai/gpt-oss-20b";   // Groq — smallest, fastest active tier


// ─────────────────────────────────────────
//  §2. PROVIDER DEFINITIONS
// ─────────────────────────────────────────
function m(label, tier) { return { label, tier }; }

const GROQ = {
  name: "Groq",
  endpoint: "https://api.groq.com/openai/v1/chat/completions",
  type: "openai",
  models: {
    "openai/gpt-oss-120b":  m("GPT-OSS 120B",  "heavy"),
    "qwen/qwen3.8-27b":     m("Qwen 3.8 27B",  "mid"),
    "openai/gpt-oss-20b":   m("GPT-OSS 20B",   "speed"),
  },
};



const GEMINI = {
  name: "Gemini",
  endpoint: "https://generativelanguage.googleapis.com/v1beta/models",
  type: "gemini",
  models: {
    "gemini-3.8-flash":       m("Gemini 3.8 Flash",       "heavy"),
    "gemini-3.6-flash":       m("Gemini 3.6 Flash",       "mid"),
    "gemini-3.5-flash-lite":  m("Gemini 3.5 Flash-Lite",  "speed"),
    "gemma-4-31b-it":         m("Gemma 4 31B (Dense)",    "heavy"),
    "gemma-4-26b-a4b-it":     m("Gemma 4 26B (MoE)",      "mid"),
  },
};

const OPENROUTER = {
  name: "OpenRouter",
  endpoint: "https://openrouter.ai/api/v1/chat/completions",
  type: "openai",
  models: {
    // The :free catalog rotates every few weeks — verify before trusting.
    "nvidia/nemotron-3-ultra-550b-a55b:free":              m("Nemotron 3 Ultra 550B",    "heavy"),
    "nvidia/nemotron-3.5-super-vl:free":                   m("Nemotron 3.5 Super VL",    "heavy"),
    "cohere/north-mini-code:free":                         m("Cohere North Mini Code",   "mid"),
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free":  m("Nemotron 3 Nano Omni",     "mid"),
    "dots-studio/dots-3-note-preview:free":                m("Dots3 Note Preview",       "mid"),   // expires 2026-12-31
    "openrouter/free":                                     m("OpenRouter Auto (Free)",   "mid"),
    "nvidia/nemotron-3.5-lightning:free":                  m("Nemotron 3.5 Lightning",   "speed"),
  },
};

const MISTRAL = {
  name: "Mistral",
  endpoint: "https://api.mistral.ai/v1/chat/completions",
  type: "openai",
  models: {
    "mistral-large-latest":    m("Mistral Large 3",         "heavy"),
    "magistral-medium-latest": m("Magistral Medium",        "heavy"),
    "mistral-medium-latest":   m("Mistral Medium 3.1",      "heavy"),
    "codestral-latest":        m("Codestral",               "heavy"),
    "mistral-small-latest":    m("Mistral Small 4",         "mid"),
    "magistral-small-latest":  m("Magistral Small",         "mid"),
    "ministral-8b-latest":     m("Ministral 8B",            "speed"),
    "ministral-3b-latest":     m("Ministral 3B",            "speed"),
    "open-mistral-nemo":       m("Mistral Nemo",            "speed"),
  },
};

const PROVIDER_CHAIN = [GROQ, GEMINI, OPENROUTER, MISTRAL];


// ═══════════════════════════════════════════════════════════════════
//  §3. CATEGORY MODEL ARRAYS
//  One flat ordered priority list per intent category.
//  { provider, modelId }  — ordered best-fit → worst-fit.
//  The orchestrator picks 4 from the top (provider-diverse),
//  then falls back down this list on model failure.
// ═══════════════════════════════════════════════════════════════════

const CATEGORY_MODELS = {

  // ── CODING / DEV ─────────────────────────────────────────────
  coding: [
    { provider: GROQ,        modelId: "openai/gpt-oss-120b" },
    { provider: OPENROUTER,  modelId: "cohere/north-mini-code:free" },
    { provider: MISTRAL,     modelId: "codestral-latest" },
    { provider: OPENROUTER,  modelId: "nvidia/nemotron-3.5-super-vl:free" },
    { provider: GROQ,        modelId: "qwen/qwen3.8-27b" },
    { provider: OPENROUTER,  modelId: "nvidia/nemotron-3-ultra-550b-a55b:free" },
    { provider: GEMINI,      modelId: "gemini-3.8-flash" },
    { provider: MISTRAL,     modelId: "mistral-large-latest" },
    { provider: OPENROUTER,  modelId: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free" },
    { provider: GEMINI,      modelId: "gemini-3.6-flash" },
    { provider: GROQ,        modelId: "openai/gpt-oss-20b" },
    { provider: OPENROUTER,  modelId: "openrouter/free" },
    { provider: MISTRAL,     modelId: "mistral-small-latest" },
    { provider: GEMINI,      modelId: "gemini-3.5-flash-lite" },
    { provider: MISTRAL,     modelId: "ministral-8b-latest" },
    { provider: OPENROUTER,  modelId: "nvidia/nemotron-3.5-lightning:free" },
    { provider: MISTRAL,     modelId: "ministral-3b-latest" },
  ],

  // ── REASONING / MATH ─────────────────────────────────────────
  reasoning: [
    { provider: GROQ,        modelId: "qwen/qwen3.8-27b" },
    { provider: OPENROUTER,  modelId: "nvidia/nemotron-3-ultra-550b-a55b:free" },
    { provider: MISTRAL,     modelId: "magistral-small-latest" },
    { provider: GEMINI,      modelId: "gemini-3.6-flash" },
    { provider: GROQ,        modelId: "openai/gpt-oss-120b" },
    { provider: OPENROUTER,  modelId: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free" },
    { provider: GROQ,        modelId: "openai/gpt-oss-20b" },
    { provider: OPENROUTER,  modelId: "openrouter/free" },
    { provider: GEMINI,      modelId: "gemini-3.5-flash-lite" },
    { provider: OPENROUTER,  modelId: "nvidia/nemotron-3.5-lightning:free" },
  ],

  // ── CREATIVE WRITING ─────────────────────────────────────────
  creative: [
    { provider: GROQ,        modelId: "openai/gpt-oss-120b" },
    { provider: MISTRAL,     modelId: "mistral-large-latest" },
    { provider: OPENROUTER,  modelId: "nvidia/nemotron-3.5-super-vl:free" },
    { provider: OPENROUTER,  modelId: "nvidia/nemotron-3.5-lightning:free" },
    { provider: GEMINI,      modelId: "gemma-4-26b-a4b-it" },
    { provider: OPENROUTER,  modelId: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free" },
    { provider: MISTRAL,     modelId: "mistral-medium-latest" },
    { provider: GROQ,        modelId: "qwen/qwen3.8-27b" },
    { provider: OPENROUTER,  modelId: "nvidia/nemotron-3-ultra-550b-a55b:free" },
    { provider: GEMINI,      modelId: "gemini-3.8-flash" },
    { provider: OPENROUTER,  modelId: "openrouter/free" },
    { provider: GROQ,        modelId: "openai/gpt-oss-20b" },
    { provider: MISTRAL,     modelId: "mistral-small-latest" },
    { provider: GEMINI,      modelId: "gemini-3.5-flash-lite" },
    { provider: MISTRAL,     modelId: "open-mistral-nemo" },
  ],

  // ── RESEARCH / ANALYSIS ──────────────────────────────────────
  research: [
    { provider: GROQ,        modelId: "openai/gpt-oss-120b" },
    { provider: OPENROUTER,  modelId: "nvidia/nemotron-3.5-super-vl:free" },
    { provider: GEMINI,      modelId: "gemma-4-26b-a4b-it" },
    { provider: GROQ,        modelId: "qwen/qwen3.8-27b" },
    { provider: OPENROUTER,  modelId: "nvidia/nemotron-3-ultra-550b-a55b:free" },
    { provider: GEMINI,      modelId: "gemini-3.6-flash" },
    { provider: MISTRAL,     modelId: "mistral-large-latest" },
    { provider: OPENROUTER,  modelId: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free" },
    { provider: GROQ,        modelId: "openai/gpt-oss-20b" },
    { provider: OPENROUTER,  modelId: "openrouter/free" },
    { provider: MISTRAL,     modelId: "mistral-medium-latest" },
    { provider: GEMINI,      modelId: "gemini-3.5-flash-lite" },
    { provider: OPENROUTER,  modelId: "nvidia/nemotron-3.5-lightning:free" },
    { provider: MISTRAL,     modelId: "ministral-8b-latest" },
  ],

  // ── SUMMARIZATION ────────────────────────────────────────────
  summarization: [
    { provider: GROQ,        modelId: "qwen/qwen3.8-27b" },
    { provider: OPENROUTER,  modelId: "nvidia/nemotron-3-ultra-550b-a55b:free" },
    { provider: OPENROUTER,  modelId: "nvidia/nemotron-3.5-lightning:free" },
    { provider: MISTRAL,     modelId: "ministral-3b-latest" },
  ],

  // ── GENERAL / Q&A ────────────────────────────────────────────
  general: [
    { provider: GROQ,        modelId: "qwen/qwen3.8-27b" },
    { provider: GROQ,        modelId: "openai/gpt-oss-120b" },
    { provider: OPENROUTER,  modelId: "nvidia/nemotron-3-ultra-550b-a55b:free" },
    { provider: GEMINI,      modelId: "gemini-3.6-flash" },
    { provider: GROQ,        modelId: "openai/gpt-oss-20b" },
    { provider: OPENROUTER,  modelId: "openrouter/free" },

    { provider: OPENROUTER,  modelId: "nvidia/nemotron-3.5-lightning:free" },
    { provider: OPENROUTER,  modelId: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free" },
    { provider: MISTRAL,     modelId: "ministral-3b-latest" },
  ],
};

// ── Global runtime state ─────────────────
let currentCategory   = "general";
let currentLastPrompt = "";


// ─────────────────────────────────────────
//  §4. PROVIDER AVAILABILITY
// ─────────────────────────────────────────
function isProviderConfigured(provider) {
  if (provider === OPENROUTER) {
    const keys = Array.isArray(KEYS.openrouter) ? KEYS.openrouter : [KEYS.openrouter];
    return keys.some(k => k && !k.startsWith("YOUR_"));
  }
  const key = KEYS[provider.name.toLowerCase()];
  return !!(key && !key.startsWith("YOUR_"));
}


// ─────────────────────────────────────────
//  §5. OPENROUTER KEY ROTATION
// ─────────────────────────────────────────
const orKeyIndices = [0, 0, 0, 0];

function getOpenRouterKey(slotIdx) {
  const keys = (Array.isArray(KEYS.openrouter) ? KEYS.openrouter : [KEYS.openrouter])
    .filter(k => k && !k.startsWith("YOUR_"));
  if (!keys.length) return null;
  return keys[orKeyIndices[slotIdx % 4] % keys.length];
}
function rotateOpenRouterKey(slotIdx) { orKeyIndices[slotIdx % 4]++; }

function getProviderKey(provider, slotIdx) {
  if (provider === OPENROUTER) return getOpenRouterKey(slotIdx);
  return KEYS[provider.name.toLowerCase()];
}


// ─────────────────────────────────────────
//  §6. INTENT CLASSIFIER  (Groq · GPT-OSS 20B)
// ─────────────────────────────────────────
//const VALID_CATEGORIES = ["coding","reasoning","creative","research","summarization","general"];

// ─────────────────────────────────────────
//  §6. INTENT CLASSIFIER  (Groq · Llama 3.1 8B Instant)
//  Returns { category, needsSearch }
//  Single call — Llama decides both in one shot.
// ─────────────────────────────────────────
const VALID_CATEGORIES = ["coding","reasoning","creative","research","summarization","general"];

// ─────────────────────────────────────────
//  §6. INTENT CLASSIFIER  — majority vote
//  Judges: Groq gpt-oss-20b · Gemini 3.5 Flash-Lite
//  Each returns { category, needsSearch }.
//  Both fields are decided independently by simple majority.
//  If only 1 judge responds, its answer is used directly.
//  If 0 judges respond, falls back to { general, false }.
// ─────────────────────────────────────────

const CLASSIFIER_SYSTEM_PROMPT =
  "You are an intent and search classifier. " +
  "Given a user prompt, output EXACTLY two tokens separated by a pipe character and nothing else.\n\n" +
  "Token 1 — intent category (pick one):\n" +
  "  coding        = programming, code, debug, algorithms, implementation\n" +
  "  reasoning     = math, logic, proofs, step-by-step, calculations\n" +
  "  creative      = stories, poems, fiction, brainstorming, creative writing\n" +
  "  research      = analysis, comparison, pros/cons, investigation, in-depth explanation\n" +
  "  summarization = summarize, condense, TLDR, key points, brief overview\n" +
  "  general       = everything else\n\n" +
  "Token 2 — needs web search? (yes or no):\n" +
  "  yes = the answer requires current/live data, recent events, real-time facts,\n" +
  "        specific URLs, prices, news, sports scores, weather, or anything that\n" +
  "        changes over time or may be outside training knowledge.\n" +
  "  no  = the answer can be given from training knowledge alone (coding help,\n" +
  "        creative writing, math, general knowledge, explanations, opinions).\n\n" +
  "Output format: <category>|<yes_or_no>\n" +
  "Examples: coding|no   research|yes   general|no   reasoning|no\n" +
  "Output only these two tokens. No spaces around the pipe. No explanation.";

/** Parse a raw model output string into { category, needsSearch } or null on failure. */
function _parseClassifierOutput(raw) {
  const clean = (raw || "").trim().toLowerCase();
  const [catRaw, searchRaw] = clean.split("|").map(s => s.replace(/[^a-z]/g, ""));
  const category = VALID_CATEGORIES.includes(catRaw) ? catRaw : null;
  if (!category) return null;
  return { category, needsSearch: searchRaw === "yes" };
}

/** Judge 1 — Groq / GPT-OSS 20B */
async function _classifyViaGroq(prompt) {
  if (!isProviderConfigured(GROQ)) return null;
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(GROQ.endpoint, {
      method: "POST",
      headers: { "Authorization": `Bearer ${KEYS.groq}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: CLASSIFIER_MODEL,
        max_tokens: 16,
        temperature: 0,
        messages: [
          { role: "system", content: CLASSIFIER_SYSTEM_PROMPT },
          { role: "user",   content: prompt.slice(0, 800) },
        ],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (!res.ok) return null;
    const data = await res.json();
    return _parseClassifierOutput(data.choices?.[0]?.message?.content);
  } catch (_) { clearTimeout(tid); return null; }
}

/** Judge 2 — Gemini 3.5 Flash-Lite (non-streaming generateContent) */
async function _classifyViaGemini(prompt) {
  if (!isProviderConfigured(GEMINI)) return null;
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 10000);
  const url  = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${KEYS.gemini}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: CLASSIFIER_SYSTEM_PROMPT }] },
          { role: "model", parts: [{ text: "Understood. I will output only the two tokens." }] },
          { role: "user", parts: [{ text: prompt.slice(0, 800) }] },
        ],
        generationConfig: { temperature: 0, maxOutputTokens: 16 },
      }),
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (!res.ok) return null;
    const data = await res.json();
    const raw  = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return _parseClassifierOutput(raw);
  } catch (_) { clearTimeout(tid); return null; }
}

/**
 * Run both judges in parallel, then majority-vote the results.
 * Category and needsSearch are voted on independently.
 * Tie-break order (most trusted first): Gemini → Groq.
 */
async function classifyIntent(prompt) {
  const FALLBACK = { category: "general", needsSearch: false, votes: { groq: null, gemini: null } };

  // Fire both simultaneously — never let one slow the other
  const [groqResult, geminiResult] = await Promise.all([
    _classifyViaGroq(prompt),
    _classifyViaGemini(prompt),
  ]);

  // Collect only the successful votes, in tie-break priority order
  const votes = [geminiResult, groqResult].filter(Boolean);

  console.log("[Classifier] votes:", votes);

  if (votes.length === 0) return FALLBACK;
  if (votes.length === 1) return { ...votes[0], votes: { groq: groqResult, gemini: geminiResult } };

  // ── Majority vote: category ─────────────────────────────────
  const catCounts = {};
  for (const v of votes) catCounts[v.category] = (catCounts[v.category] || 0) + 1;
  // Sort by count desc; ties keep insertion order (= tie-break priority)
  const winningCat = Object.entries(catCounts)
    .sort((a, b) => b[1] - a[1])[0][0];

  // ── Majority vote: needsSearch ──────────────────────────────
  const yesCount = votes.filter(v => v.needsSearch).length;
  const needsSearch = yesCount >= 2;   // both judges must agree

  return { category: winningCat, needsSearch, votes: { groq: groqResult, gemini: geminiResult } };
}

// ─────────────────────────────────────────
//  §6b. WEB-SEARCH CONSENSUS
//  Three models — drawn at random from the
//  live speed/mid tiers of every configured
//  provider — each answer one question:
//  does this prompt need live web data?
//  Strict majority wins; if fewer than two
//  answer, the intent classifier's own guess
//  stands as the tie-break.
// ─────────────────────────────────────────

const SEARCH_VOTE_SYSTEM_PROMPT =
  "You decide whether answering a user prompt requires a live web search. " +
  "Answer with exactly one token: yes or no.\n\n" +
  "yes = the answer needs current or live data — recent events, news, prices, " +
  "sports scores, weather, releases, or anything that changes over time or " +
  "postdates your training data.\n" +
  "no  = the answer can be produced from general knowledge — coding help, " +
  "math, creative writing, explanations, opinions.\n\n" +
  "Output only yes or no. No punctuation, no explanation.";

/** Parse a yes/no vote, or null when the answer is unusable. */
function _parseSearchVote(raw) {
  const clean = (raw || "").trim().toLowerCase();
  if (!clean) return null;
  if (/^yes\b/.test(clean)) return "yes";
  if (/^no\b/.test(clean))  return "no";
  // tolerate a wrapped answer such as "Yes, because…"
  if (/\byes\b/.test(clean) && !/\bno\b/.test(clean)) return "yes";
  if (/\bno\b/.test(clean)  && !/\byes\b/.test(clean)) return "no";
  return null;
}

/** One non-streaming completion, whichever transport the provider speaks. */
async function _callOnce(provider, modelId, apiKey, systemPrompt, userPrompt, maxTokens, timeoutMs) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    if (provider.type === "gemini") {
      const url = `${provider.endpoint}/${modelId}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            { role: "user",  parts: [{ text: systemPrompt }] },
            { role: "model", parts: [{ text: "Understood." }] },
            { role: "user",  parts: [{ text: userPrompt }] },
          ],
          generationConfig: { temperature: 0, maxOutputTokens: maxTokens },
        }),
        signal: ctrl.signal,
      });
      clearTimeout(tid);
      if (!res.ok) return null;
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
    }

    const res = await fetch(provider.endpoint, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelId,
        max_tokens: maxTokens,
        temperature: 0,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userPrompt },
        ],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (_) { clearTimeout(tid); return null; }
}

/**
 * Candidate voters: every live speed/mid model on a configured provider.
 * Heavy models are skipped — they are slow and wasted on a yes/no question.
 */
function _searchVoterPool() {
  const pool = [];
  for (const provider of PROVIDER_CHAIN) {
    if (!isProviderConfigured(provider)) continue;
    for (const [modelId, meta] of Object.entries(provider.models)) {
      const tier = (typeof meta === "string") ? "mid" : (meta.tier || "mid");
      if (tier === "speed" || tier === "mid") pool.push({ provider, modelId });
    }
  }
  return pool;
}

/** Draw `count` voters at random, preferring one per provider. */
function pickSearchJudges(count = 3) {
  const pool = _searchVoterPool();
  for (let i = pool.length - 1; i > 0; i--) {          // Fisher–Yates shuffle
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const picked = [];
  for (const c of pool) {                              // pass 1 — distinct providers
    if (picked.length === count) break;
    if (picked.some(p => p.provider.name === c.provider.name)) continue;
    picked.push(c);
  }
  for (const c of pool) {                              // pass 2 — fill the rest
    if (picked.length === count) break;
    if (picked.includes(c)) continue;
    picked.push(c);
  }
  return picked;
}

/** Ask three randomized models whether the prompt needs a live web search. */
async function decideNeedsSearch(prompt, classifierHint) {
  const judges = pickSearchJudges(3);
  if (!judges.length) return { needsSearch: !!classifierHint, votes: [], yes: 0, answered: 0 };

  const votes = await Promise.all(judges.map(async ({ provider, modelId }) => {
    const apiKey = getProviderKey(provider, 0);
    const raw = apiKey
      ? await _callOnce(provider, modelId, apiKey, SEARCH_VOTE_SYSTEM_PROMPT,
                        prompt.slice(0, 800), 64, 8000)
      : null;
    return { provider, modelId, vote: _parseSearchVote(raw) };
  }));

  const answered = votes.filter(v => v.vote);
  if (!answered.length) return { needsSearch: !!classifierHint, votes, yes: 0, answered: 0 };

  const yes = answered.filter(v => v.vote === "yes").length;
  // Strict majority of whoever answered; a lone voter decides alone.
  const needsSearch = answered.length === 1
    ? answered[0].vote === "yes"
    : yes * 2 > answered.length;

  console.log("[SearchVote]", votes.map(v => `${v.provider.name}/${v.modelId}=${v.vote}`).join(" · "));
  return { needsSearch, votes, yes, answered: answered.length };
}
// ─────────────────────────────────────────
//  §7. MODEL SELECTION
// ─────────────────────────────────────────
const activeModels  = [null, null, null, null];
const cardProviders = [null, null, null, null];
const globalUsedIds = new Set();

// Rate-limited providers: max 1 primary slot each
const FAST_PROVIDERS = new Set(["Groq"]);

function fastProviderAlreadyUsed(providerName, assigned) {
  if (!FAST_PROVIDERS.has(providerName)) return false;
  return assigned.some(a => a.provider.name === providerName);
}

function getModelMeta(provider, modelId) {
  const entry = provider.models[modelId];
  if (!entry) return { label: modelId.split("/").pop().replace(/:free$/, ""), tier: "mid" };
  if (typeof entry === "string") return { label: entry, tier: "mid" };
  return { label: entry.label, tier: entry.tier || "mid" };
}
function getModelLabel(p, mid) { return getModelMeta(p, mid).label; }
function getModelTier(p, mid)  { return getModelMeta(p, mid).tier; }

/**
 * Pick 4 starting models from CATEGORY_MODELS[category].
 * Applies provider-diversity rules to avoid loading a single provider.
 */
function pickUniqueStartModels(category) {
  globalUsedIds.clear();
  const catList = CATEGORY_MODELS[category] || CATEGORY_MODELS.general;
  const pool = catList.filter(
    ({ provider, modelId }) => isProviderConfigured(provider) && provider.models[modelId]
  );

  const assigned = [];
  const usedIds  = new Set();

  function pick(tierFilter, providerOK) {
    for (const c of pool) {
      if (usedIds.has(c.modelId)) continue;
      if (tierFilter && !tierFilter.includes(getModelTier(c.provider, c.modelId))) continue;
      if (providerOK && !providerOK(c.provider.name, assigned)) continue;
      return c;
    }
    return null;
  }

  let c;

  // Slot 0 — best heavy; relax
  c = pick(["heavy"], null) || pick(["mid"], null) || pick(null, null);
  if (c) { assigned.push(c); usedIds.add(c.modelId); globalUsedIds.add(c.modelId); }

  // Slot 1 — speed from different fast-provider; relax progressively
  c = pick(["speed"], (pn, a) => !fastProviderAlreadyUsed(pn, a))
   || pick(["speed"], null)
   || pick(["mid"],   (pn, a) => !fastProviderAlreadyUsed(pn, a))
   || pick(null,      (pn, a) => a.every(x => x.provider.name !== pn))
   || pick(null, null);
  if (c && !usedIds.has(c.modelId)) { assigned.push(c); usedIds.add(c.modelId); globalUsedIds.add(c.modelId); }

  // Slot 2 — heavy/mid from unused provider; relax
  c = pick(["heavy","mid"], (pn, a) => a.every(x => x.provider.name !== pn))
   || pick(["heavy","mid"], (pn, a) => !fastProviderAlreadyUsed(pn, a))
   || pick(null,            (pn, a) => a.every(x => x.provider.name !== pn))
   || pick(null, null);
  if (c && !usedIds.has(c.modelId)) { assigned.push(c); usedIds.add(c.modelId); globalUsedIds.add(c.modelId); }

  // Slot 3 — any remaining, prefer diversity
  c = pick(null, (pn, a) => a.every(x => x.provider.name !== pn)) || pick(null, null);
  if (c && !usedIds.has(c.modelId)) { assigned.push(c); usedIds.add(c.modelId); globalUsedIds.add(c.modelId); }

  return assigned;
}

/**
 * When a slot fails, walk CATEGORY_MODELS[currentCategory] first,
 * then fall back to any unclaimed model across all providers.
 */
function pickFallbackModel(cardIndex) {
  const otherLive = new Set(activeModels.filter((mid, i) => i !== cardIndex && mid !== null));

  // Phase 1: category-ordered list
  const catList = CATEGORY_MODELS[currentCategory] || CATEGORY_MODELS.general;
  for (const { provider, modelId } of catList) {
    if (!isProviderConfigured(provider)) continue;
    if (!provider.models[modelId]) continue;
    if (globalUsedIds.has(modelId)) continue;
    if (otherLive.has(modelId)) continue;
    globalUsedIds.add(modelId);
    return { provider, modelId };
  }

  // Phase 2: any remaining model on any provider
  for (const provider of PROVIDER_CHAIN) {
    if (!isProviderConfigured(provider)) continue;
    for (const modelId of Object.keys(provider.models)) {
      if (globalUsedIds.has(modelId)) continue;
      if (otherLive.has(modelId)) continue;
      globalUsedIds.add(modelId);
      return { provider, modelId };
    }
  }

  return null;
}


// ─────────────────────────────────────────
//  §8. API CALL LAYER
// ─────────────────────────────────────────
async function callProviderStream(provider, modelId, apiKey, userPrompt, signal, onChunk) {
  if (provider.type === "gemini")
    return callGeminiStream(modelId, apiKey, userPrompt, signal, onChunk);

  // Only OpenRouter needs its custom referrer headers —
  // other providers reject them in CORS preflight and fail silently.
  const extraHeaders = (provider === OPENROUTER)
    ? { "HTTP-Referer": "https://devs-ai-system.local", "X-Title": "Dev's AI System" }
    : {};

  return callOpenAIStream(provider.endpoint, modelId, apiKey, userPrompt, signal, onChunk, extraHeaders);
}

async function callOpenAIStream(endpoint, modelId, apiKey, userPrompt, signal, onChunk, extraHeaders = {}) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify({ model: modelId, messages: [
  ...(userPrompt.includes("[WEB SEARCH CONTEXT") ? [{
    role: "system",
    content: "You have been provided with live web search results above the user's question. Use them as your primary source. Do not say you cannot access the internet — you have been given the context already."
  }] : []),
  { role: "user", content: userPrompt },
], stream: true }),
    signal,
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j?.error?.message || msg; } catch (_) {}
    const e = new Error(msg); e.status = res.status; throw e;
  }

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n"); buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (raw === "[DONE]") return;
      try {
        const json = JSON.parse(raw);
        if (json.error) { const e = new Error(json.error.message || "Stream error"); e.status = json.error.code || 500; throw e; }
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) onChunk(delta);
      } catch (e) { if (e.status) throw e; }
    }
  }
}

async function callGeminiStream(modelId, apiKey, userPrompt, signal, onChunk) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?alt=sse&key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [
  ...(userPrompt.includes("[WEB SEARCH CONTEXT") ? [{
    role: "user",
    parts: [{ text: "System instruction: You have been provided with live web search results above the user's question. Use them as your primary source. Do not say you cannot access the internet — you have been given the context already." }]
  }, { role: "model", parts: [{ text: "Understood. I will use the provided web search context to answer." }] }] : []),
  { role: "user", parts: [{ text: userPrompt }] },
], generationConfig: { temperature: 0.7 } }),
    signal,
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j?.error?.message || msg; } catch (_) {}
    const e = new Error(msg); e.status = res.status; throw e;
  }

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n"); buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      try {
        const json = JSON.parse(raw);
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) onChunk(text);
      } catch (_) {}
    }
  }
}

// ─────────────────────────────────────────
//  §9. RESPONSE ORCHESTRATOR
// ─────────────────────────────────────────
const MAX_ATTEMPTS = 12;

async function generateResponse(cardIndex, initProvider, initModelId, augmentedPrompt) {
  let currentProvider = initProvider;
  let currentModelId  = initModelId;
  let attempt         = 0;

  const ac = new AbortController();
  if (cards[cardIndex]) cards[cardIndex].abortController = ac;

  setModelLabel(cardIndex, currentProvider, currentModelId);

  while (attempt < MAX_ATTEMPTS) {
    const responseEl = document.getElementById(`response-${cardIndex}`);
    if (!responseEl) return;

    let accumulated  = "";
    let switchReason = null;

    setStatus(cardIndex, "querying",
      `↗ [${currentProvider.name}] ${currentModelId.split("/").pop().slice(0,24)}`);

    const apiKey = getProviderKey(currentProvider, cardIndex);
    if (!apiKey) { setStatus(cardIndex, "error", "NO API KEY"); activeModels[cardIndex] = null; return; }

    try {
      setStatus(cardIndex, "streaming", `▶ [${currentProvider.name}] streaming…`);

      await callProviderStream(currentProvider, currentModelId, apiKey, augmentedPrompt, ac.signal, chunk => {
        accumulated += chunk;
        responseEl.innerHTML = renderMarkdown(accumulated);
        responseEl._raw = accumulated;            // kept for §17 export
      });

      if (accumulated.trim()) {
        setStatus(cardIndex, "done", `✓ [${currentProvider.name}] done`);
        activeModels[cardIndex] = currentModelId;
        updateSidebarHighlights();
        return;
      }
      switchReason = "empty response";

    } catch (err) {
      if (err.name === "AbortError") return;
      if (err.status === 401) {
        if (currentProvider === OPENROUTER) { rotateOpenRouterKey(cardIndex); switchReason = "401 · rotating key"; }
        else { setStatus(cardIndex, "error", "AUTH ERROR"); activeModels[cardIndex] = null; return; }
      } else {
        switchReason = `${err.status || "ERR"} · ${(err.message || "").slice(0,26)}`;
      }
    }

    const fallback = pickFallbackModel(cardIndex);
    if (!fallback) { setStatus(cardIndex, "error", "SLOT EXHAUSTED"); activeModels[cardIndex] = null; return; }

    attempt++;
    setStatus(cardIndex, "switching",
      `↻ [${currentProvider.name}→${fallback.provider.name}] ${escHtml(switchReason||"").slice(0,22)}`);
    console.log(`[Slot ${cardIndex}] → ${fallback.provider.name}:${fallback.modelId}`);

    await delay(500 + attempt * 200);

    activeModels[cardIndex]  = fallback.modelId;
    cardProviders[cardIndex] = fallback.provider;
    currentProvider          = fallback.provider;
    currentModelId           = fallback.modelId;
    setModelLabel(cardIndex, currentProvider, currentModelId);
  }

  setStatus(cardIndex, "error", "SLOT EXHAUSTED");
  activeModels[cardIndex] = null;
}


// ─────────────────────────────────────────
//  §10. CARD HELPERS
// ─────────────────────────────────────────
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function escHtml(s) {
  return String(s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function renderMarkdown(text) {
  return text
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (_,_l,code) => `<pre><code>${escHtml(code.trim())}</code></pre>`)
    .replace(/`([^`\n]+)`/g,  (_,c) => `<code>${escHtml(c)}</code>`)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g,     "<em>$1</em>");
}


// ─────────────────────────────────────────
//  §11. CARD STATE & DOM
// ─────────────────────────────────────────
const cards = [];

function setStatus(i, state, text) {
  const dot = document.getElementById(`dot-${i}`);
  const st  = document.getElementById(`status-text-${i}`);
  if (!dot || !st) return;
  dot.className = `status-dot ${state}`;
  st.className  = `status-text ${state}`;
  st.textContent = text;
}

function setModelLabel(i, provider, modelId) {
  const el = document.getElementById(`model-name-${i}`);
  if (!el) return;
  el.textContent = getModelLabel(provider, modelId);
  el.title = `${provider.name}: ${modelId}`;
  const tierEl = document.getElementById(`tier-badge-${i}`);
  if (tierEl) {
    const tier = getModelTier(provider, modelId);
    tierEl.className  = `tier-badge ${tier}`;
    tierEl.textContent = tier === "heavy" ? "HVY" : tier === "speed" ? "SPD" : "MID";
  }
  const chipEl = document.getElementById(`provider-chip-${i}`);
  if (chipEl) chipEl.textContent = provider.name.toUpperCase();
}

function toggleCollapse(i) {
  if (!cards[i]) return;
  const collapsed = cards[i].el.classList.toggle("collapsed");
  const btn = document.getElementById(`collapse-btn-${i}`);
  if (btn) btn.title = collapsed ? "Expand" : "Collapse";
}

function deleteCard(i) {
  const card = cards[i];
  if (!card) return;
  card.abortController?.abort();
  activeModels[i]  = null;
  cardProviders[i] = null;
  const el = card.el;
  el.style.maxHeight = el.offsetHeight + "px";
  el.style.overflow  = "hidden";
  requestAnimationFrame(() => {
    el.style.transition =
      "opacity 0.25s ease, max-height 0.35s ease 0.05s, " +
      "margin 0.3s ease, padding 0.3s ease, border-width 0.3s ease";
    el.style.opacity       = "0";
    el.style.maxHeight     = "0";
    el.style.minHeight     = "0";
    el.style.marginTop     = "0";
    el.style.marginBottom  = "0";
    el.style.paddingTop    = "0";
    el.style.paddingBottom = "0";
    el.style.borderWidth   = "0";
  });
  setTimeout(() => { el.remove(); cards[i] = null; updateSidebarHighlights(); }, 420);
}

function buildCards(assignments) {
  const grid = document.getElementById("response-grid");

  // Preserve any extra cards (prepended) — detach, clear, re-attach
  const extras = Array.from(grid.querySelectorAll(".card-extra"));
  grid.innerHTML = "";
  extras.forEach(el => grid.appendChild(el));

  cards.length = 0;
  activeModels.fill(null);
  cardProviders.fill(null);
  orKeyIndices.fill(0);

  assignments.forEach(({ provider, modelId }, i) => {
    activeModels[i]  = modelId;
    cardProviders[i] = provider;
    const meta      = getModelMeta(provider, modelId);
    const tierLabel = meta.tier === "heavy" ? "HVY" : meta.tier === "speed" ? "SPD" : "MID";

    const el = document.createElement("div");
    el.className = "card";
    el.style.animationDelay = `${i * 80}ms`;
    el.innerHTML = `
      <div class="card-header">
        <div class="model-name-wrap">
          <div class="model-name" id="model-name-${i}"
               title="${escHtml(provider.name)}: ${escHtml(modelId)}">${escHtml(meta.label)}</div>
          <span class="tier-badge ${meta.tier}" id="tier-badge-${i}">${tierLabel}</span>
          <span class="provider-chip" id="provider-chip-${i}">${escHtml(provider.name.toUpperCase())}</span>
        </div>
        <div class="card-actions">
          <button class="btn-collapse" id="collapse-btn-${i}" onclick="toggleCollapse(${i})" title="Collapse">
            <span class="chevron">▾</span>
          </button>
          <button class="btn-icon" onclick="exportPdf('response-${i}')" title="Export as PDF (print → Save as PDF)">PDF</button>
          <button class="btn-icon" onclick="exportDocx('response-${i}')" title="Export as Word document">DOCX</button>
          <button class="btn-icon" onclick="copyResponse(${i})" id="copy-btn-${i}">COPY</button>
          <button class="btn-icon delete-btn" onclick="deleteCard(${i})">DEL</button>
        </div>
      </div>
      <div class="status-block" id="status-block-${i}">
        <div class="status-dot idle" id="dot-${i}"></div>
        <div class="status-text" id="status-text-${i}">IDLE</div>
      </div>
      <div class="response-body" id="response-${i}">
        <span class="placeholder">Awaiting execution…</span>
      </div>`;

    grid.appendChild(el);
    cards.push({ el, modelId, abortController: null });
  });
}


// ─────────────────────────────────────────
//  §12. SIDEBAR
// ─────────────────────────────────────────

/** Render all provider groups and model rows into the sidebar. */
function renderSidebarModels() {
  const list = document.getElementById("sidebar-list");
  list.innerHTML = "";

  for (const provider of PROVIDER_CHAIN) {
    const modelEntries = Object.entries(provider.models);
    const configured   = isProviderConfigured(provider);

    // Provider group header
    const head = document.createElement("div");
    head.className = "sidebar-group-head";
    head.dataset.provider = provider.name;
    head.innerHTML =
      `${escHtml(provider.name.toUpperCase())} ` +
      `<span class="sidebar-group-count">${modelEntries.length} models` +
      `${configured ? "" : " · no key"}</span>`;
    list.appendChild(head);

    // Model rows
    for (const [modelId, meta] of modelEntries) {
      const { label, tier } = (typeof meta === "string") ? { label: meta, tier: "mid" } : meta;
      const tierLabel = tier === "heavy" ? "HVY" : tier === "speed" ? "SPD" : "MID";

      const item = document.createElement("div");
      item.className = "sidebar-model-item";
      item.dataset.provider = provider.name;
      item.dataset.modelId  = modelId;
      item.dataset.label    = label.toLowerCase();
      item.title = configured
        ? `${provider.name} · ${modelId}\nClick to add as extra response block`
        : `${provider.name} has no API key — configure one in KEYS`;

      item.innerHTML =
        `<span class="sidebar-model-name">${escHtml(label)}</span>` +
        `<span class="sidebar-model-tier ${tier}">${tierLabel}</span>`;

      if (configured) {
        item.onclick = () => addExtraCard(provider, modelId);
      } else {
        item.style.opacity = "0.38";
        item.style.cursor  = "not-allowed";
        item.title = `No key for ${provider.name}`;
      }

      list.appendChild(item);
    }
  }
}

/** Highlight sidebar rows whose model is currently active in any slot. */
function updateSidebarHighlights() {
  const activeSet = new Set(activeModels.filter(Boolean));

  // Also capture extra cards
  document.querySelectorAll(".card-extra[data-model-id]").forEach(el => {
    // Only count as active if not in failed state
    if (!el.classList.contains("card-failed")) activeSet.add(el.dataset.modelId);
  });

  let count = 0;
  document.querySelectorAll(".sidebar-model-item").forEach(item => {
    const isActive = activeSet.has(item.dataset.modelId);
    item.classList.toggle("sidebar-active", isActive);
    if (isActive) count++;
  });

  const countEl = document.getElementById("sidebar-active-count");
  if (countEl) {
    countEl.textContent = `${count} ACTIVE`;
    countEl.classList.toggle("has-active", count > 0);
  }
}

/** Filter sidebar rows by query string. */
function filterSidebar(q) {
  q = q.trim().toLowerCase();
  const groups = document.querySelectorAll(".sidebar-group-head");

  document.querySelectorAll(".sidebar-model-item").forEach(item => {
    const match = !q
      || item.dataset.label.includes(q)
      || item.dataset.provider.toLowerCase().includes(q)
      || item.dataset.modelId.toLowerCase().includes(q);
    item.classList.toggle("hidden", !match);
  });

  groups.forEach(head => {
    const pname = head.dataset.provider;
    const anyVisible = [...document.querySelectorAll(`.sidebar-model-item[data-provider="${pname}"]`)]
      .some(el => !el.classList.contains("hidden"));
    head.classList.toggle("hidden", !anyVisible);
  });
}

function toggleSidebar() {
  document.getElementById("sidebar").classList.contains("open")
    ? closeSidebar() : openSidebar();
}

function openSidebar() {
  closeNav();
  document.getElementById("sidebar").classList.add("open");
  const ov = document.getElementById("sidebar-overlay");
  ov.style.display = "block";
  requestAnimationFrame(() => ov.classList.add("visible"));
}

function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  const ov = document.getElementById("sidebar-overlay");
  ov.classList.remove("visible");
  setTimeout(() => { ov.style.display = "none"; }, 310);
}


// ─────────────────────────────────────────
//  §13. EXTRA CARDS  (sidebar-click → prepend)
// ─────────────────────────────────────────
let extraCardCounter = 100;

/**
 * Prepend a new response block for the clicked model.
 * On API failure → show error → auto-remove after 2.5 s.
 * On success → stays permanently.
 */
async function addExtraCard(provider, modelId) {
  if (!currentLastPrompt) {
    alert("⚠ Submit a prompt first before adding extra blocks.");
    return;
  }

  const xid  = extraCardCounter++;
  const meta  = getModelMeta(provider, modelId);
  const tier  = meta.tier;
  const tl    = tier === "heavy" ? "HVY" : tier === "speed" ? "SPD" : "MID";

  const grid = document.getElementById("response-grid");

  const el = document.createElement("div");
  el.className = "card card-extra";
  el.id = `xcard-${xid}`;
  el.dataset.modelId  = modelId;
  el.dataset.provider = provider.name;
  el.innerHTML = `
    <div class="card-header">
      <div class="model-name-wrap">
        <div class="model-name" title="${escHtml(provider.name)}: ${escHtml(modelId)}">${escHtml(meta.label)}</div>
        <span class="tier-badge ${tier}">${tl}</span>
        <span class="provider-chip">${escHtml(provider.name.toUpperCase())}</span>
        <span class="extra-badge">EXTRA</span>
      </div>
      <div class="card-actions">
        <button class="btn-icon" onclick="exportPdf('xresp-${xid}')" title="Export as PDF (print → Save as PDF)">PDF</button>
        <button class="btn-icon" onclick="exportDocx('xresp-${xid}')" title="Export as Word document">DOCX</button>
        <button class="btn-icon" id="xcopy-${xid}" onclick="copyExtraResponse(${xid})">COPY</button>
        <button class="btn-icon delete-btn" onclick="removeExtraCard('xcard-${xid}')">DEL</button>
      </div>
    </div>
    <div class="status-block">
      <div class="status-dot querying" id="xdot-${xid}"></div>
      <div class="status-text querying" id="xst-${xid}">CONNECTING…</div>
    </div>
    <div class="response-body" id="xresp-${xid}">
      <span class="placeholder">Calling ${escHtml(meta.label)} via ${escHtml(provider.name)}…</span>
    </div>`;

  // Prepend before all existing children
  grid.insertBefore(el, grid.firstChild);
  closeSidebar();
  updateSidebarHighlights();

  // Helper for status updates inside this extra card
  const xStatus = (state, text) => {
    const d = document.getElementById(`xdot-${xid}`);
    const s = document.getElementById(`xst-${xid}`);
    if (d) d.className = `status-dot ${state}`;
    if (s) { s.className = `status-text ${state}`; s.textContent = text; }
  };

  const ac     = new AbortController();
  el._ac       = ac;
  const apiKey = getProviderKey(provider, 0);

  try {
    xStatus("streaming", `▶ [${provider.name}] streaming…`);
    const respEl = document.getElementById(`xresp-${xid}`);
    if (respEl) respEl.innerHTML = "";
    let accumulated = "";

    await callProviderStream(provider, modelId, apiKey, currentLastPrompt, ac.signal, chunk => {
      accumulated += chunk;
      if (respEl) { respEl.innerHTML = renderMarkdown(accumulated); respEl._raw = accumulated; }
    });

    if (!accumulated.trim()) throw new Error("Empty response");

    xStatus("done", `✓ [${provider.name}] done`);
    updateSidebarHighlights();

  } catch (err) {
    if (err.name === "AbortError") return; // user clicked DEL manually

    xStatus("error", `FAILED: ${(err.message || "error").slice(0, 40)}`);
    el.classList.add("card-failed");
    el.dataset.modelId = ""; // remove from highlight set

    const respEl = document.getElementById(`xresp-${xid}`);
    if (respEl)
      respEl.innerHTML =
        `<span class="placeholder" style="color:#ff6666">` +
        `❌ ${escHtml(meta.label)} (${escHtml(provider.name)}) failed.<br>` +
        `${escHtml((err.message || "unknown error").slice(0, 140))}</span>`;

    updateSidebarHighlights();
    await delay(2500);

    // Auto-remove with animation
    if (document.getElementById(`xcard-${xid}`)) animateRemoveEl(el);
  }
}

function copyExtraResponse(xid) {
  const el  = document.getElementById(`xresp-${xid}`);
  const btn = document.getElementById(`xcopy-${xid}`);
  if (!el || !btn) return;
  navigator.clipboard.writeText(el.innerText || el.textContent).then(() => {
    btn.textContent = "✓ COPIED"; btn.classList.add("copied");
    setTimeout(() => { btn.textContent = "COPY"; btn.classList.remove("copied"); }, 1800);
  });
}

function removeExtraCard(cardId) {
  const el = document.getElementById(cardId);
  if (!el) return;
  el._ac?.abort();
  animateRemoveEl(el);
  setTimeout(updateSidebarHighlights, 440);
}

function animateRemoveEl(el) {
  el.style.maxHeight = el.offsetHeight + "px";
  el.style.overflow  = "hidden";
  requestAnimationFrame(() => {
    el.style.transition =
      "opacity 0.25s ease, max-height 0.35s ease 0.05s, " +
      "margin 0.3s ease, padding 0.3s ease, border-width 0.3s ease";
    el.style.opacity       = "0";
    el.style.maxHeight     = "0";
    el.style.minHeight     = "0";
    el.style.marginTop     = "0";
    el.style.marginBottom  = "0";
    el.style.paddingTop    = "0";
    el.style.paddingBottom = "0";
    el.style.borderWidth   = "0";
  });
  setTimeout(() => el.remove(), 420);
}

/** One-line web-search report under the prompt box. */
function setSearchLine(cls, text) {
  const el = document.getElementById("search-status");
  if (!el) return;
  el.className   = `search-status visible ${cls}`;
  el.textContent = text;
}

/**
 * Runs the search only when the consensus said yes, and reports back in
 * one line: did it happen, through which search API, and on whose vote.
 */
async function augmentWithSearch(prompt, needsSearch, proposers = []) {
  if (!needsSearch) return prompt;          // submitPrompt already printed the line

  const proposerText = proposers.length ? proposers.join(", ") : "intent classifier";

  if (!SEARCH_CONFIG.enabled) {
    setSearchLine("error", "✗ Web search · not performed — search module disabled");
    return prompt;
  }

  const keyReady = k => !!(k && !k.startsWith("YOUR_"));
  if (!keyReady(SEARCH_KEYS.tavily) && !keyReady(SEARCH_KEYS.exa)) {
    setSearchLine("error",
      `✗ Web search · skipped — no search API key · proposed by ${proposerText}`);
    return prompt;
  }

  const firstApi = keyReady(SEARCH_KEYS.tavily) ? "Tavily" : "Exa";
  setSearchLine("running", `⟳ Web search · querying ${firstApi}…`);

  try {
    const result = await performWebSearch(prompt);

    if (result.source === "none" || result.error) {
      setSearchLine("error",
        `✗ Web search · failed — ${result.error || "no results"} · proposed by ${proposerText}`);
      return prompt;
    }

    const api  = result.source === "tavily" ? "Tavily" : "Exa";
    const note = (result.source === "exa" && keyReady(SEARCH_KEYS.tavily))
      ? " (Tavily unavailable — fell back)" : "";
    const n = result.results.length;
    setSearchLine("done",
      `✓ Web search · done via ${api}${note} · ${n} source${n === 1 ? "" : "s"} · proposed by ${proposerText}`);

    const context = formatSearchContext(result, prompt);
    if (!context) return prompt;
    return context + prompt;

  } catch (err) {
    setSearchLine("error", `✗ Web search · failed — ${err.message} · proposed by ${proposerText}`);
    return prompt;
  }
}

// ─────────────────────────────────────────
//  §14. SUBMIT
// ─────────────────────────────────────────
async function submitPrompt() {
  const promptEl   = document.getElementById("prompt");
  const userPrompt = promptEl.value.trim();
  if (!userPrompt) return;

  if (!PROVIDER_CHAIN.some(p => isProviderConfigured(p))) {
    alert("⚠ No API keys configured. Click KEYS in the header and paste at least one.");
    return;
  }

  cards.forEach(c => c?.abortController?.abort());

  const btn = document.getElementById("submit-btn");
  btn.disabled = true; btn.classList.add("running"); btn.textContent = "RUNNING…";

  // ── Step 1: classify intent ───────────────────────────────────
  const intentEl = document.getElementById("intent-status");
  const catBadge = document.getElementById("cat-badge");

  intentEl.textContent = "⟳ Classifying intent via two models…";
  intentEl.className   = "intent-status classifying";
  catBadge.textContent = "INTENT: classifying…";
  catBadge.classList.remove("active");

  const classifyResult = await classifyIntent(userPrompt);
  const { category: cat } = classifyResult;
  currentCategory = cat;

  const catLabels = {
    coding: "CODING / DEV",
    reasoning: "REASONING / MATH",
    creative: "CREATIVE WRITING",
    research: "RESEARCH / ANALYSIS",
    summarization: "SUMMARIZATION",
    general: "GENERAL / Q&A",
  };
  const catLabel = catLabels[cat] || cat.toUpperCase();

  catBadge.textContent = `INTENT: ${catLabel}`;
  catBadge.classList.add("active");
  intentEl.className = "intent-status done";

  // ── Step 1b: web-search consensus (3 randomized working models) ──
  intentEl.textContent = "⟳ Deciding whether a web search is needed…";
  const searchVerdict = await decideNeedsSearch(userPrompt, classifyResult.needsSearch);
  const needsSearch   = searchVerdict.needsSearch;

  // Which model(s) argued for a search — reported only if one actually runs
  const searchProposers = searchVerdict.votes
    .filter(v => v.vote === "yes")
    .map(v => getModelLabel(v.provider, v.modelId));

  // Per-judge vote rows — intent category (2 judges)
  const { votes } = classifyResult;
  const judgeRows = [
    { name: "Gemini 3.5 Flash-Lite", result: votes.gemini },
    { name: "Groq  GPT-OSS 20B     ", result: votes.groq   },
  ].map(({ name, result }) => {
    if (!result) {
      return `<span class="vote-row vote-fail">✗ ${name} — no response</span>`;
    }
    return `<span class="vote-row">◈ ${name} → <strong>${result.category.toUpperCase()}</strong></span>`;
  }).join("");

  const answered = Object.values(votes).filter(Boolean).length;
  const majority = `✓ <strong>${catLabel}</strong> · intent ${answered}/2`;

  intentEl.innerHTML =
    `<span class="vote-summary">${majority}</span>` +
    `<span class="vote-divider"></span>` +
    judgeRows;

  // One line for the search decision — never the full vote table.
  if (!needsSearch) {
    setSearchLine("done", "✗ Web search · not performed — no live data needed");
  } else {
    setSearchLine("running", "⟳ Web search · starting…");
  }

  // ── Step 2: augment prompt with web search (if applicable) ────
  const augmentedPrompt = await augmentWithSearch(userPrompt, needsSearch, searchProposers);
  currentLastPrompt = augmentedPrompt; // extra cards also get the same context

  updateProviderBadge();

  // ── Step 3: pick models & build grid ─────────────────────────
  const assignments = pickUniqueStartModels(cat);
  if (!assignments.length) {
    alert("No providers configured.");
    btn.disabled = false; btn.classList.remove("running"); btn.textContent = "EXECUTE";
    return;
  }
  while (assignments.length < 4) assignments.push({ ...assignments[assignments.length - 1] });

  buildCards(assignments.slice(0, 4));
  updateSidebarHighlights();

  // ── Step 4: run 4 in parallel ─────────────────────────────────
  await Promise.allSettled(
    assignments.slice(0, 4).map(({ provider, modelId }, i) =>
      generateResponse(i, provider, modelId, augmentedPrompt)
    )
  );

  updateSidebarHighlights();
  btn.disabled = false; btn.classList.remove("running"); btn.textContent = "EXECUTE";
}

function updateProviderBadge() {
  const badge = document.getElementById("key-badge");
  if (!badge) return;
  const configured = PROVIDER_CHAIN.filter(p => isProviderConfigured(p)).map(p => p.name);
  badge.textContent = configured.length ? configured.join(" · ") : "NO KEYS — CLICK 🔑";
  badge.classList.toggle("active", configured.length > 0);
}


// ─────────────────────────────────────────
//  §15. CARD ACTIONS & KEY HANDLER
// ─────────────────────────────────────────
function copyResponse(i) {
  const el  = document.getElementById(`response-${i}`);
  const btn = document.getElementById(`copy-btn-${i}`);
  if (!el || !btn) return;
  navigator.clipboard.writeText(el.innerText || el.textContent).then(() => {
    btn.textContent = "✓ COPIED"; btn.classList.add("copied");
    setTimeout(() => { btn.textContent = "COPY"; btn.classList.remove("copied"); }, 1800);
  });
}

function resetAll() {
  closeNav();
  cards.forEach(c => c?.abortController?.abort());
  document.querySelectorAll(".card-extra").forEach(el => { el._ac?.abort(); el.remove(); });

  document.getElementById("response-grid").innerHTML = "";
  cards.length = 0;
  activeModels.fill(null);
  cardProviders.fill(null);
  globalUsedIds.clear();
  currentLastPrompt = "";
  currentCategory   = "general";

  document.getElementById("prompt").value = "";
  document.getElementById("cat-badge").textContent = "INTENT: —";
  document.getElementById("cat-badge").classList.remove("active");

  const intentEl = document.getElementById("intent-status");
  intentEl.textContent = "";
  intentEl.className   = "intent-status";

  const btn = document.getElementById("submit-btn");
  btn.disabled = false; btn.classList.remove("running"); btn.textContent = "EXECUTE";

  updateSidebarHighlights();
}

function handleKey(e) {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitPrompt(); }
}


// ─────────────────────────────────────────
//  §16. MATRIX RAIN
// ─────────────────────────────────────────
(function initMatrix() {
  const canvas = document.getElementById("matrix-canvas");
  const ctx    = canvas.getContext("2d");
  const chars  = "アイウエオカキクケコサシスセソタチツテトナニヌネノ01ABCDEFGHIJ";
  let cols, drops;

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    cols  = Math.floor(canvas.width / 18);
    drops = Array(cols).fill(1);
  }
  function draw() {
    ctx.fillStyle = "rgba(5,10,5,0.05)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#00ff41";
    ctx.font = "14px 'Courier New'";
    for (let i = 0; i < cols; i++) {
      ctx.fillText(chars[Math.floor(Math.random() * chars.length)], i * 18, drops[i] * 18);
      if (drops[i] * 18 > canvas.height && Math.random() > 0.975) drops[i] = 0;
      drops[i]++;
    }
  }
  resize();
  window.addEventListener("resize", resize);
  setInterval(draw, 50);
})();


// ─────────────────────────────────────────
//  §16b. MOBILE NAV DRAWER
//  Below 720px the header collapses to the
//  logo plus a hamburger; the controls slide
//  in from the right as a drawer. Desktop is
//  untouched — the toggle is display:none.
// ─────────────────────────────────────────
function _navPanel() { return document.getElementById("nav-panel"); }
function _navToggle() { return document.getElementById("nav-toggle"); }

function openNav() {
  const panel = _navPanel();
  const ov    = document.getElementById("nav-overlay");
  if (panel) panel.classList.add("open");
  const t = _navToggle();
  if (t) t.setAttribute("aria-expanded", "true");
  if (ov) {
    ov.style.display = "block";
    requestAnimationFrame(() => ov.classList.add("visible"));
  }
}

function closeNav() {
  const panel = _navPanel();
  const ov    = document.getElementById("nav-overlay");
  if (panel) panel.classList.remove("open");
  const t = _navToggle();
  if (t) t.setAttribute("aria-expanded", "false");
  if (ov) {
    ov.classList.remove("visible");
    setTimeout(() => {
      if (!ov.classList.contains("visible")) ov.style.display = "none";
    }, 300);
  }
}

function toggleNav() {
  const panel = _navPanel();
  if (!panel) {
    console.warn("[Dev AI System] #nav-panel not found — index.html is older than script.js. " +
                 "Deploy both files from the same build.");
    return;
  }
  if (panel.classList.contains("open")) closeNav();
  else openNav();
}

// Escape closes the drawer; widening past the breakpoint resets it.
document.addEventListener("keydown", e => { if (e.key === "Escape") closeNav(); });
window.addEventListener("resize", () => {
  if (window.innerWidth > 720) closeNav();
});


// ─────────────────────────────────────────
//  §17. DOCUMENT EXPORT  (browser-only)
//  Turns a finished card into a real file.
//    · PDF  — the browser's own print pipeline
//             (print → "Save as PDF")
//    · DOCX — assembled here as an OOXML zip,
//             no library, no network, no key
//  Nothing leaves the page.
// ─────────────────────────────────────────

// ── Markdown → block list (headings, lists, tables, code) ─────
// The chat renderer stays untouched; this parser only feeds exports.

function parseDocMarkdown(md) {
  const lines = String(md || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*```/.test(line)) {                        // fenced code
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      blocks.push({ type: "code", text: buf.join("\n") });
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length &&
        /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {   // table
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        const cells = lines[i].trim().replace(/^\|/, "").replace(/\|$/, "")
          .split("|").map(c => c.trim());
        if (!/^[\s:|-]+$/.test(cells.join("|"))) rows.push(cells);
        i++;
      }
      blocks.push({ type: "table", rows });
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/);         // heading
    if (h) { blocks.push({ type: "heading", level: h[1].length, text: h[2].trim() }); i++; continue; }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { blocks.push({ type: "hr" }); i++; continue; }

    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {         // list
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, "").trim());
        i++;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    if (/^\s*>\s?/.test(line)) {                       // blockquote
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, "")); i++;
      }
      blocks.push({ type: "quote", text: buf.join(" ") });
      continue;
    }

    if (!line.trim()) { i++; continue; }

    const buf = [line.trim()];                         // paragraph
    i++;
    while (i < lines.length && lines[i].trim() &&
           !/^\s*(#{1,6}\s|```|\||>\s?|([-*+]|\d+[.)])\s)/.test(lines[i])) {
      buf.push(lines[i].trim()); i++;
    }
    blocks.push({ type: "para", text: buf.join(" ") });
  }
  return blocks;
}

/** Split inline markdown into runs: { text, bold, italic, mono }. */
function inlineParts(text) {
  const out = [];
  const re = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    if (m[2] !== undefined)      out.push({ text: m[2], bold: true });
    else if (m[4] !== undefined) out.push({ text: m[4], italic: true });
    else                         out.push({ text: m[6], mono: true });
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

function inlineHtml(text) {
  return inlineParts(text).map(p => {
    const t = escHtml(p.text);
    if (p.bold)   return `<strong>${t}</strong>`;
    if (p.italic) return `<em>${t}</em>`;
    if (p.mono)   return `<code>${t}</code>`;
    return t;
  }).join("");
}

/** Block list → printable HTML (the PDF path). */
function blocksToHtml(blocks, opts = {}) {
  const out = [];
  let dropped = false;
  for (const b of blocks) {
    if (!dropped && opts.skipFirstHeading && b.type === "heading" && b.level === 1) {
      dropped = true;
      continue;
    }
    switch (b.type) {
      case "heading": {
        const lv = Math.min(b.level + (opts.skipFirstHeading ? 0 : 0), 6);
        out.push(`<h${lv}>${inlineHtml(b.text)}</h${lv}>`);
        break;
      }
      case "para":  out.push(`<p>${inlineHtml(b.text)}</p>`); break;
      case "quote": out.push(`<blockquote>${inlineHtml(b.text)}</blockquote>`); break;
      case "code":  out.push(`<pre><code>${escHtml(b.text)}</code></pre>`); break;
      case "hr":    out.push("<hr>"); break;
      case "list": {
        const tag = b.ordered ? "ol" : "ul";
        out.push(`<${tag}>` + b.items.map(it => `<li>${inlineHtml(it)}</li>`).join("") + `</${tag}>`);
        break;
      }
      case "table": {
        const head = b.rows[0] || [];
        const body = b.rows.slice(1);
        out.push("<table><thead><tr>" +
          head.map(c => `<th>${inlineHtml(c)}</th>`).join("") +
          "</tr></thead><tbody>" +
          body.map(r => "<tr>" + r.map(c => `<td>${inlineHtml(c)}</td>`).join("") + "</tr>").join("") +
          "</tbody></table>");
        break;
      }
    }
  }
  return out.join("\n");
}

const DOC_PRINT_CSS = `
  @page { size: A4; margin: 18mm 16mm; }
  html, body { background: #fff; }
  body { font-family: Georgia, "Times New Roman", serif; font-size: 11pt; line-height: 1.55;
         color: #111; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1 { font-family: "Helvetica Neue", Arial, sans-serif; font-size: 20pt; line-height: 1.15;
       margin: 0 0 4pt; letter-spacing: -0.2pt; }
  .doc-meta { font-family: "Helvetica Neue", Arial, sans-serif; font-size: 8.5pt; color: #777;
              border-bottom: 1px solid #ddd; padding-bottom: 7pt; margin-bottom: 16pt; }
  h2, h3, h4 { font-family: "Helvetica Neue", Arial, sans-serif; line-height: 1.2;
               page-break-after: avoid; break-after: avoid; }
  h2 { font-size: 13.5pt; margin: 18pt 0 6pt; }
  h3 { font-size: 11.5pt; margin: 13pt 0 4pt; }
  h4 { font-size: 10.5pt; margin: 11pt 0 3pt; }
  p { margin: 0 0 8pt; orphans: 2; widows: 2; }
  ul, ol { margin: 0 0 9pt 0; padding-left: 18pt; }
  li { margin-bottom: 3pt; }
  strong { font-weight: 700; }
  hr { border: 0; border-top: 1px solid #ddd; margin: 14pt 0; }
  blockquote { margin: 0 0 9pt; padding-left: 10pt; border-left: 3px solid #ddd; color: #444; font-style: italic; }
  pre { background: #f5f5f5; border: 1px solid #e2e2e2; border-radius: 3px; padding: 8pt;
        font-size: 8.8pt; line-height: 1.4; white-space: pre-wrap; word-break: break-word;
        page-break-inside: avoid; break-inside: avoid; }
  code { font-family: "Courier New", monospace; font-size: 9.4pt; background: #f5f5f5; padding: 0 2px; }
  pre code { background: none; padding: 0; }
  table { border-collapse: collapse; width: 100%; margin: 0 0 11pt; font-size: 9.4pt;
          font-family: "Helvetica Neue", Arial, sans-serif; page-break-inside: avoid; break-inside: avoid; }
  th, td { border: 1px solid #c9c9c9; padding: 4pt 6pt; text-align: left; vertical-align: top; }
  th { background: #f0f0f0; font-size: 9pt; }
  a { color: #111; text-decoration: none; }
`;

// ── Minimal OOXML (.docx) writer — stored zip, no dependencies ──

const _CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

function _crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = _CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/** Zip entries with method 0 (stored) — valid OOXML, no compression needed. */
function zipStore(files) {
  const enc     = new TextEncoder();
  const local   = [];
  const central = [];
  let offset    = 0;

  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;

  for (const f of files) {
    const name = enc.encode(f.name);
    const data = f.data;
    const crc  = _crc32(data);

    const lh = new Uint8Array(30 + name.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);          // UTF-8 names
    lv.setUint16(8, 0, true);               // stored
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    lh.set(name, 30);
    local.push(lh, data);

    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    cd.set(name, 46);
    central.push(cd);

    offset += lh.length + data.length;
  }

  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const eocd   = new Uint8Array(22);
  const ev     = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  return new Blob([...local, ...central, eocd],
    { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

function escXml(s) {
  return String(s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function _docxRuns(text, style = {}) {
  return inlineParts(text).map(p => {
    const props = [];
    if (p.bold   || style.bold)   props.push("<w:b/>");
    if (p.italic || style.italic) props.push("<w:i/>");
    if (p.mono   || style.mono)   props.push('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>');
    if (style.size)               props.push(`<w:sz w:val="${style.size}"/><w:szCs w:val="${style.size}"/>`);
    if (style.color)              props.push(`<w:color w:val="${style.color}"/>`);
    const rpr = props.length ? `<w:rPr>${props.join("")}</w:rPr>` : "";
    return `<w:r>${rpr}<w:t xml:space="preserve">${escXml(p.text)}</w:t></w:r>`;
  }).join("");
}

function _docxP(text, opts = {}) {
  const ppr = [`<w:spacing w:after="${opts.spacingAfter === undefined ? 120 : opts.spacingAfter}"/>`];
  if (opts.indent) ppr.push(`<w:ind w:left="${opts.indent}"/>`);
  return `<w:p><w:pPr>${ppr.join("")}</w:pPr>${_docxRuns(text, opts.style || {})}</w:p>`;
}

function _docxCode(text) {
  return String(text).split("\n").map(line =>
    '<w:p><w:pPr><w:spacing w:after="0"/><w:ind w:left="240"/>' +
    '<w:shd w:val="clear" w:color="auto" w:fill="F4F4F4"/></w:pPr>' +
    '<w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="18"/></w:rPr>' +
    `<w:t xml:space="preserve">${escXml(line || " ")}</w:t></w:r></w:p>`).join("") +
    _docxP("", { spacingAfter: 80 });
}

function _docxTable(rows) {
  const cols  = Math.max(...rows.map(r => r.length));
  const total = 9638;                       // A4 width minus margins, in twips
  const colW  = Math.floor(total / cols);
  const grid  = "<w:tblGrid>" +
    Array.from({ length: cols }, () => `<w:gridCol w:w="${colW}"/>`).join("") + "</w:tblGrid>";
  const edge = '<w:%s w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>';
  const borders = "<w:tblBorders>" +
    ["top", "left", "bottom", "right", "insideH", "insideV"].map(e => edge.replace("%s", e)).join("") +
    "</w:tblBorders>";

  const trs = rows.map((r, ri) => {
    const trPr = ri === 0 ? "<w:trPr><w:tblHeader/></w:trPr>" : "";
    const cells = [];
    for (let c = 0; c < cols; c++) {
      const shade = ri === 0 ? '<w:shd w:val="clear" w:color="auto" w:fill="EFEFEF"/>' : "";
      const style = ri === 0 ? { bold: true, size: 18 } : { size: 18 };
      cells.push('<w:tc><w:tcPr><w:tcW w:w="' + colW + '" w:type="dxa"/>' + shade + "</w:tcPr>" +
        '<w:p><w:pPr><w:spacing w:after="40"/></w:pPr>' +
        _docxRuns(r[c] || "", style) + "</w:p></w:tc>");
    }
    return `<w:tr>${trPr}${cells.join("")}</w:tr>`;
  }).join("");

  return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/>` +
    `<w:tblLayout w:type="fixed"/>${borders}</w:tblPr>${grid}${trs}</w:tbl><w:p/>`;
}

/** Block list → a complete .docx Blob. */
function buildDocxBlob(blocks, title) {
  const body = [];
  body.push(_docxP(title, { style: { bold: true, size: 40 }, spacingAfter: 60 }));
  body.push(_docxP(
    "Dev AI System · " + new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    { style: { size: 18, color: "777777" }, spacingAfter: 300 }));

  let skipped = false;
  for (const b of blocks) {
    if (!skipped && b.type === "heading" && b.level === 1) { skipped = true; continue; }
    switch (b.type) {
      case "heading":
        body.push(_docxP(b.text, {
          style: { bold: true, size: b.level === 2 ? 28 : b.level === 3 ? 24 : 22 },
          spacingAfter: b.level === 2 ? 120 : 80,
        }));
        break;
      case "para":  body.push(_docxP(b.text)); break;
      case "quote": body.push(_docxP(b.text, { style: { italic: true, color: "555555" }, indent: 360 })); break;
      case "code":  body.push(_docxCode(b.text)); break;
      case "hr":    body.push(_docxP("", { spacingAfter: 60 })); break;
      case "list":
        b.items.forEach((it, idx) =>
          body.push(_docxP((b.ordered ? (idx + 1) + ". " : "• ") + it, { indent: 360, spacingAfter: 60 })));
        break;
      case "table": body.push(_docxTable(b.rows)); break;
    }
  }

  const documentXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    body.join("") +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" ' +
    'w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>' +
    "</w:body></w:document>";

  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    "</Types>";

  const rels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    "</Relationships>";

  const enc = new TextEncoder();
  return zipStore([
    { name: "[Content_Types].xml", data: enc.encode(contentTypes) },
    { name: "_rels/.rels",         data: enc.encode(rels) },
    { name: "word/document.xml",   data: enc.encode(documentXml) },
  ]);
}

// ── Shared helpers for both exports ───────────────────────────

function _cardMarkdown(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  const md = el._raw || el.innerText || el.textContent || "";
  return md.trim() ? md : null;
}

function _docTitle(blocks, fallback) {
  const h = blocks.find(b => b.type === "heading" && b.level === 1);
  if (h) return h.text.replace(/[*`]/g, "").trim();
  const p = blocks.find(b => b.type === "para");
  if (p) return p.text.replace(/[*`]/g, "").trim().slice(0, 70);
  return fallback;
}

function _slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 60) || "document";
}

function _download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
}

/** PDF: hand the document to the browser's print pipeline. */
function exportPdf(id) {
  const md = _cardMarkdown(id);
  if (!md) { alert("⚠ Nothing to export yet — run a prompt first."); return; }

  const blocks = parseDocMarkdown(md);
  const title  = _docTitle(blocks, "Dev AI Document");
  const stamp  = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  const html =
    '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    `<title>${escHtml(title)}</title><style>${DOC_PRINT_CSS}</style></head><body>` +
    `<h1>${escHtml(title)}</h1>` +
    `<div class="doc-meta">Dev AI System &middot; ${escHtml(stamp)}</div>` +
    blocksToHtml(blocks, { skipFirstHeading: true }) +
    "</body></html>";

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText =
    "position:fixed;left:-10000px;top:0;width:820px;height:1060px;border:0;visibility:hidden;";
  document.body.appendChild(frame);

  const doc = frame.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  setTimeout(() => {
    try { frame.contentWindow.focus(); frame.contentWindow.print(); }
    catch (err) { alert("⚠ Could not open the print dialog: " + err.message); }
    setTimeout(() => frame.remove(), 60000);
  }, 300);
}

/** DOCX: build the file in-page and download it. */
function exportDocx(id) {
  const md = _cardMarkdown(id);
  if (!md) { alert("⚠ Nothing to export yet — run a prompt first."); return; }

  try {
    const blocks = parseDocMarkdown(md);
    const title  = _docTitle(blocks, "Dev AI Document");
    _download(buildDocxBlob(blocks, title), _slug(title) + ".docx");
  } catch (err) {
    alert("⚠ Could not build the .docx: " + err.message);
  }
}

// ─────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────
console.info(`[Dev AI System] build ${APP_VERSION} loaded`);

if (!document.getElementById("nav-panel") || !document.getElementById("nav-toggle")) {
  console.warn("[Dev AI System] navigation markup missing — index.html and script.js are " +
               "from different builds. Re-deploy both.");
}

loadKeys();
renderSidebarModels();
updateProviderBadge();
maybePromptForKeys();

/** On a fresh browser, open the keys panel so a first-time visitor knows where to start. */
function maybePromptForKeys() {
  if (PROVIDER_CHAIN.some(p => isProviderConfigured(p))) return;
  try {
    if (sessionStorage.getItem("devai.keysPrompted") === "1") return;
    sessionStorage.setItem("devai.keysPrompted", "1");
  } catch (_) { /* sessionStorage blocked — still worth prompting */ }
  setTimeout(openKeysModal, 700);
}