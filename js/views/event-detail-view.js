import { auth, db } from "../firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { currentQuery } from "../router.js";
import { renderTagBadgesHtml, loadTags } from "../tags.js";
import { courseStatusHtml } from "../courseStatus.js";
import { getMyTicketForEvent } from "../events.js";
import { registerActionHtml, wireRegisterButtons } from "../registerAction.js";

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

  const [snap] = await Promise.all([getDoc(doc(db, "events", eventId)), loadTags()]);
  if (!snap.exists()) {
    container.innerHTML = `<p class="max-w-md mx-auto text-center text-gray-500 py-16">找不到這個活動，可能已經被刪除。</p>`;
    return;
  }

  const ev = { id: snap.id, ...snap.data() };
  const eventDate = ev.date?.toDate ? ev.date.toDate() : ev.date ? new Date(ev.date) : null;
  const isPast = eventDate ? eventDate < new Date() : false;

  const posterHtml = ev.posterUrl ? `<img src="${ev.posterUrl}" alt="" class="w-full rounded-xl mb-4" />` : "";
  const isLaborExchange = (ev.tags || []).includes("labor-exchange");
  const workFormHtml = isLaborExchange
    ? `<div class="bg-lime-50 border border-lime-300 rounded-xl p-4 text-sm text-lime-800">
        這是換工活動！當天出席並完成拔草、澆水、種植等工作，主辦方確認 OK 後會直接把換工點數登記到你的帳號，不需要另外上傳照片。
      </div>`
    : "";

  const summaryHtml = ev.summary
    ? `<div>
        <h2 class="text-lg font-bold text-gray-800 mb-1">活動簡介</h2>
        <p class="text-gray-700 leading-relaxed whitespace-pre-wrap">${ev.summary}</p>
      </div>`
    : "";
  const contentHtml = ev.description
    ? `<div>
        <h2 class="text-lg font-bold text-gray-800 mb-1">活動內容</h2>
        <p class="text-gray-700 leading-relaxed whitespace-pre-wrap">${ev.description}</p>
      </div>`
    : "";

  container.innerHTML = `
    <div class="max-w-3xl mx-auto">
      ${posterHtml}
      <h1 class="text-2xl md:text-3xl font-bold text-gray-800 mb-2">${ev.title || ""}</h1>
      ${ev.tags && ev.tags.length > 0 ? `<div class="flex flex-wrap gap-2 mb-2">${renderTagBadgesHtml(ev.tags)}</div>` : ""}
      <p class="text-gray-500 ${ev.instructor ? "mb-1" : "mb-4"}">${formatDate(ev.date)} · ${ev.location || ""}</p>
      ${ev.instructor ? `<p class="text-gray-700 mb-4">👤 講師：${ev.instructor}</p>` : ""}
      ${workFormHtml ? `<div class="mb-4">${workFormHtml}</div>` : ""}
      ${courseStatusHtml(ev) ? `<div class="mb-4">${courseStatusHtml(ev)}</div>` : ""}
      <div class="card rounded-xl p-5 md:p-7 space-y-5">
        ${summaryHtml}
        ${contentHtml}
        ${!summaryHtml && !contentHtml ? `<p class="text-gray-500">（尚無活動說明）</p>` : ""}
        <div class="flex items-center justify-between text-gray-500 border-t pt-3">
          <span>費用：${ev.price ? `NT$${ev.price}` : "免費"}</span>
          <span>名額：${ev.currentCount || 0}/${ev.maxCap || "不限"}${ev.minCap ? `（最低 ${ev.minCap} 人開課）` : ""}</span>
        </div>
        <div id="event-detail-register" class="border-t pt-4"></div>
      </div>
      <button id="event-detail-back" type="button" class="inline-block mt-4 text-sm text-emerald-600 underline">
        ← 返回
      </button>
    </div>`;

  // 用瀏覽器的上一頁，而不是寫死回「活動列表」：這個頁面可能是從活動列表
  // 或「我的票券」點進來的，回上一頁才會回到使用者原本所在的地方。
  container.querySelector("#event-detail-back").addEventListener("click", () => {
    history.back();
  });

  // 報名區塊跟活動列表卡片用同一套邏輯（registerAction.js），要等登入狀態
  // 確定後才知道該顯示「請先登入」、「立即報名」還是已報名/繳費狀態。
  const registerEl = container.querySelector("#event-detail-register");
  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    const ticket = user ? await getMyTicketForEvent(user.uid, ev.id) : null;
    registerEl.innerHTML = registerActionHtml(ev, ticket, user, isPast);
    wireRegisterButtons(registerEl, { findEvent: () => ev, user });
  });
  return () => unsubscribe();
}
