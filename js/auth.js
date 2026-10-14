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

// 不在這裡呼叫 ensureUserDoc：watchAuthState 掛在每個頁面上，登入成功時
// 一定也會收到這次的狀態變化並自己建立會員資料。若這裡再呼叫一次，
// 使用者第一次登入時兩個呼叫會同時讀到「文件不存在」而各自嘗試建立，
// 其中較慢的那個會被 Firestore 規則當成「更新」而不是「建立」擋下來
// （因為 createdAt 不在允許更新的欄位清單內），跳出無意義的錯誤訊息。
export async function loginWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export function logout() {
  return signOut(auth);
}

export function watchAuthState(onLogin, onLogout) {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      // 離線（例如活動現場收訊不好）時建立會員資料會失敗，但導覽列還是要
      // 顯示已登入，「我的票券」才能顯示存在手機裡的票券
      try {
        await ensureUserDoc(user);
      } catch (e) {
        console.warn("建立／讀取會員資料失敗（可能是離線）：", e);
      }
      onLogin(user);
    } else {
      onLogout();
    }
  });
}
