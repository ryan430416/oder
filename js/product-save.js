import { api } from "./api.js";
import { getPocketBase } from "./pocketbase.js";
import {
  isRecordId,
  uploadProductImage,
  validateProductImage,
} from "./product-image.js";

function invalidPrice(value) {
  const price = Number(value);
  return !Number.isInteger(price) || price < 0;
}

export async function saveProductWithImage({
  isUpdate = false,
  productId = "",
  storeId,
  fields,
  file,
  currentImagePath = "",
  previousImagePath = "",
  onProgress,
}) {
  try {
    const client = await getPocketBase();
    if (!client.authStore.isValid) return { ok: false, code: "session_expired" };
    if (!isRecordId(storeId)) return { ok: false, code: "store_unbound" };
    if (!String(fields.product_name || "").trim()) return { ok: false, code: "need_product_name" };
    if (invalidPrice(fields.price)) return { ok: false, code: "invalid_price" };
    if (file) {
      const validation = await validateProductImage(file);
      if (!validation.ok) return validation;
    }

    let id = productId;
    let created = false;
    if (!isUpdate) {
      const createdProduct = await api.createProduct({
        ...fields,
        store_id: storeId,
      });
      if (!createdProduct.ok) return { ok: false, code: createdProduct.code || "product_save_failed" };
      id = createdProduct.product.product_id;
      created = true;
    }

    if (file) {
      const upload = await uploadProductImage(file, storeId, id, { onProgress });
      if (!upload.ok) {
        if (created) await api.deleteProduct(id);
        return upload;
      }
      const pathUpdate = await api.updateProduct(id, {
        ...fields,
        store_id: storeId,
      });
      if (!pathUpdate.ok) {
        if (created) await api.deleteProduct(id);
        return { ok: false, code: "product_save_failed" };
      }
      return { ok: true, productId: id, imagePath: upload.path };
    }

    const result = isUpdate
      ? await api.updateProduct(id, {
          ...fields,
          store_id: storeId,
        })
      : { ok: true };
    if (!result.ok) {
      if (created) await api.deleteProduct(id);
      return { ok: false, code: "product_save_failed" };
    }
    return { ok: true, productId: id, imagePath: currentImagePath || previousImagePath || "" };
  } catch (error) {
    console.error("Product save failed", error);
    return { ok: false, code: "product_save_failed" };
  }
}
