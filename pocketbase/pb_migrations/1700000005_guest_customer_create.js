/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  try {
    const users = app.findCollectionByNameOrId("oder_users");
    users.createRule =
      '@request.auth.id = "" && role = "customer" && status = "active" && (@request.body.store:isset = false || store = "")';
    users.updateRule =
      '@request.auth.id != "" && @request.auth.status = "active" && @request.auth.role = "admin" || (@request.auth.id != "" && @request.auth.status = "active" && @request.auth.role = "customer" && id = @request.auth.id && @request.body.role:isset = false && @request.body.status:isset = false && @request.body.store:isset = false)';
    users.authRule = 'status = "active"';
    app.save(users);
  } catch (err) {
    // collection not installed yet
  }
}, (app) => {
  try {
    const users = app.findCollectionByNameOrId("oder_users");
    users.createRule = null;
    users.updateRule = '@request.auth.role = "admin"';
    users.authRule = "";
    app.save(users);
  } catch (err) {
    // ignore
  }
});
