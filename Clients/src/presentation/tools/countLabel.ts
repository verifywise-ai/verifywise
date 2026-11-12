/**
 * A count with its noun in the right number: countLabel(1, "prompt") → "1 prompt",
 * countLabel(3, "prompt") → "3 prompts". Pass the plural for irregular nouns:
 * countLabel(2, "entry", "entries").
 */
export function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
