import { auth } from "../firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { listEvents, registerForEvent, getMyTicketForEvent } from "../events.js";
import { paymentStatusLabel } from "../tickets.js";

function formatDate(ts) {
  if (!ts) return "時間未定";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("zh-TW", { dateStyle: "medium", timeStyle: "short" });
}

export function renderEvents(container) {
  container.innerHTML = `
    <div class="max-w-5xl mx-auto">
      <h1 class="text-2xl font-bold text-gray-800 my-4">近期活動</h1>
      <div id="event-list" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"></div>
    </div>`;

  const listEl = container.querySelector("#event-list");

  async function render() {
    listEl.innerHTML = `<p class="text-gray-500 col-span-full text-center py-8">載入中...</p>`;

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

    listEl.innerHTML = events
      .map((ev) => {
        const ticket = myTickets[ev.id];
        const full = ev.maxCap && (ev.currentCount || 0) >= ev.maxCap;
        let actionHtml;

        if (!user) {
          actionHtml = `<button class="btn-disabled" disabled>請先登入</button>`;
        } else if (ticket) {
          const pay = paymentStatusLabel(ticket.paymentStatus);
          actionHtml = `<div class="flex items-center gap-2"><span class="badge badge-blue">已報名</span><span class="badge ${pay.cls}">${pay.text}</span></div>`;
        } else if (full) {
          actionHtml = `<button class="btn-disabled" disabled>名額已滿</button>`;
        } else {
          actionHtml = `<button data-event-id="${ev.id}" class="btn-register btn-primary">立即報名</button>`;
        }

        return `
          <div class="bg-white rounded-xl shadow p-5 flex flex-col gap-3">
            <h3 class="text-lg font-bold text-gray-800">${ev.title || ""}</h3>
            <p class="text-sm text-gray-500">${formatDate(ev.date)} · ${ev.location || ""}</p>
            <p class="text-sm text-gray-600 flex-1">${ev.description || ""}</p>
            <div class="flex items-center justify-between text-sm text-gray-500">
              <span>費用：${ev.price ? `NT$${ev.price}` : "免費"}</span>
              <span>名額：${ev.currentCount || 0}/${ev.maxCap || "不限"}</span>
            </div>
            <div>${actionHtml}</div>
          </div>`;
      })
      .join("");

    listEl.querySelectorAll(".btn-register").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "報名中...";
        try {
          await registerForEvent(btn.dataset.eventId);
          alert("報名成功！請至「我的票券」查看 QR Code。");
          render();
        } catch (e) {
          alert("報名失敗：" + e.message);
          btn.disabled = false;
          btn.textContent = "立即報名";
        }
      });
    });
  }

  const unsubscribe = onAuthStateChanged(auth, () => render());
  return () => unsubscribe();
}
