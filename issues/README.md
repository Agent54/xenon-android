# Xenon Android IWA backlog

This directory records the release work behind the private WIP PR.
The matching private-tracker issues are authoritative; these files preserve
acceptance criteria alongside the patch series. P0 blocks a production
support claim. P1 is required for the intended supported capability or
release hardening. P2 is an explicit optional-scope decision, not permission
to expose an untested API.

| ID | Priority | Area | Private tracker |
| --- | --- | --- | --- |
| 001 | P0 | Focused real update-manager test harness | private #2 |
| 002 | P0 | Wire callback coordinator safely | private #3 |
| 003 | P0 | Scheduler update lease and typed deferral | private #4 |
| 004 | P0 | Truthful Android window quiescence | private #5 |
| 005 | P0 | End-to-end signed update and guard removal | private #6 |
| 006 | P0 | Controlled Frame fingerprint-noise isolation | private #7 |
| 007 | P0 | Restore Android-safe IWA/Controlled Frame security tests | private #8 |
| 008 | P1 | Controlled Frame consent, partition and teardown matrix | private #9 |
| 009 | P0 | Always-run Direct Sockets BLOCK test and policy | private #10 |
| 010 | P1 | Direct Sockets worker/guest/policy and consent races | private #11 |
| 011 | P1 | Direct Sockets network/lock/background lifecycle | private #12 |
| 012 | P1 | General signed-bundle install/uninstall and app-owned launcher | private #13 |
| 013 | P1 | Renderer fatal and ordinary-browser regressions | private #14 |
| 014 | P2 | Screen-capture capability decision | private #15 |
| 015 | P2 | Unframed, OAuth/extension, file and protocol capability audit | private #16 |
| 016 | P1 | Rebase and release verification matrix | private #17 |

See [release gate](../docs/prd.md). No issue authorizes replacing the
ordinary Android browser, clearing device data, changing shared flags, or
opening an upstream/imputnet PR.
