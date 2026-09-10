/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const email = "admin@campus-order.test";
  try {
    app.findAuthRecordByEmail("oder_users", email);
    return;
  } catch (err) {
    // create below
  }

  const users = app.findCollectionByNameOrId("oder_users");
  const record = new Record(users);
  record.set("email", email);
  record.set("password", "1234");
  record.set("passwordConfirm", "1234");
  record.set("verified", true);
  record.set("display_name", "測試管理員");
  const nameField = users.fields.getByName("name");
  if (nameField) record.set("name", "測試管理員");
  record.set("role", "admin");
  record.set("status", "active");
  app.save(record);
}, (app) => {
  try {
    const record = app.findAuthRecordByEmail("oder_users", "admin@campus-order.test");
    app.delete(record);
  } catch (err) {
    // already removed
  }
});
