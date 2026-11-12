import { ValidationError } from "@/core/errors";
import { pickUniqueSlug, slugify } from "./slug";

/**
 * Slug rules shared by categories, brands and merchants (Release 3A).
 *  - Created: a slug typed by hand must be free; otherwise one is generated from the name, with -2, -3 ... on a clash.
 *  - Edited: a slug never changes silently. It changes only when it was edited AND the "I understand" box was
 *    ticked, and the change is written to the audit log. (Phase 7A adds the redirect from the old address.)
 * `findTaken(base)` returns the existing slugs equal to `base` or starting with `base-`.
 */
type FindTaken = (base: string) => Promise<readonly string[]>;

export async function resolveCreateSlug(opts: { name: string; explicit?: string; findTaken: FindTaken }): Promise<string> {
  if (opts.explicit) {
    const taken = await opts.findTaken(opts.explicit);
    if (taken.includes(opts.explicit)) throw new ValidationError("Slug already in use", { slug: "That slug is already in use. Choose another." });
    return opts.explicit;
  }
  const base = slugify(opts.name);
  if (!base) throw new ValidationError("No slug", { slug: "A slug could not be made from this name. Type one by hand." });
  return pickUniqueSlug(base, new Set(await opts.findTaken(base)));
}

export async function resolveUpdateSlug(opts: { current: string; requested?: string; confirmed: boolean; findTaken: FindTaken }): Promise<string> {
  if (!opts.requested || opts.requested === opts.current) return opts.current;
  if (!opts.confirmed) {
    throw new ValidationError("Slug change not confirmed", {
      slug: "Changing the slug changes the public address of this page. Tick the box below the field to confirm.",
    });
  }
  const taken = await opts.findTaken(opts.requested);
  if (taken.includes(opts.requested)) throw new ValidationError("Slug already in use", { slug: "That slug is already in use. Choose another." });
  return opts.requested;
}
