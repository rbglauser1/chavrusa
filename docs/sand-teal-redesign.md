# Sand and Teal — complete experience, preview pass 1

The user clarified that the eight earlier options changed too little. The current task is now one design at a time: Sand and Teal first. It must feel like a new application, with a Home that does not scroll, redesigned controls, different navigation and deliberate phone/tablet/desktop compositions. Do not release this branch before the user reviews its direction.

## Reference

The Sand and Teal panel in the user's saved **Three Chavrusa Reading App Styles.png**: warm sand, deep teal, sans-serif English, soft selected-passage background, quiet commentary treatments, prominent Ask your chavrusa control and a simple bottom navigation. The image was opened and visually inspected before implementing this pass.

## Preview pass 1

- Dedicated `SandTealHome`, `SandTealStudy` and `SandTealNav` components replace the prior shared Home and Quiet screen for this option only.
- Home uses a viewport grid. Continue learning, Library, Recent, learning overview, voice and settings have intentional positions. Optional progress/chazara content opens in a separate overview; it no longer lengthens Home.
- Desktop has a full navigation rail, custom book illustration and asymmetric Home cards. Phone has a compact Home and four-destination dock; its reading screen uses a large Ask action to enter conversation. Portrait tablet has a broader Home and single-view reading. Desktop reading has coordinated text and chat areas.
- Reading includes a new header, source-language control, learning tools menu, type/settings control, own chat composer, clear pending/error/retry treatments and dedicated voice control. Existing source, commentary, printed-page and AI/voice handlers are reused.
- Review is accessible from the new navigation, including before opening the current session. Its line links return to the real source.
- Library, Notebook, Review and Settings receive scoped surfaces/layout treatments in this pass. Their deeper screen architecture is to be refined after review of Home/reading direction; do not call them finished complete overhauls yet.
- All other 16 looks, their defaults and saved font overrides remain unchanged. The original saved theme is The Daf. Restore it after browser checks because Preview shares the live database/settings with explicit prior permission.

## Review criteria

1. Home fits without document scrolling at phone, tablet and desktop viewport sizes; no action is clipped.
2. Home and reading are visibly different structures from the earlier option, rather than a recoloring.
3. Ask opens a usable conversation on phone; desktop shows text and conversation together.
4. Source, commentaries, Library, Notebook, Review, settings and voice entry remain reachable.
5. Pending responses and failures stay clear. No new AI request occurs merely on selecting this look.
6. Keep the preview isolated from production. Provide actual screenshots and a preview for review before further redesign/release.

## Direct visual review

Append `?preview-look=sand-teal` to the branch preview root or `/design-preview` to open this design without saving a theme choice to the shared database. Theme changes in this mode are local; other existing settings/learning/data operations still use their existing handlers and shared accounts. This is an authenticated appearance preview, not an authentication bypass or isolated test database.
