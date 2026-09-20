# 光農合作社群-活動報名系統

會員制活動報名、繳費追蹤、現場 QR Code 報到與活動評價系統。純靜態網頁（HTML/CSS/JS），部署在 GitHub Pages，後端與資料庫使用 Firebase 免費方案（Spark plan）。

## 功能

- **Google 登入 + 個資自動帶入**：使用 Firebase Authentication 的 Google 登入，登入後自動在 Firestore 建立會員資料，之後報名不需要重複填寫姓名、Email。
- **活動瀏覽與報名**：首頁列出所有活動，登入後可直接報名，系統會檢查名額上限並記錄繳費狀態（未繳費／已繳費）。
- **我的票券 + QR Code**：報名成功後在「我的票券」頁面看到專屬 QR Code（內含 Ticket ID 與安全驗證碼）。
- **現場報到掃描**：主辦方在「報到管理」頁面用手機鏡頭掃描參加者的 QR Code，系統驗證後自動把該筆票券標記為已報到。
- **主辦專區**：主辦方核對匯款後，在「主辦專區」把待確認的繳費標記為已繳費。
- **評價與出席率**：活動報到後即可填寫星級評價與文字回饋；個人中心會顯示總報名次數、實際出席次數與出席率。
- **新手教學**：第一次造訪網站會彈出引導視窗，帶去「新手教學」頁面說明整個使用流程。
- **取消報名**：報名成功後直接跳到「我的票券」引導完成繳費；還沒報到的票券可以在「我的票券」申請取消，取消前會顯示退款須知，依距離活動天數計算退款比例。

## 架構

整個網站是單頁應用（SPA）：只有 `index.html` 一個真正的頁面，導覽列只渲染一次，切換「活動列表 / 我的票券 / 報到管理 / 主辦專區 / 新手教學」時只是用網址 hash（例如 `#/tickets`）換掉 `<main id="app">` 裡面的內容，不會整頁重新載入、導覽列也不會閃爍或重畫。`my-tickets.html`、`checkin.html`、`admin.html`、`review.html` 還留著，但只是轉址到對應的 hash 路由，讓舊的書籤或分享連結不會失效。

## 檔案結構

```
index.html                首頁殼層：導覽列 + <main id="app">，實際內容由 JS 路由填入
assets/logo.webp          導覽列的 logo 圖檔
css/style.css             補充樣式
js/app.js                 進入點：初始化導覽列、註冊路由、首次造訪彈跳視窗
js/router.js              極簡 hash 路由器，切換路由前會呼叫上個畫面的 cleanup
js/firebase-config.js     Firebase 初始化設定（需要換成你自己的專案設定）
js/auth.js                Google 登入/登出、自動建立會員資料
js/nav.js                 共用導覽列邏輯（只在 app.js 執行一次）
js/events.js              活動列表、報名邏輯（Firestore transaction）
js/tickets.js             我的票券、QR Code 產生、出席率計算
js/checkin.js             報到掃描驗證與更新邏輯
js/payment.js             匯款資訊、繳費通知、主辦方確認收款
js/reviews.js             送出活動評價
js/views/*.js             各路由畫面：把 HTML 畫進傳入的容器、回傳 cleanup 函式
firestore.rules           Firestore 安全性規則
```

## Firestore 資料結構

| Collection | 欄位 |
| --- | --- |
| `users/{uid}` | uid, name, email, photoURL, totalEvents, attendedEvents, createdAt |
| `events/{eventId}` | title, description, date (Timestamp), location, price (number), maxCap (number, 可省略表示不限), currentCount (number) |
| `tickets/{ticketId}` | ticketId, userId, eventId, paymentStatus ("unpaid"/"pending"/"paid"), paymentNote, paymentSubmittedAt, isCheckedIn (bool), checkedInAt, isCancelled (bool), cancelledAt, refundPercent, securityCode, createdAt |
| `reviews/{reviewId}` | userId, eventId, rating (1-5), comment, createdAt |
| `admins/{uid}` | 只要文件存在即代表該使用者是主辦方（可放任意欄位，例如 `{ addedAt: ... }`） |

## 繳費流程

`js/payment.js` 裡的 `BANK_INFO` 存放要顯示給報名者看的匯款帳戶（銀行、帳號、戶名），要換帳戶直接改這個常數即可。流程是：

1. 使用者在「我的票券」看到未繳費的票券時，會顯示匯款資訊與「我已完成匯款，通知確認」按鈕。
2. 按下按鈕後，票券的 `paymentStatus` 會改成 `pending`（待確認），同時開啟使用者自己信箱軟體的寄信視窗（`mailto:` 連結），預填收件人 `info@lumifarm.org`、活動與金額資訊，使用者按送出後主辦方就會收到通知信。
3. 主辦方在「報到管理」頁面下方會看到「待確認繳費」清單，核對匯款紀錄後按「確認已收款」，票券才會變成 `paid`。

