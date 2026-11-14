# KothaKoi — Product & Engineering Roadmap

This roadmap documents completed milestones, active capabilities, current limitations, and deferred engineering objectives.

---

## Completed Milestones

### Phase 1 — Authentication & Identity Separation
- [x] UIU email domain verification (`@uiu.ac.bd`, `@bscse.uiu.ac.bd`).
- [x] Secure OTP verification with 10-minute expiry and attempt limit.
- [x] Password creation with `scrypt` hashing and HttpOnly cookie sessions.
- [x] Separation of private Real Name (immutable, stored at registration) and public Display Name (customizable, random shuffle).
- [x] Student ID prefix and full email login support.

### Phase 2 — Real-Time Text Chat & Matchmaking
- [x] FIFO random queue pairing users anonymously.
- [x] Next / Skip button with instant graceful session dissolution and re-queueing.
- [x] Disconnect detection, 10-second grace window, and reconnection state preservation.
- [x] Real-time online student counter broadcasted to connected clients.
- [x] Single-session enforcement per user.

### Phase 3 — WebRTC Audio/Video & TURN Relay
- [x] P2P video and audio streaming with camera/mic controls.
- [x] Metered Open Relay integration via `GET /api/webrtc/ice-servers`.
- [x] Short-lived dynamic TURN UDP/TCP/TLS credential provisioning.
- [x] 10-minute in-memory server cache and request deduplication.
- [x] Automatic fallback to Google STUN if provider is unreachable.
- [x] Receive-only mode fallback when local media capture is denied or unavailable.

### Phase 4 — Safety, Moderation & Privacy
- [x] Authenticated reporting endpoint with category classification and chat context evidence.
- [x] Mutual partner blocking with bidirectional matchmaking exclusion.
- [x] Role-Based Admin Dashboard (`/admin/dashboard`) with metrics, user inspection, and report resolution.
- [x] Moderation actions: Warn, Suspend (with duration), Ban, and Unban.
- [x] Automated retention cleanup script (`retention-cleanup.ts`) for expired verification codes, dead sessions, and old resolved reports.
- [x] Complete self-serve account deletion (`DELETE /api/profile`) with profile scrubbing and session invalidation.

---

## Current Engineering Limitations

1. **Relay Bandwidth Dependency:**
   - WebRTC video across mobile cellular networks requires TURN relay. Free-tier allowances are capped, necessitating a dedicated TURN service budget for full-scale launch.
2. **Single-Node In-Memory Queue:**
   - Matchmaking queue operates within the single Node.js memory space. Clustering across multiple physical servers will require a distributed Redis backend.
3. **Local Dev Mock Emailer:**
   - OTP codes are currently logged to the backend console in development. Production requires integration with an SMTP/Transactional email service.

---

## Future Strategic Objectives

### Near-Term (Post-Preservation)
- [ ] **Production Email Provider:** Integrate AWS SES, Mailgun, or Resend for campus-wide automated OTP delivery.
- [ ] **Dedicated Coturn Infrastructure:** Deploy an open-source `coturn` server cluster with Let's Encrypt TLS on an unmetered cloud instance.
- [ ] **Redis Matchmaking Engine:** Replace in-memory arrays in `matching.ts` with Redis Sorted Sets or Queues with Redis pub/sub.

### Mid-Term (Campus Enhancements)
- [ ] **Topic / Interest Tag Matching:** Optional tags (e.g. *#CSE311*, *#TrimesterFinals*, *#Gaming*, *#UIUClub*) to allow students with common interests to match while preserving anonymity.
- [ ] **Audio-Only Calling Mode:** Toggleable setting for users on limited mobile data packages or poor Wi-Fi signals.
- [ ] **Automated Text Toxicity Guard:** Client-side regex or server-side screening for offensive language or harassment.

### Long-Term (Ecosystem Expansion)
- [ ] **Cross-Campus Partnerships:** Expand student domain verification to other major universities in Bangladesh (e.g., BRAC, NSU, AIUB).
- [ ] **Progressive Web App (PWA) Offline Shell:** Improved mobile caching and home-screen installability.
