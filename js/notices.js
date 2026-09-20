// 行前通知的郵件內容組裝：純字串邏輯，不碰 Firestore，方便跟收件人名單
// （events.js 的 listActiveParticipantEmails）分開處理。

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
