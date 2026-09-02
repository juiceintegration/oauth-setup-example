export const config = {
	clientId: "PASTE_CLIENT_ID_HERE",
	clientSecret: "PASTE_CLIENT_SECRET_HERE",
	authorizationUrl: "https://juicereel.com/oauth2/authorize",
	tokenUrl: "https://external-api.juicereel.com/oauth2/token",
	redirectUri: "http://localhost:6578/callback",
	scopes: ["subscribers.read", "bets.open.read", "bets.settled.read"],
};
