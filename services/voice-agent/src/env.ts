export interface Env {
  DB: D1Database;

  // Vars
  LLM_BASE_URL: string;
  LLM_MODEL: string;

  AGORA_APP_ID: string;
  AGORA_APP_CERT: string;
  AGORA_REST_BASE: string;
  AGORA_CUSTOM_LLM_BEARER_PREFIX: string;

  // Secrets
  JWT_SECRET: string;
  LLM_API_KEY: string;

  AGORA_REST_AUTH?: string;
  WEBHOOK_SECRET?: string;

  // ElevenLabs TTS
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_VOICE_ID?: string;

  // Honcho memory
  HONCHO_API_KEY?: string;
  PSEUDONYM_SECRET?: string;

  // Activity feed subgraph
  SUBGRAPH_URL?: string;
}
