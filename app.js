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
const MAX_TABLES = 27;
const MAX_GUESTS = 1000;
const MAX_NAME_LENGTH = 120;
const MAX_TABLE_NAME_LENGTH = 80;
const MAX_EVENT_NAME_LENGTH = 120;
const MAX_NOTES_LENGTH = 300;
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
let pendingImportGuests = [];
let undoState = null;
let undoLabel = "";
let lastCommittedState = structuredClone(state);

const elements = {
  logoFrame: document.querySelector("#logoFrame"),
  eventTitle: document.querySelector("#eventTitle"),
  guestForm: document.querySelector("#guestForm"),
  guestName: document.querySelector("#guestName"),
  tableSelect: document.querySelector("#tableSelect"),
  categorySelect: document.querySelector("#categorySelect"),
  guestNotes: document.querySelector("#guestNotes"),
  checkInOnAdd: document.querySelector("#checkInOnAdd"),
  tableForm: document.querySelector("#tableForm"),
  tableName: document.querySelector("#tableName"),
  settingsForm: document.querySelector("#settingsForm"),
  eventNameInput: document.querySelector("#eventNameInput"),
  logoInput: document.querySelector("#logoInput"),
  clearLogoButton: document.querySelector("#clearLogoButton"),
  importFile: document.querySelector("#importFile"),
  importStatus: document.querySelector("#importStatus"),
  importPreview: document.querySelector("#importPreview"),
  previewTitle: document.querySelector("#previewTitle"),
  previewCount: document.querySelector("#previewCount"),
  previewList: document.querySelector("#previewList"),
  confirmImportButton: document.querySelector("#confirmImportButton"),
  cancelImportButton: document.querySelector("#cancelImportButton"),
  backupButton: document.querySelector("#backupButton"),
  restoreFile: document.querySelector("#restoreFile"),
  clearDataButton: document.querySelector("#clearDataButton"),
  summaryGrid: document.querySelector("#summaryGrid"),
  globalSearchInput: document.querySelector("#globalSearchInput"),
  searchInput: document.querySelector("#searchInput"),
  filterTable: document.querySelector("#filterTable"),
  filterStatus: document.querySelector("#filterStatus"),
  tableOccupancyFilter: document.querySelector("#tableOccupancyFilter"),
  conflictPanel: document.querySelector("#conflictPanel"),
  guestList: document.querySelector("#guestList"),
  guestCount: document.querySelector("#guestCount"),
  tablesBoard: document.querySelector("#tablesBoard"),
  guestTemplate: document.querySelector("#guestTemplate"),
  exportButton: document.querySelector("#exportButton"),
  undoButton: document.querySelector("#undoButton"),
  printButton: document.querySelector("#printButton")
};

async function loadState() {
  return window.vipDatabase.loadState(defaultState, sanitizeState);
}

async function saveState() {
  state = await window.vipDatabase.saveState(state, sanitizeState);
}

async function refreshFromStorage() {
  state = await loadState();
  lastCommittedState = structuredClone(state);
  render();
}

function seatsTaken(tableId) {
  return state.guests.filter((guest) => guest.tableId === tableId).length;
}

function normalizeGuests(guests) {
  return guests.map((guest) => {
    const status = normalizeStatus(guest.status || (guest.checkedIn ? "checked-in" : "not-arrived"));
    return {
      ...guest,
      id: String(guest.id || createId()),
      name: cleanText(guest.name, MAX_NAME_LENGTH),
      tableId: String(guest.tableId || ""),
      seatNumber: normalizeSeatNumber(guest.seatNumber),
      category: normalizeCategory(guest.category),
      status,
      checkedIn: status === "checked-in",
      checkedInAt: status === "checked-in" ? cleanText(guest.checkedInAt || guest.updatedAt || new Date().toISOString(), 40) : cleanText(guest.checkedInAt, 40),
      notes: cleanText(guest.notes, MAX_NOTES_LENGTH)
    };
  });
}

