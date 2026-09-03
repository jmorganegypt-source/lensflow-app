export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Sends the visitor to the real, standalone sign-in/sign-up page (see
// client/src/pages/Login.tsx and server/auth.ts). This used to redirect to a
// Manus-hosted OAuth portal tied to a Manus-issued appId — that only works
// while this app is running on Manus's own platform, so it's been replaced
// with real email/password auth this app owns outright.
export const startLogin = () => {
  window.location.href = "/login";
};
