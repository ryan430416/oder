# PocketBase 本機使用（先看這份）

PocketBase 是點餐系統的後端：資料、登入、商品圖、即時訂單都在這裡。網站前端可以仍放 Vercel，但 **PocketBase 必須另外跑**。

## 兩組帳號不要搞混

| 帳號 | 用在哪 | 預設 |
| --- | --- | --- |
| PocketBase 後台超級管理員 | `http://127.0.0.1:8090/_/` 看資料表 | 第一次啟動時你自己建立 |
| 點餐系統管理員 | 網站「管理員登入」 | `admin` / `1234`（migration 會建立） |

## 第一次啟動

在專案根目錄：

```bash
npm run pb:download
npm run pb:serve
```

1. 終端機出現 `Server started at http://127.0.0.1:8090`。
2. 瀏覽器打開 http://127.0.0.1:8090/_/
3. 建立後台超級管理員（這組請自己記下來，不要用 `admin` / `1234`）。
4. 左側 Collections 應已有 `oder_users`、`stores`、`products`、`orders`、`order_items`、`notifications`、`reviews`。
5. 打開 `oder_users`，應有 `admin@campus-order.test`，`role` 為 `admin`。

學校若已有 PocketBase（`https://db.keson.pro`）：

1. **不要**改左邊現成的「使用者、香港學生、學校用戶」。
2. **不要**把點餐資料寫進空的 `DT_oder` 那一張表。
3. 把本專案的 `pb_migrations` 與 `pb_hooks` 複製到那台 PocketBase 的資料夾，重開 PocketBase。
4. 前端 `POCKETBASE_URL` 設成 `https://db.keson.pro`。

網站本機預設連學校 PocketBase。用 `npx vercel dev` 開前端後，用 `admin` / `1234` 登入點餐管理員。

## 後台你常看的地方

- **Collections**：資料表與 API 規則（誰能讀寫）
- **oder_users**：點餐系統的顧客訪客、店家、管理員（不是學校的「使用者」）
- **stores / products / orders**：店家、菜單、訂單
- **Logs**：API 出錯時來看

不要在後台把 `oder_users` 的 `role` 隨便改成 `admin`。顧客訪客帳號是系統自動建立的，沒有密碼可記。

## 兩台電腦

兩台都連同一台 `https://db.keson.pro`，`git pull` 後即可。本機 `npm run pb:serve` / `pb-serve.cmd` 只給沒有學校主機時用。
