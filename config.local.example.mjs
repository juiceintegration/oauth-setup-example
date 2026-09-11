export const config = {
	clientId: "jr_CLIENT_ID_OBTAINED_FROM_SETTINGS",
	clientSecret: "jrs_CLIENT_SECRET_OBTAINED_FROM_SETTINGS",
	authorizationUrl: "https://juicereel.com/oauth2/authorize",
	oauthExternalApiUrl: "https://external-api.juicereel.com",
	redirectUri: "http://localhost:6578/callback", // add a callback uri for this domain to the oauth app on the site
	checkoutSuccessRedirectUri: "http://localhost:6578/callback", // add this exact callback URI to the OAuth app
	checkoutCancelRedirectUri: "http://localhost:6578/checkout/cancel", // add a callback uri for this domain to the oauth app on the site if using custom checkout
	scopes: ["subscribers.read", "bets.open.read", "bets.settled.read"],
};
