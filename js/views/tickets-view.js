import { auth } from "../firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getMyTickets, renderTicketQRCode, getMyStats, paymentStatusLabel } from "../tickets.js";
import { BANK_INFO, submitPaymentNotice, buildPaymentMailto } from "../payment.js";
import { requestCancellation, calcRefundPercent } from "../events.js";

function formatDate(ts) {
  if (!ts) return "時間未定";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("zh-TW", { dateStyle: "medium", timeStyle: "short" });
}

function eventDateOf(t) {
  const raw = t.event?.date;
  if (!raw) return null;
  return raw.toDate ? raw.toDate() : new Date(raw);
}

function paymentSectionHtml(t) {
  if (t.paymentStatus === "unpaid") {
    return `
      <div class="mt-3 border-t pt-3 text-sm text-gray-700">
        <p class="text-xs text-gray-500 mb-1">匯款資訊</p>
        <p>${BANK_INFO.bankName}　帳號：${BANK_INFO.account}　戶名：${BANK_INFO.accountName}</p>
        <p class="mt-1">應繳金額：NT$${t.event?.price || 0}</p>
        <input
          type="text"
          id="note-${t.id}"
          placeholder="匯款帳號後五碼（選填，方便對帳）"
          class="w-full border rounded-lg p-2 text-sm mt-2"
        />
        <button data-ticket-id="${t.id}" class="btn-pay-notify btn-primary text-sm mt-2">
          我已完成匯款，通知確認
        </button>
      </div>`;
  }
  if (t.paymentStatus === "pending") {
    return `<p class="text-sm text-gray-500 mt-2">已收到你的匯款通知，主辦方核對後會將狀態改為已繳費。</p>`;
  }
  return "";
}

const CANCELLATION_POLICY_LINES = [
  "・活動開始前 7 天（含）以上申請取消：全額退款，但會先扣除轉帳手續費",
  "・活動開始前 3～6 天申請取消：退款 50%",
  "・活動開始前不足 3 天申請取消：恕不退款",
];

// 這裡只負責把百分比轉成文字說明，實際門檻只在 events.js 的
// calcRefundPercent 裡定義一份，避免兩邊各寫一次天數判斷、日後改政策漏改。
function refundTierText(percent) {
  if (percent >= 100) return "全額退款（會另外扣除轉帳手續費）";
  if (percent >= 50) return "退款 50%";
  return "恕不退款";
}

