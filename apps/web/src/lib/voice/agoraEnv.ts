const ENV_APP_ID = (import.meta.env.VITE_AGORA_APP_ID || '').trim()

export function getAgoraAppId(): string {
  if (!ENV_APP_ID) {
    throw new Error('Missing VITE_AGORA_APP_ID (required to join Agora RTC channels).')
  }
  return ENV_APP_ID
}

