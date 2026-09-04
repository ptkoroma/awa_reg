const TABLE_LIMIT = 12;
const STATUSES = [
  { value: "not-arrived", label: "Not Arrived", color: "#2563eb" },
  { value: "checked-in", label: "Checked In", color: "#16a34a" },
  { value: "seated", label: "Seated", color: "#facc15" },
  { value: "no-show", label: "No Show", color: "#dc2626" }
];
const VIP_CATEGORIES = [
  { value: "sponsor", label: "Sponsor", color: "#2563eb" },
  { value: "head-of-table", label: "Head of Table", color: "#dc2626" }
];

const defaultState = {
  eventName: "VIP Guest Registration",
  logoDataUrl: "",
  tables: [{ id: "default-sponsors", name: "Sponsors" }],
  guests: []
};

let state = structuredClone(defaultState);
let viewState = state;
let selectedGuestId = "";
let liveTimer = null;

const elements = {
  logoFrame: document.querySelector("#logoFrame"),
  eventTitle: document.querySelector("#eventTitle"),
  globalSearchInput: document.querySelector("#globalSearchInput"),
  searchResultCount: document.querySelector("#searchResultCount"),
  readinessMeter: document.querySelector("#readinessMeter"),
  analyticsSummary: document.querySelector("#analyticsSummary"),
  statusDonut: document.querySelector("#statusDonut"),
  statusLegend: document.querySelector("#statusLegend"),
  categoryBars: document.querySelector("#categoryBars"),
  occupancyChart: document.querySelector("#occupancyChart"),
  openSeatBars: document.querySelector("#openSeatBars"),
  checkinTimeline: document.querySelector("#checkinTimeline"),
  tableHeatmap: document.querySelector("#tableHeatmap"),
  warningCount: document.querySelector("#warningCount"),
  warningList: document.querySelector("#warningList"),
  guestDrilldown: document.querySelector("#guestDrilldown"),
  liveModeToggle: document.querySelector("#liveModeToggle"),
  refreshButton: document.querySelector("#refreshButton"),
  printButton: document.querySelector("#printButton")
};

