// Firebase web configuration for the GitHub Pages dashboard.
// Get this object from Firebase Console -> Project settings -> Your apps -> Web app.
// These values are safe to include in a browser app. Do NOT put your Firebase
// Admin SDK/service-account private key or your Wokwi email/password here.

export const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_WEB_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_FIREBASE_WEB_APP_ID"
};

export const THRESHOLDS = {
  temperatureC: { min: 10, max: 30 },
  turbidity: { max: 30 },
  tdsPpm: { max: 500 },
  depthM: { min: 0.2, max: 1.8 }
};

export const FIREBASE_DATA_PATH = "waterData";
