/// <reference path="../pb_data/types.d.ts" />

function autodateFields() {
  return [
    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
  ];
}

function ensureOderUsers(app) {
  try {
    return app.findCollectionByNameOrId("oder_users");
  } catch (err) {
    // create below
  }
  const users = new Collection({
    type: "auth",
    name: "oder_users",
    listRule: '@request.auth.id != "" && @request.auth.status = "active" && (id = @request.auth.id || @request.auth.role = "admin")',
    viewRule: '@request.auth.id != "" && @request.auth.status = "active" && (id = @request.auth.id || @request.auth.role = "admin")',
    createRule:
      '@request.auth.id = "" && role = "customer" && status = "active" && (@request.body.store:isset = false || store = "")',
    updateRule:
      '@request.auth.id != "" && @request.auth.status = "active" && (@request.auth.role = "admin" || (@request.auth.role = "customer" && id = @request.auth.id && @request.body.role:isset = false && @request.body.status:isset = false && @request.body.store:isset = false))',
    deleteRule: null,
    manageRule: '@request.auth.id != "" && @request.auth.status = "active" && @request.auth.role = "admin"',
    passwordAuth: {
      enabled: true,
      identityFields: ["email"],
    },
    fields: [
      { name: "display_name", type: "text", max: 80 },
      { name: "grade", type: "select", values: ["high_1", "high_2", "high_3"], maxSelect: 1 },
      {
        name: "role",
        type: "select",
        required: true,
        values: ["customer", "store", "admin"],
        maxSelect: 1,
      },
      {
        name: "status",
        type: "select",
        required: true,
        values: ["active", "disabled"],
        maxSelect: 1,
      },
    ],
  });
  app.save(users);
  const passwordField = users.fields.getByName("password");
  if (passwordField) passwordField.min = 4;
  app.save(users);
  return users;
}

