/** Allowed storefront emoji icons (admin picker + DB image_url). */
export const STORE_ICONS = ["🍽️", "🏪", "🍗", "🍜", "🧋", "☕", "🍱", "🥗", "🍰", "🥟", "🥤"];

/** Persist emoji or https URL; reject anything else. */
export function normalizeStoreImage(value) {
  const image = String(value || "").trim();
  if (STORE_ICONS.includes(image)) return image;
  if (/^https:\/\/.+/i.test(image)) return image;
  return null;
}
