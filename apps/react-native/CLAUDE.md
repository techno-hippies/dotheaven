# React Native App — Dev Guide

## Dev Server (Metro)

**Override**: Unlike the root CLAUDE.md rule, you ARE allowed to start/restart Metro for the React Native app when the user asks.

### How to start Metro:
```bash
cd /media/t42/th42/Code/dotheaven/apps/react-native
npx expo start --port 8081
```

### ADB port forwarding (required for physical Android device):
```bash
adb reverse tcp:8081 tcp:8081
```
Run this EVERY TIME after starting Metro. Without it, the app on the device cannot reach the bundler.

### If port 8081 is already in use:
```bash
kill $(lsof -t -i:8081) 2>/dev/null
# Then start Metro again
```

### Rebuilding the Lit WebView bundle:
```bash
cd /media/t42/th42/Code/dotheaven/apps/react-native/lit-webview
bun run build
```
This compiles `lit-webview/src/index.ts` → `lit-webview/dist/lit-bundle.js`, which is loaded by the WebView.

### Building the Android APK:
```bash
cd /media/t42/th42/Code/dotheaven/apps/react-native
npx expo run:android
```

## Project Structure
```
apps/react-native/
├── App.tsx                    # Root app component
├── index.ts                   # Entry point
├── app.json                   # Expo config (scheme: "heaven")
├── lit-webview/               # Lit Protocol WebView bundle
│   ├── src/index.ts           # WebView bridge engine
│   └── dist/lit-bundle.js     # Built bundle (loaded by WebView)
├── src/
│   ├── components/            # UI components (BottomTabBar, MiniPlayer, FeedPost, etc.)
│   │   └── onboarding/        # Onboarding step components
│   ├── hooks/                 # Custom hooks (useRequireAuth)
│   ├── lib/                   # Libraries (theme, camp-spotify, heaven-onchain, posts, auth-eoa)
│   ├── navigation/            # Tab navigator
│   ├── providers/             # Auth, Player providers
│   ├── screens/               # Screen components (Feed, Music, Profile, Chat, Community, etc.)
│   ├── services/              # LitBridge, scrobble engine/queue, music scanner
│   └── ui/                    # Shared primitives (Button, ErrorBanner, IconButton, Pill, TextField)
└── assets/                    # Images, icons
```
