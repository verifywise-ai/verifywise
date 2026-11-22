/**
 * How an advisor write tool refuses invalid input at file time, before an
 * approval card is filed: the model is told which fields were wrong and to
 * ask the user for corrected values.
 */
export function throwOnValidationFailure(
  toolName: string,
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>,
): never {
  const errorList = issues
    .map((i) => {
      const pathStr = i.path.filter((p): p is string | number => typeof p !== "symbol").join(".");
      return `- ${pathStr || "(root)"}: ${i.message}`;
    })
    .join("\n");
  throw new Error(
    `${toolName} validation failed. You MUST tell the user verbatim that the following fields had invalid values and ask them for corrected values for each one before retrying. DO NOT call this tool again until every error below is addressed:\n${errorList}`,
  );
}
