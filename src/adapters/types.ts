export type ProviderId = 'chatgpt';

export interface TurnSample {
  turnKey: string;
  charCount: number; // -1 when unknown
  isReasoning: boolean;
  provider: ProviderId;
}

export interface ConversationScan {
  turnCount: number;
  totalChars: number;
  reasoningCount: number;
}

export interface SelectorSet {
  sendButton: string[];
  composer: string[];
  userMessage: string[];
  assistantMessage: string[];
  stopControl: string[]; // e.g. send button while generating
  reasoning: string[]; // reasoning UI container, matched structurally
}

export interface SiteAdapter {
  id: ProviderId;
  matches(url: URL): boolean;
  getConversationId(url: URL): string | null;
  observe(
    onTurn: (sample: TurnSample) => void,
    opts: { getConversationId: () => string | null; onDegraded?: () => void },
  ): () => void;
  selectors: SelectorSet;
  adapterVersion: string;
}
