/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const products = app.findCollectionByNameOrId("products");
  let variants;
  try {
    variants = app.findCollectionByNameOrId("product_variants");
  } catch (err) {
    variants = new Collection({
      type: "base",
      name: "product_variants",
      listRule:
        '@request.auth.id != "" && @request.auth.status = "active" && @request.auth.role = "admin" || (@request.auth.id != "" && @request.auth.status = "active" && @request.auth.role = "store" && product.store = @request.auth.store) || (status = "active" && product.status = "active" && (product.store.status = "open" || product.store.status = "closed"))',
      viewRule:
        '@request.auth.id != "" && @request.auth.status = "active" && @request.auth.role = "admin" || (@request.auth.id != "" && @request.auth.status = "active" && @request.auth.role = "store" && product.store = @request.auth.store) || (status = "active" && product.status = "active" && (product.store.status = "open" || product.store.status = "closed"))',
      createRule:
        '@request.auth.id != "" && @request.auth.status = "active" && (@request.auth.role = "admin" || (@request.auth.role = "store" && product.store = @request.auth.store))',
      updateRule:
        '@request.auth.id != "" && @request.auth.status = "active" && (@request.auth.role = "admin" || (@request.auth.role = "store" && product.store = @request.auth.store))',
      deleteRule:
        '@request.auth.id != "" && @request.auth.status = "active" && (@request.auth.role = "admin" || (@request.auth.role = "store" && product.store = @request.auth.store))',
      fields: [
        {
          name: "product",
          type: "relation",
          required: true,
          collectionId: products.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: "name", type: "text", required: true, min: 1, max: 40 },
        { name: "price", type: "number", required: true, min: 0, onlyInt: true },
        { name: "sort", type: "number", min: 0, onlyInt: true },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["active", "disabled"],
        },
      ],
      indexes: ["CREATE INDEX idx_product_variants_product_sort ON product_variants (product, sort)"],
    });
    app.save(variants);
  }

  const items = app.findCollectionByNameOrId("order_items");
  if (!items.fields.getByName("variant_name_snapshot")) {
    items.fields.add(new TextField({ name: "variant_name_snapshot", max: 40 }));
    app.save(items);
  }
}, (app) => {
  try {
    const items = app.findCollectionByNameOrId("order_items");
    if (items.fields.getByName("variant_name_snapshot")) {
      items.fields.removeByName("variant_name_snapshot");
      app.save(items);
    }
    app.delete(app.findCollectionByNameOrId("product_variants"));
  } catch (err) {
    // The fresh schema check can remain.
  }
});
