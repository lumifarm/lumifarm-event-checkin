import { auth } from "../firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { isCurrentUserAdmin } from "../checkin.js";
import { listPendingPayments, confirmPayment } from "../payment.js";
import {
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  uploadEventPoster,
  removeEventPoster,
  listPendingCancellations,
  approveCancellation,
  rejectCancellation,
} from "../events.js";
import { listAllUsers } from "../tickets.js";

function formatDate(ts) {
  if (!ts) return "時間未定";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("zh-TW", { dateStyle: "medium", timeStyle: "short" });
}

function toDatetimeLocalValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// 每一列都用 createElement + textContent 手動組，不用 innerHTML 拼字串：
// 使用者姓名（Google 顯示名稱）跟匯款備註都是使用者能自由輸入的文字，
// 直接塞進 innerHTML 會讓惡意內容在主辦方的瀏覽器裡被當成程式碼執行。
function renderPaymentRow(p, onDone) {
  const row = document.createElement("div");
  row.className = "bg-white rounded-lg shadow p-4 flex items-center justify-between gap-3";

  const info = document.createElement("div");
  const title = document.createElement("p");
  title.className = "font-bold text-gray-800";
  title.textContent = p.event?.title || "活動已刪除";

  const who = document.createElement("p");
  who.className = "text-sm text-gray-600";
  who.textContent = `${p.user?.name || "未知使用者"}（${p.user?.email || ""}）`;

  const detail = document.createElement("p");
  detail.className = "text-sm text-gray-500";
  detail.textContent = `金額：NT$${p.event?.price || 0}　備註：${p.paymentNote || "（無）"}`;

  info.append(title, who, detail);

  const btn = document.createElement("button");
  btn.className = "btn-primary text-sm shrink-0";
  btn.textContent = "確認已收款";
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "處理中...";
    try {
      await confirmPayment(p.id);
      onDone();
    } catch (e) {
      alert("確認失敗：" + e.message);
      btn.disabled = false;
      btn.textContent = "確認已收款";
    }
  });

  row.append(info, btn);
  return row;
}

