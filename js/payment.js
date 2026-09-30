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
  runTransaction,
  increment,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export const BANK_INFO = {
  bankName: "永豐銀行 (807)",
  account: "20301800119518",
  accountName: "林奕衡",
};

// 報名後幾天內要完成匯款（算到第 N 天的 23:59）。逾期不會自動取消（沒有後端
// 可以定時執行），主辦專區的「報名名單」會標出逾期未繳費的人，由主辦方決定
// 要不要強制取消、釋出名額。
export const PAYMENT_DEADLINE_DAYS = 3;

function toDate(ts) {
  if (!ts) return null;
  return ts.toDate ? ts.toDate() : new Date(ts);
}

// 繳費期限 = 報名日 + 3 天的 23:59；如果活動比這個時間更早開始，就以活動開始
// 時間為準。createdAt 還沒從伺服器回來（剛報名）時用現在時間計算。
export function paymentDeadlineOf(createdAt, eventDate) {
  const d = new Date(toDate(createdAt) || Date.now());
  d.setDate(d.getDate() + PAYMENT_DEADLINE_DAYS);
  d.setHours(23, 59, 0, 0);
  const ev = toDate(eventDate);
  return ev && ev < d ? ev : d;
}

export function formatDeadline(d) {
  return d.toLocaleString("zh-TW", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

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

// 主辦方寄出匯款提醒信後記錄時間，報名名單上會顯示「上次提醒」
export async function markPaymentReminderSent(ticketId) {
  await updateDoc(doc(db, "tickets", ticketId), { paymentReminderSentAt: serverTimestamp() });
}

// 只有主辦方（isAdmin）能把狀態改成 paid，前面 submitPaymentNotice 擋掉了本人自己改成 paid。
// 同時把活動的「已繳費人數」paidCount +1（開課與否以這個人數判斷）；用交易
// 確保同一張票按兩次也只會加一次。
export async function confirmPayment(ticketId) {
  const ticketRef = doc(db, "tickets", ticketId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ticketRef);
    if (!snap.exists()) throw new Error("找不到這張票券");
    const t = snap.data();
    if (t.paymentStatus === "paid") return;
    tx.update(ticketRef, { paymentStatus: "paid", paymentConfirmedAt: serverTimestamp() });
    if (!t.isCancelled) {
      tx.update(doc(db, "events", t.eventId), { paidCount: increment(1) });
    }
  });
}