function sanitizeState(rawState) {
  const tables = Array.isArray(rawState.tables)
    ? rawState.tables.slice(0, MAX_TABLES).map((table) => ({
      id: String(table.id || createId()),
      name: cleanText(table.name, MAX_TABLE_NAME_LENGTH) || "Table"
    }))
    : structuredClone(defaultState.tables);
  const validTableIds = new Set(tables.map((table) => table.id));
  const usedSeats = new Map(tables.map((table) => [table.id, new Set()]));
  const tableCounts = new Map(tables.map((table) => [table.id, 0]));
  const guests = normalizeGuests(Array.isArray(rawState.guests) ? rawState.guests.slice(0, MAX_GUESTS) : [])
    .filter((guest) => guest.name && validTableIds.has(guest.tableId))
    .reduce((validGuests, guest) => {
      const count = tableCounts.get(guest.tableId) || 0;
      if (count >= TABLE_LIMIT) return validGuests;

      const seats = usedSeats.get(guest.tableId);
      let seatNumber = guest.seatNumber;
      if (!seatNumber || seats.has(seatNumber)) {
        seatNumber = Array.from({ length: TABLE_LIMIT }, (_, index) => index + 1).find((seat) => !seats.has(seat)) || null;
      }
      if (seatNumber) seats.add(seatNumber);
      tableCounts.set(guest.tableId, count + 1);
      validGuests.push({ ...guest, seatNumber });
      return validGuests;
    }, []);

  return {
    ...structuredClone(defaultState),
    eventName: cleanText(rawState.eventName, MAX_EVENT_NAME_LENGTH) || defaultState.eventName,
    logoDataUrl: isSafeImageDataUrl(rawState.logoDataUrl) ? rawState.logoDataUrl : "",
    tables: tables.length ? tables : structuredClone(defaultState.tables),
    guests
  };
}

function cleanText(value, maxLength) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
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

function setGuestCategory(guest, category) {
  guest.category = normalizeCategory(category);
  guest.updatedAt = new Date().toISOString();
}

function setGuestNotes(guest, notes) {
  guest.notes = cleanText(notes, MAX_NOTES_LENGTH);
  guest.updatedAt = new Date().toISOString();
}

function setGuestSeat(guest, seatNumber) {
  const nextSeat = normalizeSeatNumber(seatNumber);
  if (!nextSeat || !isSeatAvailable(guest.tableId, nextSeat, guest.id)) {
    alert("That seat is already assigned at this table.");
    renderGuestList();
    return;
  }

  guest.seatNumber = nextSeat;
  guest.updatedAt = new Date().toISOString();
  persistAndRender("seat change");
}

function nextOpenSeat(tableId, ignoredGuestId = "") {
  const taken = occupiedSeatNumbers(tableId, ignoredGuestId);
  return Array.from({ length: TABLE_LIMIT }, (_, index) => index + 1).find((seat) => !taken.has(seat)) || null;
}

function occupiedSeatNumbers(tableId, ignoredGuestId = "") {
  return new Set(
    state.guests
      .filter((guest) => guest.tableId === tableId && guest.id !== ignoredGuestId && guest.seatNumber)
      .map((guest) => guest.seatNumber)
  );
}

