import { db, auth } from "./firebase-config.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  writeBatch,
  serverTimestamp,
  increment,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

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
  const q = query(
    collection(db, "workPointTransactions"),
    where("userId", "==", user.uid),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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

// 給主辦專區用：某個使用者最近的點數異動紀錄
export async function listPointsHistoryForUser(userId) {
  const q = query(
    collection(db, "workPointTransactions"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
