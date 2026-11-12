# Chavrusa optional UI checkpoint — November 12, 2026

## Scope
Eight optional experiences under Look and fonts. Preserve all nine original looks, The Daf default, saved font preferences and existing source/chat/voice behavior. User authorized release after verification. Never print secrets or delete existing data.

## Repository
rbglauser1/chavrusa, feat/optional-design-themes, PR #1. Before release main remains bdcbeb26a816945958533a817354ea3240aedb3a. Read the actual PR and branch state before continuing; this document may be older than the final merge.

Live target: chavrusa-nine.vercel.app, Vercel project chavrusa (prj_ZONxfLFFvAWBl5mVtgPN7VtFWYDt), team chavrusa1 (team_x1XImj9kNL7hUE5hrrB2QLar). Do not use chavrusa-hbyd. Branch preview: chavrusa-git-feat-optional-design-themes-chavrusa1.vercel.app. Preview shares Production database and AI configuration with explicit user permission. All six existing configuration entries have Production and Preview targets; values were never printed.

## Verification completed
See docs/ui-verification.md for the measured matrix and limits. All eight homes and reading workspaces fit 390px phones, 834px portrait tablets, 1112px landscape tablets and 1280px desktops. All eight homes now also fit 320px compact phones. Shared chat send/pending/response, explicit Guided Recall, Rashi, source selection, next/previous amud, Library categories, Notebook search and editor cancellation, Settings and original theme isolation were checked against the real preview.

Corrected desktop nav overlay, phone source-flow overflow, Notebook toolbar wrapping and compact Study Workspace cards/masthead. The final conversation-scroll adjustment was verified on deployment 779aa235036695c631432a95a8213c8b7b4f1dd1: distance to conversation bottom is zero after phone-to-desktop resizing and Discuss-to-Read switching. Automated registration/CSS/default/SSR checks (264 scoped selectors), TypeScript and production build all pass on the final code. Compact Home/masthead widths and source/Notebook overflow corrections are verified.

No native iPhone/iPad Safari, physical keyboard/safe-area, microphone, pronunciation, background voice or forced API failure/retry claim is made. Existing voice handlers were retained. No Notebook save/edit/delete or new import in this UI phase. Two clearly labelled synthetic UI chat exchanges and one Recall action were run against the demo session.

## Saved preferences and cleanup
Original saved theme: The Daf (daf). Hebrew32, commentary31, English22; original David Hebrew/commentary fonts retained. Provider Claude Sonnet5.5 Saver, Sharp Challenger. All nine original themes were selected successfully and removed the optional navigation. The Daf was restored after final preview testing. Original fonts and sizes were retained. Production sign-in is also available, and the original production Home was observed before release.

Cloud browser session currently authenticated. Tabs are ephemeral; recover via inventory. Always use secure browserAuth if login is required; never enter chat credentials through ordinary tools. CUA API has no viewport setter, so use the protected /design-preview iframe helper. Local Chromium cannot launch (socket EPERM); do not repeat that path.

## Remaining release steps
Final code verification is complete, with no known remaining UI defect from these checks. Release is authorized. Merge PR #1 only at its expected head; then verify the production domain receives the merge and all 17 looks remain available. Restore The Daf after the production smoke test. Record the actual release result in PR metadata. If PR #1 is already merged and its final metadata confirms the live smoke test, do not repeat the work.

Workspace may show intended files as uncommitted relative to the original local checkout because commits were published through the GitHub connector. Compare remote content before changing it. Do not publish generated package-lock.json or next-env.d.ts. Hero WebP is already committed. No access token, password, environment value or protected preview-share token should appear in output.
