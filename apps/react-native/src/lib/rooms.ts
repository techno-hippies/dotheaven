/**
 * Voice Rooms API Client (React Native)
 *
 * Helper to fetch active rooms from the session-voice worker.
 */

const SESSION_VOICE_URL = process.env.EXPO_PUBLIC_SESSION_VOICE_URL || 'https://session-voice.deletion-backup782.workers.dev';

export interface ActiveRoom {
  room_id: string;
  host_wallet: string;
  participant_count: number;
  created_at: string;
}

export interface ActiveRoomsResponse {
  rooms: ActiveRoom[];
}

/**
 * Fetch list of open active rooms (no auth required)
 */
export async function fetchActiveRooms(): Promise<ActiveRoom[]> {
  try {
    const res = await fetch(`${SESSION_VOICE_URL}/rooms/active`);
    if (!res.ok) {
      console.warn('[Rooms] Failed to fetch active rooms:', res.status);
      return [];
    }
    const data = await res.json() as ActiveRoomsResponse;
    return data.rooms;
  } catch (error) {
    console.error('[Rooms] Error fetching active rooms:', error);
    return [];
  }
}
