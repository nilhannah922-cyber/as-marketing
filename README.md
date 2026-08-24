# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.

### Stock & Order Management App — complete build spec

## How to use this document with Antigravity (or any agentic coding tool)
Don't paste this and say "build everything." Follow the phased instructions at the bottom instead — paste the whole spec first so the agent has full context, confirm it understands, then greenlight one phase at a time and test each before moving on.

---

## Tech stack
- **Frontend:** React, built as a PWA (installable on mobile home screen, works as a normal tab on laptop/desktop browsers)
- **Backend:** Supabase (Postgres database + Auth + file Storage)
- **Barcode scanning:** camera-based, e.g. `html5-qrcode`
- **Fingerprint login:** WebAuthn (device-native biometric, set up per-device on first login — not something an admin configures centrally)
- **Hosting:** Vercel or Netlify (free tier), HTTPS required for WebAuthn and camera access
- **Currency:** LKR

## Design system
- **Colors:** background `#F7F8F5`, surface/cards `#FFFFFF`, border `#E4E6DF`, primary text `#1E2A22`, secondary text `#5B685E`. Primary/brand color: teal (`#0F6E56`, dark variant `#085041`) used for primary buttons, active nav, totals. Accent color: amber (`#BA7517` on `#FAEEDA` background) used for price tags, stock badges, category/product image placeholders. Danger/low-stock color: `#993C1D` on `#FAECE7` background.
- **Typography:** headings in "Sora" (weight 600–700), body and data in "Inter" (weight 400–600). Both loaded from Google Fonts.
- **Components:** fully rounded cards (12–16px radius), pill-shaped nav buttons, bottom-sheet modal for product quick view (slides up from bottom, rounded top corners only), stat cards in a 2-column grid, circular quantity +/- buttons.
- **Reference implementation:** the attached `app.jsx` file is the literal source of truth for all of the above — read its styles directly rather than re-interpreting this description.

## Roles
- **User:** create orders, manage customers/products, view all orders, view dashboard. Cannot delete users or permanently delete records.
- **Super admin:** everything a User can do, plus manage users, permissions, permanent delete, backup/restore.
- Default super admin seeded on first launch: username `Nihlan922`, password `NIH922nih##` — store as a securely hashed credential, never hardcoded in UI code, and prompt to change the password on first login.

## Core data model (Postgres, relational)
- `users` — id, name, mobile, email, password_hash, role (user/superadmin), created_at
- `categories` — id, name, description, image_url
- `products` — id, category_id (FK), name, sku, barcode, cost_price, selling_price, stock, image_url, description, created_by, created_at, updated_at
- `customers` — id, name, company, address, mobile, email, nic, bank_details, notes, balance
- `orders` — id, order_number (ORD-000001 style, auto-increment), customer_id (FK), total, paid_amount, status (unpaid/partial/paid), created_by, created_at
- `order_items` — id, order_id (FK), product_id (FK), quantity, unit_price
- `payments` — id, order_id (FK), amount, recorded_by, created_at
- `stock_history` — id, product_id (FK), change_amount, reason (order_created/order_edited/order_deleted/restock), created_at
- `deleted_orders`, `deleted_products`, `deleted_customers` — soft-delete recycle bin, restore or permanent-delete (super admin only)
- `audit_logs` — id, user_id, action, target_table, target_id, created_at

## Screens and flows

### Login
- Username/mobile + password
- Fingerprint (WebAuthn) as an alternative once set up on that device
- Stay logged in across sessions; explicit logout

### Home
- Header: Profile, Cart, Orders, Account summary, Manage
- Dashboard cards: today's sales, monthly sales, today's orders, pending orders, outstanding balance, total products, total categories, total customers, low stock count
- Categories grid (2 columns), searchable and sortable
- Footer: 4 business phone numbers, always visible

### Category → Products
- Products grid (3 columns): image, name, price, stock, low-stock indicator
- Tap product → bottom-sheet quick view: image, name, description, price, stock, quantity selector, "Add to cart" (blocks over available stock)

