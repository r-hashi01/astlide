---
"@astlide/core": patch
---

Public-network-only exports check addresses as they connect: the connection goes to the address that was checked, so a host can't pass with one DNS answer and connect with another. In guarded PDF / PNG renders, Chromium no longer connects to other hosts itself — Astlide makes those requests, following redirects hop by hop (a redirect handed to Chromium was followed without the check) — and anything not routed goes to a dead proxy; WebRTC sends no UDP of its own.
