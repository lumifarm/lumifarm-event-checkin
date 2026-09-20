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

// 收件人用 Bcc 帶入，主辦方自己的信箱軟體開啟後看到的是空白收件人欄，
// 不會讓報名者彼此看到對方的 email。
export function buildMailtoLink({ bcc, subject, body }) {
  const bccPart = bcc ? `bcc=${encodeURIComponent(bcc)}&` : "";
  return `mailto:?${bccPart}subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
