// 最低開課人數：活動開始前 COURSE_CONFIRM_DAYS_BEFORE 天是「開課確認日」，
// 跟取消退費政策（7 天以上全額退款）對齊，方便跟學員說明。
// 狀態完全由活動日期 + 目前報名人數即時算出來，不另外存在資料庫裡，
// 所以核准取消、人數掉下來時也會跟著正確反映。
export const COURSE_CONFIRM_DAYS_BEFORE = 7;

// 回傳 null 代表這場活動沒有設定最低人數，照舊不顯示任何開課狀態。
export function getCourseStatus(ev) {
  if (!ev?.minCap) return null;
  const date = ev.date?.toDate ? ev.date.toDate() : ev.date ? new Date(ev.date) : null;
  if (!date) return null;

  const confirmDate = new Date(date.getTime() - COURSE_CONFIRM_DAYS_BEFORE * 24 * 60 * 60 * 1000);
  const count = ev.currentCount || 0;
  const reached = count >= ev.minCap;
  const pastConfirmDate = Date.now() >= confirmDate.getTime();

  return {
    state: reached ? "confirmed" : pastConfirmDate ? "cancelled" : "recruiting",
    confirmDate,
    shortfall: Math.max(0, ev.minCap - count),
  };
}

export function courseStatusText(ev) {
  const s = getCourseStatus(ev);
  if (!s) return "";
  if (s.state === "confirmed") return `✅ 已達最低 ${ev.minCap} 人，確定開課`;
  if (s.state === "cancelled") return `❌ 未達最低開課人數（${ev.minCap} 人），本活動不開課`;
  const md = `${s.confirmDate.getMonth() + 1}/${s.confirmDate.getDate()}`;
  return `⏳ 招生中：還差 ${s.shortfall} 人成團（最低 ${ev.minCap} 人，${md} 確認是否開課）`;
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
