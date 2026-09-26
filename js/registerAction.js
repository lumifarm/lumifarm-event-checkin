import { registerForEvent, ProfileIncompleteError } from "./events.js";
import { paymentStatusLabel } from "./tickets.js";
import { notifyAdmin } from "./notify.js";
import { getCourseStatus } from "./courseStatus.js";

// 活動列表卡片跟活動詳情頁共用的「報名區塊」：依登入狀態、報名/繳費狀態、
// 活動是否結束、是否不開課、是否額滿，顯示對應的按鈕或狀態，兩個地方邏輯一致。

// 有些活動報名前需要先回答主辦方設定的問題（例如飲食禁忌、程度），這裡跳出
// 一個小視窗要求先回答才送出報名；問題文字是主辦方自己在新增活動時填的，
// 只有主辦方能寫這個欄位，用 innerHTML 沒有風險，跟活動說明欄位一樣。
function showQuestionModal({ question, onSubmit }) {
  const overlay = document.createElement("div");
  overlay.className = "fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50";

  const box = document.createElement("div");
  box.className = "card rounded-xl max-w-md w-full p-6";
  box.innerHTML = `
    <h2 class="text-lg font-bold text-gray-800 mb-2">報名前，請先回答這個問題</h2>
    <p class="text-sm text-gray-700 whitespace-pre-wrap mb-3 bg-amber-50 border border-amber-200 rounded-lg p-3">${question}</p>`;

  const textarea = document.createElement("textarea");
  textarea.rows = 4;
  textarea.className = "w-full border rounded-lg p-2 text-sm mb-4";
  textarea.placeholder = "請輸入你的回答";
  box.appendChild(textarea);

  const btnRow = document.createElement("div");
  btnRow.className = "flex gap-3 justify-end";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "text-sm text-gray-500 underline";
  cancelBtn.textContent = "取消";
  cancelBtn.addEventListener("click", () => overlay.remove());

  const submitBtn = document.createElement("button");
  submitBtn.className = "btn-primary text-sm";
  submitBtn.textContent = "送出並完成報名";
  submitBtn.addEventListener("click", async () => {
    const answer = textarea.value.trim();
    if (!answer) {
      alert("請先回答這個問題再送出");
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = "報名中...";
    try {
      await onSubmit(answer);
      overlay.remove();
    } catch (e) {
      alert("報名失敗：" + e.message);
      submitBtn.disabled = false;
      submitBtn.textContent = "送出並完成報名";
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
      <div class="flex flex-wrap items-center gap-2"><span class="badge badge-blue">已報名</span><span class="badge ${pay.cls}">${pay.text}</span>${cancelBadge}</div>
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
      async function submitRegistration(answer) {
        try {
          await registerForEvent(eventId, answer);
          alert("報名成功！接下來請完成繳費。");
          // 免費活動報名當下就直接算已繳費，這裡才需要通知主辦方；付費活動
          // 要等會員實際送出繳費通知才算「已繳費」，通知會在那個時候發，
          // 不然一報名就寄信，主辦方還沒真的收到錢就會被通知洗版。
          if (!ev.price || ev.price <= 0) {
            notifyAdmin({
              noticeType: "新報名（免費活動，已自動完成繳費）",
              eventTitle: ev.title,
              memberName: user?.displayName,
              memberEmail: user?.email,
              detail: "",
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

      if (question) {
        showQuestionModal({ question, onSubmit: submitRegistration });
        return;
      }

      btn.disabled = true;
      btn.textContent = "報名中...";
      try {
        await submitRegistration();
      } catch (e) {
        alert("報名失敗：" + e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = "立即報名";
      }
    });
  });
}
