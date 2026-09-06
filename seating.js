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
const TABLE_COLORS = [
  { name: "Purple", value: "#6a1b9a" },
  { name: "Gold", value: "#d4af37" },
  { name: "Kelly Green", value: "#4cbb17" },
  { name: "Goldenrod", value: "#daa520" },
  { name: "Pantone Yellow", value: "#fedf00" },
  { name: "Neon Orange", value: "#ff5f1f" },
  { name: "Cranberry", value: "#9f1d35" },
  { name: "Neon Red", value: "#ff073a" },
  { name: "Neon Yellow", value: "#ffff33" },
  { name: "Neon Blue", value: "#1f51ff" },
  { name: "Sky Blue", value: "#87ceeb" },
  { name: "Aqua", value: "#00ffff" },
  { name: "Silver", value: "#c0c0c0" },
  { name: "Caribbean Blue", value: "#00cc99" },
  { name: "Neon Pink", value: "#ff10f0" },
  { name: "Berry", value: "#8a2f61" },
  { name: "White", value: "#ffffff" },
  { name: "Coral Red", value: "#ff4040" },
  { name: "Neon Green", value: "#39ff14" },
  { name: "Pantone Purple", value: "#bb29bb" }
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
  seatingSummary: document.querySelector("#seatingSummary"),
  colorLegend: document.querySelector("#colorLegend"),
  globalSearchInput: document.querySelector("#globalSearchInput"),
  tableOccupancyFilter: document.querySelector("#tableOccupancyFilter"),
  floorPlan: document.querySelector("#floorPlan"),
  refreshButton: document.querySelector("#refreshButton"),
  fullscreenButton: document.querySelector("#fullscreenButton"),
  printButton: document.querySelector("#printButton")
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
  renderBranding(state);
  renderSummary(state);
  renderLegend(state);
  renderFloorPlan(state);
  updateFullscreenButton();
}

