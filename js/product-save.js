import { api } from "./api.js";
import { getPocketBase } from "./pocketbase.js";
import { compressProductImage, isRecordId, uploadProductImage } from "./product-image.js";
import { imageWritePlan } from "./store-self-service.js";

function invalidPrice(value) {
  const price = Number(value);
  return !Number.isInteger(price) || price < 0;
}

export { imageWritePlan };

export async function saveProductWithImage({
  isUpdate = false,
  productId = "",
  storeId,
  fields,
  file,
  currentImagePath = "",
  previousImagePath = "",
  imageRemoved = false,
  onProgress,
}) {
  try {
    const client = await getPocketBase();
    if (!client.authStore.isValid) return { ok: false, code: "session_expired" };
    if (!isRecordId(storeId)) return { ok: false, code: "store_unbound" };
    if (!String(fields.product_name || "").trim()) return { ok: false, code: "need_product_name" };
    if (invalidPrice(fields.price)) return { ok: false, code: "invalid_price" };

    const plan = imageWritePlan({ isUpdate, fileReady: Boolean(file), imageRemoved });
    let prepared = null;
    if (file) {
      prepared = await compressProductImage(file);
      if (!prepared.ok) return prepared;
    }

    let id = productId;
    if (!isUpdate) {
      const createdProduct = await api.createProduct(
        { ...fields, store_id: storeId },
        plan.replaceOnCreate ? prepared.blob : null
      );
      if (!createdProduct.ok) {
        return { ok: false, code: createdProduct.code || "product_save_failed", status: createdProduct.status };
      }
      return { ok: true, productId: createdProduct.product.product_id, imagePath: createdProduct.product.image_path || "" };
    }

    if (plan.replaceOnUpdate) {
      const upload = await uploadProductImage(prepared.blob, storeId, id, {
        onProgress,
        alreadyCompressed: true,
      });
      if (!upload.ok) return upload;
      id = productId;
    }

    const result = await api.updateProduct(id, {
      ...fields,
      store_id: storeId,
      ...(plan.clearImage ? { image: null } : {}),
    });
    if (!result.ok) return { ok: false, code: "product_save_failed" };
    return {
      ok: true,
      productId: id,
      imagePath: plan.replaceOnUpdate
        ? result.product?.image_path || "product.webp"
        : plan.clearImage
          ? ""
          : currentImagePath || previousImagePath || "",
    };
  } catch (error) {
    console.error("Product save failed", error?.status || error?.message || "unknown");
    return { ok: false, code: "product_save_failed" };
  }
}
