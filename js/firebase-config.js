import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDLm7D_S_7qOU_Q0UAnVR9ldSXraevqnQI",
  authDomain: "lumifarm-event-checkin.firebaseapp.com",
  projectId: "lumifarm-event-checkin",
  storageBucket: "lumifarm-event-checkin.firebasestorage.app",
  messagingSenderId: "399267911929",
  appId: "1:399267911929:web:2c4eab99a97adfd3a8aa28",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
