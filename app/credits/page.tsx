// Credits and licenses: where the app's texts and data come from, and on what terms. Open to anyone (no sign-in).
export const metadata = { title: 'Credits and licenses · Chavrusa' };

export default function Credits() {
  return (
    <main className="legal">
      <p><a href="/" className="contact-back">‹ Back to the app</a></p>
      <h1>Credits and licenses</h1>
      <h2>The texts: Sefaria</h2>
      <p>The Gemara, Mishnah, Tanach, meforshim and other seforim, and their translations, come from <a href="https://www.sefaria.org" target="_blank" rel="noreferrer">Sefaria</a>, a free, open library of Jewish texts, through its public API. Chavrusa is not made by Sefaria or endorsed by it; the name is used only to credit it.</p>
      <p>Each text on Sefaria has its own source and license, set by its publisher or translator. The app shows them under every text: the Hebrew’s and the English’s version, and the license. For example:</p>
      <ul>
        <li><b>The English of the Talmud</b> is <i>The William Davidson Edition</i>, the Koren Noé Talmud with the commentary of Rabbi Adin Even-Israel Steinsaltz, released by Koren Publishers under the <a href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" rel="noreferrer">Creative Commons Attribution-NonCommercial 4.0</a> license.</li>
        <li>Most of the Hebrew and Aramaic texts and classic meforshim are in the public domain.</li>
        <li>Other translations carry their own license (for example CC BY, CC BY-NC, or the publisher’s permission), shown with the text.</li>
      </ul>
      <h2>Connections between texts</h2>
      <p>Which meforshim, halachos, verses and parallels are linked to each line (the Commentaries, Sources and map lists) comes from Sefaria’s links data, © Sefaria, under the <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">Creative Commons Attribution 4.0</a> license. The app shows it as Sefaria gives it, filtered to the seforim on the app’s approved list.</p>
      <h2>Made by the AI</h2>
      <p>Explanations, sugya maps, review questions, ideas, summaries and some translations are written by AI (Claude, by Anthropic). <b>AI makes mistakes</b>: they are not rabbinically approved, and are no substitute for learning the text inside, a real chavrusa, or asking your rav.</p>
      <h2>Voices</h2>
      <p>The live voices are from OpenAI (GPT-Live) and Google (Gemini Live).</p>
      <p className="muted"><a href="/privacy">Privacy</a> · <a href="/terms">Terms of use</a> · <a href="/contact">Contact us</a></p>
    </main>
  );
}
