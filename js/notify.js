// 通知主辦方用：會員回報繳費、申請取消等需要主辦方立即處理的動作發生時
// 呼叫，直接用 EmailJS 從瀏覽器發信到主辦方信箱，不需要後端伺服器（這個
// 專案是純靜態網站 + Firebase 免費方案，沒有 Cloud Functions 可以用）。
//
// EmailJS 的 Public Key 本來就是設計成可以放在前端程式碼裡的（不是密鑰），
// 濫用防護是靠 EmailJS 後台的用量額度，不是靠隱藏這組 key。
const EMAILJS_PUBLIC_KEY = "BcWO0rGunj8MWbrKk";
const EMAILJS_SERVICE_ID = "service_tyvivco";
const EMAILJS_TEMPLATE_ID = "template_lu5fryg";
// 寄給會員用的第二個樣板（收件人是 {{to_email}}，內容是 {{{message_html}}}）。
// 還沒在 EmailJS 後台建立、填入 ID 之前留空字串，notifyMember 會直接略過不寄。
const EMAILJS_MEMBER_TEMPLATE_ID = "";

let initialized = false;

function ensureInit() {
  if (initialized || !window.emailjs) return;
  window.emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
  initialized = true;
}

// 通知只是提醒主辦方去後台看，不是核心流程的一部分：failure 只印在
// console，絕對不能讓通知寄送失敗擋住使用者原本的操作（繳費通知、取消
// 申請都已經先成功寫進 Firestore，通知晚到或沒寄到不影響資料本身）。
export async function notifyAdmin({ noticeType, eventTitle, memberName, memberEmail, detail }) {
  ensureInit();
  if (!window.emailjs) {
    console.warn("EmailJS 尚未載入，略過主辦方通知");
    return;
  }
  try {
    await window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      notice_type: noticeType || "",
      event_title: eventTitle || "（未命名活動）",
      member_name: memberName || "",
      member_email: memberEmail || "",
      detail: detail || "",
      time: new Date().toLocaleString("zh-TW"),
    });
  } catch (e) {
    console.warn("主辦方通知寄送失敗（不影響原本操作）：", e);
  }
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// 寄信給會員（報名成功、確認收到匯款）。lines 是一行一行的純文字，這裡統一
// 做 HTML escape 再用 <br> 接起來，樣板用 {{{message_html}}} 原樣輸出，
// 會員名字、活動名稱裡就算有特殊字元也不會變成 HTML。跟 notifyAdmin 一樣
// 失敗只記在 console，不擋住原本的操作。
export async function notifyMember({ toEmail, toName, subject, lines }) {
  if (!EMAILJS_MEMBER_TEMPLATE_ID) {
    console.warn("尚未設定寄給會員的 EmailJS 樣板，略過會員通知信");
    return;
  }
  if (!toEmail) return;
  ensureInit();
  if (!window.emailjs) {
    console.warn("EmailJS 尚未載入，略過會員通知信");
    return;
  }
  try {
    await window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_MEMBER_TEMPLATE_ID, {
      to_email: toEmail,
      to_name: toName || "",
      subject: subject || "",
      message_html: (lines || []).map(escapeHtml).join("<br>"),
    });
  } catch (e) {
    console.warn("會員通知信寄送失敗（不影響原本操作）：", e);
  }
}
