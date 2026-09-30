// 寄給會員的通知信內容：報名成功（含繳費期限與匯款資訊）、主辦方確認收到匯款。
// 實際寄送走 notify.js 的 notifyMember（EmailJS），失敗不會擋住原本的操作。
import { BANK_INFO, paymentDeadlineOf, formatDeadline, PAYMENT_DEADLINE_DAYS } from "./payment.js";
import { DISCOUNT_PERCENT } from "./discounts.js";
import { notifyMember } from "./notify.js";

const TICKETS_URL = "https://checkin.lumifarm.org/#/tickets";
const EVENT_URL = "https://checkin.lumifarm.org/#/event?id=";
const SIGNATURE = ["", "光農合作社群 敬上"];

function toDate(ts) {
  if (!ts) return null;
  return ts.toDate ? ts.toDate() : new Date(ts);
}

function eventInfoLines(ev) {
  const date = toDate(ev?.date);
  return [
    `活動名稱：${ev?.title || ""}`,
    `活動時間：${date ? date.toLocaleString("zh-TW", { dateStyle: "medium", timeStyle: "short" }) : "時間未定"}`,
    `活動地點：${ev?.location || "（請見活動頁面）"}`,
  ];
}

function finalPrice(ev, discountApplied) {
  const price = ev?.price || 0;
  return discountApplied ? Math.round(price * (1 - DISCOUNT_PERCENT / 100)) : price;
}

// 報名成功：付費活動附上匯款資訊與繳費期限；免費活動只告知報名成功。
// createdAt 傳 null 代表「剛剛報名」，繳費期限用現在時間算。
export function sendRegistrationEmail({ ev, toEmail, toName, discountApplied, createdAt = null }) {
  const isFree = !ev?.price || ev.price <= 0;
  const name = toName || "會員";

  if (isFree) {
    return notifyMember({
      toEmail,
      toName,
      subject: `【光農合作社群】報名成功：${ev?.title || ""}`,
      lines: [
        `${name} 您好：`,
        "",
        `感謝您報名「${ev?.title || ""}」，這是免費活動，已為您完成報名，不需要繳費。`,
        "",
        ...eventInfoLines(ev),
        "",
        `活動當天請打開「我的票券」出示 QR Code 報到：${TICKETS_URL}`,
        ...SIGNATURE,
      ],
    });
  }

  const deadline = formatDeadline(paymentDeadlineOf(createdAt, ev?.date));
  return notifyMember({
    toEmail,
    toName,
    subject: `【光農合作社群】報名成功：${ev?.title || ""}，請於 ${deadline} 前完成匯款`,
    lines: [
      `${name} 您好：`,
      "",
      `感謝您報名「${ev?.title || ""}」，已為您保留名額。`,
      `請於 ${deadline} 前（報名後 ${PAYMENT_DEADLINE_DAYS} 天內）完成匯款，逾期未繳費名額將會釋出給其他學員。`,
      "",
      ...eventInfoLines(ev),
      "",
      ...bankInfoLines(ev, discountApplied),
      ...SIGNATURE,
    ],
  });
}

// 匯款資訊＋匯款後要做的事，報名成功信跟匯款提醒信共用
function bankInfoLines(ev, discountApplied) {
  return [
    "【匯款資訊】",
    `銀行：${BANK_INFO.bankName}`,
    `帳號：${BANK_INFO.account}`,
    `戶名：${BANK_INFO.accountName}`,
    `應繳金額：NT$${finalPrice(ev, discountApplied)}${discountApplied ? `（已套用出席折扣券 ${100 - DISCOUNT_PERCENT} 折）` : ""}`,
    "",
    `匯款後請到「我的票券」按「我已完成匯款，通知確認」並填寫帳號後五碼，方便我們對帳：${TICKETS_URL}`,
    "主辦單位確認收到款項後，會再寄一封確認信給您。",
  ];
}

// 主辦方在「報名名單」對尚未繳費的會員手動寄出的匯款提醒。繳費期限沿用原本
// 報名時算出來的那個，不會因為提醒而延長；已經逾期的話，改成請對方盡快匯款。
export function sendPaymentReminderEmail({ ev, toEmail, toName, discountApplied, createdAt }) {
  const name = toName || "會員";
  const title = ev?.title || "";
  const deadlineDate = paymentDeadlineOf(createdAt, ev?.date);
  const deadline = formatDeadline(deadlineDate);
  const overdue = Date.now() > deadlineDate.getTime();
  return notifyMember({
    toEmail,
    toName,
    subject: overdue
      ? `【光農合作社群】匯款提醒：${title}（已超過繳費期限，請盡快完成匯款）`
      : `【光農合作社群】匯款提醒：${title}，請於 ${deadline} 前完成匯款`,
    lines: [
      `${name} 您好：`,
      "",
      `提醒您，您報名的「${title}」目前尚未完成匯款。`,
      overdue
        ? `您的繳費期限（${deadline}）已經過了，名額目前仍暫時為您保留，請盡快完成匯款，否則名額可能會釋出給其他學員。`
        : `請於 ${deadline} 前完成匯款，逾期未繳費名額將會釋出給其他學員。`,
      "如果您已經匯款，請到「我的票券」按「我已完成匯款，通知確認」，或直接回覆這封信附上匯款帳號後五碼；如果不打算參加了，也可以在「我的票券」直接取消報名。",
      "",
      ...eventInfoLines(ev),
      "",
      ...bankInfoLines(ev, discountApplied),
      ...SIGNATURE,
    ],
  });
}

