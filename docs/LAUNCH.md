# Launch checklist and deploy day (Release 7B)

Open **/admin/launch** in the admin: it checks everything the site can see about itself (settings, legal pages, products, admin accounts) and lists the by-hand items. This file explains each one and holds the page templates.

## 1. Before launch day
**Accounts and cost**
- [ ] Vercel plan suits a commercial site (the free Hobby plan is for non-commercial use; read Vercel's current terms).
- [ ] Spend alerts: Vercel (Settings > Billing > Spend management), Neon (Billing > usage alerts), Cloudinary (Settings > Account > usage alerts). Set each to about 50 percent of what you are willing to pay in a month.
- [ ] `docs/PERFORMANCE.md` final estimate filled from the three dashboards after a week on the preview or a soft launch.

**Domain**
- [ ] Domain added in Vercel (Settings > Domains), both `example.com` and `www.example.com`, one redirecting to the other.
- [ ] HTTPS padlock shows; `NEXT_PUBLIC_SITE_URL` is `https://your-domain` (Vercel Production variables, then redeploy).

**Environment variables (Production):** `DATABASE_URL` (pooled), `AUTH_SECRET` (32+ characters, different from every other environment), `CRON_SECRET`, the Cloudinary three, `NEXT_PUBLIC_ANALYTICS=vercel`. `CSP_ENFORCE` stays off until step 3.

**Legal pages** (Admin > Pages, status Published; the footer links them automatically): addresses must be exactly `privacy-policy`, `terms`, `affiliate-disclosure`, `contact`. Templates below. **They are starting points, not legal advice: have them reviewed for your business and country** (for India: consumer protection and the advertising-disclosure guidelines apply to affiliate content; if you collect personal data beyond what this site does, the DPDP Act duties apply).

**Content:** at least the products you want live; every product has a picture with a description (Admin > Media > Missing description filter) and an active affiliate link; the homepage layout is set (Admin > Homepage); the sitemap lists them (`/sitemap.xml`).

**Security:** open Admin > Users and remove accounts nobody needs; everyone uses their own login; the password from `set-admin.sql` was changed (docs/SECURITY.md incident log).

**Backups:** docs/BACKUP.md steps 1 to 3 done and the restore drill passed once.

## 2. Deploy day (in this order)
1. Run the SQL files not yet applied (7A and the 7B marker) on the **preview** Neon branch, then production after making a `backup-7b-<date>` branch.
2. Merge the pull request; wait for the Vercel production deployment to finish.
3. Note the **previous** deployment in Vercel > Deployments (the one you would promote to go back). Write its name here: ______.
4. Run the smoke suite against production: `SMOKE_BASE_URL=https://your-domain npm run test:smoke` (read-only, takes seconds). All green or stop.
5. Run the "Lighthouse budget" workflow (Actions tab) with the home page and one product path.
6. Open /admin/launch: nothing red.
7. In Google Search Console add the domain, submit `/sitemap.xml`.
8. In the Vercel dashboard switch on **Analytics** and **Speed Insights** for the project.
9. Click through by hand: home, a category, a product, a store link (it must reach the store through `/go/...`), search, an article, a legal page, the 404 page; then sign in to the admin and edit nothing.

**If it goes wrong:** Vercel > Deployments > the previous deployment > Promote to Production (instant, no data change). The database scripts are additive, so the old code keeps working. If a script itself damaged data, restore from the backup branch (docs/BACKUP.md).

## 3. First two weeks
- [ ] Day 1, 2, 3, 7: search the Vercel logs for `khushio.error` (errors) and `khushio.csp` (policy reports). Fix real errors. When a week passes with no `khushio.csp` lines for your own pages, set `CSP_ENFORCE=true` and redeploy.
- [ ] Day 3: Search Console > Pages: no unexpected "Excluded" reasons; Speed Insights shows real LCP, INP and CLS.
- [ ] Day 7: read the three usage dashboards, compare with the estimate, adjust alerts.
- [ ] Day 14: run `npm audit`; open the monthly Dependabot pull requests.

## Page templates
Replace the words in [square brackets]. Keep them short and true.

### privacy-policy
> **Privacy policy.** Last updated [date]. [Business name] ("we") runs [site address]. This page explains what we collect and why.
> **What we collect.** We do not ask visitors for accounts or personal details. We measure visits with cookie-free analytics (page views, country, device type, page speed); search words are not kept. When you click a store link we count the click (which link, which day) without storing your identity or address.
> **Cookies.** Visitors receive no cookies. Staff who sign in to the admin receive a sign-in cookie that is needed for the sign-in to work.
> **Other sites.** Store links take you to other websites with their own privacy policies and cookies. We are not responsible for them.
> **Our service providers.** The site runs on Vercel (hosting), Neon (database) and Cloudinary (pictures).
> **Your rights and contact.** To ask about your data, write to [email]. [Add any rights that apply in your country.]

### terms
> **Terms of use.** By using [site address] you agree to these terms. The site shows product information, prices and offers collected from stores. Prices and availability change without notice and may differ on the store's own site: the store's price at checkout is the price that counts. We try to be accurate but give no promise that information is complete or current. Purchases are made with the stores, not with us, and their terms apply. We may change or remove content at any time. [Add governing law and a contact for complaints.]

### affiliate-disclosure
> **Affiliate disclosure.** [Site name] earns a commission when you buy through some of our links, at no extra cost to you. Commission may influence which products we list, but it does not change the price you pay, and we say plainly when a product is one we would not recommend. Links that earn commission are marked in the page footer notice and go through [site address]/go/. Prices shown are as last checked and can change. Questions: [email].

### contact
> **Contact.** Questions, corrections or a store or brand you would like us to add: write to [email]. We read everything and reply within [number] working days. [Business name and address if you want to publish them.]
