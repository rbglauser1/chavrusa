# Guided Learning — dedicated experience

User requested another complete UI experience with fun colors and optional color settings, and explicitly requested installation in the actual app on November 12, 2026.

Based on main b3cfe5f, including the Sand and Teal full-screen/no-selection-shading, printed-page retry and word-mark fixes. PR #3, branch feat/guided-learning-experience.

- Dedicated Home and navigation, with a viewport-fitting layout and real Continue, Library, Recent, Notebook, voice and learning-overview actions.
- Dedicated Read / Discuss / Recall workspace. Compact screens show one learning surface at a time; wide screens retain source beside conversation. Stages are navigation, not claims of completed learning.
- Recall opens an introduction first. Only Start recall submits a question request to the existing AI handler. Existing source/commentary, printed-page, review, voice and message handlers are reused.
- Four fixed UI palettes: Playful Purple (iris), Lagoon, Sunset and Blue Sky. Setting is guidedPalette, saved through the existing settings API, remembered in the UI cookie for initial rendering, with an allowlisted fallback. The setting does not replace source text colors or font choices.
- Font overrides continue to use shared per-look English, Hebrew and commentary preferences; heading typography follows the English choice.
- Library, Notebook and settings keep their existing architecture with scoped visual treatments. The other seven optional designs and all nine original looks remain available; The Daf remains the default.
- Appearance preview supports all registered experiences through preview-look, without saving a theme change. Other preferences and learning actions still use the shared account and database with prior user permission.

TypeScript, production build and registration/scoping/SSR checks passed on the initial implementation (749 scoped selectors). Palette normalization and the settings API allowlist are covered by the checks. Current browser verification and deployment status are recorded in PR #3; do not infer completed browser testing from this design note. Native iPhone/iPad Safari, physical keyboard and microphone hardware require real-device checks.
