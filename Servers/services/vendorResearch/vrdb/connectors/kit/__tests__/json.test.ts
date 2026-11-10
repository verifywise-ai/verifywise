/**
 * The JSON readers of the list kit (kit/json.ts): a text that may be anything is read to a value, to
 * the items of an array, or to the items of lines, within the limits the caller gives, and what is
 * not JSON is null or unreadable and never an error.
 */
import { JSON_MAX_DEPTH, jsonOf, readJsonArray, readJsonLines } from "../json";

const cp = (...codes: number[]): string => String.fromCodePoint(...codes);

describe("jsonOf", () => {
  it.each([
    ["an object", '{"a":1,"b":[true,null,"x"]}', { a: 1, b: [true, null, "x"] }],
    ["an array", "[1,2,3]", [1, 2, 3]],
    ["a text", '"abc"', "abc"],
    ["a number", "-12.5e2", -1250],
    ["true", "true", true],
    ["false", "false", false],
    ["white space around the value", ' \n\t\r{"a":1}\r\n ', { a: 1 }],
    ["an empty object", "{}", {}],
    ["an empty array", "[]", []],
  ])("reads %s", (_name, text, value) => {
    expect(jsonOf(text)).toEqual(value);
  });

  it("gives null for the text of null, which is null as a failure is: the caller asks for an object or an array", () => {
    expect(jsonOf("null")).toBeNull();
  });

  it.each([
    ["no text", ""],
    ["blanks", "   "],
    ["text that is not JSON", "not json"],
    ["an HTML page", "<html><body>Error</body></html>"],
    ["a cut object", '{"a":1,'],
    ["a cut text", '{"a":"x'],
    ["a trailing comma", "[1,2,]"],
    ["single quotes", "{'a':1}"],
    ["a comment", '{"a":1}//x'],
    ["two values", "1 2"],
    ["a name without quotes", "{a:1}"],
    ["NaN", "NaN"],
    ["Infinity", "Infinity"],
    ["undefined", "undefined"],
    ["a byte order mark in front", `${cp(0xfeff)}{"a":1}`],
    ["a lone surrogate escape that is cut", '"\\ud83d'],
    ["a control character in a text", '"a\nb"'],
  ])("gives null for %s", (_name, text) => {
    expect(jsonOf(text)).toBeNull();
  });

  it("gives null, and does not throw, for nesting so deep that the parser would give up", () => {
    const depth = 1_000_000;
    const text = `${"[".repeat(depth)}${"]".repeat(depth)}`;
    expect(() => jsonOf(text)).not.toThrow();
    // The depth is capped before the parser is asked (review F1): the answer is always null.
    expect(jsonOf(text)).toBeNull();
  });

  it("gives null for a value that is no text at all, without throwing", () => {
    for (const value of [undefined, null, 5, {}, [], true]) {
      expect(() => jsonOf(value as unknown as string)).not.toThrow();
      expect(jsonOf(value as unknown as string)).toBeNull();
    }
  });

  it("gives objects that are plain: a __proto__ key is a key of its own and sets no prototype", () => {
    const value = jsonOf('{"__proto__":{"polluted":true},"a":1}') as Record<string, unknown>;
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(value, "__proto__")).toBe(true);
    expect((value.a as number) + 0).toBe(1);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    expect((value as { polluted?: boolean }).polluted).toBeUndefined();
  });
});

