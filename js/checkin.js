import { db, auth } from "./firebase-config.js";
import {
  doc,
  getDoc,
  writeBatch,
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

  const userRef = doc(db, "users", ticket.userId);
  const userSnap = await getDoc(userRef);
  const userName = userSnap.exists() ? userSnap.data().name : "未知使用者";

  // 用 batch 把「標記已報到」與「出席次數 +1」包成同一次原子寫入，
  // 避免其中一個成功、另一個因網路問題失敗，導致資料不一致。
  const batch = writeBatch(db);
  batch.update(ticketRef, {
    isCheckedIn: true,
    checkedInAt: serverTimestamp(),
  });
  batch.update(userRef, {
    attendedEvents: increment(1),
  });
  await batch.commit();

  return { userName, eventId: ticket.eventId };
}
