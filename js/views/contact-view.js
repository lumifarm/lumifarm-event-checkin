import { auth } from "../firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { notifyMember, CONTACT_EMAIL } from "../notify.js";

// 「聯絡我們」留言板：選類別、填姓名／Email／留言，送出後用 EmailJS 直接寄到
// 主辦方信箱（沿用寄給會員的通用樣板，收件人換成主辦方），不需要登入，方便
// 想合作開課的外部單位也能留言。不另外存進資料庫。
export const CONTACT_CATEGORIES = ["報名系統的使用問題", "使用心得建議", "合作開課意願", "其他"];

const MESSAGE_MAX_CHARS = 1000;
const COOLDOWN_MS = 60 * 1000; // 同一個瀏覽器 1 分鐘內只能送一次，避免連按或被灌信用光 EmailJS 額度
const COOLDOWN_KEY = "contactLastSentAt";

function lastSentAt() {
  try {
    return Number(localStorage.getItem(COOLDOWN_KEY)) || 0;
  } catch (e) {
    return 0;
  }
}

function markSent() {
  try {
    localStorage.setItem(COOLDOWN_KEY, String(Date.now()));
  } catch (e) {
    // 無痕模式等情況存不了就算了，只是少了冷卻時間
  }
}

export function renderContact(container) {
  container.innerHTML = `
    <div class="max-w-xl mx-auto">
      <h1 class="text-2xl font-bold text-gray-800 my-4">✉️ 聯絡我們</h1>
      <p class="text-sm text-gray-600 mb-4">
        有任何報名系統的問題、使用心得、合作開課的想法，都歡迎留言給我們，送出後會直接寄到光農合作社群的信箱，我們會盡快用 Email 回覆你。
      </p>
      <form id="contact-form" class="card rounded-xl p-5 space-y-4">
        <div>
          <label for="contact-category" class="text-sm text-gray-600 block mb-1">留言類別</label>
          <select id="contact-category" class="w-full border rounded-lg p-2" required>
            <option value="">請選擇</option>
            ${CONTACT_CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join("")}
          </select>
        </div>
        <div>
          <label for="contact-name" class="text-sm text-gray-600 block mb-1">你的稱呼</label>
          <input id="contact-name" type="text" maxlength="50" class="w-full border rounded-lg p-2" required />
        </div>
        <div>
          <label for="contact-email" class="text-sm text-gray-600 block mb-1">你的 Email（我們會回覆到這裡）</label>
          <input id="contact-email" type="email" maxlength="100" class="w-full border rounded-lg p-2" required />
        </div>
        <div>
          <label for="contact-message" class="text-sm text-gray-600 block mb-1">留言內容</label>
          <textarea id="contact-message" rows="6" maxlength="${MESSAGE_MAX_CHARS}" class="w-full border rounded-lg p-2" required></textarea>
          <p id="contact-counter" class="text-xs text-gray-400 text-right">0 / ${MESSAGE_MAX_CHARS}</p>
        </div>
        <!-- 防機器人：真人看不到這個欄位，有填東西就當作垃圾留言 -->
        <input id="contact-website" type="text" tabindex="-1" autocomplete="off" class="hidden" aria-hidden="true" />
        <button id="contact-submit" type="submit" class="btn-primary">送出留言</button>
        <p id="contact-result" class="hidden text-sm"></p>
      </form>
    </div>`;

  const form = container.querySelector("#contact-form");
  const categoryEl = container.querySelector("#contact-category");
  const nameEl = container.querySelector("#contact-name");
  const emailEl = container.querySelector("#contact-email");
  const messageEl = container.querySelector("#contact-message");
  const counterEl = container.querySelector("#contact-counter");
  const honeypotEl = container.querySelector("#contact-website");
  const submitBtn = container.querySelector("#contact-submit");
  const resultEl = container.querySelector("#contact-result");

  messageEl.addEventListener("input", () => {
    counterEl.textContent = `${messageEl.value.length} / ${MESSAGE_MAX_CHARS}`;
  });

  // 已登入的話先幫忙帶入 Google 帳號的名字與 Email（還是可以改）
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    if (!user) return;
    if (!nameEl.value) nameEl.value = user.displayName || "";
    if (!emailEl.value) emailEl.value = user.email || "";
  });

  function showResult(text, ok) {
    resultEl.textContent = text;
    resultEl.className = `text-sm ${ok ? "text-emerald-700 font-bold" : "text-red-600"}`;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const category = categoryEl.value;
    const name = nameEl.value.trim();
    const email = emailEl.value.trim();
    const message = messageEl.value.trim();

    if (!category || !name || !email || !message) {
      showResult("請選擇類別並填寫稱呼、Email 與留言內容", false);
      return;
    }
    if (honeypotEl.value) {
      // 機器人：假裝成功、不寄信
      form.reset();
      showResult("已送出，謝謝你的留言！", true);
      return;
    }
    const wait = COOLDOWN_MS - (Date.now() - lastSentAt());
    if (wait > 0) {
      showResult(`剛剛已經送出過留言了，請 ${Math.ceil(wait / 1000)} 秒後再試`, false);
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "送出中...";
    const mail = await notifyMember({
      toEmail: CONTACT_EMAIL,
      toName: "光農合作社群",
      subject: `【聯絡我們｜${category}】${name}`,
      replyTo: email,
      lines: [
        `留言類別：${category}`,
        `稱呼：${name}`,
        `Email：${email}`,
        `是否已登入報名系統：${auth.currentUser ? `是（${auth.currentUser.email}）` : "否"}`,
        `送出時間：${new Date().toLocaleString("zh-TW")}`,
        "",
        "【留言內容】",
        ...message.split("\n"),
      ],
    });
    submitBtn.disabled = false;
    submitBtn.textContent = "送出留言";

    if (mail.ok) {
      markSent();
      form.reset();
      counterEl.textContent = `0 / ${MESSAGE_MAX_CHARS}`;
      showResult("✅ 已送出，謝謝你的留言！我們會盡快用 Email 回覆你。", true);
      return;
    }
    // 寄不出去（多半是廣告攔截器擋住 EmailJS）：保留填好的內容，請對方改用自己的信箱寄
    resultEl.textContent = "";
    resultEl.className = "text-sm text-red-600";
    resultEl.append(`留言沒有送出（${mail.reason}）。請暫時關閉廣告攔截器後再試一次，或直接寫信到 `);
    const link = document.createElement("a");
    link.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`【聯絡我們｜${category}】${name}`)}&body=${encodeURIComponent(message)}`;
    link.className = "underline font-bold";
    link.textContent = CONTACT_EMAIL;
    resultEl.append(link, "。");
  });

  return () => unsubscribe();
}
