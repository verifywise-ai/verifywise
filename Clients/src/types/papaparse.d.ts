declare module "papaparse" {
  interface ParseConfig<T = any> {
    delimiter?: string;
    newline?: string;
    quoteChar?: string;
    escapeChar?: string;
    header?: boolean;
    dynamicTyping?: boolean;
    preview?: number;
    encoding?: string;
    worker?: boolean;
    comments?: boolean | string;
    complete?: (results: ParseResult<T>) => void;
    error?: (error: ParseError) => void;
    skipEmptyLines?: boolean | "greedy";
    fastMode?: boolean;
    transform?: (value: string, field: string | number) => any;
    transformHeader?: (header: string, index: number) => string;
  }

  interface ParseError {
    type: string;
    code: string;
    message: string;
    row?: number;
  }

  interface ParseMeta {
    delimiter: string;
    linebreak: string;
    aborted: boolean;
    fields?: string[];
    truncated: boolean;
  }

  interface ParseResult<T = any> {
    data: T[];
    errors: ParseError[];
    meta: ParseMeta;
  }

  function parse<T = any>(input: string | File, config?: ParseConfig<T>): ParseResult<T>;

  export default { parse };
  export { parse, ParseResult, ParseConfig, ParseError, ParseMeta };
}
