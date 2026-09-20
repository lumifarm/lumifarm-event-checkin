// 通知主辦方用：會員回報繳費、申請取消等需要主辦方立即處理的動作發生時
// 呼叫，直接用 EmailJS 從瀏覽器發信到主辦方信箱，不需要後端伺服器（這個
// 專案是純靜態網站 + Firebase 免費方案，沒有 Cloud Functions 可以用）。
//
// EmailJS 的 Public Key 本來就是設計成可以放在前端程式碼裡的（不是密鑰），
// 濫用防護是靠 EmailJS 後台的用量額度，不是靠隱藏這組 key。
const EMAILJS_PUBLIC_KEY = "BcWO0rGunj8MWbrKk";
const EMAILJS_SERVICE_ID = "service_tyvivco";
const EMAILJS_TEMPLATE_ID = "template_lu5fryg";

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
