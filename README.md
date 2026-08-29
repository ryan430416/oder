# 校園線上點餐平台

手機優先的多店家校園點餐平台，提供繁體中文、泰文、緬甸文與英文介面，並包含顧客、店家及管理員三種角色。

## 系統架構

- Supabase Auth：顧客匿名 Auth、店家帳號、管理員帳號
- Supabase Database + RLS：店家、商品、訂單、通知與角色權限
- Supabase Storage：商品圖片
- Supabase Realtime：顧客與店家的訂單狀態同步
- Vercel Functions：只在伺服器端使用 service role 建立店家帳號及重設密碼
- localStorage：僅保存購物車與介面語言，不保存帳密、Session 或圖片

## 全新 Supabase 專案

在 Supabase SQL Editor 執行 [`supabase/schema.sql`](supabase/schema.sql)。

既有測試專案從舊版升級時：

1. 先備份資料庫。
2. 執行 `supabase/migrations/008_archive_legacy_backend.sql`。
3. 立即執行 `supabase/schema.sql`。

`008` 會將舊表重新命名為 `legacy_*_v1`，不會刪除原始資料；新 Auth 架構使用新的 UUID 資料表。舊帳號不能直接轉成 Supabase Auth，必須重新建立。

### Auth 設定

在 Supabase Dashboard → Authentication：

1. 啟用 Email 登入。
2. 啟用 Anonymous Sign-ins，供沒有帳密的顧客取得受 RLS 保護的身分。
3. Site URL 設成實際 Vercel 網址。
4. 測試環境若必須使用 `admin / 1234`，暫時將最短密碼設為 4；production 必須恢復至少 8 碼並停用該帳號。
5. JWT expiry 建議設為 `86400` 秒；前端偵測過期後會導回登入頁。

## 環境變數

複製 [`.env.example`](.env.example)：

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
APP_ENV=development
SHOW_TEST_ACCOUNT=true
```

`SUPABASE_SERVICE_ROLE_KEY` 只允許放在本機命令列、CI Secret 或 Vercel Server Environment Variables。它不會由 `/api/config` 傳給瀏覽器，也不得寫進任何前端檔案。

### Vercel

在 Project Settings → Environment Variables 設定上述變數。Production 建議：

```env
APP_ENV=production
SHOW_TEST_ACCOUNT=false
```

`vercel.json` 已設定 CSP、`frame-ancestors 'none'`、`X-Content-Type-Options`、Referrer Policy，並允許 Supabase API、Realtime、Storage 與 jsDelivr。

### 本機

推薦使用 Vercel CLI，讓 `/api/config` 與管理員 API 正常運作：

```bash
npx vercel dev
```

若只用 Python 靜態伺服器，複製 `js/config.local.example.js` 為 `js/config.local.js` 並填入 URL/anon key；管理員建立店家帳號功能仍需要 Vercel Functions。

## 測試管理員

production migration 不會建立弱密碼。只在 development/testing 執行：

```bash
npm run seed:test-admin
```

執行時必須由環境變數提供 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` 與 `APP_ENV=development`。腳本在 `APP_ENV=production` 時會直接拒絕執行。

預設測試登入：

- 帳號：`admin`
- 密碼：`1234`

前端會轉成內部測試 Email `admin@campus-order.test`。`SHOW_TEST_ACCOUNT=false` 時不顯示提示。

## 商品圖片規則

- 沒有上傳圖片時，前端顯示專案靜態預設圖 `images/default-meal.svg`，不寫入資料庫或 localStorage。
- 圖片只保存於私有 `product-images` bucket。
- 資料庫只保存 `image_path`；短效 signed URL 只在執行時產生，不寫入資料庫。
- 禁止將 Base64、Data URL 或 Blob 字串寫入 products 或 localStorage。
- 前端檢查實際檔案簽章，只接受 JPEG、PNG、WebP，原始檔最大 8MB。
- 圖片依 EXIF 方向解碼，最長邊縮至 1600px，轉為約 0.8 品質 WebP，輸出必須小於 1MB。
- 路徑固定為 `store_id/product_id/uuid.webp`。新增商品時先建立資料列取得 `product_id`，再上傳圖片並回寫 `image_path`。
- Storage policy 限制店家只能寫入自己的 store_id 資料夾，管理員可管理全部，匿名使用者不可寫入。
- 既有專案請在 SQL Editor 執行 [`supabase/migrations/011_product_image_storage.sql`](supabase/migrations/011_product_image_storage.sql)（可重複執行）。
- 商品建立失敗會刪除暫存圖片；更換或永久刪除商品時會清理舊圖片。

## 訂單安全

`create_order` RPC 在同一個資料庫 transaction：

- 驗證 Auth、店家狀態、取餐時段、商品店家、商品狀態與 1～99 數量
- 從 products 重新取得價格並計算 subtotal/total
- 使用 `(customer_id, idempotency_key)` 唯一限制防止重複訂單
- 建立訂單、明細與店家通知

狀態只能依序：

`pending → accepted → preparing → ready → completed`

`pending` 可拒絕；顧客只能取消自己的 pending 訂單。所有讀寫同時受 RLS 與 RPC 驗證。

## 測試

需要 Node.js 20 以上：

```bash
npm install
npm test
```

Playwright 端對端測試需先準備獨立測試 Supabase/Vercel 環境：

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
