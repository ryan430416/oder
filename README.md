# 校園多店家線上點餐平台（第一階段）

純 HTML / CSS / Vanilla JS，Mock 資料。請用本機 HTTP 開啟（ES Module 無法用 `file://`）。

```bash
npx --yes serve .
```

或 PowerShell：

```powershell
python -m http.server 8080
```

瀏覽器開 `http://localhost:8080`

## 示範帳號（密碼皆 1234）

| 帳號 | 角色 | store_id |
|------|------|----------|
| student | 顧客 | （無） |
| store_a | 店家 | A001 |
| store_b | 店家 | B001 |
| store_c | 店家 | C001 |
| admin | 管理 | （無） |

顧客端未登入會自動使用學生小明，方便直接點餐。

## 第一階段已完成

店家列表 → 菜單 → 購物車數量／總額 → 取餐時間 → 建立訂單 → 店家只看自己 store_id 的訂單並改狀態。

管理端為空殼。店家菜單僅檢視。尚未串 Google Apps Script / LINE。

訂單資料存在瀏覽器 `localStorage`（`campus_order_mock_db`）。
