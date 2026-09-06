const VIP_DATABASE_NAME = "vip-guest-registration-db";
const VIP_DATABASE_VERSION = 1;
const VIP_STATE_STORE = "state";
const VIP_STATE_KEY = "event";
const VIP_LEGACY_STORAGE_KEY = "vip-event-registration-v1";
const VIP_CHANGE_EVENT = "vip-database-change";
const VIP_AUTH_EVENT = "vip-auth-change";
const VIP_AUTH_STORAGE_KEY = "vip-staff-session-v1";
const VIP_CONFIG_ENDPOINT = "/api/config";

let vipDatabasePromise = null;
let vipConfigPromise = null;
let vipAuthPromptPromise = null;
const vipBroadcastChannel = "BroadcastChannel" in window ? new BroadcastChannel("vip-guest-registration") : null;

function openVipDatabase() {
  if (vipDatabasePromise) return vipDatabasePromise;

  vipDatabasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(VIP_DATABASE_NAME, VIP_DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(VIP_STATE_STORE)) {
        database.createObjectStore(VIP_STATE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open the VIP registration database."));
  });

  return vipDatabasePromise;
}

async function readVipStateRecord() {
  const database = await openVipDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(VIP_STATE_STORE, "readonly");
    const request = transaction.objectStore(VIP_STATE_STORE).get(VIP_STATE_KEY);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("Unable to read VIP registration data."));
  });
}

async function writeVipStateRecord(state) {
  const database = await openVipDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(VIP_STATE_STORE, "readwrite");
    const request = transaction.objectStore(VIP_STATE_STORE).put(structuredClone(state), VIP_STATE_KEY);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("Unable to save VIP registration data."));
  });
}

function readLegacyVipState() {
  const saved = localStorage.getItem(VIP_LEGACY_STORAGE_KEY);
  if (!saved) return null;

  try {
    return JSON.parse(saved);
  } catch {
    return null;
  }
}

function notifyVipDatabaseChanged() {
  vipBroadcastChannel?.postMessage({ type: "state-changed", at: Date.now() });
  localStorage.setItem(`${VIP_LEGACY_STORAGE_KEY}-changed-at`, String(Date.now()));
}

function notifyVipAuthChanged() {
  window.dispatchEvent(new Event(VIP_AUTH_EVENT));
}

async function loadVipConfig() {
  if (vipConfigPromise) return vipConfigPromise;

  vipConfigPromise = (async () => {
    if (window.VIP_SUPABASE_CONFIG?.url && window.VIP_SUPABASE_CONFIG?.anonKey) {
      return normalizeVipConfig(window.VIP_SUPABASE_CONFIG);
    }

    try {
      const response = await fetch(VIP_CONFIG_ENDPOINT, { cache: "no-store" });
      if (!response.ok) return { enabled: false };
      return normalizeVipConfig(await response.json());
    } catch {
      return { enabled: false };
    }
  })();

  return vipConfigPromise;
}

function normalizeVipConfig(config = {}) {
  const url = String(config.url || "").trim().replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
  const anonKey = String(config.anonKey || "").trim();
  const eventId = String(config.eventId || "default").trim() || "default";
  return {
    enabled: Boolean(url && anonKey),
    url,
    anonKey,
    eventId
  };
}

function readStoredVipSession() {
  try {
    return JSON.parse(localStorage.getItem(VIP_AUTH_STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

function writeStoredVipSession(session) {
  localStorage.setItem(VIP_AUTH_STORAGE_KEY, JSON.stringify(session));
  notifyVipAuthChanged();
}

function clearStoredVipSession() {
  localStorage.removeItem(VIP_AUTH_STORAGE_KEY);
  notifyVipAuthChanged();
}

function normalizeVipSession(payload) {
  const expiresIn = Number(payload.expires_in || 3600);
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: Date.now() + Math.max(expiresIn - 60, 60) * 1000,
    email: payload.user?.email || ""
  };
}

function decodeVipJwt(token) {
  try {
    const payload = token.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return {};
  }
}

function isAuthenticatedVipSession(session) {
  return decodeVipJwt(session?.accessToken || "").role === "authenticated";
}

function hasValidVipSession(session) {
  return Boolean(
    session?.accessToken &&
    session?.refreshToken &&
    session.expiresAt > Date.now() &&
    isAuthenticatedVipSession(session)
  );
}

async function refreshVipSession(config, session) {
  if (!session?.refreshToken) return null;

  const response = await fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ refresh_token: session.refreshToken })
  });

  if (!response.ok) {
    clearStoredVipSession();
    return null;
  }

  const nextSession = normalizeVipSession(await response.json());
  if (!isAuthenticatedVipSession(nextSession)) {
    clearStoredVipSession();
    return null;
  }

  writeStoredVipSession(nextSession);
  return nextSession;
}

async function signInVipStaff(config, email, password) {
  const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });

  if (!response.ok) {
    throw new Error(await supabaseErrorMessage(response, "Unable to sign in with"));
  }

  const session = normalizeVipSession(await response.json());
  if (!isAuthenticatedVipSession(session)) {
    throw new Error("That account is not allowed to access the VIP staff console.");
  }

  writeStoredVipSession(session);
  return session;
}

async function getVipStaffSession(config) {
  const session = readStoredVipSession();
  if (hasValidVipSession(session)) return session;
  return refreshVipSession(config, session);
}

