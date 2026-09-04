const TABLE_LIMIT = 12;
const STATUSES = [
  { value: "not-arrived", label: "Not Arrived" },
  { value: "checked-in", label: "Checked In" },
  { value: "seated", label: "Seated" },
  { value: "no-show", label: "No Show" }
];
const VIP_CATEGORIES = [
  { value: "sponsor", label: "Sponsor" },
  { value: "head-of-table", label: "Head of Table" }
];

const defaultState = {
  eventName: "VIP Guest Registration",
  logoDataUrl: "",
  tables: [{ id: "default-sponsors", name: "Sponsors" }],
  guests: []
};

let state = structuredClone(defaultState);

const elements = {
  logoFrame: document.querySelector("#logoFrame"),
  eventTitle: document.querySelector("#eventTitle"),
  search: document.querySelector("#checkinSearch"),
  stats: document.querySelector("#checkinStats"),
  list: document.querySelector("#checkinList")
};

async function loadState() {
  return window.vipDatabase.loadState(defaultState, normalizeState);
}

async function saveState() {
  state = await window.vipDatabase.saveState(state, normalizeState);
}

function normalizeState(rawState) {
  return {
    ...structuredClone(defaultState),
    ...rawState,
    tables: rawState?.tables?.length ? rawState.tables : structuredClone(defaultState.tables),
    guests: normalizeGuests(rawState?.guests || [])
  };
}

function normalizeGuests(guests) {
  return guests.map((guest) => {
    const status = normalizeStatus(guest.status || (guest.checkedIn ? "checked-in" : "not-arrived"));
    return {
      ...guest,
      seatNumber: normalizeSeatNumber(guest.seatNumber),
      category: normalizeCategory(guest.category),
      status,
      checkedIn: status === "checked-in",
      checkedInAt: status === "checked-in" ? guest.checkedInAt || guest.updatedAt || new Date().toISOString() : guest.checkedInAt || "",
      notes: String(guest.notes || "").trim()
    };
  });
}

function normalizeSeatNumber(value) {
  const seat = Number.parseInt(value, 10);
  return Number.isInteger(seat) && seat >= 1 && seat <= TABLE_LIMIT ? seat : null;
}

function normalizeStatus(status = "not-arrived") {
  const normalized = String(status).trim().toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
  if (["checked", "checked-in", "check-in", "yes", "true", "1"].includes(normalized)) return "checked-in";
  if (["seated", "seat"].includes(normalized)) return "seated";
  if (["no-show", "noshow", "no"].includes(normalized)) return "no-show";
  return "not-arrived";
}

function statusLabel(value) {
  return STATUSES.find((status) => status.value === normalizeStatus(value))?.label || "Not Arrived";
}

function setGuestStatus(guest, status) {
  const nextStatus = normalizeStatus(status);
  const wasCheckedIn = guest.status === "checked-in";
  guest.status = nextStatus;
  guest.checkedIn = nextStatus === "checked-in";
  guest.updatedAt = new Date().toISOString();

  if (nextStatus === "checked-in" && !wasCheckedIn) {
    guest.checkedInAt = guest.updatedAt;
  }

  if (["not-arrived", "no-show"].includes(nextStatus)) {
    guest.checkedInAt = "";
  }
}

function normalizeCategory(category = "sponsor") {
  const normalized = String(category).trim().toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
  if (["head-of-table", "head-table", "table-head", "hot"].includes(normalized)) return "head-of-table";
  return "sponsor";
}

function categoryLabel(value) {
  return VIP_CATEGORIES.find((category) => category.value === normalizeCategory(value))?.label || "Sponsor";
}

function formatTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

async function render() {
  state = await loadState();
  renderBranding();
  renderStats();
  renderList();
}