規則上刻意只允許本人把狀態改成 `pending`、不能直接改成 `paid`，避免有人謊報已繳費。

## 取消與退款政策

票券 ID 是固定的「活動ID_使用者ID」，取消不會刪除文件，只會標記 `isCancelled: true` 並記錄 `cancelledAt`、`refundPercent`，同時把該活動的 `currentCount` -1 讓名額釋出；之後同一個人要重新報名同一場活動，系統會把這份文件重置成剛報名的狀態。已經報到（`isCheckedIn: true`）的票券不能取消。

退款比例（`js/events.js` 的 `calcRefundPercent`，只有這裡一份，其他地方不要重複寫判斷）：

- 距離活動開始 ≥ 7 天：全額退款（另外扣除轉帳手續費）
- 距離活動開始 3～6 天：退款 50%
- 距離活動開始 < 3 天：不退款

實際退款一樣是主辦方手動轉帳處理（系統不會自動退款），只是先幫忙算好比例、留下紀錄。

## Firebase 後台設定步驟

1. **建立 Firebase 專案**
   前往 [Firebase Console](https://console.firebase.google.com/) → 新增專案 → 依指示完成建立（免費 Spark 方案即可）。

2. **啟用 Google 登入**
   左側選單 → Build → Authentication → 「開始使用」→ Sign-in method 分頁 → 啟用「Google」→ 設定支援電子郵件 → 儲存。

3. **設定已授權網域**
   Authentication → Settings → Authorized domains → 新增你的 GitHub Pages 網域，例如 `lumifarm.github.io`（`localhost` 預設已存在，本機測試不用額外加）。

4. **建立 Firestore Database**
   左側選單 → Build → Firestore Database → Create database → 選擇正式模式（Production mode）→ 選擇離使用者最近的區域（例如 `asia-east1`）。

5. **貼上安全性規則**
   Firestore Database → Rules 分頁 → 把本專案 `firestore.rules` 的內容整份貼上 → Publish。

6. **設定主辦方帳號（admins collection）**
   用你自己的 Google 帳號登入網站一次，讓 `users` collection 產生你的 uid（在 Authentication → Users 分頁可以查到 uid）。接著到 Firestore Database → Start collection → Collection ID 填 `admins` → 文件 ID 貼上你的 uid → 隨意加一個欄位（例如 `role: "organizer"`）→ 儲存。這個帳號之後就能使用「報到管理」與「主辦專區」頁面。

7. **建立活動**
   在 Firestore Database 新增 collection `events`，每個文件代表一個活動，欄位請依照上面的資料結構表建立，`date` 記得選 Timestamp 型別，`currentCount` 初始值填 `0`。

8. **取得網頁的 Firebase 設定**
   專案設定（齒輪圖示）→ 一般 → 往下捲到「你的應用程式」→ 新增網頁應用程式（`</>` 圖示）→ 複製 `firebaseConfig` 物件 → 貼到 `js/firebase-config.js` 取代裡面的 `YOUR_...` 佔位字串。

## 本機測試

因為使用了 ES Modules 和 Google 登入彈跳視窗，**不能**直接用 `file://` 開啟 HTML，需要用本機伺服器，例如：

```bash
npx serve .
# 或使用 VS Code 的 Live Server 套件
```

## 部署到 GitHub Pages

1. 把程式碼推到這個 repository 的 `main` 分支。
2. GitHub 上的 Settings → Pages → Build and deployment → Source 選「Deploy from a branch」→ Branch 選 `main` / `(root)` → Save。
3. 部署完成後網址通常會是 `https://<你的帳號>.github.io/<repo名稱>/`，記得依照上面步驟 3 把這個網域加進 Firebase 的已授權網域清單，Google 登入才會成功。

## 安全性規則重點

- 每個人只能讀寫自己的個資與票券；`paymentStatus` 可由本人更新（例如標記自己已完成轉帳），但報到狀態 `isCheckedIn` 只有 `admins` 名單內的帳號能改。
- `admins` collection 完全禁止透過前端寫入，只能在 Firebase Console 手動新增，避免使用者自行把自己加進主辦方名單。
- QR Code 內容包含 `ticketId` 與隨機產生的 `securityCode`，報到掃描時會比對 Firestore 內存的驗證碼，避免有人自行編造 QR Code 內容混入報到。

## 可能的後續擴充（非本版本範圍）

- 串接金流（例如綠界、藍新）自動更新 `paymentStatus`，目前為手動標記。
- 用 Cloud Functions 寄送報名成功/提醒 Email（Firestore 免費方案已足夠目前需求，Functions 需要升級到 Blaze 方案）。
