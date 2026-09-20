const STEPS = [
  {
    title: "1. 使用 Google 帳號登入",
    body: "點右上角「使用 Google 登入」，之後報名不用重複填寫姓名、Email。",
  },
  {
    title: "2. 先補齊真實資料（第一次報名前）",
    body: "活動需要幫參加者投保，第一次報名前請先點右上角自己的頭像/名稱，選「資料維護」，填寫真實姓名、身分證字號、出生年月日；之後想修改也是回到這裡，沒填齊的話會沒辦法報名。",
  },
  {
    title: "3. 瀏覽活動並報名",
    body: "在「活動列表」找喜歡的活動，點活動名稱可以看完整說明、海報跟地點，按「立即報名」即可完成報名；也可以用列表上方的標籤篩選只看某一類活動。",
  },
  {
    title: "4. 完成繳費",
    body: "在「我的票券」會看到匯款帳戶資訊，轉帳後填入匯款帳號後五碼並按「我已完成匯款，通知確認」，主辦方會在主辦專區核對後標記為已繳費，不用另外寄信。免費活動不用這一步，報名後直接顯示已繳費。",
  },
  {
    title: "5. 臨時不能參加可以申請取消",
    body: "在「我的票券」對還沒報到的票券按「申請取消報名」，系統會先告訴你依現在時間可以退多少錢，送出後要等主辦方審核通過才算真的取消，審核前活動仍照常進行。",
  },
  {
    title: "6. 現場出示 QR Code 報到",
    body: "「我的票券」上每張票都有專屬 QR Code，活動當天給工作人員掃描即可完成報到。",
  },
  {
    title: "7. 活動後留下評價",
    body: "報到成功的活動，「我的票券」會出現「填寫活動評價」連結，給星級評分與心得回饋。",
  },
  {
    title: "8. 換工活動可以累積點數",
    body: "標籤是「換工活動」的場次（拔草、澆水、種植等農務協助），當天出席並用 QR Code 報到，主辦方確認工作完成 OK 後會直接登記換工點數到你的帳號，不需要另外上傳照片，「我的票券」上方會顯示目前點數與紀錄；點數之後可以折抵課程費用或兌換農產品，請直接聯絡主辦方兌換。",
  },
  {
    title: "9. 出席滿 5 次自動獲得折扣券",
    body: "一般活動（不含換工活動）累積出席滿 5 次，系統會自動核發一張 95 折優惠券，「我的票券」上方會顯示目前有幾張可用。下次報名付費活動時會自動套用、用掉就沒了，不用自己操作，也不能跟其他優惠併用。",
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
