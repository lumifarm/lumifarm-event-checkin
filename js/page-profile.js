import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { initNavbar } from "./nav.js";
import { getMyTickets, renderTicketQRCode, getMyStats } from "./tickets.js";

initNavbar();

const profileSection = document.getElementById("profile-section");
const ticketList = document.getElementById("ticket-list");
const loginPrompt = document.getElementById("login-prompt");

function formatDate(ts) {
  if (!ts) return "時間未定";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("zh-TW", { dateStyle: "medium", timeStyle: "short" });
}

async function render(user) {
  if (!user) {
    profileSection.classList.add("hidden");
    ticketList.classList.add("hidden");
    loginPrompt.classList.remove("hidden");
    return;
  }

  loginPrompt.classList.add("hidden");
  profileSection.classList.remove("hidden");
  ticketList.classList.remove("hidden");

  const stats = await getMyStats();
  profileSection.innerHTML = `
    <div class="flex items-center gap-4">
      <img src="${user.photoURL || ""}" class="w-16 h-16 rounded-full border" />
      <div>
        <p class="text-xl font-bold">${user.displayName || ""}</p>
        <p class="text-sm text-gray-500">${user.email || ""}</p>
      </div>
    </div>
    <div class="grid grid-cols-3 gap-3 mt-4 text-center">
      <div class="bg-white rounded-lg shadow p-3">
        <p class="text-2xl font-bold text-emerald-600">${stats.total}</p>
        <p class="text-xs text-gray-500">總報名次數</p>
      </div>
      <div class="bg-white rounded-lg shadow p-3">
        <p class="text-2xl font-bold text-emerald-600">${stats.attended}</p>
        <p class="text-xs text-gray-500">實際出席次數</p>
      </div>
      <div class="bg-white rounded-lg shadow p-3">
        <p class="text-2xl font-bold text-emerald-600">${stats.rate}%</p>
        <p class="text-xs text-gray-500">出席率</p>
      </div>
    </div>`;

  const tickets = await getMyTickets();
  if (tickets.length === 0) {
    ticketList.innerHTML = `<p class="text-gray-500 text-center py-8">尚無報名紀錄</p>`;
    return;
  }

  ticketList.innerHTML = tickets
    .map(
      (t) => `
    <div class="bg-white rounded-xl shadow p-5 flex flex-col md:flex-row gap-4 items-center">
      <div id="qr-${t.id}" class="shrink-0"></div>
      <div class="flex-1 w-full">
        <h3 class="font-bold text-gray-800">${t.event?.title || "活動已刪除"}</h3>
        <p class="text-sm text-gray-500">${formatDate(t.event?.date)} · ${t.event?.location || ""}</p>
        <div class="flex flex-wrap gap-2 mt-2">
          <span class="badge ${t.paymentStatus === "paid" ? "badge-green" : "badge-yellow"}">
            ${t.paymentStatus === "paid" ? "已繳費" : "未繳費"}
          </span>
          <span class="badge ${t.isCheckedIn ? "badge-blue" : "badge-gray"}">
            ${t.isCheckedIn ? "已報到" : "尚未報到"}
          </span>
        </div>
        ${
          t.isCheckedIn
            ? `<a href="review.html?eventId=${t.eventId}" class="inline-block mt-3 text-sm text-emerald-600 underline">填寫活動評價</a>`
            : ""
        }
      </div>
    </div>`
    )
    .join("");

  tickets.forEach((t) => {
    const el = document.getElementById(`qr-${t.id}`);
    if (el) renderTicketQRCode(el, t);
  });
}

onAuthStateChanged(auth, render);
