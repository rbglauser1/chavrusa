// Privacy policy: a DRAFT for the owner to review with a lawyer before the app is offered to others.
export const metadata = { title: 'Privacy · Chavrusa' };

export default function Privacy() {
  return (
    <main className="legal">
      <p className="legal-draft">Draft · to be reviewed before the app is offered publicly</p>
      <h1>Privacy</h1>
      <p>Chavrusa is a Torah learning app with an AI study partner. This page explains what it keeps and who helps run it.</p>
      <h2>What the app keeps</h2>
      <ul>
        <li><b>Your learning sessions:</b> what you type or say to the chavrusa (as text) and its answers, the texts you open, your settings, notes, goals and the things you ask it to remember.</li>
        <li><b>Texts you add</b> (My Seforim): the files or links you upload, turned into text.</li>
        <li><b>Usage and cost:</b> how much AI and voice each session used, to show you your costs and, if you buy credit, your balance.</li>
        <li><b>Call recordings are not kept.</b> During a voice call your voice goes to the voice service to be understood and answered. The app keeps a short written log of a call only on your own device, to send for troubleshooting if you choose.</li>
      </ul>
      <h2>Who helps run it</h2>
      <ul>
        <li><b>OpenAI</b> and <b>Google</b> (the live voice), and <b>Anthropic</b> (Claude, the chavrusa’s thinking): they receive what is needed to answer you during your session.</li>
        <li><b>Supabase</b> (where your sessions and settings are stored) and <b>Vercel</b> (where the app runs).</li>
        <li><b>Sefaria</b> (the texts), which receives only the names of texts requested.</li>
        <li><b>Stripe</b> (payments, if you buy credit): Stripe takes your card details; the app never sees or stores them.</li>
      </ul>
      <h2>Your choices</h2>
      <p>You can delete sessions, notes, uploaded texts and saved memories in the app. To have everything deleted, <a href="/contact">contact us</a>.</p>
      <h2>Contact</h2>
      <p>Questions about privacy: <a href="/contact">contact us</a>.</p>
    </main>
  );
}