describe("readJsonArray", () => {
  describe("an array that fits", () => {
    it.each([
      ["numbers", "[1,2,3]", [1, 2, 3]],
      ["objects", '[{"a":1},{"a":2}]', [{ a: 1 }, { a: 2 }]],
      [
        "anything, mixed, as it is: the items are not validated",
        '[1,"x",null,true,[1],{"a":[]}]',
        [1, "x", null, true, [1], { a: [] }],
      ],
      ["one item", '["only"]', ["only"]],
      ["white space everywhere", " \n [ 1 ,\n 2\t,3 ] \r\n", [1, 2, 3]],
      [
        "nested arrays",
        "[[1,2],[3,[4]]]",
        [
          [1, 2],
          [3, [4]],
        ],
      ],
      [
        "texts that hold brackets, commas and quotes",
        '["a,b","]","[","\\"",",\\\\"]',
        ["a,b", "]", "[", '"', ",\\"],
      ],
      [
        "objects that hold texts with braces",
        '[{"a":"}{"},{"b":"]["}]',
        [{ a: "}{" }, { b: "][" }],
      ],
    ])("gives the items of %s, and says that there is no more", (_name, text, items) => {
      expect(readJsonArray(text, 100)).toEqual({ items, more: false, complete: true });
    });

    it("gives no item for an empty array, whatever the limit, even none", () => {
      expect(readJsonArray("[]", 5)).toEqual({ items: [], more: false, complete: true });
      expect(readJsonArray(" [ \n ] ", 5)).toEqual({ items: [], more: false, complete: true });
      expect(readJsonArray("[]", 0)).toEqual({ items: [], more: false, complete: true });
    });

    it("takes as many items as the limit, and no more is said", () => {
      expect(readJsonArray("[1,2,3]", 3)).toEqual({
        items: [1, 2, 3],
        more: false,
        complete: true,
      });
      expect(readJsonArray("[1]", 1)).toEqual({ items: [1], more: false, complete: true });
    });
  });

  describe("an array that is longer than the limit", () => {
    it("gives the first items, and says that there is more", () => {
      expect(readJsonArray("[1,2,3,4,5]", 2)).toEqual({
        items: [1, 2],
        more: true,
        complete: false,
      });
      expect(readJsonArray("[1,2,3]", 1)).toEqual({ items: [1], more: true, complete: false });
      expect(readJsonArray("[1,2,3]", 2)).toEqual({ items: [1, 2], more: true, complete: false });
    });

    it("takes a limit of none as no item at all, with more said for an array that is not empty", () => {
      expect(readJsonArray("[1]", 0)).toEqual({ items: [], more: true, complete: false });
      expect(readJsonArray("[[],[]]", 0)).toEqual({ items: [], more: true, complete: false });
    });

    it("counts the items of the array and no other: the commas of an item are not the array's", () => {
      expect(readJsonArray('[{"a":1,"b":2,"c":[1,2,3]},[4,5,6],"x,y,z"]', 3)).toEqual({
        items: [{ a: 1, b: 2, c: [1, 2, 3] }, [4, 5, 6], "x,y,z"],
        more: false,
        complete: true,
      });
      expect(readJsonArray('[{"a":1,"b":2},[4,5,6],"x,y,z",7]', 3)).toEqual({
        items: [{ a: 1, b: 2 }, [4, 5, 6], "x,y,z"],
        more: true,
        complete: false,
      });
    });

    it("does not read what lies past the items it takes: the rest may be anything", () => {
      expect(readJsonArray("[1,2,this is not json at all", 2)).toEqual({
        items: [1, 2],
        more: true,
        complete: false,
      });
      expect(readJsonArray(`[1,2,${"x".repeat(1000)}`, 2)).toEqual({
        items: [1, 2],
        more: true,
        complete: false,
      });
    });

    it("still reads the items it takes: an item that is not JSON is no list", () => {
      expect(readJsonArray("[1,oops,3,4]", 2)).toBeNull();
      expect(readJsonArray("[1 2,3,4]", 1)).toBeNull();
    });

    it("builds nothing of the items past the limit: 3 million small items cost the first two", () => {
      const text = `[${"1,".repeat(3_000_000)}1]`;
      const before = process.memoryUsage().heapUsed;
      const start = Date.now();
      const result = readJsonArray(text, 2);
      expect(result).toEqual({ items: [1, 1], more: true, complete: false });
      expect(Date.now() - start).toBeLessThan(10_000);
      expect(process.memoryUsage().heapUsed - before).toBeLessThan(100 * 1024 * 1024);
    });
  });

  describe("a text that is not an array", () => {
    it.each([
      ["no text", ""],
      ["blanks", "  \n "],
      ["an object", '{"a":[1,2]}'],
      ["a text", '"[1,2]"'],
      ["a number", "5"],
      ["null", "null"],
      ["true", "true"],
      ["something that is not JSON", "not json"],
      ["an HTML page", "<html>[1,2,3]</html>"],
      ["a byte order mark and an array", `${cp(0xfeff)}[1]`],
      ["an array that is not closed", "[1,2,3"],
      ["an array whose closing is missing in a text", '["a","b]'],
      ["an array that is cut after a comma", "[1,2,"],
      ["an array that is cut at its opening", "["],
      ["an array with a trailing comma", "[1,2,]"],
      ["an array with a hole", "[1,,2]"],
      ["an array that begins with a comma", "[,1]"],
      ["an array closed by a brace", "[1,2}"],
      ["an array and something after it", "[1,2] x"],
      ["an array and a second array", "[1][2]"],
      ["an array whose item is cut", '[{"a":1},{"a":]'],
      ["items that are not separated", "[1 2]"],
      ["an array of unquoted names", "[a,b]"],
    ])("is null for %s", (_name, text) => {
      expect(readJsonArray(text, 100)).toBeNull();
    });

    it("is null, and does not throw, for a value that is no text", () => {
      for (const value of [undefined, null, 5, {}, []]) {
        expect(() => readJsonArray(value as unknown as string, 10)).not.toThrow();
        expect(readJsonArray(value as unknown as string, 10)).toBeNull();
      }
    });
  });

  describe("the limit", () => {
    it.each([
      ["not a number", Number.NaN],
      ["negative", -1],
      ["minus infinity", Number.NEGATIVE_INFINITY],
    ])("is no item at all when it is %s", (_name, limit) => {
      expect(readJsonArray("[1,2]", limit)).toEqual({ items: [], more: true, complete: false });
      expect(readJsonArray("[]", limit)).toEqual({ items: [], more: false, complete: true });
    });

    it("takes the whole number below a fraction", () => {
      expect(readJsonArray("[1,2,3]", 2.9)).toEqual({ items: [1, 2], more: true, complete: false });
    });

    it("is no limit when it is infinite", () => {
      expect(readJsonArray("[1,2,3]", Number.POSITIVE_INFINITY)).toEqual({
        items: [1, 2, 3],
        more: false,
        complete: true,
      });
    });
  });

  describe("hostile texts", () => {
    it("gives plain objects: a __proto__ key is a key of its own", () => {
      const result = readJsonArray('[{"__proto__":{"polluted":true}},{"a":1}]', 10);
      const first = result?.items[0] as Record<string, unknown>;
      expect(Object.getPrototypeOf(first)).toBe(Object.prototype);
      expect(Object.prototype.hasOwnProperty.call(first, "__proto__")).toBe(true);
      expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
      expect((first as { polluted?: boolean }).polluted).toBeUndefined();
    });

    it("reads a text of a long string without a stack of its own: a single item of 20 million characters", () => {
      const text = `["${"a".repeat(20_000_000)}"]`;
      const start = Date.now();
      const result = readJsonArray(text, 10);
      expect(result?.items).toHaveLength(1);
      expect((result?.items[0] as string).length).toBe(20_000_000);
      expect(Date.now() - start).toBeLessThan(10_000);
    });

    it("says that it is no array for a text of 20 million opening brackets, quickly, without an exception", () => {
      const text = "[".repeat(20_000_000);
      const start = Date.now();
      expect(readJsonArray(text, 10)).toBeNull();
      expect(Date.now() - start).toBeLessThan(10_000);
    });

    it("gives null, and does not throw, for nesting that the parser would not read", () => {
      const depth = 1_000_000;
      const text = `[${"[".repeat(depth)}${"]".repeat(depth)}]`;
      expect(() => readJsonArray(text, 10)).not.toThrow();
      // Past the cap of depth the scan stops, and the text is no list of ours (review F1).
      expect(readJsonArray(text, 10)).toBeNull();
    });

    it("reads quotes and backslashes in texts as JSON does: an escaped quote does not end the text", () => {
      const text = '["a\\"]", "b\\\\", "c\\\\\\""]';
      expect(readJsonArray(text, 10)).toEqual({
        items: ['a"]', "b\\", 'c\\"'],
        more: false,
        complete: true,
      });
    });

    it("gives what JSON.parse gives for the same text, for arrays of many shapes", () => {
      const samples = [
        "[]",
        "[0]",
        "[[]]",
        "[{}]",
        '[{"a":{"b":{"c":[1,[2,[3]]]}}}]',
        '["\\u0041","\\n","\\\\"]',
        "[1e5,-0,0.5,1E-2]",
        '[true,false,null,"null"]',
        ` [ ${Array.from({ length: 200 }, (_, at) => `{"id":${at},"name":"n${at}","tags":["a","b"]}`).join(" ,\n")} ] `,
      ];
      for (const text of samples) {
        expect(readJsonArray(text, 1_000)).toEqual({
          items: JSON.parse(text),
          more: false,
          complete: true,
        });
      }
    });

    it("gives the first n of what JSON.parse gives, for every n", () => {
      const all = Array.from({ length: 30 }, (_, at) => ({
        id: at,
        name: `n${at}`,
        list: [at, "x,y"],
      }));
      const text = JSON.stringify(all);
      for (let limit = 0; limit <= 32; limit += 1) {
        const result = readJsonArray(text, limit);
        expect(result?.items).toEqual(all.slice(0, limit));
        expect(result?.more).toBe(limit < all.length);
      }
    });
  });
});

