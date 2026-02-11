# Voice Rooms — React Native

Voice rooms implementation using `react-native-agora` SDK for Android/iOS.

## Architecture

- **Hook**: `src/hooks/useFreeRoomVoice.ts` — React hook managing Agora RTC engine + room lifecycle
- **Screen**: `src/screens/RoomScreen.tsx` — Full-screen voice room UI
- **Component**: `src/components/LiveRoomsRow.tsx` — Horizontal scrolling room cards
- **Navigation**: Integrated into `TabNavigator` as a modal screen

## Key Features

✅ **No PKP dependency** — uses simple EIP-191 message signing (works with EOA auth)
✅ **Credit metering** — heartbeat + token renewal intervals from backend
✅ **Speaking detection** — Agora volume indicators with 2.5s hold
✅ **Host/guest roles** — host broadcasts mic, guests listen (viewers can't publish yet)
✅ **Auto-disconnect** — on credit exhaustion or token renewal denial

## Setup

### 1. Install dependencies
Already done via `bun add react-native-agora@4.5.3`

### 2. Configure permissions (AndroidManifest.xml)
Already configured:
```xml
<uses-permission android:name="android.permission.RECORD_AUDIO"/>
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS"/>
<uses-permission android:name="android.permission.INTERNET"/>
```

### 3. Environment variables
No `.env` file needed — defaults are set in code:
- `EXPO_PUBLIC_AGORA_APP_ID` (defaults to Heaven's Agora app ID)
- `EXPO_PUBLIC_SESSION_VOICE_URL` (defaults to `https://session-voice.heaven.dev`)

### 4. Build Android APK
```bash
cd /media/t42/th42/Code/dotheaven/apps/react-native
npx expo run:android
```

## Usage

### Create a room
```typescript
navigation.navigate('Room', {
  mode: 'create',
  visibility: 'open',  // or 'private'
  ai_enabled: false,
});
```

### Join a room
```typescript
navigation.navigate('Room', {
  mode: 'join',
  roomId: 'uuid-here',
});
```

### Fetch active rooms
```typescript
import { fetchActiveRooms } from './lib/rooms';

const rooms = await fetchActiveRooms();
// [{ room_id, host_wallet, participant_count, created_at }, ...]
```

## API Flow

1. **Auth**: `getWorkerToken()` → nonce → sign message → JWT token
2. **Create**: `/rooms/create` → `{ room_id, channel }`
3. **Join**: `/rooms/join` → `{ channel, agora_token, agora_uid, is_host, connection_id, ... }`
4. **Heartbeat**: `/rooms/heartbeat` every 30s → `{ remaining_seconds, events }`
5. **Renew**: `/rooms/token/renew` every 45s → `{ agora_token }` (Agora token refresh)
6. **Leave**: `/rooms/leave` → `{ debited_seconds, closed }`

## Events

- **Credits low**: `remaining_seconds < 120` → toast notification
- **Credits exhausted**: Auto-leave and navigate back
- **Peer joined/left**: Update participant count + list
- **Speaking**: Agora volume indicator → visual rings around avatars

## Components

### RoomScreen
- Full-screen modal presentation
- Header: duration, role (host/guest), close button
- Participants: grid of avatars with speaking rings
- Controls: mic mute toggle (large circular button)

### LiveRoomsRow
- Horizontal scrolling cards (120x180 each)
- Create room card (first position with + button)
- Active room cards (host avatar, participant count)

## TODO

- [ ] Resolve host names via heaven name lookup
- [ ] Add room cover images (album art or AI-generated)
- [ ] Support audience → speaker promotion (viewer can request to speak)
- [ ] Add AI voice bot integration (when `ai_enabled: true`)
- [ ] Persist last room ID in AsyncStorage for reconnect flow
- [ ] Add room chat (text messages alongside voice)

## Differences from Web

| Feature | Web (agora-rtc-sdk-ng) | React Native (react-native-agora) |
|---------|------------------------|-----------------------------------|
| Engine creation | `AgoraRTC.createClient()` | `RtcEngine.createWithContext()` |
| Mic track | `createMicrophoneAudioTrack()` | Built-in, enabled via `enableAudio()` |
| Join channel | `client.join()` | `engine.joinChannel()` |
| Mute | `track.setEnabled(false)` | `engine.muteLocalAudioStream(true)` |
| Volume indicator | `client.on('volume-indicator')` | `engine.addListener('AudioVolumeIndication')` |
| Cleanup | `client.leave()` | `engine.leaveChannel()` + `RtcEngine.destroy()` |

## Troubleshooting

### Agora init fails
- Check `EXPO_PUBLIC_AGORA_APP_ID` is set
- Verify Android permissions are granted at runtime (mic access)

### Token renewal fails
- Check credit balance via `/credits` endpoint
- Ensure heartbeat interval is running (watch console logs)

### No audio from peers
- Verify `autoSubscribeAudio: true` in `joinChannel()` options
- Check Agora SDK logs for subscribe failures

### "Already in room" error
- Backend prevents joining multiple rooms — call `leave()` first
- Clear room state on component unmount

## Notes

- Agora tokens are short-lived (60s) — renewal is critical
- Speaking detection uses a 2.5s hold to bridge Agora's 300ms volume event cadence
- Host role is server-authoritative (can't be spoofed)
- Private rooms require invite links (not yet implemented)
