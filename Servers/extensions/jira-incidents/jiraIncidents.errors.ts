export class JiraHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** 401 / 403 */
export class JiraAuthError extends JiraHttpError {}

/** 404 */
export class JiraNotFoundError extends JiraHttpError {}

export class JiraRateLimitError extends JiraHttpError {
  constructor(public retryAfterSeconds: number | null) {
    super(429, "Rate limited by Jira");
  }
}

/** Network failure, timeout or unreadable body. */
export class JiraUnreachableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JiraUnreachableError";
  }
}
