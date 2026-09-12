/** Shared loading / empty / error view helpers for catalog and cart screens. */

export function createInflight() {
  let busy = false;
  return {
    get busy() {
      return busy;
    },
    async run(task) {
      if (busy) return { skipped: true };
      busy = true;
      try {
        return { skipped: false, value: await task() };
      } finally {
        busy = false;
      }
    },
  };
}

export function storeListPhase({
  loading = false,
  error = false,
  authError = false,
  stores = [],
  searching = false,
} = {}) {
  if (authError) return "auth_error";
  if (loading && !stores.length) return "loading";
  if (error && !stores.length) return "error";
  if (!stores.length) return "empty";
  if (searching) return "search";
  return "list";
}

/** Product menu list phase for customer store page. */
export function menuListPhase({
  loading = false,
  error = false,
  products = [],
} = {}) {
  if (loading && !products.length) return "loading";
  if (error && !products.length) return "error";
  if (!products.length) return "empty";
  return "list";
}

/** Do not treat an in-flight fetch as empty. */
export function fetchListPhase({ loading = false, error = false, loaded = false, count = 0 } = {}) {
  if (!loaded && loading) return "loading";
  if (!loaded && error) return "error";
  if (!loaded) return "loading";
  if (count === 0) return "empty";
  return "list";
}

export function cartTotalDisplay({ loading = false, total = 0, empty = false, money } = {}) {
  if (loading) return "";
  if (typeof money === "function") return money(empty ? 0 : total);
  return empty ? 0 : total;
}

export function cartCheckoutEnabled({
  loading = false,
  error = false,
  empty = false,
  storeOpen = false,
} = {}) {
  return !loading && !error && !empty && storeOpen;
}
