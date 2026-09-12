/// <reference path="../pb_data/types.d.ts" />

function addIndex(collection, sql) {
  const indexes = Array.isArray(collection.indexes) ? collection.indexes.slice() : [];
  const name = sql.match(/INDEX\s+(\S+)/i)?.[1];
  if (name && indexes.some((item) => item.includes(name))) return false;
  indexes.push(sql);
  collection.indexes = indexes;
  return true;
}

migrate((app) => {
  const orderItems = app.findCollectionByNameOrId("order_items");
  const orders = app.findCollectionByNameOrId("orders");
  const notes = app.findCollectionByNameOrId("notifications");
  let changed = false;
  changed = addIndex(orderItems, 'CREATE INDEX idx_order_items_order ON order_items ("order")') || changed;
  changed = addIndex(orders, "CREATE INDEX idx_orders_customer_created ON orders (customer, created)") || changed;
  changed = addIndex(orders, "CREATE INDEX idx_orders_store_created ON orders (store, created)") || changed;
  changed = addIndex(notes, "CREATE INDEX idx_notifications_user_created ON notifications (user, created)") || changed;
  changed = addIndex(notes, "CREATE INDEX idx_notifications_store_created ON notifications (store, created)") || changed;
  if (changed) {
    app.save(orderItems);
    app.save(orders);
    app.save(notes);
  }
}, (app) => {
  // Keep indexes. Dropping them would slow customer order and notice reads.
});
