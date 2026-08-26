// Firebase web configuration for the GitHub Pages dashboard.
// Get this object from Firebase Console -> Project settings -> Your apps -> Web app.
// These values are safe to include in a browser app. Do NOT put your Firebase
// Admin SDK/service-account private key or your Wokwi email/password here.

export const firebaseConfig = {
  apiKey: "AIzaSyBOLFexgba_D6Ra4i15eCrwOh4QerOKDgc",
  authDomain: "smart-water-safety-detector.firebaseapp.com",
  databaseURL: "https://smart-water-safety-detector-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "smart-water-safety-detector",
  storageBucket: "smart-water-safety-detector.firebasestorage.app",
  messagingSenderId: "480467978175",
  appId: "1:480467978175:web:4c6fc7705fe611d028430a",
  measurementId: "G-04Q0V9XFBN"
};

export const THRESHOLDS = {
  temperatureC: { min: 10, max: 30 },
  turbidity: { max: 30 },
  tdsPpm: { max: 500 },
  depthM: { min: 0.2, max: 1.8 }
};

export const FIREBASE_DATA_PATH = "waterData";
