/**
 * URLs for screens that act on one record.
 *
 * The id travels in the query string, not the path (`/recipes/view?id=x`, not
 * `/recipes/x`). Cook sessions and custom foods are created in the browser, so
 * their ids do not exist when the site is built, and a static host such as
 * GitHub Pages can only serve pages that were built. One page per screen that
 * reads `?id=` works on every host.
 */

const enc = encodeURIComponent;

export const routes = {
  /** Recipe detail. `mealId` is the planned meal the user came from. */
  recipe: (id: string, mealId?: string) =>
    `/recipes/view?id=${enc(id)}${mealId ? `&meal=${enc(mealId)}` : ""}`,
  /** Cooking mode for one session. */
  cook: (sessionId: string) => `/cook/session?id=${enc(sessionId)}`,
  /** Nutrient retention for a finished session. */
  retention: (sessionId: string) => `/cook/session/retention?id=${enc(sessionId)}`,
  /** Post-meal feedback for a finished session. */
  feedback: (sessionId: string) => `/cook/session/feedback?id=${enc(sessionId)}`,
  /** Edit one of the user's own foods. */
  editFood: (id: string) => `/foods/edit?id=${enc(id)}`,
  newFood: "/foods/new",
} as const;
