// Build replacement dict for vendor
export function buildVendorReplacements(vendor: any): Record<string, any> {
  const _reviewDate = new Date(vendor.review_date);
  _reviewDate.setHours(0, 0, 0, 0);
  const reviewDate = _reviewDate.toLocaleDateString("en-US", { dateStyle: "long" });
  return {
    "vendor.name": vendor.vendor_name,
    "vendor.id": vendor.id,
    "vendor.provides": vendor.vendor_provides,
    "vendor.website": vendor.website,
    "vendor.contact": vendor.vendor_contact_person,
    date_and_time: new Date().toLocaleString("en-US", {
      dateStyle: "long",
      timeStyle: "short",
    }),
    "vendor.review_date": reviewDate,
    "vendor.reviewer": vendor.reviewer_name,
  };
}

export function buildVendorUpdateReplacements(oldVendor: any, newVendor: any): Record<string, any> {
  const _reviewDate = new Date(newVendor.review_date);
  _reviewDate.setHours(0, 0, 0, 0);
  const reviewDate = _reviewDate.toLocaleDateString("en-US", { dateStyle: "long" });

  const _oldReviewDate = new Date(oldVendor.review_date);
  _oldReviewDate.setHours(0, 0, 0, 0);
  const oldReviewDate = _oldReviewDate.toLocaleDateString("en-US", { dateStyle: "long" });

  // Build changes summary - only show changed fields with arrow, unchanged fields without arrow
  const changes: string[] = [];

  if (oldVendor.vendor_name !== newVendor.vendor_name) {
    changes.push(`• Name: ${oldVendor.vendor_name} → ${newVendor.vendor_name}`);
  } else if (newVendor.vendor_name) {
    changes.push(`• Name: ${newVendor.vendor_name}`);
  }

  if (oldVendor.vendor_provides !== newVendor.vendor_provides) {
    changes.push(
      `• Provides: ${oldVendor.vendor_provides || "(empty)"} → ${newVendor.vendor_provides || "(empty)"}`,
    );
  } else if (newVendor.vendor_provides) {
    changes.push(`• Provides: ${newVendor.vendor_provides}`);
  }

  if (oldVendor.website !== newVendor.website) {
    changes.push(
      `• Website: ${oldVendor.website || "(empty)"} → ${newVendor.website || "(empty)"}`,
    );
  } else if (newVendor.website) {
    changes.push(`• Website: ${newVendor.website}`);
  }

  if (oldVendor.vendor_contact_person !== newVendor.vendor_contact_person) {
    changes.push(
      `• Contact: ${oldVendor.vendor_contact_person || "(empty)"} → ${newVendor.vendor_contact_person || "(empty)"}`,
    );
  } else if (newVendor.vendor_contact_person) {
    changes.push(`• Contact: ${newVendor.vendor_contact_person}`);
  }

  if (oldReviewDate !== reviewDate) {
    changes.push(`• Review Date: ${oldReviewDate} → ${reviewDate}`);
  } else if (reviewDate) {
    changes.push(`• Review Date: ${reviewDate}`);
  }

  if (oldVendor.reviewer_name !== newVendor.reviewer_name) {
    changes.push(
      `• Reviewer: ${oldVendor.reviewer_name || "(empty)"} → ${newVendor.reviewer_name || "(empty)"}`,
    );
  } else if (newVendor.reviewer_name) {
    changes.push(`• Reviewer: ${newVendor.reviewer_name}`);
  }

  const changesSummary = changes.join("\n");

  return {
    // Current/new vendor values
    "vendor.name": newVendor.vendor_name,
    "vendor.id": newVendor.id,
    "vendor.provides": newVendor.vendor_provides,
    "vendor.website": newVendor.website,
    "vendor.contact": newVendor.vendor_contact_person,
    "vendor.review_date": reviewDate,
    "vendor.reviewer": newVendor.reviewer_name,

    // Old vendor values
    "old_vendor.name": oldVendor.vendor_name,
    "old_vendor.id": oldVendor.id,
    "old_vendor.provides": oldVendor.vendor_provides,
    "old_vendor.website": oldVendor.website,
    "old_vendor.contact": oldVendor.vendor_contact_person,
    "old_vendor.review_date": oldReviewDate,
    "old_vendor.reviewer": oldVendor.reviewer_name,

    // Changes summary
    changes_summary: changesSummary,

    date_and_time: new Date().toLocaleString("en-US", {
      dateStyle: "long",
      timeStyle: "short",
    }),
  };
}
