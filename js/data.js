/**
 * data.js — Firestore-backed data layer with in-memory cache.
 *
 * Firestore structure (per user):
 *   users/{uid}/meta/categories   → { items: Category[]  }
 *   users/{uid}/meta/settings     → { theme, language    }
 *   users/{uid}/meta/monthlyData  → { months: { ... }    }
 *   users/{uid}/meta/monthcheck   → { value: "YYYY-MM"   }
 *   users/{uid}/transactions/{id} → Transaction doc
 *
 * Public API is synchronous (reads from in-memory cache).
 * Writes update Firestore + cache immediately (optimistic).
 * onSnapshot listeners keep cache in sync across devices.
 * Falls back to localStorage when Firebase is not configured.
 */

/* ── Default Categories ──────────────────────────────── */
const DEFAULT_CATEGORIES = [
  // Renew every month
  { id: "cat_meal",        name: "Meal",            icon: "🍜", color: "#FF6B6B", budgetAmount: 300, renewalType: "renew",   sortOrder: 0  },
  { id: "cat_ingredient",  name: "Ingredient",      icon: "🥗", color: "#56AB2F", budgetAmount: 200, renewalType: "renew",   sortOrder: 1  },
  { id: "cat_transport",   name: "Transport",       icon: "🚗", color: "#4ECDC4", budgetAmount: 100, renewalType: "renew",   sortOrder: 2  },
  { id: "cat_entertain",   name: "Entertainment",   icon: "🎬", color: "#96CEB4", budgetAmount: 200, renewalType: "renew",   sortOrder: 3  },
  { id: "cat_rental",      name: "Rental",          icon: "🏠", color: "#DDA0DD", budgetAmount: 600, renewalType: "renew",   sortOrder: 4  },
  { id: "cat_medicalcard", name: "Medical Card",    icon: "💳", color: "#FFEAA7", budgetAmount: 250, renewalType: "renew",   sortOrder: 5  },
  { id: "cat_ptptn",       name: "PTPTN",           icon: "🎓", color: "#F7DC6F", budgetAmount: 200, renewalType: "renew",   sortOrder: 6  },
  // Bring forward remaining amount to next month
  { id: "cat_pet",         name: "Pet",             icon: "🐾", color: "#85C1E9", budgetAmount: 50,  renewalType: "forward", sortOrder: 7  },
  { id: "cat_dailyproduct",name: "Daily Product",   icon: "🧴", color: "#98D8C8", budgetAmount: 25,  renewalType: "forward", sortOrder: 8  },
  { id: "cat_gift",        name: "Gift",            icon: "🎁", color: "#FD79A8", budgetAmount: 130, renewalType: "forward", sortOrder: 9  },
  { id: "cat_medical",     name: "Medical",         icon: "💊", color: "#D63031", budgetAmount: 20,  renewalType: "forward", sortOrder: 10 },
  { id: "cat_phonebill",   name: "Phone Bill",      icon: "📱", color: "#45B7D1", budgetAmount: 15,  renewalType: "forward", sortOrder: 11 },
  { id: "cat_cloth",       name: "Cloth",           icon: "👔", color: "#6C5CE7", budgetAmount: 30,  renewalType: "forward", sortOrder: 12 },
  { id: "cat_makeup",      name: "Makeup Product",  icon: "💄", color: "#E84393", budgetAmount: 30,  renewalType: "forward", sortOrder: 13 },
  { id: "cat_snack",       name: "Snack",           icon: "🍦", color: "#FF8E53", budgetAmount: 50,  renewalType: "forward", sortOrder: 14 },
];

/* ── In-Memory Cache ─────────────────────────────────── */
let _cache = {
  categories:   [],
  transactions: [],
  settings:     { theme: "light", language: "en" },
  monthlyData:  {},
  monthcheck:   null,
};

/* ── State ───────────────────────────────────────────── */
let _uid           = null;
let _unsubscribers = [];
let _onDataChange  = null;
let _useFirestore  = false;

/* ── Firestore refs ──────────────────────────────────── */
function _db()         { return (typeof firebaseFirestore !== "undefined") ? firebaseFirestore : null; }
function _userRef()    { return _db().collection("users").doc(_uid); }
function _metaRef(doc) { return _userRef().collection("meta").doc(doc); }
function _txnsRef()    { return _userRef().collection("transactions"); }

