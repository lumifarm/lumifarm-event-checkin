import { auth } from "../firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { listEvents, registerForEvent, getMyTicketForEvent, ProfileIncompleteError } from "../events.js";
import { paymentStatusLabel } from "../tickets.js";
import { renderTagBadgesHtml, getTags, loadTags } from "../tags.js";
import { getMyProfile, isProfileComplete } from "../profile.js";
import { getMyCoupons } from "../discounts.js";
import { notifyAdmin } from "../notify.js";
import { getCourseStatus, courseStatusHtml } from "../courseStatus.js";

function formatDate(ts) {
  if (!ts) return "時間未定";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("zh-TW", { dateStyle: "medium", timeStyle: "short" });
}

function eventDateOf(ev) {
  if (!ev.date) return null;
  return ev.date.toDate ? ev.date.toDate() : new Date(ev.date);
}

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

export function renderEvents(container) {
  container.innerHTML = `
    <div class="max-w-7xl mx-auto">
      <div class="hero-banner rounded-2xl p-6 sm:p-10 mb-6 text-white">
        <h1 class="relative text-2xl sm:text-4xl font-bold mb-2">🌾 近期活動</h1>
        <p class="relative text-sm sm:text-lg text-white/90">在陽光與土地之間，與光農合作社群一起學習、耕作、成長</p>
      </div>
      <div id="profile-incomplete-banner" class="hidden bg-amber-50 border border-amber-300 text-amber-800 text-sm rounded-lg p-3 mb-4">
        活動需要幫參加者投保，報名前請先<a href="#/profile" class="underline font-bold">到「資料維護」填寫真實姓名、身分證字號、出生年月日</a>。
      </div>
      <div id="coupon-banner" class="hidden bg-lime-50 border border-lime-300 text-lime-800 text-sm rounded-lg p-3 mb-4"></div>
      <div id="tag-filter" class="flex flex-wrap gap-2 mb-4"></div>
      <div id="event-list" class="grid grid-cols-1 md:grid-cols-2 gap-6"></div>

      <h2 id="past-events-heading" class="hidden text-2xl font-bold text-gray-500 mt-12 mb-4">過往活動</h2>
      <div id="past-event-list" class="grid grid-cols-1 md:grid-cols-2 gap-6"></div>
    </div>`;

  const listEl = container.querySelector("#event-list");
  const pastListEl = container.querySelector("#past-event-list");
  const pastHeadingEl = container.querySelector("#past-events-heading");
  const tagFilterEl = container.querySelector("#tag-filter");
  const profileBannerEl = container.querySelector("#profile-incomplete-banner");
  const couponBannerEl = container.querySelector("#coupon-banner");

  // 快取最近一次抓到的資料，切換標籤篩選時只需要重新畫面，不用重新打 Firestore。
  let cachedEvents = [];
  let cachedTickets = {};
  let cachedUser = null;
  let activeTag = null;

  function eventCardHtml(ev, ticket, user, isPast) {
    const full = ev.maxCap && (ev.currentCount || 0) >= ev.maxCap;
    let actionHtml;

    if (!user) {
      actionHtml = `<button class="btn-disabled" disabled>請先登入</button>`;
    } else if (ticket && !ticket.isCancelled) {
      const pay = paymentStatusLabel(ticket.paymentStatus);
      const cancelBadge =
        ticket.cancelRequestStatus === "pending" ? `<span class="badge badge-yellow">取消審核中</span>` : "";
      // 使用者反映報名完之後不知道要去哪裡繳費，這裡直接連去「我的票券」，
      // 未繳費的話文字特別提醒是去繳費，其他狀態則只是方便查看。
      const ticketsLink =
        ticket.paymentStatus === "unpaid"
          ? `<a href="#/tickets" class="text-sm text-emerald-700 underline font-bold">前往我的票券完成繳費 →</a>`
          : `<a href="#/tickets" class="text-sm text-emerald-700 underline">查看我的票券 →</a>`;
      actionHtml = `<div class="flex flex-col gap-2">
        <div class="flex flex-wrap items-center gap-2"><span class="badge badge-blue">已報名</span><span class="badge ${pay.cls}">${pay.text}</span>${cancelBadge}</div>
        ${ticketsLink}
      </div>`;
    } else if (isPast) {
      actionHtml = `<button class="btn-disabled" disabled>活動已結束</button>`;
    } else if (getCourseStatus(ev)?.state === "cancelled") {
      actionHtml = `<button class="btn-disabled" disabled>未達開課人數</button>`;
    } else if (full) {
      actionHtml = `<button class="btn-disabled" disabled>名額已滿</button>`;
    } else {
      actionHtml = `<button data-event-id="${ev.id}" class="btn-register btn-primary text-base px-6 py-2.5">立即報名</button>`;
    }

    const posterHtml = ev.posterUrl
      ? `<img src="${ev.posterUrl}" alt="" class="w-full h-56 md:h-72 object-cover rounded-lg" />`
      : "";

    return `
      <div class="card rounded-2xl p-6 md:p-8 flex flex-col gap-4 ${isPast ? "opacity-75" : ""}">
        ${posterHtml}
        <h3 class="text-xl md:text-2xl font-bold text-gray-800">
          <a href="#/event?id=${ev.id}" class="hover:underline">${ev.title || ""}</a>
        </h3>
        ${ev.tags && ev.tags.length > 0 ? `<div class="flex flex-wrap gap-2">${renderTagBadgesHtml(ev.tags)}</div>` : ""}
        <p class="text-sm md:text-base text-gray-500">${formatDate(ev.date)} · ${ev.location || ""}</p>
        <p class="text-sm md:text-base text-gray-600 leading-relaxed flex-1">${ev.description || ""}</p>
        ${courseStatusHtml(ev)}
        <div class="flex items-center justify-between text-sm md:text-base text-gray-500">
          <span>費用：${ev.price ? `NT$${ev.price}` : "免費"}</span>
          <span>名額：${ev.currentCount || 0}/${ev.maxCap || "不限"}${ev.minCap ? `（最低 ${ev.minCap} 人開課）` : ""}</span>
        </div>
        <div>${actionHtml}</div>
      </div>`;
  }

  function wireRegisterButtons(root) {
    root.querySelectorAll(".btn-register").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const eventId = btn.dataset.eventId;
        const ev = cachedEvents.find((e) => e.id === eventId);
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
                memberName: cachedUser?.displayName,
                memberEmail: cachedUser?.email,
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

  function renderTagFilter(events) {
    // 只列出目前活動實際有用到的標籤，避免出現一按下去永遠是空清單的篩選項目。
    const usedTagIds = new Set(events.flatMap((ev) => ev.tags || []));
    const usableTags = getTags().filter((t) => usedTagIds.has(t.id));

    if (usableTags.length === 0) {
      tagFilterEl.innerHTML = "";
      return;
    }

    const allBtn = `<button type="button" data-tag="" class="btn-tag-filter text-xs border rounded-full px-3 py-1 transition ${
      activeTag === null ? "bg-amber-500 text-white border-amber-500 shadow" : "bg-white hover:bg-amber-50"
    }">全部</button>`;
    const tagBtns = usableTags
      .map(
        (t) => `
      <button type="button" data-tag="${t.id}" class="btn-tag-filter text-xs border rounded-full px-3 py-1 transition ${
          activeTag === t.id ? "bg-amber-500 text-white border-amber-500 shadow" : "bg-white hover:bg-amber-50"
        }">${t.icon} ${t.label}</button>`
      )
      .join("");

    tagFilterEl.innerHTML = allBtn + tagBtns;
    tagFilterEl.querySelectorAll(".btn-tag-filter").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeTag = btn.dataset.tag || null;
        renderList();
      });
    });
  }

  function renderList() {
    const events = activeTag ? cachedEvents.filter((ev) => (ev.tags || []).includes(activeTag)) : cachedEvents;
    const user = cachedUser;

    renderTagFilter(cachedEvents);

    if (events.length === 0) {
      listEl.innerHTML = `<p class="text-gray-500 col-span-full text-center py-8">${
        activeTag ? "這個分類目前沒有活動" : "目前尚無活動"
      }</p>`;
      pastListEl.innerHTML = "";
      pastHeadingEl.classList.add("hidden");
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
        ? upcoming.map((ev) => eventCardHtml(ev, cachedTickets[ev.id], user, false)).join("")
        : `<p class="text-gray-500 col-span-full text-center py-8">目前尚無近期活動</p>`;
    wireRegisterButtons(listEl);

    if (past.length > 0) {
      pastHeadingEl.classList.remove("hidden");
      pastListEl.innerHTML = past.map((ev) => eventCardHtml(ev, cachedTickets[ev.id], user, true)).join("");
    } else {
      pastHeadingEl.classList.add("hidden");
      pastListEl.innerHTML = "";
    }
  }

  async function render() {
    listEl.innerHTML = `<p class="text-gray-500 col-span-full text-center py-8">載入中...</p>`;
    pastListEl.innerHTML = "";
    pastHeadingEl.classList.add("hidden");

    const [events] = await Promise.all([listEvents(), loadTags()]);
    const user = auth.currentUser;

    const myTickets = {};
    if (user) {
      for (const ev of events) {
        myTickets[ev.id] = await getMyTicketForEvent(user.uid, ev.id);
      }
      const profile = await getMyProfile();
      profileBannerEl.classList.toggle("hidden", isProfileComplete(profile));

      const coupons = await getMyCoupons();
      const unusedCount = coupons.filter((c) => c.status === "unused").length;
      couponBannerEl.classList.toggle("hidden", unusedCount === 0);
      if (unusedCount > 0) {
        couponBannerEl.textContent = `你有 ${unusedCount} 張出席折扣券，下次報名付費活動會自動折抵 95 折，不用另外操作。`;
      }
    } else {
      profileBannerEl.classList.add("hidden");
      couponBannerEl.classList.add("hidden");
    }

    cachedEvents = events;
    cachedTickets = myTickets;
    cachedUser = user;

    renderList();
  }

  const unsubscribe = onAuthStateChanged(auth, () => render());
  return () => unsubscribe();
}
