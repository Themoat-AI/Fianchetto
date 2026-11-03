# Fianchetto ♞

A friendly chess site for kids to play, practice, and learn. This starter is a responsive React/Vite app with a working local chessboard, optional Firebase-powered online rooms, and a separate Supabase-powered private room chat.

## Run the site

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Run `npm run dev` and open the local URL Vite prints.

The practice board works without any cloud accounts. Online play and room chat are optional until their credentials are configured.

## Connect Firebase for online games

1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com/).
2. In **Authentication → Sign-in method**, enable **Anonymous** sign-in.
3. Create a **Firestore Database**.
4. From Project settings, copy the web app configuration values.
5. Create `.env.local` in the project root (never commit this file):

```dotenv
VITE_FIREBASE_API_KEY=your_web_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_APP_ID=your_web_app_id
```

6. Apply these Firestore rules in **Firestore Database → Rules**. They let anonymous players read rooms and join waiting games; only a player in a room can update it, and only the player whose turn it is can submit a move. Review and test rules in the Firebase Emulator before publishing your site.

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null; }
    function isMember() {
      return signedIn() && (resource.data.whiteUid == request.auth.uid || resource.data.blackUid == request.auth.uid);
    }
    match /games/{gameId} {
      allow create: if signedIn()
        && request.resource.data.whiteUid == request.auth.uid
        && request.resource.data.blackUid == null
        && request.resource.data.status == 'waiting';
      allow read: if signedIn();
      allow update: if signedIn() && (
        (resource.data.status == 'waiting'
          && resource.data.blackUid == null
          && request.resource.data.blackUid == request.auth.uid
          && request.resource.data.whiteUid == resource.data.whiteUid
          && request.resource.data.fen == resource.data.fen
          && request.resource.data.status == 'playing')
        || (isMember()
          && resource.data.status == 'playing'
          && request.resource.data.whiteUid == resource.data.whiteUid
          && request.resource.data.blackUid == resource.data.blackUid
          && request.resource.data.fen is string
          && request.resource.data.fen != resource.data.fen
          && (request.auth.uid == resource.data.whiteUid
            ? resource.data.fen.split(' ')[1] == 'w'
            : resource.data.fen.split(' ')[1] == 'b'))
      );
      allow delete: if false;
    }
  }
}
```

**Important:** Firestore rules are the real security boundary. The sample rules are a starting point, not a substitute for review: harden them with App Check, room expiry/cleanup, rate limits, and emulator tests before a public launch. The client-side chess move validation is for gameplay correctness, not a security guarantee. For stronger protection against cheating, validate moves in a trusted server/Cloud Function.

## Connect Supabase for the separate chat database

The chat is intentionally separate from Firebase game data. Create a project at [Supabase](https://supabase.com/), then run `supabase/schema.sql` in the Supabase SQL Editor. Enable **Anonymous Sign-Ins** under Authentication settings, and enable Realtime for `room_messages` (Database → Replication / Publications). Add these values to `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_publishable_or_anon_key
```

Restart Vite after changing environment values. The Supabase publishable/anon key is intended for browser use; **never** put a service-role key in the frontend. The table uses Row Level Security and permits chat only to signed-in (including anonymous-authenticated) Supabase users. Messages are scoped to a room code and limited to 300 characters in the UI. Add moderation, reporting, rate limits, retention/cleanup, and appropriate adult supervision before allowing children to use public chat.

## Deploy on Vercel

Import the repository into Vercel, set the four Firebase and two Supabase environment variables in the project settings, and deploy. Add your Vercel domain to Firebase Authentication's **Authorized domains** list. Configure and test Firestore rules and Supabase RLS before sharing the public URL.

## What’s included

- Responsive play, learn, and puzzle sections.
- A legal-move local chessboard (games are local until online mode is connected).
- Private invite-code game rooms with live Firestore updates.
- A separate Supabase room-chat integration with anonymous chat sessions.
- No external credentials committed to this repository.