export function renderAdmin(container) {
  container.innerHTML = `
    <div class="max-w-3xl mx-auto">
      <h1 class="text-xl font-bold text-gray-800 my-4">主辦專區</h1>
      <p id="admin-gate" class="hidden text-gray-500 py-8"></p>

      <div id="admin-section" class="hidden space-y-10">
        <section>
          <h2 class="text-lg font-bold text-gray-800 mb-3" id="event-form-title">新增活動</h2>
          <form id="event-form" class="bg-white rounded-xl shadow p-5 space-y-3">
            <div>
              <label class="text-sm text-gray-600 block mb-1">活動名稱</label>
              <input id="ev-title" type="text" required class="w-full border rounded-lg p-2" />
            </div>
            <div>
              <label class="text-sm text-gray-600 block mb-1">活動說明</label>
              <textarea id="ev-description" rows="3" class="w-full border rounded-lg p-2"></textarea>
            </div>
            <div>
              <label class="text-sm text-gray-600 block mb-1">地點</label>
              <input id="ev-location" type="text" class="w-full border rounded-lg p-2" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-sm text-gray-600 block mb-1">日期時間</label>
                <input id="ev-date" type="datetime-local" required class="w-full border rounded-lg p-2" />
              </div>
              <div>
                <label class="text-sm text-gray-600 block mb-1">費用（NT$，0 表示免費）</label>
                <input id="ev-price" type="number" min="0" value="0" class="w-full border rounded-lg p-2" />
              </div>
            </div>
            <div>
              <label class="text-sm text-gray-600 block mb-1">名額上限（留空表示不限）</label>
              <input id="ev-maxcap" type="number" min="1" class="w-full border rounded-lg p-2" />
            </div>
            <div>
              <label class="text-sm text-gray-600 block mb-1">活動海報圖片（選填，2MB 以內）</label>
              <div id="ev-poster-preview" class="hidden mb-2">
                <img class="w-full max-w-xs rounded-lg border" />
                <button type="button" id="ev-poster-remove" class="text-sm text-red-600 underline mt-1">移除海報</button>
              </div>
              <input id="ev-poster" type="file" accept="image/*" class="w-full text-sm" />
            </div>
            <div class="flex gap-3 items-center">
              <button type="submit" id="event-form-submit" class="btn-primary text-sm">新增活動</button>
              <button type="button" id="event-form-cancel" class="hidden text-sm text-gray-500 underline">取消編輯</button>
            </div>
          </form>
        </section>

        <section>
          <h2 class="text-lg font-bold text-gray-800 mb-3">活動管理</h2>
          <div id="event-manage-list" class="space-y-3"></div>
        </section>

        <section>
          <h2 class="text-lg font-bold text-gray-800 mb-3">待確認繳費</h2>
          <div id="pending-payments" class="space-y-3"></div>
        </section>

        <section>
          <h2 class="text-lg font-bold text-gray-800 mb-3">取消申請</h2>
          <div id="pending-cancellations" class="space-y-3"></div>
        </section>

        <section>
          <h2 class="text-lg font-bold text-gray-800 mb-3">會員總覽</h2>
          <div id="user-overview" class="bg-white rounded-xl shadow overflow-x-auto"></div>
        </section>
      </div>
    </div>`;

  const adminGate = container.querySelector("#admin-gate");
  const adminSection = container.querySelector("#admin-section");
  const pendingEl = container.querySelector("#pending-payments");
  const eventListEl = container.querySelector("#event-manage-list");
  const cancellationsEl = container.querySelector("#pending-cancellations");
  const userOverviewEl = container.querySelector("#user-overview");

  const eventForm = container.querySelector("#event-form");
  const formTitleEl = container.querySelector("#event-form-title");
  const submitBtn = container.querySelector("#event-form-submit");
  const cancelBtn = container.querySelector("#event-form-cancel");
  const posterPreview = container.querySelector("#ev-poster-preview");
  const posterPreviewImg = posterPreview.querySelector("img");
  const posterRemoveBtn = container.querySelector("#ev-poster-remove");
  const fields = {
    title: container.querySelector("#ev-title"),
    description: container.querySelector("#ev-description"),
    location: container.querySelector("#ev-location"),
    date: container.querySelector("#ev-date"),
    price: container.querySelector("#ev-price"),
    maxCap: container.querySelector("#ev-maxcap"),
    poster: container.querySelector("#ev-poster"),
  };

  let editingEventId = null;
  let currentPosterUrl = null;

  function showPosterPreview(url) {
    currentPosterUrl = url || null;
    if (url) {
      posterPreviewImg.src = url;
      posterPreview.classList.remove("hidden");
    } else {
      posterPreview.classList.add("hidden");
    }
  }

  function resetForm() {
    editingEventId = null;
    eventForm.reset();
    fields.price.value = "0";
    formTitleEl.textContent = "新增活動";
    submitBtn.textContent = "新增活動";
    cancelBtn.classList.add("hidden");
    showPosterPreview(null);
  }

  function startEdit(ev) {
    editingEventId = ev.id;
    fields.title.value = ev.title || "";
    fields.description.value = ev.description || "";
    fields.location.value = ev.location || "";
    const d = ev.date?.toDate ? ev.date.toDate() : ev.date ? new Date(ev.date) : new Date();
    fields.date.value = toDatetimeLocalValue(d);
    fields.price.value = ev.price || 0;
    fields.maxCap.value = ev.maxCap || "";
    fields.poster.value = "";
    showPosterPreview(ev.posterUrl || null);
    formTitleEl.textContent = `編輯活動：${ev.title || ""}`;
    submitBtn.textContent = "儲存變更";
    cancelBtn.classList.remove("hidden");
    eventForm.scrollIntoView({ behavior: "smooth" });
  }

  cancelBtn.addEventListener("click", resetForm);

  posterRemoveBtn.addEventListener("click", async () => {
    if (!editingEventId) {
      showPosterPreview(null);
      return;
    }
    if (!confirm("確定要移除這張海報嗎？")) return;
    posterRemoveBtn.disabled = true;
    try {
      await removeEventPoster(editingEventId);
      showPosterPreview(null);
      renderEventList();
    } catch (err) {
      alert("移除失敗：" + err.message);
    } finally {
      posterRemoveBtn.disabled = false;
    }
  });

  eventForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
      title: fields.title.value.trim(),
      description: fields.description.value.trim(),
      location: fields.location.value.trim(),
      date: fields.date.value ? new Date(fields.date.value) : null,
      price: Number(fields.price.value) || 0,
      maxCap: fields.maxCap.value.trim() === "" ? null : Number(fields.maxCap.value),
    };
    if (!data.title || !data.date) {
      alert("請填寫活動名稱與日期時間");
      return;
    }

    submitBtn.disabled = true;
    try {
      let eventId = editingEventId;
      if (editingEventId) {
        await updateEvent(editingEventId, data);
      } else {
        const ref = await createEvent(data);
        eventId = ref.id;
      }

      const posterFile = fields.poster.files[0];
      if (posterFile) {
        await uploadEventPoster(eventId, posterFile);
      }

      resetForm();
      renderEventList();
    } catch (err) {
      alert("儲存失敗：" + err.message);
    } finally {
      submitBtn.disabled = false;
    }
  });

  function renderEventRow(ev) {
    const row = document.createElement("div");
    row.className = "bg-white rounded-lg shadow p-4 flex items-center gap-3";

    if (ev.posterUrl) {
      const thumb = document.createElement("img");
      thumb.src = ev.posterUrl;
      thumb.className = "w-14 h-14 object-cover rounded-lg shrink-0";
      row.appendChild(thumb);
    }

    const info = document.createElement("div");
    info.className = "flex-1";
    const title = document.createElement("p");
    title.className = "font-bold text-gray-800";
    title.textContent = ev.title || "";
    const detail = document.createElement("p");
    detail.className = "text-sm text-gray-500";
    detail.textContent = `${formatDate(ev.date)} · ${ev.location || ""} · 名額 ${ev.currentCount || 0}/${ev.maxCap || "不限"}`;
    info.append(title, detail);

    const btnRow = document.createElement("div");
    btnRow.className = "flex gap-3 shrink-0";

    const editBtn = document.createElement("button");
    editBtn.className = "text-sm text-emerald-700 underline";
    editBtn.textContent = "編輯";
    editBtn.addEventListener("click", () => startEdit(ev));

    const delBtn = document.createElement("button");
    delBtn.className = "text-sm text-red-600 underline";
    delBtn.textContent = "刪除";
    delBtn.addEventListener("click", async () => {
      if (!confirm(`確定要刪除「${ev.title}」嗎？已報名這場活動的票券不會被刪除，但會顯示「活動已刪除」。`)) {
        return;
      }
      try {
        await deleteEvent(ev.id);
        if (editingEventId === ev.id) resetForm();
        renderEventList();
      } catch (err) {
        alert("刪除失敗：" + err.message);
      }
    });

    btnRow.append(editBtn, delBtn);
    row.append(info, btnRow);
    return row;
  }

  async function renderEventList() {
    const events = await listEvents();
    eventListEl.innerHTML = "";
    if (events.length === 0) {
      const empty = document.createElement("p");
      empty.className = "text-gray-500 text-sm";
      empty.textContent = "目前沒有任何活動";
      eventListEl.appendChild(empty);
      return;
    }
    events.forEach((ev) => eventListEl.appendChild(renderEventRow(ev)));
  }

  async function renderPendingPayments() {
    const items = await listPendingPayments();
    pendingEl.innerHTML = "";
    if (items.length === 0) {
      const empty = document.createElement("p");
      empty.className = "text-gray-500 text-sm";
      empty.textContent = "目前沒有待確認的匯款";
      pendingEl.appendChild(empty);
      return;
    }
    items.forEach((p) => pendingEl.appendChild(renderPaymentRow(p, renderPendingPayments)));
  }

  function renderCancelRow(c, onDone) {
    const row = document.createElement("div");
    row.className = "bg-white rounded-lg shadow p-4 flex items-center justify-between gap-3";

    const info = document.createElement("div");
    const title = document.createElement("p");
    title.className = "font-bold text-gray-800";
    title.textContent = c.event?.title || "活動已刪除";

    const who = document.createElement("p");
    who.className = "text-sm text-gray-600";
    who.textContent = `${c.user?.name || "未知使用者"}（${c.user?.email || ""}）`;

    const detail = document.createElement("p");
    detail.className = "text-sm text-gray-500";
    detail.textContent = `申請時間：${formatDate(c.cancelRequestedAt)}　依政策退款：${c.cancelRefundPercent ?? 0}%`;

    info.append(title, who, detail);

    const btnRow = document.createElement("div");
    btnRow.className = "flex gap-2 shrink-0";

    const approveBtn = document.createElement("button");
    approveBtn.className = "btn-primary text-sm";
    approveBtn.textContent = "核准取消";
    approveBtn.addEventListener("click", async () => {
      approveBtn.disabled = true;
      rejectBtn.disabled = true;
      try {
        await approveCancellation(c.id);
        onDone();
      } catch (e) {
        alert("核准失敗：" + e.message);
        approveBtn.disabled = false;
        rejectBtn.disabled = false;
      }
    });

    const rejectBtn = document.createElement("button");
    rejectBtn.className = "text-sm text-red-600 underline";
    rejectBtn.textContent = "駁回申請";
    rejectBtn.addEventListener("click", async () => {
      if (!confirm("確定要駁回這筆取消申請嗎？駁回後活動照常進行，票券恢復正常，使用者之後可以再重新申請。")) {
        return;
      }
      approveBtn.disabled = true;
      rejectBtn.disabled = true;
      try {
        await rejectCancellation(c.id);
        onDone();
      } catch (e) {
        alert("駁回失敗：" + e.message);
        approveBtn.disabled = false;
        rejectBtn.disabled = false;
      }
    });

    btnRow.append(approveBtn, rejectBtn);
    row.append(info, btnRow);
    return row;
  }

  async function renderPendingCancellations() {
    const items = await listPendingCancellations();
    cancellationsEl.innerHTML = "";
    if (items.length === 0) {
      const empty = document.createElement("p");
      empty.className = "text-gray-500 text-sm";
      empty.textContent = "目前沒有待審核的取消申請";
      cancellationsEl.appendChild(empty);
      return;
    }
    items.forEach((c) => cancellationsEl.appendChild(renderCancelRow(c, renderPendingCancellations)));
  }

  function renderUserRow(u) {
    const tr = document.createElement("tr");
    tr.className = "border-t";
    const cells = [u.name || "", u.email || "", u.totalEvents || 0, u.attendedEvents || 0, u.cancelled || 0, `${u.rate}%`];
    cells.forEach((val, i) => {
      const td = document.createElement("td");
      td.className = `p-3 text-sm ${i >= 2 ? "text-center" : ""}`;
      td.textContent = val;
      tr.appendChild(td);
    });
    return tr;
  }

  async function renderUsersOverview() {
    const users = await listAllUsers();
    userOverviewEl.innerHTML = "";
    if (users.length === 0) {
      userOverviewEl.innerHTML = `<p class="text-gray-500 text-sm p-4">目前沒有任何會員資料</p>`;
      return;
    }

    const table = document.createElement("table");
    table.className = "w-full min-w-[600px]";
    const thead = document.createElement("thead");
    thead.innerHTML = `
      <tr class="bg-gray-50 text-left text-xs text-gray-500">
        <th class="p-3">姓名</th>
        <th class="p-3">Email</th>
        <th class="p-3 text-center">報名次數</th>
        <th class="p-3 text-center">出席次數</th>
        <th class="p-3 text-center">取消次數</th>
        <th class="p-3 text-center">出席率</th>
      </tr>`;
    const tbody = document.createElement("tbody");
    users.forEach((u) => tbody.appendChild(renderUserRow(u)));
    table.append(thead, tbody);
    userOverviewEl.appendChild(table);
  }

  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    if (!user) {
      adminGate.textContent = "請先登入。";
      adminGate.classList.remove("hidden");
      adminSection.classList.add("hidden");
      return;
    }

    const admin = await isCurrentUserAdmin();
    if (!admin) {
      adminGate.textContent = "你沒有主辦方權限，請聯絡主辦方將你的帳號加入 admins 名單。";
      adminGate.classList.remove("hidden");
      adminSection.classList.add("hidden");
      return;
    }

    adminGate.classList.add("hidden");
    adminSection.classList.remove("hidden");
    renderEventList();
    renderPendingPayments();
    renderPendingCancellations();
    renderUsersOverview();
  });

  return () => unsubscribe();
}
