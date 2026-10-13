/**
 * Session cookie name.
 *
 * Kept in its own module so the `proxy.ts` route guard can import it without
 * pulling the database client (and therefore Prisma) into its bundle.
 */
export const SESSION_COOKIE = "davomat_session";

/** How long a "remember me" session lives (30 days). */
export const SESSION_TTL_REMEMBER_SECONDS = 60 * 60 * 24 * 30;
/** Default session lifetime (12 hours). */
export const SESSION_TTL_SECONDS = 60 * 60 * 12;