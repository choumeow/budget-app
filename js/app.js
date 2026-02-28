/**
 * app.js — Main application logic
 * Handles: routing, sidebar, all page renders & interactions
 */

/* ─────────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────────── */
const ICON_OPTIONS = [
  "🍜","🍕","🍔","🍣","🥗","🍦","☕","🥤",
  "🚗","🚌","🚇","✈️","⛽","🛵",
  "🛍️","👔","👟","💄","🎁",
  "🎬","🎮","🎵","📺","🎨","⚽",
  "💊","🏥","🧘","🏋️",
  "🏠","🔧","💡","📱","💻",
  "📚","🎓","✏️",
  "🐾","🌱","💆","🧴","💰","📦",
];

const COLOR_OPTIONS = [
  "#FF6B6B","#FF8E53","#FFEAA7","#A8E063","#56AB2F",
  "#4ECDC4","#45B7D1","#2193B0","#6C5CE7","#A29BFE",
  "#FD79A8","#E84393","#D63031","#E17055","#FDCB6E",
  "#00B894","#00CEC9","#74B9FF","#0984E3","#6C5CE7",
  "#B2BEC3","#636E72","#DDA0DD","#BB8FCE","#85C1E9",
];

let summaryChartInstance = null;
let _editingRecordId = null;
let _editingCategoryId = null;

/* ─────────────────────────────────────────────────────────────
   NAVIGATION
───────────────────────────────────────────────────────────── */
function navigateTo(page) {
  // Hide all pages
  document.querySelectorAll(".page").forEach(p => p.classList.add("hidden"));

  // Show target
  const target = document.getElementById(`page-${page}`);
  if (target) target.classList.remove("hidden");

  // Update sidebar active
  document.querySelectorAll(".sidebar-item").forEach(item => {
    item.classList.toggle("active", item.dataset.page === page);
  });
  // Update bottom nav active
  document.querySelectorAll(".bottom-nav-item").forEach(item => {
    item.classList.toggle("active", item.dataset.page === page);
  });

  // Render page-specific content
  if (page === "record")      renderRecordPage();
  if (page === "transaction") renderTransactionPage();
  if (page === "summary")     renderSummary();
  if (page === "settings")    renderSettingsPage();
}

/* ─────────────────────────────────────────────────────────────
   SIDEBAR
───────────────────────────────────────────────────────────── */
function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  sidebar.classList.toggle("collapsed");
}

/* ─────────────────────────────────────────────────────────────
   TOAST
───────────────────────────────────────────────────────────── */
let _toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.remove("hidden");
  requestAnimationFrame(() => toast.classList.add("show"));
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.classList.add("hidden"), 300);
  }, 2400);
}

/* ─────────────────────────────────────────────────────────────
   PAGE 1: RECORD
───────────────────────────────────────────────────────────── */
function renderRecordPage(editTxn = null) {
  _editingRecordId = editTxn ? editTxn.id : null;

  // Set page header
  const h1 = document.querySelector("#page-record .page-header h1");
  if (h1) h1.textContent = editTxn ? t("editRecord") : t("pageRecord");

  const submitBtn = document.querySelector("#record-form [type='submit']");
  if (submitBtn) submitBtn.textContent = editTxn ? t("update") : t("saveRecord");

  // Build category grid
  renderCategoryGrid(editTxn ? editTxn.categoryId : null);

  // Pre-fill if editing
  const dateInput = document.getElementById("rec-date");
  if (editTxn) {
    document.getElementById("rec-description").value = editTxn.description || "";
    document.getElementById("rec-amount").value       = editTxn.amount || "";
    if (dateInput) dateInput.value = editTxn.date || toLocalDateStr(new Date());
  } else {
    document.getElementById("rec-description").value = "";
    document.getElementById("rec-amount").value       = "";
    if (dateInput) dateInput.value = toLocalDateStr(new Date());
  }
}

function renderCategoryGrid(selectedId = null) {
  const grid = document.getElementById("category-grid");
  if (!grid) return;
  const categories = getCategories();

  if (!categories.length) {
    grid.innerHTML = `<p style="color:var(--text-muted);font-size:.85rem;">${t("noCategories")}</p>`;
    return;
  }

  grid.innerHTML = categories.map(cat => `
    <div class="category-chip ${selectedId === cat.id ? "selected" : ""}"
         onclick="selectCategory('${cat.id}')"
         data-cat-id="${cat.id}">
      <div class="chip-icon">${cat.icon}</div>
      <div>${escapeHtml(cat.name)}</div>
    </div>
  `).join("");
}

