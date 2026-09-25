/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const users = app.findCollectionByNameOrId("oder_users");
  const checks = [
    ["orders", "customer"],
    ["notifications", "user"],
    ["reviews", "customer"],
  ];
  for (let i = 0; i < checks.length; i++) {
    const collection = app.findCollectionByNameOrId(checks[i][0]);
    const field = collection.fields.getByName(checks[i][1]);
    if (!field || field.collectionId !== users.id) {
      throw new Error(
        checks[i][0] +
          "." +
          checks[i][1] +
          " must reference oder_users. PocketBase cannot retarget an existing relation; create a new data directory."
      );
    }
  }
}, (app) => {
  // The relation target is part of the original collection definition.
});
