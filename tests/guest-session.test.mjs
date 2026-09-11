import test from "node:test";
import assert from "node:assert/strict";
import { setLang, t } from "../js/i18n.js";
import { storeListPhase, createInflight } from "../js/ui-state.js";
import { withRetryLock } from "../js/backend-ui.js";
import {
  createGuestSession,
  guestCreatePayload,
  isMissingRequired,
  isUniqueConflict,
  loginAsGuest,
  publicGuestError,
  restoreCustomerRecord,
  shouldQueryCustomerData,
} from "../js/guest-session.js";

const values = new Map([["campus_order_lang", JSON.stringify("zh")]]);
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
};

function mockCollection(handlers, authStore) {
  return {
    collection() {
      return handlers;
    },
    authStore,
  };
}

function authStore(record = null, valid = Boolean(record)) {
  return {
    isValid: valid,
    record,
    model: record,
    clear() {
      this.isValid = false;
      this.record = null;
      this.model = null;
    },
  };
}

test("guest credentials use UUID emails and matching random passwords", () => {
  const payload = guestCreatePayload();
  assert.match(payload.email, /^guest_[a-f0-9]{32}@campus-order\.test$/);
  assert.doesNotMatch(payload.email, /\d{13}/);
  assert.equal(payload.password, payload.passwordConfirm);
  assert.ok(payload.password.length >= 16);
  assert.equal(payload.role, "customer");
  assert.equal(payload.status, "active");
  assert.equal("store" in payload, false);
});

test("PocketBase can be healthy while anonymous login still fails", async () => {
  const store = authStore(null, false);
  const client = mockCollection(
    {
      authRefresh: async () => {
        throw Object.assign(new Error("expired"), { status: 401 });
      },
      create: async () => {
        throw Object.assign(new Error("forbidden"), { status: 403, data: { code: "server_not_configured" } });
      },
      authWithPassword: async () => {
        throw new Error("should not login");
      },
    },
    store
  );
  const result = await loginAsGuest(client);
  assert.equal(result.ok, false);
  assert.equal(shouldQueryCustomerData(result), false);
  assert.equal(storeListPhase({ authError: true, stores: [] }), "auth_error");
  assert.notEqual(storeListPhase({ authError: true, stores: [] }), "empty");
});

test("missing required auth fields are detected", () => {
  const error = {
    status: 400,
    data: { data: { passwordConfirm: { code: "validation_required" }, role: { code: "validation_required" } } },
  };
  assert.equal(isMissingRequired(error), true);
  assert.deepEqual(publicGuestError(error).fields, {
    passwordConfirm: "validation_required",
    role: "validation_required",
  });
});

test("duplicate guest emails retry then log in", async () => {
  let creates = 0;
  let logins = 0;
  const store = authStore();
  const result = await createGuestSession(
    {
      create: async () => {
        creates += 1;
        if (creates === 1) {
          throw Object.assign(new Error("dup"), {
            status: 400,
            data: { data: { email: { code: "validation_not_unique" } } },
          });
        }
      },
      authWithPassword: async () => {
        logins += 1;
        store.isValid = true;
        store.record = { id: "guest1", role: "customer", status: "active", display_name: "" };
        store.model = store.record;
      },
    },
    store
  );
  assert.equal(isUniqueConflict({ status: 400, data: { data: { email: { code: "validation_not_unique" } } } }), true);
  assert.equal(result.ok, true);
  assert.equal(creates, 2);
  assert.equal(logins, 1);
  assert.equal(result.reused, false);
});

test("successful guest create immediately authenticates", async () => {
  const store = authStore();
  let loginEmail = "";
  const result = await createGuestSession(
    {
      create: async (payload) => payload,
      authWithPassword: async (email, password) => {
        loginEmail = email;
        assert.ok(password);
        store.isValid = true;
        store.record = { id: "n1", role: "customer", status: "active", email };
        store.model = store.record;
      },
    },
    store
  );
  assert.equal(result.ok, true);
  assert.match(loginEmail, /^guest_/);
  assert.equal(store.record.role, "customer");
});

test("valid sessions are reused without creating another account", async () => {
  const existing = { id: "abc", role: "customer", status: "active" };
  let created = 0;
  const store = authStore(existing, true);
  const result = await loginAsGuest(
    mockCollection(
      {
        authRefresh: async () => existing,
        create: async () => {
          created += 1;
        },
        authWithPassword: async () => {},
      },
      store
    )
  );
  assert.equal(result.ok, true);
  assert.equal(result.reused, true);
  assert.equal(created, 0);
});

test("expired sessions refresh then create a new guest if needed", async () => {
  const store = authStore({ id: "old" }, true);
  const restored = await restoreCustomerRecord(
    {
      authRefresh: async () => {
        throw Object.assign(new Error("expired"), { status: 401 });
      },
    },
    store
  );
  assert.equal(restored, null);
  assert.equal(store.isValid, false);
  const created = await createGuestSession(
    {
      create: async () => {},
      authWithPassword: async () => {
        store.isValid = true;
        store.record = { id: "new", role: "customer", status: "active" };
        store.model = store.record;
      },
    },
    store
  );
  assert.equal(created.ok, true);
  assert.equal(created.session.id, "new");
});

test("auth failure must not look like an empty store catalog", () => {
  assert.equal(shouldQueryCustomerData({ ok: false, code: "anonymous_login_failed" }), false);
  assert.equal(storeListPhase({ authError: true, error: false, stores: [] }), "auth_error");
  assert.equal(storeListPhase({ authError: false, error: false, stores: [] }), "empty");
  setLang("zh");
  assert.equal(t("anonymous_login_failed"), "無法建立點餐身分，請稍後再試。");
  assert.equal(t("no_open_stores"), "目前沒有營業中的店家");
  assert.equal(t("no_stores"), "沒有符合的店家");
    assert.equal(t("cart_hint_empty"), "請先選擇店家商品");
    setLang("en");
    assert.equal(t("cart_hint_empty"), "Please choose store items first");
    setLang("th");
    assert.equal(t("cart_hint_empty"), "กรุณาเลือกสินค้าจากร้านก่อน");
    setLang("my");
    assert.equal(t("cart_hint_empty"), "အရင်ဆိုင်က ပစ္စည်းရွေးပါ");
    setLang("zh");
});

test("retry lock disables the button and always restores it", async () => {
  const button = { disabled: false, isConnected: true };
  await withRetryLock(button, async () => {
    assert.equal(button.disabled, true);
    throw new Error("anonymous_login_failed");
  }).catch(() => {});
  assert.equal(button.disabled, false);
  const gate = createInflight();
  const first = gate.run(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  const second = await gate.run(async () => {});
  assert.equal(second.skipped, true);
  await first;
});
