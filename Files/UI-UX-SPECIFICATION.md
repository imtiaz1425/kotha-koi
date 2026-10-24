# KothaKoi — UI Audit and Interface Specification

**Status:** Draft v0.1 — audit of existing screens plus wiring and missing-state specs. **No redesign is proposed.** All existing layouts, tokens and the neo-brutalist language are preserved; where an existing element conflicts with the product facts, the spec says what *content or behaviour* must change, not the look.
Tags: **[V]** verified by reading source (no browser rendering was done) · **[P]** proposed · **[A]** assumption · **[D OD-xx]** needs approval.

---

## 1. Design system audit

### 1.1 Tokens as defined in `tailwind.config.js` and `index.html` **[V]**

| Item | Value |
|---|---|
| Primary / container | `#9c4500` / `#f47721` (orange) |
| Secondary / container | `#735c00` / `#fecf26` (yellow); fixed `#ffe087` |
| Surfaces | `surface #fcf9f8`, `surface-container-lowest #ffffff`, cream `#FFF5E6` (used as inline arbitrary value `bg-[#FFF5E6]`) |
| Ink / borders | `on-surface #1c1b1b`; 2 px solid borders; hard shadows `shadow-[4px_4px_0px_#1c1b1b]` (2/3/5/6 px variants also used) |
| Fonts | Space Grotesk 600/700 (headings), Inter 400–600 (body), Space Mono 400/700 (labels); Material Symbols Outlined for icons. All loaded from Google CDNs |
| Spacing aliases | `space-xs…xl`, `margin`, `margin-desktop`, `gutter`, `gutter-desktop` |
| Type scale | `label-sm` 10 px, `label-md` 12 px, `body-sm` 13 px, `body-md` 15 px, `headline-md` 22 px, etc. |
| Radii | Config overrides: `rounded` 2 px, `rounded-lg` 4 px, `rounded-xl` 8 px, `rounded-full` **12 px**; `rounded-2xl` stays Tailwind's 16 px. *(The planning prompt says 12–16 px; actual usage is mixed 8/12/16 px.)* |
| Mascot | Pixel tea-cup SVG, inlined and duplicated in `Home`, `Login`, `Chat` |

### 1.2 Issues found in the design system layer **[V unless marked]**

| # | Finding | Why it matters | Proposed handling (no visual redesign) |
|---|---|---|---|
| D1 | `global.css` has `button { outline: none }` | Removes keyboard focus rings app-wide | Restore visible focus (`focus-visible` ring in existing orange/ink). TASK-HARD-05 |
| D2 | `global.css` `:root` and `body` apply a **dark** palette (`#0f1117`, light text, purple links) that conflicts with the light Tailwind theme; pages mask it with `bg-surface` | Flash/overscroll colour mismatch; `a:hover` purple | Align body background/text to existing tokens. Low risk |
| D3 | `animate-in fade-in zoom-in-95 duration-150` classes used in Home/Chat/Video/ChooseNickname, but `tailwind.config.js` has `plugins: []` | Classes likely do nothing **[A: build not run]** | Either add the animation plugin or drop classes (decision with TASK-UX-02) |
| D4 | Some utilities are not in Tailwind 3.4's default scale (`h-13`, `md:w-84`, `py-0.2`, `backdrop-blur-xs`) | Silently ignored **[A]** | Replace with valid equivalents when each screen is touched |
| D5 | Tiny text: many labels 9–11 px (`text-[9px]`, `text-[10px]`, `label-sm` = 10 px) | Legibility / WCAG | Raise minimum to 12 px for informational text in the a11y pass |
| D6 | Header, footer, badge and mascot markup is **copy-pasted into every page** (no shared components, no `components/` or `layouts/` folder) | Every wiring change (auth state in header, logout) must be made 7 times | Optional **non-visual** extraction of shared `Header`/`Footer`/`Mascot` **[D OD-19]**, TASK-UX-02 |
| D7 | Icons use Material Symbols ligature text (e.g. `mic_off`) with no `aria-hidden` | Screen readers read ligature names | Add `aria-hidden="true"` on icon spans; give icon-only buttons `aria-label` |
| D8 | External runtime dependencies: Google Fonts, Material Symbols, and a Google-hosted self-preview image URL in `Chat.tsx`/`Video.tsx` | Privacy (third-party requests), CSP, mock imagery | Real `getUserMedia` replaces the image; CSP must allow font hosts or self-host later |
| D9 | `Landing.tsx`/`Landing.module.css`/`ChatPlaceholder.*` use the **old dark theme** and are unrouted | Dead code with a different design system | Leave untouched for now; propose removal only with your approval (guardrail: no deletions in this phase) |
| D10 | No catch-all route, no error boundary, no loading/auth-check state anywhere | Blank page on unknown URL | See §5, TASK-UX-01 |

