/// <reference path="../pb_data/types.d.ts" />

const ACTIVE = '@request.auth.id != "" && @request.auth.status = "active"';
const ADMIN = ACTIVE + ' && @request.auth.role = "admin"';
const STORE = ACTIVE + ' && @request.auth.role = "store"';
const CUSTOMER = ACTIVE + ' && @request.auth.role = "customer"';

const RULES = {
  oder_users: {
    listRule: ACTIVE + ' && (id = @request.auth.id || @request.auth.role = "admin")',
    viewRule: ACTIVE + ' && (id = @request.auth.id || @request.auth.role = "admin")',
    createRule: null,
    updateRule: ADMIN,
    deleteRule: null,
    manageRule: ADMIN,
  },
  stores: {
    listRule: 'status = "open" || (' + ADMIN + ") || (" + STORE + " && id = @request.auth.store)",
    viewRule: 'status = "open" || (' + ADMIN + ") || (" + STORE + " && id = @request.auth.store)",
    createRule: ADMIN,
    updateRule: ADMIN,
    deleteRule: null,
  },
  products: {
    listRule:
      ADMIN +
      " || (" +
      STORE +
      ' && store = @request.auth.store) || (status = "active" && store.status = "open")',
    viewRule:
      ADMIN +
      " || (" +
      STORE +
      ' && store = @request.auth.store) || (status = "active" && store.status = "open")',
    createRule: ADMIN + " || (" + STORE + " && store = @request.auth.store)",
    updateRule:
      ADMIN +
      " || (" +
      STORE +
      " && store = @request.auth.store && (@request.body.store:isset = false || @request.body.store = @request.auth.store))",
    deleteRule: null,
  },
  orders: {
    listRule:
      ADMIN +
      " || (" +
      CUSTOMER +
      " && customer = @request.auth.id) || (" +
      STORE +
      " && store = @request.auth.store)",
    viewRule:
      ADMIN +
      " || (" +
      CUSTOMER +
      " && customer = @request.auth.id) || (" +
      STORE +
      " && store = @request.auth.store)",
    createRule: null,
    updateRule: null,
    deleteRule: ADMIN,
  },
  order_items: {
    listRule:
      ADMIN +
      " || (" +
      CUSTOMER +
      " && order.customer = @request.auth.id) || (" +
      STORE +
      " && order.store = @request.auth.store)",
    viewRule:
      ADMIN +
      " || (" +
      CUSTOMER +
      " && order.customer = @request.auth.id) || (" +
      STORE +
      " && order.store = @request.auth.store)",
    createRule: null,
    updateRule: null,
    deleteRule: ADMIN,
  },
  notifications: {
    listRule: ADMIN + " || (" + ACTIVE + " && (user = @request.auth.id || store = @request.auth.store))",
    viewRule: ADMIN + " || (" + ACTIVE + " && (user = @request.auth.id || store = @request.auth.store))",
    createRule: null,
    updateRule: null,
    deleteRule: ADMIN,
  },
  reviews: {
    listRule:
      ADMIN +
      " || (" +
      CUSTOMER +
      " && customer = @request.auth.id) || (" +
      STORE +
      " && hidden = false && store = @request.auth.store)",
    viewRule:
      ADMIN +
      " || (" +
      CUSTOMER +
      " && customer = @request.auth.id) || (" +
      STORE +
      " && hidden = false && store = @request.auth.store)",
    createRule: CUSTOMER + " && customer = @request.auth.id",
    updateRule: ADMIN,
    deleteRule: ADMIN,
  },
};

function applyRules(collection, rules) {
  collection.listRule = rules.listRule;
  collection.viewRule = rules.viewRule;
  collection.createRule = rules.createRule;
  collection.updateRule = rules.updateRule;
  collection.deleteRule = rules.deleteRule;
  if (rules.manageRule !== undefined && collection.manageRule !== undefined) {
    collection.manageRule = rules.manageRule;
  }
}

function setOnlyInt(collection, names) {
  for (let i = 0; i < names.length; i++) {
    const field = collection.fields.getByName(names[i]);
    if (field) field.onlyInt = true;
  }
}

migrate((app) => {
  const names = Object.keys(RULES);
  for (let i = 0; i < names.length; i++) {
    try {
      const collection = app.findCollectionByNameOrId(names[i]);
      applyRules(collection, RULES[names[i]]);
      if (names[i] === "products") setOnlyInt(collection, ["price"]);
      if (names[i] === "orders") setOnlyInt(collection, ["total"]);
      if (names[i] === "order_items") setOnlyInt(collection, ["unit_price", "subtotal"]);
      app.save(collection);
    } catch (err) {
      // collection not installed yet
    }
  }
}, (app) => {
  // keep collections; rules are reapplied by a later setup
});