migrate((app) => {
  const users = ensureOderUsers(app);

  const stores = new Collection({
    type: "base",
    name: "stores",
    listRule:
      'status = "open" || @request.auth.role = "admin" || id = @request.auth.store',
    viewRule:
      'status = "open" || @request.auth.role = "admin" || id = @request.auth.store',
    createRule: '@request.auth.role = "admin"',
    updateRule: '@request.auth.role = "admin"',
    deleteRule: '@request.auth.role = "admin"',
    fields: [
      { name: "name", type: "text", required: true, min: 1, max: 80, presentable: true },
      { name: "description", type: "text", max: 500 },
      { name: "image_url", type: "text", max: 500 },
      { name: "open_time", type: "text", required: true, max: 5 },
      { name: "close_time", type: "text", required: true, max: 5 },
      {
        name: "service_periods",
        type: "select",
        maxSelect: 3,
        values: ["breakfast", "lunch", "afternoon_tea"],
      },
      {
        name: "status",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["open", "closed", "disabled"],
      },
      ...autodateFields(),
    ],
  });
  app.save(stores);

  if (!users.fields.getByName("store")) {
    users.fields.add(
      new RelationField({
        name: "store",
        collectionId: stores.id,
        maxSelect: 1,
        cascadeDelete: false,
      })
    );
    app.save(users);
  }

  const products = new Collection({
    type: "base",
    name: "products",
    listRule:
      '@request.auth.id != "" && @request.auth.status = "active" && @request.auth.role = "admin" || (@request.auth.id != "" && @request.auth.status = "active" && @request.auth.role = "store" && store = @request.auth.store) || (status = "active" && store.status = "open")',
    viewRule:
      '@request.auth.id != "" && @request.auth.status = "active" && @request.auth.role = "admin" || (@request.auth.id != "" && @request.auth.status = "active" && @request.auth.role = "store" && store = @request.auth.store) || (status = "active" && store.status = "open")',
    createRule:
      '@request.auth.id != "" && @request.auth.status = "active" && (@request.auth.role = "admin" || (@request.auth.role = "store" && store = @request.auth.store))',
    updateRule:
      '@request.auth.id != "" && @request.auth.status = "active" && (@request.auth.role = "admin" || (@request.auth.role = "store" && store = @request.auth.store && (@request.body.store:isset = false || @request.body.store = @request.auth.store)))',
    deleteRule: null,
    fields: [
      {
        name: "store",
        type: "relation",
        required: true,
        collectionId: stores.id,
        cascadeDelete: false,
        maxSelect: 1,
      },
      { name: "name", type: "text", required: true, min: 1, max: 100, presentable: true },
      { name: "category", type: "text", required: true, min: 1, max: 40 },
      { name: "description", type: "text", max: 500 },
      { name: "price", type: "number", required: true, min: 0, onlyInt: true },
      {
        name: "image",
        type: "file",
        maxSelect: 1,
        maxSize: 1048576,
        mimeTypes: ["image/jpeg", "image/png", "image/webp"],
        protected: false,
      },
      {
        name: "status",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["active", "soldout", "hidden"],
      },
      ...autodateFields(),
    ],
    indexes: ["CREATE INDEX idx_products_store_status ON products (store, status)"],
  });
  app.save(products);

  const orders = new Collection({
    type: "base",
    name: "orders",
    listRule:
      '@request.auth.role = "admin" || customer = @request.auth.id || store = @request.auth.store',
    viewRule:
      '@request.auth.role = "admin" || customer = @request.auth.id || store = @request.auth.store',
    createRule: null,
    updateRule: null,
    deleteRule: '@request.auth.role = "admin"',
    fields: [
      { name: "order_number", type: "text", required: true, max: 40 },
      {
        name: "customer",
        type: "relation",
        required: true,
        collectionId: users.id,
        cascadeDelete: false,
        maxSelect: 1,
      },
      { name: "customer_name", type: "text", required: true, min: 1, max: 80 },
      {
        name: "customer_grade",
        type: "select",
        values: ["high_1", "high_2", "high_3"],
        maxSelect: 1,
      },
      {
        name: "store",
        type: "relation",
        required: true,
        collectionId: stores.id,
        cascadeDelete: false,
        maxSelect: 1,
      },
      { name: "pickup_time", type: "date", required: true },
      {
        name: "payment_method",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["cash", "campus"],
      },
      { name: "total", type: "number", required: true, min: 0, onlyInt: true },
      {
        name: "status",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["pending", "accepted", "preparing", "ready", "completed", "rejected", "cancelled"],
      },
      { name: "idempotency_key", type: "text", required: true, max: 80 },
      ...autodateFields(),
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_orders_number ON orders (order_number)",
      "CREATE UNIQUE INDEX idx_orders_idempotency ON orders (customer, idempotency_key)",
      "CREATE INDEX idx_orders_customer_created ON orders (customer, created)",
      "CREATE INDEX idx_orders_store_created ON orders (store, created)",
    ],
  });
  app.save(orders);

  const orderItems = new Collection({
    type: "base",
    name: "order_items",
    listRule:
      '@request.auth.role = "admin" || order.customer = @request.auth.id || order.store = @request.auth.store',
    viewRule:
      '@request.auth.role = "admin" || order.customer = @request.auth.id || order.store = @request.auth.store',
    createRule: null,
    updateRule: null,
    deleteRule: '@request.auth.role = "admin"',
    fields: [
      {
        name: "order",
        type: "relation",
        required: true,
        collectionId: orders.id,
        cascadeDelete: true,
        maxSelect: 1,
      },
      {
        name: "product",
        type: "relation",
        collectionId: products.id,
        cascadeDelete: false,
        maxSelect: 1,
      },
      { name: "product_name_snapshot", type: "text", required: true, max: 100 },
      { name: "unit_price", type: "number", required: true, min: 0, onlyInt: true },
      { name: "quantity", type: "number", required: true, min: 1, max: 99, onlyInt: true },
      { name: "subtotal", type: "number", required: true, min: 0, onlyInt: true },
      ...autodateFields(),
    ],
  });
  app.save(orderItems);

  const notifications = new Collection({
    type: "base",
    name: "notifications",
    listRule:
      '@request.auth.role = "admin" || user = @request.auth.id || store = @request.auth.store',
    viewRule:
      '@request.auth.role = "admin" || user = @request.auth.id || store = @request.auth.store',
    createRule: null,
    updateRule: null,
    deleteRule: '@request.auth.role = "admin"',
    fields: [
      {
        name: "user",
        type: "relation",
        collectionId: users.id,
        cascadeDelete: true,
        maxSelect: 1,
      },
      {
        name: "store",
        type: "relation",
        collectionId: stores.id,
        cascadeDelete: true,
        maxSelect: 1,
      },
      {
        name: "order",
        type: "relation",
        collectionId: orders.id,
        cascadeDelete: true,
        maxSelect: 1,
      },
      { name: "type", type: "text", required: true, min: 1, max: 50 },
      { name: "message", type: "text", required: true, max: 500 },
      { name: "is_read", type: "bool" },
      ...autodateFields(),
    ],
    indexes: [
      "CREATE INDEX idx_notifications_user_created ON notifications (user, created)",
      "CREATE INDEX idx_notifications_store_created ON notifications (store, created)",
    ],
  });
  app.save(notifications);

  const reviews = new Collection({
    type: "base",
    name: "reviews",
    listRule:
      '@request.auth.role = "admin" || customer = @request.auth.id || (hidden = false && store = @request.auth.store)',
    viewRule:
      '@request.auth.role = "admin" || customer = @request.auth.id || (hidden = false && store = @request.auth.store)',
    createRule:
      '@request.auth.role = "customer" && customer = @request.auth.id',
    updateRule: '@request.auth.role = "admin"',
    deleteRule: '@request.auth.role = "admin"',
    fields: [
      {
        name: "customer",
        type: "relation",
        required: true,
        collectionId: users.id,
        cascadeDelete: true,
        maxSelect: 1,
      },
      {
        name: "store",
        type: "relation",
        required: true,
        collectionId: stores.id,
        cascadeDelete: true,
        maxSelect: 1,
      },
      {
        name: "order",
        type: "relation",
        required: true,
        collectionId: orders.id,
        cascadeDelete: true,
        maxSelect: 1,
      },
      { name: "rating", type: "number", required: true, min: 1, max: 5, onlyInt: true },
      { name: "comment", type: "text", max: 500 },
      { name: "hidden", type: "bool" },
      ...autodateFields(),
    ],
    indexes: ["CREATE UNIQUE INDEX idx_reviews_order ON reviews (order)"],
  });
  app.save(reviews);
}, (app) => {
  const names = ["reviews", "notifications", "order_items", "orders", "products", "stores", "oder_users"];
  for (let i = 0; i < names.length; i++) {
    try {
      app.delete(app.findCollectionByNameOrId(names[i]));
    } catch (err) {
      // already removed
    }
  }
});
