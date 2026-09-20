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
  where,
  orderBy,
  runTransaction,
  writeBatch,
  serverTimestamp,
  increment,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// 取消政策的退款比例：活動開始前 >=7 天全額（會另外扣轉帳手續費）、
// 3~6 天內 50%、少於 3 天不退款。天數用「事件日期 - 現在」計算。
export function calcRefundPercent(eventDate) {
  const daysLeft = (eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (daysLeft >= 7) return 100;
  if (daysLeft >= 3) return 50;
  return 0;
}

export async function listEvents() {
  const q = query(collection(db, "events"), orderBy("date", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// 給「行前通知」用：某活動目前所有還算數的報名者（排除已取消）的 email，
// 已取消的票券不算數，因為那些人已經不會來了。
export async function listActiveParticipantEmails(eventId) {
  const q = query(collection(db, "tickets"), where("eventId", "==", eventId));
  const snap = await getDocs(q);
  const tickets = snap.docs.map((d) => d.data()).filter((t) => !t.isCancelled);

  const emails = await Promise.all(
    tickets.map(async (t) => {
      const userSnap = await getDoc(doc(db, "users", t.userId));
      return userSnap.exists() ? userSnap.data().email : null;
    })
  );
  return [...new Set(emails.filter(Boolean))];
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
    posterUrl: data.posterUrl || null,
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
    posterUrl: data.posterUrl || null,
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

    // 票券文件可能已經存在但是「已取消」的舊紀錄，這種情況要允許重新報名、
    // 把文件整個重置成剛報名的狀態；只有「存在且未取消」才擋下來。
    const ticketSnap = await tx.get(ticketRef);
    if (ticketSnap.exists() && !ticketSnap.data().isCancelled) {
      throw new Error("你已經報名過這個活動了");
    }

    const event = eventSnap.data();
    const currentCount = event.currentCount || 0;
    if (event.maxCap && currentCount >= event.maxCap) {
      throw new Error("活動名額已滿");
    }

    // 免費活動（price 是 0 或沒填）沒有錢好收，直接視為已繳費，
    // 不需要使用者再多做一次匯款通知的動作。
    const isFree = !event.price || event.price <= 0;

    tx.set(ticketRef, {
      ticketId: ticketRef.id,
      userId: user.uid,
      eventId,
      paymentStatus: isFree ? "paid" : "unpaid",
      isCheckedIn: false,
      checkedInAt: null,
      isCancelled: false,
      cancelledAt: null,
      refundPercent: null,
      cancelRequestStatus: null,
      cancelRequestedAt: null,
      cancelRefundPercent: null,
      securityCode,
      createdAt: serverTimestamp(),
    });
    tx.update(eventRef, { currentCount: increment(1) });
    tx.update(userRef, { totalEvents: increment(1) });
  });

  return ticketRef.id;
}

function eventDateOf(eventData) {
  if (!eventData?.date) return null;
  return eventData.date.toDate ? eventData.date.toDate() : new Date(eventData.date);
}

// 使用者申請取消：不會立刻取消，只是送出申請並記錄「如果現在核准，退款比例
// 是多少」；活動名額暫時不釋出，要等主辦方核准後才正式取消（見
// approveCancellation）。核准前活動照常進行、不退費，跟主辦方核准/駁回
// 之前使用者的體驗一致。
export async function requestCancellation(ticketId) {
  const user = auth.currentUser;
  if (!user) throw new Error("請先登入");

  const ticketRef = doc(db, "tickets", ticketId);
  const ticketSnap = await getDoc(ticketRef);
  if (!ticketSnap.exists()) throw new Error("找不到這張票券");

  const ticket = ticketSnap.data();
  if (ticket.userId !== user.uid) throw new Error("無權限操作這張票券");
  if (ticket.isCheckedIn) throw new Error("已經報到的活動無法取消");
  if (ticket.isCancelled) throw new Error("這張票券已經取消過了");
  if (ticket.cancelRequestStatus === "pending") {
    throw new Error("已經送出過取消申請，請等候主辦方審核");
  }

  const eventSnap = await getDoc(doc(db, "events", ticket.eventId));
  const eventDate = eventDateOf(eventSnap.exists() ? eventSnap.data() : null);
  const refundPercent = eventDate ? calcRefundPercent(eventDate) : 0;

  await updateDoc(ticketRef, {
    cancelRequestStatus: "pending",
    cancelRequestedAt: serverTimestamp(),
    cancelRefundPercent: refundPercent,
  });

  return refundPercent;
}

// 給主辦專區用：列出所有待審核的取消申請，附上活動與申請人資訊
export async function listPendingCancellations() {
  const q = query(collection(db, "tickets"), where("cancelRequestStatus", "==", "pending"));
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

// 主辦方核准取消：正式標記 isCancelled、退款比例用申請當下算好的
// cancelRefundPercent（不是核准當下重新計算，避免主辦方拖延審核反而
// 讓使用者少退錢），活動名額 -1，該使用者的取消次數 +1。
export async function approveCancellation(ticketId) {
  const ticketRef = doc(db, "tickets", ticketId);
  const ticketSnap = await getDoc(ticketRef);
  if (!ticketSnap.exists()) throw new Error("找不到這張票券");
  const ticket = ticketSnap.data();

  const batch = writeBatch(db);
  batch.update(ticketRef, {
    isCancelled: true,
    cancelledAt: serverTimestamp(),
    refundPercent: ticket.cancelRefundPercent ?? 0,
    cancelRequestStatus: "approved",
  });
  batch.update(doc(db, "events", ticket.eventId), { currentCount: increment(-1) });
  batch.update(doc(db, "users", ticket.userId), { cancelledEvents: increment(1) });
  await batch.commit();
}

// 主辦方駁回取消：票券完全恢復正常，使用者可以之後再重新申請一次
export async function rejectCancellation(ticketId) {
  await updateDoc(doc(db, "tickets", ticketId), {
    cancelRequestStatus: null,
    cancelRequestedAt: null,
    cancelRefundPercent: null,
  });
}