function selectCategory(catId) {
  document.querySelectorAll(".category-chip").forEach(chip => {
    chip.classList.toggle("selected", chip.dataset.catId === catId);
  });
}

function getSelectedCategory() {
  const chip = document.querySelector(".category-chip.selected");
  return chip ? chip.dataset.catId : null;
}

function handleSaveRecord(e) {
  e.preventDefault();
  const catId  = getSelectedCategory();
  const desc   = document.getElementById("rec-description").value.trim();
  const amount = parseFloat(document.getElementById("rec-amount").value);
  const date   = document.getElementById("rec-date").value;

  if (!catId)             { showToast(t("selectCategory")); return; }
  if (isNaN(amount) || amount <= 0) { showToast(t("enterAmount")); return; }

  const txn = {
    id:          _editingRecordId || generateId(),
    categoryId:  catId,
    description: desc,
    amount:      amount,
    date:        date || toLocalDateStr(new Date()),
    createdAt:   _editingRecordId ? undefined : Date.now(),
  };
  if (_editingRecordId) {
    const existing = getTransactions().find(t => t.id === _editingRecordId);
    if (existing) txn.createdAt = existing.createdAt;
  }

  saveTransaction(txn);
  showToast(t("recordSaved"));
  _editingRecordId = null;
  navigateTo("transaction");
}

/* ─────────────────────────────────────────────────────────────
   PAGE 2: TRANSACTION
───────────────────────────────────────────────────────────── */
function renderTransactionPage() {
  populateCategoryFilter();
  applyFilters();
}

