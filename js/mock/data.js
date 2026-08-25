/**
 * Mock 資料，欄位對齊未來 Google Sheets
 * 店家 A001 / B001 / C001
 */

function nowIso() {
  return new Date().toISOString();
}

export function createSeed() {
  return {
    Users: [
      { user_id: "user_c001", name: "學生小明", role: "customer", store_id: "", status: "active", created_at: nowIso() },
      { user_id: "user_a001", name: "A雞排店店員", role: "store", store_id: "A001", status: "active", created_at: nowIso() },
      { user_id: "user_b001", name: "B麵食館店員", role: "store", store_id: "B001", status: "active", created_at: nowIso() },
      { user_id: "user_cstore", name: "C飲料店店員", role: "store", store_id: "C001", status: "active", created_at: nowIso() },
      { user_id: "user_admin", name: "校園管理團隊", role: "admin", store_id: "", status: "active", created_at: nowIso() },
    ],
    /** 登入帳號（僅 mock；正式環境由後端驗證） */
    Accounts: [
      { username: "student", password: "1234", user_id: "user_c001" },
      { username: "store_a", password: "1234", user_id: "user_a001" },
      { username: "store_b", password: "1234", user_id: "user_b001" },
      { username: "store_c", password: "1234", user_id: "user_cstore" },
      { username: "admin", password: "1234", user_id: "user_admin" },
    ],
    Stores: [
      {
        store_id: "A001",
        store_name: "A雞排店",
        description: "酥脆雞排、鹽酥雞，下課尖峰建議提前點。",
        open_time: "10:00",
        close_time: "20:00",
        status: "open",
        image: "🍗",
      },
      {
        store_id: "B001",
        store_name: "B麵食館",
        description: "牛肉麵、乾麵，可選辣度。",
        open_time: "11:00",
        close_time: "19:30",
        status: "open",
        image: "🍜",
      },
      {
        store_id: "C001",
        store_name: "C飲料店",
        description: "手搖飲、冰熱皆可，糖度冰塊自選（第一階段先固定規格）。",
        open_time: "09:00",
        close_time: "21:00",
        status: "open",
        image: "🧋",
      },
    ],
    Products: [
      { product_id: "P_A01", store_id: "A001", category: "主食", product_name: "原味雞排", description: "去骨厚切", price: 80, image: "🍗", status: "active" },
      { product_id: "P_A02", store_id: "A001", category: "主食", product_name: "椒鹽雞排", description: "椒鹽香", price: 85, image: "🍗", status: "active" },
      { product_id: "P_A03", store_id: "A001", category: "小食", product_name: "鹽酥雞（小）", description: "約 10 塊", price: 50, image: "🧂", status: "active" },
      { product_id: "P_A04", store_id: "A001", category: "小食", product_name: "甜不辣", description: "4 條", price: 30, image: "🍡", status: "soldout" },
      { product_id: "P_B01", store_id: "B001", category: "麵食", product_name: "紅燒牛肉麵", description: "湯頭濃郁", price: 130, image: "🍜", status: "active" },
      { product_id: "P_B02", store_id: "B001", category: "麵食", product_name: "陽春乾麵", description: "拌醬", price: 60, image: "🍝", status: "active" },
      { product_id: "P_B03", store_id: "B001", category: "小菜", product_name: "滷蛋", description: "一顆", price: 15, image: "🥚", status: "active" },
      { product_id: "P_C01", store_id: "C001", category: "茶類", product_name: "四季春青茶", description: "中杯", price: 35, image: "🍵", status: "active" },
      { product_id: "P_C02", store_id: "C001", category: "奶茶", product_name: "珍珠奶茶", description: "中杯", price: 50, image: "🧋", status: "active" },
      { product_id: "P_C03", store_id: "C001", category: "水果", product_name: "檸檬綠", description: "中杯", price: 45, image: "🍋", status: "active" },
    ],
    Orders: [],
    OrderItems: [],
    Reviews: [],
  };
}
