// 行前通知：郵件內容組裝（純字串邏輯）＋每個活動的通知草稿存取。
// 收件人名單在 events.js 的 listActiveParticipantEmails。
import { db } from "./firebase-config.js";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// 草稿存在 preEventNotices/{eventId}，Firestore 規則只允許主辦方讀寫
// （內容可能有當天聯絡電話等資訊，不放在所有人都讀得到的活動文件上）
export async function loadNoticeDraft(eventId) {
  const snap = await getDoc(doc(db, "preEventNotices", eventId));
  return snap.exists() ? snap.data() : null;
}

export async function saveNoticeDraft(eventId, { subject, body }) {
  await setDoc(doc(db, "preEventNotices", eventId), { subject, body, updatedAt: serverTimestamp() }, { merge: true });
}

// 用 EmailJS 直接寄出後記錄：寄出時間、成功幾封、哪些信箱失敗
export async function markNoticeSentViaEmailjs(eventId, { sentCount, failedEmails }) {
  await updateDoc(doc(db, "preEventNotices", eventId), {
    lastSentViaEmailjsAt: serverTimestamp(),
    lastSentCount: sentCount,
    lastFailedEmails: failedEmails,
  });
}

export async function markNoticeOpenedInGmail(eventId) {
  await updateDoc(doc(db, "preEventNotices", eventId), { lastOpenedInGmailAt: serverTimestamp() });
}

export function buildPreEventNotice({ eventTitle, eventDateText, eventLocation, customMessage }) {
  const subject = `【行前通知】${eventTitle}`;
  const body = [
    `${eventTitle} 行前通知`,
    "",
    `活動時間：${eventDateText}`,
    `活動地點：${eventLocation || "（未提供）"}`,
    "",
    customMessage.trim(),
  ].join("\n");
  return { subject, body };
}

// 直接開 Gmail 網頁版的寫信視窗（而不是 mailto:，主辦方電腦沒有設定
// 桌面信箱軟體，mailto: 打開來不會有反應）。收件人用 Bcc 帶入，
// 報名者彼此不會看到對方的 email。這個網址格式是 Gmail 官方支援的
// 「compose」連結，會用目前登入的 Gmail 帳號開啟一封新郵件草稿。
export function buildGmailComposeLink({ bcc, subject, body }) {
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    tf: "1",
    su: subject,
    body,
  });
  if (bcc) params.set("bcc", bcc);
  return `https://mail.google.com/mail/?${params.toString()}`;
}
