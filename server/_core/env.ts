export const ENV = {
  // Left in place for the handful of unused Manus scaffolding files under
  // server/_core/ (storageProxy, llm, imageGeneration, etc.) that this app
  // doesn't actually call from its routers — harmless if unset.
  appId: process.env.VITE_APP_ID ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  // Email (case-insensitive) that gets the "admin" role automatically on
  // registration — set this to your own account's email. This is what
  // actually decides admin access now that login is standalone (real
  // email/password, see server/auth.ts) instead of Manus OAuth.
  ownerEmail: (process.env.OWNER_EMAIL ?? "").toLowerCase(),
  isProduction: process.env.NODE_ENV === "production",
  muxTokenId: process.env.MUX_TOKEN_ID ?? "",
  muxTokenSecret: process.env.MUX_TOKEN_SECRET ?? "",
  livekitUrl: process.env.LIVEKIT_URL ?? "",
  livekitApiKey: process.env.LIVEKIT_API_KEY ?? "",
  livekitApiSecret: process.env.LIVEKIT_API_SECRET ?? "",
};