function renderBranding() {
  elements.eventTitle.textContent = `${state.eventName} Check-in`;
  elements.logoFrame.replaceChildren();

  if (isSafeImageDataUrl(state.logoDataUrl)) {
    const image = document.createElement("img");
    image.alt = "";
    image.src = state.logoDataUrl;
    elements.logoFrame.append(image);
    return;
  }

  const fallback = document.createElement("span");
  fallback.textContent = "VIP";
  elements.logoFrame.append(fallback);
}

function renderStats() {
  const checkedIn = state.guests.filter((guest) => guest.status === "checked-in").length;
  const seated = state.guests.filter((guest) => guest.status === "seated").length;
  const notArrived = state.guests.filter((guest) => guest.status === "not-arrived").length;
  const noShow = state.guests.filter((guest) => guest.status === "no-show").length;
  elements.stats.innerHTML = `
    <article><strong>${state.guests.length}</strong><span>Total VIPs</span></article>
    <article><strong>${notArrived}</strong><span>Not Arrived</span></article>
    <article><strong>${checkedIn}</strong><span>Checked In</span></article>
    <article><strong>${seated}</strong><span>Seated</span></article>
    <article><strong>${noShow}</strong><span>No Show</span></article>
  `;
}

function renderList() {
  const query = elements.search.value.trim().toLowerCase();
  const guests = state.guests.filter((guest) => {
    const table = tableForGuest(guest);
    return !query ||
      guest.name.toLowerCase().includes(query) ||
      table.name.toLowerCase().includes(query) ||
      String(displaySeatNumber(guest) || "").includes(query) ||
      categoryLabel(guest.category).toLowerCase().includes(query) ||
      statusLabel(guest.status).toLowerCase().includes(query) ||
      guest.notes.toLowerCase().includes(query);
  });

  elements.list.innerHTML = "";

  if (!guests.length) {
    elements.list.innerHTML = `<div class="empty-state">No guests match that search.</div>`;
    return;
  }

  guests
    .sort((first, second) => statusSort(first.status) - statusSort(second.status) || first.name.localeCompare(second.name))
    .forEach((guest) => {
      const table = tableForGuest(guest);
      const row = document.createElement("article");
      row.className = `checkin-row status-${guest.status}`;
      row.innerHTML = `
        <div>
          <strong>${escapeHtml(guest.name)}</strong>
          <span>${escapeHtml(table.name)} · Seat ${displaySeatNumber(guest) || "-"} · ${categoryLabel(guest.category)} · ${statusLabel(guest.status)}${guest.checkedInAt ? ` · ${formatTimestamp(guest.checkedInAt)}` : ""}${guest.notes ? ` · ${escapeHtml(guest.notes)}` : ""}</span>
        </div>
        <div class="status-button-group">
          ${STATUSES.map((status) => `
            <button class="${guest.status === status.value ? "primary-button" : "ghost-button"}" data-status="${status.value}" type="button">
              ${status.label}
            </button>
          `).join("")}
        </div>
      `;

      row.querySelectorAll("[data-status]").forEach((button) => {
        button.addEventListener("click", () => {
          setGuestStatus(guest, button.dataset.status);
          saveState()
            .then(() => {
              renderStats();
              renderList();
            })
            .catch((error) => alert(error.message || "Unable to save check-in status."));
        });
      });

      elements.list.append(row);
    });
}

function statusSort(status) {
  return STATUSES.findIndex((item) => item.value === normalizeStatus(status));
}

function tableForGuest(guest) {
  return state.tables.find((table) => table.id === guest.tableId) || { name: "Unassigned" };
}

function displaySeatNumber(guest) {
  if (guest.seatNumber) return guest.seatNumber;
  return state.guests.filter((item) => item.tableId === guest.tableId).findIndex((item) => item.id === guest.id) + 1;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char];
  });
}

function isSafeImageDataUrl(value) {
  return /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(String(value || ""));
}

elements.search.addEventListener("input", renderList);
window.addEventListener("focus", render);
window.addEventListener("pageshow", render);
window.addEventListener(window.vipDatabase.changeEvent, render);

render();
