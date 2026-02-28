/**
 * data.js — All data management via localStorage, keyed per user.
 *
 * Data shape:
 *   budgetwise_<uid>_categories  → Category[]
 *   budgetwise_<uid>_transactions → Transaction[]
 *   budgetwise_<uid>_monthlyData  → MonthlyData   (carry-forward ledger)
 *   budgetwise_<uid>_settings    → Settings
 *   budgetwise_<uid>_monthcheck  → "YYYY-MM"      (last month-rollover check)
 */

/* ── Default Categories ──────────────────────────────── */
// Bump this version string whenever DEFAULT_CATEGORIES changes.
// All existing users will have their categories reset to the new defaults
// while their transaction history is preserved.
const DATA_VERSION = "2";

const DEFAULT_CATEGORIES = [
  // ── Monthly Renew ──────────────────────────────────────
  { id: "cat_meal",        name: "Meal",           icon: "🍜", color: "#FF6B6B", budgetAmount: 300,  renewalType: "renew"   },
  { id: "cat_ingredient",  name: "Ingredient",     icon: "🛒", color: "#FF8E53", budgetAmount: 200,  renewalType: "renew"   },
  { id: "cat_patron",      name: "Patron",         icon: "🎭", color: "#9B59B6", budgetAmount: 75,   renewalType: "renew"   },
  { id: "cat_entertain",   name: "Entertainment",  icon: "🎬", color: "#45B7D1", budgetAmount: 200,  renewalType: "renew"   },
  { id: "cat_rental",      name: "Rental",         icon: "🏠", color: "#6C5CE7", budgetAmount: 600,  renewalType: "renew"   },
  { id: "cat_medcard",     name: "Medical Card",   icon: "🏥", color: "#00B894", budgetAmount: 250,  renewalType: "renew"   },
  { id: "cat_ptptn",       name: "PTPTN",          icon: "📚", color: "#FDCB6E", budgetAmount: 250,  renewalType: "renew"   },
  // ── Bring Forward ──────────────────────────────────────
  { id: "cat_pet",         name: "Pet",            icon: "🐾", color: "#85C1E9", budgetAmount: 50,   renewalType: "forward" },
  { id: "cat_daily",       name: "Daily Product",  icon: "🧴", color: "#4ECDC4", budgetAmount: 75,   renewalType: "forward" },
  { id: "cat_gift",        name: "Gift",           icon: "🎁", color: "#FD79A8", budgetAmount: 100,  renewalType: "forward" },
  { id: "cat_medical",     name: "Medical",        icon: "💊", color: "#96CEB4", budgetAmount: 30,   renewalType: "forward" },
  { id: "cat_phone",       name: "Phone Bill",     icon: "📱", color: "#74B9FF", budgetAmount: 10,   renewalType: "forward" },
  { id: "cat_cloth",       name: "Cloth",          icon: "👗", color: "#F1948A", budgetAmount: 30,   renewalType: "forward" },
  { id: "cat_makeup",      name: "Makeup Product", icon: "💄", color: "#E84393", budgetAmount: 30,   renewalType: "forward" },
  { id: "cat_snack",       name: "Snack",          icon: "🍿", color: "#FFEAA7", budgetAmount: 50,   renewalType: "forward" },
  // ── Saving (bring forward — balance accumulates) ───────
  { id: "cat_saving",      name: "Normal Saving",  icon: "💰", color: "#00B894", budgetAmount: 400,  renewalType: "forward" },
  { id: "cat_invest",      name: "Investment",     icon: "📈", color: "#0984E3", budgetAmount: 300,  renewalType: "forward" },
];

/* ── Helpers ─────────────────────────────────────────── */
let _currentUid = null;

function _key(name) { return `budgetwise_${_currentUid}_${name}`; }