/* ── Data Change Callback ────────────────────────────── */
function setDataChangeCallback(fn) { _onDataChange = fn; }
function _triggerChange() { if (_onDataChange) _onDataChange(); }

/* ════════════════════════════════════════════════════════
   INIT
════════════════════════════════════════════════════════ */
async function initDataForUser(uid) {
  _unsubscribers.forEach(u => u());
  _unsubscribers = [];
  _uid = uid;
  if (_db() && typeof firebaseEnabled !== "undefined" && firebaseEnabled) {
    _useFirestore = true;
    await _firestoreInit();
  } else {
    _useFirestore = false;
    _localStorageInit();
  }
}

async function _firestoreInit() {
  try {
    const [settingsSnap, monthlySnap, checkSnap] = await Promise.all([
      _metaRef("settings").get(),
      _metaRef("monthlyData").get(),
      _metaRef("monthcheck").get(),
    ]);
    if (settingsSnap.exists)  _cache.settings    = { theme: "light", language: "en", ...settingsSnap.data() };
    if (monthlySnap.exists)   _cache.monthlyData = monthlySnap.data().months || {};
    if (checkSnap.exists)     _cache.monthcheck  = checkSnap.data().value || null;
  } catch (e) { console.warn("[Data] Meta load error:", e); }
  await _attachListeners();
  await checkMonthRollover();
}

function _attachListeners() {
  return new Promise(resolve => {
    let catsReady = false, txnsReady = false, resolved = false;
    function checkReady() {
      if (catsReady && txnsReady && !resolved) {
        resolved = true;
        if (_cache.categories.length === 0) _seedDefaultCategories();
        resolve();
      }
    }
    const unsubCats = _metaRef("categories").onSnapshot(snap => {
      _cache.categories = (snap.exists && Array.isArray(snap.data().items)) ? snap.data().items : [];
      if (!catsReady) { catsReady = true; checkReady(); } else _triggerChange();
    }, () => { if (!catsReady) { catsReady = true; checkReady(); } });

    const unsubTxns = _txnsRef().onSnapshot(snap => {
      _cache.transactions = snap.docs.map(d => d.data());
      if (!txnsReady) { txnsReady = true; checkReady(); } else _triggerChange();
    }, () => { if (!txnsReady) { txnsReady = true; checkReady(); } });

    _unsubscribers.push(unsubCats, unsubTxns);
    setTimeout(() => { if (!resolved) { resolved = true; resolve(); } }, 8000);
  });
}

async function _seedDefaultCategories() {
  _cache.categories = DEFAULT_CATEGORIES.slice();
  try { await _metaRef("categories").set({ items: _cache.categories }); }
  catch (e) { console.warn("[Data] Seed error:", e); }
}

function cleanupDataListeners() {
  _unsubscribers.forEach(u => u());
  _unsubscribers = [];
  _uid = null;
  _cache = { categories: [], transactions: [], settings: { theme: "light", language: "en" }, monthlyData: {}, monthcheck: null };
}

/* ── localStorage fallback ───────────────────────────── */
function _lsKey(n)       { return `budgetwise_${_uid}_${n}`; }
function _lsLoad(n, def) { try { const v = localStorage.getItem(_lsKey(n)); return v ? JSON.parse(v) : def; } catch { return def; } }
function _lsSave(n, d)   { localStorage.setItem(_lsKey(n), JSON.stringify(d)); }

function _localStorageInit() {
  if (!localStorage.getItem(_lsKey("categories"))) _lsSave("categories", DEFAULT_CATEGORIES);
  _cache.categories   = _lsLoad("categories", DEFAULT_CATEGORIES);
  _cache.transactions = _lsLoad("transactions", []);
  _cache.settings     = _lsLoad("settings", { theme: "light", language: "en" });
  _cache.monthlyData  = _lsLoad("monthlyData", {});
  _cache.monthcheck   = _lsLoad("monthcheck", null);
  checkMonthRollover();
}

