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

export function storeListPhase({ loading = false, error = false, stores = [] } = {}) {
  if (loading && !stores.length) return "loading";
  if (error && !stores.length) return "error";
  if (!stores.length) return "empty";
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
