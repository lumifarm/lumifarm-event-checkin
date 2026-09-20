import { db, auth } from "./firebase-config.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export const BANK_INFO = {
  bankName: "永豐銀行 (807)",
  account: "203-018-001951-8",
  accountName: "林奕衡",
};

// 使用者按「我已完成匯款」：只允許把狀態改成 pending（待確認），
// 是否真的收到款項、改成 paid，交由主辦方在報到管理頁面手動確認
// （Firestore 規則也只允許本人把 paymentStatus 改成 pending，改不了 paid）。
export async function submitPaymentNotice(ticketId, note) {
  const user = auth.currentUser;
  if (!user) throw new Error("請先登入");

  await updateDoc(doc(db, "tickets", ticketId), {
    paymentStatus: "pending",
    paymentNote: note || "",
    paymentSubmittedAt: serverTimestamp(),
  });
}

// 給報到管理頁面：列出所有「待確認」的繳費通知，附上活動與報名人資訊
export async function listPendingPayments() {
  const q = query(collection(db, "tickets"), where("paymentStatus", "==", "pending"));
  const snap = await getDocs(q);
  const tickets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return Promise.all(
    tickets.map(async (t) => {
      const [eventSnap, userSnap] = await Promise.all([
        getDoc(doc(db, "events", t.eventId)),
        getDoc(doc(db, "users", t.userId)),
      ]);
      return {
        ...t,
        event: eventSnap.exists() ? eventSnap.data() : null,
        user: userSnap.exists() ? userSnap.data() : null,
      };
    })
  );
}

// 只有主辦方（isAdmin）能把狀態改成 paid，前面 submitPaymentNotice 擋掉了本人自己改成 paid
export async function confirmPayment(ticketId) {
  await updateDoc(doc(db, "tickets", ticketId), {
    paymentStatus: "paid",
  });
}
