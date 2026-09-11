import crypto from "node:crypto";
import http from "node:http";
import { config } from "./config.local.mjs";

const PORT = 6578;
const SESSION_COOKIE = "juice_reel_oauth_test_session";
const SESSION_TTL_MS = 10 * 60 * 1000;
const sessions = new Map();

function base64url(value) {
	return value.toString("base64url");
}

function escapeHtml(value) {
	return String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#039;");
}

function renderPage(title, content) {
	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; color: #fff; background: radial-gradient(circle at 15% 0%, rgba(255,122,51,.16), transparent 32%), #080a0d; }
    main { width: min(100%, 680px); padding: 32px; border: 1px solid #2b303a; border-radius: 20px; background: #101216; box-shadow: 0 28px 80px -45px #000; }
    .eyebrow { margin: 0 0 8px; color: #ff7a33; font-size: 12px; font-weight: 900; letter-spacing: .13em; text-transform: uppercase; }
    h1 { margin: 0; font-size: clamp(30px, 7vw, 46px); letter-spacing: -.035em; }
    p { color: #aeb4be; line-height: 1.6; }
    .button { display: inline-flex; align-items: center; justify-content: center; margin-top: 14px; padding: 13px 18px; border: 0; border-radius: 11px; color: #fff; background: linear-gradient(135deg, #ff7a33, #ff5100); font: inherit; font-weight: 900; text-decoration: none; cursor: pointer; box-shadow: 0 16px 34px -20px #ff5100; }
    .secondary { background: #20242c; box-shadow: none; }
    .notice { margin-top: 20px; padding: 14px; border: 1px solid #4b3a27; border-radius: 12px; color: #d7b58d; background: #1c160f; font-size: 13px; line-height: 1.5; }
    pre { max-height: 380px; overflow: auto; padding: 16px; border: 1px solid #333843; border-radius: 12px; color: #d6dae0; background: #080a0d; font-size: 12px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }
  </style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function sendHtml(response, status, title, content, headers = {}) {
	response.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...headers });
	response.end(renderPage(title, content));
}

function parseCookies(request) {
	return Object.fromEntries(
		(request.headers.cookie ?? "")
			.split(";")
			.map((cookie) => cookie.trim())
			.filter(Boolean)
			.map((cookie) => {
				const separator = cookie.indexOf("=");
				return separator === -1 ? [cookie, ""] : [cookie.slice(0, separator), decodeURIComponent(cookie.slice(separator + 1))];
			})
	);
}

function hasConfiguredCredentials() {
	return !config.clientId.startsWith("PASTE_") && !config.clientSecret.startsWith("PASTE_");
}

function oauthExternalApiUrl() {
	return (config.oauthExternalApiUrl ?? "https://external-api.juicereel.com").replace(/\/$/, "");
}

function sameValue(left, right) {
	const leftBuffer = Buffer.from(left ?? "");
	const rightBuffer = Buffer.from(right ?? "");
	return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function removeExpiredSessions() {
	const cutoff = Date.now() - SESSION_TTL_MS;
	for (const [sessionId, session] of sessions.entries()) {
		if (session.createdAt < cutoff) sessions.delete(sessionId);
	}
}

const server = http.createServer(async (request, response) => {
	removeExpiredSessions();
	const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? `localhost:${PORT}`}`);

	if (request.method === "GET" && requestUrl.pathname === "/") {
		const configurationNotice = hasConfiguredCredentials()
			? "The client ID and secret are configured locally and will remain on this Node server."
			: "Before connecting, paste the one-time client ID and secret into config.local.mjs and register http://localhost:6578/callback as an exact redirect URI.";
		sendHtml(
			response,
			200,
			"Juice Reel OAuth Test Client",
			`<p class="eyebrow">Local OAuth test client</p>
       <h1>Connect Juice Reel</h1>
       <p>This standalone app starts Authorization Code + PKCE, receives the callback, and exchanges the code from its backend.</p>
       <a class="button" href="/connect">Connect Juice Reel</a>
       <a class="button secondary" href="/generate-checkout-session">Generate checkout session</a>
       <div class="notice">${escapeHtml(configurationNotice)}</div>`
		);
		return;
	}

	if (request.method === "GET" && requestUrl.pathname === "/generate-checkout-session") {
		if (!hasConfiguredCredentials()) {
			sendHtml(response, 500, "OAuth client not configured", `<p class="eyebrow">Configuration required</p><h1>Add your credentials</h1><p>Update <code>config.local.mjs</code>, then restart this server.</p><a class="button secondary" href="/">Back</a>`);
			return;
		}

		if (!config.checkoutSuccessRedirectUri || !config.checkoutCancelRedirectUri) {
			sendHtml(response, 500, "Checkout callbacks not configured", `<p class="eyebrow">Configuration required</p><h1>Add checkout callback URLs</h1><p>Set <code>checkoutSuccessRedirectUri</code> and <code>checkoutCancelRedirectUri</code> in <code>config.local.mjs</code>.</p><a class="button secondary" href="/">Back</a>`);
			return;
		}

		try {
			const state = base64url(crypto.randomBytes(32));
			const verifier = base64url(crypto.randomBytes(32));
			const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
			const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
			const checkoutResponse = await fetch(`${oauthExternalApiUrl()}/checkout/sessions`, {
				method: "POST",
				headers: {
					Authorization: `Basic ${basicAuth}`,
					"Content-Type": "application/json",
					"X-OAuth-Client-Id": config.clientId,
				},
				body: JSON.stringify({
					successUrl: config.checkoutSuccessRedirectUri,
					cancelUrl: config.checkoutCancelRedirectUri,
					scopes: config.scopes,
					state,
					codeChallenge: challenge,
				}),
			});
			const responseBody = await checkoutResponse.text();
			let checkout;
			try {
				checkout = JSON.parse(responseBody);
			} catch {
				throw new Error(`Checkout endpoint returned non-JSON HTTP ${checkoutResponse.status}`);
			}

			if (!checkoutResponse.ok || typeof checkout.checkoutUrl !== "string") {
				throw new Error(checkout.error ?? `Checkout session creation failed with HTTP ${checkoutResponse.status}`);
			}

			sessions.set(checkout.checkoutSessionId, { state, verifier, createdAt: Date.now() });
			response.writeHead(302, {
				Location: checkout.checkoutUrl,
				"Set-Cookie": `${SESSION_COOKIE}=${encodeURIComponent(checkout.checkoutSessionId)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`,
				"Cache-Control": "no-store",
			});
			response.end();
		} catch (error) {
			sendHtml(response, 502, "Checkout session failed", `<p class="eyebrow">Checkout session failed</p><h1>Could not start checkout</h1><p>${escapeHtml(error instanceof Error ? error.message : "Unknown error")}</p><a class="button secondary" href="/">Try again</a>`);
		}
		return;
	}

	if (request.method === "GET" && requestUrl.pathname === "/checkout/cancel") {
		sendHtml(
			response,
			200,
			"Checkout cancelled",
			`<p class="eyebrow">Checkout cancelled</p><h1>No changes were made</h1><p>The checkout was cancelled before the subscription was completed.</p><a class="button" href="/">Try again</a>`
		);
		return;
	}

	if (request.method === "GET" && requestUrl.pathname === "/connect") {
		if (!hasConfiguredCredentials()) {
			sendHtml(
				response,
				500,
				"OAuth client not configured",
				`<p class="eyebrow">Configuration required</p><h1>Add your credentials</h1><p>Update <code>config.local.mjs</code>, then restart this server.</p><a class="button secondary" href="/">Back</a>`
			);
			return;
		}

		const sessionId = base64url(crypto.randomBytes(32));
		const state = base64url(crypto.randomBytes(32));
		const verifier = base64url(crypto.randomBytes(32));
		const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
		sessions.set(sessionId, { state, verifier, createdAt: Date.now() });

		const authorizeUrl = new URL(config.authorizationUrl);
		authorizeUrl.search = new URLSearchParams({
			client_id: config.clientId,
			redirect_uri: config.redirectUri,
			response_type: "code",
			response_mode: "query",
			scope: config.scopes.join(" "),
			state,
			code_challenge: challenge,
			code_challenge_method: "S256",
		}).toString();

		response.writeHead(302, {
			Location: authorizeUrl.toString(),
			"Set-Cookie": `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`,
			"Cache-Control": "no-store",
		});
		response.end();
		return;
	}

	if (request.method === "GET" && ["/callback", "/checkout/success"].includes(requestUrl.pathname)) {
		const callbackRedirectUri = requestUrl.pathname === "/checkout/success"
			? config.checkoutSuccessRedirectUri
			: config.redirectUri;
		const sessionId = parseCookies(request)[SESSION_COOKIE];
		const session = sessionId ? sessions.get(sessionId) : null;
		if (sessionId) sessions.delete(sessionId);
		const clearCookie = `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;

		if (requestUrl.searchParams.has("error")) {
			const error = requestUrl.searchParams.get("error");
			const description = requestUrl.searchParams.get("error_description") ?? "Authorization failed";
			sendHtml(response, 400, "Authorization failed", `<p class="eyebrow">Authorization failed</p><h1>${escapeHtml(error)}</h1><p>${escapeHtml(description)}</p><a class="button secondary" href="/">Try again</a>`, { "Set-Cookie": clearCookie });
			return;
		}

		const state = requestUrl.searchParams.get("state");
		const code = requestUrl.searchParams.get("code");
		if (!session || !state || !sameValue(state, session.state) || !code) {
			sendHtml(response, 400, "Invalid OAuth callback", `<p class="eyebrow">Callback rejected</p><h1>Invalid state or code</h1><p>The session may have expired, or the callback did not match the request this server created.</p><a class="button secondary" href="/">Start over</a>`, { "Set-Cookie": clearCookie });
			return;
		}

		try {
			const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
			const tokenResponse = await fetch(`${oauthExternalApiUrl()}/oauth2/token`, {
				method: "POST",
				headers: {
					Authorization: `Basic ${basicAuth}`,
					"Content-Type": "application/x-www-form-urlencoded",
					"X-OAuth-Client-Id": config.clientId,
				},
				body: new URLSearchParams({
					grant_type: "authorization_code",
					code,
					redirect_uri: callbackRedirectUri,
					code_verifier: session.verifier,
				}),
			});
			const tokenBody = await tokenResponse.text();
			let displayBody = tokenBody;
			try {
				displayBody = JSON.stringify(JSON.parse(tokenBody), null, 2);
			} catch {
				// Display a non-JSON response as received.
			}

			const succeeded = tokenResponse.ok;
			sendHtml(
				response,
				succeeded ? 200 : 502,
				succeeded ? "Juice Reel connected" : "Token exchange failed",
				`<p class="eyebrow">${succeeded ? "Connection complete" : "Token exchange failed"}</p>
         <h1>${succeeded ? "Juice Reel connected" : `HTTP ${tokenResponse.status}`}</h1>
         <p>${succeeded ? "The authorization code was exchanged server-side." : "The callback was valid, but the token endpoint rejected or could not complete the exchange."}</p>
         <pre>${escapeHtml(displayBody)}</pre>
         <a class="button secondary" href="/">Start again</a>`,
				{ "Set-Cookie": clearCookie }
			);
		} catch (error) {
			sendHtml(response, 502, "Token endpoint unavailable", `<p class="eyebrow">Token exchange failed</p><h1>Token endpoint unavailable</h1><p>${escapeHtml(error instanceof Error ? error.message : "Unknown error")}</p><a class="button secondary" href="/">Start again</a>`, { "Set-Cookie": clearCookie });
		}
		return;
	}

	if (request.method === "GET" && requestUrl.pathname === "/healthz") {
		response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
		response.end(JSON.stringify({ ok: true }));
		return;
	}

	sendHtml(response, 404, "Not found", `<p class="eyebrow">404</p><h1>Not found</h1><a class="button secondary" href="/">Home</a>`);
});

server.listen(PORT, "127.0.0.1", () => {
	console.log(`Juice Reel OAuth test client running at http://localhost:${PORT}`);
});
