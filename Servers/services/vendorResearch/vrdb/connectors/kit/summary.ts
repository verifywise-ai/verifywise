/**
 * The summary composer of the list kit: the text of a record, which is a few sentences about the
 * entry and then one closing sentence that says what the record is not (an entry of a list, no
 * finding about the vendor). The closing sentence is what the reader must never lose, so when the
 * text is too long it is the sentences before it that are cut, and it stays whole and last. This is
 * the rule of the FDA recalls (`summaryOf`, connectors/fdaRecalls.ts) as a function of the kit.
 *
 * Lengths are UTF-16 units, as `String.length` counts them, like every other limit of the kit.
 */
import { joinSentences } from "../../../records/sentence";
import { shorten } from "./clean";

/**
 * The text of a record: the sentences in order, then the closing sentence, which is never cut, in at
 * most `max` characters.
 *
 * The sentences are joined as `joinSentences` joins them: one blank between two, an empty one left
 * out. No full stop is added to a sentence, so one that ends in a full stop gets no second (`sentence`
 * of records/sentence.ts is what writes a sentence with its full stop). When the whole fits in `max`
 * it is the whole. Otherwise the sentences before the closing one are shortened (`shorten`, which
 * cuts at a code point and ends the cut in " [shortened]") to what the closing sentence and the blank
 * before it leave, and the closing sentence follows, whole. A room too small for a marker is cut
 * without one (that is how `shorten` treats a length of twelve or less), and a room of nothing leaves
 * the closing sentence alone. An empty closing sentence is left out like any empty sentence, and the
 * sentences are then cut to `max` themselves.
 *
 * It throws a RangeError, which is a mistake of the caller and never of the data (the closing
 * sentences are constants), for a `max` below one and for a closing sentence longer than `max`: no
 * text could hold it. A `max` that is not a whole number counts as the whole number below it.
 */
export function summaryWithClosing(
  sentences: readonly string[],
  closing: string,
  max: number,
): string {
  if (!(max >= 1)) throw new RangeError("A summary is at least one character long.");
  const limit = Math.floor(max);
  if (closing.length > limit) {
    throw new RangeError("The closing sentence is longer than the summary may be.");
  }
  const whole = joinSentences([...sentences, closing]);
  if (whole.length <= limit) return whole;
  const before = joinSentences(sentences);
  if (closing === "") return shorten(before, limit);
  // The blank between the cut sentences and the closing one is part of what the closing sentence costs.
  const room = limit - closing.length - 1;
  // A cut that has no marker may end in a blank: it is not kept, the one that follows is the only one.
  const kept = room > 0 ? shorten(before, room).trimEnd() : "";
  return joinSentences([kept, closing]);
}
