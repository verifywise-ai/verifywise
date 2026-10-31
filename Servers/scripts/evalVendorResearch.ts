/**
 * Evaluates the vendor research agent: replays the cases of services/vendorResearch/eval, or runs
 * one vendor live. See services/vendorResearch/eval/cli.ts for the options.
 *
 *   npm run eval:vendor-research
 *   npm run eval:vendor-research -- --live --org 1 --vendor "Okta" --website okta.com
 */
import { main } from "../services/vendorResearch/eval/cli";

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
