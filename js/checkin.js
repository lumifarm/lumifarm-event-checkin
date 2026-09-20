import { db, auth } from "./firebase-config.js";
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  increment,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// 是否有報到管理權限：檢查 admins/{uid} 文件是否存在（需在 Firebase Console 手動新增）
export async function isCurrentUserAdmin() {
  const user = auth.currentUser;
  if (!user) return false;
  const snap = await getDoc(doc(db, "admins", user.uid));
  return snap.exists();
}

// 解析掃描到的 QR Code 內容，驗證安全碼並更新報到狀態
export async function processScannedTicket(decodedText) {
  let payload;
  try {
    payload = JSON.parse(decodedText);
  } catch (e) {
    throw new Error("QR Code 格式錯誤");
  }

  const { ticketId, code } = payload;
  if (!ticketId || !code) throw new Error("QR Code 內容不完整");

  const ticketRef = doc(db, "tickets", ticketId);
  const ticketSnap = await getDoc(ticketRef);
  if (!ticketSnap.exists()) throw new Error("找不到這張票券");

  const ticket = ticketSnap.data();
  if (ticket.securityCode !== code) {
    throw new Error("驗證碼錯誤，可能是偽造的 QR Code");
  }
  if (ticket.isCheckedIn) {
    throw new Error("這張票券已經報到過了");
  }

  const userSnap = await getDoc(doc(db, "users", ticket.userId));
  const userName = userSnap.exists() ? userSnap.data().name : "未知使用者";

  await updateDoc(ticketRef, {
    isCheckedIn: true,
    checkedInAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "users", ticket.userId), {
    attendedEvents: increment(1),
  });

  return { userName, eventId: ticket.eventId };
}
