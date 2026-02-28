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
const DEFAULT_CATEGORIES = [
  { id: "cat_food",       name: "Food & Dining",    icon: "🍜", color: "#FF6B6B", budgetAmount: 0, renewalType: "renew" },
  { id: "cat_transport",  name: "Transport",        icon: "🚗", color: "#4ECDC4", budgetAmount: 0, renewalType: "renew" },
  { id: "cat_shopping",   name: "Shopping",         icon: "🛍️", color: "#45B7D1", budgetAmount: 0, renewalType: "renew" },
  { id: "cat_entertain",  name: "Entertainment",    icon: "🎬", color: "#96CEB4", budgetAmount: 0, renewalType: "renew" },
  { id: "cat_health",     name: "Health",           icon: "💊", color: "#FFEAA7", budgetAmount: 0, renewalType: "renew" },
  { id: "cat_housing",    name: "Housing",          icon: "🏠", color: "#DDA0DD", budgetAmount: 0, renewalType: "renew" },
  { id: "cat_utilities",  name: "Utilities",        icon: "💡", color: "#98D8C8", budgetAmount: 0, renewalType: "renew" },
  { id: "cat_education",  name: "Education",        icon: "📚", color: "#F7DC6F", budgetAmount: 0, renewalType: "renew" },
  { id: "cat_travel",     name: "Travel",           icon: "✈️", color: "#BB8FCE", budgetAmount: 0, renewalType: "renew" },
  { id: "cat_pets",       name: "Pets",             icon: "🐾", color: "#85C1E9", budgetAmount: 0, renewalType: "renew" },
  { id: "cat_personal",   name: "Personal Care",    icon: "💆", color: "#F1948A", budgetAmount: 0, renewalType: "renew" },
  { id: "cat_others",     name: "Others",           icon: "📦", color: "#AEB6BF", budgetAmount: 0, renewalType: "renew" },
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
  // Seed default categories if first time
  if (!localStorage.getItem(_key("categories"))) {
    _save("categories", DEFAULT_CATEGORIES);
  }
  if (!localStorage.getItem(_key("transactions"))) {
    _save("transactions", []);
  }
  if (!localStorage.getItem(_key("monthlyData"))) {
    _save("monthlyData", {});
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