// 主辦方在主辦專區按下「確認已收款」之後寄出
export function sendPaymentConfirmedEmail({ ev, toEmail, toName, discountApplied }) {
  const name = toName || "會員";
  return notifyMember({
    toEmail,
    toName,
    subject: `【光農合作社群】已確認收到您的匯款：${ev?.title || ""}`,
    lines: [
      `${name} 您好：`,
      "",
      `我們已確認收到您「${ev?.title || ""}」的報名費用 NT$${finalPrice(ev, discountApplied)}，您的報名已完成。`,
      "",
      ...eventInfoLines(ev),
      "",
      `活動當天請打開「我的票券」出示 QR Code 報到：${TICKETS_URL}`,
      "期待與您見面！",
      ...SIGNATURE,
    ],
  });
}

// 主辦方在「報名名單」強制取消某人的報名後寄出，內容依會員有沒有匯款分三種：
// - 已匯款（已繳費，或已送出匯款通知待確認）：說明取消原因與退款安排，不附重新報名連結
// - 付費活動但還沒匯款：說明是超過繳費期限未匯款、名額釋出，附上重新報名連結
// - 免費活動：說明取消原因，附上重新報名連結
export const OVERDUE_CANCEL_REASON = "超過繳費期限未完成匯款，名額釋出";

export function sendForceCancelledEmail({ ev, eventId, toEmail, toName, reason, refundPercent, wasPaid, discountApplied }) {
  const name = toName || "會員";
  const title = ev?.title || "";
  const isFree = !ev?.price || ev.price <= 0;
  const reregisterLines = [
    "",
    isFree
      ? "如果您仍想參加，歡迎到活動頁面重新報名（名額有限，額滿為止）："
      : `如果您仍想參加，歡迎到活動頁面重新報名，重新報名後請於 ${PAYMENT_DEADLINE_DAYS} 天內完成匯款（名額有限，以完成繳費的順序為準）：`,
    `${EVENT_URL}${eventId}`,
  ];

  let bodyLines;
  if (wasPaid) {
    const refundAmount = Math.round((finalPrice(ev, discountApplied) * (refundPercent || 0)) / 100);
    bodyLines = [
      `您報名的「${title}」已由主辦單位取消。`,
      ...(reason ? [`取消原因：${reason}`] : []),
      "",
      refundPercent > 0
        ? `我們會退還您 ${refundPercent}% 的報名費用（NT$${refundAmount}），請直接回覆這封信，提供您的退款帳戶（銀行代碼、帳號、戶名），我們收到後會盡快匯款。`
        : "依本次取消的情況，報名費用不予退還，如有疑問請直接回覆這封信與我們聯繫。",
    ];
  } else if (!isFree) {
    // 主辦方如果改寫了原因（不是預設的逾期說明），另外附上當作備註
    const extra = reason && reason !== OVERDUE_CANCEL_REASON ? [`主辦單位備註：${reason}`] : [];
    bodyLines = [
      `由於您報名「${title}」後，超過繳費期限仍未完成匯款，為了讓其他想參加的學員有機會報名，我們已將您的名額釋出，這次報名已取消。`,
      ...extra,
      "",
      "您尚未匯款，因此不需要辦理退款。如果您其實已經匯款了，請直接回覆這封信並附上匯款帳號後五碼，我們會盡快為您確認。",
      ...reregisterLines,
    ];
  } else {
    bodyLines = [`您報名的「${title}」已由主辦單位取消。`, ...(reason ? [`取消原因：${reason}`] : []), ...reregisterLines];
  }

  return notifyMember({
    toEmail,
    toName,
    subject: `【光農合作社群】您的報名已取消：${title}`,
    lines: [
      `${name} 您好：`,
      "",
      ...bodyLines,
      "",
      ...eventInfoLines(ev),
      "",
      "造成不便敬請見諒，有任何問題都可以直接回覆這封信。",
      ...SIGNATURE,
    ],
  });
}
