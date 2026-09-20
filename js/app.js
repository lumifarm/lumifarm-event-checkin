import { initNavbar } from "./nav.js";
import { registerRoute, renderRoute } from "./router.js";
import { renderEvents } from "./views/events-view.js";
import { renderTickets } from "./views/tickets-view.js";
import { renderCheckin } from "./views/checkin-view.js";
import { renderAdmin } from "./views/admin-view.js";
import { renderReview } from "./views/review-view.js";
import { renderOnboarding } from "./views/onboarding-view.js";

initNavbar();

registerRoute("/events", renderEvents);
registerRoute("/tickets", renderTickets);
registerRoute("/checkin", renderCheckin);
registerRoute("/admin", renderAdmin);
registerRoute("/review", renderReview);
registerRoute("/onboarding", renderOnboarding);

window.addEventListener("hashchange", renderRoute);
renderRoute();

maybeShowOnboardingPopup();

// 只在使用者這台裝置的瀏覽器第一次造訪時彈出，用 localStorage 記錄，
// 不需要登入也能運作，也不會影響其他人或其他裝置。
function maybeShowOnboardingPopup() {
  let seen = false;
  try {
    seen = localStorage.getItem("lumifarm_seen_onboarding") === "1";
  } catch (e) {
    // 無痕視窗等情境可能無法存取 localStorage，直接當作沒看過即可
  }
  if (seen) return;

  const overlay = document.createElement("div");
  overlay.className = "fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50";

  const box = document.createElement("div");
  box.className = "bg-white rounded-xl shadow-lg max-w-sm w-full p-6 text-center";
  box.innerHTML = `
    <h2 class="text-lg font-bold text-gray-800 mb-2">歡迎來到光農合作社 🌾</h2>
    <p class="text-sm text-gray-600 mb-4">第一次使用嗎？花一分鐘看看怎麼報名、繳費跟報到。</p>`;

  const btnRow = document.createElement("div");
  btnRow.className = "flex gap-3 justify-center";

  function dismiss() {
    try {
      localStorage.setItem("lumifarm_seen_onboarding", "1");
    } catch (e) {
      // 存不進去就算了，最多下次再彈一次
    }
    overlay.remove();
  }

  const goBtn = document.createElement("button");
  goBtn.className = "btn-primary text-sm";
  goBtn.textContent = "看新手教學";
  goBtn.addEventListener("click", () => {
    dismiss();
    location.hash = "#/onboarding";
  });

  const skipBtn = document.createElement("button");
  skipBtn.className = "text-sm text-gray-500 underline";
  skipBtn.textContent = "略過";
  skipBtn.addEventListener("click", dismiss);

  btnRow.append(goBtn, skipBtn);
  box.appendChild(btnRow);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}