function _load(name, fallback) {
  try { const v = localStorage.getItem(_key(name)); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function _save(name, data) { localStorage.setItem(_key(name), JSON.stringify(data)); }

function initDataForUser(uid) {
  _currentUid = uid;

  // Version-based category migration:
  // If the stored version differs from DATA_VERSION, reset categories to new
  // defaults while keeping all transaction history intact.
  const storedVersion = _load("dataVersion", null);
  if (storedVersion !== DATA_VERSION) {
    _save("categories", DEFAULT_CATEGORIES);
    _save("dataVersion", DATA_VERSION);
    // Clear monthlyData so carry-forward is recalculated fresh
    _save("monthlyData", {});
  }

  if (!localStorage.getItem(_key("transactions"))) {
    _save("transactions", []);
  }
  // Run month-rollover check
  checkMonthRollover();
}

/* ── Month Rollover ──────────────────────────────────── */
function yyyymm(date) {
  const d = date || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function checkMonthRollover() {
  const currentMonth = yyyymm();
  const lastCheck    = _load("monthcheck", null);
  if (lastCheck === currentMonth) return; // already done for this month

  if (lastCheck && lastCheck !== currentMonth) {
    performMonthRollover(lastCheck, currentMonth);
  }
  _save("monthcheck", currentMonth);
}

function performMonthRollover(fromMonth, toMonth) {
  const categories  = getCategories();
  const monthlyData = _load("monthlyData", {});

  categories.forEach(cat => {
    if (cat.budgetAmount <= 0) return; // no budget set, skip

    const fromData = (monthlyData[fromMonth] || {})[cat.id] || {};
    const prevBudget = fromData.budgetAmount != null ? fromData.budgetAmount : cat.budgetAmount;
    const prevSpent  = getSpentInMonth(cat.id, fromMonth);
    const prevLeft   = Math.max(0, prevBudget - prevSpent);

    if (!monthlyData[toMonth]) monthlyData[toMonth] = {};

    if (cat.renewalType === "forward" && prevLeft > 0) {
      // Carry the leftover → new budget = base + leftover
      monthlyData[toMonth][cat.id] = {
        budgetAmount: cat.budgetAmount + prevLeft,
        carryOver: prevLeft,
      };
    } else {
      // Renew: just reset to no override (uses cat.budgetAmount directly)
      monthlyData[toMonth][cat.id] = {
        budgetAmount: cat.budgetAmount,
        carryOver: 0,
      };
    }
  });
  _save("monthlyData", monthlyData);
}

/* ── Categories ──────────────────────────────────────── */
function getCategories() { return _load("categories", []); }

function getCategoryById(id) { return getCategories().find(c => c.id === id); }

function saveCategory(cat) {
  const cats = getCategories();
  const idx  = cats.findIndex(c => c.id === cat.id);
  if (idx >= 0) {
    cats[idx] = cat;
    // If budget amount changed, update this month's entry
    updateMonthlyBudgetEntry(cat.id, cat.budgetAmount);
  } else {
    cats.push(cat);
  }
  _save("categories", cats);
}

function deleteCategory(id) {
  let cats = getCategories();
  cats = cats.filter(c => c.id !== id);
  _save("categories", cats);
  // Remove transactions for this category
  let txns = getTransactions();
  txns = txns.filter(t => t.categoryId !== id);
  _save("transactions", txns);
}

/** When a category budget is updated mid-month, refresh the current month's budget entry */
function updateMonthlyBudgetEntry(catId, newBase) {
  const currentMonth = yyyymm();
  const monthlyData  = _load("monthlyData", {});
  if (!monthlyData[currentMonth]) monthlyData[currentMonth] = {};
  const existing = monthlyData[currentMonth][catId] || {};
  const carryOver = existing.carryOver || 0;
  monthlyData[currentMonth][catId] = {
    budgetAmount: newBase + carryOver,
    carryOver: carryOver,
  };
  _save("monthlyData", monthlyData);
}

/* ── Transactions ────────────────────────────────────── */
function getTransactions() { return _load("transactions", []); }

function saveTransaction(txn) {
  const txns = getTransactions();
  const idx  = txns.findIndex(t => t.id === txn.id);
  if (idx >= 0) txns[idx] = txn;
  else txns.push(txn);
  _save("transactions", txns);
}

function deleteTransaction(id) {
  let txns = getTransactions();
  txns = txns.filter(t => t.id !== id);
  _save("transactions", txns);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ── Budget / Monthly helpers ────────────────────────── */
/**
 * Returns the effective budget for a category in a given "YYYY-MM".
 * Priority: monthlyData override → category base amount.
 */
function getEffectiveBudget(catId, month) {
  const monthlyData = _load("monthlyData", {});
  const entry = (monthlyData[month] || {})[catId];
  if (entry && entry.budgetAmount != null) return entry.budgetAmount;
  const cat = getCategoryById(catId);
  return cat ? cat.budgetAmount : 0;
}

/** Sum of all transactions for a category in "YYYY-MM" */
function getSpentInMonth(catId, month) {
  const txns = getTransactions();
  return txns
    .filter(t => t.categoryId === catId && t.date && t.date.startsWith(month))
    .reduce((sum, t) => sum + Number(t.amount), 0);
}

/** Full budget summary for a given month */
function getBudgetSummaryForMonth(month) {
  const cats = getCategories();
  return cats.map(cat => {
    const budget  = getEffectiveBudget(cat.id, month);
    const spent   = getSpentInMonth(cat.id, month);
    const left    = budget - spent;
    return { ...cat, budget, spent, left };
  });
}

/** Spending by category for a period (array of {date} strings overlapping) */
function getSpentByCategory(txns) {
  const map = {};
  txns.forEach(t => {
    map[t.categoryId] = (map[t.categoryId] || 0) + Number(t.amount);
  });
  return map;
}

/* ── Settings ────────────────────────────────────────── */
function getSettings() {
  return _load("settings", { theme: "light", language: "en" });
}
function saveSettings(s) { _save("settings", s); }

/* ── Date Filter Helpers ─────────────────────────────── */
function filterTransactionsByPeriod(txns, period, from, to) {
  const now   = new Date();
  const today = toLocalDateStr(now);

  if (period === "all") return txns;
  if (period === "daily") return txns.filter(t => t.date === today);
  if (period === "weekly") {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    const startStr = toLocalDateStr(start);
    return txns.filter(t => t.date >= startStr && t.date <= today);
  }
  if (period === "monthly") {
    const prefix = yyyymm(now);
    return txns.filter(t => t.date && t.date.startsWith(prefix));
  }
  if (period === "yearly") {
    const year = now.getFullYear().toString();
    return txns.filter(t => t.date && t.date.startsWith(year));
  }
  if (period === "custom" && from && to) {
    return txns.filter(t => t.date >= from && t.date <= to);
  }
  return txns;
}

function toLocalDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
