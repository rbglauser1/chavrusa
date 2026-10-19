# AI Chavrusa

An AI learning partner for Torah study. Phase 1: typing, Claude and OpenAI at three depths each, Sefaria sources with an approved-source filter, learning styles, memory, and cost logging.

## Setup

1. **Supabase:** open your project > SQL Editor > New query. Paste all of `supabase/schema.sql` and click Run.
2. **Vercel:** Add New > Project > import this GitHub repository.
3. Before clicking Deploy, open **Environment Variables** and add:

| Name | Where to find it |
| --- | --- |
| `APP_PASSWORD` | Any password you choose; you'll type it to open the app |
| `ANTHROPIC_API_KEY` | console.anthropic.com > API Keys |
| `OPENAI_API_KEY` | platform.openai.com > API keys |
| `SUPABASE_URL` | Supabase > Project Settings > API > Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase > Project Settings > API > `service_role` secret key |

4. Click **Deploy**. Open the link, enter your password, and start learning.

To use it like an app on your phone: open the site in Safari, tap Share > Add to Home Screen.

## Where things live

| To change | Edit |
| --- | --- |
| How the Chavrusa learns (its instructions) | `lib/instructions.ts` |
| Learning styles | `lib/config.ts` (`STYLES`) |
| Models and prices | `lib/config.ts` (`MODELS`) |
| Approval rules for sources | `lib/approval.ts` and `CLASSIC_CUTOFF_YEAR` in `lib/config.ts` |
| The approved / blocked list | Supabase > Table Editor > `approved_sources` |
| Real cost per exchange | Supabase > Table Editor > `cost_log` |

## Approved sources

- Tanach, Mishnah, Talmud, Midrash: approved as a group.
- Works written before 1900 (Rishonim, classic Acharonim): approved as a group.
- Anything later, or filed by Sefaria as modern: must be on the `approved_sources` list (by work title or author).
- `blocked` entries always win.
- English translations are shown only if their version title matches an approved `translation` entry; otherwise the learner can tap for a labeled AI translation.
- Every entry has a `lean` tag (general, litvish, chassidish, sephardi, modern_orthodox, dati_leumi) for the future lean toggle.
