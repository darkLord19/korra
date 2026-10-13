# Guided flow redesign: design

Date: 2026-10-13. Status: approved in conversation (sections 1–3); defaults below were decided without review.

## Goal

Make Korra extremely simple, guided, inviting, and easy on both phone and desktop. Users should always see the one next thing to do, do it in a focused flow, and be handed the next task when they finish.

Scope: the whole app (`packages/ui` screens, the `apps/local` shell, and the `apps/web` routes, including CA read-only views). This is a UX/UI rework. The domain, backend, `KorraApi` methods and DB stay as they are. Approach: **replace in place**. Both apps are updated in the same change, and old components are deleted.

## Decided without you (override if wrong)

1. **Payments, matches and NOC links** move to a collapsed "Payments & matches" disclosure at the bottom of the month page (`/months?m=`). They are shown always and stay closed by default.
2. **Tracker:** there's no tracker tab. `TrackerView` is restyled as a "Payments due" list on the **Months** index, under the month list. `/tracker` redirects to `/months`. The `apps/web` CA route `/ca/[ownerId]/tracker` keeps rendering `TrackerView` with the new style.
3. **CA read-only:** `MonthView readOnly` and `PackView readOnly` stay as exported presentational views in the new style. `MonthView readOnly` shows invoice cards; tapping one opens the sheet with no edit controls and no payments disclosure actions. `PackView readOnly` shows summary + "What's inside" downloads, with no Sign/Send/Done steps.
4. **Data safety (apps/local):** the `KeepTrackingCard` is removed.
   - Backup becomes a Home task `backup`, an FYI task for the `apps/local` adapter only, via an optional `extraTasks` prop on `HomeScreen`. It appears after the first pack is generated whenever the last backup is older than the last change or missing.
   - The storage-not-protected warning stays in `SafetyBanners` in the shell.
   - The Done step of the pack flow shows a "Download a backup" secondary button when the app passes `afterSubmit` content (the slot used by `apps/local`).
5. **Settings** keeps `ProfileForm` (with AD code, RM email and branch), plus signature, backup/export panels, privacy and data, restyled as grouped cards.
6. **Exporter missing-field blockers** link to `hrefs.settings()`. Before setup they don't occur, because the setup task comes first.
7. **Landing page:** restyled in the new direction with the same copy structure, shortened. Its CTA goes to `/home`.
8. **Animations** are CSS-only (keyframes) and respect `prefers-reduced-motion`. No animation library, no web fonts: the strict CSP in `apps/local` must keep passing.

## 1. Foundations

### Theme: "Bright & friendly" (`packages/ui/src/styles.css`)

Keep the token names. Change the values and add a few new tokens.

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#ffffff` | `#120f24` |
| `--surface` | `#ffffff` | `#1b1735` |
| `--surface-soft` (new) | `#f5f3ff` | `#231e44` |
| `--ink` | `#1b1740` | `#ecebff` |
| `--muted` | `#6a6790` | `#a5a2c8` |
| `--line` | `#ece9ff` | `#2e2856` |
| `--accent` | `#6c5ce7` | `#a99bff` |
| `--accent-2` (new, gradient end) | `#a66cff` | `#c39bff` |
| `--accent-ink` | `#ffffff` | `#120f24` |
| `--accent-soft` | `#f0edff` | `#2a2452` |
| `--flag` / `--flag-soft` | `#9a5b00` / `#fff3cc` | `#f2c45c` / `#3a2f12` |
| `--danger` / `--danger-soft` | `#d2462a` / `#ffe3dc` | `#ff9d88` / `#3d1d17` |
| `--ok` / `--ok-soft` | `#1f8a5b` / `#dcf7ea` | `#7fe0b0` / `#173327` |

