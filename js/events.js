import { db, auth } from "./firebase-config.js";
import {
  collection,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
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

// 給主辦專區的活動管理用：Firestore 規則只允許 isAdmin() 呼叫這三個函式，
// 一般使用者呼叫會被規則擋下來，不需要在這裡另外檢查權限。
export async function createEvent(data) {
  return addDoc(collection(db, "events"), {
    title: data.title,
    description: data.description || "",
    location: data.location || "",
    date: data.date,
    price: data.price || 0,
    maxCap: data.maxCap ?? null,
    currentCount: 0,
  });
}

export async function updateEvent(eventId, data) {
  await updateDoc(doc(db, "events", eventId), {
    title: data.title,
    description: data.description || "",
    location: data.location || "",
    date: data.date,
    price: data.price || 0,
    maxCap: data.maxCap ?? null,
  });
}

export async function deleteEvent(eventId) {
  await deleteDoc(doc(db, "events", eventId));
}

// 票券 ID 固定用「活動ID_使用者ID」，而不是隨機 ID：
// 這樣同一個人對同一場活動最多只會有一份文件，重複報名的檢查可以直接在
// transaction 裡對這一份文件做 get，Firestore 會保證交易之間不會互相踩到，
// 徹底避免兩個分頁/兩次快速點擊造成重複報名。
function ticketDocId(eventId, uid) {
  return `${eventId}_${uid}`;
}

export async function getMyTicketForEvent(uid, eventId) {
  const ref = doc(db, "tickets", ticketDocId(eventId, uid));
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

function randomSecurityCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(9)))
    .map((b) => b.toString(36))
    .join("")
    .slice(0, 12)
    .toUpperCase();
}

// 報名活動：交易內先檢查是否已報名過、再檢查名額，最後同時建立票券、
// 活動人數 +1、個人總報名次數 +1，全部在同一個 transaction 內完成
export async function registerForEvent(eventId) {
  const user = auth.currentUser;
  if (!user) throw new Error("請先登入");

  const eventRef = doc(db, "events", eventId);
  const ticketRef = doc(db, "tickets", ticketDocId(eventId, user.uid));
  const userRef = doc(db, "users", user.uid);
  const securityCode = randomSecurityCode();

  await runTransaction(db, async (tx) => {
    const eventSnap = await tx.get(eventRef);
    if (!eventSnap.exists()) throw new Error("活動不存在");

    const ticketSnap = await tx.get(ticketRef);
    if (ticketSnap.exists()) throw new Error("你已經報名過這個活動了");

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
