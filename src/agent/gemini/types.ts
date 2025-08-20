// src/agent/gemini/types.ts
export interface IGeminiConfig {
  authType: string;
  proxy: string;
  GOOGLE_GEMINI_BASE_URL?: string;
  GEMINI_API_KEY?: string;
  GEMINI_API_KEYS?: string[];
  GOOGLE_API_KEY?: string;
  activeKeyIndex?: number;
  keyManagerState?: IKeyManagerState;
}

export interface IApiKey {
  key: string;
  status: "valid" | "rate-limited" | "invalid";
  resetTime?: number;
  lastUsed?: number;
  errorCount?: number;
}

export interface IKeyManagerState {
  keys: IApiKey[];
  activeKeyIndex: number;
  lastRotationTime?: number;
}
