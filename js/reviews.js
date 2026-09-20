import { db, auth } from "./firebase-config.js";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export async function submitReview(eventId, rating, comment) {
  const user = auth.currentUser;
  if (!user) throw new Error("請先登入");

  const q = query(
    collection(db, "reviews"),
    where("userId", "==", user.uid),
    where("eventId", "==", eventId)
  );
  const existing = await getDocs(q);
  if (!existing.empty) throw new Error("你已經評價過這個活動了");

  await addDoc(collection(db, "reviews"), {
    userId: user.uid,
    eventId,
    rating,
    comment,
    createdAt: serverTimestamp(),
  });
}