async function loadState() {
  return window.vipDatabase.loadState(defaultState, normalizeState);
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
      checkedInAt: status === "checked-in" ? guest.checkedInAt || guest.updatedAt || "" : guest.checkedInAt || "",
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

function normalizeCategory(category = "sponsor") {
  const normalized = String(category).trim().toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
  if (["head-of-table", "head-table", "table-head", "hot"].includes(normalized)) return "head-of-table";
  return "sponsor";
}

function statusLabel(value) {
  return STATUSES.find((status) => status.value === normalizeStatus(value))?.label || "Not Arrived";
}

function categoryLabel(value) {
  return VIP_CATEGORIES.find((category) => category.value === normalizeCategory(value))?.label || "Sponsor";
}

async function render() {
  state = await loadState();
  viewState = getFilteredState();
  renderBranding();
  renderSummary();
  renderStatusDonut();
  renderCategoryBars();
  renderOccupancyChart();
  renderOpenSeatBars();
  renderCheckinTimeline();
  renderHeatmap();
  renderWarnings();
  renderDrilldown();
}

function getFilteredState() {
  const search = elements.globalSearchInput.value.trim().toLowerCase();
  if (!search) return state;

  const matchingGuests = state.guests.filter((guest) => guestMatchesSearch(guest, search));
  const matchingGuestTableIds = new Set(matchingGuests.map((guest) => guest.tableId));
  const matchingTables = state.tables.filter((table) => table.name.toLowerCase().includes(search) || matchingGuestTableIds.has(table.id));
  const matchingTableIds = new Set(matchingTables.map((table) => table.id));

  return {
    ...state,
    tables: matchingTables,
    guests: state.guests.filter((guest) => matchingTableIds.has(guest.tableId) && guestMatchesSearch(guest, search))
  };
}

function guestMatchesSearch(guest, search) {
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

function renderBranding() {
  elements.eventTitle.textContent = `${state.eventName} Analytics`;
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

function renderSearchCount() {
  const search = elements.globalSearchInput.value.trim();
  if (!search) {
    elements.searchResultCount.textContent = "Showing all registration data";
    return;
  }

  elements.searchResultCount.textContent = `Showing ${viewState.guests.length} matching guest${viewState.guests.length === 1 ? "" : "s"} across ${viewState.tables.length} table${viewState.tables.length === 1 ? "" : "s"}`;
}

function readinessScore() {
  const warnings = getWarnings();
  const totalGuests = Math.max(state.guests.length, 1);
  const seatedOrChecked = state.guests.filter((guest) => ["checked-in", "seated"].includes(guest.status)).length;
  const seatsComplete = percentage(state.guests.filter((guest) => guest.seatNumber).length, totalGuests);
  const arrivalProgress = percentage(seatedOrChecked, totalGuests);
  const warningPenalty = Math.min(warnings.length * 8, 40);
  return Math.max(0, Math.round((seatsComplete * 0.45) + (arrivalProgress * 0.35) + 20 - warningPenalty));
}

function renderReadiness() {
  const score = readinessScore();
  elements.readinessMeter.style.setProperty("--readiness", `${score}%`);
  elements.readinessMeter.innerHTML = `
    <strong>${score}%</strong>
    <span>Ready</span>
  `;
}

function renderSummary() {
  const totalSeats = viewState.tables.length * TABLE_LIMIT;
  const registered = viewState.guests.length;
  const checkedIn = countGuestsByStatus("checked-in");
  const seated = countGuestsByStatus("seated");
  const fullTables = viewState.tables.filter((table) => guestsAtTable(table.id).length >= TABLE_LIMIT).length;
  const checkInRate = percentage(checkedIn + seated, registered);

  elements.analyticsSummary.innerHTML = [
    ["Registered", registered],
    ["Total Seats", totalSeats],
    ["Open Seats", Math.max(totalSeats - registered, 0)],
    ["Full Tables", fullTables],
    ["Arrival Rate", `${checkInRate}%`]
  ]
    .map(([label, value]) => `<article class="summary-item"><strong>${value}</strong><span>${label}</span></article>`)
    .join("");
  renderSearchCount();
  renderReadiness();
}

function renderStatusDonut() {
  const total = Math.max(viewState.guests.length, 1);
  let current = 0;
  const segments = viewState.guests.length ? STATUSES.map((status) => {
    const count = countGuestsByStatus(status.value);
    const start = current;
    current += (count / total) * 100;
    return `${status.color} ${start}% ${current}%`;
  }) : ["#e7eaf0 0% 100%"];

  elements.statusDonut.style.setProperty("--donut", segments.join(", "));
  elements.statusDonut.innerHTML = `
    <strong>${viewState.guests.length}</strong>
    <span>Total VIPs</span>
  `;

  elements.statusLegend.innerHTML = STATUSES.map((status) => {
    const count = countGuestsByStatus(status.value);
    return `
      <button class="chart-legend-item" data-filter-value="${escapeHtml(status.label)}" type="button">
        <span style="--legend-color: ${status.color};"></span>
        <strong>${status.label}</strong>
        <em>${count}</em>
      </button>
    `;
  }).join("");
  elements.statusLegend.querySelectorAll("[data-filter-value]").forEach((button) => {
    button.addEventListener("click", () => setSearch(button.dataset.filterValue));
  });
}

function renderCategoryBars() {
  renderBarList(
    elements.categoryBars,
    VIP_CATEGORIES.map((category) => ({
      label: category.label,
      value: viewState.guests.filter((guest) => guest.category === category.value).length,
      color: category.color
    }))
  );
}

function renderOccupancyChart() {
  if (!viewState.tables.length) {
    elements.occupancyChart.innerHTML = `<div class="empty-state">No tables have been created yet.</div>`;
    return;
  }

  elements.occupancyChart.innerHTML = viewState.tables.map((table, index) => {
    const guests = guestsAtTable(table.id).length;
    const fill = percentage(guests, TABLE_LIMIT);
    return `
      <article class="occupancy-row">
        <div>
          <strong>${escapeHtml(table.name)}</strong>
          <span>${guests}/${TABLE_LIMIT} seats</span>
        </div>
        <div class="occupancy-track" aria-label="${escapeHtml(table.name)} is ${fill}% full">
          <span style="width: ${fill}%; --bar-color: ${chartColor(index)};"></span>
        </div>
        <em>${fill}%</em>
      </article>
    `;
  }).join("");
}

function renderOpenSeatBars() {
  renderBarList(
    elements.openSeatBars,
    viewState.tables.map((table, index) => {
      const openSeats = Math.max(TABLE_LIMIT - guestsAtTable(table.id).length, 0);
      return {
        label: table.name,
        value: openSeats,
        color: chartColor(index)
      };
    }),
    TABLE_LIMIT
  );
}

function renderCheckinTimeline() {
  const buckets = new Map();
  viewState.guests.forEach((guest) => {
    if (!guest.checkedInAt) return;
    const date = new Date(guest.checkedInAt);
    if (Number.isNaN(date.getTime())) return;
    const label = date.toLocaleTimeString([], { hour: "numeric" });
    buckets.set(label, (buckets.get(label) || 0) + 1);
  });

  const rows = [...buckets.entries()].map(([label, value], index) => ({ label, value, color: chartColor(index) }));
  renderBarList(elements.checkinTimeline, rows.length ? rows : [{ label: "No check-ins yet", value: 0, color: "#c7c7c1" }]);
}

function renderBarList(container, rows, maxValue = null) {
  const max = maxValue ?? Math.max(...rows.map((row) => row.value), 1);

  container.innerHTML = rows.map((row) => {
    const width = max ? Math.round((row.value / max) * 100) : 0;
    return `
      <article class="chart-bar-row">
        <div class="chart-bar-label">
          <strong>${escapeHtml(row.label)}</strong>
          <span>${row.value}</span>
        </div>
        <button class="chart-bar-track" data-filter-value="${escapeHtml(row.label)}" type="button" aria-label="Filter analytics by ${escapeHtml(row.label)}">
          <span style="width: ${width}%; --bar-color: ${row.color};"></span>
        </button>
      </article>
    `;
  }).join("");
  container.querySelectorAll("[data-filter-value]").forEach((button) => {
    button.addEventListener("click", () => setSearch(button.dataset.filterValue));
  });
}

function renderHeatmap() {
  if (!viewState.tables.length) {
    elements.tableHeatmap.innerHTML = `<div class="empty-state">No matching tables.</div>`;
    return;
  }

  elements.tableHeatmap.innerHTML = viewState.tables.map((table) => {
    const guests = guestsAtTable(table.id);
    const fill = percentage(guests.length, TABLE_LIMIT);
    const headCount = guests.filter((guest) => guest.category === "head-of-table").length;
    const warningClass = headCount > 1 || (guests.length >= TABLE_LIMIT && headCount === 0) ? "has-warning" : "";
    const headClass = headCount === 1 ? "has-head" : "";
    return `
      <button class="heatmap-tile ${warningClass} ${headClass}" style="--heat: ${fill}%;" data-table-id="${escapeHtml(table.id)}" type="button">
        <strong>${escapeHtml(table.name)}</strong>
        <span>${guests.length}/${TABLE_LIMIT}</span>
      </button>
    `;
  }).join("");

  elements.tableHeatmap.querySelectorAll("[data-table-id]").forEach((button) => {
    button.addEventListener("click", () => selectFirstGuestAtTable(button.dataset.tableId));
  });
}

function getWarnings() {
  const warnings = [];
  const nameCounts = new Map();
  state.guests.forEach((guest) => {
    const name = String(guest.name || "").trim().toLowerCase();
    if (name) nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
  });

  nameCounts.forEach((count, name) => {
    if (count > 1) warnings.push({ label: `${count} guests share "${name}".`, filter: name });
  });

  state.tables.forEach((table) => {
    const guests = state.guests.filter((guest) => guest.tableId === table.id);
    const headCount = guests.filter((guest) => guest.category === "head-of-table").length;
    const seatCounts = new Map();

    guests.forEach((guest) => {
      if (!guest.seatNumber) warnings.push({ label: `${guest.name} at ${table.name} is missing a seat number.`, filter: guest.name });
      if (guest.seatNumber) seatCounts.set(guest.seatNumber, (seatCounts.get(guest.seatNumber) || 0) + 1);
    });

    seatCounts.forEach((count, seatNumber) => {
      if (count > 1) warnings.push({ label: `${table.name} has ${count} guests assigned to seat ${seatNumber}.`, filter: table.name });
    });

    if (headCount > 1) warnings.push({ label: `${table.name} has more than one Head of Table.`, filter: table.name });
    if (guests.length >= TABLE_LIMIT && headCount === 0) warnings.push({ label: `${table.name} is full and has no Head of Table.`, filter: table.name });
  });

  return warnings;
}

function renderWarnings() {
  const warnings = getWarnings();
  elements.warningCount.textContent = warnings.length;
  elements.warningList.innerHTML = warnings.length
    ? warnings.map((warning) => `
      <button class="warning-item" data-filter-value="${escapeHtml(warning.filter)}" type="button">
        ${escapeHtml(warning.label)}
      </button>
    `).join("")
    : `<div class="empty-state">No readiness issues found.</div>`;

  elements.warningList.querySelectorAll("[data-filter-value]").forEach((button) => {
    button.addEventListener("click", () => setSearch(button.dataset.filterValue));
  });
}

function renderDrilldown() {
  const guest = selectedGuestId
    ? viewState.guests.find((item) => item.id === selectedGuestId)
    : viewState.guests[0];

  if (!guest) {
    elements.guestDrilldown.innerHTML = `<div class="empty-state">No guests match this view.</div>`;
    return;
  }

  selectedGuestId = guest.id;
  const table = state.tables.find((item) => item.id === guest.tableId);
  const guestButtons = viewState.guests.slice(0, 12).map((item) => {
    const itemTable = state.tables.find((tableItem) => tableItem.id === item.tableId);
    return `
      <button class="${item.id === selectedGuestId ? "is-active" : ""}" data-guest-id="${escapeHtml(item.id)}" type="button">
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(itemTable?.name || "Unassigned")} · Seat ${item.seatNumber || "-"}</span>
      </button>
    `;
  }).join("");

  elements.guestDrilldown.innerHTML = `
    <strong>${escapeHtml(guest.name)}</strong>
    <dl>
      <div><dt>Table</dt><dd>${escapeHtml(table?.name || "Unassigned")}</dd></div>
      <div><dt>Seat</dt><dd>${guest.seatNumber || "-"}</dd></div>
      <div><dt>Category</dt><dd>${categoryLabel(guest.category)}</dd></div>
      <div><dt>Status</dt><dd>${statusLabel(guest.status)}</dd></div>
      <div><dt>Checked In</dt><dd>${guest.checkedInAt ? escapeHtml(formatDateTime(guest.checkedInAt)) : "-"}</dd></div>
      <div><dt>Notes</dt><dd>${escapeHtml(guest.notes || "-")}</dd></div>
    </dl>
    <div class="drilldown-list">
      ${guestButtons}
    </div>
  `;

  elements.guestDrilldown.querySelectorAll("[data-guest-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedGuestId = button.dataset.guestId;
      renderDrilldown();
    });
  });
}

