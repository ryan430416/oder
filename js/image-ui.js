export function mountImageUi(root = document) {
  root.querySelectorAll("img.product-photo").forEach((image) => {
    if (image.dataset.imageReady) return;
    image.dataset.imageReady = "1";
    image.addEventListener("error", () => {
      const placeholder = document.createElement("div");
      placeholder.className = "product-photo product-photo-placeholder";
      placeholder.setAttribute("role", "img");
      placeholder.setAttribute("aria-label", image.alt || "No image");
      placeholder.innerHTML = "<span>No image</span>";
      image.closest(".product-image-button")?.replaceWith(placeholder);
    });
  });

  if (document.body.dataset.imageLightbox) return;
  document.body.dataset.imageLightbox = "1";
  const dialog = document.createElement("dialog");
  dialog.className = "image-lightbox";
  dialog.innerHTML = '<button class="btn" type="button" aria-label="Close">×</button><img alt="" />';
  document.body.append(dialog);
  dialog.querySelector("button").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-image-preview]");
    if (!trigger) return;
    const image = dialog.querySelector("img");
    image.src = trigger.dataset.imagePreview;
    image.alt = trigger.getAttribute("aria-label") || "";
    dialog.showModal();
  });
}
