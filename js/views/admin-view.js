import { auth } from "../firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { isCurrentUserAdmin } from "../checkin.js";
import { listPendingPayments, confirmPayment } from "../payment.js";
import {
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  listActiveParticipantEmails,
  listActiveParticipantsForInsurance,
  listRegistrationAnswers,
  listCheckedInTickets,
  listPendingCancellations,
  approveCancellation,
  rejectCancellation,
} from "../events.js";
import { listAllUsers } from "../tickets.js";
import { buildPreEventNotice, buildGmailComposeLink } from "../notices.js";
import {
  renderTagBadgesHtml,
  tagBadgeHtml,
  getTags,
  loadTags,
  ensureDefaultTagsSeeded,
  createTag,
  updateTag,
  deleteTag,
  LABOR_EXCHANGE_TAG_ID,
  TAG_COLORS,
  TAG_ICON_CHOICES,
} from "../tags.js";
import { awardPoints, awardPointsToCheckedInParticipants, listPointsHistoryForUser } from "../workPoints.js";
import { listEligibleForCoupons, issuePendingCoupons, DISCOUNT_PERCENT, ATTENDANCE_THRESHOLD } from "../discounts.js";
import { courseStatusText, COURSE_CONFIRM_DAYS_BEFORE } from "../courseStatus.js";

