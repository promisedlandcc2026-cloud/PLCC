# Share cards (WhatsApp / social)

## Huddle channel cards

Prefer uploading from **Chat → Upload WhatsApp card** (saves `chat_channels.share_image_url`).  
Static files remain a fallback when no DB image is set:

`api/_utils/huddleSharePreview.ts` → `HUDDLE_SHARE_PREVIEWS`

| File | Channel | Share link (WhatsApp) |
|------|---------|------------------------|
| `mount-moriah-channel.jpg` | Mount Moriah (`cdd9ed73-6cdc-45a0-a7e7-57beec6eea5e`) | `https://plcc-vault.vercel.app/api/share-huddle?channel=cdd9ed73-6cdc-45a0-a7e7-57beec6eea5e` |

## Event flyers

Upload new flyers from **Events → Flyer share** (writes to storage + `share_flyers`).

Starter asset:

| File | Share link |
|------|------------|
| `thanksgiving-dinner-2026.jpg` | `https://plcc-vault.vercel.app/api/share-flyer?id=b2c3d4e5-f6a7-4890-b123-202611220001` |

## How to add a future huddle image

1. Save the art as `public/images/share/<slug>.jpg` (or `.png` / `.webp`).
2. Add a registry entry with that channel’s UUID + slug + title.
3. Deploy. Direct image URL: `https://plcc-vault.vercel.app/images/share/<slug>.jpg`
4. For WhatsApp **link preview**, share the `/api/share-huddle?channel=<uuid>` URL (not the `#/community/chat…` hash link).

Hash links still open the app, but WhatsApp cannot read images from `#…` fragments.