## 2. Route inventory **[V from `App.tsx`]**

| Route | Page | Auth today | Proposed guard **[P]** |
|---|---|---|---|
| `/` | Home | public | public (auth-aware header) |
| `/login` | Login | public | public (redirect away if signed in) |
| `/register` | Register | public | public; merge/redirect per OD-01 |
| `/choose-nickname`, `/nickname` | ChooseNickname (two paths, same page) | public | authed; keep one canonical path, alias redirects |
| `/chat` | Chat | public | authed + profile |
| `/video` | Video | public | authed + profile; **hidden/disabled until Release 2** [D OD-02] |
| `/profile` | Profile | public | authed |
| *(none)* | 404, Terms, Privacy, Guidelines, Safety, Account-unavailable, Admin | n/a | new, see §4.9 |

## 3. Shared interaction conventions **[P]**

- Error banner pattern: reuse the existing red `error-container` banner with icon (`Login.tsx`), driven by the standard API error `{error:{code,message,details}}`.
- Toast/transient notice: reuse the existing green/orange small notices; one reusable component.
- Native `alert()` / `confirm()` (used in Register, Login, Chat, Video, Profile) are replaced by themed modals (the existing Video report modal and Profile password modal are the style reference).
- Modal behaviour: `role="dialog"`, `aria-modal`, focus trap, Esc closes (see §7).

## 4. Screen-by-screen audit and specification

### 4.1 Home (`Home.tsx`)
**Verified now [V]:** sticky header with logo, "UIU Students Only • 100% Anonymous" badge, nav anchors `#how-it-works` and `#guidelines`, a Login link, and an avatar dropdown (hard-coded "UIU Student Pass / 2310125@bscse.uiu.ac.bd", My Profile, Account/Status "Verified", Log Out = a `Link` to `/login`). Hero: mascot, headline "Bored? Kotha Koi.", single CTA **Start Adda → `/login`** (always), UIU-verification note, three feature badges. Footer anchors `#safety`, `#standards`, `#report`. The page is intentionally one-screen on desktop.
**Gaps:** no section with `id="how-it-works"` or `"guidelines"` exists; footer anchors are dead; demo email is shown to anyone; Log Out doesn't log out; no auth awareness.
**Wiring spec [P]:**
- Header, logged-out: show Login; hide the avatar menu. Logged-in: avatar menu shows nickname and a masked email; Log Out calls `POST /api/auth/logout`.
- CTA: logged-out → `/login`; logged-in no profile → `/choose-nickname`; logged-in with profile → `/chat` (text queue).
- "How it works" and "Campus Guidelines": open as modals/drawers (keeps the one-screen hero) or route to pages; content per FR-28.
- Footer Safety/Community Standards/Report → real static pages; "Report" explains in-chat reporting (no anonymous reporting form unless approved).
**Missing states:** auth-check loading (avoid flashing logged-out header), API-unreachable banner.
**Copy fixes:** see §8. **Tasks:** TASK-AUTH-05, TASK-UX-01, TASK-UX-02.

### 4.2 Login (`Login.tsx`)
**Verified now [V]:** UIU-only notice; prototype banner; identifier field (email or 7–10 digit ID; client regex `^[a-zA-Z0-9._%+-]+@([a-zA-Z0-9-]+\.)*uiu\.ac\.bd$`, anchored so it does not accept `…uiu.ac.bd.evil.com`); password with show/hide; "Remember this device" (state never used); Forgot-password modal (simulated); quick-test buttons that prefill `UIUstudent123!`; success banner then `navigate('/choose-nickname')`.
**Wiring spec [P] (passwordless default, OD-01):**
- Step 1: email field (keep input styling and the existing error banner). Student-ID input is removed (cannot be mapped to an email without a roster **[A]**).
- Step 2: 6-digit code entry (same card), resend with 60 s countdown, "code expires in 10 min", remaining-attempts message.
- Remove password, show/hide, Forgot-password, quick-test buttons, prototype banners, "Login (Prototype)" button text. "Remember this device" may become a session-length choice only if approved.
- Keep: card frame, mascot badge, UIU-only notice, "Create account" link (to the same flow).
**Error states to add:** `EMAIL_DOMAIN_NOT_ALLOWED`, 429 rate limited with retry time, `INVALID_CODE`/expired/locked, network failure, account unavailable (separate screen).
**If OD-01 = password:** keep existing fields; replace simulations with real calls; Forgot-password becomes a real reset flow.