const SUMMARY_MAX_CHARS = 200;
const DESCRIPTION_MAX_CHARS = 500;

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
  row.className = "card rounded-lg p-4 flex items-center justify-between gap-3";

  const info = document.createElement("div");
  const title = document.createElement("p");
  title.className = "font-bold text-gray-800";
  title.textContent = p.event?.title || "活動已刪除";

  const who = document.createElement("p");
  who.className = "text-sm text-gray-600";
  who.textContent = `${p.user?.name || "未知使用者"}（${p.user?.email || ""}）`;

  const detail = document.createElement("p");
  detail.className = "text-sm text-gray-500";
  const price = p.event?.price || 0;
  const finalPrice = p.discountApplied ? Math.round(price * (1 - DISCOUNT_PERCENT / 100)) : price;
  detail.textContent = p.discountApplied
    ? `金額：NT$${finalPrice}（已套用出席折扣券，原價 NT$${price}）`
    : `金額：NT$${finalPrice}`;

  const note = document.createElement("p");
  note.className = "text-sm font-bold text-emerald-700";
  note.textContent = `匯款後五碼／備註：${p.paymentNote || "（未填寫）"}`;

  info.append(title, who, detail, note);

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
      <h1 class="text-xl font-bold text-gray-800 my-4">🌳 主辦專區</h1>
      <p id="admin-gate" class="hidden text-gray-500 py-8"></p>

      <div id="admin-section" class="hidden space-y-10">
        <nav class="flex flex-wrap gap-2 sticky top-0 bg-amber-50/95 backdrop-blur py-2 z-10 -mx-1 px-1 rounded-lg">
          <button type="button" class="admin-nav-link text-xs border rounded-full px-3 py-1 bg-white hover:bg-amber-100 transition" data-target="event-form-section">新增活動</button>
          <button type="button" class="admin-nav-link text-xs border rounded-full px-3 py-1 bg-white hover:bg-amber-100 transition" data-target="event-manage-section">活動管理</button>
          <button type="button" class="admin-nav-link text-xs border rounded-full px-3 py-1 bg-white hover:bg-amber-100 transition" data-target="tags-section">活動標籤管理</button>
          <button type="button" class="admin-nav-link text-xs border rounded-full px-3 py-1 bg-white hover:bg-amber-100 transition" data-target="payments-section">待確認繳費</button>
          <button type="button" class="admin-nav-link text-xs border rounded-full px-3 py-1 bg-white hover:bg-amber-100 transition" data-target="cancellations-section">取消申請</button>
          <button type="button" class="admin-nav-link text-xs border rounded-full px-3 py-1 bg-white hover:bg-amber-100 transition" data-target="users-section">會員總覽</button>
          <button type="button" class="admin-nav-link text-xs border rounded-full px-3 py-1 bg-white hover:bg-amber-100 transition" data-target="notice-section">行前通知</button>
          <button type="button" class="admin-nav-link text-xs border rounded-full px-3 py-1 bg-white hover:bg-amber-100 transition" data-target="insurance-section">投保名單</button>
          <button type="button" class="admin-nav-link text-xs border rounded-full px-3 py-1 bg-white hover:bg-amber-100 transition" data-target="questions-section">報名問題回覆</button>
          <button type="button" class="admin-nav-link text-xs border rounded-full px-3 py-1 bg-white hover:bg-amber-100 transition" data-target="work-points-section">換工點數</button>
          <button type="button" class="admin-nav-link text-xs border rounded-full px-3 py-1 bg-white hover:bg-amber-100 transition" data-target="discount-section">出席折扣券</button>
        </nav>

        <section id="event-form-section">
          <h2 class="text-lg font-bold text-gray-800 mb-3" id="event-form-title">新增活動</h2>
          <form id="event-form" class="card rounded-xl p-5 space-y-3">
            <div>
              <label class="text-sm text-gray-600 block mb-1">活動名稱</label>
              <input id="ev-title" type="text" required class="w-full border rounded-lg p-2" />
            </div>
            <div>
              <label class="text-sm text-gray-600 block mb-1">
                活動簡介（${SUMMARY_MAX_CHARS} 字以內，顯示在活動列表）
                <span id="ev-summary-count" class="text-xs text-gray-400 ml-1"></span>
              </label>
              <textarea id="ev-summary" rows="3" class="w-full border rounded-lg p-2"></textarea>
            </div>
            <div>
              <label class="text-sm text-gray-600 block mb-1">
                活動內容（${DESCRIPTION_MAX_CHARS} 字以內，顯示在活動詳情頁）
                <span id="ev-description-count" class="text-xs text-gray-400 ml-1"></span>
              </label>
              <textarea id="ev-description" rows="8" class="w-full border rounded-lg p-2"></textarea>
            </div>
            <div>
              <label class="text-sm text-gray-600 block mb-1">地點</label>
              <input id="ev-location" type="text" class="w-full border rounded-lg p-2" />
            </div>
            <div>
              <label class="text-sm text-gray-600 block mb-1">講師資訊（選填）</label>
              <input
                id="ev-instructor"
                type="text"
                placeholder="例如：光農合作社群創辦人 林奕衡"
                class="w-full border rounded-lg p-2"
              />
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
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-sm text-gray-600 block mb-1">最低開課人數（選填）</label>
                <input id="ev-mincap" type="number" min="1" class="w-full border rounded-lg p-2" />
              </div>
              <div>
                <label class="text-sm text-gray-600 block mb-1">名額上限（留空表示不限）</label>
                <input id="ev-maxcap" type="number" min="1" class="w-full border rounded-lg p-2" />
              </div>
            </div>
            <p class="text-xs text-gray-500 -mt-1">
              有填最低開課人數的話，活動前 ${COURSE_CONFIRM_DAYS_BEFORE} 天為開課確認日：到那天報名人數還不足就會自動顯示「不開課」並關閉報名；不填就不顯示開課狀態。
            </p>
            <div>
              <label class="text-sm text-gray-600 block mb-1">活動標籤（可複選）</label>
              <div id="ev-tags" class="flex flex-wrap gap-3 text-sm"></div>
              <p class="text-xs text-gray-500 mt-1">要新增或修改標籤，請到下方「活動標籤管理」。</p>
            </div>
            <div>
              <label class="text-sm text-gray-600 block mb-1">報名前需要回答的問題（選填）</label>
              <textarea
                id="ev-registration-question"
                rows="2"
                class="w-full border rounded-lg p-2"
                placeholder="例如：請問有無飲食禁忌或特殊需求？"
              ></textarea>
              <p class="text-xs text-gray-500 mt-1">
                有填的話，會員按「立即報名」時會先跳出視窗要求回答，答了才會真的送出報名；不填就跟現在一樣直接報名，不會多一個步驟。
              </p>
            </div>
            <div>
              <label class="text-sm text-gray-600 block mb-1">活動海報圖片網址（選填）</label>
              <input
                id="ev-poster-url"
                type="url"
                placeholder="https://..."
                class="w-full border rounded-lg p-2"
              />
              <p class="text-xs text-gray-500 mt-1">
                把圖片交給 Claude 存進 repo 取得網址，或自己放到 Imgur 之類支援直接連結的地方，貼在這裡。
              </p>
              <img id="ev-poster-preview" class="hidden w-full max-w-xs rounded-lg border mt-2" />
            </div>
            <div class="flex gap-3 items-center">
              <button type="submit" id="event-form-submit" class="btn-primary text-sm">新增活動</button>
              <button type="button" id="event-form-cancel" class="hidden text-sm text-gray-500 underline">取消編輯</button>
            </div>
          </form>
        </section>

        <section id="event-manage-section">
          <h2 class="text-lg font-bold text-gray-800 mb-3">活動管理</h2>
          <div id="event-manage-list" class="space-y-3"></div>
        </section>

        <section id="tags-section">
          <h2 class="text-lg font-bold text-gray-800 mb-3">活動標籤管理</h2>
          <p id="tag-error" class="hidden text-sm text-red-600 mb-3"></p>
          <div id="tag-list" class="card rounded-xl p-4 space-y-2 mb-4"></div>
          <form id="tag-form" class="card rounded-xl p-5 space-y-3">
            <h3 id="tag-form-title" class="font-bold text-gray-800">新增標籤</h3>
            <div>
              <label class="text-sm text-gray-600 block mb-1">標籤名稱</label>
              <input id="tag-label" type="text" required maxlength="12" placeholder="例如：樹木溝通" class="w-full border rounded-lg p-2" />
            </div>
            <div>
              <label class="text-sm text-gray-600 block mb-1">圖示（點選一個，或直接在框裡輸入任何 emoji）</label>
              <input id="tag-icon" type="text" required maxlength="8" class="w-20 border rounded-lg p-2 text-center text-xl mb-2" />
              <div id="tag-icon-grid" class="flex flex-wrap gap-1"></div>
            </div>
            <div>
              <label class="text-sm text-gray-600 block mb-1">顏色</label>
              <div id="tag-color-grid" class="flex flex-wrap gap-2"></div>
            </div>
            <div>
              <span class="text-sm text-gray-600 mr-2">預覽：</span><span id="tag-preview"></span>
            </div>
            <div class="flex gap-3 items-center">
              <button type="submit" id="tag-submit" class="btn-primary text-sm">新增標籤</button>
              <button type="button" id="tag-cancel" class="hidden text-sm text-gray-500 underline">取消編輯</button>
            </div>
          </form>
        </section>

        <section id="payments-section">
          <h2 class="text-lg font-bold text-gray-800 mb-3">待確認繳費</h2>
          <div id="pending-payments" class="space-y-3"></div>
        </section>

        <section id="cancellations-section">
          <h2 class="text-lg font-bold text-gray-800 mb-3">取消申請</h2>
          <div id="pending-cancellations" class="space-y-3"></div>
        </section>

        <section id="users-section">
          <h2 class="text-lg font-bold text-gray-800 mb-3">會員總覽</h2>
          <div id="user-overview" class="card rounded-xl overflow-x-auto"></div>
        </section>

        <section id="notice-section">
          <h2 class="text-lg font-bold text-gray-800 mb-3">行前通知</h2>
          <div class="card rounded-xl p-5 space-y-3">
            <div>
              <label class="text-sm text-gray-600 block mb-1">選擇活動</label>
              <select id="notice-event" class="w-full border rounded-lg p-2"></select>
            </div>
            <p id="notice-recipient-count" class="text-sm text-gray-500"></p>
            <div>
              <label class="text-sm text-gray-600 block mb-1">通知內容</label>
              <textarea
                id="notice-message"
                rows="4"
                class="w-full border rounded-lg p-2"
                placeholder="例如：請記得帶雨具與換洗衣物，活動當天請提早 10 分鐘到場報到"
              ></textarea>
            </div>
            <button type="button" id="notice-generate" class="btn-primary text-sm">產生郵件內容</button>

            <div id="notice-preview" class="hidden space-y-2 border-t pt-3">
              <div>
                <label class="text-sm text-gray-600 block mb-1">主旨</label>
                <input id="notice-subject" type="text" class="w-full border rounded-lg p-2" />
              </div>
              <div>
                <label class="text-sm text-gray-600 block mb-1">內文</label>
                <textarea id="notice-body" rows="8" class="w-full border rounded-lg p-2"></textarea>
              </div>
              <button type="button" id="notice-send" class="btn-primary text-sm">開啟 Gmail 並發送</button>
              <p class="text-xs text-gray-500">
                按下後會在新分頁開啟 Gmail 網頁版的寫信視窗（用你目前登入的 Gmail 帳號），收件人已用密件副本（Bcc）帶入所有報名者，確認內容後要在 Gmail 裡按送出才會真的寄出。
              </p>
            </div>
          </div>
        </section>

        <section id="insurance-section">
          <h2 class="text-lg font-bold text-gray-800 mb-3">投保名單</h2>
          <div class="card rounded-xl p-5 space-y-3">
            <p class="text-xs text-gray-500">
              匯出某活動目前還算數的報名者（不含已取消）的真實姓名、身分證字號、出生年月日，供辦理活動保險使用。這些是高度敏感個資，請只在需要投保時匯出、辦好保險後盡快刪除下載或複製出去的內容，不要留存在不必要的地方。
            </p>
            <div>
              <label class="text-sm text-gray-600 block mb-1">選擇活動</label>
              <select id="insurance-event" class="w-full border rounded-lg p-2"></select>
            </div>
            <button type="button" id="insurance-generate" class="btn-primary text-sm">產生投保名單</button>
            <p id="insurance-missing-note" class="hidden text-sm text-amber-700"></p>
            <textarea
              id="insurance-output"
              readonly
              rows="8"
              class="hidden w-full border rounded-lg p-2 text-xs font-mono"
            ></textarea>
          </div>
        </section>

        <section id="questions-section">
          <h2 class="text-lg font-bold text-gray-800 mb-3">報名問題回覆</h2>
          <div class="card rounded-xl p-5 space-y-3">
            <p class="text-xs text-gray-500">
              只有新增/編輯活動時有填「報名前需要回答的問題」的活動，會員報名時才會被要求回答；這裡選一個活動看大家的回覆。
            </p>
            <div>
              <label class="text-sm text-gray-600 block mb-1">選擇活動</label>
              <select id="questions-event" class="w-full border rounded-lg p-2"></select>
            </div>
            <div id="questions-list" class="space-y-2"></div>
          </div>
        </section>

        <section id="work-points-section">
          <h2 class="text-lg font-bold text-gray-800 mb-3">換工點數</h2>

          <h3 class="text-sm font-bold text-gray-600 mb-2">一鍵發放（換工活動當天有報到就給點）</h3>
          <form id="wp-bulk-form" class="card rounded-xl p-5 space-y-3">
            <div>
              <label class="text-sm text-gray-600 block mb-1">活動</label>
              <select id="wp-bulk-event" required class="w-full border rounded-lg p-2"></select>
            </div>
            <p id="wp-bulk-count" class="text-xs text-gray-500"></p>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-sm text-gray-600 block mb-1">每人發放點數</label>
                <input id="wp-bulk-points" type="number" min="1" required class="w-full border rounded-lg p-2" />
              </div>
              <div>
                <label class="text-sm text-gray-600 block mb-1">說明（選填）</label>
                <input id="wp-bulk-reason" type="text" placeholder="例如：10/5 換工活動" class="w-full border rounded-lg p-2" />
              </div>
            </div>
            <button type="submit" id="wp-bulk-submit" class="btn-primary text-sm">
              一鍵發放給已報到會員
            </button>
            <p class="text-xs text-gray-500">
              只會發給這場活動「已報到、未取消」的會員，每張票券只會被算一次，重複按同一場活動不會重複發放。
            </p>
          </form>

          <h3 class="text-sm font-bold text-gray-600 mt-6 mb-2">個別調整 / 兌換扣點</h3>
          <p class="text-xs text-gray-500 mb-3">
            要幫某人補登、修正，或是會員要用點數兌換課程/農產品時在這裡登記：發放用正數，兌換扣點用負數，每筆都會留下紀錄。
          </p>
          <form id="work-points-form" class="card rounded-xl p-5 space-y-3">
            <div>
              <label class="text-sm text-gray-600 block mb-1">會員</label>
              <select id="wp-user" required class="w-full border rounded-lg p-2"></select>
            </div>
            <div>
              <label class="text-sm text-gray-600 block mb-1">相關活動（選填）</label>
              <select id="wp-event" class="w-full border rounded-lg p-2">
                <option value="">（不指定）</option>
              </select>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-sm text-gray-600 block mb-1">點數（發放用正數，兌換扣點用負數）</label>
                <input id="wp-points" type="number" required class="w-full border rounded-lg p-2" />
              </div>
              <div>
                <label class="text-sm text-gray-600 block mb-1">說明</label>
                <input id="wp-reason" type="text" placeholder="例如：補登換工點數，或 兌換：白米一包" class="w-full border rounded-lg p-2" />
              </div>
            </div>
            <button type="submit" id="wp-submit" class="btn-primary text-sm">登記點數異動</button>
          </form>

          <div class="mt-4">
            <h3 class="text-sm font-bold text-gray-600 mb-2">該會員的點數紀錄</h3>
            <div id="wp-history" class="card rounded-xl divide-y"></div>
          </div>
        </section>

        <section id="discount-section">
          <h2 class="text-lg font-bold text-gray-800 mb-3">出席折扣券</h2>
          <p class="text-xs text-gray-500 mb-3">
            一般活動（不含換工活動）每累積出席滿 ${ATTENDANCE_THRESHOLD} 次，就可以核發一張 ${
    100 - DISCOUNT_PERCENT
  } 折優惠券。券會在會員下次報名付費活動時自動套用、用掉就沒了，不能跟其他優惠併用。
          </p>
          <div id="discount-eligible-list" class="card rounded-xl divide-y mb-3"></div>
          <div class="flex gap-3">
            <button type="button" id="discount-refresh" class="text-sm text-gray-500 underline">重新整理名單</button>
            <button type="button" id="discount-issue-btn" class="btn-primary text-sm" disabled>
              核發折扣券給以上名單
            </button>
          </div>
        </section>
      </div>
    </div>`;

  const adminGate = container.querySelector("#admin-gate");
  const adminSection = container.querySelector("#admin-section");

  // 用 scrollIntoView 而不是 <a href="#id">：這個網站是 hash 路由的 SPA
  // （#/admin 這種），如果用一般錨點連結，改網址 hash 會被路由器誤判成
  // 一個新的（不存在的）路由，反而跳回首頁。
  container.querySelectorAll(".admin-nav-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = container.querySelector(`#${btn.dataset.target}`);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  const pendingEl = container.querySelector("#pending-payments");
  const eventListEl = container.querySelector("#event-manage-list");
  const cancellationsEl = container.querySelector("#pending-cancellations");
  const userOverviewEl = container.querySelector("#user-overview");

  const eventForm = container.querySelector("#event-form");
  const formTitleEl = container.querySelector("#event-form-title");
  const submitBtn = container.querySelector("#event-form-submit");
  const cancelBtn = container.querySelector("#event-form-cancel");
  const posterPreview = container.querySelector("#ev-poster-preview");
  const fields = {
    title: container.querySelector("#ev-title"),
    summary: container.querySelector("#ev-summary"),
    description: container.querySelector("#ev-description"),
    location: container.querySelector("#ev-location"),
    instructor: container.querySelector("#ev-instructor"),
    date: container.querySelector("#ev-date"),
    price: container.querySelector("#ev-price"),
    maxCap: container.querySelector("#ev-maxcap"),
    minCap: container.querySelector("#ev-mincap"),
    posterUrl: container.querySelector("#ev-poster-url"),
    registrationQuestion: container.querySelector("#ev-registration-question"),
  };

  const evTagsEl = container.querySelector("#ev-tags");

  function tagCheckboxes() {
    return Array.from(evTagsEl.querySelectorAll(".ev-tag-checkbox"));
  }
  function getCheckedTags() {
    return tagCheckboxes()
      .filter((cb) => cb.checked)
      .map((cb) => cb.value);
  }
  function setCheckedTags(tagIds = []) {
    tagCheckboxes().forEach((cb) => {
      cb.checked = tagIds.includes(cb.value);
    });
  }

  // 標籤清單可能在同一個畫面裡被新增/修改，重畫勾選框時要保留目前勾選的狀態，
  // 不然主辦方正在編輯的活動會突然被清空標籤。
  function renderEventTagCheckboxes() {
    const checked = getCheckedTags();
    evTagsEl.innerHTML = getTags()
      .map(
        (t) => `
        <label class="inline-flex items-center gap-1 border rounded-full px-3 py-1 cursor-pointer">
          <input type="checkbox" value="${t.id}" class="ev-tag-checkbox" />
          ${t.icon || ""} ${t.label}
        </label>`
      )
      .join("");
    setCheckedTags(checked);
  }

  let editingEventId = null;

  function showPosterPreview(url) {
    if (url) {
      posterPreview.src = url;
      posterPreview.classList.remove("hidden");
    } else {
      posterPreview.classList.add("hidden");
    }
  }
  // 網址貼錯、圖片打不開時就把預覽藏起來，不要留一個壞掉的圖示在表單裡
  posterPreview.addEventListener("error", () => posterPreview.classList.add("hidden"));
  fields.posterUrl.addEventListener("input", () => showPosterPreview(fields.posterUrl.value.trim()));

  const summaryCountEl = container.querySelector("#ev-summary-count");
  const descriptionCountEl = container.querySelector("#ev-description-count");

  // 用 Array.from 算字數：中文、emoji 都算一個字，跟一般人理解的「字數」一致。
  function charCount(text) {
    return Array.from(text.trim()).length;
  }
  function renderCount(el, text, max) {
    const n = charCount(text);
    el.textContent = `${n} / ${max}`;
    el.classList.toggle("text-red-600", n > max);
    el.classList.toggle("font-bold", n > max);
  }
  function updateCharCounts() {
    renderCount(summaryCountEl, fields.summary.value, SUMMARY_MAX_CHARS);
    renderCount(descriptionCountEl, fields.description.value, DESCRIPTION_MAX_CHARS);
  }
  fields.summary.addEventListener("input", updateCharCounts);
  fields.description.addEventListener("input", updateCharCounts);
  updateCharCounts();

  function resetForm() {
    editingEventId = null;
    eventForm.reset();
    fields.price.value = "0";
    formTitleEl.textContent = "新增活動";
    submitBtn.textContent = "新增活動";
    cancelBtn.classList.add("hidden");
    showPosterPreview(null);
    setCheckedTags([]);
    updateCharCounts();
  }

  function startEdit(ev) {
    editingEventId = ev.id;
    fields.title.value = ev.title || "";
    fields.summary.value = ev.summary || "";
    fields.description.value = ev.description || "";
    updateCharCounts();
    fields.location.value = ev.location || "";
    fields.instructor.value = ev.instructor || "";
    const d = ev.date?.toDate ? ev.date.toDate() : ev.date ? new Date(ev.date) : new Date();
    fields.date.value = toDatetimeLocalValue(d);
    fields.price.value = ev.price || 0;
    fields.maxCap.value = ev.maxCap || "";
    fields.minCap.value = ev.minCap || "";
    fields.posterUrl.value = ev.posterUrl || "";
    fields.registrationQuestion.value = ev.registrationQuestion || "";
    showPosterPreview(ev.posterUrl || null);
    setCheckedTags(ev.tags || []);
    formTitleEl.textContent = `編輯活動：${ev.title || ""}`;
    submitBtn.textContent = "儲存變更";
    cancelBtn.classList.remove("hidden");
    eventForm.scrollIntoView({ behavior: "smooth" });
  }

  cancelBtn.addEventListener("click", resetForm);

  eventForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
      title: fields.title.value.trim(),
      summary: fields.summary.value.trim() || null,
      description: fields.description.value.trim(),
      location: fields.location.value.trim(),
      instructor: fields.instructor.value.trim() || null,
      date: fields.date.value ? new Date(fields.date.value) : null,
      price: Number(fields.price.value) || 0,
      maxCap: fields.maxCap.value.trim() === "" ? null : Number(fields.maxCap.value),
      minCap: fields.minCap.value.trim() === "" ? null : Number(fields.minCap.value),
      posterUrl: fields.posterUrl.value.trim() || null,
      registrationQuestion: fields.registrationQuestion.value.trim() || null,
      tags: getCheckedTags(),
    };
    if (!data.title || !data.date) {
      alert("請填寫活動名稱與日期時間");
      return;
    }
    if (data.minCap && data.maxCap && data.minCap > data.maxCap) {
      alert("最低開課人數不能大於名額上限");
      return;
    }
    if (charCount(data.summary || "") > SUMMARY_MAX_CHARS) {
      alert(`活動簡介請控制在 ${SUMMARY_MAX_CHARS} 字以內（目前 ${charCount(data.summary)} 字）`);
      return;
    }
    if (charCount(data.description) > DESCRIPTION_MAX_CHARS) {
      alert(`活動內容請控制在 ${DESCRIPTION_MAX_CHARS} 字以內（目前 ${charCount(data.description)} 字）`);
      return;
    }

    submitBtn.disabled = true;
    try {
      if (editingEventId) {
        await updateEvent(editingEventId, data);
      } else {
        await createEvent(data);
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
    row.className = "card rounded-lg p-4 flex items-center gap-3";

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
    detail.textContent = `${formatDate(ev.date)} · ${ev.location || ""} · 名額 ${ev.currentCount || 0}/${ev.maxCap || "不限"}${
      ev.instructor ? ` · 講師：${ev.instructor}` : ""
    }`;
    info.append(title, detail);
    const statusText = courseStatusText(ev);
    if (statusText) {
      const statusEl = document.createElement("p");
      statusEl.className = "text-sm font-bold text-gray-700 mt-1";
      statusEl.textContent = statusText;
      info.appendChild(statusEl);
    }
    if (ev.tags && ev.tags.length > 0) {
      const tagsEl = document.createElement("div");
      tagsEl.className = "flex flex-wrap gap-1 mt-1";
      tagsEl.innerHTML = renderTagBadgesHtml(ev.tags);
      info.appendChild(tagsEl);
    }

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

  function eventDateOf(ev) {
    if (!ev.date) return null;
    return ev.date.toDate ? ev.date.toDate() : new Date(ev.date);
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
    // 跟活動列表頁一樣，日期新到舊排序
    const sorted = [...events].sort((a, b) => {
      const da = eventDateOf(a) || new Date(0);
      const db = eventDateOf(b) || new Date(0);
      return db - da;
    });
    sorted.forEach((ev) => eventListEl.appendChild(renderEventRow(ev)));
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
    row.className = "card rounded-lg p-4 flex items-center justify-between gap-3";

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
    const hasInsuranceInfo = Boolean(u.realName && u.nationalId && u.birthDate);
    const cells = [
      u.name || "",
      u.email || "",
      u.totalEvents || 0,
      u.attendedEvents || 0,
      u.cancelled || 0,
      `${u.rate}%`,
      hasInsuranceInfo ? "✓" : "✗",
    ];
    cells.forEach((val, i) => {
      const td = document.createElement("td");
      td.className = `p-3 text-sm ${i >= 2 ? "text-center" : ""} ${i === 6 && !hasInsuranceInfo ? "text-red-500" : ""}`;
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
        <th class="p-3 text-center">投保資料</th>
      </tr>`;
    const tbody = document.createElement("tbody");
    users.forEach((u) => tbody.appendChild(renderUserRow(u)));
    table.append(thead, tbody);
    userOverviewEl.appendChild(table);
  }

  const noticeEventSelect = container.querySelector("#notice-event");
  const noticeRecipientCount = container.querySelector("#notice-recipient-count");
  const noticeMessage = container.querySelector("#notice-message");
  const noticeGenerateBtn = container.querySelector("#notice-generate");
  const noticePreview = container.querySelector("#notice-preview");
  const noticeSubjectInput = container.querySelector("#notice-subject");
  const noticeBodyInput = container.querySelector("#notice-body");
  const noticeSendBtn = container.querySelector("#notice-send");

  let noticeEventsCache = [];
  let noticeEmails = [];

  async function updateRecipientCount() {
    const eventId = noticeEventSelect.value;
    if (!eventId) {
      noticeRecipientCount.textContent = "";
      return;
    }
    noticeRecipientCount.textContent = "計算收件人數中...";
    noticeEmails = await listActiveParticipantEmails(eventId);
    noticeRecipientCount.textContent = `此活動目前有 ${noticeEmails.length} 位報名者（不含已取消）`;
  }

  async function populateNoticeEventSelect() {
    noticeEventsCache = await listEvents();
    noticeEventSelect.innerHTML = noticeEventsCache
      .map((ev) => `<option value="${ev.id}">${ev.title || "（未命名活動）"}</option>`)
      .join("");
    updateRecipientCount();
  }

  noticeEventSelect.addEventListener("change", () => {
    noticePreview.classList.add("hidden");
    updateRecipientCount();
  });

  noticeGenerateBtn.addEventListener("click", async () => {
    const ev = noticeEventsCache.find((e) => e.id === noticeEventSelect.value);
    if (!ev) {
      alert("請先選擇活動");
      return;
    }
    if (!noticeMessage.value.trim()) {
      alert("請輸入通知內容");
      return;
    }

    await updateRecipientCount();
    if (noticeEmails.length === 0) {
      alert("這個活動目前沒有任何有效報名者（可能都取消了），沒有收件人可以寄送。");
      return;
    }

    const { subject, body } = buildPreEventNotice({
      eventTitle: ev.title || "",
      eventDateText: formatDate(ev.date),
      eventLocation: ev.location || "",
      customMessage: noticeMessage.value,
    });
    noticeSubjectInput.value = subject;
    noticeBodyInput.value = body;
    noticePreview.classList.remove("hidden");
  });

  noticeSendBtn.addEventListener("click", () => {
    const url = buildGmailComposeLink({
      bcc: noticeEmails.join(","),
      subject: noticeSubjectInput.value,
      body: noticeBodyInput.value,
    });
    window.open(url, "_blank");
  });

  const insuranceEventSelect = container.querySelector("#insurance-event");
  const insuranceGenerateBtn = container.querySelector("#insurance-generate");
  const insuranceOutput = container.querySelector("#insurance-output");
  const insuranceMissingNote = container.querySelector("#insurance-missing-note");

  let insuranceEventsCache = [];

  async function populateInsuranceEventSelect() {
    insuranceEventsCache = await listEvents();
    insuranceEventSelect.innerHTML = insuranceEventsCache
      .map((ev) => `<option value="${ev.id}">${ev.title || "（未命名活動）"}</option>`)
      .join("");
  }

  insuranceEventSelect.addEventListener("change", () => {
    insuranceOutput.classList.add("hidden");
    insuranceMissingNote.classList.add("hidden");
  });

  insuranceGenerateBtn.addEventListener("click", async () => {
    const ev = insuranceEventsCache.find((e) => e.id === insuranceEventSelect.value);
    if (!ev) {
      alert("請先選擇活動");
      return;
    }

    insuranceGenerateBtn.disabled = true;
    insuranceGenerateBtn.textContent = "產生中...";
    try {
      const rows = await listActiveParticipantsForInsurance(ev.id);
      if (rows.length === 0) {
        insuranceOutput.classList.add("hidden");
        insuranceMissingNote.classList.remove("hidden");
        insuranceMissingNote.textContent = "這個活動目前沒有任何有效報名者（可能都取消了）。";
        return;
      }

      const missing = rows.filter((r) => !r.realName || !r.nationalId || !r.birthDate);
      const header = "姓名,身分證字號,出生年月日,Email";
      const lines = rows.map((r) =>
        [
          r.realName || "（尚未填寫）",
          r.nationalId || "（尚未填寫）",
          r.birthDate || "（尚未填寫）",
          r.email || "",
        ].join(",")
      );
      insuranceOutput.value = [header, ...lines].join("\n");
      insuranceOutput.classList.remove("hidden");

      if (missing.length > 0) {
        insuranceMissingNote.classList.remove("hidden");
        insuranceMissingNote.textContent = `有 ${missing.length} 位報名者尚未在「資料維護」補齊真實資料，名單裡標示為「尚未填寫」，需要另外提醒他們補資料。`;
      } else {
        insuranceMissingNote.classList.add("hidden");
      }
    } finally {
      insuranceGenerateBtn.disabled = false;
      insuranceGenerateBtn.textContent = "產生投保名單";
    }
  });

  const questionsEventSelect = container.querySelector("#questions-event");
  const questionsListEl = container.querySelector("#questions-list");

  let questionsEventsCache = [];

  async function populateQuestionsEventSelect() {
    questionsEventsCache = await listEvents();
    questionsEventSelect.innerHTML = questionsEventsCache
      .map((ev) => `<option value="${ev.id}">${ev.title || "（未命名活動）"}</option>`)
      .join("");
    renderQuestionsAnswers();
  }

  // 回答內容是會員自己輸入的文字，屬於不可信任的使用者輸入，用
  // createElement + textContent 手動組，不能用 innerHTML 拼字串。
  async function renderQuestionsAnswers() {
    const eventId = questionsEventSelect.value;
    questionsListEl.innerHTML = "";
    if (!eventId) return;

    const ev = questionsEventsCache.find((e) => e.id === eventId);
    if (!ev?.registrationQuestion) {
      questionsListEl.innerHTML = `<p class="text-sm text-gray-500 p-2">這場活動沒有設定報名問題。</p>`;
      return;
    }

    const rows = await listRegistrationAnswers(eventId);
    if (rows.length === 0) {
      questionsListEl.innerHTML = `<p class="text-sm text-gray-500 p-2">目前還沒有人回答。</p>`;
      return;
    }

    rows.forEach((r) => {
      const row = document.createElement("div");
      row.className = "bg-white rounded-lg border p-3";

      const who = document.createElement("p");
      who.className = "text-sm font-bold text-gray-700";
      who.textContent = `${r.name || "（未命名）"}（${r.email || ""}）`;

      const answer = document.createElement("p");
      answer.className = "text-sm text-gray-600 mt-1 whitespace-pre-wrap";
      answer.textContent = r.answer;

      row.append(who, answer);
      questionsListEl.appendChild(row);
    });
  }

  questionsEventSelect.addEventListener("change", renderQuestionsAnswers);

  const wpForm = container.querySelector("#work-points-form");
  const wpUserSelect = container.querySelector("#wp-user");
  const wpEventSelect = container.querySelector("#wp-event");
  const wpPointsInput = container.querySelector("#wp-points");
  const wpReasonInput = container.querySelector("#wp-reason");
  const wpSubmitBtn = container.querySelector("#wp-submit");
  const wpHistoryEl = container.querySelector("#wp-history");

  let wpUsersCache = [];
  let wpEventsCache = [];

  async function populateWorkPointsForm() {
    wpUsersCache = await listAllUsers();
    wpUsersCache.sort((a, b) => (a.name || "").localeCompare(b.name || "", "zh-Hant"));
    wpUserSelect.innerHTML = wpUsersCache
      .map((u) => `<option value="${u.id}">${u.name || "（未命名）"}（${u.email || ""}）· 目前 ${u.workPoints || 0} 點</option>`)
      .join("");

    wpEventsCache = await listEvents();
    wpEventSelect.innerHTML =
      `<option value="">（不指定）</option>` +
      wpEventsCache.map((ev) => `<option value="${ev.id}">${ev.title || "（未命名活動）"}</option>`).join("");

    renderWpHistory();
  }

  async function renderWpHistory() {
    const userId = wpUserSelect.value;
    wpHistoryEl.innerHTML = "";
    if (!userId) return;

    const history = await listPointsHistoryForUser(userId);
    if (history.length === 0) {
      wpHistoryEl.innerHTML = `<p class="text-sm text-gray-500 p-4">目前還沒有任何點數紀錄</p>`;
      return;
    }

    history.forEach((tx) => {
      const row = document.createElement("div");
      row.className = "p-3 flex items-center justify-between gap-3";

      const info = document.createElement("div");
      const reason = document.createElement("p");
      reason.className = "text-sm text-gray-700";
      reason.textContent = tx.reason || "（無說明）";
      const time = document.createElement("p");
      time.className = "text-xs text-gray-400";
      time.textContent = tx.createdAt?.toDate ? tx.createdAt.toDate().toLocaleString("zh-TW") : "";
      info.append(reason, time);

      const pts = document.createElement("span");
      pts.className = `text-sm font-bold shrink-0 ${tx.points >= 0 ? "text-emerald-600" : "text-red-600"}`;
      pts.textContent = tx.points >= 0 ? `+${tx.points}` : `${tx.points}`;

      row.append(info, pts);
      wpHistoryEl.appendChild(row);
    });
  }

  wpUserSelect.addEventListener("change", renderWpHistory);

  wpForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const userId = wpUserSelect.value;
    const points = Number(wpPointsInput.value);
    if (!userId || !points) {
      alert("請選擇會員並輸入不為 0 的點數");
      return;
    }

    wpSubmitBtn.disabled = true;
    try {
      await awardPoints({
        userId,
        points,
        reason: wpReasonInput.value.trim(),
        eventId: wpEventSelect.value || null,
      });
      wpPointsInput.value = "";
      wpReasonInput.value = "";
      await populateWorkPointsForm();
      wpUserSelect.value = userId;
      renderWpHistory();
    } catch (err) {
      alert("登記失敗：" + err.message);
    } finally {
      wpSubmitBtn.disabled = false;
    }
  });

  const wpBulkForm = container.querySelector("#wp-bulk-form");
  const wpBulkEventSelect = container.querySelector("#wp-bulk-event");
  const wpBulkCount = container.querySelector("#wp-bulk-count");
  const wpBulkPointsInput = container.querySelector("#wp-bulk-points");
  const wpBulkReasonInput = container.querySelector("#wp-bulk-reason");
  const wpBulkSubmitBtn = container.querySelector("#wp-bulk-submit");

  let wpBulkEventsCache = [];

  async function populateWpBulkEventSelect() {
    wpBulkEventsCache = await listEvents();
    wpBulkEventSelect.innerHTML = wpBulkEventsCache
      .map((ev) => `<option value="${ev.id}">${ev.title || "（未命名活動）"}</option>`)
      .join("");
    updateWpBulkCount();
  }

  async function updateWpBulkCount() {
    const eventId = wpBulkEventSelect.value;
    if (!eventId) {
      wpBulkCount.textContent = "";
      return;
    }
    wpBulkCount.textContent = "計算已報到人數中...";
    const tickets = await listCheckedInTickets(eventId);
    const pending = tickets.filter((t) => !t.workPointsAwarded);
    wpBulkCount.textContent =
      tickets.length === 0
        ? "這場活動目前沒有已報到的會員"
        : `已報到 ${tickets.length} 人，其中 ${pending.length} 人還沒發過這場的點數`;
  }

  wpBulkEventSelect.addEventListener("change", updateWpBulkCount);

  wpBulkForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const eventId = wpBulkEventSelect.value;
    const points = Number(wpBulkPointsInput.value);
    if (!eventId || !points) {
      alert("請選擇活動並輸入大於 0 的點數");
      return;
    }

    wpBulkSubmitBtn.disabled = true;
    wpBulkSubmitBtn.textContent = "發放中...";
    try {
      const ev = wpBulkEventsCache.find((e2) => e2.id === eventId);
      const reason = wpBulkReasonInput.value.trim() || `${ev?.title || "換工活動"} 換工點數`;
      const { awardedCount, alreadyAwardedCount } = await awardPointsToCheckedInParticipants(eventId, points, reason);
      alert(
        alreadyAwardedCount > 0
          ? `已發放給 ${awardedCount} 人，另外 ${alreadyAwardedCount} 人先前已經發過這場的點數，這次略過。`
          : `已發放給 ${awardedCount} 人。`
      );
      await updateWpBulkCount();
      await populateWorkPointsForm();
    } catch (err) {
      alert("發放失敗：" + err.message);
    } finally {
      wpBulkSubmitBtn.disabled = false;
      wpBulkSubmitBtn.textContent = "一鍵發放給已報到會員";
    }
  });

  const discountListEl = container.querySelector("#discount-eligible-list");
  const discountRefreshBtn = container.querySelector("#discount-refresh");
  const discountIssueBtn = container.querySelector("#discount-issue-btn");

  async function renderDiscountEligible() {
    discountListEl.innerHTML = `<p class="text-sm text-gray-500 p-4">載入中...</p>`;
    const eligible = await listEligibleForCoupons();

    if (eligible.length === 0) {
      discountListEl.innerHTML = `<p class="text-sm text-gray-500 p-4">目前沒有人達到新的門檻</p>`;
      discountIssueBtn.disabled = true;
      return;
    }

    discountListEl.innerHTML = "";
    eligible.forEach((u) => {
      const row = document.createElement("div");
      row.className = "p-3 flex items-center justify-between gap-3 text-sm";

      const info = document.createElement("span");
      info.textContent = `${u.name || "（未命名）"}（${u.email || ""}）· 出席 ${u.regularAttendedCount} 次`;

      const badge = document.createElement("span");
      badge.className = "badge badge-green shrink-0";
      badge.textContent = `可核發 ${u.pending} 張`;

      row.append(info, badge);
      discountListEl.appendChild(row);
    });
    discountIssueBtn.disabled = false;
  }

  discountRefreshBtn.addEventListener("click", renderDiscountEligible);

  discountIssueBtn.addEventListener("click", async () => {
    discountIssueBtn.disabled = true;
    discountIssueBtn.textContent = "發放中...";
    try {
      const { issuedCount, memberCount } = await issuePendingCoupons();
      alert(issuedCount > 0 ? `已發放 ${issuedCount} 張折扣券給 ${memberCount} 位會員。` : "目前沒有人達到新的門檻。");
      await renderDiscountEligible();
    } catch (err) {
      alert("發放失敗：" + err.message);
      discountIssueBtn.disabled = false;
    } finally {
      discountIssueBtn.textContent = "核發折扣券給以上名單";
    }
  });

  const tagListEl = container.querySelector("#tag-list");
  const tagErrorEl = container.querySelector("#tag-error");
  const tagForm = container.querySelector("#tag-form");
  const tagFormTitle = container.querySelector("#tag-form-title");
  const tagLabelInput = container.querySelector("#tag-label");
  const tagIconInput = container.querySelector("#tag-icon");
  const tagIconGrid = container.querySelector("#tag-icon-grid");
  const tagColorGrid = container.querySelector("#tag-color-grid");
  const tagPreview = container.querySelector("#tag-preview");
  const tagSubmitBtn = container.querySelector("#tag-submit");
  const tagCancelBtn = container.querySelector("#tag-cancel");

  let editingTagId = null;
  let selectedTagColor = TAG_COLORS[0];

  tagIconGrid.innerHTML = TAG_ICON_CHOICES.map(
    (icon) =>
      `<button type="button" class="tag-icon-choice w-9 h-9 text-xl rounded-lg border bg-white hover:bg-amber-100" data-icon="${icon}">${icon}</button>`
  ).join("");
  tagColorGrid.innerHTML = TAG_COLORS.map(
    (c) => `<button type="button" class="tag-color-choice badge badge-tag-${c} ring-gray-600 ring-offset-1" data-color="${c}">標籤</button>`
  ).join("");

  function updateTagPreview() {
    tagPreview.innerHTML = tagBadgeHtml({
      label: tagLabelInput.value.trim() || "標籤名稱",
      icon: tagIconInput.value.trim(),
      color: selectedTagColor,
    });
    tagColorGrid.querySelectorAll(".tag-color-choice").forEach((b) => {
      b.classList.toggle("ring-2", b.dataset.color === selectedTagColor);
    });
  }

  tagIconGrid.querySelectorAll(".tag-icon-choice").forEach((btn) => {
    btn.addEventListener("click", () => {
      tagIconInput.value = btn.dataset.icon;
      updateTagPreview();
    });
  });
  tagColorGrid.querySelectorAll(".tag-color-choice").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedTagColor = btn.dataset.color;
      updateTagPreview();
    });
  });
  tagLabelInput.addEventListener("input", updateTagPreview);
  tagIconInput.addEventListener("input", updateTagPreview);

  function resetTagForm() {
    editingTagId = null;
    tagForm.reset();
    tagIconInput.value = TAG_ICON_CHOICES[0];
    selectedTagColor = TAG_COLORS[0];
    tagFormTitle.textContent = "新增標籤";
    tagSubmitBtn.textContent = "新增標籤";
    tagCancelBtn.classList.add("hidden");
    updateTagPreview();
  }

  function startTagEdit(tag) {
    editingTagId = tag.id;
    tagLabelInput.value = tag.label;
    tagIconInput.value = tag.icon || "";
    selectedTagColor = tag.color || "gray";
    tagFormTitle.textContent = `編輯標籤：${tag.label}`;
    tagSubmitBtn.textContent = "儲存變更";
    tagCancelBtn.classList.remove("hidden");
    updateTagPreview();
    tagForm.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  tagCancelBtn.addEventListener("click", resetTagForm);

  // 標籤一改，活動表單的勾選框、活動管理列表上的標籤色塊都要跟著更新。
  async function refreshTags() {
    await loadTags();
    renderTagList();
    renderEventTagCheckboxes();
    renderEventList();
  }

  function renderTagList() {
    tagListEl.innerHTML = "";
    getTags().forEach((tag) => {
      const row = document.createElement("div");
      row.className = "flex items-center justify-between gap-3";

      const badge = document.createElement("span");
      badge.innerHTML = tagBadgeHtml(tag);

      const btns = document.createElement("div");
      btns.className = "flex gap-3 shrink-0 items-center";

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "text-sm text-emerald-700 underline";
      editBtn.textContent = "編輯";
      editBtn.addEventListener("click", () => startTagEdit(tag));
      btns.appendChild(editBtn);

      if (tag.id === LABOR_EXCHANGE_TAG_ID) {
        const note = document.createElement("span");
        note.className = "text-xs text-gray-400";
        note.textContent = "換工點數使用中，不能刪除";
        btns.appendChild(note);
      } else {
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "text-sm text-red-600 underline";
        delBtn.textContent = "刪除";
        delBtn.addEventListener("click", async () => {
          if (!confirm(`確定要刪除「${tag.label}」嗎？已經用了這個標籤的活動會直接不再顯示它。`)) return;
          try {
            await deleteTag(tag.id);
            if (editingTagId === tag.id) resetTagForm();
            await refreshTags();
          } catch (err) {
            alert("刪除標籤失敗：" + err.message);
          }
        });
        btns.appendChild(delBtn);
      }

      row.append(badge, btns);
      tagListEl.appendChild(row);
    });
  }

  tagForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
      label: tagLabelInput.value.trim(),
      icon: tagIconInput.value.trim(),
      color: selectedTagColor,
    };
    if (!data.label || !data.icon) {
      alert("請填寫標籤名稱並選一個圖示");
      return;
    }
    if (getTags().some((t) => t.label === data.label && t.id !== editingTagId)) {
      alert("已經有同名的標籤了");
      return;
    }

    tagSubmitBtn.disabled = true;
    try {
      if (editingTagId) {
        await updateTag(editingTagId, data);
      } else {
        await createTag(data);
      }
      resetTagForm();
      await refreshTags();
    } catch (err) {
      alert("儲存標籤失敗：" + err.message);
    } finally {
      tagSubmitBtn.disabled = false;
    }
  });

  resetTagForm();

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
    try {
      await ensureDefaultTagsSeeded();
      tagErrorEl.classList.add("hidden");
    } catch (e) {
      tagErrorEl.textContent = "無法讀寫活動標籤，請確認 Firebase 的 Firestore 規則已經更新（需要 eventTags 的規則）。";
      tagErrorEl.classList.remove("hidden");
    }
    await refreshTags();
    renderPendingPayments();
    renderPendingCancellations();
    renderUsersOverview();
    populateNoticeEventSelect();
    populateInsuranceEventSelect();
    populateQuestionsEventSelect();
    populateWorkPointsForm();
    populateWpBulkEventSelect();
    renderDiscountEligible();
  });

  return () => unsubscribe();
}