function isSeatAvailable(tableId, seatNumber, ignoredGuestId = "") {
  const seat = normalizeSeatNumber(seatNumber);
  return Boolean(seat) && !occupiedSeatNumbers(tableId, ignoredGuestId).has(seat);
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

function populateCategoryOptions(select) {
  select.innerHTML = "";
  VIP_CATEGORIES.forEach((category) => select.add(new Option(category.label, category.value)));
}

function initializeStaticOptions() {
  populateCategoryOptions(elements.categorySelect);
}

function isFullTable(tableId) {
  return seatsTaken(tableId) >= TABLE_LIMIT;
}

function tableMatchesOccupancy(tableId) {
  const filter = elements.tableOccupancyFilter.value;
  if (filter === "full") return isFullTable(tableId);
  if (filter === "open") return !isFullTable(tableId);
  return true;
}

function normalizedName(name) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function findDuplicateGuest(name, ignoredGuestId = "") {
  const cleanName = normalizedName(name);
  if (!cleanName) return null;
  return state.guests.find((guest) => guest.id !== ignoredGuestId && normalizedName(guest.name) === cleanName);
}

function findTableByName(name) {
  return state.tables.find((table) => table.name.toLowerCase() === name.trim().toLowerCase());
}

function addTable(name, options = {}) {
  const cleanName = cleanText(name, MAX_TABLE_NAME_LENGTH);
  if (!cleanName) return null;

  const existing = findTableByName(cleanName);
  if (existing) return existing;

  if (state.tables.length >= MAX_TABLES) {
    if (!options.silent) alert(`You can create up to ${MAX_TABLES} tables for this event.`);
    return null;
  }

  const table = { id: createId(), name: cleanName };
  state.tables.push(table);
  return table;
}

function renameTable(tableId, name) {
  const table = state.tables.find((item) => item.id === tableId);
  const cleanName = cleanText(name, MAX_TABLE_NAME_LENGTH);
  if (!table || !cleanName) return;

  const duplicate = state.tables.some((item) => item.id !== tableId && item.name.toLowerCase() === cleanName.toLowerCase());
  if (duplicate) {
    alert("A table with that name already exists.");
    return;
  }

  table.name = cleanName;
  persistAndRender("table rename");
}

function deleteTable(tableId) {
  const table = state.tables.find((item) => item.id === tableId);
  if (!table) return;

  const taken = seatsTaken(tableId);
  if (taken > 0) {
    alert(`Move or remove the ${taken} guest${taken === 1 ? "" : "s"} at ${table.name} before deleting this table.`);
    return;
  }

  if (state.tables.length === 1) {
    alert("At least one table is required.");
    return;
  }

  const confirmed = window.confirm(`Delete ${table.name}?`);
  if (!confirmed) return;

  state.tables = state.tables.filter((item) => item.id !== tableId);
  persistAndRender("table delete");
}

function registerGuest({ name, tableId, checkedIn = false, status, category = "sponsor", notes = "", seatNumber = null }) {
  const cleanName = cleanText(name, MAX_NAME_LENGTH);
  if (!cleanName) throw new Error("Full name is required.");

  const table = state.tables.find((item) => item.id === tableId);
  if (!table) throw new Error("Choose a table.");

  if (seatsTaken(tableId) >= TABLE_LIMIT) {
    throw new Error(`${table.name} is already full.`);
  }

  const guestStatus = normalizeStatus(status || (checkedIn ? "checked-in" : "not-arrived"));
  const createdAt = new Date().toISOString();
  const assignedSeat = normalizeSeatNumber(seatNumber) && isSeatAvailable(tableId, seatNumber)
    ? normalizeSeatNumber(seatNumber)
    : nextOpenSeat(tableId);
  const guest = {
    id: createId(),
    name: cleanName,
    tableId,
    seatNumber: assignedSeat,
    category: normalizeCategory(category),
    status: guestStatus,
    checkedIn: guestStatus === "checked-in",
    checkedInAt: guestStatus === "checked-in" ? createdAt : "",
    notes: cleanText(notes, MAX_NOTES_LENGTH),
    createdAt
  };

  state.guests.push(guest);
  return guest;
}

function renameGuest(guestId, name) {
  const guest = state.guests.find((item) => item.id === guestId);
  const cleanName = cleanText(name, MAX_NAME_LENGTH);
  if (!guest) return;

  if (!cleanName) {
    alert("Guest name cannot be blank.");
    renderGuestList();
    return;
  }

  const duplicate = findDuplicateGuest(cleanName, guestId);
  if (duplicate) {
    const confirmed = window.confirm(`${cleanName} already exists on the guest list. Save this duplicate name anyway?`);
    if (!confirmed) {
      renderGuestList();
      return;
    }
  }

  guest.name = cleanName;
  persistAndRender("guest rename");
}

function renderBranding() {
  elements.eventTitle.textContent = state.eventName;
  elements.eventNameInput.value = state.eventName;
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

function renderTableOptions() {
  elements.tableSelect.innerHTML = "";
  elements.filterTable.innerHTML = `<option value="all">All tables</option><option value="unassigned">Unassigned</option>`;

  state.tables.forEach((table) => {
    const taken = seatsTaken(table.id);
    const full = taken >= TABLE_LIMIT;
    const option = new Option(`${table.name} (${taken}/${TABLE_LIMIT})`, table.id);
    option.disabled = full;
    elements.tableSelect.add(option);

    elements.filterTable.add(new Option(table.name, table.id));
  });
}

function renderSummary() {
  const checkedIn = state.guests.filter((guest) => guest.status === "checked-in").length;
  const seated = state.guests.filter((guest) => guest.status === "seated").length;
  const noShow = state.guests.filter((guest) => guest.status === "no-show").length;
  const openSeats = state.tables.length * TABLE_LIMIT - state.guests.length;
  const conflicts = getConflicts().length;

  elements.summaryGrid.innerHTML = [
    ["Guests", state.guests.length],
    ["Checked In", checkedIn],
    ["Seated", seated],
    ["No Show", noShow],
    ["Open seats", openSeats],
    ["Warnings", conflicts]
  ]
    .map(([label, value]) => `<div class="summary-item"><strong>${value}</strong><span>${label}</span></div>`)
    .join("");
}

function getConflicts() {
  const conflicts = [];
  const nameCounts = new Map();
  state.guests.forEach((guest) => {
    const name = normalizedName(guest.name);
    nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
  });

  nameCounts.forEach((count, name) => {
    if (count > 1) conflicts.push(`${count} guests share the name "${name}".`);
  });

  state.tables.forEach((table) => {
    const guests = state.guests.filter((guest) => guest.tableId === table.id);
    const headCount = guests.filter((guest) => guest.category === "head-of-table").length;
    const seatedGuests = guests.filter((guest) => guest.status === "seated" || guest.status === "checked-in");
    const seatCounts = new Map();

    guests.forEach((guest) => {
      if (!guest.seatNumber) conflicts.push(`${guest.name} at ${table.name} does not have a seat number.`);
      if (guest.seatNumber) seatCounts.set(guest.seatNumber, (seatCounts.get(guest.seatNumber) || 0) + 1);
    });

    seatCounts.forEach((count, seatNumber) => {
      if (count > 1) conflicts.push(`${table.name} has ${count} guests assigned to seat ${seatNumber}.`);
    });

    if (headCount > 1) conflicts.push(`${table.name} has more than one Head of Table.`);
    if (guests.length >= TABLE_LIMIT && headCount === 0) conflicts.push(`${table.name} is full and has no Head of Table.`);
    seatedGuests
      .filter((guest) => !guest.seatNumber)
      .forEach((guest) => conflicts.push(`${guest.name} is ${statusLabel(guest.status).toLowerCase()} without a seat number.`));
  });

  return conflicts;
}

function renderConflicts() {
  const conflicts = getConflicts();
  elements.conflictPanel.hidden = conflicts.length === 0;
  elements.conflictPanel.innerHTML = conflicts.length
    ? `
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Attention</p>
          <h2>Assignment Warnings</h2>
        </div>
        <span class="count-badge">${conflicts.length}</span>
      </div>
      <ul>${conflicts.map((conflict) => `<li>${escapeHtml(conflict)}</li>`).join("")}</ul>
    `
    : "";
}

function getFilteredGuests() {
  const search = elements.searchInput.value.trim().toLowerCase();
  const tableFilter = elements.filterTable.value;
  const statusFilter = elements.filterStatus.value;

  return state.guests.filter((guest) => {
    const matchesSearch = guestMatchesSearch(guest, search);
    const matchesTable =
      tableFilter === "all" ||
      (tableFilter === "unassigned" && !guest.tableId) ||
      guest.tableId === tableFilter;
    const matchesStatus =
      statusFilter === "all" ||
      guest.status === statusFilter;

    return matchesSearch && matchesTable && matchesStatus;
  });
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
  const guests = state.guests.filter((guest) => guest.tableId === table.id);
  return table.name.toLowerCase().includes(search) || guests.some((guest) => guestMatchesSearch(guest, search));
}

function renderGuestList() {
  const guests = getFilteredGuests();
  elements.guestList.innerHTML = "";
  elements.guestCount.textContent = `${state.guests.length} guest${state.guests.length === 1 ? "" : "s"}`;

  if (!guests.length) {
    elements.guestList.innerHTML = `<div class="empty-state">No guests match this view.</div>`;
    return;
  }

  guests.forEach((guest) => {
    const table = state.tables.find((item) => item.id === guest.tableId);
    const row = elements.guestTemplate.content.firstElementChild.cloneNode(true);
    const nameInput = row.querySelector(".guest-name-input");
    nameInput.value = guest.name;
    nameInput.addEventListener("change", () => renameGuest(guest.id, nameInput.value));
    nameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        nameInput.blur();
      }
    });
	    const checkedInTime = guest.checkedInAt ? ` · Checked in ${formatTimestamp(guest.checkedInAt)}` : "";
	    row.querySelector(".guest-meta").textContent = `${table?.name || "Unassigned"} · Seat ${guest.seatNumber || "-"} · ${categoryLabel(guest.category)}${checkedInTime}`;
	    const notesInput = row.querySelector(".guest-notes-input");
	    notesInput.value = guest.notes || "";
	    notesInput.addEventListener("change", () => {
	      setGuestNotes(guest, notesInput.value);
	      persistAndRender("note update");
	    });

	    const moveSelect = row.querySelector(".move-select");
    state.tables.forEach((item) => {
      const full = seatsTaken(item.id) >= TABLE_LIMIT && item.id !== guest.tableId;
      const option = new Option(`${item.name}${full ? " (full)" : ""}`, item.id);
      option.disabled = full;
      moveSelect.add(option);
    });
    moveSelect.value = guest.tableId;
    moveSelect.addEventListener("change", () => {
      if (seatsTaken(moveSelect.value) >= TABLE_LIMIT) {
        alert("That table is already full.");
        moveSelect.value = guest.tableId;
        return;
      }
	      guest.tableId = moveSelect.value;
	      guest.seatNumber = nextOpenSeat(moveSelect.value, guest.id);
	      guest.updatedAt = new Date().toISOString();
	      persistAndRender("table move");
	    });

	    const seatSelect = row.querySelector(".seat-select");
	    Array.from({ length: TABLE_LIMIT }, (_, index) => index + 1).forEach((seatNumber) => {
	      const taken = !isSeatAvailable(guest.tableId, seatNumber, guest.id);
	      const option = new Option(`Seat ${seatNumber}${taken ? " (taken)" : ""}`, seatNumber);
	      option.disabled = taken;
	      seatSelect.add(option);
	    });
	    seatSelect.value = guest.seatNumber || "";
	    seatSelect.addEventListener("change", () => setGuestSeat(guest, seatSelect.value));

    const categorySelect = row.querySelector(".category-select");
    populateCategoryOptions(categorySelect);
    categorySelect.value = guest.category;
    categorySelect.addEventListener("change", () => {
      setGuestCategory(guest, categorySelect.value);
      persistAndRender("category change");
    });

    const statusSelect = row.querySelector(".status-select");
    STATUSES.forEach((status) => statusSelect.add(new Option(status.label, status.value)));
    statusSelect.value = guest.status;
    statusSelect.classList.add(`status-${guest.status}`);
    statusSelect.addEventListener("change", () => {
      setGuestStatus(guest, statusSelect.value);
      persistAndRender("status change");
    });

    const checkButton = row.querySelector(".check-button");
    checkButton.textContent = guest.status === "checked-in" ? "Set Not Arrived" : "Check In";
    checkButton.classList.toggle("is-checked", guest.status === "checked-in");
    checkButton.addEventListener("click", () => {
      setGuestStatus(guest, guest.status === "checked-in" ? "not-arrived" : "checked-in");
      persistAndRender("check-in change");
    });

    row.querySelector(".danger-button").addEventListener("click", () => {
      const confirmed = window.confirm(`Remove ${guest.name} from the VIP list?`);
      if (!confirmed) return;
      state.guests = state.guests.filter((item) => item.id !== guest.id);
      persistAndRender("guest removal");
    });

    elements.guestList.append(row);
  });
}

