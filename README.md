# Contraction Timer — Private Signaling Relay

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cybersader/obsidian-contractions-timer/tree/main/web/cf-signaling)

Your own private relay for [contractions.app](https://contractions.app) P2P sharing. Free. 2 minutes to set up.

## What this does

This tiny server relays encrypted connection codes between two devices so they can find each other. It sees nothing — all data is end-to-end encrypted before it ever reaches the relay. Entries auto-delete after 5 minutes.

You don't *need* this — the app works without it using a free public relay. But deploying your own gives you full control and reliability.

## Setup (5 steps, ~2 minutes)

### Step 1: Click the deploy button above

This opens Cloudflare's deploy page. It will ask you to sign in to two services:

- **GitHub** — Cloudflare creates a copy of this code in your GitHub account. If you don't have one, [sign up here](https://github.com/signup) (free, takes 30 seconds).
- **Cloudflare** — This is where your relay runs. If you don't have an account, [sign up here](https://dash.cloudflare.com/sign-up) (free, no credit card needed).

### Step 2: Click "Deploy"

Cloudflare handles everything automatically:
- Creates the relay server
- Sets up the storage (KV namespace) for temporary connection codes
- Deploys it to their global network

### Step 3: Copy your Worker URL

After deployment finishes, Cloudflare shows your new URL. It looks like:

```
https://ct-signaling.YOUR-NAME.workers.dev
```

Copy this URL — you'll need it in the next step.

### Step 4: Paste the URL into contractions.app

1. Open [contractions.app](https://contractions.app)
2. Tap the hamburger menu (top-right)
3. Tap **Share**
4. Scroll down to **Advanced settings**
5. Under **Signaling server**, select **My Cloudflare Worker**
6. Paste your Worker URL into the field
7. Tap **Test connection** to verify it works

### Step 5: Share with your partner

Tell your partner to do the same thing in Step 4 — select "My Cloudflare Worker" and paste the same URL. Now both devices use your private relay.

That's it! Start sharing from the Share panel.

---

## FAQ

### Why do I need a GitHub account?

Cloudflare's deploy button creates a copy of the relay code in your GitHub account. This means you own it and can modify or delete it anytime. [Sign up](https://github.com/signup) takes 30 seconds.

### Why do I need a Cloudflare account?

The relay runs on Cloudflare Workers, their serverless platform. The free tier is more than enough — it handles 100,000 requests per day. No credit card required. [Sign up here](https://dash.cloudflare.com/sign-up).

### Is this really free?

Yes. Cloudflare Workers free tier includes:
- 100,000 requests/day
- KV storage (1 GB reads/day, 1,000 writes/day)

A typical sharing session uses ~20 requests total. You'd need thousands of simultaneous users to hit any limits.

### What data does the relay see?

Nothing useful. Connection codes are encrypted with AES-256-GCM on your device *before* they're sent to the relay. The relay stores opaque ciphertext blobs that auto-delete after 5 minutes. It has no way to decrypt them.

### Do both partners need to deploy their own relay?

No. Only one person deploys. Share the Worker URL with your partner — you both paste the same URL into the app settings.

### Can I delete it later?

Yes. Go to [Cloudflare dashboard](https://dash.cloudflare.com) > Workers & Pages > find `ct-signaling` > delete. You can also delete the GitHub repo copy.

### I already deployed but lost the URL

Go to [Cloudflare dashboard](https://dash.cloudflare.com) > Workers & Pages > click `ct-signaling`. Your URL is shown at the top of the page.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Deploy button shows an error | Make sure you're signed into both GitHub and Cloudflare. Try again. |
| "Test connection" fails in the app | Double-check the URL — it should start with `https://` and end with `.workers.dev`. No trailing slash. |
| CORS error in browser console | The relay only accepts requests from `contractions.app` and `localhost`. If you're testing from a different domain, you'll need to edit the `ALLOWED_ORIGINS` array in `src/index.ts`. |
| Sharing works on same WiFi but not across networks | You may need a TURN relay for restrictive networks. In the app's Advanced settings, make sure TURN is enabled (Open Relay or Cloudflare TURN). |

---

## What is TURN and do I need it?

**Short answer: Probably not.** Most connections work without TURN.

**What TURN does:** When two devices try to connect directly (peer-to-peer), they need to find each other's IP addresses. STUN servers help with this (free, included by default). But some networks — corporate firewalls, strict mobile carriers, symmetric NAT — block direct connections entirely. TURN servers act as a relay, forwarding encrypted data between devices when direct connection fails.

**When you DON'T need TURN:**
- Both devices are on the same WiFi (always works)
- Both devices are on typical home/mobile networks (usually works)
- You're using the snapshot share feature (no connection needed at all)

**When you MIGHT need TURN:**
- One device is behind a corporate/hospital firewall
- Both devices are on different mobile carriers with strict NAT
- Direct connection consistently fails

**What's included by default:**
The app comes with free TURN servers from [Open Relay](https://www.metered.ca/tools/openrelay/) (20 GB/month free tier). These work for most people. If they're unreliable, you can switch to:

- **Cloudflare TURN** — Part of [Cloudflare Calls](https://dash.cloudflare.com/?to=/:account/calls). Costs $0.05/GB but very reliable. Requires a Cloudflare account.
- **Self-hosted coturn** — Run your own TURN relay. See the [self-hosting section](#self-hosting) below.
- **Custom TURN** — Any TURN server you have access to.

You can change TURN settings in the app under Share > Advanced settings > TURN relay.

---

## How it works (technical)

The relay is a Cloudflare Worker (~90 lines of TypeScript) backed by KV storage.

**API:**
```
PUT  /room/{64-char-hex-key}/offer      Store encrypted SDP offer
GET  /room/{64-char-hex-key}/offer      Retrieve it (404 if not yet posted)
PUT  /room/{64-char-hex-key}/answer     Store encrypted SDP answer
GET  /room/{64-char-hex-key}/answer     Retrieve it (404 if not yet posted)
PUT  /room/{64-char-hex-key}/snapshot   Store compressed session snapshot
GET  /room/{64-char-hex-key}/snapshot   Retrieve it (404 if not yet posted)
```

- Routing keys are SHA-256 hashes derived from the room code — not guessable
- All payloads are AES-256-GCM ciphertext — the relay can't read them
- Entries expire after 5 minutes (KV TTL)
- CORS locked to `contractions.app` + localhost dev ports
- Max payload: 16 KB (compressed + encrypted SDP is typically ~2-4 KB)

**Flow:**
1. Host creates an SDP offer, encrypts it, and PUTs it to the relay
2. Guest polls for the offer, decrypts it, creates an SDP answer
3. Guest encrypts the answer and PUTs it to the relay
4. Host polls for the answer, decrypts it, and establishes WebRTC data channel
5. All further data flows directly between devices (relay is no longer involved)

---

## Self-hosting

If you prefer not to use Cloudflare, you can run your own signaling server:

### Option A: Docker (WebSocket signaling)

```bash
cd ../docker-signaling
docker compose up -d
```

This starts a y-webrtc compatible WebSocket server on port 4444. In the app, select "Self-hosted (WebSocket)" and enter `ws://YOUR-SERVER:4444`.

### Option B: Manual Cloudflare CLI deploy

```bash
# Install wrangler
npm install -g wrangler

# Authenticate
wrangler login

# Create KV namespace
wrangler kv namespace create ROOMS
# Copy the ID from the output and add it to wrangler.toml

# Deploy
wrangler deploy
```

### Option C: Any HTTP server

The relay API is simple enough to implement in any language. See `src/index.ts` for the full implementation (~90 lines). The key requirements:
- PUT/GET for `/room/{key}/offer` and `/room/{key}/answer`
- TTL on stored entries (5 minutes recommended)
- CORS headers for `contractions.app`
