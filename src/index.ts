/**
 * Cloudflare Worker + KV: Ephemeral SDP mailbox for WebRTC signaling.
 *
 * API:
 *   PUT  /room/{key}/offer   — Store encrypted SDP offer (body = opaque string)
 *   GET  /room/{key}/offer   — Retrieve it (404 if not yet posted)
 *   PUT  /room/{key}/answer  — Store encrypted SDP answer
 *   GET  /room/{key}/answer  — Retrieve it (404 if not yet posted)
 *
 * - KV entries auto-expire after 5 minutes (TTL)
 * - CORS locked to contractions.app + localhost dev
 * - Max body size: 16 KB (compressed + encrypted SDP)
 * - Routing keys are SHA-256 hashes (64 hex chars) — not guessable
 */

const ALLOWED_ORIGINS = [
	'https://contractions.app',
	'http://localhost:4321',
	'http://localhost:4322',
	'http://localhost:4323',
	'http://localhost:4324',
	'http://localhost:4325',
	'http://localhost:4326',
	'http://localhost:4327',
];

const TTL = 300; // 5 minutes
const MAX_BODY = 16_384; // 16 KB

interface Env {
	ROOMS: KVNamespace;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		// CORS preflight
		if (request.method === 'OPTIONS') {
			return corsResponse(request, 204);
		}

		const url = new URL(request.url);

		// Route: /room/{64-char-hex-key}/{offer|answer|snapshot}
		const match = url.pathname.match(/^\/room\/([a-f0-9]{64})\/(offer|answer|snapshot)$/);
		if (!match) {
			return corsResponse(request, 404, 'Not found');
		}

		const [, key, slot] = match;
		const kvKey = `${key}:${slot}`;

		if (request.method === 'PUT') {
			const body = await request.text();
			if (body.length > MAX_BODY) {
				return corsResponse(request, 413, 'Payload too large');
			}
			if (body.length === 0) {
				return corsResponse(request, 400, 'Empty body');
			}
			await env.ROOMS.put(kvKey, body, { expirationTtl: TTL });
			return corsResponse(request, 200, 'OK');
		}

		if (request.method === 'GET') {
			const value = await env.ROOMS.get(kvKey);
			if (value === null) {
				return corsResponse(request, 404, '');
			}
			return corsResponse(request, 200, value);
		}

		return corsResponse(request, 405, 'Method not allowed');
	},
};

function corsResponse(request: Request, status: number, body?: string): Response {
	const origin = request.headers.get('Origin') || '';
	const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : '';

	return new Response(body ?? '', {
		status,
		headers: {
			'Access-Control-Allow-Origin': allowed,
			'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
			'Access-Control-Max-Age': '86400',
			'Content-Type': 'text/plain',
			'Cache-Control': 'no-store',
		},
	});
}
