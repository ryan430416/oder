# 校園線上點餐平台

手機優先的多店家校園點餐平台，提供繁體中文、泰文、緬甸文與英文介面，並包含顧客、店家及管理員三種角色。

## 系統架構

- PocketBase Auth：顧客訪客帳號、店家帳號、管理員帳號（collection 為 `oder_users`，不用學校共用的 `users`）
- PocketBase collections + API rules：店家、商品、訂單、通知與角色權限
- PocketBase files：商品圖片（存在 `products.image`）
- PocketBase Realtime：顧客與店家的訂單狀態同步
- 可信後端：Vercel `/api/app/*`（正式環境）或 PocketBase `pb_hooks`（本機）。前端不帶 Superuser token，也不信任自己算的金額
- Vercel：靜態前端、`/api/config`、以及訂單／訪客登入等受保護 API
- sessionStorage：PocketBase 登入 token；localStorage：僅購物車與介面語言

PocketBase **不能**跑在 Vercel 上。前端可以繼續部署到 Vercel，後端要另開一台可持久儲存的 PocketBase。

本機操作說明見 [`pocketbase/README.md`](pocketbase/README.md)。

## 全新 PocketBase

資料庫重來，不搬舊 Supabase 資料。

```bash
npm run pb:download
npm run pb:serve
```

第一次打開 http://127.0.0.1:8090/_/ 時，建立 **PocketBase 後台超級管理員**（和點餐系統的 `admin` 不是同一組）。

`pb_migrations` 會自動建立 collections，並建立測試管理員 `admin` / `1234`（內部 email 為 `admin@campus-order.test`）。

## 環境變數

複製 [`.env.example`](.env.example)：

```env
POCKETBASE_URL=https://db.keson.pro
APP_ENV=development
SHOW_TEST_ACCOUNT=true
```

`POCKETBASE_ADMIN_EMAIL` / `POCKETBASE_ADMIN_PASSWORD` 只給伺服器 API 與 `npm run pb:setup-school` 使用，**不要寫進前端，也不要設成 Vercel Browser / 公開環境變數**。

### Vercel

Production 與 Preview 都要設定：

```env
POCKETBASE_URL=https://db.keson.pro
APP_ENV=production
SHOW_TEST_ACCOUNT=false
POCKETBASE_ADMIN_EMAIL=<PocketBase Superuser email>
POCKETBASE_ADMIN_PASSWORD=<PocketBase Superuser password>
```

刪除舊的 `SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`。

`SHOW_TEST_ACCOUNT=true` 才會顯示 `admin` / `1234` 提示。`APP_ENV=production` 時 `pb:setup-school` 會停用該弱密碼帳號。

`vercel.json` CSP 只允許 `https://db.keson.pro` 與本機 PocketBase，沒有 `connect-src *` / `img-src *`。

### 本機

先啟動 PocketBase，再啟動前端：

```bash
npm run pb:serve
npx vercel dev
```

若只用 Python 靜態伺服器，複製 `js/config.local.example.js` 為 `js/config.local.js`。訪客登入與下單仍需要 PocketBase `pb_hooks`，或改用 `npx vercel dev` 走 `/api/app/*`。

## 測試管理員

production 不會用 seed 腳本建立弱密碼。本機第一次 `pb:serve` 就會建立：

- 帳號：`admin`
- 密碼：`1234`

`SHOW_TEST_ACCOUNT=false` 時不顯示提示。正式環境請立刻改密或刪除該帳號。

若要重設這組帳號：

```bash
POCKETBASE_ADMIN_EMAIL=you@example.com POCKETBASE_ADMIN_PASSWORD=your-superuser-password npm run seed:test-admin
```

## 商品圖片規則

- 沒有上傳圖片時，前端顯示專案靜態預設圖 `images/default-meal.svg`，不寫入資料庫或 localStorage。
- 圖片只保存於 PocketBase `products.image` file 欄位。
- 前端顯示時才組成檔案 URL，不另外把 Base64 寫進資料庫。
- 禁止將 Base64、Data URL 或 Blob 字串寫入 products 或 localStorage。
- 前端檢查實際檔案簽章，只接受 JPEG、PNG、WebP，原始檔最大 8MB。
- 圖片依 EXIF 方向解碼，最長邊縮至 1600px，轉為約 0.8 品質 WebP，輸出必須小於 1MB。
- 新增商品時先建立資料列取得 `product_id`，再上傳圖片。
- API rules：店家只能改自己店的商品，管理員可管理全部，訪客不可寫入。
- 商品建立失敗會刪除該資料列（圖片一併刪除）；更換圖片時 PocketBase 會取代舊檔。

## 訂單安全

`/api/app/create-order`（Vercel 或 PocketBase hook）在同一個流程：

- 驗證 Auth、店家狀態、取餐時段、商品店家、商品狀態與 1～99 數量
- 從 products 重新取得價格並計算 subtotal/total
- 使用 `(customer, idempotency_key)` 唯一限制防止重複訂單
- 建立訂單、明細與店家通知

狀態只能依序：

`pending → accepted → preparing → ready → completed`

`pending` 可拒絕；顧客只能取消自己的 pending 訂單。所有讀寫同時受 collection rules 與 hooks 驗證。

## 測試

需要 Node.js 20 以上：

```bash
npm install
npm test
```

Playwright 端對端測試需先準備獨立測試 PocketBase 與前端環境：

```bash
npx playwright install chromium
E2E_BASE_URL=https://your-test-site.vercel.app npm run test:e2e
```

E2E 會在桌面及 360px 手機執行完整流程：管理員建立店家、店家上傳商品、顧客下單、店家接單、顧客即時看到狀態。

## 取餐時段

顧客端使用**全校統一**取餐時段，畫面只顯示時間、不顯示日期：

- 08:35–08:45、09:30–09:40、10:25–10:35
- 11:20–11:30、12:15–13:00
- 17:15–17:30、18:15–18:25

每個時段顯示為完整區間（例如 `08:35–08:45`），不是每 5 分鐘一個選項。可全天預訂，取餐為各時段的下一次出現（當天仍可預約則為當天，否則為隔天），但介面不標示今天／明天。

`stores.service_periods` 是 **legacy** 欄位：管理員介面不再提供早餐／午餐／下午茶複選，也不再依個別店家切換時段。新增店家時仍會寫入既有欄位以相容資料庫，舊資料不會刪除。

## 正式佈署

1. 把 PocketBase 放到有持久硬碟的主機，或使用學校的 `https://db.keson.pro`。
2. 執行 `npm run pb:setup-school` 建立點餐 collections（不會刪其他表）。
3. 本機可另放 `pocketbase/pb_hooks`；正式站以 Vercel `/api/app/*` 為可信後端。
4. Vercel 設定 `POCKETBASE_URL` 與 **僅伺服器端** 的 Superuser 帳密。
5. 兩台電腦 `git pull` 後都會打同一台 PocketBase。

舊的 [`supabase/`](supabase/) 資料夾只留歷史，不要再執行裡面的 SQL，任何頁面也不會載入它。
