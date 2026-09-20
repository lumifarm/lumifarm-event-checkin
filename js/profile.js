import { db, auth } from "./firebase-config.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// 台灣身分證字號格式：1 個英文字母（大寫）+ 9 碼數字，第二碼是 1（男）或 2（女）。
// 這裡只檢查格式，不做到驗證碼演算法，避免拒絕掉少數合法但沒對到某些簡化
// 演算法的號碼。
export const TAIWAN_ID_REGEX = /^[A-Z][12]\d{8}$/;

export function isProfileComplete(data) {
  return Boolean(data?.realName && data?.nationalId && data?.birthDate);
}

export async function getMyProfile() {
  const user = auth.currentUser;
  if (!user) throw new Error("請先登入");
  const snap = await getDoc(doc(db, "users", user.uid));
  return snap.exists() ? snap.data() : null;
}

export function validateProfileFields({ realName, nationalId, birthDate }) {
  if (!realName || !realName.trim()) return "請輸入真實姓名";
  if (!nationalId || !TAIWAN_ID_REGEX.test(nationalId.trim().toUpperCase())) {
    return "身分證字號格式不正確（例如 A123456789）";
  }
  if (!birthDate) return "請選擇出生年月日";
  return null;
}

// Firestore 規則只允許本人改自己這幾個欄位（見 firestore.rules 的
// users/{userId} update 規則），所以這裡不用另外檢查權限。
export async function updateMyProfile({ realName, nationalId, birthDate }) {
  const user = auth.currentUser;
  if (!user) throw new Error("請先登入");
  await updateDoc(doc(db, "users", user.uid), {
    realName: realName.trim(),
    nationalId: nationalId.trim().toUpperCase(),
    birthDate,
  });
}