function renderTablesBoard() {
  elements.tablesBoard.innerHTML = "";

  const search = elements.searchInput.value.trim().toLowerCase();
  const visibleTables = state.tables.filter((table) => tableMatchesOccupancy(table.id) && tableMatchesSearch(table, search));

  if (!visibleTables.length) {
    elements.tablesBoard.innerHTML = `<div class="empty-state">No tables match this filter.</div>`;
    return;
  }

  visibleTables.forEach((table) => {
    const tableIndex = state.tables.findIndex((item) => item.id === table.id);
    const guests = state.guests.filter((guest) => guest.tableId === table.id);
    const remainingSeats = TABLE_LIMIT - guests.length;
    const color = tableColor(tableIndex);
    const card = document.createElement("article");
    card.className = "table-card";
    setTableColor(card, color);

    const seats = Array.from({ length: TABLE_LIMIT }, (_, index) => {
      const seatNumber = index + 1;
      const guest = guests.find((item) => item.seatNumber === seatNumber);
      if (!guest) return `<li class="empty-seat">${seatNumber}. Open seat</li>`;

      const note = guest.notes ? `<small>${escapeHtml(guest.notes)}</small>` : "";
      return `
        <li class="assigned-seat">
          <span>${seatNumber}. ${escapeHtml(guest.name)}${note}</span>
          <span class="status-dot status-${guest.status}" title="${statusLabel(guest.status)}"></span>
        </li>
      `;
    }).join("");

    card.innerHTML = `
      <header>
        <div>
          <p class="eyebrow">Table</p>
          <input class="table-name-input" value="${escapeHtml(table.name)}" aria-label="Table name" />
          <span class="table-color-label">${escapeHtml(color.name)}</span>
        </div>
        <div class="table-card-actions">
          <span class="seat-meter ${remainingSeats === 0 ? "full" : ""}">${guests.length}/${TABLE_LIMIT}</span>
          <button class="danger-button table-delete-button" type="button">Delete</button>
        </div>
      </header>
      <ol class="seat-list">${seats}</ol>
    `;

    const tableNameInput = card.querySelector(".table-name-input");
    tableNameInput.addEventListener("change", () => renameTable(table.id, tableNameInput.value));
    tableNameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        tableNameInput.blur();
      }
    });

    const deleteButton = card.querySelector(".table-delete-button");
    deleteButton.disabled = guests.length > 0 || state.tables.length === 1;
    deleteButton.title = guests.length > 0 ? "Move guests before deleting this table" : "Delete table";
    deleteButton.addEventListener("click", () => deleteTable(table.id));

    elements.tablesBoard.append(card);
  });
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

