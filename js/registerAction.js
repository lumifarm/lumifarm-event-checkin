import { registerForEvent, ProfileIncompleteError } from "./events.js";
import { paymentStatusLabel } from "./tickets.js";
import { notifyAdmin } from "./notify.js";
import { getCourseStatus } from "./courseStatus.js";
import { sendRegistrationEmail } from "./memberEmails.js";
import { paymentDeadlineOf, formatDeadline } from "./payment.js";
import { MAX_COMPANIONS, COMPANION_MAX_AGE } from "./companions.js";
import { createCompanionEditor, validateCompanions } from "./companionForm.js";

// 活動列表卡片跟活動詳情頁共用的「報名區塊」：依登入狀態、報名/繳費狀態、
// 活動是否結束、是否不開課、是否額滿，顯示對應的按鈕或狀態，兩個地方邏輯一致。

// 報名確認視窗：每次報名都會跳出來，
// 1. 有些活動報名前需要先回答主辦方設定的問題（例如飲食禁忌、程度）；問題
//    文字是主辦方自己在新增活動時填的，只有主辦方能寫這個欄位，用 innerHTML
//    沒有風險，跟活動說明欄位一樣。
// 2. 詢問是否有 15 歲以下孩童同行：孩童沒有自己的 Google 帳號，由家長在這裡
//    代為報名、填寫投保需要的資料，每位孩童佔一個名額、費用與成人相同。
function showRegisterModal({ ev, question, onSubmit }) {
  const overlay = document.createElement("div");
  overlay.className = "fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50";

  const box = document.createElement("div");
  box.className = "card rounded-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto";
  box.innerHTML = `<h2 class="text-lg font-bold text-gray-800 mb-1">報名「${ev.title || ""}」</h2>`;

  let textarea = null;
  if (question) {
    const q = document.createElement("div");
    q.className = "mt-3";
    q.innerHTML = `
      <p class="text-sm font-bold text-gray-700 mb-1">報名前，請先回答這個問題</p>
      <p class="text-sm text-gray-700 whitespace-pre-wrap mb-2 bg-amber-50 border border-amber-200 rounded-lg p-3">${question}</p>`;
    textarea = document.createElement("textarea");
    textarea.rows = 3;
    textarea.className = "w-full border rounded-lg p-2 text-sm";
    textarea.placeholder = "請輸入你的回答";
    q.appendChild(textarea);
    box.appendChild(q);
  }

  // 同行孩童
  const price = Number(ev.price) || 0;
  const remaining = ev.maxCap ? ev.maxCap - (ev.currentCount || 0) : Infinity;
  const maxKids = Math.max(0, Math.min(MAX_COMPANIONS, remaining - 1));

  const kidSection = document.createElement("div");
  kidSection.className = "mt-4 border-t pt-3";
  const kidLabel = document.createElement("label");
  kidLabel.className = "flex items-start gap-2 text-sm text-gray-700";
  const kidCheck = document.createElement("input");
  kidCheck.type = "checkbox";
  kidCheck.className = "mt-1";
  const kidText = document.createElement("span");
  kidText.textContent = `有 ${COMPANION_MAX_AGE} 歲以下的孩童同行（孩童沒有 Google 帳號，由你代為報名）`;
  kidLabel.append(kidCheck, kidText);
  kidSection.appendChild(kidLabel);

  const kidBody = document.createElement("div");
  kidBody.className = "hidden mt-2 space-y-2";
  const kidNote = document.createElement("p");
  kidNote.className = "text-xs text-gray-500";
  kidNote.textContent =
    `活動要幫每位參加者投保，請填寫孩童的真實姓名、身分證字號、出生年月日（以活動當天年齡計算，${COMPANION_MAX_AGE} 歲以下才能代為報名，16 歲以上請用自己的帳號報名）。` +
    `每位孩童佔一個名額${price > 0 ? `，費用與成人相同（NT$${price}／人）` : ""}，最多 ${MAX_COMPANIONS} 位。`;
  const editorRoot = document.createElement("div");
  kidBody.append(kidNote, editorRoot);
  kidSection.appendChild(kidBody);
  box.appendChild(kidSection);

  const totalEl = document.createElement("p");
  totalEl.className = "text-sm font-bold text-gray-800 mt-3";
  box.appendChild(totalEl);

  function updateTotal(kids) {
    if (price <= 0) {
      totalEl.textContent = kids > 0 ? `共 ${kids + 1} 人報名（免費活動）` : "";
      return;
    }
    totalEl.textContent =
      kids > 0
        ? `應繳總額：NT$${price * (kids + 1)}（你本人 NT$${price} ＋ 孩童 ${kids} 位 × NT$${price}；有出席折扣券的話只折你本人那一份）`
        : `應繳金額：NT$${price}（有出席折扣券的話會自動折抵）`;
  }

  const editor = createCompanionEditor(editorRoot, {
    max: maxKids,
    onChange: (n) => updateTotal(kidCheck.checked ? n : 0),
  });

  if (maxKids === 0) {
    kidCheck.disabled = true;
    kidText.textContent += "（目前名額不足，無法再帶孩童）";
  }
  kidCheck.addEventListener("change", () => {
    kidBody.classList.toggle("hidden", !kidCheck.checked);
    if (kidCheck.checked && editor.count() === 0) editor.addRow();
    updateTotal(kidCheck.checked ? editor.count() : 0);
  });
  updateTotal(0);

  const btnRow = document.createElement("div");
  btnRow.className = "flex gap-3 justify-end mt-4";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "text-sm text-gray-500 underline";
  cancelBtn.textContent = "取消";
  cancelBtn.addEventListener("click", () => overlay.remove());

  const submitBtn = document.createElement("button");
  submitBtn.className = "btn-primary text-sm";
  submitBtn.textContent = "確認報名";
  submitBtn.addEventListener("click", async () => {
    const answer = textarea ? textarea.value.trim() : undefined;
    if (textarea && !answer) {
      alert("請先回答報名問題再送出");
      return;
    }
    const kids = kidCheck.checked ? editor.getValues() : [];
    const err = validateCompanions(kids, ev.date, { requireAll: true });
    if (err) {
      alert(err);
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = "報名中...";
    try {
      await onSubmit(answer, kids);
      overlay.remove();
    } catch (e) {
      alert("報名失敗：" + e.message);
      submitBtn.disabled = false;
      submitBtn.textContent = "確認報名";
    }
  });

  btnRow.append(cancelBtn, submitBtn);
  box.appendChild(btnRow);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

export function registerActionHtml(ev, ticket, user, isPast) {
  const full = ev.maxCap && (ev.currentCount || 0) >= ev.maxCap;

  if (!user) {
    return `<button class="btn-disabled" disabled>請先登入</button>`;
  }
  if (ticket && !ticket.isCancelled) {
    const pay = paymentStatusLabel(ticket.paymentStatus);
    const cancelBadge =
      ticket.cancelRequestStatus === "pending" ? `<span class="badge badge-yellow">取消審核中</span>` : "";
    // 使用者反映報名完之後不知道要去哪裡繳費，這裡直接連去「我的票券」，
    // 未繳費的話文字特別提醒是去繳費，其他狀態則只是方便查看。
    const ticketsLink =
      ticket.paymentStatus === "unpaid"
        ? `<a href="#/tickets" class="text-sm text-emerald-700 underline font-bold">前往我的票券完成繳費 →</a>`
        : `<a href="#/tickets" class="text-sm text-emerald-700 underline">查看我的票券 →</a>`;
    return `<div class="flex flex-col gap-2">
      <div class="flex flex-wrap items-center gap-2"><span class="badge badge-blue">已報名${
        ticket.companions?.length ? `（含孩童 ${ticket.companions.length} 位）` : ""
      }</span><span class="badge ${pay.cls}">${pay.text}</span>${cancelBadge}</div>
      ${ticketsLink}
    </div>`;
  }
  if (isPast) return `<button class="btn-disabled" disabled>活動已結束</button>`;
  if (getCourseStatus(ev)?.state === "cancelled") return `<button class="btn-disabled" disabled>未達開課人數</button>`;
  if (full) return `<button class="btn-disabled" disabled>名額已滿</button>`;
  return `<button data-event-id="${ev.id}" class="btn-register btn-primary text-base px-6 py-2.5">立即報名</button>`;
}

// findEvent(id) 回傳該活動資料（含 id、price、title、registrationQuestion）。
export function wireRegisterButtons(root, { findEvent, user }) {
  root.querySelectorAll(".btn-register").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const eventId = btn.dataset.eventId;
      const ev = findEvent(eventId);
      const question = ev?.registrationQuestion?.trim();

      // ProfileIncompleteError 在這裡先攔下來處理（alert + 導去資料維護），
      // 不往外拋，讓呼叫端（不論是不是走問題視窗）不用各自重複判斷；
      // 其他錯誤照樣往外拋，兩邊各自的 catch 會顯示「報名失敗：...」。
      async function submitRegistration(answer, companions = []) {
        try {
          const { discountApplied } = await registerForEvent(eventId, answer, companions);
          const isFree = !ev.price || ev.price <= 0;
          // 寄確認信給會員（報名時用的 Google 帳號信箱）；不 await，寄信失敗
          // 或被瀏覽器擋掉都不影響已經成功的報名。
          sendRegistrationEmail({ ev, toEmail: user?.email, toName: user?.displayName, discountApplied, companions });
          alert(
            isFree
              ? "報名成功！確認信會寄到你的 Google 信箱。"
              : `報名成功！已為你保留名額，請於 ${formatDeadline(paymentDeadlineOf(null, ev.date))} 前（三天內）完成匯款，逾期名額會釋出。\n\n匯款資訊在「我的票券」，也會寄一封確認信到你的 Google 信箱。`
          );
          // 免費活動報名當下就直接算已繳費，這裡才需要通知主辦方；付費活動
          // 要等會員實際送出繳費通知才算「已繳費」，通知會在那個時候發，
          // 不然一報名就寄信，主辦方還沒真的收到錢就會被通知洗版。
          if (isFree) {
            notifyAdmin({
              noticeType: "新報名（免費活動，已自動完成繳費）",
              eventTitle: ev.title,
              memberName: user?.displayName,
              memberEmail: user?.email,
              detail: companions.length ? `同行孩童 ${companions.length} 位：${companions.map((c) => c.name).join("、")}` : "",
            });
          }
          location.hash = "#/tickets";
        } catch (e) {
          if (e instanceof ProfileIncompleteError) {
            alert(e.message);
            location.hash = "#/profile";
            return;
          }
          throw e;
        }
      }

      if (!ev) return;
      showRegisterModal({ ev, question, onSubmit: submitRegistration });
    });
  });
}
