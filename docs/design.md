# ffesti Plus Design System

> Status: **Approved 2026-11-03.** Every page in `frontend/` is being updated to match this document (see §10).
> Reference screen: **Submissions Hub** (`/submissions`) in dark and light theme. It is the page that already follows these rules best.

This document describes how the ffesti Plus festival operating system (https://ffestiplus.autovertest.com) should look in both themes: colours, type, spacing, icons and components. It's written for anyone building or changing a screen.

---

## 1. Rules

1. **Colours come only from tokens.** Never write a hex value or `#fff` in a component. Use `var(--fc-…)`. The only exception is white text on a brand or solid button (`#fff`).
2. **Every screen works in both themes.** If a screen looks right in light but has white boxes in dark, it is broken.
3. **Use classes rather than inline styles** for anything that repeats: buttons, pills, tables, cards, inputs and tabs. Keep inline styles for one-off layout such as `gap`, `margin` or grid columns.
4. **Use one icon set:** `frontend/src/core/components/common/Icons.jsx`. Staff screens use no emoji.
5. **Pages share one structure:** page header, then tabs, then toolbar, then content card (see §7.1).

---

## 2. How the theme works

| Item | Value |
|---|---|
| Provider | `core/context/ThemeContext.jsx` (`useTheme()` returns `{ theme, toggleTheme, isDark }`) |
| Stored in | `localStorage['fc-theme']`, set to `'light'` or `'dark'`. On first visit it follows the OS setting. |
| Applied as | `class="dark-theme"` and `data-theme="dark"` on both `<html>` and `<body>` |
| Toggle | Sun/moon button in the sidebar footer (`LightModeIcon` / `DarkModeIcon`) |
| CSS hook | Token values are switched in the `:root.dark-theme, body.dark-theme, [data-theme="dark"]` block in `index.css`. **Components shouldn't need their own dark-mode rules.** If they use tokens, they switch automatically. |

---

## 3. Colour tokens

All tokens live in `frontend/src/index.css`: light values in `:root`, dark values in the dark-theme block.

### 3.1 Surfaces

| Token | Use | Light | Dark |
|---|---|---|---|
| `--fc-surface` | Page background, sidebar | `#f7f5f2` warm ivory | `#0a0a0c` obsidian |
| `--fc-surface-card` | Cards, table container, modals, drawers | `#ffffff` | `#131316` |
| `--fc-surface-subtle` | Table header row, inset panels, input background in dark | `#f8fafc` | `#161619` |
| `--fc-surface-elevated` | Pills, raised chips, secondary buttons in dark | `#faf8f5` | `#18181c` |
| `--fc-surface-hover` | Row and button hover | `#ede7e0` | `#1c1c20` |
| `--fc-surface-active` | Pressed or selected | `#e5ded6` | `#242429` |

> **Decided (Q1):** the dark block used to set `--fc-surface: #0a0b10` and `--fc-surface-card: #12141e`, which have a blue tint. The Submissions page actually renders with `#0a0a0c` and `#131316`, because component overrides force those values. The **rendered** Submissions colours are now the official tokens, so those overrides can be deleted.

### 3.2 Brand (burgundy / crimson)

| Token | Use | Light | Dark |
|---|---|---|---|
| `--fc-brand` | Primary buttons, active tab underline, links, focus | `#a82f2f` | `#a82f2f` |
| `--fc-brand-hover` | Primary hover | `#8f2626` | `#922828` |
| `--fc-brand-active` | Primary pressed | `#781e1e` | `#781e1e` |
| `--fc-brand-tint` | Active nav item background, brand badge background | `#fcf4f4` | `rgba(168,47,47,0.15)` |
| `--fc-brand-border` | Border around brand-tinted elements | `#f0d5d5` | `rgba(168,47,47,0.4)` |
| `--fc-brand-text` *(new)* | Brand-coloured text on page or card (active tab label, active nav) | `#a82f2f` | `#fca5a5` |

Only one brand colour exists. **`#e11d48` (rose) and `#f43f5e` are not part of the brand.** They appear about 80 times in Audience and Voting and must be replaced with `--fc-brand` or `--fc-brand-text`.

### 3.3 Text

| Token | Use | Light | Dark |
|---|---|---|---|
| `--fc-text-main` | Titles, table cell text, input text | `#1c1917` | `#f4f4f5` |
| `--fc-text-secondary` | Body copy, labels, secondary button text | `#57534e` | `#a1a1aa` |
| `--fc-text-muted` | Meta lines ("Dir. … · India · 15m"), table headers, placeholders | `#8c827a` | `#71717a` |
| `--fc-text-light` | Disabled text, "Unrated", "—" | `#a8a29e` | `#52525b` |
| `--fc-text-on-brand` *(new)* | Text on brand or solid buttons | `#ffffff` | `#ffffff` |

### 3.4 Borders

| Token | Use | Light | Dark |
|---|---|---|---|
| `--fc-border` | Card, input and button outlines, tab bar bottom line | `#e8e2db` | `rgba(255,255,255,0.08)` |
| `--fc-border-subtle` | Table row dividers | `#f0ebe4` | `rgba(255,255,255,0.05)` |
| `--fc-border-hover` | Hover outline | `#d5cdc4` | `rgba(255,255,255,0.16)` |
| `--fc-border-strong` | Emphasised dividers | `#bfb8ae` | `rgba(255,255,255,0.28)` |
| `--fc-focus-ring` *(new)* | Focus outline on inputs and buttons | `rgba(168,47,47,0.4)` | `rgba(168,47,47,0.45)` |

### 3.5 Status colours *(new tokens)*
Every status comes in four parts: **solid** (icons, dots, solid buttons), plus **bg**, **border** and **text** for a soft badge. In dark theme, soft badges are a transparent tint with light text, the same style as the Submissions stage pills.

| Status | Part | Light | Dark |
|---|---|---|---|
| **Success** (checked in, valid, assigned, approved) | `--fc-success` | `#16a34a` | `#22c55e` |
| | `--fc-success-bg` / `-border` / `-text` | `#dcfce7` / `#86efac` / `#15803d` | `rgba(16,185,129,.12)` / `rgba(16,185,129,.25)` / `#6ee7b7` |
| **Warning** (pending, not issued, duplicate scan) | `--fc-warning` | `#d97706` | `#f59e0b` |
| | `-bg` / `-border` / `-text` | `#fef3c7` / `#fcd34d` / `#b45309` | `rgba(245,158,11,.12)` / `rgba(245,158,11,.25)` / `#fcd34d` |
| **Danger** (rejected, flagged, error, not found) | `--fc-danger` | `#dc2626` | `#ef4444` |
| | `-bg` / `-border` / `-text` | `#fee2e2` / `#fca5a5` / `#b91c1c` | `rgba(239,68,68,.12)` / `rgba(239,68,68,.25)` / `#fca5a5` |
| **Info** (submitted, informational) | `--fc-info` | `#2563eb` | `#3b82f6` |
| | `-bg` / `-border` / `-text` | `#e0f2fe` / `#7dd3fc` / `#0369a1` | `rgba(59,130,246,.12)` / `rgba(59,130,246,.25)` / `#93c5fd` |

### 3.6 Review stage pills (`.fc-status-pill.status-*`)
These already exist and stay as they are. They are listed so other modules can reuse the same palette for their own steps.

| Class | Stage | Light (bg / text) | Dark (bg / text / border) |
|---|---|---|---|
| `status-submitted` | Submitted | `#e0f2fe` / `#0369a1` | blue 12% / `#93c5fd` / blue 25% |
| `status-round-1` | Round 1: Screening | `#fef3c7` / `#b45309` | amber 12% / `#fcd34d` / amber 25% |
| `status-round-2` | Round 2: Consideration | `#dcfce7` / `#15803d` | emerald 12% / `#6ee7b7` / emerald 25% |
| `status-official-selection` | Official Selection | `#dbeafe` / `#1d4ed8` | indigo 14% / `#a5b4fc` / indigo 30% |
| `status-nominations` | Nominations | `#ede9fe` / `#6d28d9` | purple 14% / `#d8b4fe` / purple 30% |
| `status-jury-voting` | Jury & Voting | `#fae8ff` / `#86198f` | fuchsia 14% / `#f0abfc` / fuchsia 30% |
| `status-finalist` | Finalist | `#fef9c3` / `#a16207` | yellow 14% / `#fde047` / yellow 30% |
| `status-winner` | Winner | `#ffedd5` / `#c2410c` | orange 14% / `#fdba74` / orange 30% |
| `status-rejected` | Rejected | `#fee2e2` / `#b91c1c` | red 12% / `#fca5a5` / red 25% |

**Audience module mapping** (new usages of the same pills and status tokens):

| Delegate or badge state | Use |
|---|---|
| Registered (no pass yet) | Warning soft badge |
| Badge issued / Assigned | Success soft badge |
| Checked in | Info soft badge |
| Unassigned stock | Neutral `.fc-category-pill` |
| Vote valid / flagged / voided | Success / Warning / Danger soft badge |

### 3.7 Legacy tokens
`--bg-*`, `--text-*`, `--border-color`, `--color-*` and `--gradient-*` predate the `--fc-*` set. **Don't use them in new code.** During the rollout they are aliased to the `--fc-*` tokens and then removed.

---

## 4. Typography

| Item | Value |
|---|---|
| Font | **Figtree** (Google Fonts, variable 300–900): `var(--fc-font-family)`, with the system UI stack as fallback |
| Monospace | `ui-monospace, SFMono-Regular, Menlo, monospace` as `--fc-font-mono` *(new)*, **only** for badge numbers, QR codes, IDs and tokens |
| Remove | The `Inter` import in `index.css` is loaded but never used |

| Role | Size / weight / colour | Example |
|---|---|---|
| Page title | `1.75rem` (28px) / 700 / text-main | "Submissions Hub" |
| Page subtitle (right-aligned in header) | `0.85rem` / 400 / text-muted | "Sequential Review Pipeline & Master Catalog · 7 total entries" |
| Section / card title | `1rem` / 700 / text-main | |
| Tab label | `14px` / 600; active tab is text-main plus brand underline | "All Films 7" |
| Body / table cell | `13px` / 400–500 / text-main | |
| Row title | `13px` / 700 / text-main | "twst" |
| Meta line | `11px` / 400 / text-muted | "Dir. Abhishek Kumar · Albania · 15m" |
| Table header | `11px` / 700 / uppercase / `letter-spacing: .05em` / text-muted | "TITLE & DIRECTOR" |
| Pill / badge | `11px` / 700 | "Winner" |
| Button | `13px` / 600 (small: `11px`) | |
| Badge number | mono / `15–18px` / 800 / `letter-spacing: .12em` | `418312` |

Line height is 1.4 for body text and 1.2 for titles.

---

## 5. Spacing, radius, elevation

- **Spacing scale:** `--space-xs` 4, `sm` 8, `md` 16, `lg` 24, `xl` 32, `2xl` 48 (px).
  - Page padding is 32px on desktop and 16px on phones.
  - The gap between sections is 20–24px.
  - Table cells are padded 13px × 16px.
- **Radius:**
  - inputs, buttons and small chips: `8px` (`--radius-sm` 6 for `.fc-btn-sm`)
  - cards, tables and modals: `12px`
  - pills: `999px`
  - large hero panels: `--radius-xl` 20
- **Elevation:** use as little as possible. Cards get `--shadow-sm`, dropdowns and drawers `--shadow-lg`, modals `--shadow-xl`. In dark theme the separation comes from borders and surface steps, not shadows.

---

## 6. Icons

- **Source:** `core/components/common/Icons.jsx`, which holds 71 Material Design **filled** icons drawn as inline SVG. The colour is `currentColor`, so icons inherit the text colour.
- **Usage:** `<SearchIcon size={16} />`. Sizes are 14 inline with text, 16 in buttons, 18 in navigation, and 20–24 in empty states.
- **Colour:** inherited from the parent. Use status `solid` tokens for status icons, for example `CheckCircleIcon` in `var(--fc-success)` or `CancelIcon` in `var(--fc-danger)`.
- **Need a new icon?** Add it to `Icons.jsx`, using the same signature and a Material filled path. No icon libraries and no emoji (🎬 🏆 ⚠️ ✓) in staff screens. Public screens (voting, results) may use 🏆 on the winner card only.

Existing icons by area:

| Area | Icons |
|---|---|
| Navigation | `DashboardIcon`, `MovieIcon`, `PeopleIcon`, `SettingsIcon`, `TuneIcon` |
| Actions | `AddIcon`, `EditIcon`, `DeleteIcon`, `SaveIcon`, `SyncIcon`, `PrintIcon`, `FileDownloadIcon`, `UploadFileIcon` |
| Audience | `QrCodeScannerIcon`, `BadgeIcon`, `ConfirmationNumberIcon`, `CameraAltIcon`, `HowToVoteIcon` |
| Status | `CheckCircleIcon`, `CancelIcon`, `WarningIcon`, `InfoIcon`, `HourglassIcon`, `FlagIcon` |
| Awards | `TrophyIcon`, `MedalIcon`, `CrownIcon`, `StarIcon` |

---

## 7. Components

The class names below already exist in `index.css` unless marked *(new)*.

### 7.1 Page structure (from Submissions Hub)
```
.fc-page-header            title (left) · subtitle or meta (right)
.scope-tabs-bar            tabs with counts: label + .tab-badge; active = brand underline
.toolbar-bar               .fc-search-input (left) · Filters / Export / primary actions (right)
.fc-card > table.fc-table  the content
```
- Primary page actions sit in the toolbar or header, aligned right.
- A page has at most one `fc-btn-primary` in view.

### 7.2 Buttons (`.fc-btn` + variant)

| Variant | Use | Light | Dark |
|---|---|---|---|
| `.fc-btn-primary` | The one main action (Generate, Assign, Approve) | brand / white text | same |
| `.fc-btn-outline` | Secondary (Filters, Export CSV, View, Back) | card bg / border / text-main | `#18181c` / border / text-main |
| `.fc-btn-subtle` | Low emphasis (Cancel, inline actions) | transparent / text-secondary | same |
| `.fc-btn-danger-light` | Destructive but not final (Reject, Revoke) | danger soft | danger soft (dark) |
| `.fc-btn-danger` | Final destructive confirmation | danger solid / white | same |
| `.fc-btn-success-light` | Positive confirm (Approve vote) | success soft | success soft (dark) |
| `.fc-btn-sm` | In table rows and cards | 4×10 padding, 11px | same |

- **Rules:** buttons have an icon on the left (16px) and a label. Disabled buttons use `opacity: .55; cursor: not-allowed`. Focus shows `box-shadow: 0 0 0 3px var(--fc-focus-ring)`.
- **Duplicates to remove:** `index.css` defines `.fc-btn-primary` twice, at around lines 3558 and 11300, and the dark-theme `!important` overrides patch over the clash. The rollout keeps one definition.

### 7.3 Inputs
`.fc-input`, `.fc-select`, `.fc-search-input` (with `SearchIcon` and the `/` shortcut hint):
- background `--fc-surface-card` in light, `--fc-surface-subtle` in dark
- border `--fc-border`, radius 8, padding 7×12, 13px
- **focus:** border `--fc-brand` plus the focus ring
- **error:** border `--fc-danger`, with the message below in 12px `--fc-danger-text`
- **valid** (e.g. badge available): border `--fc-success`, with the message in `--fc-success-text`
- labels are 12–13px / 700 / text-secondary
- required fields are marked with `*` in `--fc-brand`

### 7.4 Tables (`.fc-table` inside `.fc-card`)
- **Header:** `--fc-surface-subtle`, 11px uppercase muted.
- **Rows:** divider `--fc-border-subtle`, hover `--fc-surface-hover` (dark: `rgba(255,255,255,.025)`).
- **Selected row:** brand tint. **Rejected row:** `.fc-rejected-film-row`, with a red left border and a faint danger background.
- **Cell layout:** a bold title line plus a muted meta line. Numbers align right. The actions column aligns right and holds `fc-btn-sm` buttons.
- **On phones:** tables become cards (see `.fc-mobile-submissions-list`). Every list page needs a phone layout.

### 7.5 Pills and badges
- `.fc-status-pill` with a status class: rounded, 11px / 700, 3×10 padding.
- `.fc-category-pill`: neutral (surface, or `#18181c` in dark), with an optional `EditIcon`.
- `.tab-badge`: a count inside tabs (neutral; brand tint when the tab is active).
- `.fc-badge-soft--{success|warning|danger|info}` *(new)*: the status tokens from §3.5, used for delegate, badge and vote states.

### 7.6 Cards and panels
`.fc-card`: background `--fc-surface-card`, 1px `--fc-border`, radius 12, `--shadow-sm`, padding 16–20.
- **Stat tiles** (registrations, stock): label in 11px uppercase muted, value in 24–28px / 800 text-main.
- **Badge stock card** (Bulk QR): a white QR on a card, the badge number in mono, and a `fc-btn-outline fc-btn-sm` button for "Pair with Delegate". The QR image itself always sits on white, even in dark theme, so scanners can read it.

### 7.7 Alerts, banners, toasts
- **Inline banner:** the status soft colours, a status icon on the left, 13px text, radius 8.
- **Toast:** `.toast-box`, bottom-right, card surface with a status-coloured left border.
- **Empty state:** a 24px muted icon, a 14px / 600 title, a 13px muted hint, and an optional primary button.

### 7.8 Modals and drawers
- Overlay `rgba(0,0,0,.5)` (`.6` in dark).
- Panel `--fc-surface-card`, radius 12, `--shadow-xl`.
- Header: title in 16px / 700 plus a `CloseIcon` button. The footer holds the actions aligned right, with the primary action last.
- Drawers slide in from the right, 480–560px wide, full height.

### 7.9 Navigation (sidebar)
This already conforms. For reference:
- items are 14px text-secondary; hover `--fc-surface-hover`
- the active item has a brand tint background, `--fc-brand-text` and a brand border
- the section label ("CORE MODULES", "ADD-ONS") is 11px uppercase muted, with a small pill

---

## 8. Public pages

| Page | Theme |
|---|---|
| `/login` | Follows the user's theme. Already conforms. |
| `/vote/:token` (delegate phone ballot) | Uses the tokens and **follows the phone's OS theme** (decided, Q3). It was hard-coded slate (`#0f172a`). |
| `/results/:eventId` (projector winners screen) | **Always dark, on purpose** (it's a projector), but built from the dark token values instead of hex. |
| Printed badge sheets | Always light, white paper with black QR. Not themed. |

---

## 9. Replacing hard-coded colours

The most frequent hard-coded values in the pages that don't conform (Audience, Registration, Voting, Attendance, Bulk QR, Payments):

| Found | Count | Replace with |
|---|---|---|
| `#a82f2f`, `#922828` | 134 | `var(--fc-brand)`, `var(--fc-brand-hover)` |
| `#e11d48`, `#f43f5e` (rose) | 79 | `var(--fc-brand)` (buttons) or `var(--fc-brand-text)` (text) |
| `#94a3b8`, `#64748b`, `#475569` | 92 | `var(--fc-text-muted)` / `var(--fc-text-secondary)` |
| `#fff`, `#ffffff` as a **background** | 72 | `var(--fc-surface-card)` (as text on brand, keep `#fff`) |
| `#0f172a`, `#111420` | 22 | `var(--fc-text-main)` (text) or `var(--fc-surface)` (background) |
| `#e2e8f0`, `#cbd5e1`, `#f3f4f6` | 37 | `var(--fc-border)` |
| `#f8fafc`, `#f1f5f9` | 25 | `var(--fc-surface-subtle)` |
| `#10b981`, `#16a34a`, `#059669`, `#15803d`, `#4ade80` | 64 | `var(--fc-success)` / `--fc-success-text` |
| `#f59e0b`, `#d97706` | 20 | `var(--fc-warning)` / `--fc-warning-text` |
| `#ef4444`, `#dc2626`, `#f87171` | 40 | `var(--fc-danger)` / `--fc-danger-text` |
| `#2563eb`, `#38bdf8`, `#6366f1` | 18 | `var(--fc-info)` / `--fc-info-text` |

---

## 10. Rollout plan

**Status (2026-11-03): all steps done.**
- ✅ Step 1, tokens: new tokens added, dark surfaces neutralised, rose folded into burgundy across `index.css`, legacy `--bg-*` / `--text-*` / `--border-*` aliased to `--fc-*`, duplicate primary-button patch removed, Inter dropped.
- ✅ Steps 2–3, every staff page and component: about 950 inline colours replaced with tokens. `isDark ? … : …` colour branches in Payments were collapsed to tokens. Emoji were replaced with icons or removed.
- ✅ Step 4, public pages: `/vote/:token` uses tokens and follows the phone's theme; `/results/:eventId` is always dark through a `.dark-theme` token scope.
- **Intentional literal colours that remain:**
  - camera/scanner panels, the projector modal, the screener video player and the floating bulk bar (dark in both themes);
  - QR image backgrounds (always white);
  - gold winner tags and the printed-pass preview;
  - user-picked flag colours and category badge colours (data);
  - the Google logo;
  - `var(--token, #fallback)` fallbacks.

1. **Tokens** (`index.css`):
   - add the *(new)* tokens;
   - set the dark `--fc-surface` / `--fc-surface-card` to the rendered values;
   - alias the legacy `--bg-*` / `--text-*` tokens to `--fc-*`;
   - add `.fc-badge-soft--*`;
   - remove the duplicate `.fc-btn-primary` and the dark `!important` patches that tokens make unnecessary;
   - drop the Inter import.
2. **Audience module first** (the reported problem):
   - `RegistrationPage` (`/audience`)
   - `AttendeeCreatePage`, `AttendeeEditPage`
   - `AttendeeAssignQrPage`, `AssignQrModal`
   - `BulkQrManagementPage`, `BulkQrModal`
   - `AttendancePage`, `VotingPage`, `AudienceSettingsPage`
3. **Other modules:** `PaymentsPage`, `SettingsPage`, the Submissions boards (`FinalistsBoard`, `WinnersBoard`, `JuryVotingBoard`, `NominationsBoard`, `ActivityLogBoard`, modals), then `Dashboard`, `Tasks`, `Calendar`, `Guests`, `Sponsors`, `Team`, `Admin`.
4. **Public pages:** `PublicVotingPage`, `PublicResultsPage` (per §8).
5. **For each page:** replace the inline colours using §9, switch to the §7 classes where they fit, and remove emoji.
6. **Verification for each page:**
   - toggle the theme;
   - no white boxes in dark and no near-invisible text in light;
   - text contrast at least WCAG AA (4.5:1 for body text, 3:1 for large text and icons);
   - check at 375px width;
   - `npm run lint` and `npm run build` pass;
   - finally, `grep` the page for `#[0-9a-f]{3,6}`. Only `#fff`-on-brand and the print stylesheets should remain.

---

## 11. Decisions (2026-11-03)
1. **Dark surfaces:** neutral `#0a0a0c` / `#131316`, the values the Submissions page renders.
2. **Rose `#e11d48`:** folded into the burgundy brand everywhere. There is one brand colour.
3. **`/vote/:token`:** follows the phone's theme.
4. **Emoji:** removed from staff screens. Only the 🏆 on the public winners card stays.
5. **Light theme:** kept exactly as it is today (warm ivory and white).