async function persistAndRender(label = "last change") {
  undoState = structuredClone(lastCommittedState);
  undoLabel = label;
  try {
    await saveState();
    lastCommittedState = structuredClone(state);
    render();
  } catch (error) {
    handleDatabaseError(error);
  }
}

function render() {
  renderBranding();
  renderTableOptions();
  renderSummary();
  renderConflicts();
  renderGuestList();
  renderTablesBoard();
  renderUndoButton();
}

function completeClearEventData() {
  saveState().then(() => {
    lastCommittedState = structuredClone(state);
    pendingImportGuests = [];
    elements.importPreview.hidden = true;
    elements.importStatus.textContent = "Event data cleared in the database.";
    render();
  }).catch((error) => alert(error.message));
}

function handleDatabaseError(error) {
  alert(error.message || "The VIP registration database could not complete that action.");
}

async function initializeApp() {
  try {
    state = await loadState();
    lastCommittedState = structuredClone(state);
    initializeStaticOptions();
    bindEvents();
    render();
  } catch (error) {
    handleDatabaseError(error);
  }
}

function bindEvents() {
  elements.guestForm.addEventListener("submit", (event) => {
    event.preventDefault();

    try {
      const duplicate = findDuplicateGuest(elements.guestName.value);
      if (duplicate) {
        const confirmed = window.confirm(`${elements.guestName.value.trim()} is already on the guest list. Register another guest with this name?`);
        if (!confirmed) return;
      }

      registerGuest({
        name: elements.guestName.value,
        tableId: elements.tableSelect.value,
        checkedIn: elements.checkInOnAdd.checked,
        category: elements.categorySelect.value,
        notes: elements.guestNotes.value
      });
      elements.guestName.value = "";
      elements.guestNotes.value = "";
      elements.guestName.focus();
      persistAndRender("guest registration").catch(handleDatabaseError);
    } catch (error) {
      alert(error.message);
    }
  });

  elements.tableForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const table = addTable(elements.tableName.value);
    if (!table) return;
    elements.tableName.value = "";
    persistAndRender("table add").catch(handleDatabaseError);
  });

  elements.settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      state.eventName = cleanText(elements.eventNameInput.value, MAX_EVENT_NAME_LENGTH) || "VIP Guest Registration";
      if (elements.logoInput.files[0]) {
        state.logoDataUrl = await fileToDataUrl(elements.logoInput.files[0]);
      }
      await persistAndRender("branding update");
      elements.logoInput.value = "";
    } catch (error) {
      alert(error.message);
    }
  });

  elements.clearLogoButton.addEventListener("click", () => {
    state.logoDataUrl = "";
    persistAndRender("logo clear").catch(handleDatabaseError);
  });

  elements.importFile.addEventListener("change", async () => {
    const file = elements.importFile.files[0];
    if (!file) return;

    elements.importStatus.textContent = "Reading file...";
    try {
      const rows = await readImportFile(file);
      previewImportedGuests(rowsToGuests(rows));
    } catch (error) {
      elements.importStatus.textContent = error.message;
      pendingImportGuests = [];
      elements.importPreview.hidden = true;
    } finally {
      elements.importFile.value = "";
    }
  });

  elements.confirmImportButton.addEventListener("click", () => {
    const result = importGuests(pendingImportGuests);
    pendingImportGuests = [];
    elements.importPreview.hidden = true;
    elements.importStatus.textContent = `${result.added} guest${result.added === 1 ? "" : "s"} imported. ${result.skipped ? `${result.skipped} skipped.` : ""}`;
    if (result.messages.length) alert(result.messages.join("\n"));
    persistAndRender("guest import").catch(handleDatabaseError);
  });

  elements.cancelImportButton.addEventListener("click", () => {
    pendingImportGuests = [];
    elements.importPreview.hidden = true;
    elements.importStatus.textContent = "Import canceled.";
  });

  elements.backupButton.addEventListener("click", backupData);
  elements.restoreFile.addEventListener("change", async () => {
    const file = elements.restoreFile.files[0];
    if (!file) return;
    try {
      await restoreData(file);
    } catch (error) {
      alert(error.message || "Unable to restore backup.");
    } finally {
      elements.restoreFile.value = "";
    }
  });

  elements.clearDataButton.addEventListener("click", clearEventData);
  elements.exportButton.addEventListener("click", exportCsv);
  elements.printButton.addEventListener("click", () => window.print());
  elements.undoButton.addEventListener("click", undoLastAction);
  elements.searchInput.addEventListener("input", () => {
    renderGuestList();
    renderTablesBoard();
  });
  elements.globalSearchInput.addEventListener("input", () => {
    elements.searchInput.value = elements.globalSearchInput.value;
    renderGuestList();
    renderTablesBoard();
  });
  elements.filterTable.addEventListener("change", renderGuestList);
  elements.filterStatus.addEventListener("change", renderGuestList);
  elements.tableOccupancyFilter.addEventListener("change", renderTablesBoard);
  window.addEventListener("focus", refreshFromStorage);
  window.addEventListener("pageshow", refreshFromStorage);
  window.addEventListener(window.vipDatabase.changeEvent, refreshFromStorage);
}

