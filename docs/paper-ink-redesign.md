# Paper and Ink and Midnight motion — November 12, 2026

Based on cdc362b, including the user's newer iPhone visual-viewport/bottom-control fix. Do not remove ViewportFix or its --vv-shift handling.

References reviewed: all four supplied videos, with sequential frames inspected through their full durations: ui-3-paper-ink.mp4; paper-ink-iphone-walkthrough.mp4; paper-ink-desktop-walkthrough.mp4; ui-1-midnight-sefer(1).mp4. Paper uses warm near-white, serif headings, fine rules, category shortcuts and distinct reading/conversation screens. The opening tree movement is interpreted as the moving leaf shadows in the supplied Paper film and implemented as an unobtrusive native SVG animation on Home.

Paper and Ink receives dedicated Home, navigation, reading and chat components. The four Home category shortcuts use the existing Library's visit memory and real category routes. Text, commentaries, AI, voice, review, Notebook, settings and font handlers remain shared. Double-tap full screen, exit and Escape are wired from the outset. Home fits without scrolling; reading, conversations and settings scroll independently. Saved fonts use the shared per-look overrides, including headings. Library, Notebook and settings retain their existing deeper architecture with scoped visual treatment.

Midnight Sefer receives a new Home with the candle and steam motion from the supplied film, extracted from the outside scenic strips. The pictured mock phone and its sample conversation are not used as source text or app controls. Its existing reading interface remains. Both Homes have pause/play controls and honor reduced-motion preference on startup; a static video poster is available when motion is paused. The source clips have no audio and use local, optimized MP4 assets, not external media services.

Default The Daf and all existing looks are retained. Appearance-preview URLs can open either design without changing the saved theme. Preview data/preferences still use the existing shared account with prior user authorization. Build/browser checks and actual deployment state are recorded in the PR.