function renderBranding(state) {
  elements.eventTitle.textContent = state.eventName;
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

function renderSummary(state) {
  const totalSeats = state.tables.length * TABLE_LIMIT;
  const occupiedSeats = state.guests.length;
  const checkedIn = state.guests.filter((guest) => guest.status === "checked-in").length;
  const seated = state.guests.filter((guest) => guest.status === "seated").length;
  const noShow = state.guests.filter((guest) => guest.status === "no-show").length;
  const fullTables = state.tables.filter((table) => guestsAtTable(state, table.id).length >= TABLE_LIMIT).length;

  elements.seatingSummary.innerHTML = [
    ["Tables", state.tables.length],
    ["Occupied Seats", occupiedSeats],
    ["Open Seats", totalSeats - occupiedSeats],
    ["Checked In", checkedIn],
    ["Seated", seated],
    ["No Show", noShow],
    ["Full Tables", fullTables]
  ]
    .map(([label, value]) => `<article class="summary-item"><strong>${value}</strong><span>${label}</span></article>`)
    .join("");
}

function renderLegend(state) {
  if (!state.tables.length) {
    elements.colorLegend.innerHTML = "";
    return;
  }

  elements.colorLegend.innerHTML = `
    <div class="legend-heading">
      <div>
        <p class="eyebrow">Legend</p>
        <h2>Table Colors</h2>
      </div>
      <span>${state.tables.length} table${state.tables.length === 1 ? "" : "s"}</span>
    </div>
    <div class="legend-grid">
      ${state.tables.map((table, index) => {
        const color = tableColor(index);
        return `
          <button class="legend-item" data-table-id="${escapeHtml(table.id)}" type="button" aria-label="Go to ${escapeHtml(table.name)} color-coded ${escapeHtml(color.name)} table">
            <span class="legend-swatch" style="--table-color: ${color.value}; --table-border: ${color.name === "White" ? "#8f805e" : color.value};"></span>
            <div>
              <strong>${escapeHtml(table.name)}</strong>
              <span>${escapeHtml(color.name)} · ${escapeHtml(color.value)}</span>
            </div>
          </button>
        `;
      }).join("")}
    </div>
  `;

  elements.colorLegend.querySelectorAll(".legend-item").forEach((item) => {
    item.addEventListener("click", () => focusTableFromLegend(item.dataset.tableId));
  });
}

function renderFloorPlan(state) {
  elements.floorPlan.innerHTML = "";

  const search = elements.globalSearchInput.value.trim().toLowerCase();
  const visibleTables = state.tables.filter((table) => tableMatchesOccupancy(table.id) && tableMatchesSearch(table, search));

  if (!visibleTables.length) {
    elements.floorPlan.innerHTML = `<div class="empty-state">No tables have been created yet.</div>`;
    return;
  }

  visibleTables.forEach((table) => {
    const tableIndex = state.tables.findIndex((item) => item.id === table.id);
    const guests = guestsAtTable(state, table.id);
    const color = tableColor(tableIndex);
    const tableElement = document.createElement("article");
    tableElement.className = "visual-table";
    tableElement.id = `table-${table.id}`;
    tableElement.dataset.tableId = table.id;
    tableElement.dataset.tableColor = color.value;
    tableElement.dataset.tableColorName = color.name;
    setTableColor(tableElement, color);

    tableElement.innerHTML = `
      <div class="visual-table-center">
        <p class="eyebrow">Table</p>
        <h2>${escapeHtml(table.name)}</h2>
        <span>${guests.length}/${TABLE_LIMIT} seats</span>
        <small>${escapeHtml(color.name)}</small>
      </div>
      <div class="visual-seats">
        ${renderSeats(guests)}
      </div>
    `;

    tableElement.addEventListener("dragover", (event) => {
      event.preventDefault();
      tableElement.classList.add("is-drop-target");
    });
    tableElement.addEventListener("dragleave", () => tableElement.classList.remove("is-drop-target"));
    tableElement.addEventListener("drop", (event) => {
      event.preventDefault();
      tableElement.classList.remove("is-drop-target");
      moveGuestToTable(event.dataTransfer.getData("text/plain"), table.id);
    });

    elements.floorPlan.append(tableElement);
  });
}

function focusTableFromLegend(tableId) {
  const table = [...elements.floorPlan.querySelectorAll(".visual-table")]
    .find((item) => item.dataset.tableId === tableId);
  if (!table) return;

  table.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  table.classList.remove("is-legend-target");
  window.requestAnimationFrame(() => {
    table.classList.add("is-legend-target");
    window.setTimeout(() => table.classList.remove("is-legend-target"), 1800);
  });
}

function renderSeats(guests) {
  const seatsByNumber = new Map();
  const unseatedGuests = [];
  guests.forEach((guest) => {
    if (guest.seatNumber && !seatsByNumber.has(guest.seatNumber)) {
      seatsByNumber.set(guest.seatNumber, guest);
    } else {
      unseatedGuests.push(guest);
    }
  });

  return Array.from({ length: TABLE_LIMIT }, (_, index) => {
    const seatNumber = index + 1;
    const guest = seatsByNumber.get(seatNumber) || unseatedGuests.shift();
    const filledClass = guest ? "is-filled" : "is-open";
    const statusClass = guest ? `status-${guest.status}` : "";
    const label = guest ? escapeHtml(guest.name) : "Open";
    const notes = guest?.notes ? ` - ${guest.notes}` : "";
    const details = guest ? `${statusLabel(guest.status)}${guest.checkedInAt ? ` - ${formatTimestamp(guest.checkedInAt)}` : ""}${notes}` : "Open seat";

    return `
      <div
        class="visual-seat seat-${seatNumber} ${filledClass} ${statusClass}"
        ${guest ? `draggable="true" data-guest-id="${escapeHtml(guest.id)}"` : ""}
        title="Seat ${seatNumber}: ${label} - ${escapeHtml(details)}"
      >
        <span class="seat-number">${seatNumber}</span>
        <span class="seat-label">${label}</span>
        ${guest ? `<span class="seat-status">${statusLabel(guest.status)}</span>` : ""}
      </div>
    `;
  }).join("");
}

async function moveGuestToTable(guestId, tableId) {
  const guest = state.guests.find((item) => item.id === guestId);
  const table = state.tables.find((item) => item.id === tableId);
  if (!guest || !table || guest.tableId === tableId) return;

  if (guestsAtTable(state, tableId).length >= TABLE_LIMIT) {
    alert(`${table.name} is already full.`);
    return;
  }

  guest.tableId = tableId;
  guest.seatNumber = nextOpenSeat(tableId, guest.id);
  try {
    await saveState();
    await render();
  } catch (error) {
    alert(error.message || "Unable to save seating change.");
  }
}

function guestsAtTable(state, tableId) {
  return state.guests.filter((guest) => guest.tableId === tableId);
}

function guestMatchesSearch(guest, search) {
  if (!search) return true;
  const table = state.tables.find((item) => item.id === guest.tableId);
  return [
    guest.name,
    table?.name || "Unassigned",
    String(guest.seatNumber || ""),
    categoryLabel(guest.category),
    statusLabel(guest.status),
    guest.notes || ""
  ].some((value) => String(value).toLowerCase().includes(search));
}

function tableMatchesSearch(table, search) {
  if (!search) return true;
  const guests = guestsAtTable(state, table.id);
  return table.name.toLowerCase().includes(search) || guests.some((guest) => guestMatchesSearch(guest, search));
}

function nextOpenSeat(tableId, ignoredGuestId = "") {
  const taken = new Set(
    state.guests
      .filter((guest) => guest.tableId === tableId && guest.id !== ignoredGuestId && guest.seatNumber)
      .map((guest) => guest.seatNumber)
  );
  return Array.from({ length: TABLE_LIMIT }, (_, index) => index + 1).find((seat) => !taken.has(seat)) || null;
}

function isFullTable(tableId) {
  return guestsAtTable(state, tableId).length >= TABLE_LIMIT;
}

function tableMatchesOccupancy(tableId) {
  const filter = elements.tableOccupancyFilter.value;
  if (filter === "full") return isFullTable(tableId);
  if (filter === "open") return !isFullTable(tableId);
  return true;
}

function tableColor(index) {
  return TABLE_COLORS[index % TABLE_COLORS.length];
}

function setTableColor(element, color) {
  element.style.setProperty("--table-color", color.value);
  element.style.setProperty("--table-border", color.name === "White" ? "#8f805e" : color.value);
  element.style.setProperty("--table-text", readableTextColor(color.value));
}

function readableTextColor(hexColor) {
  const whiteContrast = contrastRatio("#ffffff", hexColor);
  const darkContrast = contrastRatio("#000000", hexColor);
  return whiteContrast > darkContrast ? "#ffffff" : "#000000";
}

function contrastRatio(firstColor, secondColor) {
  const firstLuminance = relativeLuminance(firstColor);
  const secondLuminance = relativeLuminance(secondColor);
  return (Math.max(firstLuminance, secondLuminance) + 0.05) / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

function relativeLuminance(hexColor) {
  const hex = hexColor.replace("#", "");
  const red = parseInt(hex.slice(0, 2), 16) / 255;
  const green = parseInt(hex.slice(2, 4), 16) / 255;
  const blue = parseInt(hex.slice(4, 6), 16) / 255;
  return 0.2126 * normalizeColor(red) + 0.7152 * normalizeColor(green) + 0.0722 * normalizeColor(blue);
}

function normalizeColor(value) {
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

async function toggleFullscreen() {
  if (!document.fullscreenElement) {
    await elements.floorPlan.requestFullscreen();
  } else {
    await document.exitFullscreen();
  }
  updateFullscreenButton();
}

function updateFullscreenButton() {
  elements.fullscreenButton.textContent = document.fullscreenElement ? "Exit Fullscreen" : "Fullscreen";
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

elements.refreshButton.addEventListener("click", render);
elements.globalSearchInput.addEventListener("input", () => renderFloorPlan(state));
elements.printButton.addEventListener("click", () => window.print());
elements.fullscreenButton.addEventListener("click", () => {
  toggleFullscreen().catch(() => alert("Fullscreen mode is not available in this browser."));
});
elements.tableOccupancyFilter.addEventListener("change", () => renderFloorPlan(state));
elements.floorPlan.addEventListener("dragstart", (event) => {
  const seat = event.target.closest(".visual-seat.is-filled");
  if (!seat) return;
  event.dataTransfer.setData("text/plain", seat.dataset.guestId);
  event.dataTransfer.effectAllowed = "move";
});
window.addEventListener("focus", render);
window.addEventListener("pageshow", render);
window.addEventListener(window.vipDatabase.changeEvent, render);
document.addEventListener("fullscreenchange", updateFullscreenButton);

render();