- **Fonts:** `--font-sans` and headings use `ui-rounded, "SF Pro Rounded", ui-sans-serif, system-ui, ...`. The serif is dropped. Headings are weight 800.
- **Radii:** cards `rounded-2xl`, inner items `rounded-xl`, buttons and chips `rounded-full`.
- **Tap targets:** at least 44px, and inputs use a 16px font size on mobile, so iOS doesn't zoom.
- **Utility:** `.hero-gradient` (`linear-gradient(135deg, var(--accent), var(--accent-2))`).
- **Keyframes:** `pop-in` and `confetti`, both disabled under reduced motion.

**Components to restyle in place:** `Button` (`primary` uses `rounded-full` and a bold label; adds `size="lg"` for sticky actions), `Card`, `Badge` (becomes the "chip"), `Input`, `Select`, `Alert`, `Field`.

**New components:**
- `Sheet`: a bottom sheet on mobile and a right drawer on desktop; uses `<dialog>`, traps focus and closes on Escape.
- `Skeleton`
- `EmptyState`
- `ProgressDots`
- `IconBubble`: an emoji in a tinted rounded square.

`Stepper` is deleted.

### Navigation contract: `KorraNav.hrefs`

The new `hrefs` shape:

```ts
hrefs: {
  landing(): string;           // marketing page
  home(): string;              // to-do list
  task(id: string): string;    // a flow, opened from Home
  months(): string;            // months index (+ payments due)
  month(month: string): string;
  pack(packId: string): string; // standalone pack page (CA + deep links); owner flows use task("submit:<packId>")
  settings(): string;
}
```

`onboarding()` and `tracker()` are removed.

| | apps/local | apps/web | CA (`ClientNav`) |
|---|---|---|---|
| `home` | `/home` | `/home` | `/ca/[ownerId]` |
| `task(id)` | `/home?task=<id>` | `/home?task=<id>` | `/ca/[ownerId]` (no flows) |
| `months` | `/months` | `/months` | `/ca/[ownerId]/months` (the existing tracker page moves here, or redirects) |
| `month(m)` | `/months?m=YYYY-MM` | `/months/<m>` | `/ca/[ownerId]/months/<m>` |
| `pack(id)` | `/pack?id=…` | `/packs/<id>` | `/ca/[ownerId]/packs/<id>` |

**Redirects:**
- apps/local: `/month?m=` goes to `/months?m=`, `/tracker` to `/months`, `/onboarding` to `/home`.
- apps/web: `/onboarding` goes to `/home`, `/tracker` to `/months`.
- CA: `/ca/[ownerId]/tracker` is kept as an alias of `/ca/[ownerId]/months`.

### Shell: `AppShell` (packages/ui)

Props: `{ nav items implied by hrefs, header?: ReactNode (app extras), banners?: ReactNode, footer?: ReactNode, children }`.

- **Below 768px:** a sticky top bar with the logo, a fixed bottom tab bar (Home 🏠 · Months 🗓 · Settings ⚙️) with safe-area padding, and content padded so nothing sits under the tabs. The active tab is chosen by a `current: "home" | "months" | "settings"` prop.
- **768px and up:** the top bar shows the tabs as pills; there's no bottom bar.
- **Kept:** the skip link, `id="main"` on the main element, and the slots for `BootGate`, `PrivacyNotice`, `SafetyBanners` and the "stored only in this browser" line. In apps/local these are supplied through the layout.

`apps/local/src/lib/flow.ts`, `MainNav` and `KeepTrackingCard` are deleted, and `flow.spec.ts` is rewritten. Nav is always visible.

## 2. Home and tasks

### `deriveTasks` (`packages/ui/src/home/tasks.ts`, pure, unit-tested first)

```ts
type TaskKind = "setup" | "upload" | "review" | "generate" | "submit" | "realisation" | "backup";
interface Task { id: string; kind: TaskKind; title: string; detail: string; due?: string; urgency: "urgent" | "soon" | "fyi"; month?: string; packId?: string; invoiceId?: string; adBankId?: string; icon: string }
interface TaskInput { onboarding: OnboardingWire; months: { month: string; state: MonthStateWire }[]; packs: PackWire[]; tracker: TrackerWire; today: string /* YYYY-MM-DD IST */ }
function deriveTasks(input: TaskInput, extra?: Task[]): { hero: Task | null; rest: Task[]; done: DoneItem[] }
```