### 4.3 Register (`Register.tsx`)
**Verified now [V]:** real-name field (labelled "kept strictly private"), UIU email + Send Code, "Mock UI" OTP block with **Auto-fill**, password + confirm + show toggle, Terms checkbox, submit → `alert()` + `navigate('/choose-nickname')`. Submit does not require verified email.
**Wiring spec [P]:** under passwordless this page collapses into Login's two-step flow (route `/register` renders the same component with "first time? your account is created automatically" copy, or redirects). Keep the privacy callout and the Terms consent, but record consent (`terms_accepted_at` in schema) and link the checkbox text to the real Terms page. **Real name field: remove unless OD-05 approves collecting it**; if kept, label it truthfully as *unverified* self-declared data. Remove Auto-fill and mock labels.
**Missing states:** timers, delivery-failed, already-registered (generic), consent-required.

### 4.4 ChooseNickname (`ChooseNickname.tsx`)
**Verified now [V]:** 10 presets (name, emoji, tagline, background colour); first 6 shown as chips; shuffle cycles to the *next* preset (sequential, not random); custom input (`maxLength` 24, no minimum, no denylist; fallback "Anonymous UIUian"); privacy notice hard-codes "Tanvir Ahmed / 2310125"; header "Step 2 of 2"; **Start Adda → `navigate('/chat')` with no state**.
**Wiring spec [P]:** `GET /api/profile` to prefill; `PUT /api/profile {nickname, avatarPreset}`; presets remain a client constant (taglines client-only), the stored value is the nickname plus a preset key. Share one zod schema with the server for validation (length, charset, denylist). Replace demo identity with the real user's masked email. "Step 2 of 2" shown only during first-time onboarding. Start Adda button: save, then `/chat`.
**Missing states:** save-in-progress, validation error (existing red banner), duplicate/denylisted message, load failure.
**Open:** persistent vs per-session alias, uniqueness, re-ask each login **[D OD-07]**; Bengali input allowed **[NFR-14]**.

### 4.5 Chat (`Chat.tsx`) — OmeTV-style room
**Verified now [V]:** two panels (stranger left, self right; stacked on mobile), corner accents, mock mascot avatar + "Speaking…" waveform, fake "24ms • UIU P2P" and "#UIU-4892", self image from a Google-hosted URL, mic/cam/mirror toggles (state only), **chat is a floating overlay hidden by default** (toggle button or `C`), canned replies after 1.2 s, quick emojis, Next (`window.location.reload()` after 600 ms), End (`confirm` → `/`), Report dropdown (Inappropriate Talk, Inappropriate Video, Block Student), keyboard Esc/M/V/C. Root uses `h-screen … overflow-hidden`.
**Wiring spec [P] (text-first, OD-02/OD-08):**
- State machine mapped to UI: `idle` ("Find someone" or auto-join on entry [D OD-08]) → `queued` (waiting state over the stranger panel with Cancel) → `matched` → `in_chat` → `partner_left` (notice + **Find next**) → `error/offline` banner.
- Stranger panel shows partner nickname + avatar from `match:found` (reuse existing mascot card; no P2P/latency claims in text mode).
- Chat: in text mode the chat is the primary surface. Two minimal variants, **needing your approval [D OD-08]:** (A) keep dual panels, chat open and docked instead of hidden overlay; (B) text mode hides the self-video panel and gives its space to chat. Video mode (Release 2) reverts to the existing layout.
- Messages: statuses *sending / sent / failed (retry)*; typing indicator via real events; plain-text rendering only; auto-scroll; `role="log"`, `aria-live="polite"`.
- Next → `chat:skip` (then queued). End → themed confirm → `chat:end`. Report → themed modal with unified reasons and optional details → `POST /api/reports` then skip. Block → themed confirm → `POST /api/blocks` then skip.
- Use the selected nickname from the profile (not "Midnight Mango"); remove fixed initial messages.
**Missing states:** waiting, no-one-online timeout, partner reconnecting, partner left, offline/reconnect banner, rate-limited ("slow down"), session-ended, kicked/banned, report submitted toast.

