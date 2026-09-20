import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { initNavbar } from "./nav.js";
import { isCurrentUserAdmin, processScannedTicket } from "./checkin.js";

initNavbar();

const adminGate = document.getElementById("admin-gate");
const scannerSection = document.getElementById("scanner-section");
const resultEl = document.getElementById("scan-result");

let html5QrCode;
let isProcessing = false;

async function onScanSuccess(decodedText) {
  if (isProcessing) return;
  isProcessing = true;
  try {
    const { userName } = await processScannedTicket(decodedText);
    resultEl.innerHTML = `<div class="p-4 rounded-lg bg-emerald-100 text-emerald-800 font-bold">✅ 報到成功：${userName}</div>`;
  } catch (e) {
    resultEl.innerHTML = `<div class="p-4 rounded-lg bg-red-100 text-red-800 font-bold">❌ ${e.message}</div>`;
  } finally {
    setTimeout(() => {
      isProcessing = false;
    }, 1500);
  }
}

async function startScanner() {
  html5QrCode = new Html5Qrcode("qr-reader");
  await html5QrCode.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: 250 },
    onScanSuccess,
    () => {}
  );
}

onAuthStateChanged(auth, async (user) => {
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
  if (!html5QrCode) startScanner();
});
