import { auth, db, googleProvider } from "./firebase-config.js";
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// 若 users/{uid} 已存在則不覆蓋，避免蓋掉使用者後續自行編輯的資料
export async function ensureUserDoc(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      name: user.displayName || "",
      email: user.email || "",
      photoURL: user.photoURL || "",
      totalEvents: 0,
      attendedEvents: 0,
      createdAt: serverTimestamp(),
    });
  }
  return ref;
}

export async function loginWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  await ensureUserDoc(result.user);
  return result.user;
}

export function logout() {
  return signOut(auth);
}

export function watchAuthState(onLogin, onLogout) {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      await ensureUserDoc(user);
      onLogin(user);
    } else {
      onLogout();
    }
  });
}
