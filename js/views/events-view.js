import { auth } from "../firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { listEvents, registerForEvent, getMyTicketForEvent } from "../events.js";
import { paymentStatusLabel } from "../tickets.js";
import { renderTagBadgesHtml } from "../tags.js";

function formatDate(ts) {
  if (!ts) return "時間未定";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("zh-TW", { dateStyle: "medium", timeStyle: "short" });
}

function eventDateOf(ev) {
  if (!ev.date) return null;
  return ev.date.toDate ? ev.date.toDate() : new Date(ev.date);
}

export function renderEvents(container) {
  container.innerHTML = `
    <div class="max-w-5xl mx-auto">
      <h1 class="text-2xl font-bold text-gray-800 my-4">近期活動</h1>
      <div id="event-list" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"></div>

      <h2 id="past-events-heading" class="hidden text-xl font-bold text-gray-500 mt-10 mb-4">過往活動</h2>
      <div id="past-event-list" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"></div>
    </div>`;

  const listEl = container.querySelector("#event-list");
  const pastListEl = container.querySelector("#past-event-list");
  const pastHeadingEl = container.querySelector("#past-events-heading");

  function eventCardHtml(ev, ticket, user, isPast) {
    const full = ev.maxCap && (ev.currentCount || 0) >= ev.maxCap;
    let actionHtml;

    if (!user) {
      actionHtml = `<button class="btn-disabled" disabled>請先登入</button>`;
    } else if (ticket && !ticket.isCancelled) {
      const pay = paymentStatusLabel(ticket.paymentStatus);
      const cancelBadge =
        ticket.cancelRequestStatus === "pending" ? `<span class="badge badge-yellow">取消審核中</span>` : "";
      actionHtml = `<div class="flex flex-wrap items-center gap-2"><span class="badge badge-blue">已報名</span><span class="badge ${pay.cls}">${pay.text}</span>${cancelBadge}</div>`;
    } else if (isPast) {
      actionHtml = `<button class="btn-disabled" disabled>活動已結束</button>`;
    } else if (full) {
      actionHtml = `<button class="btn-disabled" disabled>名額已滿</button>`;
    } else {
      actionHtml = `<button data-event-id="${ev.id}" class="btn-register btn-primary">立即報名</button>`;
    }

    const posterHtml = ev.posterUrl
      ? `<img src="${ev.posterUrl}" alt="" class="w-full h-40 object-cover rounded-lg" />`
      : "";

    return `
      <div class="bg-white rounded-xl shadow p-5 flex flex-col gap-3 ${isPast ? "opacity-75" : ""}">
        ${posterHtml}
        <h3 class="text-lg font-bold text-gray-800">
          <a href="#/event?id=${ev.id}" class="hover:underline">${ev.title || ""}</a>
        </h3>
        ${ev.tags && ev.tags.length > 0 ? `<div class="flex flex-wrap gap-1">${renderTagBadgesHtml(ev.tags)}</div>` : ""}
        <p class="text-sm text-gray-500">${formatDate(ev.date)} · ${ev.location || ""}</p>
        <p class="text-sm text-gray-600 flex-1">${ev.description || ""}</p>
        <div class="flex items-center justify-between text-sm text-gray-500">
          <span>費用：${ev.price ? `NT$${ev.price}` : "免費"}</span>
          <span>名額：${ev.currentCount || 0}/${ev.maxCap || "不限"}</span>
        </div>
        <div>${actionHtml}</div>
      </div>`;
  }

  function wireRegisterButtons(root) {
    root.querySelectorAll(".btn-register").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "報名中...";
        try {
          await registerForEvent(btn.dataset.eventId);
          alert("報名成功！接下來請完成繳費。");
          location.hash = "#/tickets";
        } catch (e) {
          alert("報名失敗：" + e.message);
          btn.disabled = false;
          btn.textContent = "立即報名";
        }
      });
    });
  }

  async function render() {
    listEl.innerHTML = `<p class="text-gray-500 col-span-full text-center py-8">載入中...</p>`;
    pastListEl.innerHTML = "";
    pastHeadingEl.classList.add("hidden");

    const events = await listEvents();
    const user = auth.currentUser;

    const myTickets = {};
    if (user) {
      for (const ev of events) {
        myTickets[ev.id] = await getMyTicketForEvent(user.uid, ev.id);
      }
    }

    if (events.length === 0) {
      listEl.innerHTML = `<p class="text-gray-500 col-span-full text-center py-8">目前尚無活動</p>`;
      return;
    }

    // 由新到舊排序（活動日期較晚的排前面），再依「是否已經過了活動日期」
    // 拆成「近期活動」跟「過往活動」兩區，過往活動獨立放在下面一區。
    const now = new Date();
    const sorted = [...events].sort((a, b) => {
      const da = eventDateOf(a) || new Date(0);
      const db = eventDateOf(b) || new Date(0);
      return db - da;
    });
    const upcoming = sorted.filter((ev) => {
      const d = eventDateOf(ev);
      return !d || d >= now;
    });
    const past = sorted.filter((ev) => {
      const d = eventDateOf(ev);
      return d && d < now;
    });

    listEl.innerHTML =
      upcoming.length > 0
        ? upcoming.map((ev) => eventCardHtml(ev, myTickets[ev.id], user, false)).join("")
        : `<p class="text-gray-500 col-span-full text-center py-8">目前尚無近期活動</p>`;
    wireRegisterButtons(listEl);

    if (past.length > 0) {
      pastHeadingEl.classList.remove("hidden");
      pastListEl.innerHTML = past.map((ev) => eventCardHtml(ev, myTickets[ev.id], user, true)).join("");
    }
  }

  const unsubscribe = onAuthStateChanged(auth, () => render());
  return () => unsubscribe();
}
