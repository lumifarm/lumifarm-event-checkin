// PWA：註冊 Service Worker，並在導覽列提供「📲 安裝 App」按鈕。
// - Android／電腦版 Chrome：瀏覽器支援一鍵安裝（beforeinstallprompt），按下去直接跳出安裝視窗
// - iPhone／iPad：Safari 沒有一鍵安裝，按下去顯示「分享 → 加入主畫面」的教學
// - LINE、Facebook 等 App 內建瀏覽器不能安裝，按下去提示改用 Safari／Chrome 開啟
// 已經是從主畫面打開（standalone）的就不顯示按鈕。

let deferredPrompt = null;

function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function isIos() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

function isInAppBrowser() {
  return /Line\/|FBAN|FBAV|Instagram/i.test(navigator.userAgent);
}

function showGuideModal(title, steps) {
  const overlay = document.createElement("div");
  overlay.className = "fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50";
  const box = document.createElement("div");
  box.className = "card rounded-xl max-w-sm w-full p-6 space-y-3";
  const h = document.createElement("h2");
  h.className = "text-lg font-bold text-gray-800";
  h.textContent = title;
  const ol = document.createElement("ol");
  ol.className = "list-decimal pl-5 space-y-2 text-sm text-gray-700";
  steps.forEach((s) => {
    const li = document.createElement("li");
    li.textContent = s;
    ol.appendChild(li);
  });
  const note = document.createElement("p");
  note.className = "text-xs text-gray-500";
  note.textContent = "加到主畫面後，從光農的圖示打開就像 App 一樣全螢幕；第一次打開請重新用 Google 登入一次。";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "btn-primary text-sm w-full";
  close.textContent = "知道了";
  close.addEventListener("click", () => overlay.remove());
  box.append(h, ol, note, close);
  overlay.appendChild(box);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.body.appendChild(overlay);
}

export function initPwa() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("Service Worker 註冊失敗：", e));
    });
  }

  const btn = document.getElementById("btn-install-app");
  if (!btn || isStandalone()) return;

  const show = () => btn.classList.remove("hidden");
  if (isIos() || isInAppBrowser()) show();

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    show();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    btn.classList.add("hidden");
  });

  btn.addEventListener("click", async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice.catch(() => null);
      deferredPrompt = null;
      return;
    }
    if (isInAppBrowser()) {
      showGuideModal("請先用瀏覽器開啟", [
        "點右上角（或右下角）的「⋯」選單",
        isIos() ? "選擇「用 Safari 開啟」" : "選擇「用預設瀏覽器開啟」或「用 Chrome 開啟」",
        "開啟後再按一次導覽列的「📲 安裝 App」",
      ]);
      return;
    }
    if (isIos()) {
      showGuideModal("加到 iPhone 主畫面", [
        "用 Safari 開啟這個網站（checkin.lumifarm.org）",
        "點畫面下方（iPad 在右上方）的「分享」按鈕（方框加向上箭頭）",
        "往下滑，選「加入主畫面」",
        "按右上角「新增」，主畫面就會出現光農的圖示",
      ]);
      return;
    }
    showGuideModal("加到主畫面", [
      "點瀏覽器右上角的「⋮」選單",
      "選「安裝應用程式」或「加到主畫面」",
      "確認後，主畫面就會出現光農的圖示",
    ]);
  });
}
