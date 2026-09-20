import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { initNavbar } from "./nav.js";
import { isCurrentUserAdmin } from "./checkin.js";
import { listPendingPayments, confirmPayment } from "./payment.js";

initNavbar();

const adminGate = document.getElementById("admin-gate");
const adminSection = document.getElementById("admin-section");
const pendingEl = document.getElementById("pending-payments");

// 每一列都用 createElement + textContent 手動組，不用 innerHTML 拼字串：
// 使用者姓名（Google 顯示名稱）跟匯款備註都是使用者能自由輸入的文字，
// 直接塞進 innerHTML 會讓惡意內容在主辦方的瀏覽器裡被當成程式碼執行。
function renderPaymentRow(p) {
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
      renderPendingPayments();
    } catch (e) {
      alert("確認失敗：" + e.message);
      btn.disabled = false;
      btn.textContent = "確認已收款";
    }
  });

  row.append(info, btn);
  return row;
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
  items.forEach((p) => pendingEl.appendChild(renderPaymentRow(p)));
}

onAuthStateChanged(auth, async (user) => {
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
  renderPendingPayments();
});