function undoLastAction() {
  if (!undoState) return;

  state = structuredClone(undoState);
  saveState().then(() => {
    lastCommittedState = structuredClone(state);
    undoState = null;
    undoLabel = "";
    render();
  }).catch(handleDatabaseError);
}

function renderUndoButton() {
  elements.undoButton.disabled = !undoState;
  elements.undoButton.textContent = undoState ? `Undo ${undoLabel}` : "Undo";
}

function previewImportedGuests(guests) {
  pendingImportGuests = guests;
  elements.importPreview.hidden = guests.length === 0;
  elements.previewCount.textContent = `${guests.length} row${guests.length === 1 ? "" : "s"} found`;

  if (!guests.length) {
    elements.importStatus.textContent = "No guests found in that file.";
    elements.previewList.innerHTML = "";
    return;
  }

  const projectedCounts = new Map(state.tables.map((table) => [table.name.toLowerCase(), seatsTaken(table.id)]));
  elements.previewList.innerHTML = guests
    .map((guest) => {
      const tableName = guest.tableName || state.tables[0]?.name || "Default table";
      const key = tableName.toLowerCase();
      const projected = projectedCounts.get(key) || 0;
      projectedCounts.set(key, projected + 1);
      const duplicate = findDuplicateGuest(guest.name);
      const full = projected >= TABLE_LIMIT;
      const badges = [
        duplicate ? `<span class="warning-badge">Duplicate</span>` : "",
        full ? `<span class="danger-badge">Table full</span>` : "",
        `<span class="category-badge">${categoryLabel(guest.category)}</span>`,
        `<span class="status-badge status-${guest.status}">${statusLabel(guest.status)}</span>`
      ].join("");

      return `
        <article class="preview-row ${full ? "has-error" : ""}">
          <div>
            <strong>${escapeHtml(guest.name)}</strong>
            <span>${escapeHtml(tableName)}</span>
          </div>
          <div class="badge-row">${badges}</div>
        </article>
      `;
    })
    .join("");

  elements.importStatus.textContent = "Review the import before adding guests.";
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if ((char === "," || char === "\t") && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function rowsToGuests(rows) {
  if (!rows.length) return [];

  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const hasHeaders = headers.some((header) => ["full name", "name", "guest", "guest name"].includes(header));
  const dataRows = hasHeaders ? rows.slice(1) : rows;
  const nameIndex = hasHeaders ? findHeader(headers, ["full name", "name", "guest", "guest name"]) : 0;
  const tableIndex = hasHeaders ? findHeader(headers, ["table", "table name", "group", "sponsor"]) : 1;
  const statusIndex = hasHeaders ? findHeader(headers, ["status", "checked in", "check in", "checked-in"]) : -1;
  const categoryIndex = hasHeaders ? findHeader(headers, ["category", "vip category", "vip", "type"]) : -1;
  const seatIndex = hasHeaders ? findHeader(headers, ["seat", "seat number", "seat no"]) : -1;
  const notesIndex = hasHeaders ? findHeader(headers, ["notes", "note", "staff notes", "comments"]) : -1;

  return dataRows
    .map((row) => ({
      name: cleanText(row[nameIndex], MAX_NAME_LENGTH),
      tableName: tableIndex >= 0 ? cleanText(row[tableIndex], MAX_TABLE_NAME_LENGTH) : "",
      status: statusIndex >= 0 ? parseImportedStatus(row[statusIndex]) : "not-arrived",
      category: categoryIndex >= 0 ? normalizeCategory(row[categoryIndex]) : "sponsor",
      seatNumber: seatIndex >= 0 ? normalizeSeatNumber(row[seatIndex]) : null,
      notes: notesIndex >= 0 ? cleanText(row[notesIndex], MAX_NOTES_LENGTH) : ""
    }))
    .filter((guest) => guest.name);
}

function findHeader(headers, options) {
  return headers.findIndex((header) => options.includes(header));
}

function parseImportedStatus(value = "") {
  const text = value.trim().toLowerCase();
  if (["yes", "y", "true", "checked", "checked in", "checked-in", "1"].includes(text)) return "checked-in";
  return normalizeStatus(text);
}

async function readImportFile(file) {
  const extension = file.name.split(".").pop().toLowerCase();

  if (["xlsx", "xls"].includes(extension)) {
    await loadSheetJs();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }).map((row) => row.map((cell) => String(cell ?? "")));
  }

  return parseCsv(await file.text());
}

