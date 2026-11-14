# Images (Release 3B)

## How an upload works
1. In a product's edit screen, choose a file and press Upload.
2. The server (`getUploadSignatureAction`, needs `product:write`) returns a signature made with the API secret. It covers the folder `khushio/products`, the allowed formats and a timestamp. The secret itself never reaches the browser.
3. The browser sends the file straight to Cloudinary. It does not pass through Vercel (no bandwidth or function time used).
4. The browser reports Cloudinary's answer to the server (`addProductImageAction`). The server **verifies Cloudinary's response signature** (so the `public_id` cannot be invented), then checks: folder, format (jpg, jpeg, png, webp), 5 MB, 8000 px per side. A file that breaks a rule is deleted from Cloudinary again.
5. The file is recorded once in `media_assets` (the hash is Cloudinary's `etag`). Uploading the same picture again reuses the first row and removes the new copy.
6. A `product_images` row links it to the product with its own alt text and position. The first image is the main picture and the card picture.

## Delivery
Only four sizes exist (`src/infrastructure/cloudinary/images.ts`): thumbnail 160 square, card 480, product 800, editorial 1200, all `f_auto,q_auto`. Pages use `srcset`, explicit width and height (no layout jump), lazy loading, and eager loading only for the first two cards and the main product picture.

## Media library (`/admin/media`)
Lists every file with its size, default description and how many product images use it. Filter **Unused images** to find files nothing uses; those can be deleted (removed from Cloudinary first, then from the library). A file in use cannot be deleted.

## Second line of defence (do this once in the Cloudinary dashboard)
The server checks size after the upload, but Cloudinary can refuse earlier:
- Settings, Upload: restrict allowed formats; set a maximum file size (for example 5 MB) on the account or an upload preset.
- Settings, Security: leave "Strict transformations" off unless you also add the four profiles as named transformations.

## Manual checklist (needs a Cloudinary account)
- Upload a jpg: it appears with a preview; reload and it is still there.
- Upload a 6 MB image: refused with a message, and nothing is left in the Cloudinary folder.
- Upload the same file to a second product: reused (the media library still shows one entry).
- Move up, move down, edit the description, remove.
- Remove every image from a published product: refused.
- Unset `CLOUDINARY_API_SECRET` in a preview: the product screen says uploads are off.
