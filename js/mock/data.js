/**
 * Mock 資料，欄位對齊未來 Google Sheets
 * 無預設測試店家；由管理員新增
 */
function nowIso() {
  return new Date().toISOString();
}

export function createSeed() {
  return {
    _v: 2,
    Users: [
      { user_id: "user_c001", name: "學生小明", role: "customer", store_id: "", status: "active", created_at: nowIso() },
      { user_id: "user_admin", name: "校園管理團隊", role: "admin", store_id: "", status: "active", created_at: nowIso() },
    ],
    Accounts: [
      { username: "student", password: "1234", user_id: "user_c001" },
      { username: "admin", password: "1234", user_id: "user_admin" },
    ],
    Stores: [],
    Products: [],
    Orders: [],
    OrderItems: [],
    Reviews: [],
  };
}
