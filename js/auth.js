/**
 * auth.js — Authentication logic (Firebase + LocalStorage fallback)
 *
 * If Firebase is configured → uses Firebase Auth (email/password + Google).
 * If Firebase is NOT configured → uses a simple localStorage-based auth
 *   for demo purposes (passwords stored as-is – dev/demo use only).
 */

/* ─────────────────────────────────────────────────────────────
   STATE
───────────────────────────────────────────────────────────── */
let currentUser = null; // { uid, displayName, email, photoURL }

function showLoadingOverlay() {
  const el = document.getElementById("loading-overlay");
  if (el) el.classList.remove("hidden");
}
function hideLoadingOverlay() {
  const el = document.getElementById("loading-overlay");
  if (el) el.classList.add("hidden");
}

/* ─────────────────────────────────────────────────────────────
   UI HELPERS
───────────────────────────────────────────────────────────── */
function switchAuthTab(tab) {
  document.getElementById("tab-login").classList.toggle("active", tab === "login");
  document.getElementById("tab-register").classList.toggle("active", tab === "register");
  document.getElementById("login-form").classList.toggle("hidden", tab !== "login");
  document.getElementById("register-form").classList.toggle("hidden", tab !== "register");
}

function setAuthError(formId, msg) {
  const el = document.getElementById(formId === "login" ? "login-error" : "register-error");
  if (el) el.textContent = msg;
}

function togglePw(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isText = input.type === "text";
  input.type = isText ? "password" : "text";
  btn.style.opacity = isText ? "0.5" : "1";
}

/* ─────────────────────────────────────────────────────────────
   FIREBASE AUTH
───────────────────────────────────────────────────────────── */
function handleEmailLogin(e) {
  e.preventDefault();
  setAuthError("login", "");
  const email    = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  if (firebaseEnabled) {
    firebaseAuth.signInWithEmailAndPassword(email, password)
      .catch(err => setAuthError("login", mapFirebaseError(err.code)));
  } else {
    localLogin(email, password);
  }
}

function handleEmailRegister(e) {
  e.preventDefault();
  setAuthError("register", "");
  const name     = document.getElementById("reg-name").value.trim();
  const email    = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-password").value;

  if (firebaseEnabled) {
    firebaseAuth.createUserWithEmailAndPassword(email, password)
      .then(cred => cred.user.updateProfile({ displayName: name }))
      .then(() => firebaseAuth.currentUser.reload())
      .catch(err => setAuthError("register", mapFirebaseError(err.code)));
  } else {
    localRegister(name, email, password);
  }
}

function handleGoogleLogin() {
  if (!firebaseEnabled) {
    showToast("Firebase not configured. See js/firebase-config.js");
    return;
  }
  const provider = new firebase.auth.GoogleAuthProvider();
  firebaseAuth.signInWithPopup(provider)
    .catch(err => {
      if (err.code !== "auth/popup-closed-by-user") {
        setAuthError("login", mapFirebaseError(err.code));
      }
    });
}

function handleLogout() {
  if (!confirm(t("logoutConfirm"))) return;
  if (firebaseEnabled) {
    firebaseAuth.signOut();
  } else {
    localLogout();
  }
}

function mapFirebaseError(code) {
  const map = {
    "auth/user-not-found":       "No account found with this email.",
    "auth/wrong-password":       "Incorrect password.",
    "auth/email-already-in-use": "This email is already registered.",
    "auth/weak-password":        "Password must be at least 6 characters.",
    "auth/invalid-email":        "Please enter a valid email address.",
    "auth/too-many-requests":    "Too many attempts. Please try again later.",
    "auth/network-request-failed": "Network error. Check your connection.",
    "auth/invalid-credential":   "Invalid email or password.",
  };
  return map[code] || "Authentication error. Please try again.";
}

/* ─────────────────────────────────────────────────────────────
   LOCAL AUTH FALLBACK (when Firebase is not configured)
   ⚠️  For development/demo only. Not secure for production.
───────────────────────────────────────────────────────────── */
const LOCAL_USERS_KEY = "budgetwise_local_users";
const LOCAL_SESSION_KEY = "budgetwise_local_session";