function populateCategoryFilter() {
  const sel = document.getElementById("filter-category");
  if (!sel) return;
  const cats = getCategories();
  const current = sel.value;
  sel.innerHTML = `<option value="all">${t("all")}</option>` +
    cats.map(c => `<option value="${c.id}" ${current === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("");
}

function applyFilters() {
  const period   = document.getElementById("filter-period")?.value || "all";
  const catId    = document.getElementById("filter-category")?.value || "all";
  const search   = (document.getElementById("filter-search")?.value || "").toLowerCase();
  const fromDate = document.getElementById("filter-date-from")?.value || "";
  const toDate   = document.getElementById("filter-date-to")?.value || "";

  // Toggle custom date row
  const customRow = document.getElementById("custom-date-row");
  if (customRow) customRow.style.display = period === "custom" ? "flex" : "none";

  let txns = getTransactions();
  txns = filterTransactionsByPeriod(txns, period, fromDate, toDate);
  if (catId !== "all") txns = txns.filter(t => t.categoryId === catId);
  if (search) txns = txns.filter(t => (t.description || "").toLowerCase().includes(search));

  // Sort descending by date then createdAt
  txns.sort((a, b) => {
    if (b.date !== a.date) return b.date.localeCompare(a.date);
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  renderTransactionList(txns);
}

function renderTransactionList(txns) {
  const list    = document.getElementById("transaction-list");
  const empty   = document.getElementById("transaction-empty");
  if (!list) return;

  if (!txns.length) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  // Group by date
  const grouped = {};
  txns.forEach(t => {
    const d = t.date || "Unknown";
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(t);
  });

  const html = Object.entries(grouped).map(([date, items]) => {
    const label = formatDateLabel(date);
    const rows  = items.map(txn => buildTransactionRow(txn)).join("");
    return `<div class="date-separator">${label}</div>${rows}`;
  }).join("");

  list.innerHTML = html;
}

function buildTransactionRow(txn) {
  const cat = getCategoryById(txn.categoryId) || { icon: "📦", name: "Others", color: "#AEB6BF" };
  const labelStyle = `background:${hexToRgba(cat.color, 0.15)};`;
  return `
    <div class="transaction-item" data-id="${txn.id}">
      <div class="txn-icon" style="${labelStyle}">${cat.icon}</div>
      <div class="txn-info">
        <div class="txn-category">${escapeHtml(cat.name)}</div>
        <div class="txn-description">${escapeHtml(txn.description || "—")}</div>
      </div>
      <div class="txn-amount">-${formatCurrency(txn.amount)}</div>
      <div class="txn-actions">
        <button class="btn-icon" onclick="editRecord('${txn.id}')" title="Edit">
          <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn-icon danger" onclick="deleteRecord('${txn.id}')" title="Delete">
          <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div>
    </div>
  `;
}

function editRecord(id) {
  const txn = getTransactions().find(t => t.id === id);
  if (!txn) return;
  _editingRecordId = id;
  navigateTo("record");
  renderRecordPage(txn);
}

function deleteRecord(id) {
  if (!confirm(t("deleteRecord"))) return;
  deleteTransaction(id);
  showToast(t("recordDeleted"));
  applyFilters();
}

/* ─────────────────────────────────────────────────────────────
   PAGE 3: SUMMARY
───────────────────────────────────────────────────────────── */
function renderSummary() {
  const period   = document.getElementById("summary-period")?.value || "monthly";
  const now      = new Date();
  const cats     = getCategories();
  let   txns     = getTransactions();

  let totalBudget = 0;
  let totalSpent  = 0;

  // Filter transactions
  let filteredTxns;
  let months = [];   // months covered for yearly

  if (period === "monthly") {
    const month = yyyymm(now);
    filteredTxns = txns.filter(t => t.date && t.date.startsWith(month));
    months = [month];
  } else {
    const year = String(now.getFullYear());
    filteredTxns = txns.filter(t => t.date && t.date.startsWith(year));
    for (let m = 1; m <= 12; m++) {
      months.push(`${year}-${String(m).padStart(2,"0")}`);
    }
  }

  const spentByCat = getSpentByCategory(filteredTxns);

  // Total budget across covered months
  const budgetByCat = {};
  cats.forEach(cat => {
    if (period === "monthly") {
      budgetByCat[cat.id] = getEffectiveBudget(cat.id, months[0]);
    } else {
      // yearly: sum base budgets × 12 (simplified)
      budgetByCat[cat.id] = cat.budgetAmount * 12;
    }
    totalBudget += budgetByCat[cat.id];
    totalSpent  += spentByCat[cat.id] || 0;
  });

  const totalLeft = totalBudget - totalSpent;

  // Update totals
  document.getElementById("summary-total-spent").textContent  = formatCurrency(totalSpent);
  document.getElementById("summary-total-budget").textContent = formatCurrency(totalBudget);
  const leftEl = document.getElementById("summary-total-left");
  leftEl.textContent = formatCurrency(Math.abs(totalLeft));
  leftEl.style.color = totalLeft < 0 ? "var(--danger)" : "var(--success)";

  // Chart
  renderSummaryChart(cats, spentByCat);

  // Table
  renderBudgetSummaryTable(cats, budgetByCat, spentByCat);
}

function renderSummaryChart(cats, spentByCat) {
  const canvas = document.getElementById("summary-chart");
  if (!canvas) return;

  const activeCats = cats.filter(c => (spentByCat[c.id] || 0) > 0);
  if (!activeCats.length) {
    if (summaryChartInstance) { summaryChartInstance.destroy(); summaryChartInstance = null; }
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const labels = activeCats.map(c => c.name);
  const data   = activeCats.map(c => spentByCat[c.id] || 0);
  const colors = activeCats.map(c => c.color);

  if (summaryChartInstance) summaryChartInstance.destroy();

  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const textColor = isDark ? "#F1F3F9" : "#1A1D23";

  summaryChartInstance = new Chart(canvas, {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: isDark ? "#1C1E26" : "#FFFFFF", hoverOffset: 6 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: textColor,
            padding: 14,
            font: { size: 12 },
            usePointStyle: true,
          },
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${formatCurrency(ctx.parsed)}`
          }
        }
      }
    }
  });
}

function renderBudgetSummaryTable(cats, budgetByCat, spentByCat) {
  const tbody = document.getElementById("budget-summary-body");
  if (!tbody) return;

  if (!cats.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px;">${t("noCategories")}</td></tr>`;
    return;
  }

  tbody.innerHTML = cats.map(cat => {
    const budget  = budgetByCat[cat.id] || 0;
    const spent   = spentByCat[cat.id]  || 0;
    const left    = budget - spent;
    const pct     = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
    const barColor = pct >= 100 ? "var(--danger)" : pct >= 80 ? "var(--warning)" : cat.color;
    const leftClass = left < 0 ? "amount-danger" : left < budget * 0.2 ? "amount-warn" : "amount-good";

    return `
      <tr>
        <td>
          <div class="cat-cell">
            <div class="cat-dot" style="background:${hexToRgba(cat.color, 0.18)};">${cat.icon}</div>
            <span>${escapeHtml(cat.name)}</span>
          </div>
        </td>
        <td>${budget > 0 ? formatCurrency(budget) : `<span style="color:var(--text-muted)">${t("noBudgetSet")}</span>`}</td>
        <td>${formatCurrency(spent)}</td>
        <td class="${leftClass}">${left < 0 ? "-" : ""}${formatCurrency(Math.abs(left))}</td>
        <td>
          ${budget > 0 ? `
          <div class="progress-bar-wrap">
            <div class="progress-bar" style="width:${pct}%;background:${barColor};"></div>
          </div>
          <small style="color:var(--text-muted);font-size:.75rem;">${Math.round(pct)}%</small>
          ` : "—"}
        </td>
      </tr>
    `;
  }).join("");
}

