// Build replacement dict for policy
export function buildPolicyReplacements(policy: any): Record<string, any> {
  return {
    "policy.title": policy.title,
    "policy.content": policy.content_html || "",
    "policy.status": policy.status || "",
    "policy.tags": Array.isArray(policy.tags) ? policy.tags.join(", ") : "",
    "policy.next_review_date": policy.next_review_date
      ? new Date(policy.next_review_date).toLocaleDateString("en-US", { dateStyle: "long" })
      : "",
    "policy.author": policy.author_name || policy.author_id,
    "policy.reviewers": policy.reviewer_names || "",
    date_and_time: new Date().toLocaleString("en-US", {
      dateStyle: "long",
      timeStyle: "short",
    }),
  };
}

export function buildPolicyUpdateReplacements(oldPolicy: any, newPolicy: any): Record<string, any> {
  const nextReviewDate = newPolicy.next_review_date
    ? new Date(newPolicy.next_review_date).toLocaleDateString("en-US", { dateStyle: "long" })
    : "";
  const oldNextReviewDate = oldPolicy.next_review_date
    ? new Date(oldPolicy.next_review_date).toLocaleDateString("en-US", { dateStyle: "long" })
    : "";
  const tags = Array.isArray(newPolicy.tags) ? newPolicy.tags.join(", ") : "";
  const oldTags = Array.isArray(oldPolicy.tags) ? oldPolicy.tags.join(", ") : "";

  // Build changes summary - only show changed fields with arrow, unchanged fields without arrow
  const changes: string[] = [];

  if (oldPolicy.title !== newPolicy.title) {
    changes.push(`• Title: ${oldPolicy.title || "(empty)"} → ${newPolicy.title || "(empty)"}`);
  } else if (newPolicy.title) {
    changes.push(`• Title: ${newPolicy.title}`);
  }

  if (oldPolicy.content_html !== newPolicy.content_html) {
    changes.push(
      `• Content: ${oldPolicy.content_html || "(empty)"} → ${newPolicy.content_html || "(empty)"}`,
    );
  } else if (newPolicy.content_html) {
    changes.push(`• Content: ${newPolicy.content_html}`);
  }

  if (oldPolicy.status !== newPolicy.status) {
    changes.push(`• Status: ${oldPolicy.status || "(empty)"} → ${newPolicy.status || "(empty)"}`);
  } else if (newPolicy.status) {
    changes.push(`• Status: ${newPolicy.status}`);
  }

  if (oldTags !== tags) {
    changes.push(`• Tags: ${oldTags || "(empty)"} → ${tags || "(empty)"}`);
  } else if (tags) {
    changes.push(`• Tags: ${tags}`);
  }

  if (oldNextReviewDate !== nextReviewDate) {
    changes.push(
      `• Next Review Date: ${oldNextReviewDate || "(empty)"} → ${nextReviewDate || "(empty)"}`,
    );
  } else if (nextReviewDate) {
    changes.push(`• Next Review Date: ${nextReviewDate}`);
  }

  const oldAuthor = oldPolicy.author_name || oldPolicy.author_id;
  const newAuthor = newPolicy.author_name || newPolicy.author_id;
  if (oldAuthor !== newAuthor) {
    changes.push(`• Author: ${oldAuthor || "(empty)"} → ${newAuthor || "(empty)"}`);
  } else if (newAuthor) {
    changes.push(`• Author: ${newAuthor}`);
  }

  const oldReviewers = oldPolicy.reviewer_names || "";
  const newReviewers = newPolicy.reviewer_names || "";
  if (oldReviewers !== newReviewers) {
    changes.push(`• Reviewers: ${oldReviewers || "(empty)"} → ${newReviewers || "(empty)"}`);
  } else if (newReviewers) {
    changes.push(`• Reviewers: ${newReviewers}`);
  }

  const changesSummary = changes.join("\n");

  return {
    // Current/new policy values
    "policy.title": newPolicy.title,
    "policy.content": newPolicy.content_html || "",
    "policy.status": newPolicy.status || "",
    "policy.tags": tags,
    "policy.next_review_date": nextReviewDate,
    "policy.author": newAuthor,
    "policy.reviewers": newReviewers,

    // Old policy values
    "old_policy.title": oldPolicy.title,
    "old_policy.content": oldPolicy.content_html || "",
    "old_policy.status": oldPolicy.status || "",
    "old_policy.tags": oldTags,
    "old_policy.next_review_date": oldNextReviewDate,
    "old_policy.author": oldAuthor,
    "old_policy.reviewers": oldReviewers,

    // Changes summary
    changes_summary: changesSummary,

    date_and_time: new Date().toLocaleString("en-US", {
      dateStyle: "long",
      timeStyle: "short",
    }),
  };
}
