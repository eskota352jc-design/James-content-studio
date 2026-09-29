# James Content Studio

A personal prototype for preparing and reviewing social media posts before publishing. The project combines a static creator workspace with a Cloudflare Worker that connects to TikTok's API.

## What the project shows

- A review flow for captions, media, privacy choices, and interaction settings before a creator confirms a post.
- OAuth connection and requests for account information and recent content through the Worker.
- A publishing request that checks available privacy options and reports the returned status.
- Separate privacy and terms pages describing the intended use of account data.

## My role

I planned the creator workflow and developed the prototype with AI-assisted tools, GitHub, and Cloudflare. This is a personal learning project that gave me hands-on experience translating requirements into a usable interface, reviewing API behavior, and troubleshooting integration details.

## Project status

This is a prototype, not a general-purpose publishing service. The interface includes sample content. Live TikTok features depend on configured credentials, an authorized account, and the permissions granted by TikTok. The repository does not include those credentials.

## Stack

HTML, CSS, JavaScript, Cloudflare Workers, and the TikTok API.
