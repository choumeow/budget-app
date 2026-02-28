/**
 * firebase-config.js
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │  HOW TO SET UP FIREBASE (required for Google Sign-In)       │
 * │                                                             │
 * │  1. Go to https://console.firebase.google.com               │
 * │  2. Create a new project (or use existing)                  │
 * │  3. Click "Add app" > Web icon (</>)                        │
 * │  4. Copy the firebaseConfig object and paste it below       │
 * │  5. In Firebase console → Authentication → Sign-in method:  │
 * │     • Enable "Email/Password"                               │
 * │     • Enable "Google"                                       │
 * │  6. Add your domain to Authorized domains list              │
 * │                                                             │
 * │  For local testing, add "localhost" to Authorized domains   │
 * └─────────────────────────────────────────────────────────────┘
 */

const firebaseConfig = {
  apiKey:            "AIzaSyA_XLN4iag5XRY_EAia59tG9F9KcUf9cIM",
  authDomain:        "hzzz-accounting.firebaseapp.com",
  projectId:         "hzzz-accounting",
  storageBucket:     "hzzz-accounting.firebasestorage.app",
  messagingSenderId: "1074225100237",
  appId:             "1:1074225100237:web:4e7cde574e27eecea7c084",
  measurementId:     "G-D4L0NK8H78"
};

// Initialize Firebase (guarded in case config is not yet set)
let firebaseApp = null;
let firebaseAuth = null;
let firebaseEnabled = false;

try {
  if (
    firebaseConfig.apiKey &&
    firebaseConfig.apiKey !== "YOUR_API_KEY" &&
    typeof firebase !== "undefined"
  ) {
    firebaseApp  = firebase.initializeApp(firebaseConfig);
    firebaseAuth = firebase.auth();
    firebaseEnabled = true;
    console.log("[Firebase] Initialized successfully.");
  } else {
    console.warn(
      "[Firebase] Config not set. Google Sign-In disabled. " +
      "Update js/firebase-config.js with your project credentials."
    );
  }
} catch (e) {
  console.error("[Firebase] Initialization failed:", e);
}