function countGuestsByStatus(status) {
  return viewState.guests.filter((guest) => guest.status === status).length;
}

function guestsAtTable(tableId) {
  return viewState.guests.filter((guest) => guest.tableId === tableId);
}

function allGuestsAtTable(tableId) {
  return state.guests.filter((guest) => guest.tableId === tableId);
}

function setSearch(value) {
  elements.globalSearchInput.value = value;
  selectedGuestId = "";
  render();
}

function selectFirstGuestAtTable(tableId) {
  const guest = allGuestsAtTable(tableId)[0];
  if (!guest) {
    setSearch(state.tables.find((table) => table.id === tableId)?.name || "");
    return;
  }

  selectedGuestId = guest.id;
  elements.globalSearchInput.value = state.tables.find((table) => table.id === tableId)?.name || "";
  render();
}

function percentage(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function chartColor(index) {
  const colors = ["#2563eb", "#dc2626", "#facc15", "#16a34a", "#7c3aed", "#f97316"];
  return colors[index % colors.length];
}

function isSafeImageDataUrl(value) {
  return /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(String(value || ""));
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

function setLiveMode(enabled) {
  if (liveTimer) {
    window.clearInterval(liveTimer);
    liveTimer = null;
  }

  if (enabled) {
    liveTimer = window.setInterval(render, 5000);
  }
}

elements.refreshButton.addEventListener("click", render);
elements.globalSearchInput.addEventListener("input", () => {
  selectedGuestId = "";
  render();
});
elements.liveModeToggle.addEventListener("change", () => setLiveMode(elements.liveModeToggle.checked));
elements.printButton.addEventListener("click", () => window.print());
window.addEventListener("focus", render);
window.addEventListener("pageshow", render);
window.addEventListener(window.vipDatabase.changeEvent, render);

render();
