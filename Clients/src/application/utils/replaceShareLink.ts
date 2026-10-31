interface ShareLinkSummary {
  id: number;
  is_enabled: boolean;
  created_by: number;
}

export type ReplaceShareLinkResult =
  | { created: false }
  | {
      created: true;
      /** The user's own old links that could not be disabled. */
      failed: number;
      /** Enabled links created by other users; only their creators may disable them. */
      othersStillActive: number;
      /** Why each failed disable was rejected, for logging. */
      errors: unknown[];
    };

interface ReplaceShareLinkArgs {
  /** The resource's share links as they were before the replacement. */
  existingLinks: ShareLinkSummary[];
  currentUserId: number | null;
  /** Creates the new link; resolves to a falsy value when creation failed. */
  createLink: () => Promise<unknown>;
  disableLink: (id: number) => Promise<unknown>;
}

/**
 * Replaces a resource's share links with a new one. The new link is created
 * first, so a failure leaves the old links working. Then the user's own
 * enabled links are disabled, all of them attempted even if some fail. Links
 * created by other users are only counted: the server lets only a link's
 * creator change it.
 */
export async function replaceShareLink({
  existingLinks,
  currentUserId,
  createLink,
  disableLink,
}: ReplaceShareLinkArgs): Promise<ReplaceShareLinkResult> {
  if (!(await createLink())) return { created: false };

  const enabled = existingLinks.filter((link) => link.is_enabled);
  const own = enabled.filter((link) => link.created_by === currentUserId);
  const results = await Promise.allSettled(own.map((link) => disableLink(link.id)));
  const errors = results
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => result.reason);

  return {
    created: true,
    failed: errors.length,
    othersStillActive: enabled.length - own.length,
    errors,
  };
}
