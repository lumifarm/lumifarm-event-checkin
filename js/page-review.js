import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { initNavbar } from "./nav.js";
import { submitReview } from "./reviews.js";

initNavbar();

const params = new URLSearchParams(location.search);
const eventId = params.get("eventId");

const titleEl = document.getElementById("review-event-title");
const form = document.getElementById("review-form");
const loginPrompt = document.getElementById("login-prompt");
let selectedRating = 0;

if (!eventId) {
  alert("缺少活動代碼，請從「我的票券」頁面進入評價。");
  location.href = "my-tickets.html";
}

document.querySelectorAll(".star-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    selectedRating = Number(btn.dataset.value);
    document.querySelectorAll(".star-btn").forEach((b) => {
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
  const comment = document.getElementById("review-comment").value.trim();
  try {
    await submitReview(eventId, selectedRating, comment);
    alert("感謝你的回饋！");
    location.href = "my-tickets.html";
  } catch (err) {
    alert("送出失敗：" + err.message);
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    loginPrompt.classList.remove("hidden");
    form.classList.add("hidden");
    return;
  }
  loginPrompt.classList.add("hidden");
  form.classList.remove("hidden");

  if (eventId) {
    const snap = await getDoc(doc(db, "events", eventId));
    titleEl.textContent = snap.exists() ? snap.data().title : "活動";
  }
});
