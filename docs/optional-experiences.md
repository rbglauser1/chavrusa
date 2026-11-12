# Optional interface experiences

Eight opt-in interfaces are registered in `lib/experiences.ts` and offered through the existing Look and fonts picker. Existing look IDs and `DEFAULT_SETTINGS.theme` are preserved. Each new look receives its own existing per-look font overrides. Server-rendered cookies recognize every new ID so a refresh does not start in a legacy theme.

## Architecture

- `ExperienceHome` replaces the Home presentation only for new experience IDs. Continue, Library, Recent, Notebook, settings, voice, guide and optional HomeExtras use existing handlers.
- `ExperienceNav` supplies cross-screen navigation only for new looks. Existing back-layer handling and overlays remain in place. It responds to visual viewport keyboard changes.
- `Minimal` retains the source component, session, conversation and voice handlers. New looks add explicit Read/Discuss controls. At 1000 CSS pixels or wider, the reading view displays a separate conversation pane. On smaller screens discussion is a separate view. Guided Learning adds an explicit Recall action; it does not silently change learning style or start an AI request on theme selection.
- `experiences.css` is scoped to `data-experience`, new look IDs and theme-picker swatches. Source text, approved corpus, AI instructions, billing, storage schemas and voice engines are not rewritten.
- Original fullscreen preference remains stored for original looks. New workspace layouts do not activate the original fullscreen body mode.

## Implemented visual treatments

Paper and Ink uses open editorial lists. Midnight Sefer uses deep blue surfaces and gold framing. Beis Medrash adds an original generated study-hall hero and cream reading surfaces. Sand and Teal uses rounded studio controls. Editorial uses a typographic journal layout and copper rules. Guided Learning uses a study path and recall action. The Living Page uses expansive reading spacing and a floating desktop dock. Study Workspace uses an indigo workbench and a two-column Home dashboard.

## Verification

`node scripts/check-experiences.cjs` checks registration, persistence normalization, legacy values and CSS isolation. `npx tsc --noEmit` and `npm run build` validate types and production compilation.

Browser validation is not complete. Local Chromium fails under the execution environment's socket restrictions; the remote browser cannot reach localhost. The Vercel preview is protected by Vercel sign-in. These are validation limitations, not passed tests.

Before merging, verify all eight themes at phone, portrait/landscape tablet and desktop widths; source selection and return position; chat send/pending/error behavior; commentaries; Library import; Notebook save/edit/search; review; font persistence; theme switching back to each original look; mobile keyboard/safe areas; and voice permission, interruption and background behavior. Confirm theme preferences against the intended preview database, since preview and production may share settings.
