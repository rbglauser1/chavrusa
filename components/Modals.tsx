'use client';

export function Disclaimer({ onAccept }: { onAccept: () => void }) {
  return (
    <div className="modal">
      <div className="modal-card">
        <h2>Before we learn</h2>
        <p>Your chavrusa is an AI learning partner. It brings sources, asks questions, and helps you think through a sugya.</p>
        <p><b>It can make mistakes.</b> Do not rely on it for accuracy in Torah learning, halacha, or hashkafa. Always check the sources yourself, and for any practical halachic question, ask your rav.</p>
        <p className="muted" style={{ fontSize: 14 }}>It quotes only sources it actually looked up, shows them in the Sefer panel, and learns from an approved list of Orthodox sources.</p>
        <button className="btn primary" style={{ width: '100%', marginTop: 8 }} onClick={onAccept}>I understand</button>
      </div>
    </div>
  );
}

export function Help({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>What can I ask for?</h2>
        <p>Just talk to your chavrusa. For example:</p>
        <ul>
          <li><b>Start:</b> “Let’s learn today’s daf,” “Teach me about bishul on Shabbos,” “Pick a topic for me.”</li>
          <li><b>Move:</b> “Next,” “Go back,” “Read it again,” “Skip this one,” “What does the Ramban say?”</li>
          <li><b>Depth:</b> “Go deeper,” “Simpler please,” “Let’s speed up.”</li>
          <li><b>Style:</b> “Push me harder,” “Be gentler,” “Quiz me,” “Give me the Chassidic angle,” “You explain first.”</li>
          <li><b>Memory:</b> “Don’t translate Rashi for me,” “What do you remember about me?,” “Forget that.”</li>
          <li><b>Wrap up:</b> “Let’s stop here,” “Save this as a note.”</li>
        </ul>
        <p className="muted" style={{ fontSize: 14 }}>You can also change style, depth, and model in Settings at any time.</p>
        <button className="btn primary" style={{ width: '100%' }} onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}
