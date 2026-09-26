import { auth } from "../firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { listEvents, getMyTicketForEvent } from "../events.js";
import { renderTagBadgesHtml, getTags, loadTags } from "../tags.js";
import { getMyProfile, isProfileComplete } from "../profile.js";
import { getMyCoupons } from "../discounts.js";
import { courseStatusHtml } from "../courseStatus.js";
import { registerActionHtml, wireRegisterButtons } from "../registerAction.js";

function formatDate(ts) {
  if (!ts) return "時間未定";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("zh-TW", { dateStyle: "medium", timeStyle: "short" });
}

function eventDateOf(ev) {
  if (!ev.date) return null;
  return ev.date.toDate ? ev.date.toDate() : new Date(ev.date);
}

// 活動列表只放「活動簡介」；還沒填簡介的舊活動，截取活動內容前面一段代替，
// 不然整篇長文會把卡片撐得很長。
const SUMMARY_FALLBACK_CHARS = 80;
function eventSummary(ev) {
  if (ev.summary) return ev.summary;
  const chars = Array.from(ev.description || "");
  return chars.length > SUMMARY_FALLBACK_CHARS ? chars.slice(0, SUMMARY_FALLBACK_CHARS).join("") + "…" : chars.join("");
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
    const detailHref = `#/event?id=${ev.id}`;
    const posterHtml = ev.posterUrl
      ? `<a href="${detailHref}"><img src="${ev.posterUrl}" alt="" class="w-full h-56 md:h-72 object-cover rounded-lg" /></a>`
      : "";

    return `
      <div class="card rounded-2xl p-6 md:p-8 flex flex-col gap-4 ${isPast ? "opacity-75" : ""}">
        ${posterHtml}
        <h3 class="text-xl md:text-2xl font-bold text-gray-800">
          <a href="${detailHref}" class="hover:underline hover:text-emerald-800">${ev.title || ""}</a>
        </h3>
        ${ev.tags && ev.tags.length > 0 ? `<div class="flex flex-wrap gap-2">${renderTagBadgesHtml(ev.tags)}</div>` : ""}
        <p class="text-sm md:text-base text-gray-500">${formatDate(ev.date)} · ${ev.location || ""}</p>
        ${ev.instructor ? `<p class="text-sm md:text-base text-gray-700">👤 講師：${ev.instructor}</p>` : ""}
        <p class="text-sm md:text-base text-gray-600 leading-relaxed">${eventSummary(ev)}</p>
        <a href="${detailHref}" class="self-start text-sm md:text-base font-bold text-emerald-700 hover:text-emerald-900 underline underline-offset-4">
          📖 查看完整活動內容 →
        </a>
        <div class="flex-1"></div>
        ${courseStatusHtml(ev)}
        <div class="flex items-center justify-between text-sm md:text-base text-gray-500">
          <span>費用：${ev.price ? `NT$${ev.price}` : "免費"}</span>
          <span>名額：${ev.currentCount || 0}/${ev.maxCap || "不限"}${ev.minCap ? `（最低 ${ev.minCap} 人開課）` : ""}</span>
        </div>
        <div>${registerActionHtml(ev, ticket, user, isPast)}</div>
      </div>`;
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
    wireRegisterButtons(listEl, { findEvent: (id) => cachedEvents.find((e) => e.id === id), user });

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
