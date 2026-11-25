import React from "react";

interface TabDescriptionProps {
  /** What the page says about each tab, by tab. */
  texts: Record<string, string>;
  /** The tab that is open: the only description that is shown. */
  active: string;
}

/**
 * The description under the title of the page, which differs from tab to tab. The descriptions
 * are long enough to wrap, and not alike in length, so the tab bar under the title would move up
 * and down by a line when the tab changes. Here every description is laid in one cell of a grid
 * and only the open tab's is shown, so the cell is as tall as the longest description at the
 * width and in the language of the moment, and the tab bar stays where it is.
 *
 * The others are hidden from sight and from assistive technology (`visibility: hidden`, and
 * `aria-hidden` for the readers that ignore it on text). They are spans, because the header puts
 * the description in a paragraph.
 */
const TabDescription: React.FC<TabDescriptionProps> = ({ texts, active }) => (
  <span style={{ display: "grid" }}>
    {Object.entries(texts).map(([tab, text]) => {
      const shown = tab === active;
      return (
        <span
          key={tab}
          aria-hidden={shown ? undefined : true}
          style={{ gridArea: "1 / 1", visibility: shown ? "visible" : "hidden" }}
        >
          {text}
        </span>
      );
    })}
  </span>
);

export default TabDescription;
