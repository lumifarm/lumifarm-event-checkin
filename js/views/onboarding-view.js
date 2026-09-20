const STEPS = [
  {
    title: "1. 使用 Google 帳號登入",
    body: "點右上角「使用 Google 登入」，之後報名不用重複填寫姓名、Email。",
  },
  {
    title: "2. 瀏覽活動並報名",
    body: "在「活動列表」找喜歡的活動，按「立即報名」即可完成報名。",
  },
  {
    title: "3. 完成繳費",
    body: "在「我的票券」會看到匯款帳戶資訊，轉帳後按「我已完成匯款，通知確認」，主辦方核對後會標記為已繳費。",
  },
  {
    title: "4. 現場出示 QR Code 報到",
    body: "「我的票券」上每張票都有專屬 QR Code，活動當天給工作人員掃描即可完成報到。",
  },
  {
    title: "5. 活動後留下評價",
    body: "報到成功的活動，「我的票券」會出現「填寫活動評價」連結，給星級評分與心得回饋。",
  },
];

export function renderOnboarding(container) {
  const cards = STEPS.map(
    (s) => `
    <div class="bg-white rounded-xl shadow p-5">
      <h3 class="font-bold text-gray-800 mb-1">${s.title}</h3>
      <p class="text-sm text-gray-600">${s.body}</p>
    </div>`
  ).join("");

  container.innerHTML = `
    <div class="max-w-2xl mx-auto">
      <h1 class="text-2xl font-bold text-gray-800 my-4">新手教學</h1>
      <div class="space-y-4">${cards}</div>
      <div class="text-center mt-6">
        <a href="#/events" class="btn-primary inline-block">開始瀏覽活動</a>
      </div>
    </div>`;
}
