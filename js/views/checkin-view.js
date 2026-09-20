import { auth } from "../firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { isCurrentUserAdmin, processScannedTicket } from "../checkin.js";

export function renderCheckin(container) {
  container.innerHTML = `
    <div class="max-w-md mx-auto text-center">
      <h1 class="text-xl font-bold text-gray-800 my-4">📷 現場報到掃描</h1>
      <p id="admin-gate" class="hidden text-gray-500 py-8"></p>
      <div id="scanner-section" class="hidden">
        <button id="start-camera-btn" class="btn-primary">📷 開啟相機開始掃描</button>
        <div id="qr-reader-wrap" class="hidden">
          <div id="qr-reader" class="rounded-lg overflow-hidden shadow"></div>
          <button id="stop-camera-btn" class="text-sm text-gray-500 underline mt-2">關閉相機</button>
        </div>
        <div id="scan-result" class="mt-4"></div>
      </div>
    </div>`;

  const adminGate = container.querySelector("#admin-gate");
  const scannerSection = container.querySelector("#scanner-section");
  const startCameraBtn = container.querySelector("#start-camera-btn");
  const stopCameraBtn = container.querySelector("#stop-camera-btn");
  const qrReaderWrap = container.querySelector("#qr-reader-wrap");
  const resultEl = container.querySelector("#scan-result");

  let html5QrCode;
  let isProcessing = false;

  // 使用 textContent 而非 innerHTML：userName 來自參加者自己的 Google 顯示名稱，
  // 屬於不可信任的使用者輸入，若用 innerHTML 拼接會讓惡意使用者能在主辦方（admin）
  // 的瀏覽器分頁裡執行任意程式碼。
  // 訊息故意做得又大又醒目（大字體、粗框、大圖示），現場掃描環境常常吵雜、
  // 手機螢幕小，主辦方要能一眼瞄到有沒有成功，不用湊近看小字。
  function showResult(message, isSuccess, icon) {
    resultEl.innerHTML = "";
    const div = document.createElement("div");
    div.className = `p-5 rounded-xl border-4 text-center ${
      isSuccess ? "bg-emerald-100 border-emerald-400 text-emerald-800" : "bg-red-100 border-red-400 text-red-800"
    }`;

    const iconEl = document.createElement("div");
    iconEl.className = "text-4xl mb-1";
    iconEl.textContent = icon;

    const textEl = document.createElement("div");
    textEl.className = "text-lg font-bold";
    textEl.textContent = message;

    div.append(iconEl, textEl);
    resultEl.appendChild(div);
  }

  async function onScanSuccess(decodedText) {
    if (isProcessing) return;
    isProcessing = true;
    try {
      const { userName } = await processScannedTicket(decodedText);
      showResult(`報到成功：${userName}`, true, "✅");
    } catch (e) {
      showResult(e.message, false, "❌");
    } finally {
      setTimeout(() => {
        isProcessing = false;
      }, 1500);
    }
  }

  async function startScanner() {
    startCameraBtn.classList.add("hidden");
    qrReaderWrap.classList.remove("hidden");
    html5QrCode = new Html5Qrcode("qr-reader");
    try {
      await html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        onScanSuccess,
        () => {}
      );
    } catch (e) {
      alert("無法開啟相機：" + e.message + "（請確認已允許瀏覽器使用相機）");
      html5QrCode = null;
      qrReaderWrap.classList.add("hidden");
      startCameraBtn.classList.remove("hidden");
    }
  }

  async function stopScanner() {
    if (html5QrCode) {
      await html5QrCode.stop().catch(() => {});
      html5QrCode.clear();
      html5QrCode = null;
    }
    qrReaderWrap.classList.add("hidden");
    startCameraBtn.classList.remove("hidden");
    resultEl.innerHTML = "";
  }

  startCameraBtn.addEventListener("click", startScanner);
  stopCameraBtn.addEventListener("click", stopScanner);

  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    if (!user) {
      adminGate.textContent = "請先登入。";
      adminGate.classList.remove("hidden");
      scannerSection.classList.add("hidden");
      return;
    }

    const admin = await isCurrentUserAdmin();
    if (!admin) {
      adminGate.textContent = "你沒有報到管理權限，請聯絡主辦方將你的帳號加入 admins 名單。";
      adminGate.classList.remove("hidden");
      scannerSection.classList.add("hidden");
      return;
    }

    adminGate.classList.add("hidden");
    scannerSection.classList.remove("hidden");
  });

  // 離開這個畫面時一定要關閉相機，不然切到別的路由後鏡頭指示燈還亮著、
  // 而且背景繼續呼叫已經不存在的 DOM。
  return () => {
    unsubscribe();
    if (html5QrCode) {
      html5QrCode.stop().catch(() => {});
    }
  };
}
