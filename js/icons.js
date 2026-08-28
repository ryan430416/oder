export async function mountIcons(root = document) {
  if (!root.querySelector("[data-lucide]")) return;
  try {
    const { createIcons, ShoppingBag, ShoppingCart, Store, ShieldCheck, Bell } = await import(
      "https://cdn.jsdelivr.net/npm/lucide@latest/+esm"
    );
    createIcons({ icons: { ShoppingBag, ShoppingCart, Store, ShieldCheck, Bell }, attrs: { "aria-hidden": "true" } });
  } catch (error) {
    console.warn("Icon library unavailable", error);
  }
}
