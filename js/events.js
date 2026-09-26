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
import { getCourseStatus } from "./courseStatus.js";

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

// 給主辦專區「投保名單」用：某活動目前還算數的報名者（排除已取消）的
// 真實姓名、身分證字號、出生年月日，供主辦方辦理活動保險。舊票券（這個
// 功能上線前就報名的）可能還沒補資料，一樣列出來但欄位是空的，讓主辦方
// 知道要提醒對方去「資料維護」補齊，而不是直接漏掉這個人。
export async function listActiveParticipantsForInsurance(eventId) {
  const q = query(collection(db, "tickets"), where("eventId", "==", eventId));
  const snap = await getDocs(q);
  const tickets = snap.docs.map((d) => d.data()).filter((t) => !t.isCancelled);

  return Promise.all(
    tickets.map(async (t) => {
      const userSnap = await getDoc(doc(db, "users", t.userId));
      const u = userSnap.exists() ? userSnap.data() : null;
      return {
        name: u?.name || "",
        email: u?.email || "",
        realName: u?.realName || "",
        nationalId: u?.nationalId || "",
        birthDate: u?.birthDate || "",
      };
    })
  );
}

// 給主辦專區「報名問題回覆」用：某活動目前還算數的報名者（排除已取消）
// 填的報名問題答案，沒填（例如活動當時沒有設定問題）就不列進來。
export async function listRegistrationAnswers(eventId) {
  const q = query(collection(db, "tickets"), where("eventId", "==", eventId));
  const snap = await getDocs(q);
  const tickets = snap.docs.map((d) => d.data()).filter((t) => !t.isCancelled && t.registrationAnswer);

  return Promise.all(
    tickets.map(async (t) => {
      const userSnap = await getDoc(doc(db, "users", t.userId));
      const u = userSnap.exists() ? userSnap.data() : null;
      return {
        name: u?.name || "",
        email: u?.email || "",
        answer: t.registrationAnswer,
      };
    })
  );
}

// 給主辦專區「換工點數一鍵發放」用：某活動目前已報到、未取消的票券
// （連同票券文件本身一起回傳，因為要在同一個 batch 裡順便標記
// workPointsAwarded，避免同一個人被重複發放同一場活動的點數）。
export async function listCheckedInTickets(eventId) {
  const q = query(collection(db, "tickets"), where("eventId", "==", eventId));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((t) => t.isCheckedIn && !t.isCancelled);
}

// 給主辦專區的活動管理用：Firestore 規則只允許 isAdmin() 呼叫這三個函式，
// 一般使用者呼叫會被規則擋下來，不需要在這裡另外檢查權限。
export async function createEvent(data) {
  return addDoc(collection(db, "events"), {
    title: data.title,
    summary: data.summary || null,
    description: data.description || "",
    location: data.location || "",
    instructor: data.instructor || null,
    date: data.date,
    price: data.price || 0,
    maxCap: data.maxCap ?? null,
    minCap: data.minCap ?? null,
    posterUrl: data.posterUrl || null,
    tags: data.tags || [],
    registrationQuestion: data.registrationQuestion || null,
    currentCount: 0,
  });
}

export async function updateEvent(eventId, data) {
  await updateDoc(doc(db, "events", eventId), {
    title: data.title,
    summary: data.summary || null,
    description: data.description || "",
    location: data.location || "",
    instructor: data.instructor || null,
    date: data.date,
    price: data.price || 0,
    maxCap: data.maxCap ?? null,
    minCap: data.minCap ?? null,
    posterUrl: data.posterUrl || null,
    tags: data.tags || [],
    registrationQuestion: data.registrationQuestion || null,
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

// 活動要幫參加者投保，需要真實姓名、身分證字號、出生年月日，這三個欄位
// 不齊全就不能報名。用專屬的錯誤類別（而不是純文字訊息）讓畫面那邊能
// 準確判斷「是資料沒填」還是其他報名失敗原因，進而導去資料維護頁面。
export class ProfileIncompleteError extends Error {
  constructor() {
    super("請先到「資料維護」填寫真實姓名、身分證字號、出生年月日，活動需要這些資料幫你投保。");
    this.name = "ProfileIncompleteError";
  }
}

function hasCompleteProfile(userData) {
  return Boolean(userData?.realName && userData?.nationalId && userData?.birthDate);
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
export async function registerForEvent(eventId, registrationAnswer) {
  const user = auth.currentUser;
  if (!user) throw new Error("請先登入");

  const eventRef = doc(db, "events", eventId);
  const ticketRef = doc(db, "tickets", ticketDocId(eventId, user.uid));
  const userRef = doc(db, "users", user.uid);
  const securityCode = randomSecurityCode();

  // Firestore transaction 只能對已知的文件參照用 tx.get，不支援查詢，
  // 所以候選的折扣券要先在 transaction 外面查出來；進 transaction 後
  // 再用 tx.get 重新確認狀態還是「未使用」才真的套用並標記用掉，避免
  // 兩個分頁/裝置同時搶用同一張券。
  const couponSnap = await getDocs(query(collection(db, "discountCoupons"), where("userId", "==", user.uid)));
  const unusedCoupon = couponSnap.docs.find((d) => d.data().status === "unused");
  const couponRef = unusedCoupon ? doc(db, "discountCoupons", unusedCoupon.id) : null;

  await runTransaction(db, async (tx) => {
    const eventSnap = await tx.get(eventRef);
    if (!eventSnap.exists()) throw new Error("活動不存在");

    const userSnap = await tx.get(userRef);
    if (!hasCompleteProfile(userSnap.data())) throw new ProfileIncompleteError();

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
    if (getCourseStatus(event)?.state === "cancelled") {
      throw new Error("這場活動未達最低開課人數，已確定不開課");
    }

    // 免費活動（price 是 0 或沒填）沒有錢好收，直接視為已繳費，
    // 不需要使用者再多做一次匯款通知的動作。
    const isFree = !event.price || event.price <= 0;

    // 折扣券只在付費活動才有意義，免費活動不消耗掉會員手上的券，留給
    // 之後真的要付費的活動用。
    const couponDoc = couponRef && !isFree ? await tx.get(couponRef) : null;
    const applyDiscount = Boolean(couponDoc && couponDoc.exists() && couponDoc.data().status === "unused");

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
      discountApplied: applyDiscount,
      couponId: applyDiscount ? couponRef.id : null,
      registrationAnswer: registrationAnswer || null,
      createdAt: serverTimestamp(),
    });
    tx.update(eventRef, { currentCount: increment(1) });
    tx.update(userRef, { totalEvents: increment(1) });
    if (applyDiscount) {
      tx.update(couponRef, { status: "used", usedAt: serverTimestamp(), usedTicketId: ticketRef.id });
    }
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