function getLocalUsers() {
  try { return JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || "[]"); } catch { return []; }
}

function localRegister(name, email, password) {
  const users = getLocalUsers();
  if (users.find(u => u.email === email)) {
    setAuthError("register", "This email is already registered.");
    return;
  }
  const uid = "local_" + generateId();
  const newUser = { uid, displayName: name, email, password };
  users.push(newUser);
  localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
  saveLocalSession(newUser);
  onUserSignedIn({ uid, displayName: name, email, photoURL: null });
}

function localLogin(email, password) {
  const users = getLocalUsers();
  const user  = users.find(u => u.email === email && u.password === password);
  if (!user) {
    setAuthError("login", "Incorrect email or password.");
    return;
  }
  saveLocalSession(user);
  onUserSignedIn({ uid: user.uid, displayName: user.displayName, email: user.email, photoURL: null });
}

function saveLocalSession(user) {
  localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify({ uid: user.uid, displayName: user.displayName, email: user.email }));
}

function localLogout() {
  localStorage.removeItem(LOCAL_SESSION_KEY);
  onUserSignedOut();
}

function checkLocalSession() {
  const session = localStorage.getItem(LOCAL_SESSION_KEY);
  if (session) {
    try {
      const user = JSON.parse(session);
      onUserSignedIn({ uid: user.uid, displayName: user.displayName, email: user.email, photoURL: null });
    } catch { localStorage.removeItem(LOCAL_SESSION_KEY); }
  }
}

/* ─────────────────────────────────────────────────────────────
   AUTH STATE OBSERVER
───────────────────────────────────────────────────────────── */
function initAuth() {
  if (firebaseEnabled) {
    firebaseAuth.onAuthStateChanged(fbUser => {
      if (fbUser) {
        onUserSignedIn({
          uid:         fbUser.uid,
          displayName: fbUser.displayName || fbUser.email.split("@")[0],
          email:       fbUser.email,
          photoURL:    fbUser.photoURL || null,
        });
      } else {
        onUserSignedOut();
      }
    });
  } else {
    // Use local session
    checkLocalSession();
  }
}

async function onUserSignedIn(user) {
  showLoadingOverlay();
  currentUser = user;
  await initDataForUser(user.uid);

  const settings = getSettings();
  setLanguage(settings.language || "en");
  applyTranslations();

  // Apply saved theme
  const savedTheme = settings.theme || "light";
  document.documentElement.setAttribute("data-theme", savedTheme);
  const toggle = document.getElementById("dark-mode-toggle");
  if (toggle) toggle.checked = savedTheme === "dark";

  // Update sidebar user info
  updateUserUI(user);

  // Hide auth, show app
  document.getElementById("auth-screen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");

  // Navigate to transaction page (default)
  hideLoadingOverlay();
  navigateTo("transaction");
}

function onUserSignedOut() {
  cleanupDataListeners();
  currentUser = null;
  document.getElementById("app").classList.add("hidden");
  document.getElementById("auth-screen").classList.remove("hidden");
  // Clear auth form errors
  ["login-error", "register-error"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = "";
  });
}

function updateUserUI(user) {
  const avatarEl = document.getElementById("sidebar-avatar");
  const nameEl   = document.getElementById("sidebar-username");
  const emailEl  = document.getElementById("sidebar-email");

  if (nameEl)  nameEl.textContent  = user.displayName || "";
  if (emailEl) emailEl.textContent = user.email || "";

  if (avatarEl) {
    if (user.photoURL) {
      avatarEl.innerHTML = `<img src="${user.photoURL}" alt="${user.displayName}" />`;
    } else {
      const initials = (user.displayName || user.email || "U")
        .split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2);
      avatarEl.textContent = initials;
    }
  }

  // Settings page
  const sName  = document.getElementById("settings-user-name");
  const sEmail = document.getElementById("settings-user-email");
  if (sName)  sName.textContent  = user.displayName || "";
  if (sEmail) sEmail.textContent = user.email || "";
}