### Cart
- List view: image, name, price, qty +/-, remove (with confirm)
- Live subtotal/grand total
- Select customer (search from existing customers)
- Confirm order (creates order, decrements stock, generates ORD-###### number) / Cancel order (confirm before clearing)

### Orders
- List: search, filter (today/yesterday/this week/this month/paid/partial/unpaid), sort
- Order card: order number, customer, date, total, payment status, created by
- Order detail: editable line items (qty +/-, remove, stock auto-adjusts), record payment (supports partial payments, auto-updates status and customer balance), delete order → recycle bin

### Manage
- **Customers:** list + search, add/edit customer (name, company, address, mobile, email, NIC, bank details, notes), customer detail shows orders + ledger + outstanding balance
- **Products:** categories grid → add/edit/delete category; products grid per category → add/edit/delete product, barcode scan/search, image upload, restock action, recycle bin
- **Admin panel** (super admin only, re-auth required): add/edit/delete users with role assignment, permissions

### Settings
- Theme (light/dark), currency, backup/restore, about, logout

### Reports
- Sales, stock, customer, outstanding — daily/monthly — export PDF/Excel

### Recycle bin
- Deleted orders/products/customers — restore (any user) or permanent delete (super admin only)

## Behavior rules (the gaps we caught and fixed)
- Stock can never go negative — block adding to cart or increasing order quantity past available stock
- Deleting/reducing an order item restores stock automatically
- All deletes are soft-deletes into a recycle bin — nothing is permanently gone except explicit super-admin permanent delete
- New users must have a role assigned at creation (user or superadmin)
- Global search covers products, customers, orders, and categories

## Feature additions

### Typeable quantity inputs on order line items

The order detail screen quantity control for order line items now supports typing quantities directly in addition to clicking the `+`/`-` buttons.
- **State Synchronization**: The typeable number field is displayed between the `+` and `-` buttons, and is kept in sync with button clicks and database updates.
- **Client-Side Validation (Blur/Submit)**: When typing, validation occurs when the field loses focus (`onBlur`) or when the user presses `Enter`:
  - **Numeric & Integer Check**: Only positive whole integers are accepted. Invalid inputs are rejected and reverted.
  - **Zero Check**: Zero (`0`) is blocked. Removing an item from an order must be done via the explicit delete confirmation flow (clicking `✕` or clicking `-` to reduce the quantity to 0 and trigger confirmation) to prevent accidental deletions.
  - **Stock Limit Verification**: Quantities that exceed available stock are blocked. Available stock is calculated dynamically as `current product stock + current line item quantity` (since increasing the quantity draws from stock, while decreasing it returns stock).
- **Failure Recovery**: If a quantity change fails on the database side (e.g. database error), the input value automatically reverts to the previously committed quantity. No database schema changes are required.

### Category filter on Bulk stock update

The Bulk stock update screen (Manage → Products → Bulk stock update) now features a category selection panel at the top to filter the product list.
- **Pill-Based Navigation**: The selection panel displays horizontally-scrollable category pills, reusing the consistent app styling pattern.
- **Single-Select Filtering**: A single category can be selected at a time to filter the products list.
- **Default State**: An "All Categories" pill is active by default, listing all products (preserving the original screen behavior).
- **Combined Filtering**: The category filter works in combination with the existing product search field (searching name, SKU, or barcode). When active, only products matching both the category selection and the search text query are shown. If no products match, a friendly message is displayed. No database changes are required.

### Make an order quick entry

Home → **Make an order** opens a faster category-first ordering screen as an alternative to browsing the dashboard category grid. The first available category opens automatically, horizontally scrollable category chips switch instantly using the categories and products already loaded in application state, and the selected category uses the existing product-card grid with image, name, selling price, stock, and low-stock state. Selecting a product opens the existing product QuickView sheet, so quantity selection, selling-price handling, stock validation, add-to-cart confirmation, and the shared cart are unchanged. A Back to Home action returns to the normal dashboard.

### Selectable stock report by category and product

Reports → **Stock** now includes an expandable category/product selection panel. Individual product checkboxes, category-level select/deselect controls with indeterminate state, and a global **Select all products** checkbox determine the report contents. With no selection, the report shows a clear selection prompt rather than all inventory. Selected report rows are grouped under category headings while preserving the existing Product, SKU, Barcode, Current Qty, Period Movement, Cost Price, Stock Value, and State columns. Existing PDF/print and Excel exports use only the current selection and retain the same category grouping. No database changes are required.

### FIFO sales costing and profit reporting

Inventory is costed by receipt batch instead of using only the product's latest/default cost price. Product creation, manual restock, bulk stock additions, stock entries, and received purchase orders create `stock_batches`; sales consume the oldest available quantities first and write each allocation to `order_item_batch_usage`. Order edits, deletion, and returns restore quantities to the exact batches originally consumed. Reports → **FIFO Cost & Profit** calculates cost exclusively from each order line's `order_item_batch_usage.cost_price_at_time`, never from `products.cost_price`.

Reports → **Stock** provides two optional controls, **Include cost price** and **Include stock value**, both unchecked by default. With both unchecked, the report uses the original simple presentation: one row per selected product with its total available quantity and no batch/cost/value columns. Enabling either option reveals every active batch with remaining quantity and receipt source/date, plus only the requested cost/value columns. A visually distinct product subtotal containing total quantity, weighted-average cost when requested, and total value when requested appears only when that product has more than one active batch; a single-batch product needs no duplicate rollup row. A final grand-total row rolls up only the currently selected products, including blended weighted cost and/or total stock value. The screen, PDF/print output, and Excel export all use the same active options, subtotals, and grand total.

The on-screen Stock report retains period movement for operational review, while PDF/print output intentionally omits both the **Net movement** summary and **Period Movement** column for a cleaner inventory document. Excel continues to retain movement data for analysis.

Product and category browsing intentionally continue to show aggregate stock quantities. The quick view and Product Add/Edit form label `products.cost_price` as the **default cost for the next manual/bulk batch**; editing it does not rewrite or average existing batches. Manual Adjust Stock and Bulk Stock Update require/retain a cost for every positive addition and create independent FIFO batches at that cost. Negative manual adjustments consume existing batches oldest-first. Stock-entry documents persist and display the effective cost on every line, including when the product default was used, and PO receiving displays and records each line's `unit_cost` as the new batch cost. Detailed batch figures are required on reports and receiving/cost-sensitive screens, while aggregate figures remain intentional on browsing and selling screens where users primarily need total availability.

A separate profitability report was chosen so the operational Sales report remains compact. New database objects are `stock_batches`, `order_item_batch_usage`, FIFO helper functions, and `order_item_batch_usage.returned_quantity`. Run `schema.sql` first for a new Supabase project, then run the idempotent `fifo_returns_migration.sql`; existing projects run the migration once to add and backfill the FIFO structures.

### SweetAlert2 notifications and confirmations

SweetAlert2 now provides app-wide success, warning, and error notifications plus confirmation dialogs. Destructive operations use a distinct warning icon and danger-colored action, while committed async actions show a loader and block repeat interaction. Database restore, order deletion/returns, payments, stock entry, PO receiving, and stock adjustments all confirm before writing. This replaces the former custom toast and `ConfirmDialog` system and introduces no database fields.

### Transport / courier name

Order detail requests a transport or courier name when an order advances from **Packed** to **Given to transport**, then displays it in the fulfillment section. The value is required because an unnamed transport handoff is not operationally useful. The new nullable `orders.transport_name` field remains empty for orders that have not reached that stage.

### Printable order invoice

Order detail includes **Print bill** for every order and labels the action **Download / Print invoice** once delivery is complete. The print-ready invoice contains AS Marketing contact details, order and customer information, item quantities/prices/subtotals, total, payment state, paid amount, and outstanding amount. It uses the existing browser print workflow, allowing users to print or save as PDF without another PDF dependency or database change.

### Partial order returns

Order detail → **Return** supports partial quantities for any active fulfillment stage. The confirmation form validates each quantity and includes **Select all** to fill every line with its remaining returnable quantity. Database failures are retained and displayed inside the dialog instead of leaving its async loader unresolved. Committing a return restores the exact FIFO batch allocations, increases aggregate product stock, reduces the order total and customer outstanding balance, recalculates payment status, records `stock_history.reason = order_return`, and writes an audit log. Partial returns remain on order detail; once every line is fully returned, the user is redirected to the Orders page. In Order History, an order with recorded returns shows **RETURNED** in place of its Pending/Packed/Given to transport/Delivered fulfillment badge; its payment badge remains separate. Order Detail also displays a **Returned items** badge. New fields are `orders.has_returns`, `order_items.returned_quantity`, and `order_item_batch_usage.returned_quantity`.

### Return payment resolution and customer credit

Every partial or full return uses one calculation regardless of payment state: `returned_value = sum(unit selling price × returned quantity)`, `new_order_total = original_order_total − returned_value`, and `new_balance = new_order_total − amount_already_paid`. Customer outstanding is updated from that result. Only when the paid amount exceeds the new order total does an additional SweetAlert step appear. Staff can either refund the overpayment using a selected method (**Cash**, **Bank transfer**, **Card reversal**, or **Other**) or add it to the customer's stored credit. Refunds are written to the new `refunds` table (`order_id`, amount, method, recorder, and timestamp); credits accumulate in the new `customers.credit_balance` field and the order records the attributable amount in `orders.return_credit_amount`. Order Detail shows refunds and return credits, and Accounts → Customer Ledger shows a positive available credit balance. Applying stored credit to a future checkout is intentionally not implemented in this pass.

### Customer payment allocation across orders

Accounts & Ledgers now provides **Record payment** for customers with an outstanding balance. Staff enter one received amount and review a confirmation preview before committing. The payment is allocated to the customer's active unpaid or partially paid orders by order date, oldest first. Each affected order receives its exact allocation in `paid_amount`, recalculates independently to paid or partial status, and gets a separate row in the existing `payments` table; both the overall customer action and every order allocation are also written to `audit_logs`.

When the entered amount is greater than the customer's combined outstanding balance, the same resolution used by order returns is required: refund the excess using the existing `refunds` table and a selected method, or add it to `customers.credit_balance`. Because `refunds.order_id` is required, a customer-level excess refund is associated with the final order in the allocation. The operation is implemented by the transactional `record_customer_payment` database function in `account_payment_migration.sql`, ensuring allocations, excess handling, balances, and audit records commit together. Existing Supabase projects must run this migration once before using the action.

### Footer contact numbers

The Home footer now lists `0757451414`, `0752222895`, `0788517272`, and `0754004708`. These numbers also appear as the business contact line on printed invoices. No database change is required.

### AS Marketing app name

The authenticated header now displays **AS Marketing** instead of **Stock & Order**. This is a presentation-only branding change with no database impact.

### Responsive rebuild step 1: breakpoint foundation and shared containers

The first step of the responsive rebuild establishes three shared viewport tiers: **mobile** up to 640px, **tablet** from 641px through 1024px, and **desktop** from 1025px upward. The authenticated content container now targets a maximum width of 480px on mobile, 900px on tablet, and 1200px on desktop, allowing the existing screens to use the available tablet and desktop space without changing their internal layouts.

The breakpoint values are implemented as the CSS custom property `--app-content-max-width` in the already-loaded `index.css`. The inline `S.main` and `S.headerInner` styles consume that property. This mechanism keeps the existing inline style system intact while giving shared container-level styles a real CSS media-query foundation, avoiding a broad and disruptive component-style migration at this stage. The header background still spans the viewport, while a new inner header container uses the same responsive width and horizontal padding as the page content so navigation and screen content remain aligned.

This is intentionally only step 1 of a multi-step responsive rebuild. Grid column counts, modal and bottom-sheet behavior, and dense screen-specific layouts have not been changed yet; those adaptations will follow in later steps.

### Order packing and fulfillment
Every new order starts with `pack_status = pending`. From the order detail screen, staff advance it one stage at a time: `pending` (awaiting packing) → `packed` (packaging complete) → `given_to_transport` (handed to delivery) → `received`, displayed to users as **Delivered** (delivery confirmed). The stored value remains `received` for backward compatibility. Transitions are forward-only and every change is written to `audit_logs` with user, previous stage, next stage, and timestamp. Order cards and details show stage-specific badges, the Orders list can filter by packing stage, and the header Orders badge counts only active orders still at `pending`.

### Order text copy
The order detail screen includes **Copy to clipboard**, producing a WhatsApp/SMS-friendly plain-text summary with order metadata, creator, all available customer contact details, fulfillment/payment status, item quantities and actual charged unit prices, and totals. It uses the Clipboard API with a legacy browser fallback and confirms success with a toast.

### Stock-entry review and supplier link
Manage → Stock Entry cards open a read-only detail view containing reference, date, creator, optional supplier, and every received item with quantity and recorded cost. The entry form has an optional searchable supplier selector; entries can still be saved without one. `stock_entries.supplier_id` is a nullable foreign key to `suppliers.id`.

### Supplier management correction
Manage → Suppliers now has explicit loading, empty, and database-error states and full field display. Supabase add/edit operations use explicit column mappings (`name`, `contact_person`, `mobile`, `email`, `address`, `notes`) and return the persisted row before refreshing the list. The earlier compressed implementation hid database failures and made verification difficult even though its basic mappings were intended to match the table.

Existing Supabase projects must run `pack_status_migration.sql` once before using this feature. New projects receive the field from the complete `schema.sql`.

Existing Supabase projects must also run `stock_entry_supplier_migration.sql` once to enable optional suppliers on stock entries.

### Typeable cart quantity
The product quick-view sheet keeps the `+`/`-` controls and adds a synchronized number field. Typed quantities are validated before checkout: non-numeric, zero, negative, and above-stock values are rejected or clamped. The sheet also shows cost price and allows staff to edit the selling price for that cart line. The negotiated price is copied into `order_items.unit_price`, so totals and reports use the actual charged price; it never updates `products.selling_price`. Cost price is currently visible to both User and Super admin roles, matching the existing pricing access rules. This lives in Category → Product quick view and needs no database changes.

### Bulk stock update
Manage → Products → Bulk stock update lists searchable products with an empty "Quantity to add" field. Current stock remains visible as read-only reference, and the app calculates the resulting total. A per-product confirmation summary precedes one save action; every changed product records the added quantity in `stock_history` with reason `bulk_update`. This extends the allowed `stock_history.reason` values.

### Stock-entry documents
Manage → Products → Stock entry records deliveries/counts containing multiple product lines, optional cost-price changes, a generated `STK-######` reference, creator, and date. Saving adds quantities rather than replacing stock and logs `stock_entry` movements. Past entries can be reviewed. New tables: `stock_entries` and `stock_entry_items`.

### Suppliers and purchase orders
Manage → Suppliers maintains supplier contact details. Manage → Purchase Orders supports searchable/filterable purchase orders, draft/ordered creation, and partial or complete receiving. Receipts increase stock, update product cost, log `po_received` movements, and update PO status. New tables: `suppliers`, `purchase_orders`, and `purchase_order_items`.

### Category stock message export
The Home Categories area has an Export stock action with multi-select checkboxes. It creates a plain-text category/product stock summary with low-stock flags, which can be copied or shared through the Web Share API (copy fallback). No database changes are needed. PDF category export is intentionally deferred as a possible future printable/archive enhancement.

For an existing Supabase project, run `feature_additions.sql` once in the SQL editor. New projects can use the complete `schema.sql`.

## Phase 5 final pass

The final implementation review is complete. Navigation routes are connected, Settings and Reports are reachable, stock and order workflows have explicit empty/error states, and the project passes lint and a production PWA build.

Final-pass corrections include:

- Payment recording now adjusts customer outstanding balance exactly once. Earlier schema logic allowed both the order-balance trigger and payment trigger to deduct the same payment.
- Recycle-bin records can be permanently deleted by Super admins after an irreversible-action confirmation. Database foreign-key rules still prevent unsafe deletion of referenced records.
- Bulk and receiving workflows retain complete `stock_history` movements.
- Biometric-unavailable guidance uses the app notification system instead of a blocking browser alert.
- Hook dependencies and unused code paths were cleaned so lint completes without warnings.

Existing Supabase projects must run `phase5_migration.sql` once to install the payment-trigger correction. This is in addition to `feature_additions.sql` when the inventory additions have not already been installed.

Before production deployment, configure real Supabase credentials and storage buckets, run both migrations as applicable, and perform browser/device acceptance testing for WebAuthn, barcode camera access, PWA installation, backup/restore, and role policies. Local mock mode remains intended for development and demonstration.

---

## Step-by-step instructions for Antigravity

**Step 0 — Context load (no code yet)**
Paste this entire spec plus attach `app.jsx`. Prompt:
> "Read this full spec and the attached app.jsx. Don't write any code yet. Confirm you understand the data model, the roles, and the four build phases below, and summarize your plan for the Postgres schema."
Review its summary before proceeding — this is where you catch a misunderstanding while it's cheap to fix.

**Step 1 — Foundation + Phase 1**
> "Set up a new React PWA project connected to Supabase. Create the full Postgres schema from the spec. Then build only: login (username/password, with a WebAuthn stub for fingerprint), home dashboard, categories grid, product quick view, and cart with checkout. Match the visual design of the attached app.jsx exactly — same colors, fonts, and component style. Stop after this and tell me how to run it."
Test it yourself: log in, add to cart, confirm an order, check Supabase to see the row was actually created.

**Step 2 — Phase 2**
> "Now build the Orders section: orders list with search/filter/sort, order detail with editable line items, record payment (supporting partial payments), and delete-to-recycle-bin. Keep the same design system."
Test: create an order from Phase 1, then find and edit it here; confirm stock and customer balance update correctly.

**Step 3 — Phase 3**
> "Now build the Manage section: customers (list, add/edit, ledger view), products/categories (add/edit/delete, barcode scan, image upload, restock), and the admin panel (add/edit/delete users with role assignment, re-auth required to enter)."
Test: add a real product, add a real customer, create a new user with each role, confirm permissions actually differ.

**Step 4 — Phase 4**
> "Now build Settings (theme, currency, backup/restore) and Reports (sales/stock/customer/outstanding, PDF/Excel export)."

**Step 5 — Final pass**
> "Review the whole app against the original spec. List anything missing, any placeholder code, or any TODOs left. Fix them."