### 4.6 Video (`Video.tsx`) — Release 2 surface
**Verified now [V]:** 8/4-column grid (video + 35 % side chat), PiP self-view with flip/mic badge, fullscreen toggle, mic/cam/Next/End/Report bar, audio-FX toggle (no function), side chat with canned replies, report modal (nudity / harassment / spam), safety banner, shortcuts. Fixed fake data: "ROOM #DH-8841", "32ms • WebRTC Peer", **"End-to-End"** label on chat, **"Matching: CS / Engg Campuses (DU, BUET, BRACU, NSU)"** (contradicts UIU-only). Esc fires Next even while the report modal is open. No block action.
**Wiring spec [P, Release 2]:** pre-queue permission screen; `<video autoPlay playsInline>` for remote, muted local preview; real mic/cam track toggles; connection states Connecting / Reconnecting / Failed; stop all tracks on end; add Block; reuse the unified report modal; remove audio-FX toggle or define it; remove fake room/latency/campus claims.
**Until Release 2:** route hidden or "coming soon" **[D OD-02]**.

### 4.7 Profile (`Profile.tsx`)
**Verified now [V]:** demo-data notice; privacy banner; ID card with "Tanvir Ahmed (Demo Student)", ID 2310125, "Computer Science & Engineering", "Madani Avenue, Dhaka", verification stamp; **fabricated statistics** (Adda time, Peers met, Tong Cha score, "100% Good / Zero reports (mock)"); five toggles (auto-shuffle nickname, start camera off, start muted, "Avoid same-day rematches", "Campus Adda Announcements"); Change Password modal (simulated); Logout (confirm + navigate). Header "Start Adda" links to `/choose-nickname`. Bug: toggle 4's label says *avoid* rematches but it is bound to `allowRepeatMatches` (inverted).
**Wiring spec [P]:** show real masked email, verification state ("UIU email verified"), nickname with Change link. **Remove** statistics (they imply stored usage history; conflicts with minimisation, and "Account Health/Zero reports" exposes moderation state) **[D OD-10]**. Department/campus lines removed (cannot be derived reliably **[A]**). Toggles persisted via `PUT /api/profile`; camera/mic defaults only visible once video ships; "Announcements" toggle removed unless an email-notification feature is approved [D OD-10]; rematch toggle semantics fixed per OD-13. Change Password modal removed under passwordless. Logout calls the API. Start Adda → `/chat`. Add Delete account (danger zone) [D OD-12].

### 4.8 AdminPanel (`AdminPanel.tsx`) — **new**, uses existing tokens
Route `/admin` (+ `/admin/reports/:id`), guarded by role; non-admin → 403 page.
- **Layout:** existing header/footer; page title "Moderation"; status tabs (Open · Reviewing · Actioned · Dismissed) as chunky buttons; list of cards/rows on mobile, table ≥ 768 px.
- **List columns:** short report ref, reason, reported nickname, flag badge (repeat-reported), created time, status. Cursor pagination.
- **Detail:** session meta (mode, started, ended, how it ended); **evidence viewer** (the ≤20-message snapshot in chat-bubble style, labelled Reporter/Reported, plain text only); reporter details text; reported user's prior reports/actions count; reported user's email shown **only here** with a visible "admin-only" note and access logged.
- **Actions:** Dismiss · Warn · Suspend (1 d / 7 d / 30 d) · Ban, each opening a themed confirm modal with **required reason**; Unban from a user view. Optimistic UI is avoided; show result and update status.
- **States:** loading skeleton, empty ("No open reports"), error with retry, 403, action-failed, concurrent-update (report already actioned).
- **API:** see TRD §6. **Tasks:** TASK-SAFE-05, TASK-SAFE-06.

### 4.9 New static/system screens **[P]**
404 · Terms · Privacy · Community Guidelines · Safety tips · Account unavailable (banned/suspended with expiry) · Forbidden (403) · generic error boundary · global offline/connection banner. All reuse header/footer and card styling.

### 4.10 Legacy files **[V]**
`Landing.tsx`, `Landing.module.css`, `ChatPlaceholder.tsx`, `ChatPlaceholder.module.css` are unrouted and use the old dark theme. Not touched.

## 5. Cross-cutting state matrix **[P]**

