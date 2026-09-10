/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  try {
    app.findCollectionByNameOrId("oder_users");
    return;
  } catch (err) {
    // create below for databases that already applied the old users migration
  }

  const users = new Collection({
    type: "auth",
    name: "oder_users",
    listRule: 'id = @request.auth.id || @request.auth.role = "admin"',
    viewRule: 'id = @request.auth.id || @request.auth.role = "admin"',
    createRule: null,
    updateRule: '@request.auth.role = "admin"',
    deleteRule: null,
    manageRule: '@request.auth.role = "admin"',
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

  try {
    const stores = app.findCollectionByNameOrId("stores");
    if (!users.fields.getByName("store")) {
      users.fields.add(
        new RelationField({
          name: "store",
          collectionId: stores.id,
          maxSelect: 1,
          cascadeDelete: false,
        })
      );
    }
  } catch (err) {
    // stores not created yet
  }
  app.save(users);

  const email = "admin@campus-order.test";
  try {
    app.findAuthRecordByEmail("oder_users", email);
  } catch (err) {
    const record = new Record(users);
    record.set("email", email);
    record.set("password", "1234");
    record.set("passwordConfirm", "1234");
    record.set("verified", true);
    record.set("display_name", "測試管理員");
    if (users.fields.getByName("name")) record.set("name", "測試管理員");
    record.set("role", "admin");
    record.set("status", "active");
    app.save(record);
  }
}, (app) => {
  try {
    app.delete(app.findCollectionByNameOrId("oder_users"));
  } catch (err) {
    // already removed
  }
});
