# Smart Water Safety Detector — GitHub Pages + Firebase + Wokwi

This version removes the old local-network/WebSocket architecture.

## New architecture

Wokwi ESP32 simulation
→ Wi-Fi (`Wokwi-GUEST`)
→ Firebase Realtime Database
→ GitHub Pages website

The website no longer connects to an ESP32 IP address and does not use `ws://`.
It reads `/waterData` from Firebase in real time.

## Firebase setup

1. Create/open your Firebase project.
2. Create a Realtime Database.
3. Enable Authentication → Sign-in method:
   - Email/Password
   - Anonymous
4. Register a Web App in Firebase.
5. Copy its Firebase web configuration into `config.js`.
6. Create a Firebase Authentication user for the Wokwi sketch. Do not put
   that user's password in the website.
7. Apply the rules in `firebase.rules.json`.

The rules allow authenticated website users to read `waterData`, while only
password-authenticated clients (your Wokwi ESP32 login) can write it.

## Firebase data expected

The Wokwi sketch should write:

{
  "waterData": {
    "temperature": 27.4,
    "tds": 1850,
    "turbidity": 3000,
    "distance": 35.6,
    "waterDepth": 64.4,
    "motionDetected": false,
    "lastUpdate": 1750000000000
  }
}

The website accepts these names and also accepts the normalized names:
`temperatureC`, `tdsPpm`, `turbidity`, `depthM`, and `movement`.

For the Wokwi simulation, the website converts a raw 0–4095 turbidity
potentiometer value to a 0–100 display scale and a raw TDS potentiometer
value to a demonstration 0–1000 ppm scale. These are simulation mappings,
not sensor calibration.

## GitHub Pages

Upload the contents of this folder to the root of a GitHub repository.
Enable GitHub Pages from the repository's Settings → Pages and deploy from
the branch/folder containing `index.html`.

The site can be HTTPS on GitHub Pages. Firebase is also accessed over HTTPS,
so there is no mixed-content dependency on a local ESP32 HTTP server.

## Important

The Firebase web configuration in `config.js` is intended to be public in a
browser application. Never put Firebase Admin SDK/service-account private
keys, Wokwi passwords, or other server secrets in the repository.

Before publishing, replace all `YOUR_...` placeholders in `config.js`.

The existing visual design, navigation, sensor cards, animations and sensor
information remain in place; only the live-data transport was changed.
