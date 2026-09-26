# 光農合作社群-活動報名系統

會員制活動報名、繳費追蹤、現場 QR Code 報到與活動評價系統。純靜態網頁（HTML/CSS/JS），部署在 GitHub Pages，後端與資料庫使用 Firebase 免費方案（Spark plan）。

## 功能

- **Google 登入 + 個資自動帶入**：使用 Firebase Authentication 的 Google 登入，登入後自動在 Firestore 建立會員資料，之後報名不需要重複填寫姓名、Email。
- **活動瀏覽與報名**：首頁列出所有活動，登入後可直接報名，系統會檢查名額上限並記錄繳費狀態（未繳費／已繳費）。
- **我的票券 + QR Code**：報名成功後在「我的票券」頁面看到專屬 QR Code（內含 Ticket ID 與安全驗證碼）。
- **現場報到掃描**：主辦方在「報到管理」頁面按「開啟相機開始掃描」才會啟動鏡頭（不是一進頁面就自動要求相機權限），用手機鏡頭掃描參加者的 QR Code，系統驗證後自動把該筆票券標記為已報到；掃描結果會用大字體、大圖示、有色框線顯示成功／失敗，方便在現場一眼看清楚。
- **主辦專區**：活動新增/編輯/刪除（含貼上海報圖片網址）、核對匯款、審核取消申請、會員總覽、行前通知都在這一頁。
- **活動詳細頁**：活動列表跟我的票券的活動名稱都是連結，點進去可以看到該活動的完整說明、海報、地點、費用與名額。
- **行前通知**：主辦方在「主辦專區」選一個活動、輸入通知內容，系統會列出目前有效報名者（不含已取消）的人數，按「產生郵件內容」會先在頁面上顯示可編輯的主旨與內文，確認沒問題後按「開啟 Gmail 並發送」會在新分頁開啟 Gmail 網頁版寫信視窗（用目前登入的 Gmail 帳號），收件人用密件副本帶入所有報名者，真正送出還是要在 Gmail 裡按一次送出。
- **活動標籤 + 標籤篩選**：新增/編輯活動時可以複選標籤，活動列表、詳細頁、主辦專區的活動管理都會用對應顏色的色塊顯示，方便一眼看出活動類型；活動列表上方也有標籤篩選按鈕（只列出目前真的有活動用到的標籤），可以只看某一類活動。
- **自訂活動標籤**：標籤存在 Firestore 的 `eventTags`，主辦專區的「活動標籤管理」可以自己新增、改名、換圖示（從內建圖示挑選，或直接輸入任何 emoji）和顏色、刪除。原本的 6 個標籤會在主辦方第一次開主辦專區時自動寫進去，沿用原本的 id，舊活動上的標籤不受影響。「換工活動」可以改名/換圖示，但不能刪除，因為換工點數與出席折扣券的計算都認它的 id（`labor-exchange`）。刪掉的標籤在舊活動上會直接不顯示。
- **評價與出席率**：活動報到後即可填寫星級評價與文字回饋；個人中心會顯示總報名次數、實際出席次數、取消次數與出席率。
- **新手教學**：第一次造訪網站會彈出引導視窗，帶去「新手教學」頁面說明整個使用流程（含如何取消、如何看活動詳情）。
- **依身分顯示導覽列**：「報到管理」「主辦專區」只有登入的主辦方帳號看得到，一般會員或未登入的訪客不會看到這兩個連結（實際權限仍然由 Firestore 規則把關，這裡只是避免介面雜訊）。
- **取消報名（需主辦方審核）**：報名成功後直接跳到「我的票券」引導完成繳費；還沒報到的票券可以在「我的票券」申請取消，取消前會顯示退款須知並依距離活動天數試算退款比例，送出後進入「審核中」，要主辦方在「主辦專區」核准才會真的取消、退還名額；駁回的話活動照常進行、不退費。
- **報名前問卷（選填）**：新增/編輯活動時可以填一個「報名前需要回答的問題」，有填的話會員按「立即報名」會先跳出視窗要求回答，答了才會真的送出報名；沒填就跟以前一樣直接報名，不影響其他活動。主辦專區的「報名問題回覆」可以選活動查看所有人的回覆。
- **最低開課人數（選填）**：新增/編輯活動時可以填「最低開課人數」。活動前 7 天是開課確認日（跟取消退費的 7 天門檻對齊，常數在 `js/courseStatus.js` 的 `COURSE_CONFIRM_DAYS_BEFORE`）：確認日前人數不足顯示「⏳ 招生中：還差 N 人成團」；一達到最低人數就顯示「✅ 確定開課」；過了確認日還不足就顯示「❌ 未達開課人數，本活動不開課」並關閉報名。狀態是用活動日期與目前報名人數即時算出來的，不另外存資料庫。未開課要退款給已報名的人，請主辦方自己留意活動管理列表上的狀態並處理退款。
- **手機版漢堡選單**：導覽列在手機寬度下會收成漢堡選單（右上角按鈕點開/收起），點任一連結會自動收起選單；桌機寬度維持原本橫向排列，不受影響。
- **FAQ／常見問題頁面**：`#/faq`，整理登入、繳費、取消、報到、評價等常見問題的問答，導覽列有「常見問題」連結。
- **投保個資（資料維護）**：活動需要幫參加者投保，點右上角自己的頭像/名稱會出現「資料維護」選項（`#/profile`），可以填寫並隨時修改真實姓名、身分證字號、出生年月日。這三個欄位沒填齊之前無法報名任何活動，報名按鈕會被 Firestore 規則擋下來並引導去補資料；主辦專區也能匯出某活動的投保名單（詳見下方「投保個資與投保名單」）。
- **換工點數**：活動標籤多一個「換工活動」，代表農務協助（拔草、澆水、種植等）。主辦專區可以針對某場換工活動「一鍵發放」點數給所有已報到的會員，不需要會員另外上傳照片，詳見下方「換工點數」一節。
- **出席折扣券**：一般活動（不含換工活動）累積出席滿一定次數，系統自動核發一張折扣券，下次報名付費活動自動套用、不能跟其他優惠併用，詳見下方「出席折扣券」一節。
- **自然風視覺主題**：整體改成木頭棕、葉綠、陽光暖黃、米白的自然色調，`css/style.css` 定義了 `.card`（米白底、淡木框、暖色陰影，取代原本純白卡片）、`.hero-banner`（活動列表頁頂部的綠到金漸層橫幅）、`.site-nav`（導覽列的深綠漸層 + 陽光色底邊線）等共用樣式，標題改用 Noto Serif TC 字型，各頁面標題加上對應的植物/陽光 emoji（🌾🎫🌳🪴🌻🌱等）。改配色/字型只要動 `css/style.css` 開頭的 CSS 變數即可。
- **即時通知主辦方**：會員送出繳費通知、申請取消，或免費活動報名成功時，會用 EmailJS 直接從瀏覽器發信到主辦方信箱，不用自己盯著主辦專區才會知道，詳見下方「即時通知主辦方（EmailJS）」一節。

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
js/notices.js             行前通知的郵件內容組裝（Gmail 網頁版寫信連結）
js/tags.js                活動標籤：從 Firestore 讀取/快取、新增/編輯/刪除、預設標籤、圖示與顏色選項
js/profile.js             投保個資（真實姓名/身分證字號/出生年月日）的讀取、驗證、更新
js/workPoints.js          換工點數的讀取、發放/扣點、歷史紀錄
js/discounts.js           出席折扣券的門檻計算、核發、讀取
js/notify.js              用 EmailJS 從瀏覽器直接發信通知主辦方（繳費/取消申請）
js/courseStatus.js        最低開課人數的開課狀態計算（招生中／確定開課／不開課）
js/views/*.js             各路由畫面：把 HTML 畫進傳入的容器、回傳 cleanup 函式
js/views/faq-view.js      常見問題頁面（純靜態問答內容）
js/views/profile-view.js  資料維護頁面（#/profile）
firestore.rules           Firestore 安全性規則
```

## Firestore 資料結構

| Collection | 欄位 |
| --- | --- |
| `users/{uid}` | uid, name, email, photoURL, totalEvents, attendedEvents, cancelledEvents, createdAt, realName（真實姓名，可省略表示未填）, nationalId（身分證字號，可省略表示未填）, birthDate（出生年月日字串 YYYY-MM-DD，可省略表示未填）, workPoints（換工點數餘額，number，可省略表示 0，只有主辦方能寫）, regularAttendedCount（number，可省略表示 0，只算「非換工活動」的出席次數，用來算折扣券門檻，只有主辦方能寫） |
| `events/{eventId}` | title, description, date (Timestamp), location, price (number), maxCap (number, 可省略表示不限), minCap（number，可省略，最低開課人數）, currentCount (number), posterUrl (string, 可省略), tags (string[], 值對應 `js/tags.js` 的 `EVENT_TAGS` id), registrationQuestion（string，可省略，報名前要回答的問題，沒填就不會跳出問答視窗） |
| `tickets/{ticketId}` | ticketId, userId, eventId, paymentStatus ("unpaid"/"pending"/"paid"), paymentNote, paymentSubmittedAt, isCheckedIn (bool), checkedInAt, isCancelled (bool), cancelledAt, refundPercent, cancelRequestStatus ("pending"/"approved"/null), cancelRequestedAt, cancelRefundPercent, securityCode, createdAt, workPointsAwarded（bool，可省略，這張票券是否已經因為某場換工活動被一鍵發放過點數，避免重複發放）, discountApplied（bool，可省略，這張票券報名當下是否套用了出席折扣券）, couponId（string，可省略，套用的那張折扣券 id）, registrationAnswer（string，可省略，報名當下對 registrationQuestion 的回覆） |
| `reviews/{reviewId}` | userId, eventId, rating (1-5), comment, createdAt |
| `eventTags/{tagId}` | label（標籤名稱）, icon（emoji）, color（`js/tags.js` 的 `TAG_COLORS` 之一，對應 `css/style.css` 的 `.badge-tag-*`）, order（排序用數字）。所有人可讀，只有主辦方能寫。 |
| `workPointTransactions/{txId}` | userId, points（number，正數＝發放、負數＝兌換扣點）, reason（string，說明文字）, eventId（可省略）, createdAt, createdBy（登記的主辦方 uid） |
| `discountCoupons/{couponId}` | userId, discountPercent（number，目前固定 5，代表 95 折）, status ("unused"/"used"), createdAt, createdBy（核發的主辦方 uid）, usedAt（可省略）, usedTicketId（可省略，用在哪張票券上） |
| `admins/{uid}` | 只要文件存在即代表該使用者是主辦方（可放任意欄位，例如 `{ addedAt: ... }`） |

## 繳費流程

`js/payment.js` 裡的 `BANK_INFO` 存放要顯示給報名者看的匯款帳戶（銀行、帳號、戶名），要換帳戶直接改這個常數即可。流程是：

1. 使用者在「我的票券」看到未繳費的票券時，會顯示匯款資訊、一個可填「匯款帳號後五碼」的欄位，以及「我已完成匯款，通知確認」按鈕。
2. 按下按鈕後，票券的 `paymentStatus` 會改成 `pending`（待確認），連同使用者填寫的後五碼一起存進 `paymentNote`。**不需要另外寄信**，主辦方直接在「主辦專區」的「待確認繳費」清單就會看到（含後五碼備註）。
3. 主辦方核對匯款紀錄後按「確認已收款」，票券才會變成 `paid`。

規則上刻意只允許本人把狀態改成 `pending`、不能直接改成 `paid`，避免有人謊報已繳費。

免費活動（`price` 是 0）例外：報名當下票券直接建立成 `paid`，不用走匯款通知這一段。Firestore 規則會用 `get()` 讀真正的活動價格做確認，不是只信任前端送來的資料，所以沒辦法對付費活動謊報自己免費/已繳費。

## 即時通知主辦方（EmailJS）

這個系統是純靜態網站 + Firebase 免費方案，沒有後端伺服器，沒辦法用「資料一有變動就自動觸發」這種標準做法（那需要 Cloud Functions，一樣得升級 Blaze 方案）。改用 [EmailJS](https://www.emailjs.com/) 直接從**會員自己的瀏覽器**發信到主辦方信箱，完全不需要自己的伺服器：

- `js/notify.js` 的 `notifyAdmin()` 是唯一的進入點，裡面寫死了 EmailJS 的 Service ID、Template ID、Public Key（Public Key 本來就是設計成可以放在前端的，不是密鑰，防濫用是靠 EmailJS 後台的用量額度）。
- 目前會在這兩個動作**送出成功之後**呼叫（`js/views/tickets-view.js`）：
  1. 會員按「我已完成匯款，通知確認」（付費活動的繳費通知）
  2. 會員送出「申請取消報名」
  3. 免費活動報名當下（`js/views/events-view.js`），因為免費活動報名等於直接完成繳費
  
  付費活動單純「報名但還沒繳費」不會發信，避免主辦方被還沒真的收到錢的報名洗版。
- 通知失敗（例如 EmailJS 額度用完、網路問題）只會在瀏覽器 console 留紀錄，**不會**擋住原本的操作——繳費通知、取消申請都已經先成功寫進 Firestore，通知本身晚到或沒寄到不影響資料正確性，這是刻意的設計（`notifyAdmin` 內部自己 try/catch，呼叫端也不用 `await` 它）。
- EmailJS 免費方案每月 200 封，以目前的規模（一個月一場、10~20 人）遠遠夠用。
- 如果要換收信信箱或改通知內容，去 EmailJS 後台改 Email Service／Template 即可，不用改程式碼；要新增別的觸發時機（例如新增活動時通知），在對應的操作成功之後呼叫 `notifyAdmin({...})` 就好。

## 投保個資與投保名單

活動要幫參加者辦理保險，需要真實姓名、身分證字號、出生年月日，這些跟 Google 帳號的顯示名稱/Email 是分開的兩組資料：

- **會員自己填寫、隨時可改**：點導覽列右上角自己的頭像或名稱會出現一個下拉選單，裡面有「資料維護」（`#/profile`），可以填寫或修改這三個欄位。存進 `users/{uid}` 的 `realName`／`nationalId`／`birthDate` 三個欄位，Firestore 規則只允許本人或主辦方讀寫，跟其他人的個資完全隔開。
- **報名前強制檢查**：這三個欄位沒有全部填過的話，「活動列表」上方會出現提示、引導去補資料；就算跳過提示硬按報名鍵，`js/events.js` 的 `registerForEvent` 跟 `firestore.rules` 的 `hasCompleteProfile()` 也會在最後一關擋下來（前端擋一次、規則再擋一次，前端只是體驗好一點，真正的把關在規則那邊）。
- **身分證字號格式檢查**：`js/profile.js` 的 `TAIWAN_ID_REGEX` 只檢查台灣身分證字號的格式（1 個大寫英文字母 + 9 碼數字），不做驗證碼演算法檢查。
- **主辦方匯出投保名單**：「主辦專區」的「投保名單」區塊，選一個活動、按「產生投保名單」，會列出該活動目前還算數的報名者（不含已取消）的姓名/身分證字號/出生年月日/Email，供辦理保險使用；這個功能上線前就報名、還沒補資料的舊會員會顯示「（尚未填寫）」，方便主辦方知道要另外提醒誰。
- **會員總覽多一個欄位**：「會員總覽」表格新增「投保資料」欄，用 ✓/✗ 表示該會員是否已經填齊三個欄位，不會直接顯示身分證字號本身，避免在日常瀏覽時不必要地曝光敏感個資。

⚠️ 身分證字號、出生年月日都是高度敏感個資，「投保名單」產生的內容只在需要投保時使用，用完（複製給保險公司、或下載存檔辦完保險）之後盡快清掉瀏覽器裡的內容，不要不必要地截圖、外流或長期留存在其他地方。

## 換工點數

光農合作社群的換工制度：會員來農場協助拔草、澆水、種植等農務，完成後累積點數，將來可以折抵課程費用或兌換農產品。設計上刻意不做「會員自己上傳照片」，因為 Firebase 新專案的 Cloud Storage 需要升級 Blaze 付費方案才能用；改成完全借用系統本來就有的 QR 報到機制來判斷「誰有來、誰做完了」，主辦方自己在現場拍照留存即可（不需要上傳到這個系統），流程更簡單也不用花錢：

1. **標記換工活動**：新增/編輯活動時勾選「換工活動」標籤，活動列表、詳情頁、票券卡片都會用對應色塊標示，會員在活動詳情頁跟票券上會看到說明：「當天出席並完成工作，主辦方確認 OK 後會直接登記點數，不需要上傳照片」。
2. **活動當天**：跟一般活動一樣用 QR Code 報到；主辦方想留存記錄的話，自己拍照存到自己的手機/相簿即可，跟系統無關、不用另外上傳。
3. **一鍵發放點數**：活動結束、確認大家工作都有做完後，主辦方到「主辦專區」的「換工點數」區塊，最上面「一鍵發放」：選這場活動、輸入每人要發放的點數與說明，按「一鍵發放給已報到會員」，系統會自動找出這場活動所有「已報到、未取消」的會員，一次性各發一筆點數。畫面上會先顯示這場活動目前已報到人數，方便發放前確認人數對不對。
4. **防止重複發放**：每張票券發過點數後會標記 `workPointsAwarded`，同一場活動就算不小心按第二次「一鍵發放」，已經發過的人也不會被重複加點，畫面會顯示「已發放 X 人、Y 人先前已發過、這次略過」。
5. **個別調整/兌換扣點**：如果某個人的換工表現想給不同點數、有人事後才補報到、或是會員要用點數兌換課程/農產品，在「換工點數」區塊下方的「個別調整 / 兌換扣點」表單處理：選會員、（選填）選相關活動、輸入點數（發放正數、扣點負數）與說明即可，不受一鍵發放的限制。
6. **點數與紀錄**：不管是一鍵發放還是個別調整，每一筆異動都存成 `workPointTransactions` 的一筆不可修改紀錄，`users/{uid}.workPoints` 是這些紀錄加總出來的目前餘額（用 Firestore `increment` 保證兩者不會對不起來）。會員在「我的票券」上方會看到目前點數餘額，點開「換工點數紀錄」可以看到每一筆的說明與時間；主辦專區選會員時也能看到同一份紀錄。
7. **權限**：`workPoints` 沒有列在會員自己能更新的欄位清單裡，一般會員完全無法自己改點數，只有主辦方（`isAdmin()`）能寫；`workPointTransactions` 也只有主辦方能新增，一般人只能讀自己的那幾筆，而且規則禁止修改/刪除既有紀錄——要更正的話用再登記一筆補償紀錄，保留完整歷史軌跡。

如果之後真的想做「照片佐證＋依個人表現分級給點」，可以考慮升級 Blaze 方案啟用 Cloud Storage（以每月一場、10~20 人上傳手機照片的規模估算，實際費用預期是 NT$0，因為用量遠低於免費額度，但需要先綁信用卡並承擔意外爆量的風險，建議另外設定 Firebase 的 Budget Alert）；目前先用「報到即可一鍵發放」這個不用花錢、也更省事的作法。

## 出席折扣券

跟換工點數分開的另一套獎勵：鼓勵會員持續參加一般活動（工作坊等），不牽涉「拿勞力換點數」的性質，所以特意不跟換工點數混在一起算，避免點數意義混淆、也避免發太快稀釋掉折扣的價值。

- **門檻與折扣**：`js/discounts.js` 定義 `ATTENDANCE_THRESHOLD = 5`（次）、`DISCOUNT_PERCENT = 5`（折抵 5%，也就是 95 折），要調整這兩個數字改這裡就好。一般活動（`tags` 不含 `labor-exchange`）每累積出席滿 5 次就核發一張券，之後每再滿 5 次（10、15...）再核發一張，用循環制。
- **只算「一般活動」的出席**：`js/checkin.js` 報到時，會檢查該活動有沒有「換工活動」標籤，只有沒有的才會把 `users/{uid}.regularAttendedCount` +1（換工活動照樣會讓原本的 `attendedEvents` 總數 +1，但不算進折扣券的門檻，因為那類活動已經有換工點數）。
- **主辦方核發**：「主辦專區」的「出席折扣券」區塊會自動列出「目前有幾張還沒發」的會員名單（用 `regularAttendedCount / 5` 減掉已經發過的張數算出來），按「核發折扣券給以上名單」一次全部發出去，不用一個一個手動選會員。
- **自動套用，不用會員操作**：會員報名付費活動時，`registerForEvent` 會自動檢查名下有沒有「未使用」的折扣券，有的話直接套用 95 折、把票券標記 `discountApplied: true` 並把那張券標記為已使用；免費活動不會消耗掉券（折扣沒有意義）。折扣是自動套用、不是會員可以選擇要不要用的選項，這樣不用另外做一個「使用折扣券」的介面。
- **顯示**：「活動列表」跟「我的票券」都會顯示目前有幾張可用的折扣券；套用折扣後的票券在「應繳金額」會直接顯示折扣後的金額，主辦方在「主辦專區」的「待確認繳費」清單也會看到「已套用出席折扣券，原價 NT$xxx」的備註，避免核對金額時搞錯。
- **權限**：折扣的百分比是固定寫在前端常數裡、不是存在票券上可以被竄改的欄位；`tickets` 的建立/重新報名規則會用 `get()` 確認 `couponId` 指到的那張券真的是本人名下、狀態還是「未使用」，不能亂填一個 couponId 就折抵。`discountCoupons` 只有主辦方能核發，會員只能把自己「未使用」的那張改成「已使用」（報名時系統自動做），其餘異動只有主辦方能做。

## 活動海報圖片

Firebase 現在新專案的 Cloud Storage 預設要升級 Blaze（付費）方案才能啟用，所以海報圖片不是直接在網站上傳檔案，而是主辦方把圖片交給 Claude，由 Claude 直接把檔案存進這個 repo 的 `assets/posters/` 資料夾（commit + push），再把產生的 GitHub Pages 網址回報給主辦方，貼到「主辦專區」新增/編輯活動表單的「活動海報圖片網址」欄位。這是**目前固定的作業流程**：主辦方之後有新的活動海報，一律直接傳圖片檔案，不用自己找地方上傳、也不要用 Google 相簿分享連結（那是網頁連結，不是圖片檔案，`<img>` 標籤打不開）。

`posterUrl` 存成 `events/{eventId}.posterUrl`，就是一般字串欄位，不涉及任何額外的 Firebase 服務或安全規則，活動列表跟活動詳細頁都會顯示這張圖。

## 活動新增的固定作業流程（Claude 代寫）

主辦方目前不透過主辦專區的表單自己新增活動，而是請 Claude 直接寫進 Firestore：

1. **Claude 專用帳號**：Firebase Authentication 啟用了 Email/Password 登入方式，有一個專用帳號（`claude-agent@lumifarm-event-checkin.firebaseapp.com`）被加進 `admins` collection。Claude 用這個帳號登入取得 ID Token，再用 Firestore REST API（帶 `Authorization: Bearer <idToken>`）直接呼叫，跟一般 admin 帳號透過網站操作走的是同一套 `firestore.rules`，完全不需要暫時放寬任何規則。
2. **兩種來源**：
   - 主辦方直接把活動資訊（標題、說明、地點、日期時間、費用、名額上限、標籤）跟海報圖片交給 Claude。
   - 主辦方只給日期或時間區間，Claude 用已連接的 Google 行事曆去查（`青諮委`、`主聯合作社相關活動`等 calendar 都在存取範圍內），找到符合的活動後用行事曆上的標題、時間、地點直接建立。
3. 建立完成後 Claude 會回報活動內容給主辦方確認，缺少的欄位（例如費用、標籤）會先用預設值（通常是免費、不限名額、不選標籤）並在回報時特別標註，主辦方確認錯誤的話再請 Claude 修改。

## 取消與退款政策

取消是「申請 → 主辦方審核」兩階段，不是使用者按了就直接生效：

1. 使用者在「我的票券」按「申請取消報名」，系統依當下距離活動的天數算出退款比例，寫入 `cancelRequestStatus: 'pending'`、`cancelRequestedAt`、`cancelRefundPercent`。這個階段活動照常進行、名額沒有釋出、也還沒退費，票券顯示「取消審核中」。
2. 主辦方在「主辦專區」的「取消申請」看到這筆，可以「核准取消」或「駁回申請」：
   - **核准**：票券標記 `isCancelled: true`、`cancelledAt`、`refundPercent`（用申請當下算好的 `cancelRefundPercent`，不會因為主辦方拖延審核而變少），該活動 `currentCount` -1 讓名額釋出給別人，該使用者的 `cancelledEvents` +1。
   - **駁回**：把 `cancelRequestStatus` 等欄位清空，票券恢復正常，使用者之後可以再重新申請。
3. 票券 ID 是固定的「活動ID_使用者ID」，真正取消後不會刪除文件；同一個人要重新報名同一場已取消的活動，系統會把這份文件整個重置成剛報名的狀態。已經報到（`isCheckedIn: true`）的票券不能申請取消。

退款比例（`js/events.js` 的 `calcRefundPercent`，只有這裡一份，其他地方不要重複寫判斷）：

- 距離活動開始 ≥ 7 天：全額退款（另外扣除轉帳手續費）
- 距離活動開始 3～6 天：退款 50%
- 距離活動開始 < 3 天：不退款

實際退款一樣是主辦方手動轉帳處理（系統不會自動退款），只是先幫忙算好比例、留下紀錄。

## 主辦專區的會員總覽

「主辦專區」的「會員總覽」會列出所有會員的姓名、Email、報名次數、出席次數、取消次數與出席率（`js/tickets.js` 的 `listAllUsers`），作為活動成效與會員經營的參考依據。

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
- 報名（`tickets` 的 create，以及取消後重新報名的 update 分支）都會用 `hasCompleteProfile()` 讀本人 `users/{uid}` 的 `realName`／`nationalId`／`birthDate`，沒填齊就擋下來，前端沒攔到的話規則這邊會是最後一關。
- `users/{uid}.workPoints`（換工點數餘額）不在會員自己能更新的欄位清單裡，只有主辦方能改；`workPointTransactions` 只有主辦方能新增、任何人都不能修改或刪除既有紀錄，確保點數異動有完整、不可竄改的歷史軌跡。
- 折扣券套用用 `usesValidUnusedCoupon()` 讀真正的 `discountCoupons` 文件確認 `userId` 跟 `status` 都對得上，不能只信任前端送來的 `discountApplied`；`discountCoupons` 本身只有主辦方能建立，會員只能把自己名下「未使用」的那張改成「已使用」（且只能改 `status`／`usedAt`／`usedTicketId` 這三個欄位），其餘一律只有主辦方能動。

## 可能的後續擴充（非本版本範圍）

- 串接金流（例如綠界、藍新）自動更新 `paymentStatus`，目前為手動標記。
- 用 Cloud Functions 寄送報名成功/提醒 Email（Firestore 免費方案已足夠目前需求，Functions 需要升級到 Blaze 方案）。
