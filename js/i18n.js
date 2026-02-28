/**
 * i18n.js — Internationalization (English & Simplified Chinese)
 */

const TRANSLATIONS = {
  en: {
    appName: "BudgetWise",
    authWelcome: "Welcome Back",
    authSubtitle: "Manage your finances simply",
    login: "Login",
    register: "Register",
    email: "Email",
    password: "Password",
    displayName: "Display Name",
    loginBtn: "Login",
    registerBtn: "Create Account",
    orContinue: "or continue with",
    googleSignIn: "Sign in with Google",

    navRecord: "Add Record",
    navTransaction: "Transactions",
    navSummary: "Summary",
    navSettings: "Budget & Settings",

    pageRecord: "Add Record",
    pageTransaction: "Transactions",
    pageSummary: "Summary",
    pageSettings: "Budget & Settings",

    category: "Category",
    description: "Description",
    descriptionPlaceholder: "e.g. Lunch, Grab ride...",
    amount: "Amount",
    date: "Date",
    cancel: "Cancel",
    saveRecord: "Save Record",
    recordSaved: "Record saved!",
    recordDeleted: "Record deleted.",
    selectCategory: "Please select a category",
    enterAmount: "Please enter a valid amount",

    filterPeriod: "Period",
    filterCategory: "Category",
    all: "All",
    daily: "Today",
    weekly: "This Week",
    monthly: "This Month",
    yearly: "This Year",
    custom: "Custom Range",
    from: "From",
    to: "To",
    search: "Description Search",
    searchPlaceholder: "Type to search...",
    noTransactions: "No transactions found",

    totalSpent: "Total Spent",
    totalBudget: "Total Budget",
    totalLeft: "Remaining",
    expensesByCategory: "Expenses by Category",
    budgetSummary: "Budget Summary",
    budget: "Budget",
    spent: "Spent",
    remaining: "Remaining",
    progress: "Progress",
    noCategories: "No categories yet. Add one in Settings.",
    noBudgetSet: "No budget set",

    categoryBudgets: "Category Budgets",
    addCategory: "+ Add Category",
    editCategory: "Edit Category",
    monthlyBudget: "Monthly Budget",
    renewal: "Renewal",
    actions: "Actions",
    renewOption: "Renew",
    renewDesc: "Reset budget at start of each month",
    forwardOption: "Bring Forward",
    forwardDesc: "Carry unspent balance to next month",
    categoryName: "Category Name",
    categoryIcon: "Icon",
    categoryColor: "Color",
    save: "Save",
    deleteCategory: "Delete this category and all its transactions?",
    categorySaved: "Category saved!",
    categoryDeleted: "Category deleted.",

    appearance: "Appearance",
    darkMode: "Dark Mode",
    darkModeDesc: "Switch between light and dark theme",
    language: "Language",
    languageDesc: "Select your preferred language",
    account: "Account",
    logout: "Logout",
    logoutConfirm: "Are you sure you want to logout?",

    editRecord: "Edit Record",
    deleteRecord: "Delete this record?",
    update: "Update",
  },
  zh: {
    appName: "预算管家",
    authWelcome: "欢迎回来",
    authSubtitle: "简单管理您的财务",
    login: "登录",
    register: "注册",
    email: "邮箱",
    password: "密码",
    displayName: "显示名称",
    loginBtn: "登录",
    registerBtn: "创建账户",
    orContinue: "或继续使用",
    googleSignIn: "使用 Google 登录",

    navRecord: "添加记录",
    navTransaction: "交易",
    navSummary: "汇总",
    navSettings: "预算与设置",

    pageRecord: "添加记录",
    pageTransaction: "交易记录",
    pageSummary: "汇总",
    pageSettings: "预算与设置",

    category: "分类",
    description: "描述",
    descriptionPlaceholder: "例如：午餐、打车...",
    amount: "金额",
    date: "日期",
    cancel: "取消",
    saveRecord: "保存记录",
    recordSaved: "记录已保存！",
    recordDeleted: "记录已删除。",
    selectCategory: "请选择一个分类",
    enterAmount: "请输入有效金额",

    filterPeriod: "时间段",
    filterCategory: "分类",
    all: "全部",
    daily: "今天",
    weekly: "本周",
    monthly: "本月",
    yearly: "今年",
    custom: "自定义范围",
    from: "从",
    to: "到",
    search: "描述搜索",
    searchPlaceholder: "输入搜索...",
    noTransactions: "没有找到交易记录",

    totalSpent: "已花费",
    totalBudget: "总预算",
    totalLeft: "剩余",
    expensesByCategory: "各分类支出",
    budgetSummary: "预算汇总",
    budget: "预算",
    spent: "已花费",
    remaining: "剩余",
    progress: "进度",
    noCategories: "暂无分类，请在设置中添加。",
    noBudgetSet: "未设置预算",

    categoryBudgets: "分类预算",
    addCategory: "+ 添加分类",
    editCategory: "编辑分类",
    monthlyBudget: "月度预算",
    renewal: "续期方式",
    actions: "操作",
    renewOption: "重置",
    renewDesc: "每月初重置预算",
    forwardOption: "结转",
    forwardDesc: "将未花完的余额结转到下月",
    categoryName: "分类名称",
    categoryIcon: "图标",
    categoryColor: "颜色",
    save: "保存",
    deleteCategory: "确定删除此分类及其所有交易记录？",
    categorySaved: "分类已保存！",
    categoryDeleted: "分类已删除。",

    appearance: "外观",
    darkMode: "深色模式",
    darkModeDesc: "切换明暗主题",
    language: "语言",
    languageDesc: "选择您的首选语言",
    account: "账户",
    logout: "退出登录",
    logoutConfirm: "确定要退出登录吗？",

    editRecord: "编辑记录",
    deleteRecord: "确定要删除这条记录吗？",
    update: "更新",
  }
};

let currentLang = "en";

function t(key) {
  return (TRANSLATIONS[currentLang] && TRANSLATIONS[currentLang][key]) ||
         (TRANSLATIONS["en"] && TRANSLATIONS["en"][key]) ||
         key;
}

function setLanguage(lang) {
  if (!TRANSLATIONS[lang]) return;
  currentLang = lang;
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  applyTranslations();
}

function applyTranslations() {
  // data-i18n text content
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    el.textContent = t(key);
  });
  // data-i18n-placeholder
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const key = el.getAttribute("data-i18n-placeholder");
    el.placeholder = t(key);
  });
}
