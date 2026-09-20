import { db, auth } from "./firebase-config.js";
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { listAllUsers } from "./tickets.js";

// 出席折扣券：一般活動（不含換工活動，換工另外算點數）每累積出席滿
// ATTENDANCE_THRESHOLD 次，就核發一張 DISCOUNT_PERCENT 折扣（95 折）的
// 折扣券，可以在下一次報名付費活動時自動折抵，不能跟其他折扣疊加
// （目前系統本來就只有這一種折扣機制）。
export const ATTENDANCE_THRESHOLD = 5;
export const DISCOUNT_PERCENT = 5; // 95 折 = 折 5%

// 查詢故意只用一個 where 條件（不用複合條件），避免又踩到 Firestore
// 複合索引沒建立就整批查詢失敗的問題（我的票券空白那次就是這樣壞的）。
export async function getMyCoupons() {
  const user = auth.currentUser;
  if (!user) return [];
  const q = query(collection(db, "discountCoupons"), where("userId", "==", user.uid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getMyUnusedCoupon() {
  const coupons = await getMyCoupons();
  return coupons.find((c) => c.status === "unused") || null;
}

// 給主辦專區用：算出每個會員「累積出席次數 / 5」應該累積發過幾張券，
// 跟目前已經發過的張數（不管有沒有用掉，發過就算數）比較，差額就是這次
// 還沒發的張數。
export async function listEligibleForCoupons() {
  const [users, couponsSnap] = await Promise.all([listAllUsers(), getDocs(collection(db, "discountCoupons"))]);

  const issuedCountByUser = {};
  couponsSnap.docs.forEach((d) => {
    const uid = d.data().userId;
    issuedCountByUser[uid] = (issuedCountByUser[uid] || 0) + 1;
  });

  return users
    .map((u) => {
      const earned = Math.floor((u.regularAttendedCount || 0) / ATTENDANCE_THRESHOLD);
      const issued = issuedCountByUser[u.id] || 0;
      return {
        id: u.id,
        name: u.name || "",
        email: u.email || "",
        regularAttendedCount: u.regularAttendedCount || 0,
        pending: earned - issued,
      };
    })
    .filter((u) => u.pending > 0);
}

// 給主辦專區用：一次把所有還沒發的折扣券都發出去
export async function issuePendingCoupons() {
  const eligible = await listEligibleForCoupons();
  if (eligible.length === 0) return { issuedCount: 0, memberCount: 0 };

  const batch = writeBatch(db);
  let issuedCount = 0;
  eligible.forEach((u) => {
    for (let i = 0; i < u.pending; i++) {
      const ref = doc(collection(db, "discountCoupons"));
      batch.set(ref, {
        userId: u.id,
        discountPercent: DISCOUNT_PERCENT,
        status: "unused",
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid || null,
        usedAt: null,
        usedTicketId: null,
      });
      issuedCount++;
    }
  });
  await batch.commit();
  return { issuedCount, memberCount: eligible.length };
}
