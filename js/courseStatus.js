// 最低開課人數：活動開始前 COURSE_CONFIRM_DAYS_BEFORE 天是「開課確認日」，
// 跟取消退費政策（7 天以上全額退款）對齊，方便跟學員說明。
// 狀態完全由活動日期 + 已完成繳費人數（paidCount）即時算出來，只按了報名、
// 還沒繳費的人不算；不另外存在資料庫裡，所以確認匯款、核准取消時也會跟著
// 正確反映。
export function paidCountOf(ev) {
  return Math.max(0, ev?.paidCount ?? 0);
}
export const COURSE_CONFIRM_DAYS_BEFORE = 7;

// 回傳 null 代表這場活動沒有設定最低人數，照舊不顯示任何開課狀態。
export function getCourseStatus(ev) {
  if (!ev?.minCap) return null;
  const date = ev.date?.toDate ? ev.date.toDate() : ev.date ? new Date(ev.date) : null;
  if (!date) return null;

  const confirmDate = new Date(date.getTime() - COURSE_CONFIRM_DAYS_BEFORE * 24 * 60 * 60 * 1000);
  const count = paidCountOf(ev);
  const reached = count >= ev.minCap;
  const pastConfirmDate = Date.now() >= confirmDate.getTime();

  return {
    state: reached ? "confirmed" : pastConfirmDate ? "cancelled" : "recruiting",
    confirmDate,
    shortfall: Math.max(0, ev.minCap - count),
    paid: count,
  };
}

export function courseStatusText(ev) {
  const s = getCourseStatus(ev);
  if (!s) return "";
  if (s.state === "confirmed") return `✅ 已有 ${s.paid} 人完成繳費（最低 ${ev.minCap} 人），確定開課`;
  if (s.state === "cancelled") return `❌ 完成繳費人數未達最低開課人數（${ev.minCap} 人），本活動不開課`;
  const md = `${s.confirmDate.getMonth() + 1}/${s.confirmDate.getDate()}`;
  return `⏳ 招生中：已有 ${s.paid} 人完成繳費，還差 ${s.shortfall} 人成團（最低 ${ev.minCap} 人，以完成繳費人數計算，${md} 確認是否開課）`;
}

// 文字全部是系統自己組的（數字與日期），沒有使用者輸入，用 innerHTML 沒有風險。
export function courseStatusHtml(ev) {
  const s = getCourseStatus(ev);
  if (!s) return "";
  const cls = {
    confirmed: "bg-emerald-50 border-emerald-300 text-emerald-800",
    cancelled: "bg-red-50 border-red-300 text-red-700",
    recruiting: "bg-amber-50 border-amber-300 text-amber-800",
  }[s.state];
  return `<p class="text-sm font-bold border rounded-lg px-3 py-2 ${cls}">${courseStatusText(ev)}</p>`;
}

// 活動列表／活動頁的人數說明：已繳費人數、有效報名人數（含尚未繳費、佔用名額）與名額上限
export function seatsText(ev) {
  const cur = Math.max(0, ev?.currentCount || 0);
  const isFree = !ev?.price || ev.price <= 0;
  const reg = `已報名 ${cur}/${ev?.maxCap || "不限"}`;
  return isFree ? reg : `已繳費 ${paidCountOf(ev)} 人 · ${reg}`;
}
