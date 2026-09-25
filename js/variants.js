export function lineId(productId, variantId = "") {
  const product = String(productId || "");
  const variant = String(variantId || "");
  return variant ? `${product}::${variant}` : product;
}

export function activeVariants(variants) {
  return (variants || [])
    .filter((row) => String(row.status || "active") !== "disabled" && String(row.name || "").trim())
    .slice()
    .sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0) || String(a.name).localeCompare(String(b.name)));
}

/** Price comes only from the product or an active variant. Client prices are ignored. */
export function quoteLine({ product, variants = [], variantId = "" } = {}) {
  if (!product || product.status !== "active") return { ok: false, code: "invalid_items" };
  const active = activeVariants(variants);
  const requested = String(variantId || "");
  if (active.length) {
    const chosen = active.find((row) => String(row.id || row.variant_id || "") === requested);
    if (!chosen) return { ok: false, code: "need_variant" };
    const unit = Number(chosen.price);
    if (!Number.isInteger(unit) || unit < 0) return { ok: false, code: "invalid_items" };
    return {
      ok: true,
      unit,
      variantId: String(chosen.id || chosen.variant_id),
      variantName: String(chosen.name).trim(),
    };
  }
  if (requested) return { ok: false, code: "invalid_items" };
  const unit = Number(product.price);
  if (!Number.isInteger(unit) || unit < 0) return { ok: false, code: "invalid_items" };
  return { ok: true, unit, variantId: "", variantName: "" };
}

export function itemDisplayName(item) {
  const name = String(item?.product_name || "");
  const variant = String(item?.variant_name || item?.variant_name_snapshot || "").trim();
  return variant ? `${name}（${variant}）` : name;
}
