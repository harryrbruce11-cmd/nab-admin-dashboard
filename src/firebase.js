// Import the functions you need from the SDKs you need
// src/firebase.js

// src/firebase.js

import {
  getApps,
  initializeApp,
} from "firebase/app";

import {
  getAnalytics,
  isSupported,
} from "firebase/analytics";

import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

/*
|--------------------------------------------------------------------------
| Harry Bruce Gaming Firebase
|--------------------------------------------------------------------------
*/

const harryBruceFirebaseConfig = {
  apiKey: "AIzaSyBUvzEv7DW6k6XaJY0Bd8cM-WRN4XLLJQw",
  authDomain: "harry-bruce-gaming-ltd.firebaseapp.com",
  projectId: "harry-bruce-gaming-ltd",
  storageBucket: "harry-bruce-gaming-ltd.appspot.com",
  messagingSenderId: "894099834404",
  appId: "1:894099834404:web:e31e4f99befc7ce1e9bab1",
  measurementId: "G-XC0HFSD7X3",
};

/*
|--------------------------------------------------------------------------
| Vehicle Check Firebase
|--------------------------------------------------------------------------
*/

const vehicleCheckFirebaseConfig = {
  apiKey: "AIzaSyARA6eqn6_CoL4poXmUBpxjDqpToPAa2h4",
  authDomain: "vehicle-check-ebdbf.firebaseapp.com",
  projectId: "vehicle-check-ebdbf",
  storageBucket: "vehicle-check-ebdbf.firebasestorage.app",
  messagingSenderId: "239626924948",
  appId: "1:239626924948:web:5a2a80a880ed2d582bd581",
  measurementId: "G-JQ6KZB25GN",
};

/*
|--------------------------------------------------------------------------
| Initialise Harry Bruce Gaming as the default Firebase app
|--------------------------------------------------------------------------
*/

const existingDefaultApp = getApps().find(
  (firebaseApp) => firebaseApp.name === "[DEFAULT]"
);

export const mainFirebaseApp =
  existingDefaultApp ||
  initializeApp(harryBruceFirebaseConfig);

/*
|--------------------------------------------------------------------------
| Initialise Vehicle Check as a second named Firebase app
|--------------------------------------------------------------------------
*/

const existingVehicleCheckApp = getApps().find(
  (firebaseApp) => firebaseApp.name === "vehicle-check"
);

export const vehicleCheckApp =
  existingVehicleCheckApp ||
  initializeApp(
    vehicleCheckFirebaseConfig,
    "vehicle-check"
  );

/*
|--------------------------------------------------------------------------
| Harry Bruce Gaming services
|--------------------------------------------------------------------------
*/

export const mainAuth =
  getAuth(mainFirebaseApp);

export const mainDb =
  getFirestore(mainFirebaseApp);

export const mainStorage =
  getStorage(mainFirebaseApp);

/*
|--------------------------------------------------------------------------
| Vehicle Check services
|--------------------------------------------------------------------------
|
| Use these exports for:
|
| - Holiday requests
| - Holiday approvals and rejections
| - Vehicle Check users
| - Vehicle Check authentication
| - Push-notification tokens
|
*/

export const vehicleCheckAuth =
  getAuth(vehicleCheckApp);

export const vehicleCheckDb =
  getFirestore(vehicleCheckApp);

export const vehicleCheckStorage =
  getStorage(vehicleCheckApp);

/*
|--------------------------------------------------------------------------
| Optional short aliases
|--------------------------------------------------------------------------
|
| These aliases make Vehicle Check the default Firebase connection for
| files that import { auth, db, storage } from "./firebase".
|
*/

export const auth =
  vehicleCheckAuth;

export const db =
  vehicleCheckDb;

export const storage =
  vehicleCheckStorage;

/*
|--------------------------------------------------------------------------
| Analytics
|--------------------------------------------------------------------------
*/

export let analytics = null;
export let vehicleCheckAnalytics = null;

if (typeof window !== "undefined") {
  isSupported()
    .then((supported) => {
      if (!supported) {
        return;
      }

      analytics = getAnalytics(
        mainFirebaseApp
      );

      vehicleCheckAnalytics = getAnalytics(
        vehicleCheckApp
      );
    })
    .catch((error) => {
      console.warn(
        "Firebase Analytics is unavailable:",
        error
      );
    });
}

/*
|--------------------------------------------------------------------------
| Default export
|--------------------------------------------------------------------------
|
| Existing parts of the app that use the default export will continue using
| Harry Bruce Gaming Firebase.
|
*/

export default mainFirebaseApp;