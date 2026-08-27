# 校園多店家線上點餐平台

純 HTML、CSS、Vanilla JS 的多語系點餐介面，可部署至 Vercel。

## 本機啟動

ES Module 無法直接用 `file://` 開啟，請在專案目錄啟動 HTTP 伺服器：

```bash
npx --yes serve .
```

或：

```powershell
python -m http.server 8080
```

再開啟 `http://localhost:8080`。

## 目前模式

目前 `js/config.js` 已設定為 Supabase 共用後端模式。

## 啟用 Supabase 共用後端

1. 在 Supabase Dashboard 開啟 **SQL Editor**，依檔名順序執行
   [`supabase/migrations`](supabase/migrations) 內所有 SQL。
   已完成前兩個 migration 的專案，只需接著執行
   `003_grade_photos_simple_flow.sql`、`004_high_school_grades.sql`、
   `005_one_day_sessions.sql` 與 `006_store_service_periods.sql`。
2. 從 Supabase 專案的 **Connect** 視窗複製 Project URL 與
   publishable key（舊專案顯示為 anon key）。
3. 填入 [`js/config.js`](js/config.js)：

```js
USE_MOCK: false,
SUPABASE_URL: "https://你的專案.supabase.co",
SUPABASE_ANON_KEY: "你的 publishable key",
```

4. 將變更推到 GitHub，等待 Vercel 重新部署。

完成後，所有學生、店家與管理員只要使用同一個 Vercel 網址，就會讀寫同一份
Supabase 資料。訂單頁使用 Supabase Realtime，並保留每 5 秒重新讀取作為斷線備援。

SQL migration 會建立 `admin / 1234` 與 `student / 1234`。店家帳號由管理員新增店家時建立。
學生訪客會在各自瀏覽器產生不同的識別碼，因此不會看到其他學生的訂單。

> 此 migration 是學生測試版：保留自訂帳密，且為了匿名 Realtime 開放訂單資料讀取。
> 不可直接當正式系統；正式上線前應改用 Supabase Auth 與使用者範圍 RLS。

示範帳號：

| 帳號 | 密碼 | 角色 |
|---|---|---|
| `student` | `1234` | 顧客 |
| `admin` | `1234` | 管理員 |

店家帳號由管理員新增店家時建立。

## 已完成

- 顧客：店家列表、菜單、購物車、結帳、訂單與通知
- 顧客資料包含姓名與高中一至三年級，訂單保留當時的年級
- 店家：自己的訂單、待接單 → 可取餐 → 完成流程與菜單管理
- 店家可複選早餐 08:30–10:30、午餐 11:00–13:00 營業時段
- 店家與管理員可上傳餐點照片（最大 5MB）
- 管理員：店家、餐點、訂單、使用者、評價與統計頁面
- 中文、泰文、緬文、英文介面
- 休息店家阻擋下單、依營業時間提供取餐時段
- 商品、數量、價格、取餐時間與訂單狀態驗證
- 動態內容輸出轉義，降低儲存型 XSS 風險

## 正式上線前仍需完成

1. 將測試帳密遷移到 Supabase Auth。
2. 改用登入使用者範圍的 RLS，關閉匿名訂單讀取。
3. 移除公開的示範帳號提示並更換正式管理員密碼。

只把 `USE_MOCK` 改成 `false` 不夠；必須先執行 migration 並設定有效的 Supabase URL/key。
