/** Shared API rules. Auth collection is oder_users (school already has users). */
export const ACTIVE = '@request.auth.id != "" && @request.auth.status = "active"';
export const ADMIN = `${ACTIVE} && @request.auth.role = "admin"`;
export const STORE = `${ACTIVE} && @request.auth.role = "store"`;
export const CUSTOMER = `${ACTIVE} && @request.auth.role = "customer"`;

export const COLLECTION_RULES = {
  oder_users: {
    listRule: `${ACTIVE} && (id = @request.auth.id || @request.auth.role = "admin")`,
    viewRule: `${ACTIVE} && (id = @request.auth.id || @request.auth.role = "admin")`,
    createRule: null,
    updateRule: ADMIN,
    deleteRule: null,
    manageRule: ADMIN,
  },
  stores: {
    listRule: `status = "open" || (${ADMIN}) || (${STORE} && id = @request.auth.store)`,
    viewRule: `status = "open" || (${ADMIN}) || (${STORE} && id = @request.auth.store)`,
    createRule: ADMIN,
    updateRule: ADMIN,
    deleteRule: null,
  },
  products: {
    listRule: `${ADMIN} || (${STORE} && store = @request.auth.store) || (status = "active" && store.status = "open")`,
    viewRule: `${ADMIN} || (${STORE} && store = @request.auth.store) || (status = "active" && store.status = "open")`,
    createRule: `${ADMIN} || (${STORE} && store = @request.auth.store)`,
    updateRule: `${ADMIN} || (${STORE} && store = @request.auth.store && (@request.body.store:isset = false || @request.body.store = @request.auth.store))`,
    deleteRule: null,
  },
  orders: {
    listRule: `${ADMIN} || (${CUSTOMER} && customer = @request.auth.id) || (${STORE} && store = @request.auth.store)`,
    viewRule: `${ADMIN} || (${CUSTOMER} && customer = @request.auth.id) || (${STORE} && store = @request.auth.store)`,
    createRule: null,
    updateRule: null,
    deleteRule: ADMIN,
  },
  order_items: {
    listRule: `${ADMIN} || (${CUSTOMER} && order.customer = @request.auth.id) || (${STORE} && order.store = @request.auth.store)`,
    viewRule: `${ADMIN} || (${CUSTOMER} && order.customer = @request.auth.id) || (${STORE} && order.store = @request.auth.store)`,
    createRule: null,
    updateRule: null,
    deleteRule: ADMIN,
  },
  notifications: {
    listRule: `${ADMIN} || (${ACTIVE} && (user = @request.auth.id || store = @request.auth.store))`,
    viewRule: `${ADMIN} || (${ACTIVE} && (user = @request.auth.id || store = @request.auth.store))`,
    createRule: null,
    updateRule: null,
    deleteRule: ADMIN,
  },
  reviews: {
    listRule: `${ADMIN} || (${CUSTOMER} && customer = @request.auth.id) || (${STORE} && hidden = false && store = @request.auth.store)`,
    viewRule: `${ADMIN} || (${CUSTOMER} && customer = @request.auth.id) || (${STORE} && hidden = false && store = @request.auth.store)`,
    createRule: `${CUSTOMER} && customer = @request.auth.id`,
    updateRule: ADMIN,
    deleteRule: ADMIN,
  },
};
