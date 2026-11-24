# Android IWA screen-capture boundary

Status: not supported or signed off by the experimental overlay

The signed Kitchen Sink IWA on the lab Android 16 emulator is a secure,
cross-origin-isolated document. Its manifest requests
`all-screens-capture: ["self"]`, but the document policy reports that feature
as disallowed and `navigator.mediaDevices.getAllScreensMedia` is `undefined`.
Pinned Blink's `GetAllScreensMedia` runtime feature is stable on ChromeOS and
test-only by default elsewhere; the Android overlay does not enable it.

`navigator.mediaDevices.getDisplayMedia` is a function in that IWA, but its
manifest does **not** request `display-capture`. A call on the emulator rejects
`NotAllowedError` with a permissions-policy denial. This is a negative-policy
test, not proof that an entitled Android IWA can capture a display.

Keep screen capture out of the core IWA, Controlled Frame, and Direct Sockets
patches. Before adding an optional screen-capture patch or claiming support:

1. Build a separate signed fixture requesting only the relevant
   `display-capture` policy, with an app-owned launch path. Verify the policy
   becomes enabled and a user-initiated request reaches Android's consent
   surface without bypassing it.
2. Verify consent, denial, backgrounding, screen lock, activity recreation,
   process restart, capture stop, and source-loss cleanup on the emulator and
   both physical devices. Do not accept a system consent prompt on behalf of
   the user without authorization.
3. Keep `getAllScreensMedia` disabled unless its multi-screen selection and
   usage-indicator service are explicitly ported and tested. A manifest entry
   alone must not be treated as an entitlement to this API.
4. Verify ordinary pages, Controlled Frame guests, and IWAs without policy
   cannot borrow the owning IWA's capture permission.

The Android update guard in patch 0025 is independent of this capability and
must remain until update lifecycle is verified.
