import { db } from "../firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { currentQuery } from "../router.js";

function formatDate(ts) {
  if (!ts) return "時間未定";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("zh-TW", { dateStyle: "medium", timeStyle: "short" });
}

export async function renderEventDetail(container) {
  const eventId = currentQuery().get("id");

  if (!eventId) {
    container.innerHTML = `<p class="max-w-md mx-auto text-center text-red-500 py-16">缺少活動代碼。</p>`;
    return;
  }

  container.innerHTML = `<p class="text-center text-gray-500 py-16">載入中...</p>`;

  const snap = await getDoc(doc(db, "events", eventId));
  if (!snap.exists()) {
    container.innerHTML = `<p class="max-w-md mx-auto text-center text-gray-500 py-16">找不到這個活動，可能已經被刪除。</p>`;
    return;
  }

  const ev = snap.data();
  const posterHtml = ev.posterUrl ? `<img src="${ev.posterUrl}" alt="" class="w-full rounded-xl mb-4" />` : "";

  container.innerHTML = `
    <div class="max-w-2xl mx-auto">
      ${posterHtml}
      <h1 class="text-2xl font-bold text-gray-800 mb-2">${ev.title || ""}</h1>
      <p class="text-sm text-gray-500 mb-4">${formatDate(ev.date)} · ${ev.location || ""}</p>
      <div class="bg-white rounded-xl shadow p-5 space-y-3">
        <p class="text-gray-700 whitespace-pre-wrap">${ev.description || "（尚無活動說明）"}</p>
        <div class="flex items-center justify-between text-sm text-gray-500 border-t pt-3">
          <span>費用：${ev.price ? `NT$${ev.price}` : "免費"}</span>
          <span>名額：${ev.currentCount || 0}/${ev.maxCap || "不限"}</span>
        </div>
      </div>
      <a href="#/events" class="inline-block mt-4 text-sm text-emerald-600 underline">← 返回活動列表</a>
    </div>`;
}
