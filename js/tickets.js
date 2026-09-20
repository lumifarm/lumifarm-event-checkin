import { db, auth } from "./firebase-config.js";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export async function getMyTickets() {
  const user = auth.currentUser;
  if (!user) return [];

  const q = query(collection(db, "tickets"), where("userId", "==", user.uid));
  const snap = await getDocs(q);
  const tickets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return Promise.all(
    tickets.map(async (t) => {
      const eventSnap = await getDoc(doc(db, "events", t.eventId));
      return { ...t, event: eventSnap.exists() ? eventSnap.data() : null };
    })
  );
}

// 使用 qrcodejs（davidshimjs/qrcodejs）在 containerEl 內畫出 QR Code
// QR 內容包含 ticketId 與 securityCode，報到時用來雙重驗證，避免偽造
export function renderTicketQRCode(containerEl, ticket) {
  containerEl.innerHTML = "";
  const payload = JSON.stringify({
    ticketId: ticket.id,
    code: ticket.securityCode,
  });
  new QRCode(containerEl, {
    text: payload,
    width: 160,
    height: 160,
  });
}

export function paymentStatusLabel(status) {
  if (status === "paid") return { text: "已繳費", cls: "badge-green" };
  if (status === "pending") return { text: "待確認中", cls: "badge-yellow" };
  return { text: "尚未繳費", cls: "badge-gray" };
}

export async function getMyStats() {
  const user = auth.currentUser;
  if (!user) return { total: 0, attended: 0, rate: 0 };

  const snap = await getDoc(doc(db, "users", user.uid));
  const data = snap.data() || {};
  const total = data.totalEvents || 0;
  const attended = data.attendedEvents || 0;
  const rate = total > 0 ? Math.round((attended / total) * 100) : 0;
  return { total, attended, rate };
}
