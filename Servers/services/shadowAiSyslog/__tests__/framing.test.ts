import { SyslogFramer } from "../framing";

const buf = (s: string) => Buffer.from(s, "utf8");

describe("SyslogFramer", () => {
  it("splits two LF lines in one chunk", () => {
    const f = new SyslogFramer();
    expect(f.push(buf("one\ntwo\n"))).toEqual({
      messages: ["one", "two"],
      oversized: 0,
    });
  });

  it("tolerates CRLF", () => {
    const f = new SyslogFramer();
    expect(f.push(buf("one\r\ntwo\r\n")).messages).toEqual(["one", "two"]);
  });

  it("holds a partial line until its newline arrives", () => {
    const f = new SyslogFramer();
    expect(f.push(buf("par")).messages).toEqual([]);
    expect(f.push(buf("tial\n")).messages).toEqual(["partial"]);
  });

  it("reads octet-counted frames", () => {
    const f = new SyslogFramer();
    const msg = "<34>1 hello!";
    expect(f.push(buf(`${msg.length} ${msg}`)).messages).toEqual([msg]);
  });

  it("mixes octet counting and LF on one stream", () => {
    const f = new SyslogFramer();
    const msg = "abc def";
    const out = f.push(buf(`${msg.length} ${msg}line two\n`));
    expect(out.messages).toEqual([msg, "line two"]);
  });

  it("does not treat a Squid epoch line as octet counted", () => {
    const f = new SyslogFramer();
    const line = "1707489120.000 200 10.0.0.1 TCP_MISS/200";
    expect(f.push(buf(`${line}\n`)).messages).toEqual([line]);
  });

  it("reassembles a frame split across three pushes inside vw_source=", () => {
    const f = new SyslogFramer();
    const line = "user=a@b.co vw_source=vwsl_1_abc dst=x.com";
    const cut = line.indexOf("vw_source=") + 4;
    expect(f.push(buf(line.slice(0, cut))).messages).toEqual([]);
    expect(f.push(buf(line.slice(cut, cut + 8))).messages).toEqual([]);
    expect(f.push(buf(`${line.slice(cut + 8)}\n`)).messages).toEqual([line]);
  });

  it("reassembles an octet-counted frame split across pushes", () => {
    const f = new SyslogFramer();
    const msg = "vw_source=abc payload";
    const frame = `${msg.length} ${msg}`;
    expect(f.push(buf(frame.slice(0, 1))).messages).toEqual([]);
    expect(f.push(buf(frame.slice(1, 15))).messages).toEqual([]);
    expect(f.push(buf(frame.slice(15))).messages).toEqual([msg]);
  });

  it("counts an oversized LF line and still delivers the next one", () => {
    const f = new SyslogFramer();
    const out = f.push(buf(`${"x".repeat(70000)}\nnext\n`));
    expect(out).toEqual({ messages: ["next"], oversized: 1 });
  });

  it("discards an oversized line that arrives in pieces", () => {
    const f = new SyslogFramer();
    const first = f.push(buf("x".repeat(70000)));
    expect(first).toEqual({ messages: [], oversized: 1 });
    expect(f.push(buf("more\nnext\n"))).toEqual({
      messages: ["next"],
      oversized: 0,
    });
  });

  it("skips an oversized octet-counted frame and keeps the next", () => {
    const f = new SyslogFramer(100);
    const big = "y".repeat(150);
    const out = f.push(buf(`150 ${big}5 hello`));
    expect(out).toEqual({ messages: ["hello"], oversized: 1 });
  });
});
