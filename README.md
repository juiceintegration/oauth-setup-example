# Juice Reel OAuth 2.0 setup example

This repository is a small, dependency-free Node.js application demonstrating Juice Reel's OAuth 2.0 Authorization Code flow with PKCE. It:

1. Creates server-side `state` and PKCE values.
2. Redirects the browser to Juice Reel for login and consent.
3. Receives the one-time authorization code at a local callback.
4. Validates `state` against the server-side session.
5. Exchanges the code from the Node server for access and refresh tokens.

The client secret and PKCE verifier are never sent to browser JavaScript. For demonstration, the final page displays the token response; production applications must keep those tokens server-side.

## Prerequisites

- Node.js 18 or newer.
- An approved Juice Reel OAuth application.
- The application's client ID and one-time client secret.
- `http://localhost:6578/callback` and `http://localhost:6578/checkout/cancel` registered as exact redirect URIs for the application.

Create and manage applications from the OAuth applications section of your Juice Reel account settings.

## Configure the example

Clone the repository and enter its directory:

```bash
git clone git@github.com:juiceintegration/oauth-setup-example.git
cd oauth-setup-example
```

Copy the template to the ignored local configuration file:

```bash
cp config.local.example.mjs config.local.mjs
```

Open `config.local.mjs` and replace the two placeholder values:

```js
export const config = {
	clientId: "PASTE_CLIENT_ID_HERE",
	clientSecret: "PASTE_CLIENT_SECRET_HERE",
	authorizationUrl: "https://juicereel.com/oauth2/authorize",
	oauthExternalApiUrl: "https://external-api.juicereel.com", // optional; defaults to this URL
	redirectUri: "http://localhost:6578/callback", // must be added as a redirect URI for this to work in oauth app settings of https://www.juicereel.com/settings/oauth-applications
	checkoutSuccessRedirectUri: "http://localhost:6578/checkout/success",
	checkoutCancelRedirectUri: "http://localhost:6578/checkout/cancel",
	scopes: ["subscribers.read", "bets.open.read", "bets.settled.read"], // must be a subset of the approved scopes from https://www.juicereel.com/settings/oauth-applications
};
```

Request only scopes that were approved for your application:

- `subscribers.read` reads current subscribers.
- `bets.open.read` reads open bets.
- `bets.settled.read` reads settled bets.

## Run the source code

No package installation is required. From this repository's directory, run:

```bash
node server.mjs
```

The terminal should print:

```text
Juice Reel OAuth test client running at http://localhost:6578
```

Open [http://localhost:6578](http://localhost:6578) and select **Connect Juice Reel**. After login and consent, Juice Reel redirects the browser to the registered callback. This Node server validates the callback and performs the token exchange server-side.

## Hosted checkout and buyer access

Use the checkout flow when your application wants to offer a Juice Reel subscription on its own site while using Juice Reel to host the purchase experience. It is useful when you want to:

- send a buyer to a Juice Reel-hosted checkout page;
- let the buyer choose from the seller's available subscription products and durations;
- receive an OAuth token for the buyer after the purchase and consent flow; and
- use that token to call the approved API endpoints for the recently authenticated buyer, such as subscriber status or bet data.

Select **Generate checkout session** to start the flow. The example generates `state` and a PKCE challenge on the Node server, then creates a checkout session with HTTP Basic authentication using the OAuth client's ID and secret. The browser is redirected to the returned `checkoutUrl`, which hosts the Juice Reel purchase flow. No `productId` is sent when creating the session; the buyer chooses the seller and subscription duration in the hosted checkout experience.

After checkout succeeds, Juice Reel records the purchase and shows the buyer the OAuth consent screen for the requested scopes. If the buyer authorizes access, Juice Reel redirects to the registered success callback with a short-lived authorization code and the original `state`. The example validates `state` and exchanges the code server-side at `/oauth2/token` using the PKCE verifier. The resulting access token represents the buyer and can be used to call the endpoints allowed by the approved scopes.

If the buyer cancels checkout, Juice Reel redirects to the registered cancel callback with the cancellation result and original `state`; no access token is issued. Both callback URLs must be registered as exact redirect URIs on the OAuth application. Keep the client secret, PKCE verifier, authorization code, and access/refresh tokens on your backend—never place them in browser code or URLs.

The example displays the token response for demonstration. A production application should encrypt and store tokens server-side, associate them with its signed-in user, and never render them in a page.

## OAuth endpoints

The interactive authorization screen is hosted by Juice Reel:

```text
GET https://juicereel.com/oauth2/authorize
```

Server-to-server OAuth, checkout session, and resource requests use the configured `oauthExternalApiUrl` base URL (defaulting to `https://external-api.juicereel.com`):

```text
https://external-api.juicereel.com/oauth2
```

Available endpoints include:

```text
POST /oauth2/token
POST /checkout/sessions
POST /revoke
GET  /me
GET  /bets/open
GET  /bets/settled
GET  /subscribers/current
```

All external API requests must include the public client identifier:

```http
X-OAuth-Client-Id: jr_...
```

Token and revocation requests also authenticate the client with HTTP Basic authentication. Resource requests use the access token:

```http
Authorization: Bearer jra_...
```

## How the callback is validated

The callback URL contains `state` and a short-lived, single-use authorization `code`. This example:

1. Finds its server-side session using the `HttpOnly` session cookie.
2. Compares the returned `state` with the value stored in that session.
3. Sends the code, original redirect URI, and original PKCE verifier to Juice Reel's token endpoint.

Juice Reel then validates the client credentials, client ID header, authorization code, redirect URI, expiration, one-time usage, and PKCE proof before issuing tokens.

## Troubleshooting

### Configuration required

Ensure `config.local.mjs` exists and neither credential begins with `PASTE_`. Restart the Node process after changing the file.

### Redirect URI rejected

The configured and requested redirect URI must exactly match the value registered for the OAuth application, including scheme, hostname, port, path, and trailing slash behavior.

### Invalid callback state

Start a new flow from the home page. The in-memory session expires after ten minutes and is deleted after the callback is handled.

### Invalid authorization code

Start a new flow. Authorization codes are short-lived and can be exchanged only once. Also confirm that the callback uses the same running Node process that created the PKCE verifier.

### Invalid client

Confirm the client ID and secret belong to the same approved application. If the secret was rotated, update `config.local.mjs` and restart the server.