function loadSheetJs() {
  if (window.XLSX) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    script.integrity = "sha384-OLBgp1GsljhM2TJ+sbHjaiH9txEUvgdDTAzHv2P24donTt6/529l+9Ua0vFImLlb";
    script.crossOrigin = "anonymous";
    script.referrerPolicy = "no-referrer";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Excel import needs an internet connection the first time it loads. CSV import works offline."));
    document.head.append(script);
  });
}

function importGuests(guests) {
  const result = { added: 0, skipped: 0, messages: [] };

  guests.forEach((guest) => {
    const table = guest.tableName ? addTable(guest.tableName, { silent: true }) : state.tables[0];
    if (!table || seatsTaken(table.id) >= TABLE_LIMIT) {
      result.skipped += 1;
      const reason = state.tables.length >= MAX_TABLES && guest.tableName && !findTableByName(guest.tableName)
        ? `the ${MAX_TABLES}-table limit has been reached`
        : `${guest.tableName || "default table"} is full`;
      result.messages.push(`${guest.name} skipped: ${reason}.`);
      return;
    }

    registerGuest({ name: guest.name, tableId: table.id, status: guest.status, category: guest.category, seatNumber: guest.seatNumber, notes: guest.notes });
    result.added += 1;
  });

  return result;
}

function backupData() {
  const backup = {
    app: "vip-event-registration",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: state
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${state.eventName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "vip-event"}-backup.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function restoreData(file) {
  if (file.size > 2_000_000) {
    throw new Error("Backup file is too large.");
  }

  const text = await file.text();
  const parsed = JSON.parse(text);
  const restoredState = parsed.data || parsed;

  if (!Array.isArray(restoredState.tables) || !Array.isArray(restoredState.guests)) {
    throw new Error("That file does not look like a VIP registration backup.");
  }

  const confirmed = window.confirm("Restore this backup? It will replace the current local guest and table data on this device.");
  if (!confirmed) return;

  state = sanitizeState(restoredState);
  pendingImportGuests = [];
  elements.importPreview.hidden = true;
  await persistAndRender("backup restore");
}

function clearEventData() {
  const confirmed = window.confirm(
    "Clear all event data from this device? This will remove guests, tables, check-in status, event name, and logo."
  );
  if (!confirmed) return;

  undoState = structuredClone(lastCommittedState);
  undoLabel = "clear event data";
  state = structuredClone(defaultState);
  completeClearEventData();
}

function exportCsv() {
  const rows = [["Full Name", "Table", "Seat", "VIP Category", "Status", "Checked In At", "Notes"]];
  state.guests.forEach((guest) => {
    const table = state.tables.find((item) => item.id === guest.tableId);
    rows.push([guest.name, table?.name || "", guest.seatNumber || "", categoryLabel(guest.category), statusLabel(guest.status), guest.checkedInAt || "", guest.notes || ""]);
  });

  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${state.eventName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "vip-guests"}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function isSafeImageDataUrl(value) {
  return /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(String(value || ""));
}

function createId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function fileToDataUrl(file) {
  if (!file.type.startsWith("image/")) {
    return Promise.reject(new Error("Logo must be an image file."));
  }

  if (file.size > 1_500_000) {
    return Promise.reject(new Error("Logo image must be under 1.5 MB."));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (!isSafeImageDataUrl(reader.result)) {
        reject(new Error("Logo image could not be saved safely."));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

initializeApp();
