// Terms of use: a DRAFT for the owner to review with a lawyer before the app is offered to others.
export const metadata = { title: 'Terms · Chavrusa' };

export default function Terms() {
  return (
    <main className="legal">
      <p className="legal-draft">Draft · to be reviewed before the app is offered publicly</p>
      <h1>Terms of use</h1>
      <h2>An AI learning tool</h2>
      <p>The chavrusa is an AI. It can make mistakes in reading, translating and explaining. Do not rely on it for accuracy in Torah learning, halacha or hashkafa; for practical questions, ask your rav.</p>
      <h2>Texts</h2>
      <p>Texts come from Sefaria under their own licenses. Texts you upload must be ones you have the right to use; they are kept for your own learning and are not shared with others.</p>
      <h2>Credit and payments</h2>
      <ul>
        <li>Credit pays for the AI and voice you use. It is used up as you learn, and does not expire.</li>
        <li>Payments are handled by Stripe. Refunds of unused credit: contact the owner.</li>
        <li>Prices and what credit buys may change; changes don’t affect credit already bought.</li>
      </ul>
      <h2>Fair use</h2>
      <p>Don’t misuse the app (for example, to overload it, or to get at other people’s data). Accounts that do may be closed.</p>
      <h2>Changes</h2>
      <p>These terms may be updated; the app will show the latest version here.</p>
    </main>
  );
}