/* ─────────────────────────────────────────────────────────────
   PAGE 4: SETTINGS
───────────────────────────────────────────────────────────── */
function renderSettingsPage() {
  renderCategoryBudgetTable();

  // Apply current settings
  const settings = getSettings();
  const toggle   = document.getElementById("dark-mode-toggle");
  const langSel  = document.getElementById("language-select");
  if (toggle)  toggle.checked   = settings.theme === "dark";
  if (langSel) langSel.value    = settings.language || "en";

  // Update user info
  if (currentUser) {
    const sName  = document.getElementById("settings-user-name");
    const sEmail = document.getElementById("settings-user-email");
    if (sName)  sName.textContent  = currentUser.displayName || "";
    if (sEmail) sEmail.textContent = currentUser.email || "";
  }
}

function renderCategoryBudgetTable() {
  const tbody = document.getElementById("category-budget-body");
  if (!tbody) return;
  const cats = getCategories();

  if (!cats.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:24px;">${t("noCategories")}</td></tr>`;
    return;
  }

  tbody.innerHTML = cats.map(cat => {
    const badge = cat.renewalType === "forward"
      ? `<span class="badge badge-forward">${t("forwardOption")}</span>`
      : `<span class="badge badge-renew">${t("renewOption")}</span>`;
    return `
      <tr>
        <td>
          <div class="cat-cell">
            <div class="cat-dot" style="background:${hexToRgba(cat.color, 0.18)};">${cat.icon}</div>
            <span>${escapeHtml(cat.name)}</span>
          </div>
        </td>
        <td>${cat.budgetAmount > 0 ? formatCurrency(cat.budgetAmount) : `<span style="color:var(--text-muted)">—</span>`}</td>
        <td>${badge}</td>
        <td>
          <div style="display:flex;gap:4px;">
            <button class="btn-icon" onclick="openEditCategoryModal('${cat.id}')" title="Edit">
              <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-icon danger" onclick="handleDeleteCategory('${cat.id}')" title="Delete">
              <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

/* ─────────────────────────────────────────────────────────────
   CATEGORY MODAL
───────────────────────────────────────────────────────────── */
function openAddCategoryModal() {
  _editingCategoryId = null;
  document.getElementById("category-modal-title").textContent = t("addCategory");
  document.getElementById("cat-name").value   = "";
  document.getElementById("cat-budget").value = "";
  document.getElementById("cat-edit-id").value = "";
  document.querySelector('input[name="renewal"][value="renew"]').checked = true;

  buildIconPicker(null);
  buildColorPicker(null);

  document.getElementById("category-modal").classList.remove("hidden");
}

function openEditCategoryModal(id) {
  const cat = getCategoryById(id);
  if (!cat) return;
  _editingCategoryId = id;

  document.getElementById("category-modal-title").textContent = t("editCategory");
  document.getElementById("cat-name").value    = cat.name;
  document.getElementById("cat-budget").value  = cat.budgetAmount > 0 ? cat.budgetAmount : "";
  document.getElementById("cat-edit-id").value = id;
  document.querySelector(`input[name="renewal"][value="${cat.renewalType || "renew"}"]`).checked = true;

  buildIconPicker(cat.icon);
  buildColorPicker(cat.color);

  document.getElementById("category-modal").classList.remove("hidden");
}

function closeCategoryModal(e) {
  if (e && e.target !== document.getElementById("category-modal")) return;
  document.getElementById("category-modal").classList.add("hidden");
}

function buildIconPicker(selected) {
  const wrap = document.getElementById("icon-picker");
  wrap.innerHTML = ICON_OPTIONS.map(icon => `
    <div class="icon-option ${icon === selected ? "selected" : ""}"
         onclick="selectIcon(this, '${icon}')">${icon}</div>
  `).join("");
}

function selectIcon(el, icon) {
  document.querySelectorAll(".icon-option").forEach(e => e.classList.remove("selected"));
  el.classList.add("selected");
}

function getSelectedIcon() {
  const el = document.querySelector(".icon-option.selected");
  return el ? el.textContent.trim() : "📦";
}

function buildColorPicker(selected) {
  const wrap = document.getElementById("color-picker");
  wrap.innerHTML = COLOR_OPTIONS.map(color => `
    <div class="color-option ${color === selected ? "selected" : ""}"
         style="background:${color};"
         onclick="selectColor(this)"
         data-color="${color}"></div>
  `).join("");
}

function selectColor(el) {
  document.querySelectorAll(".color-option").forEach(e => e.classList.remove("selected"));
  el.classList.add("selected");
}

function getSelectedColor() {
  const el = document.querySelector(".color-option.selected");
  return el ? el.dataset.color : COLOR_OPTIONS[0];
}

function handleSaveCategory(e) {
  e.preventDefault();
  const name   = document.getElementById("cat-name").value.trim();
  const budget = parseFloat(document.getElementById("cat-budget").value) || 0;
  const renewal = document.querySelector('input[name="renewal"]:checked')?.value || "renew";
  const icon   = getSelectedIcon();
  const color  = getSelectedColor();
  const editId = document.getElementById("cat-edit-id").value;

  if (!name) return;

  const cat = {
    id:           editId || generateId(),
    name,
    icon,
    color,
    budgetAmount: budget,
    renewalType:  renewal,
  };
  saveCategory(cat);
  document.getElementById("category-modal").classList.add("hidden");
  showToast(t("categorySaved"));
  renderSettingsPage();
}

function handleDeleteCategory(id) {
  if (!confirm(t("deleteCategory"))) return;
  deleteCategory(id);
  showToast(t("categoryDeleted"));
  renderSettingsPage();
}

/* ─────────────────────────────────────────────────────────────
   SETTINGS ACTIONS
───────────────────────────────────────────────────────────── */
function toggleDarkMode(isDark) {
  const theme = isDark ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", theme);
  const settings = getSettings();
  settings.theme = theme;
  saveSettings(settings);
  // Refresh chart with new colors if on summary page
  if (!document.getElementById("page-summary").classList.contains("hidden")) {
    renderSummary();
  }
}

function changeLanguage(lang) {
  setLanguage(lang);
  const settings = getSettings();
  settings.language = lang;
  saveSettings(settings);
  applyTranslations();
  // Re-render current visible page
  const activePage = document.querySelector(".page:not(.hidden)");
  if (activePage) {
    const page = activePage.id.replace("page-", "");
    if (page === "transaction") renderTransactionPage();
    if (page === "settings")    renderSettingsPage();
    if (page === "summary")     renderSummary();
    if (page === "record")      renderRecordPage();
  }
}

/* ─────────────────────────────────────────────────────────────
   UTILITY
───────────────────────────────────────────────────────────── */
function formatCurrency(amount) {
  if (isNaN(amount)) amount = 0;
  return "RM " + Number(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatDateLabel(dateStr) {
  if (!dateStr || dateStr === "Unknown") return dateStr;
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const today    = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);

  const isToday     = toLocalDateStr(today)     === dateStr;
  const isYesterday = toLocalDateStr(yesterday) === dateStr;

  if (isToday)     return currentLang === "zh" ? "今天" : "Today";
  if (isYesterday) return currentLang === "zh" ? "昨天" : "Yesterday";

  if (currentLang === "zh") {
    return `${y}年${m}月${d}日`;
  }
  return date.toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" });
}

function hexToRgba(hex, alpha) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  const r = parseInt(h.substring(0,2), 16);
  const g = parseInt(h.substring(2,4), 16);
  const b = parseInt(h.substring(4,6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

/* ─────────────────────────────────────────────────────────────
   FILTER PERIOD change listener (show/hide custom date)
───────────────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  const periodSel = document.getElementById("filter-period");
  if (periodSel) {
    periodSel.addEventListener("change", () => {
      const customRow = document.getElementById("custom-date-row");
      if (customRow) customRow.style.display = periodSel.value === "custom" ? "flex" : "none";
    });
  }

  // Init auth
  initAuth();
});
