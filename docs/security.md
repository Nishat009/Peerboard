# Security and threat model

## Keys

- Creating a room generates a random 256-bit AES-GCM key in the browser
  (`crypto.getRandomValues`).
- The invite link is `/room/<roomId>#key=<base64url key>`. Browsers never send the fragment
  (`#...`) in HTTP requests, so neither the web host nor the signaling server receives the key.
- The key is imported as a **non-extractable** `CryptoKey`.
- The web app sends `Referrer-Policy: no-referrer`, and room pages are marked `noindex`.

## What is encrypted

| Data                                 | Protection                                                    |
| ------------------------------------ | ------------------------------------------------------------- |
| Document updates and awareness (P2P) | AES-GCM per frame, inside WebRTC DTLS. AAD binds the room id. |
| Local IndexedDB copy                 | AES-GCM per record. AAD binds the database name.              |
| Signaling messages                   | TLS only. They contain no document content (see below).       |

Each encryption uses a fresh 96-bit random IV.

## What the signaling server sees

- Room ids and random per-tab peer ids.
- SDP offers/answers and ICE candidates. These reveal IP addresses (needed to connect) and
  codec/fingerprint data, but no document content.
- Connection timing and room sizes.

The server validates message shape and size, relays without inspecting, and logs only event
names and counts (`apps/signaling/src/logger.ts`). It stores nothing on disk.

## Threats addressed

| Threat                                  | Mitigation                                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Compromised or curious signaling server | Never sees content or keys                                                                                 |
| Compromised TURN relay                  | Sees DTLS traffic, which itself carries AES-GCM frames                                                     |
| Someone who learns only the room id     | Can join signaling, but their frames fail authentication; peers close the connection (`unauthorized-peer`) |
| Stolen laptop disk image                | IndexedDB content is ciphertext                                                                            |
| Signaling relay abused as a message bus | Payload schema checks, 64 KB size cap, per-socket token bucket                                             |
| Join flooding                           | Per-IP rate limit on joins and ICE credential requests                                                     |
| TURN credential theft from the bundle   | Short-lived HMAC credentials minted per request, never bundled                                             |

## Not addressed (known limitations)

- **Anyone with the full link is a member.** There is no per-user identity, and there is no
  revocation short of creating a new room.
- **No forward secrecy.** One static key per room; a leaked link exposes past and future
  traffic that an attacker recorded.
- **Malicious members.** A peer holding the key can write anything into the shared document,
  including deleting content. (Undo only covers your own changes.)
- **Metadata.** The server learns who connects to which room, when, and from which IP.
- **Compromised browser or extensions** can read the key and the decrypted document.
- **Display names are self-asserted** and can be spoofed by any member.
- **No Content-Security-Policy yet.** Adding a strict, nonce-based CSP is planned.
