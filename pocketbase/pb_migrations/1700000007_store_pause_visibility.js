/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const stores = app.findCollectionByNameOrId("stores");
  stores.listRule =
    '(status = "open" || status = "closed") || (@request.auth.id != "" && @request.auth.status = "active" && @request.auth.role = "admin") || (@request.auth.id != "" && @request.auth.status = "active" && @request.auth.role = "store" && id = @request.auth.store)';
  stores.viewRule = stores.listRule;
  app.save(stores);

  const products = app.findCollectionByNameOrId("products");
  const catalog =
    '(status = "active" || status = "soldout") && (store.status = "open" || store.status = "closed")';
  const staff =
    '@request.auth.id != "" && @request.auth.status = "active" && @request.auth.role = "admin" || (@request.auth.id != "" && @request.auth.status = "active" && @request.auth.role = "store" && store = @request.auth.store)';
  products.listRule = staff + " || (" + catalog + ")";
  products.viewRule = products.listRule;
  app.save(products);
}, (app) => {
  const stores = app.findCollectionByNameOrId("stores");
  stores.listRule =
    'status = "open" || (@request.auth.id != "" && @request.auth.status = "active" && @request.auth.role = "admin") || (@request.auth.id != "" && @request.auth.status = "active" && @request.auth.role = "store" && id = @request.auth.store)';
  stores.viewRule = stores.listRule;
  app.save(stores);
});
