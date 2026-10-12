/**
 * The robots.txt rules of the web research toolkit (RFC 9309), applied before a page is read.
 *
 * `parseRobots` turns the text of a robots.txt file into the rules that apply to our bot, and
 * `createRobotsChecker` fetches and caches that file once per origin. The file is written by
 * whoever owns the site, so a pattern is never compiled into a regular expression: a pattern
 * with many wildcards would make a backtracking engine run for as long as the site likes. A
 * pattern is matched piece by piece instead, and the work stays proportional to the path length
 * times the pattern length.
 */
import { BOT_TOKEN } from "./guardedFetch";

export interface RobotsRules {
  /** `pathWithQuery` is the path of the URL followed by its query string, as in `/a/b?c=d`. */
  isAllowed(pathWithQuery: string): boolean;
}

export const ALLOW_ALL: RobotsRules = { isAllowed: () => true };
export const DISALLOW_ALL: RobotsRules = { isAllowed: () => false };

interface Rule {
  allow: boolean;
  /** The pattern split at each `*`, without its trailing `$`. */
  pieces: string[];
  /** The pattern ends in `$`: the match has to reach the end of the path and query. */
  anchored: boolean;
  /** The length of the pattern as written, `*` and `$` included. The longer rule is more specific. */
  weight: number;
}

interface Group {
  /** Lower-cased agent names, `*` for every agent. */
  agents: string[];
  rules: Rule[];
}

function compileRule(allow: boolean, pattern: string): Rule {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  return { allow, pieces: body.split("*"), anchored, weight: pattern.length };
}

/** Whether the path starts with the pattern, where `*` stands for any run of characters. */
function matches(rule: Rule, path: string): boolean {
  const { pieces, anchored } = rule;
  const first = pieces[0];
  if (!path.startsWith(first)) return false;
  let position = first.length;
  if (pieces.length === 1) return anchored ? path.length === position : true;
  // Taking the first place each piece is found leaves the most room for the pieces after it.
  for (let i = 1; i < pieces.length - 1; i++) {
    const found = path.indexOf(pieces[i], position);
    if (found < 0) return false;
    position = found + pieces[i].length;
  }
  const last = pieces[pieces.length - 1];
  if (anchored) return path.length - last.length >= position && path.endsWith(last);
  return path.indexOf(last, position) >= 0;
}

/**
 * Consecutive `User-agent` lines open one group, and the first `Allow` or `Disallow` line after
 * them closes the list of agents, even when its value is empty (it then adds no rule). Other
 * fields (`Crawl-delay`, `Sitemap`, anything unknown), lines without a colon and rules before the
 * first `User-agent` line are ignored, and none of them ends the list of agents.
 */
function parseGroups(text: string): Group[] {
  const groups: Group[] = [];
  let current: Group | undefined;
  let listingAgents = false;
  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const hash = rawLine.indexOf("#");
    const line = (hash >= 0 ? rawLine.slice(0, hash) : rawLine).trim();
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    // trim() also removes the byte order mark that a file may start with.
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === "user-agent") {
      if (!current || !listingAgents) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      listingAgents = true;
      if (value) current.agents.push(value.toLowerCase());
    } else if ((field === "allow" || field === "disallow") && current) {
      listingAgents = false;
      if (value) current.rules.push(compileRule(field === "allow", value));
    }
  }
  return groups;
}

/**
 * The rules of the groups that name the longest agent that `agentToken` contains, else the rules
 * of the `*` groups, else nothing. A file may name one agent in several groups, and their rules
 * are combined (RFC 9309, 2.2.1).
 */
function rulesFor(groups: Group[], agentToken: string): Rule[] {
  const token = agentToken.toLowerCase();
  let name = "*";
  let longest = 0;
  for (const group of groups) {
    for (const agent of group.agents) {
      if (agent !== "*" && agent.length > longest && token.includes(agent)) {
        name = agent;
        longest = agent.length;
      }
    }
  }
  return groups.filter((group) => group.agents.includes(name)).flatMap((group) => group.rules);
}

/**
 * Parses the text of a robots.txt file for the agent `agentToken` (default: our bot). The longest
 * matching rule decides, `Allow` wins a tie, and a path that no rule matches is allowed.
 */
export function parseRobots(text: string, agentToken: string = BOT_TOKEN): RobotsRules {
  const rules = rulesFor(parseGroups(text), agentToken);
  if (rules.length === 0) return ALLOW_ALL;
  return {
    isAllowed(pathWithQuery) {
      let decisive: Rule | undefined;
      for (const rule of rules) {
        if (!matches(rule, pathWithQuery)) continue;
        if (
          !decisive ||
          rule.weight > decisive.weight ||
          (rule.weight === decisive.weight && rule.allow && !decisive.allow)
        ) {
          decisive = rule;
        }
      }
      return decisive ? decisive.allow : true;
    },
  };
}

export interface RobotsChecker {
  isAllowed(url: URL): Promise<boolean>;
}

/**
 * Checks URLs against the robots.txt of their origin. The file is requested once per origin for
 * the life of the checker, and concurrent calls for one origin share that request. A 2xx answer
 * is parsed, a 4xx answer means the site has no rules (everything is allowed), and every other
 * answer, or a request that could not be made, allows nothing (RFC 9309, 2.3.1).
 *
 * @param fetchRobots Resolves with the status and text of `<origin>/robots.txt`, or rejects when
 * it could not be fetched.
 */
export function createRobotsChecker(
  fetchRobots: (robotsUrl: string) => Promise<{ status: number; text: string }>,
  agentToken: string = BOT_TOKEN,
): RobotsChecker {
  const rulesByOrigin = new Map<string, Promise<RobotsRules>>();

  async function loadRules(origin: string): Promise<RobotsRules> {
    try {
      const { status, text } = await fetchRobots(`${origin}/robots.txt`);
      if (status >= 200 && status < 300) return parseRobots(text, agentToken);
      return status >= 400 && status < 500 ? ALLOW_ALL : DISALLOW_ALL;
    } catch {
      return DISALLOW_ALL;
    }
  }

  return {
    async isAllowed(url) {
      let rules = rulesByOrigin.get(url.origin);
      if (!rules) {
        rules = loadRules(url.origin);
        rulesByOrigin.set(url.origin, rules);
      }
      return (await rules).isAllowed(url.pathname + url.search);
    },
  };
}
