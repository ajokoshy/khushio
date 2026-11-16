import Link from "next/link";
import { notFound } from "next/navigation";
import { NotFoundError } from "@/core/errors";
import { PERMISSIONS as P } from "@/core/permissions";
import { hasPermission } from "@/core/permissions/guard";
import { requirePagePermission } from "@/core/permissions/require";
import { idSchema } from "@/core/validation/fields";
import { toAdminDateTimeInput } from "@/core/validation/datetime";
import { minorToInput, isCurrencyCode, DEFAULT_CURRENCY } from "@/core/validation/money";
import { cloudinaryConfigured, imageUrl } from "@/infrastructure/cloudinary";
import { ALLOWED_FORMATS, MAX_IMAGE_BYTES, MAX_IMAGES_PER_PRODUCT } from "@/infrastructure/cloudinary/upload-rules";
import { listLinksForProduct } from "@/modules/affiliate/service";
import { findBrandById, listBrandOptions, listCategoryChoices } from "@/modules/discover/service";
import { getProduct } from "@/modules/products/service";
import { ConfirmActionButton } from "@/shared/admin/confirm-action-button";
import { Notice } from "@/shared/admin/notice";
import { firstParam, type SearchParams } from "@/shared/admin/list-params";
import { archiveProductAction, deleteProductAction, restoreProductAction, updateProductAction } from "../actions";
import { ProductForm, type ProductFormValues } from "../product-form";
import { ProductImages } from "../product-images";
import { ProductStatusBadge } from "../status-badge";

export const metadata = { title: "Edit product", robots: { index: false } };

export default async function EditProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const session = await requirePagePermission(P.productWrite);
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) notFound();
  const id = parsed.data;
  const sp = await searchParams;

  let detail: Awaited<ReturnType<typeof getProduct>>;
  try {
    detail = await getProduct(id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const { product } = detail;

  const [brandOptions, categories, currentBrand] = await Promise.all([
    listBrandOptions(),
    listCategoryChoices(detail.categoryIds),
    product.brandId ? findBrandById(product.brandId) : Promise.resolve(null),
  ]);
  const brands = brandOptions.map((b) => ({ id: b.id, label: b.name }));
  // A product keeps its brand even after the brand is archived; show it so saving does not silently drop it.
  if (currentBrand && !brands.some((b) => b.id === currentBrand.id)) brands.unshift({ id: currentBrand.id, label: `${currentBrand.name} (archived)` });

  const canPublish = hasPermission(session.user.permissions, P.productPublish);
  const canSeeLinks = hasPermission(session.user.permissions, P.affiliateRead);
  const canEditLinks = hasPermission(session.user.permissions, P.affiliateWrite);
  const links = canSeeLinks ? await listLinksForProduct(id) : [];
  const initial: ProductFormValues = {
    name: product.name,
    slug: product.slug,
    summary: product.summary ?? "",
    description: product.description ?? "",
    brandId: product.brandId ?? "",
    status: product.status,
    publishAt: toAdminDateTimeInput(product.publishAt),
    isFeatured: product.isFeatured,
    primaryCategoryId: detail.primaryCategoryId ?? "",
    categoryIds: detail.categoryIds.filter((c) => c !== detail.primaryCategoryId),
    tags: detail.tags.join(", "),
    attributes: detail.attributes,
    variants: detail.variants.map((v) => ({
      id: v.id,
      label: v.label,
      sku: v.sku ?? "",
      price: minorToInput(v.priceMinor, isCurrencyCode(v.currency) ? v.currency : DEFAULT_CURRENCY),
      currency: v.currency,
    })),
  };

  const archived = product.status === "ARCHIVED" || product.status === "DISCONTINUED";
  const deleteBlocked = product.status === "PUBLISHED" || product.status === "SCHEDULED" ? "Archive this product first." : detail.affiliateLinks > 0 ? `${detail.affiliateLinks} affiliate link${detail.affiliateLinks === 1 ? " uses" : "s use"} this product.` : null;

  return (
    <>
      <p className="text-sm"><Link href="/admin/products" className="text-ink-600 underline">← Products</Link></p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl">{product.name}</h1>
        <ProductStatusBadge status={product.status} publishAt={product.publishAt} />
      </div>
      {product.status === "PUBLISHED" && <p className="mt-2 text-sm"><Link href={`/products/${product.slug}`} className="underline" target="_blank" rel="noopener">View on the site</Link></p>}

      <div className="mt-6">
        <Notice code={firstParam(sp.notice)} />
        <ProductForm mode="edit" action={updateProductAction.bind(null, id)} initial={initial} brands={brands} categories={categories} canPublish={canPublish} cancelHref="/admin/products" />
      </div>

      <ProductImages
        productId={id}
        images={detail.images.map((i) => ({ id: i.id, alt: i.alt, thumbUrl: imageUrl(i.publicId, "thumbnail") }))}
        uploadsEnabled={cloudinaryConfigured()}
        maxImages={MAX_IMAGES_PER_PRODUCT}
        maxMegabytes={MAX_IMAGE_BYTES / 1024 / 1024}
        accept={ALLOWED_FORMATS.map((f) => `.${f}`).join(",")}
      />

      {canSeeLinks && (
        <section className="mt-10 max-w-3xl border-t border-cream-200 pt-6" aria-labelledby="links-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="links-heading" className="text-xl">Where to buy (affiliate links)</h2>
            {canEditLinks && <Link href={`/admin/links/new?product=${encodeURIComponent(product.slug)}`} className="rounded-xl border border-forest-800 px-4 py-2 text-sm font-medium hover:bg-forest-100">Add link</Link>}
          </div>
          {links.length === 0 ? (
            <p className="mt-3 text-sm text-ink-600">No links yet. A published product with an active link shows a Buy button on its page.</p>
          ) : (
            <ul className="mt-3 divide-y divide-cream-200 rounded-card border border-cream-200 bg-cream-50 text-sm">
              {links.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <span>
                    <span className="font-medium">{l.merchantName}</span> <code className="text-xs">/go/{l.slug}</code>
                    {!l.isActive && <span className="ml-2 rounded-full bg-coral-100 px-2 py-0.5 text-xs text-coral-600">Inactive</span>}
                    {l.problem && <span className="ml-2 rounded-full bg-coral-100 px-2 py-0.5 text-xs text-coral-600" title={l.problem}>Blocked</span>}
                  </span>
                  {canEditLinks && <Link href={`/admin/links/${l.id}`} className="underline">Edit</Link>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="mt-10 max-w-3xl border-t border-cream-200 pt-6" aria-labelledby="danger-heading">
        <h2 id="danger-heading" className="text-xl">Archive or delete</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          {archived ? (
            <ConfirmActionButton label="Restore as draft" title="Restore this product as a draft?" description="It stays hidden until you publish it again." action={restoreProductAction.bind(null, id)} />
          ) : (
            <ConfirmActionButton label="Archive" title="Archive this product?" description="It disappears from the site. Nothing is deleted and you can restore it." action={archiveProductAction.bind(null, id)} />
          )}
          {!deleteBlocked && <ConfirmActionButton label="Delete" destructive title="Delete this product?" description="This cannot be undone. Its variants and image links are deleted too; the image files stay in the media library." action={deleteProductAction.bind(null, id)} />}
        </div>
        {deleteBlocked && <p className="mt-3 text-sm text-ink-600">Delete is not available: {deleteBlocked} Archive it instead.</p>}
        {!canPublish && <p className="mt-3 text-sm text-ink-600">Archiving needs the publish permission.</p>}
      </section>
    </>
  );
}