**Rules:**
- If onboarding is incomplete, return only `setup` (id `setup`).
- The month inputs are the current month and the previous month (IST).
- **`upload`** (id `upload:<m>`): created when the month has no invoices and no pack. It is skipped for the current month during its first 5 days, when there's usually nothing to upload yet.
- **`review`** (id `review:<m>`): created per month when `blockersByBank` contains `flagged_field` or invoice `missing_field` items.
- **`generate`** (id `generate:<m>:<adBankId>`): created when that bank has no blockers and no pack.
- **`submit`** (id `submit:<packId>`): created for every pack not yet submitted, whichever month it belongs to.
- **`realisation`** (id `realisation:<invoiceId>`): created for a tracker row that isn't realised and is due within 60 days or overdue.
- **Exporter `missing_field`:** an urgent `review`-like task titled "Finish your details", which links to settings.

**Urgency:**
- `urgent`: an overdue item, or an EDF due within 7 days (`edfDueDate`).
- `soon`: an EDF due within 30 days, or a realisation due within 30 days.
- Everything else is `fyi`.

**Sorting:** by urgency, then by due date ascending, then by kind order `setup, review, generate, upload, submit, realisation, backup`. The first task becomes the `hero`. `done` holds up to 5 recent submitted packs and realised invoices.

### `HomeScreen`

**Data:** `getOnboarding`, `getMonthState` for the current and previous month, `listPacks()` and `getTracker()`, loaded in parallel. Skeletons show while loading; polling (`use-poll`) runs while any document is `uploaded`/`ingesting`.

