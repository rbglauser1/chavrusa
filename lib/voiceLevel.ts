// Nov 22: how loud the chavrusa's voice is right now (0 to 1), for the talking face. The voice arrives over a WebRTC
// connection (GPT-Live's, or Gemini's loopback); its incoming audio level is read from the connection's stats, which
// works on the iPhone where analysing a WebRTC stream with Web Audio does not. -1: not known (no call, or the browser
// doesn't say), and the face then moves from the call's state instead.
let source: RTCPeerConnection | null = null;

export function setVoicePeer(pc: RTCPeerConnection | null) { source = pc; }
/** The call that ended lets go of the face (only if it is still the one the face listens to). */
export function clearVoicePeer(pc: RTCPeerConnection | null) { if (pc && source === pc) source = null; }

export async function voiceLevel(): Promise<number> {
  const pc = source;
  if (!pc || pc.connectionState === 'closed') return -1;
  try {
    let level = -1;
    (await pc.getStats()).forEach((r: { type?: string; kind?: string; audioLevel?: number }) => {
      if (r.type === 'inbound-rtp' && r.kind === 'audio' && typeof r.audioLevel === 'number') level = Math.max(level, r.audioLevel);
    });
    return level;
  } catch { return -1; }
}
