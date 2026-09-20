import { auth, db } from "../firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { submitReview } from "../reviews.js";
import { currentQuery } from "../router.js";

export function renderReview(container) {
  const eventId = currentQuery().get("eventId");

  if (!eventId) {
    container.innerHTML = `
      <p class="max-w-md mx-auto text-center text-red-500 py-16">
        缺少活動代碼，請從「我的票券」頁面進入評價。
      </p>`;
    return;
  }

  container.innerHTML = `
    <div class="max-w-md mx-auto">
      <h1 class="text-xl font-bold text-gray-800 my-4">活動評價：<span id="review-event-title"></span></h1>
      <p id="login-prompt" class="hidden text-center text-gray-500 py-16">請先登入以填寫評價。</p>
      <form id="review-form" class="hidden bg-white rounded-xl shadow p-5 space-y-4">
        <div>
          <p class="text-sm text-gray-600 mb-2">請給予星級評分：</p>
          <div class="flex gap-1 text-3xl">
            <button type="button" class="star-btn text-gray-300" data-value="1">★</button>
            <button type="button" class="star-btn text-gray-300" data-value="2">★</button>
            <button type="button" class="star-btn text-gray-300" data-value="3">★</button>
            <button type="button" class="star-btn text-gray-300" data-value="4">★</button>
            <button type="button" class="star-btn text-gray-300" data-value="5">★</button>
          </div>
        </div>
        <div>
          <label class="text-sm text-gray-600 mb-1 block">文字回饋</label>
          <textarea id="review-comment" rows="4" class="w-full border rounded-lg p-2" placeholder="分享你的參加心得..."></textarea>
        </div>
        <button type="submit" class="btn-primary w-full">送出評價</button>
      </form>
    </div>`;

  const titleEl = container.querySelector("#review-event-title");
  const form = container.querySelector("#review-form");
  const loginPrompt = container.querySelector("#login-prompt");
  let selectedRating = 0;

  container.querySelectorAll(".star-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedRating = Number(btn.dataset.value);
      container.querySelectorAll(".star-btn").forEach((b) => {
        b.classList.toggle("text-yellow-400", Number(b.dataset.value) <= selectedRating);
        b.classList.toggle("text-gray-300", Number(b.dataset.value) > selectedRating);
      });
    });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!selectedRating) {
      alert("請選擇星級");
      return;
    }
    const comment = container.querySelector("#review-comment").value.trim();
    try {
      await submitReview(eventId, selectedRating, comment);
      alert("感謝你的回饋！");
      location.hash = "#/tickets";
    } catch (err) {
      alert("送出失敗：" + err.message);
    }
  });

  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    if (!user) {
      loginPrompt.classList.remove("hidden");
      form.classList.add("hidden");
      return;
    }
    loginPrompt.classList.add("hidden");
    form.classList.remove("hidden");

    const snap = await getDoc(doc(db, "events", eventId));
    titleEl.textContent = snap.exists() ? snap.data().title : "活動";
  });

  return () => unsubscribe();
}
