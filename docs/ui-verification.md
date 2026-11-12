# Optional UI verification — November 12, 2026

## Scope and method

Authenticated cloud Chromium, actual Vercel branch deployment, actual saved Berakhot 2a session. The protected `/design-preview` helper gives the real app an iframe CSS viewport. Reported widths include classic scrollbar and border space; they are not claims of native iPhone or iPad testing.

## Completed browser checks

| Experience | Phone 390×844 | Portrait tablet 834×1112 | Landscape tablet 1112×834 | Desktop 1280×800 |
| --- | --- | --- | --- | --- |
| Paper and Ink | Home / Read / Discuss | Home / source | Source + conversation | Home / source + conversation |
| Midnight Sefer | Home / Read / Discuss | Home / source | Source + conversation | Home / source + conversation |
| Beis Medrash | Home / source | Home / source | Source + conversation | Home / source + conversation |
| Sand and Teal | Home / Read / Discuss | Home / source | Source + conversation | Home / source + conversation |
| Editorial | Home / Read / Discuss | Home / source | Source + conversation | Home / source + conversation |
| Guided Learning | Home / Read / Discuss / Recall | Home / source | Source + conversation | Home / source + conversation |
| The Living Page | Home / Read / Discuss | Home / source | Source + conversation | Home / source + conversation |
| Study Workspace | Home / Read / Discuss | Home / source | Source + conversation | Home / source + conversation |

No horizontal overflow in the measured Home and source containers at the tabulated sizes after fixes. All eight Home/masthead variants also fit 320×720; Study Workspace reading fits that compact width. Portrait tablet hides the secondary conversation pane; wide layouts expose it. Standard desktop navigation is 70px high. The Living Page uses its separate 68px floating dock and reserves space beneath the workspace.

- Saved session: Continue opens the existing Berakhot 2a text and conversation; source position is retained. Next amud loads 2b; Previous returns to 2a.
- Chat: desktop composer and phone composer submit explicit synthetic UI-test messages. Pending state appears; real AI response renders. Guided Recall asks one question and waits, rather than showing the answer immediately. Theme selection itself does not submit an AI message.
- Source: tapping a line exposes its existing tools. Rashi loads Hebrew and English in the inline commentary panel, fits phone width and closes normally.
- Library: root categories and Talmud → Bavli navigation load through the actual backend; Close library returns to the source. Existing imported fixture remains intact. No new import or deletion was performed in this phase.
- Notebook: existing notes load; search for REVIEW TEST filters the list. New page opens the editor; Cancel dismisses it. Phone toolbar overflow was found and fixed with wrapping. At 320px, measured dialog scrollWidth equals clientWidth after the fix. No notes were saved, edited or deleted in this phase.
- Source sheet: generation completed and rendered the printable text/map/table output on phone; the print action was not invoked.
- Responsive conversation: latest reply is visible after phone-to-desktop resizing and Discuss-to-Read switching (measured distance to scroll bottom: zero).
- Settings: original groups, all 17 looks and per-look font controls remain accessible. All nine original looks were selected and each removed `data-experience` and the new navigation. The Daf still has the original David Hebrew/commentary fonts and Hebrew32/commentary31/English22 sizes.
- Persistence: refreshing the actual preview preserved selected Study Workspace and Guided Learning values. Per-look original font values survived theme switching.

## Defects corrected during verification

1. Desktop navigation stretched over the workspace because of competing top/bottom positioning. Removed the competing selector and bounded its height.
2. Source wrapper's inherited negative margins created a narrow horizontal scrollbar on phones. New experiences now use their own zero-margin inner flow.
3. Notebook export actions overflowed phone width with large saved text sizes. Actions wrap and use UI-sized text.
4. Study Workspace's two-column tool grid and large masthead were too wide on compact phones. Compact layouts use one tool column and a smaller brand/settings pair.

## Automated validation

`node scripts/check-experiences.cjs`: eight experiences, nine legacy looks, normalization, unchanged default, scoped CSS selectors and eight server-rendered Home variants. `npx tsc --noEmit` passes. `npm run build` passes production compilation, lint and type checks.

## Limits

Native Safari keyboard, safe-area behavior on physical hardware, microphone capture, audio pronunciation, voice interruption and background calls were not tested in this phase. Existing voice handlers were reused. API failure/retry was not deliberately induced. Notebook persistence mutations, imports, billing and account/security settings were not exercised again. These are limits of verification, not passed tests.