function showVipStaffSignIn(config) {
  if (vipAuthPromptPromise) return vipAuthPromptPromise;

  vipAuthPromptPromise = new Promise((resolve) => {
    const shell = document.createElement("div");
    shell.className = "staff-auth-shell";
    shell.innerHTML = `
      <form class="staff-auth-panel">
        <div>
          <p class="eyebrow">Staff Access</p>
          <h1>Sign In</h1>
        </div>
        <label>
          Email
          <input name="email" type="email" autocomplete="email" required />
        </label>
        <label>
          Password
          <input name="password" type="password" autocomplete="current-password" required />
        </label>
        <button class="primary-button" type="submit">Sign In</button>
        <p class="staff-auth-error" role="alert"></p>
      </form>
    `;

    const form = shell.querySelector("form");
    const error = shell.querySelector(".staff-auth-error");
    document.body.append(shell);
    form.email.focus();

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      error.textContent = "";
      form.querySelector("button").disabled = true;

      try {
        const session = await signInVipStaff(config, form.email.value.trim(), form.password.value);
        shell.remove();
        vipAuthPromptPromise = null;
        renderVipStaffSessionButton(session);
        resolve(session);
      } catch (signInError) {
        error.textContent = signInError.message;
        form.querySelector("button").disabled = false;
      }
    });
  });

  return vipAuthPromptPromise;
}

async function requireVipStaffSession(config) {
  const session = await getVipStaffSession(config);
  if (session) {
    renderVipStaffSessionButton(session);
    return session;
  }

  return showVipStaffSignIn(config);
}

function renderVipStaffSessionButton(session) {
  if (document.querySelector(".staff-session-button")) return;

  const button = document.createElement("button");
  button.className = "staff-session-button";
  button.type = "button";
  button.textContent = session.email ? `Sign Out ${session.email}` : "Sign Out";
  button.addEventListener("click", async () => {
    await window.vipDatabase.signOut();
    window.location.reload();
  });
  document.body.append(button);
}

async function supabaseErrorMessage(response, action) {
  let detail = "";

  try {
    const body = await response.json();
    detail = body.message || body.hint || body.details || body.code || "";
  } catch {
    try {
      detail = await response.text();
    } catch {
      detail = "";
    }
  }

  return `${action} Supabase. Status ${response.status}${detail ? `: ${detail}` : "."}`;
}

function supabaseHeaders(config, session, extraHeaders = {}) {
  return {
    apikey: config.anonKey,
    Authorization: `Bearer ${session.accessToken}`,
    "Content-Type": "application/json",
    ...extraHeaders
  };
}

async function readSupabaseState(config, session) {
  const query = new URLSearchParams({
    event_id: `eq.${config.eventId}`,
    select: "data"
  });
  const response = await fetch(`${config.url}/rest/v1/vip_event_state?${query}`, {
    headers: supabaseHeaders(config, session)
  });

  if (!response.ok) {
    throw new Error(await supabaseErrorMessage(response, "Unable to read VIP registration data from"));
  }

  const rows = await response.json();
  return rows[0]?.data || null;
}

async function writeSupabaseState(config, session, state) {
  const query = new URLSearchParams({ on_conflict: "event_id" });
  const response = await fetch(`${config.url}/rest/v1/vip_event_state?${query}`, {
    method: "POST",
    headers: supabaseHeaders(config, session, { Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({
      event_id: config.eventId,
      event_name: state.eventName,
      data: state,
      updated_at: new Date().toISOString()
    })
  });

  if (!response.ok) {
    throw new Error(await supabaseErrorMessage(response, "Unable to save VIP registration data to"));
  }
}

vipBroadcastChannel?.addEventListener("message", (event) => {
  if (event.data?.type === "state-changed") {
    window.dispatchEvent(new Event(VIP_CHANGE_EVENT));
  }
});

window.addEventListener("storage", (event) => {
  if (event.key === `${VIP_LEGACY_STORAGE_KEY}-changed-at`) {
    window.dispatchEvent(new Event(VIP_CHANGE_EVENT));
  }
});

window.vipDatabase = {
  legacyStorageKey: VIP_LEGACY_STORAGE_KEY,
  changeEvent: VIP_CHANGE_EVENT,
  authEvent: VIP_AUTH_EVENT,

  async signOut() {
    const config = await loadVipConfig();
    const session = readStoredVipSession();

    if (config.enabled && session?.accessToken) {
      await fetch(`${config.url}/auth/v1/logout`, {
        method: "POST",
        headers: supabaseHeaders(config, session)
      }).catch(() => {});
    }

    clearStoredVipSession();
  },

  async loadState(defaultState, normalizeState) {
    const config = await loadVipConfig();
    const savedState = await readVipStateRecord();

    if (config.enabled) {
      const session = await requireVipStaffSession(config);
      const cloudState = await readSupabaseState(config, session);
      if (cloudState) {
        const nextState = normalizeState(cloudState);
        await writeVipStateRecord(nextState);
        return nextState;
      }

      const nextState = normalizeState(savedState || readLegacyVipState() || defaultState);
      await writeSupabaseState(config, session, nextState);
      await writeVipStateRecord(nextState);
      return structuredClone(nextState);
    }

    if (savedState) return normalizeState(savedState);

    const legacyState = readLegacyVipState();
    const nextState = normalizeState(legacyState || defaultState);
    await writeVipStateRecord(nextState);
    return structuredClone(nextState);
  },

  async saveState(state, normalizeState) {
    const config = await loadVipConfig();
    const nextState = normalizeState(state);

    if (config.enabled) {
      const session = await requireVipStaffSession(config);
      await writeSupabaseState(config, session, nextState);
    }

    await writeVipStateRecord(nextState);
    notifyVipDatabaseChanged();
    return structuredClone(nextState);
  }
};
