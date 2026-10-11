// 同行孩童：15 歲以下的孩子沒有自己的 Google 帳號，由家長在報名時代為報名，
// 存在家長那張票券的 companions 陣列裡（[{ name, nationalId, birthDate }]）。
// 每位孩童佔一個名額、算進開課人數，費用跟成人一樣；報到時跟家長用同一張票。
import { TAIWAN_ID_REGEX } from "./profile.js";
import { DISCOUNT_PERCENT } from "./discounts.js";

export const MAX_COMPANIONS = 3; // Firestore 規則也限制同樣的數量
export const COMPANION_MAX_AGE = 15;

export function companionsOf(ticket) {
  return Array.isArray(ticket?.companions) ? ticket.companions : [];
}

// 這張票券佔幾個名額（家長本人 + 同行孩童）
export function seatsOf(ticket) {
  return 1 + companionsOf(ticket).length;
}

function toDate(ts) {
  if (!ts) return null;
  return ts.toDate ? ts.toDate() : new Date(ts);
}

// 出生日期（YYYY-MM-DD）到 onDate 當天的實歲
export function ageOn(birthDate, onDate) {
  const [y, m, d] = String(birthDate).split("-").map(Number);
  if (!y || !m || !d) return null;
  const on = toDate(onDate) || new Date();
  let age = on.getFullYear() - y;
  if (on.getMonth() + 1 < m || (on.getMonth() + 1 === m && on.getDate() < d)) age -= 1;
  return age;
}

// requireAll：會員報名時三個欄位都要填；主辦方在後台補登時可以先只填姓名，
// 保險資料之後再補（投保名單會標示「尚未填寫」）。回傳錯誤訊息或 null。
export function validateCompanion(c, eventDate, { requireAll = true } = {}) {
  const label = c.name ? `「${c.name}」` : "孩童";
  if (!c.name) return "請輸入每位孩童的真實姓名";
  if (requireAll && !c.nationalId) return `請輸入${label}的身分證字號`;
  if (c.nationalId && !TAIWAN_ID_REGEX.test(c.nationalId)) return `${label}的身分證字號格式不正確（例如 A123456789）`;
  if (requireAll && !c.birthDate) return `請選擇${label}的出生年月日`;
  if (c.birthDate) {
    const age = ageOn(c.birthDate, eventDate);
    if (age === null || age < 0) return `${label}的出生年月日不正確`;
    if (age > COMPANION_MAX_AGE) {
      return `${label}活動當天已經 ${age} 歲，16 歲以上請用自己的 Google 帳號另外報名`;
    }
  }
  return null;
}

export function normalizeCompanion(c) {
  return {
    name: String(c.name || "").trim(),
    nationalId: String(c.nationalId || "").trim().toUpperCase(),
    birthDate: c.birthDate || "",
  };
}

// 應繳金額：出席折扣券只折家長本人那一份，孩童照原價
export function ticketAmount(price, ticket) {
  const p = Number(price) || 0;
  const own = ticket?.discountApplied ? Math.round(p * (1 - DISCOUNT_PERCENT / 100)) : p;
  return own + p * companionsOf(ticket).length;
}

// 「王小美、陳小明」這種一行的孩童名單
export function companionNames(ticket) {
  return companionsOf(ticket)
    .map((c) => c.name)
    .join("、");
}