describe("readJsonLines", () => {
  it("gives the item of each line that holds a JSON value, in order", () => {
    const text = '{"a":1}\n{"a":2}\n[3]\n"four"\n5\nnull\ntrue\n';
    expect(readJsonLines(text, 100, 1000)).toEqual({
      items: [{ a: 1 }, { a: 2 }, [3], "four", 5, null, true],
      unreadable: 0,
      more: false,
      complete: true,
    });
  });

  it("reads a file that does not end with a line break, and one that ends with several", () => {
    expect(readJsonLines('{"a":1}\n{"a":2}', 10, 100).items).toHaveLength(2);
    expect(readJsonLines('{"a":1}\n\n\n', 10, 100)).toEqual({
      items: [{ a: 1 }],
      unreadable: 0,
      more: false,
      complete: true,
    });
  });

  it("reads a file whose lines end with a carriage return and a line feed", () => {
    expect(readJsonLines('{"a":1}\r\n{"a":2}\r\n', 10, 100)).toEqual({
      items: [{ a: 1 }, { a: 2 }],
      unreadable: 0,
      more: false,
      complete: true,
    });
  });

  it("skips a blank line without counting it, a line of blanks and tabs included", () => {
    const text = '\n{"a":1}\n   \n\t\t\n\r\n{"a":2}\n';
    expect(readJsonLines(text, 10, 100)).toEqual({
      items: [{ a: 1 }, { a: 2 }],
      unreadable: 0,
      more: false,
      complete: true,
    });
  });

  it("gives nothing for no text and for a text of line breaks and blanks", () => {
    expect(readJsonLines("", 10, 100)).toEqual({
      items: [],
      unreadable: 0,
      more: false,
      complete: true,
    });
    expect(readJsonLines("\n\n  \n", 10, 100)).toEqual({
      items: [],
      unreadable: 0,
      more: false,
      complete: true,
    });
  });

  it("counts a line that is not JSON as unreadable, and goes on", () => {
    const text = '{"a":1}\nnot json\n{"a":\n{"a":2}\n<html>\n';
    expect(readJsonLines(text, 10, 100)).toEqual({
      items: [{ a: 1 }, { a: 2 }],
      unreadable: 3,
      more: false,
      complete: true,
    });
  });

  it("counts a line of two values, a line that holds a value in pieces and a comma as unreadable: one value a line", () => {
    const text = '{"a":1} {"a":2}\n[1,\n2]\n{"a":3},\n';
    expect(readJsonLines(text, 10, 100)).toEqual({
      items: [],
      unreadable: 4,
      more: false,
      complete: true,
    });
  });

  it("counts a line longer than the limit as unreadable, without reading it, and a line of the limit is read", () => {
    const longest = '{"a":"xxxxxxxxxx"}';
    const text = `${longest}\n${longest}x\n${longest}\n`;
    expect(readJsonLines(text, 10, longest.length)).toEqual({
      items: [{ a: "xxxxxxxxxx" }, { a: "xxxxxxxxxx" }],
      unreadable: 1,
      more: false,
      complete: true,
    });
  });

  it("does not parse a line that is longer than the limit, whatever it is", () => {
    const parse = jest.spyOn(JSON, "parse");
    try {
      const text = `${"[".repeat(500)}\n{"a":1}\n`;
      const result = readJsonLines(text, 10, 100);
      expect(result.unreadable).toBe(1);
      expect(
        parse.mock.calls.some(([line]) => typeof line === "string" && line.startsWith("[[[")),
      ).toBe(false);
    } finally {
      parse.mockRestore();
    }
  });

  it("stops at the limit of items, and says that there is more when another line that holds something follows", () => {
    const text = '{"a":1}\n{"a":2}\n{"a":3}\n';
    expect(readJsonLines(text, 2, 100)).toEqual({
      items: [{ a: 1 }, { a: 2 }],
      unreadable: 0,
      more: true,
      complete: false,
    });
    expect(readJsonLines(text, 3, 100)).toEqual({
      items: [{ a: 1 }, { a: 2 }, { a: 3 }],
      unreadable: 0,
      more: false,
      complete: true,
    });
  });

  it("does not say that there is more for blank lines at the end", () => {
    expect(readJsonLines('{"a":1}\n\n   \n\n', 1, 100)).toEqual({
      items: [{ a: 1 }],
      unreadable: 0,
      more: false,
      complete: true,
    });
  });

  it("says that there is more for a line that follows the last item taken, even when it is not JSON: it is not read", () => {
    expect(readJsonLines('{"a":1}\nnot json\n', 1, 100)).toEqual({
      items: [{ a: 1 }],
      unreadable: 0,
      more: true,
      complete: false,
    });
  });

  it("takes a limit of none as no item at all", () => {
    expect(readJsonLines('{"a":1}\n', 0, 100)).toEqual({
      items: [],
      unreadable: 0,
      more: true,
      complete: false,
    });
    expect(readJsonLines("", 0, 100)).toEqual({
      items: [],
      unreadable: 0,
      more: false,
      complete: true,
    });
  });

  it.each([
    ["not a number", Number.NaN],
    ["negative", -5],
  ])("takes a limit of items that is %s as none", (_name, limit) => {
    expect(readJsonLines('{"a":1}\n', limit, 100)).toEqual({
      items: [],
      unreadable: 0,
      more: true,
      complete: false,
    });
  });

  it.each([
    ["not a number", Number.NaN],
    ["negative", -5],
  ])(
    "takes a limit of characters that is %s as none: every line is unreadable",
    (_name, longest) => {
      expect(readJsonLines('{"a":1}\n{"a":2}\n', 10, longest)).toEqual({
        items: [],
        unreadable: 2,
        more: false,
        complete: true,
      });
    },
  );

  it("gives plain objects: a __proto__ key is a key of its own", () => {
    const result = readJsonLines('{"__proto__":{"polluted":true}}\n', 10, 100);
    const first = result.items[0] as Record<string, unknown>;
    expect(Object.getPrototypeOf(first)).toBe(Object.prototype);
    expect((first as { polluted?: boolean }).polluted).toBeUndefined();
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it("does not take a byte order mark for a blank: the line that begins with it is not JSON", () => {
    expect(readJsonLines(`${cp(0xfeff)}{"a":1}\n{"a":2}\n`, 10, 100)).toEqual({
      items: [{ a: 2 }],
      unreadable: 1,
      more: false,
      complete: true,
    });
  });

  it("reads 200,000 lines in little time", () => {
    const text = Array.from({ length: 200_000 }, (_, at) => `{"id":${at},"name":"n${at}"}`).join(
      "\n",
    );
    const start = Date.now();
    const result = readJsonLines(text, 1_000_000, 1000);
    expect(result.items).toHaveLength(200_000);
    expect(result.unreadable).toBe(0);
    expect(Date.now() - start).toBeLessThan(10_000);
  });

  it("reads 10 million blank lines without building anything of them", () => {
    const text = "\n".repeat(10_000_000);
    const before = process.memoryUsage().heapUsed;
    const start = Date.now();
    expect(readJsonLines(text, 10, 100)).toEqual({
      items: [],
      unreadable: 0,
      more: false,
      complete: true,
    });
    expect(Date.now() - start).toBeLessThan(10_000);
    expect(process.memoryUsage().heapUsed - before).toBeLessThan(100 * 1024 * 1024);
  });

  it("counts one line of 50 million characters as one unreadable line, quickly", () => {
    const text = `${"a".repeat(50_000_000)}\n{"a":1}\n`;
    const start = Date.now();
    expect(readJsonLines(text, 10, 1000)).toEqual({
      items: [{ a: 1 }],
      unreadable: 1,
      more: false,
      complete: true,
    });
    expect(Date.now() - start).toBeLessThan(10_000);
  });

  it("is not thrown by a value that is no text", () => {
    for (const value of [undefined, null, 5, {}, []]) {
      expect(() => readJsonLines(value as unknown as string, 10, 10)).not.toThrow();
    }
  });
});

describe("the depth of nesting (review F1)", () => {
  /** The cap as the brief fixes it: a text of this many levels is read, and one more is not. */
  const CAP = 64;
  /** Arrays in arrays, `depth` of them. */
  const arrays = (depth: number): string => `${"[".repeat(depth)}${"]".repeat(depth)}`;
  /** Objects in objects, `depth` of them, with a value in the innermost. */
  const objects = (depth: number): string => `${'{"a":'.repeat(depth)}1${"}".repeat(depth)}`;
  /** An array in an object in an array, and so on: `depth` levels, the first of them an array. */
  const alternating = (depth: number): string => {
    let opening = "";
    let closing = "";
    for (let level = 0; level < depth; level += 1) {
      opening += level % 2 === 0 ? "[" : '{"a":';
      closing = `${level % 2 === 0 ? "]" : "}"}${closing}`;
    }
    return `${opening}1${closing}`;
  };
  /** Texts that hold many brackets and braces, one of them behind an escaped quote, one behind a backslash. */
  const bracketTexts = (): string[] => {
    const run = "[".repeat(1_000);
    return [run, "{".repeat(1_000), `"${run}`, `\\${run}`, `${run}"${"}".repeat(1_000)}`];
  };

  it("is 64 levels", () => {
    expect(JSON_MAX_DEPTH).toBe(CAP);
  });

  describe("jsonOf", () => {
    it.each([
      ["arrays", arrays],
      ["objects", objects],
      ["arrays and objects in turn", alternating],
    ])(
      "reads %s of exactly 64 levels, as JSON.parse does, and gives null for 65",
      (_name, make) => {
        expect(jsonOf(make(CAP))).not.toBeNull();
        expect(jsonOf(make(CAP))).toEqual(JSON.parse(make(CAP)));
        expect(jsonOf(make(CAP + 1))).toBeNull();
      },
    );

    it("gives null for 30,000 levels, which the parser would read", () => {
      expect(jsonOf(arrays(30_000))).toBeNull();
      expect(jsonOf(objects(30_000))).toBeNull();
    });

    it("does not count the brackets and braces of texts: not a long run of them, not one behind an escaped quote or a backslash", () => {
      const strings = bracketTexts();
      expect(jsonOf(JSON.stringify(strings))).toEqual(strings);
      const keyed = Object.fromEntries(strings.map((text) => [text, text]));
      expect(jsonOf(JSON.stringify(keyed))).toEqual(keyed);
    });

    it("reads a normal object with arrays at depth 10 as it always did", () => {
      const tags = `${"[".repeat(10)}"deep"${"]".repeat(10)}`;
      const text = `{"id":1,"name":"Acme","tags":${tags},"more":{"a":{"b":[1,2,{"c":[3]}]}}}`;
      const value = jsonOf(text) as { id: number; more: { a: { b: unknown[] } } };
      expect(value).toEqual(JSON.parse(text));
      expect(value.id).toBe(1);
      expect(value.more.a.b).toEqual([1, 2, { c: [3] }]);
    });

    it("asks the depth before the parser: JSON.parse is not called for a text that is too deep", () => {
      const parse = jest.spyOn(JSON, "parse");
      try {
        const tooDeep = jsonOf(arrays(CAP + 1));
        expect(tooDeep).toBeNull();
        expect(parse).not.toHaveBeenCalled();
        expect(jsonOf(arrays(CAP))).not.toBeNull();
        expect(parse).toHaveBeenCalledTimes(1);
      } finally {
        parse.mockRestore();
      }
    });
  });

  describe("readJsonArray", () => {
    it.each([
      ["arrays", (depth: number) => arrays(depth)],
      ["objects in an array", (depth: number) => `[${objects(depth - 1)}]`],
      ["arrays and objects in turn", alternating],
    ])(
      "reads %s of exactly 64 levels, the array's own brackets counted, and gives null for 65",
      (_name, make) => {
        const text = make(CAP);
        const result = readJsonArray(text, 10);
        expect(result?.items).toEqual(JSON.parse(text));
        expect(result?.more).toBe(false);
        expect(readJsonArray(make(CAP + 1), 10)).toBeNull();
      },
    );

    it("gives null for 30,000 levels, with 10 items allowed, as jsonOf does", () => {
      const text = arrays(30_000);
      expect(readJsonArray(text, 10)).toBeNull();
      expect(jsonOf(text)).toBeNull();
    });

    it("gives null for an item that is too deep among the items it takes, whatever follows it", () => {
      expect(readJsonArray(`[${arrays(CAP)},2,3]`, 2)).toBeNull();
      expect(readJsonArray(`[1,${arrays(CAP)},3]`, 10)).toBeNull();
      expect(readJsonArray(`[1,{"a":${arrays(CAP)}}]`, 10)).toBeNull();
    });

    it("takes an item of 63 levels, which with the array's own brackets are 64", () => {
      const items = readJsonArray(`[${arrays(CAP - 1)},2]`, 10)?.items;
      expect(items).toEqual([JSON.parse(arrays(CAP - 1)), 2]);
    });

    it("does not count the brackets and braces of texts, as jsonOf does not", () => {
      const strings = bracketTexts();
      expect(readJsonArray(JSON.stringify(strings), 10)?.items).toEqual(strings);
      const keyed = strings.map((text) => ({ [text]: text }));
      expect(readJsonArray(JSON.stringify(keyed), 10)?.items).toEqual(keyed);
    });

    it("reads an array of objects that hold arrays at depth 10 as it always did", () => {
      const tags = `${"[".repeat(10)}"deep"${"]".repeat(10)}`;
      const text = `[{"id":1,"tags":${tags}},{"id":2,"tags":[[1],[2,[3]]]},{"id":3}]`;
      expect(readJsonArray(text, 10)?.items).toEqual(JSON.parse(text));
      expect(readJsonArray(text, 2)?.items).toEqual(JSON.parse(text).slice(0, 2));
      expect(readJsonArray(text, 2)?.more).toBe(true);
    });

    it("reads nothing of what lies past the items it takes: nesting there is no matter, and costs nothing", () => {
      const text = `[1,2,${"[".repeat(3_000_000)}`;
      const start = Date.now();
      const result = readJsonArray(text, 2);
      expect(result?.items).toEqual([1, 2]);
      expect(result?.more).toBe(true);
      expect(Date.now() - start).toBeLessThan(10_000);
    });

    it("bounds the cost of nesting: 3 MB of opening and closing brackets is null in well under a second, for both readers", () => {
      const text = arrays(1_500_000);
      expect(text.length).toBe(3_000_000);
      const start = Date.now();
      expect(readJsonArray(text, 10)).toBeNull();
      expect(jsonOf(text)).toBeNull();
      // The scan stops at the first level past the cap, so no structure that grows with the depth is built.
      expect(Date.now() - start).toBeLessThan(10_000);
    });
  });

  describe("readJsonLines", () => {
    it("counts a line that is nested past the cap as unreadable, without parsing it, and reads the next line", () => {
      const text = `${arrays(100_000)}\n{"a":1}\n`;
      const start = Date.now();
      const result = readJsonLines(text, 10, 1_000_000);
      expect(result.items).toEqual([{ a: 1 }]);
      expect(result.unreadable).toBe(1);
      expect(result.more).toBe(false);
      expect(result.complete).toBe(true);
      // The scan stops at the first level past the cap: nothing grows with the depth.
      expect(Date.now() - start).toBeLessThan(10_000);
    });

    it("does not call the parser for a line that is too deep", () => {
      const parse = jest.spyOn(JSON, "parse");
      try {
        const result = readJsonLines(`${arrays(CAP + 1)}\n`, 10, 10_000);
        expect(result.unreadable).toBe(1);
        expect(parse).not.toHaveBeenCalled();
      } finally {
        parse.mockRestore();
      }
    });

    it("reads a line that is exactly as deep as the cap, and counts the next level as unreadable", () => {
      const result = readJsonLines(
        `${arrays(CAP)}\n${arrays(CAP + 1)}\n${objects(CAP)}\n`,
        10,
        10_000,
      );
      expect(result.items).toHaveLength(2);
      expect(result.unreadable).toBe(1);
    });

    it("does not count a bracket inside a text of a line as a level", () => {
      const result = readJsonLines(`{"a":"${"[".repeat(1_000)}"}\n`, 10, 10_000);
      expect(result.items).toEqual([{ a: "[".repeat(1_000) }]);
      expect(result.unreadable).toBe(0);
    });
  });
});

describe("complete (review F4): the readers say whether they gave the whole list", () => {
  describe("readJsonArray", () => {
    it("is true for an array that fits, whatever the limit above its items, and for an empty one with any limit", () => {
      expect(readJsonArray("[1,2,3]", 100)?.complete).toBe(true);
      expect(readJsonArray("[1,2,3]", 3)?.complete).toBe(true);
      expect(readJsonArray("[1]", 1)?.complete).toBe(true);
      expect(readJsonArray("[1,2,3]", Number.POSITIVE_INFINITY)?.complete).toBe(true);
      expect(readJsonArray("[]", 5)?.complete).toBe(true);
      expect(readJsonArray(" [ \n ] ", 5)?.complete).toBe(true);
      expect(readJsonArray("[]", 0)?.complete).toBe(true);
      expect(readJsonArray("[]", Number.NaN)?.complete).toBe(true);
    });

    it("is false when the array holds more items than the limit", () => {
      expect(readJsonArray("[1,2,3,4,5]", 2)).toMatchObject({ more: true, complete: false });
      expect(readJsonArray("[1,2,3]", 2)?.complete).toBe(false);
      expect(readJsonArray("[1,2,3]", 1)?.complete).toBe(false);
      expect(readJsonArray("[1,2,3]", 2.9)?.complete).toBe(false);
    });

    it("is false for a limit of none or less when the array holds an item", () => {
      expect(readJsonArray("[1]", 0)).toMatchObject({ items: [], more: true, complete: false });
      expect(readJsonArray("[[],[]]", 0)?.complete).toBe(false);
      for (const limit of [Number.NaN, -1, Number.NEGATIVE_INFINITY]) {
        expect(readJsonArray("[1,2]", limit)?.complete).toBe(false);
      }
    });

    it("is false when something follows the last item that is taken, though it is not read", () => {
      expect(readJsonArray("[1,2,this is not json at all", 2)).toMatchObject({
        items: [1, 2],
        more: true,
        complete: false,
      });
    });

    it("is not given when the text is no array: the result is null", () => {
      for (const text of ["", "{}", "[1,2", "[1,oops]", "not json"]) {
        expect(readJsonArray(text, 10)).toBeNull();
      }
    });

    it("is the opposite of more, for every limit from none to two items over", () => {
      const text = JSON.stringify([1, 2, 3, 4, 5]);
      for (let limit = 0; limit <= 7; limit += 1) {
        const result = readJsonArray(text, limit);
        expect(result?.more).toBe(limit < 5);
        expect(result?.complete).toBe(limit >= 5);
      }
    });
  });

  describe("readJsonLines", () => {
    it("is true when every line was read, even if some could not be: the count of unreadable lines says what was in the list", () => {
      expect(readJsonLines('{"a":1}\n{"a":2}\n', 10, 100)).toMatchObject({
        unreadable: 0,
        complete: true,
      });
      expect(readJsonLines('{"a":1}\nnot json\n{"a":\n{"a":2}\n', 10, 100)).toMatchObject({
        unreadable: 2,
        more: false,
        complete: true,
      });
      expect(readJsonLines(`${"x".repeat(200)}\n{"a":1}\n`, 10, 100)).toMatchObject({
        unreadable: 1,
        complete: true,
      });
    });

    it("is true for no text, for line breaks and blanks, and for blank lines after the last item", () => {
      for (const text of ["", "\n\n  \n", '{"a":1}\n\n   \n\n']) {
        expect(readJsonLines(text, 1, 100).complete).toBe(true);
      }
    });

    it("is true when the limit of items is the number of items, and false one item below it", () => {
      const text = '{"a":1}\n{"a":2}\n{"a":3}\n';
      expect(readJsonLines(text, 3, 100).complete).toBe(true);
      expect(readJsonLines(text, 4, 100).complete).toBe(true);
      expect(readJsonLines(text, 2, 100)).toMatchObject({ more: true, complete: false });
    });

    it("is false when another line that holds something follows the last item taken, though it is not JSON", () => {
      expect(readJsonLines('{"a":1}\nnot json\n', 1, 100)).toMatchObject({
        items: [{ a: 1 }],
        unreadable: 0,
        more: true,
        complete: false,
      });
    });

    it("is false for a limit of none or less when there is a line", () => {
      for (const limit of [0, Number.NaN, -5]) {
        expect(readJsonLines('{"a":1}\n', limit, 100).complete).toBe(false);
      }
      expect(readJsonLines("", 0, 100).complete).toBe(true);
    });

    it("is the opposite of more, for every limit from none to two items over", () => {
      const text = '{"a":1}\n{"a":2}\nnot json\n{"a":4}\n';
      for (let limit = 0; limit <= 6; limit += 1) {
        const result = readJsonLines(text, limit, 100);
        expect(result.complete).toBe(!result.more);
      }
      // Three items and an unreadable line: with room for three items every line is read.
      expect(readJsonLines(text, 2, 100).complete).toBe(false);
      expect(readJsonLines(text, 3, 100)).toMatchObject({ unreadable: 1, complete: true });
    });
  });
});
