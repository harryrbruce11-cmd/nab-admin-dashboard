// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBUvzEv7DW6k6XaJY0Bd8cM-WRN4XLLJQw",
  authDomain: "harry-bruce-gaming-ltd.firebaseapp.com",
  projectId: "harry-bruce-gaming-ltd",
  storageBucket: "harry-bruce-gaming-ltd.appspot.com",
  messagingSenderId: "894099834404",
  appId: "1:894099834404:web:e31e4f99befc7ce1e9bab1",
  measurementId: "G-XC0HFSD7X3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);