import { db, auth } from "./firebase-config.js";
import {
  collection,
  getDocs,
  doc,
  query,
  where,
  orderBy,
  runTransaction,
  serverTimestamp,
  increment,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export async function listEvents() {
  const q = query(collection(db, "events"), orderBy("date", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getMyTicketForEvent(uid, eventId) {
  const q = query(
    collection(db, "tickets"),
    where("userId", "==", uid),
    where("eventId", "==", eventId)
  );
  const snap = await getDocs(q);
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

function randomSecurityCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(9)))
    .map((b) => b.toString(36))
    .join("")
    .slice(0, 12)
    .toUpperCase();
}

// 報名活動：交易內先檢查名額，再同時建立票券、活動人數 +1、個人總報名次數 +1
export async function registerForEvent(eventId) {
  const user = auth.currentUser;
  if (!user) throw new Error("請先登入");

  const existing = await getMyTicketForEvent(user.uid, eventId);
  if (existing) throw new Error("你已經報名過這個活動了");

  const eventRef = doc(db, "events", eventId);
  const ticketRef = doc(collection(db, "tickets"));
  const userRef = doc(db, "users", user.uid);
  const securityCode = randomSecurityCode();

  await runTransaction(db, async (tx) => {
    const eventSnap = await tx.get(eventRef);
    if (!eventSnap.exists()) throw new Error("活動不存在");
    const event = eventSnap.data();
    const currentCount = event.currentCount || 0;
    if (event.maxCap && currentCount >= event.maxCap) {
      throw new Error("活動名額已滿");
    }

    tx.set(ticketRef, {
      ticketId: ticketRef.id,
      userId: user.uid,
      eventId,
      paymentStatus: "unpaid",
      isCheckedIn: false,
      checkedInAt: null,
      securityCode,
      createdAt: serverTimestamp(),
    });
    tx.update(eventRef, { currentCount: increment(1) });
    tx.update(userRef, { totalEvents: increment(1) });
  });

  return ticketRef.id;
}