// 取消前一定要先看過這個須知才能送出，內容是純文字組成、不涉及使用者輸入，
// 用 innerHTML 沒有風險。
function showCancelModal({ eventTitle, daysLeft, refundPercent, onConfirm }) {
  const overlay = document.createElement("div");
  overlay.className = "fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50";

  const box = document.createElement("div");
  box.className = "bg-white rounded-xl shadow-lg max-w-md w-full p-6";
  box.innerHTML = `
    <h2 class="text-lg font-bold text-gray-800 mb-2">活動取消須知</h2>
    <p class="text-sm text-gray-700 mb-2">活動：${eventTitle}</p>
    <pre class="text-xs text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-lg p-3 mb-3">${CANCELLATION_POLICY_LINES.join("\n")}</pre>
    <p class="text-sm font-bold text-gray-800 mb-2">
      ${
        daysLeft === null
          ? "活動時間未定"
          : `距離活動開始還有 ${Math.max(0, Math.floor(daysLeft))} 天，依政策你適用：${refundTierText(refundPercent)}`
      }
    </p>
    <p class="text-xs text-gray-500 mb-4">送出後需經主辦方審核；審核通過前活動仍照常進行、尚未退費，主辦方駁回的話票券會恢復正常。</p>`;

  const btnRow = document.createElement("div");
  btnRow.className = "flex gap-3 justify-end";

  const backBtn = document.createElement("button");
  backBtn.className = "text-sm text-gray-500 underline";
  backBtn.textContent = "返回";
  backBtn.addEventListener("click", () => overlay.remove());

  const confirmBtn = document.createElement("button");
  confirmBtn.className = "btn-danger text-sm";
  confirmBtn.textContent = "送出取消申請";
  confirmBtn.addEventListener("click", async () => {
    confirmBtn.disabled = true;
    confirmBtn.textContent = "處理中...";
    try {
      await onConfirm();
      overlay.remove();
      alert("已送出取消申請，主辦方審核前活動仍會照常進行、尚未退費，請留意「我的票券」的狀態更新。");
    } catch (e) {
      alert("送出失敗：" + e.message);
      confirmBtn.disabled = false;
      confirmBtn.textContent = "送出取消申請";
    }
  });

  btnRow.append(backBtn, confirmBtn);
  box.appendChild(btnRow);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

export function renderTickets(container) {
  container.innerHTML = `
    <div class="max-w-3xl mx-auto">
      <p id="login-prompt" class="hidden text-center text-gray-500 py-16">請先使用 Google 登入以查看你的個人中心與票券。</p>
      <section id="profile-section" class="hidden mb-8"></section>
      <h2 class="text-xl font-bold text-gray-800 mb-3">我的票券</h2>
      <div id="ticket-list" class="hidden space-y-4"></div>
    </div>`;

  const profileSection = container.querySelector("#profile-section");
  const ticketList = container.querySelector("#ticket-list");
  const loginPrompt = container.querySelector("#login-prompt");

  function wirePaymentButtons(tickets, user) {
    ticketList.querySelectorAll(".btn-pay-notify").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const ticketId = btn.dataset.ticketId;
        const ticket = tickets.find((t) => t.id === ticketId);
        const noteInput = ticketList.querySelector(`#note-${ticketId}`);
        const note = noteInput ? noteInput.value.trim() : "";

        btn.disabled = true;
        btn.textContent = "處理中...";
        try {
          await submitPaymentNotice(ticketId, note);
          window.location.href = buildPaymentMailto({
            userName: user.displayName || "",
            userEmail: user.email || "",
            eventTitle: ticket.event?.title || "",
            ticketId,
            amount: ticket.event?.price || 0,
            note,
          });
          render(user);
        } catch (e) {
          alert("通知失敗：" + e.message);
          btn.disabled = false;
          btn.textContent = "我已完成匯款，通知確認";
        }
      });
    });
  }

  function wireCancelButtons(tickets, user) {
    ticketList.querySelectorAll(".btn-cancel-ticket").forEach((btn) => {
      btn.addEventListener("click", () => {
        const ticket = tickets.find((t) => t.id === btn.dataset.cancelId);
        if (!ticket) return;
        const eventDate = eventDateOf(ticket);
        const daysLeft = eventDate ? (eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24) : null;
        const refundPercent = eventDate ? calcRefundPercent(eventDate) : 0;

        showCancelModal({
          eventTitle: ticket.event?.title || "",
          daysLeft,
          refundPercent,
          onConfirm: async () => {
            await requestCancellation(ticket.id);
            render(user);
          },
        });
      });
    });
  }

  function ticketCardHtml(t) {
    if (t.isCancelled) {
      return `
      <div class="bg-white rounded-xl shadow p-5 opacity-75">
        <h3 class="font-bold text-gray-800">${t.event?.title || "活動已刪除"}</h3>
        <p class="text-sm text-gray-500">${formatDate(t.event?.date)} · ${t.event?.location || ""}</p>
        <div class="flex flex-wrap gap-2 mt-2">
          <span class="badge badge-red">已取消</span>
        </div>
        <p class="text-sm text-gray-500 mt-2">退款比例：${t.refundPercent ?? 0}%</p>
      </div>`;
    }

    const pay = paymentStatusLabel(t.paymentStatus);
    const cancelPending = t.cancelRequestStatus === "pending";

    let actionHtml;
    if (t.isCheckedIn) {
      actionHtml = `<a href="#/review?eventId=${t.eventId}" class="inline-block mt-3 text-sm text-emerald-600 underline">填寫活動評價</a>`;
    } else if (cancelPending) {
      actionHtml = `<p class="text-sm text-yellow-700 mt-3">取消申請審核中，主辦方確認前活動仍照常進行，尚未退費。</p>`;
    } else {
      actionHtml = `<button data-cancel-id="${t.id}" class="btn-cancel-ticket inline-block mt-3 text-sm text-red-600 underline">申請取消報名</button>`;
    }

    return `
      <div class="bg-white rounded-xl shadow p-5 flex flex-col md:flex-row gap-4 items-start">
        <div id="qr-${t.id}" class="shrink-0"></div>
        <div class="flex-1 w-full">
          <h3 class="font-bold text-gray-800">${t.event?.title || "活動已刪除"}</h3>
          <p class="text-sm text-gray-500">${formatDate(t.event?.date)} · ${t.event?.location || ""}</p>
          <div class="flex flex-wrap gap-2 mt-2">
            <span class="badge ${pay.cls}">${pay.text}</span>
            <span class="badge ${t.isCheckedIn ? "badge-blue" : "badge-gray"}">
              ${t.isCheckedIn ? "已報到" : "尚未報到"}
            </span>
            ${cancelPending ? `<span class="badge badge-yellow">取消審核中</span>` : ""}
          </div>
          ${cancelPending ? "" : paymentSectionHtml(t)}
          ${actionHtml}
        </div>
      </div>`;
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
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-center">
        <div class="bg-white rounded-lg shadow p-3">
          <p class="text-2xl font-bold text-emerald-600">${stats.total}</p>
          <p class="text-xs text-gray-500">總報名次數</p>
        </div>
        <div class="bg-white rounded-lg shadow p-3">
          <p class="text-2xl font-bold text-emerald-600">${stats.attended}</p>
          <p class="text-xs text-gray-500">實際出席次數</p>
        </div>
        <div class="bg-white rounded-lg shadow p-3">
          <p class="text-2xl font-bold text-emerald-600">${stats.cancelled}</p>
          <p class="text-xs text-gray-500">取消次數</p>
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

    ticketList.innerHTML = tickets.map(ticketCardHtml).join("");

    tickets.forEach((t) => {
      if (t.isCancelled) return;
      const el = ticketList.querySelector(`#qr-${t.id}`);
      if (el) renderTicketQRCode(el, t);
    });

    wirePaymentButtons(tickets, user);
    wireCancelButtons(tickets, user);
  }

  const unsubscribe = onAuthStateChanged(auth, render);
  return () => unsubscribe();
}