| Screen | Loading | Empty | Error | Offline | Unauthorized |
|---|---|---|---|---|---|
| Home | auth-check skeleton | n/a | API banner | banner | logged-out header |
| Login | button spinner | n/a | domain/code/429/network | banner | redirect if signed in |
| ChooseNickname | prefill + save spinner | n/a | validation/denylist | banner | → `/login` |
| Chat | queue waiting | nobody online | session ended, rate limited | reconnect banner | → `/login` |
| Profile | skeleton | n/a | save failed | banner | → `/login` |
| Admin | skeleton | no reports | retry | banner | 403 |

## 6. Responsive behaviour **[P; not visually verified]**

| Breakpoint | Behaviour |
|---|---|
| 360–480 px portrait | Single column. Chat: stranger/avatar area on top, chat below, input pinned above the on-screen keyboard. **Use `100dvh`; `Chat.tsx` currently uses `h-screen`** which misbehaves with mobile browser chrome and keyboards. Controls collapse to icon-only (already `hidden sm:inline` pattern). Admin: card list |
| 768 px | Two-column panels in video mode; admin table |
| ≥1024 px | Existing 8/4-column Video layout; Chat dual panel |

Existing patterns (`hidden sm:inline`, `md:grid-cols-2`, `lg:col-span-8`) are kept.

## 7. Accessibility and keyboard navigation **[P target WCAG 2.1 AA]**

| Item | Finding / spec |
|---|---|
| Focus visibility | `button{outline:none}` removes rings **[V]**; restore `focus-visible` |
| Icon-only buttons | Most have `title` only; add `aria-label`; hide ligature text with `aria-hidden` |
| Dialogs | Report/Password/Forgot modals lack `role="dialog"`, `aria-modal`, focus trap, labelled title |
| Chat log | Message list gets `role="log"` + polite live region; typing indicator `aria-live` off or polite |
| Shortcuts | Esc = Next, M = mute, V = camera, C = chat **[V existing]**. Single-character shortcuts conflict with WCAG 2.1.4 unless they can be disabled/remapped; M/V/C are suppressed only while the chat input is focused. **Esc must close dialogs/menus first** (current bug); whether Esc remains "Next", needs a confirm, or moves to another key **[D OD-08]** |
| Tab order | Header → main controls → chat input → footer; verified in A11Y-AUDIT |
| Contrast | `text-outline` (#8b7265) and `text-tertiary` on cream/white at 10–11 px need measurement **[A]** |
| Text size | Raise informational minimum to 12 px (D5) |
| Motion | Respect `prefers-reduced-motion` for bounce/pulse animations |

## 8. Copy audit (NFR-12) **[V]**

| Where | Current text/behaviour | Issue | Proposed |
|---|---|---|---|
| Video | "End-to-End" chat badge | Text passes through the server | "Not stored" or remove |
| Video, Chat | "32ms • WebRTC Peer", "24ms • UIU P2P", "ROOM #DH-8841", "#UIU-4892" | Hard-coded, false | Remove, or show real values in Release 2 |
| Video | "Matching: CS / Engg Campuses (DU, BUET, BRACU, NSU)" and a mock reply about "DU or BUET" | Contradicts UIU-only | Remove |
| Video | "Verified Student" badge; Chat "UIU Student" | Overstates verification | "UIU email verified" |
| Home/Login/Register/Chat headers | "100% Anonymous" | Admins see email on reports; IP exposure in video; screenshots | "Anonymous to chat partners" |
| Home | `2310125@bscse.uiu.ac.bd` shown to everyone | Looks like a data leak | Auth-gated |
| Register | "UIU Student Code of Conduct" consent | Implies UIU-authored policy | KothaKoi Community Guidelines [D OD-15] |
| Register | "harassment… results in an immediate ban" | Promise vs. moderation process | Align with OD-11 |
| Video footer | "No video recordings are stored" | True for the server, not for peers | Add "peers can still record" caveat |
| Profile | "Mock UI Verified ✓", "100% Good", "Zero reports (mock)" | Fabricated / sensitive | Remove |
| Login/Register/Profile | "(Prototype)", "Mock UI" labels | Must go once real | Remove with wiring |

## 9. Explicit non-goals
No new visual identity, no re-theming, no layout rebuild of Home/Login/Register/Profile/ChooseNickname. Chat/Video changes are limited to the text-mode variants in §4.5 once approved.
