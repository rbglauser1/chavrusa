export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema object
}

export interface ChatTurn { role: 'user' | 'assistant'; content: string }

export interface RunResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export type ToolExecutor = (name: string, args: Record<string, unknown>) => Promise<string>;

export interface RunOptions {
  model: string;
  system: string;
  history: ChatTurn[];
  tools: ToolDef[];
  execute: ToolExecutor;
  effort?: string;
  maxSteps?: number;
  onText?: (delta: string) => void; // called with each piece of text as it is written
}