**Layout:**
- **Mobile:** a greeting ("Hey 👋" plus the exporter's first name, if any), a headline summarising the state, the hero card (`.hero-gradient`, the due line, a title and a big white pill button), the rest as rows (`IconBubble`, title, chip), then "Recently done".
- **Desktop (`lg`):** two panes. The left pane (~380px) holds the list, with the selected task highlighted. The right pane renders the flow for `?task=`. With no task selected, it shows the hero task's flow preview or `EmptyState`.
- **Mobile with `?task=`:** the flow renders full screen instead of the list.

**Empty state:** "You're all caught up 🎉", the next EDF opening ("November invoices: EDF due 31 Dec"), and an "Add invoices" button that goes to `task("upload:<current>")`.

**Prop:** `extraTasks?: Task[]`, which apps/local uses for the backup task.

**Task routing (`TaskFlow` switch):**

| Task kind | Flow |
|---|---|
| `setup` | SetupFlow |
| `upload` | UploadFlow |
| `review` | ReviewFlow |
| `generate` / `submit` | PackFlow |
| `realisation` | opens the month page anchored to the invoice sheet |
| `backup` | app-provided render via the `renderExtraTask` prop |

An unknown task id shows "That's already done ✓" and a link back to Home.

## 3. Guided flows

### `FlowFrame`

Props: `{ title, step?: { index, total }, onClose, primary?: { label, onClick, disabled, pending }, secondary?: {...}, children }`.

- **Header:** a close (✕) or back control, the title, and `ProgressDots`.
- **Body:** scrolls.
- **Action bar:** sticky at the bottom on mobile (safe-area aware), inline at the end of the pane on desktop.

On completion, a flow calls `onDone(nextTaskId?)`. Home then recomputes the tasks and navigates to the next one, showing a short "Nice! Next up: …" toast (an `aria-live` region).

### SetupFlow (invoice-first, falling back to the wizard)

1. **Drop an invoice:** a big drop zone that reuses `InvoiceFill`/`extractProfileFromInvoice`. The secondary link is "No invoice handy? Fill it in yourself".
2. **Is this you?** A summary list of name, address, GSTIN and PAN. Each row has a ✎ that turns it into an input. Fields the invoice couldn't fill are shown as inputs straight away. GSTIN→PAN and the mismatch warning are reused (extract that logic from `ProfileForm` into `lib/profile.ts` so both use it).
3. **Your bank:** a tappable list of `BANK_CATALOG` entries plus "Other bank" (with a name input). This step is skipped when the suggestion already set the bank. The "Change" link is still shown on the summary.

**Saving:** `saveBank` (name only; AD code, email and branch are empty) and `saveProfile`, as in `ProfileForm.submit`. If an invoice was used, the flow files it directly: `uploadFile(file, { month: invoiceMonth ?? currentMonth, hint: "invoice" })`. That replaces `pending-invoice.ts` (delete it).

**Next task:** `review:<m>` if anything is flagged after reading, otherwise `upload:<m>`, otherwise Home.

### UploadFlow (`upload:<m>`)

- **Upload:** a drop zone ("Drop invoices or a Deel CSV") that reuses the `UploadPanel` internals, without the hint select. Files appear in a live list with Reading… / Read ✓ / Failed states, polling the month state.
- **Primary button:** "Continue", enabled once nothing is reading. It goes to `review:<m>` if anything is flagged, otherwise to `generate:<m>:<bank>`.
- **Secondary link:** "Add an invoice by hand" opens `ManualInvoiceForm` inside a Sheet.

### ReviewFlow (`review:<m>`)

- **The queue:** one item per flagged or missing invoice field, from `blockersByBank`, grouped by invoice and ordered by invoice and then by field.
- **Card:** "Korra read **{value}** as the {field label} on {invoiceNo}", the confidence as words ("not sure", "fairly sure") with the %, and the source file name.
- **Buttons:** **Looks right** (`editField` with the current value unchanged; the backend treats a user edit as confirmed) and **Fix it** (an inline input of the field's kind). Extract the per-kind input from `EditableCell` into `month/FieldEditor.tsx` so `EditableCell` and ReviewFlow share it. The money→minor conversion stays in that one place. Missing fields open straight to the input.
- **Several flags on one invoice:** an extra "Everything on {invoiceNo} looks right" button that calls `confirmAllFields`.
- **Navigation:** Skip moves the item to the end. `ProgressDots` show the position.
- **When the queue is empty:** "All checked ✓", then the primary button "Make my pack" goes to `generate:<m>:<bank>`, or Home if there's no bank.

### PackFlow (`generate:*` → Make; `submit:<packId>` → Sign)

Steps: **Make → Sign → Send → Done**, with `ProgressDots` showing 4 steps.

- **Make:** a summary (invoice count, totals via `money`, bank name), plus the placeholder-layout `Alert` if needed. "Make my pack" calls `generatePack` and shows a CSS "building" animation, then the URL replaces to `task("submit:<packId>")`. The AD code is optional everywhere (banks can fill it in on the EDF). The Send step offers an optional inline AD-code input when it is empty, saved via `saveBank`.
- **Sign:** `SignaturePad`. If a signature is saved, the step shows it with "Use this" and "Redraw". The secondary button is "My bank needs a wet signature" (skip). Regenerating after signing works as `PackView.handleRegenerate` does today.
- **Send:** the first channel in `submission.channels` is shown as the recommended one. The others sit under an "Other ways to send" disclosure.
  - **Email:** if `bank.contactEmail` is missing, there's an inline email input (saved via `saveBank`). Then a draft preview and an "Open in email app" button (the `buildMailtoUrl` logic, moved to `pack/mailto.ts`).
  - **Portal and branch:** the steps are rendered from the channel data.
  - **Downloads:** a "Download pack" primary download with a "What's inside" disclosure (files with their `fileDescription`).
- **Done:** an "I've sent it" button (`markPackSubmitted`), the existing ack upload kept as optional, and a confetti burst (CSS). Then the `afterSubmit` slot (apps/local passes the backup nudge) and "Next up: …".

`PackScreen` and `PackView` (used by `/pack?id=` and the CA pages) render a non-flow version:
- **Owner:** the same steps, embedded at full width.
- **readOnly:** the summary and downloads only.

## 4. Months and the invoice sheet

### Months index (`MonthsScreen`)

The last 12 months that have data, plus the current month, as cards. Each card shows the month, invoice count, totals and a stage chip: "Nothing yet", "To check", "Ready to make", "Not sent", "Sent ✓". Below them, a "Payments due" section renders the restyled `TrackerView` content.

### Month page (`MonthScreen` / `MonthView`)

- **Header:** the month title, prev/next arrows, the stage chip, and a primary button for the month's next task, if any (it links to `task(id)`).
- **Invoice cards:** client, number, date, amount, and status chips (flags, realisation). Tapping a card opens a `Sheet` with all fields, using `EditableCell`; flagged fields are listed first and highlighted.
- **Buttons:** "Add documents" (`UploadPanel` with the hint select, in a Sheet) and "Add an invoice by hand".
- **Documents list:** a compact collapsible list.
- **Payments & matches:** a disclosure containing `PaymentsSection`, `MatchesSection` and NOC.
- **Packs:** links to the month's packs.
- **readOnly:** no buttons, and the sheet has no editing.

`PacksSection`'s blocker list is replaced by the stage chip plus the next-task button. Blockers are explained inside ReviewFlow instead.

## 5. Apps

**apps/local**
- **Routes:** `/` landing, `/home`, `/months`, `/pack`, `/settings`, `/privacy`, plus the redirects listed above.
- **Removed:** `routes.tsx` and the `Stepper` usage.
- **Layout:** `(app)/layout.tsx` uses `AppShell` with `BootGate`, `PrivacyNotice` and `SafetyBanners`.
- **Home:** passes `extraTasks` (the backup task, built from `safety-store`/`data-safety`) and `afterSubmit`.

**apps/web**
- **Routes:** `/home` (new, using the server data loader), `/months` and `/months/[month]`, `/packs/[id]`, `/settings`, and the CA routes. `/` keeps redirecting signed-in users to `/home`.
- **Layout:** `(app)/layout.tsx` uses `AppShell`.
- **Hrefs:** `webHrefs` and `ClientNav` are updated to the new `hrefs`.

## Testing

- **`deriveTasks`:** exhaustive unit tests (vitest), written first. They cover each kind, urgency boundaries (7/30/60 days, overdue), sort order, the setup-only case, the empty case, and extra tasks.
- **Flows (`ui.test.tsx`, RTL with the fake API in `test-utils.tsx`):**
  - SetupFlow, both the invoice path and the manual path, including the bank skip.
  - ReviewFlow: confirm, fix, skip, confirm-all, and the empty-queue → Make transition.
  - PackFlow: Make → Sign skip → Send (missing email captured) → Done.
  - `Sheet`: focus handling and Escape.
  - Home: the hero, `?task=` rendering, and the unknown-task state.
- **Existing tests:** rewritten where they targeted removed components.
- **e2e (apps/local, against the strict-CSP production build):**
  - Rewrite `flow.spec.ts`: landing → setup via invoice → review → pack → Done, plus Home showing the next task. Run at desktop size and at a 390×844 phone size.
  - Update `autofill.spec.ts`, `data-safety.spec.ts` (the backup task replaces `KeepTrackingCard`; the storage warning still shows) and `exports.spec.ts` to the new selectors and routes.
  - `boot-error.spec.ts` stays as it is.
- **e2e (apps/web):** update the smoke test to the new routes.
- **Gates:** `pnpm typecheck && pnpm test && pnpm lint` (lint includes depcruise), plus `pnpm e2e:local` and `pnpm e2e`.

## Out of scope

Backend, schema or API changes; new banks or layouts; i18n; illustrations or images beyond emoji; PWA/offline install.
