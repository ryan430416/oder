/**
 * Mock 資料庫：種子 + localStorage 持久化（模擬 Sheets 寫入）
 */
import { config } from "../config.js";
import { storage } from "../storage.js";
import { createSeed } from "./data.js";

export function getDb() {
  let db = storage.get(config.MOCK_DB_KEY, null);
  if (!db || db._v !== config.MOCK_DB_VERSION) {
    db = createSeed();
    storage.set(config.MOCK_DB_KEY, db);
    storage.remove(config.CART_KEY);
    storage.remove(config.SESSION_KEY);
  }
  if (!Array.isArray(db.Notifications)) db.Notifications = [];
  if (!Array.isArray(db.PasswordResets)) db.PasswordResets = [];
  return db;
}

export function saveDb(db) {
  db._v = config.MOCK_DB_VERSION;
  storage.set(config.MOCK_DB_KEY, db);
}

export function resetDb() {
  storage.remove(config.MOCK_DB_KEY);
  storage.remove(config.CART_KEY);
}
