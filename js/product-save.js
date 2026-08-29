import { api } from "./api.js";
import { getSupabase } from "./supabase.js";
import {
  deleteProductImage,
  isUuid,
  uploadProductImage,
  validateProductImage,
} from "./product-image.js";

function invalidPrice(value) {
  const price = Number(value);
  return !Number.isFinite(price) || price < 0;
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
    const client = await getSupabase();
    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData.session) return { ok: false, code: "session_expired" };
    if (!isUuid(storeId)) return { ok: false, code: "store_unbound" };
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
        image_path: null,
      });
      if (!createdProduct.ok) return { ok: false, code: createdProduct.code || "product_save_failed" };
      id = createdProduct.product.product_id;
      created = true;
    }

    let uploadedPath = "";
    if (file) {
      const upload = await uploadProductImage(file, storeId, id, { onProgress });
      if (!upload.ok) {
        if (created) await api.deleteProduct(id);
        return upload;
      }
      uploadedPath = upload.path;
      const pathUpdate = await api.updateProduct(id, {
        ...fields,
        store_id: storeId,
        image_path: uploadedPath,
      });
      if (!pathUpdate.ok) {
        await deleteProductImage(uploadedPath);
        if (created) await api.deleteProduct(id);
        return { ok: false, code: "product_save_failed" };
      }
      if (currentImagePath && currentImagePath !== uploadedPath) {
        await deleteProductImage(currentImagePath);
      }
      if (previousImagePath && previousImagePath !== uploadedPath && previousImagePath !== currentImagePath) {
        await deleteProductImage(previousImagePath);
      }
      return { ok: true, productId: id, imagePath: uploadedPath };
    }

    const nextPath = currentImagePath || null;
    const result = isUpdate
      ? await api.updateProduct(id, {
          ...fields,
          store_id: storeId,
          image_path: nextPath,
        })
      : { ok: true };
    if (!result.ok) {
      if (created) await api.deleteProduct(id);
      return { ok: false, code: "product_save_failed" };
    }
    if (isUpdate && previousImagePath && previousImagePath !== nextPath) {
      await deleteProductImage(previousImagePath);
    }
    return { ok: true, productId: id, imagePath: nextPath || "" };
  } catch (error) {
    console.error("Product save failed", error);
    return { ok: false, code: "product_save_failed" };
  }
}
