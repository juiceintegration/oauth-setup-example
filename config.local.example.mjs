export const config = {
	clientId: "jr_fM_dyq5eVT-at_-DBVmWnE7gIQD-ta6z",
	clientSecret: "jrs_O2Fcc1feGvZ0oUF5wgzg94xievrwGWzpmnmNfoA8hu4",
	authorizationUrl: "https://juicereel.com/oauth2/authorize",
	tokenUrl: "https://external-api.juicereel.com/oauth2/token",
	redirectUri: "http://localhost:6578/callback", // add a callback uri for this domain to the oauth app on the site
	scopes: ["subscribers.read", "bets.open.read", "bets.settled.read"],
};
