# Deployment and configuration

The app has two deployable parts:

| Part                         | Host                     | Why                                                                         |
| ---------------------------- | ------------------------ | --------------------------------------------------------------------------- |
| Web app (`apps/web`)         | Vercel                   | Static and server-rendered Next.js pages                                    |
| Signaling (`apps/signaling`) | Render, or any Node host | Needs a long-lived WebSocket server, which serverless functions cannot hold |

## Web app on Vercel

1. Import the repository and set **Root Directory** to `apps/web`.
2. Add the environment variable `NEXT_PUBLIC_SIGNALING_URL` with the signaling server URL,
   with no trailing slash.
3. Deploy. If you change the variable later, redeploy, because it is embedded at build time.

## Signaling server on Render

Use the [`render.yaml`](../render.yaml) blueprint (**New → Blueprint** in Render), or run it
on any Node host:

```bash
pnpm --filter @peerboard/signaling build
node apps/signaling/dist/index.js
```

Check that it is up by opening `<server-url>/health`.

## Environment variables

### Web (`apps/web/.env.local`)

| Variable                    | Default                 |
| --------------------------- | ----------------------- |
| `NEXT_PUBLIC_SIGNALING_URL` | `http://localhost:4000` |

### Signaling (`apps/signaling/.env`, see `.env.example`)

| Variable                            | Purpose                                                      |
| ----------------------------------- | ------------------------------------------------------------ |
| `PORT`                              | HTTP port (default 4000)                                     |
| `CORS_ORIGINS`                      | Comma-separated web origins allowed to connect               |
| `TRUST_PROXY`                       | `true` behind Render or Railway, so rate limits see real IPs |
| `TURN_URLS`                         | e.g. `turn:turn.example.com:3478?transport=udp`              |
| `TURN_SECRET`                       | coturn `static-auth-secret`; enables short-lived credentials |
| `TURN_USERNAME` / `TURN_CREDENTIAL` | Static credentials (e.g. Metered) as a fallback              |

`CORS_ORIGINS` must contain the exact web origin, for example
`https://peerboard.vercel.app`, with no trailing slash.

## TURN (optional)

Some networks, such as symmetric NAT and some mobile carriers, block direct peer-to-peer
connections. A TURN server relays traffic for those users.

When TURN is configured, `GET /ice-servers` on the signaling server returns time-limited
credentials using the coturn REST API scheme:

- `username = <expiry>:<peerId>`
- `credential = base64(HMAC-SHA1(secret, username))`

The client fetches them at runtime and refreshes them before they expire, so no TURN secret is
ever bundled into the app. The presence panel shows "TURN relay" when a connection is relayed.
Traffic through the relay stays end-to-end encrypted.