/* ════════════════════════════════════════════════════════
   MONTH ROLLOVER
════════════════════════════════════════════════════════ */
function yyyymm(date) {
  const d = date || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function checkMonthRollover() {
  const currentMonth = yyyymm();
  const lastCheck    = _cache.monthcheck;
  if (lastCheck === currentMonth) return;
  if (lastCheck && lastCheck !== currentMonth) await performMonthRollover(lastCheck, currentMonth);
  _cache.monthcheck = currentMonth;
  if (_useFirestore) {
    try { await _metaRef("monthcheck").set({ value: currentMonth }); } catch (e) { console.warn(e); }
  } else {
    _lsSave("monthcheck", currentMonth);
  }
}

async function performMonthRollover(fromMonth, toMonth) {
  const categories  = getCategories();
  const monthlyData = { ..._cache.monthlyData };

  // Snapshot from-month's effective budgets so past months are frozen
  if (!monthlyData[fromMonth]) monthlyData[fromMonth] = {};
  categories.forEach(cat => {
    if (!monthlyData[fromMonth][cat.id]) {
      monthlyData[fromMonth][cat.id] = { budgetAmount: cat.budgetAmount, carryOver: 0 };
    }
  });

  categories.forEach(cat => {
    if (cat.budgetAmount <= 0) return;
    const fromData   = (monthlyData[fromMonth] || {})[cat.id] || {};
    const prevBudget = fromData.budgetAmount != null ? fromData.budgetAmount : cat.budgetAmount;
    const prevSpent  = getSpentInMonth(cat.id, fromMonth);
    if (!monthlyData[toMonth]) monthlyData[toMonth] = {};
    if (cat.renewalType === "forward") {
      // Carry forward the remaining amount (can be negative).
      // New budget = previous remaining + this month's base budget.
      const prevLeft = prevBudget - prevSpent;
      monthlyData[toMonth][cat.id] = { budgetAmount: cat.budgetAmount + prevLeft, carryOver: prevLeft };
    } else {
      monthlyData[toMonth][cat.id] = { budgetAmount: cat.budgetAmount, carryOver: 0 };
    }
  });
  _cache.monthlyData = monthlyData;
  if (_useFirestore) {
    try { await _metaRef("monthlyData").set({ months: monthlyData }); } catch (e) { console.warn(e); }
  } else {
    _lsSave("monthlyData", monthlyData);
  }
}

/* ════════════════════════════════════════════════════════
   CATEGORIES
════════════════════════════════════════════════════════ */
function getCategories()      { return _cache.categories; }
function getCategoryById(id)  { return _cache.categories.find(c => c.id === id); }

function saveCategory(cat) {
  const cats = [..._cache.categories];
  const idx  = cats.findIndex(c => c.id === cat.id);
  if (idx >= 0) { cats[idx] = { ...cats[idx], ...cat }; _updateMonthlyBudgetEntry(cat.id, cat.budgetAmount); }
  else          { cat.sortOrder = cats.length; cats.push(cat); }
  _cache.categories = cats;
  if (_useFirestore) {
    _metaRef("categories").set({ items: cats }).catch(e => console.warn("[Data] saveCategory:", e));
  } else { _lsSave("categories", cats); }
}

function deleteCategory(id) {
  _cache.categories   = _cache.categories.filter(c => c.id !== id);
  _cache.transactions = _cache.transactions.filter(t => t.categoryId !== id);
  if (_useFirestore) {
    _metaRef("categories").set({ items: _cache.categories }).catch(e => console.warn(e));
    _txnsRef().where("categoryId", "==", id).get().then(snap => {
      if (snap.empty) return;
      const b = _db().batch();
      snap.docs.forEach(d => b.delete(d.ref));
      return b.commit();
    }).catch(e => console.warn("[Data] deleteCategory txns:", e));
  } else {
    _lsSave("categories",   _cache.categories);
    _lsSave("transactions", _cache.transactions);
  }
}

function reorderCategories(idOrder) {
  const catMap    = Object.fromEntries(_cache.categories.map(c => [c.id, c]));
  const reordered = idOrder.map((id, i) => catMap[id] ? { ...catMap[id], sortOrder: i } : null).filter(Boolean);
  _cache.categories.forEach(c => { if (!idOrder.includes(c.id)) reordered.push(c); });
  _cache.categories = reordered;
  if (_useFirestore) {
    _metaRef("categories").set({ items: reordered }).catch(e => console.warn("[Data] reorder:", e));
  } else { _lsSave("categories", reordered); }
}

function _updateMonthlyBudgetEntry(catId, newBase) {
  const currentMonth = yyyymm();
  const monthlyData  = { ..._cache.monthlyData };
  if (!monthlyData[currentMonth]) monthlyData[currentMonth] = {};
  const existing  = monthlyData[currentMonth][catId] || {};
  const carryOver = existing.carryOver || 0;
  monthlyData[currentMonth][catId] = { budgetAmount: newBase + carryOver, carryOver };
  _cache.monthlyData = monthlyData;
  if (_useFirestore) {
    _metaRef("monthlyData").set({ months: monthlyData }).catch(e => console.warn(e));
  } else { _lsSave("monthlyData", monthlyData); }
}

function setMonthlyBudget(catId, month, budgetAmount) {
  const monthlyData = { ..._cache.monthlyData };
  if (!monthlyData[month]) monthlyData[month] = {};
  const existing  = monthlyData[month][catId] || {};
  const carryOver = existing.carryOver || 0;
  monthlyData[month][catId] = { budgetAmount, carryOver };
  _cache.monthlyData = monthlyData;
  if (_useFirestore) {
    _metaRef("monthlyData").set({ months: monthlyData }).catch(e => console.warn(e));
  } else { _lsSave("monthlyData", monthlyData); }
}

function getMonthlyCarryOver(catId, month) {
  const entry = (_cache.monthlyData[month] || {})[catId];
  return (entry && entry.carryOver) || 0;
}

/* ════════════════════════════════════════════════════════
   TRANSACTIONS
════════════════════════════════════════════════════════ */
function getTransactions() { return _cache.transactions; }

function saveTransaction(txn) {
  const txns = [..._cache.transactions];
  const idx  = txns.findIndex(t => t.id === txn.id);
  if (idx >= 0) txns[idx] = txn; else txns.push(txn);
  _cache.transactions = txns;
  if (_useFirestore) {
    _txnsRef().doc(txn.id).set(txn).catch(e => console.warn("[Data] saveTransaction:", e));
  } else { _lsSave("transactions", txns); }
}

function deleteTransaction(id) {
  _cache.transactions = _cache.transactions.filter(t => t.id !== id);
  if (_useFirestore) {
    _txnsRef().doc(id).delete().catch(e => console.warn("[Data] deleteTransaction:", e));
  } else { _lsSave("transactions", _cache.transactions); }
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ════════════════════════════════════════════════════════
   SETTINGS
════════════════════════════════════════════════════════ */
function getSettings() { return _cache.settings; }

function saveSettings(s) {
  _cache.settings = { ..._cache.settings, ...s };
  if (_useFirestore) {
    _metaRef("settings").set(_cache.settings).catch(e => console.warn("[Data] saveSettings:", e));
  } else { _lsSave("settings", _cache.settings); }
}

/* ════════════════════════════════════════════════════════
   BUDGET HELPERS
════════════════════════════════════════════════════════ */
function getEffectiveBudget(catId, month) {
  const entry = (_cache.monthlyData[month] || {})[catId];
  if (entry && entry.budgetAmount != null) return entry.budgetAmount;
  const cat = getCategoryById(catId);
  return cat ? cat.budgetAmount : 0;
}

function getSpentInMonth(catId, month) {
  return _cache.transactions
    .filter(t => t.categoryId === catId && t.date && t.date.startsWith(month))
    .reduce((sum, t) => sum + Number(t.amount), 0);
}

function getBudgetSummaryForMonth(month) {
  return getCategories().map(cat => {
    const budget = getEffectiveBudget(cat.id, month);
    const spent  = getSpentInMonth(cat.id, month);
    return { ...cat, budget, spent, left: budget - spent };
  });
}

function getSpentByCategory(txns) {
  const map = {};
  txns.forEach(t => { map[t.categoryId] = (map[t.categoryId] || 0) + Number(t.amount); });
  return map;
}

/* ════════════════════════════════════════════════════════
   DATE / FILTER HELPERS
════════════════════════════════════════════════════════ */
function filterTransactionsByPeriod(txns, period, from, to) {
  const now   = new Date();
  const today = toLocalDateStr(now);
  if (period === "all")     return txns;
  if (period === "daily")   return txns.filter(t => t.date === today);
  if (period === "weekly") {
    const start = new Date(now); start.setDate(now.getDate() - now.getDay());
    return txns.filter(t => t.date >= toLocalDateStr(start) && t.date <= today);
  }
  if (period === "monthly") { const p = yyyymm(now); return txns.filter(t => t.date && t.date.startsWith(p)); }
  if (period === "yearly")  { const y = String(now.getFullYear()); return txns.filter(t => t.date && t.date.startsWith(y)); }
  if (period === "custom" && from && to) return txns.filter(t => t.date >= from && t.date <= to);
  return txns;
}

function toLocalDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
