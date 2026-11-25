import { format } from "date-fns";

/**
 * Request header carrying the user's local date ("YYYY-MM-DD"). The server
 * records days it sets for the user (an incident approval date, the
 * Advisor's incident days) as this date when it is today somewhere on earth,
 * so an approver west of UTC in the evening gets their own day, not
 * tomorrow's UTC date.
 */
export const CLIENT_DATE_HEADER = "X-Client-Date";

/** The user's local date now, as "YYYY-MM-DD". */
export const clientDate = (now: Date = new Date()): string => format(now, "yyyy-MM-dd");
