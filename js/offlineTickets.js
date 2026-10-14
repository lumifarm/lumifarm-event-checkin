// 離線票券：活動現場常常收訊不好，「我的票券」每次成功載入時，把還沒結束、
// 沒取消的票券（QR Code 需要的票券代碼與活動基本資訊）存在這支手機裡；
// 之後打不開資料庫時，就用存下來的資料顯示 QR Code，照樣可以報到。
// 只存在本人這台裝置（localStorage），登出時清掉。

const KEY_PREFIX = "offlineTickets:";

function toIso(ts) {
  if (!ts) return null;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return isNaN(d) ? null : d.toISOString();
}

export function saveOfflineTickets(uid, tickets) {
  try {
    const data = {
      savedAt: new Date().toISOString(),
      tickets: tickets
        .filter((t) => !t.isCancelled && t.securityCode)
        .map((t) => ({
          id: t.id,
          securityCode: t.securityCode,
          title: t.event?.title || "",
          date: toIso(t.event?.date),
          location: t.event?.location || "",
          paymentStatus: t.paymentStatus || "",
          isCheckedIn: Boolean(t.isCheckedIn),
          companions: (t.companions || []).map((c) => c.name),
        })),
    };
    localStorage.setItem(KEY_PREFIX + uid, JSON.stringify(data));
  } catch (e) {
    // 無痕模式或空間不足就不存，只是少了離線功能
  }
}

export function loadOfflineTickets(uid) {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + uid);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function clearOfflineTickets() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(KEY_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch (e) {
    // ignore
  }
}
