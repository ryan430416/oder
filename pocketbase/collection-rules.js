/** Shared API rules. Auth collection is oder_users (school already has users). */
export const ACTIVE = '@request.auth.id != "" && @request.auth.status = "active"';
export const ADMIN = `${ACTIVE} && @request.auth.role = "admin"`;
export const STORE = `${ACTIVE} && @request.auth.role = "store"`;
export const CUSTOMER = `${ACTIVE} && @request.auth.role = "customer"`;

export const COLLECTION_RULES = {
  oder_users: {
    listRule: `${ACTIVE} && (id = @request.auth.id || @request.auth.role = "admin")`,
    viewRule: `${ACTIVE} && (id = @request.auth.id || @request.auth.role = "admin")`,
    createRule:
      '@request.auth.id = "" && role = "customer" && status = "active" && (@request.body.store:isset = false || store = "")',
    updateRule: `${ADMIN} || (${CUSTOMER} && id = @request.auth.id && @request.body.role:isset = false && @request.body.status:isset = false && @request.body.store:isset = false)`,
    deleteRule: null,
    manageRule: ADMIN,
    authRule: 'status = "active"',
  },
  stores: {
    listRule: `(status = "open" || status = "closed") || (${ADMIN}) || (${STORE} && id = @request.auth.store)`,
    viewRule: `(status = "open" || status = "closed") || (${ADMIN}) || (${STORE} && id = @request.auth.store)`,
    createRule: ADMIN,
    updateRule: ADMIN,
    deleteRule: null,
  },
  products: {
    listRule: `${ADMIN} || (${STORE} && store = @request.auth.store) || ((status = "active" || status = "soldout") && (store.status = "open" || store.status = "closed"))`,
    viewRule: `${ADMIN} || (${STORE} && store = @request.auth.store) || ((status = "active" || status = "soldout") && (store.status = "open" || store.status = "closed"))`,
    createRule: `${ADMIN} || (${STORE} && store = @request.auth.store)`,
    updateRule: `${ADMIN} || (${STORE} && store = @request.auth.store && (@request.body.store:isset = false || @request.body.store = @request.auth.store))`,
    deleteRule: null,
  },
  product_variants: {
    listRule: `${ADMIN} || (${STORE} && product.store = @request.auth.store) || (status = "active" && product.status = "active" && (product.store.status = "open" || product.store.status = "closed"))`,
    viewRule: `${ADMIN} || (${STORE} && product.store = @request.auth.store) || (status = "active" && product.status = "active" && (product.store.status = "open" || product.store.status = "closed"))`,
    createRule: `${ADMIN} || (${STORE} && product.store = @request.auth.store)`,
    updateRule: `${ADMIN} || (${STORE} && product.store = @request.auth.store)`,
    deleteRule: `${ADMIN} || (${STORE} && product.store = @request.auth.store)`,
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
  admin_audit_logs: {
    listRule: ADMIN,
    viewRule: ADMIN,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  },
};
