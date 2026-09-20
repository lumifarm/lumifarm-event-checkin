import { db, auth } from "./firebase-config.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp,
  increment,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { listCheckedInTickets } from "./events.js";

// 依 createdAt 新到舊排序：故意不在查詢裡加 orderBy，「userId 相等 + 依
// createdAt 排序」這種組合 Firestore 需要額外建立複合索引，沒建的話查詢
// 會直接拋錯。這裡只用一個 where 條件（不需要索引），排序交給前端做，
// 跟這個專案其他列表（活動、票券）的排序方式一致。
function sortByCreatedAtDesc(docs) {
  return [...docs].sort((a, b) => {
    const da = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
    const db_ = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
    return db_ - da;
  });
}

// 換工點數：每筆異動都存成一筆不可修改的紀錄（workPointTransactions），
// users/{uid}.workPoints 是這些紀錄加總出來的目前餘額，用 increment 讓寫入
// 紀錄跟更新餘額在同一個 batch 裡一定同步，不會有紀錄跟餘額對不起來的情況。
// 點數只能由主辦方增減（發放換工點數、登記兌換扣點），一般會員只能讀。

export async function getMyPointsBalance() {
  const user = auth.currentUser;
  if (!user) return 0;
  const snap = await getDoc(doc(db, "users", user.uid));
  return snap.exists() ? snap.data().workPoints || 0 : 0;
}

export async function getMyPointsHistory() {
  const user = auth.currentUser;
  if (!user) return [];
  const q = query(collection(db, "workPointTransactions"), where("userId", "==", user.uid));
  const snap = await getDocs(q);
  return sortByCreatedAtDesc(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}

// 給主辦專區用：登記一筆點數異動（發放用正數、兌換扣點用負數），
// reason 是給人看的說明文字（例如「10/5 換工-拔草」「兌換：白米一包」）。
// eventId 選填，方便之後想查「這場換工活動總共發了多少點」。
export async function awardPoints({ userId, points, reason, eventId }) {
  const batch = writeBatch(db);
  const txRef = doc(collection(db, "workPointTransactions"));
  batch.set(txRef, {
    userId,
    points,
    reason: reason || "",
    eventId: eventId || null,
    createdAt: serverTimestamp(),
    createdBy: auth.currentUser?.uid || null,
  });
  batch.update(doc(db, "users", userId), { workPoints: increment(points) });
  await batch.commit();
}

// 給主辦專區「換工點數一鍵發放」用：把同一筆點數發給某活動所有已報到、
// 未取消的會員，不用一個個手動選。用票券上的 workPointsAwarded 記住
// 「這張票券已經因為這場活動被發過點數」，重複按同一顆按鈕不會重複發放；
// 每個人還是各自留一筆 workPointTransactions，跟手動登記完全一樣可查、可對帳。
export async function awardPointsToCheckedInParticipants(eventId, points, reason) {
  const tickets = await listCheckedInTickets(eventId);
  const pending = tickets.filter((t) => !t.workPointsAwarded);

  const batch = writeBatch(db);
  pending.forEach((t) => {
    const txRef = doc(collection(db, "workPointTransactions"));
    batch.set(txRef, {
      userId: t.userId,
      points,
      reason: reason || "",
      eventId,
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser?.uid || null,
    });
    batch.update(doc(db, "users", t.userId), { workPoints: increment(points) });
    batch.update(doc(db, "tickets", t.id), { workPointsAwarded: true });
  });
  if (pending.length > 0) await batch.commit();

  return { awardedCount: pending.length, alreadyAwardedCount: tickets.length - pending.length };
}

// 給主辦專區用：某個使用者最近的點數異動紀錄
export async function listPointsHistoryForUser(userId) {
  const q = query(collection(db, "workPointTransactions"), where("userId", "==", userId));
  const snap = await getDocs(q);
  return sortByCreatedAtDesc(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}
