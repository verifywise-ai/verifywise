/**
 * Small pool of realistic request/response pairs per use case. Spend-log rows
 * reuse these (only rows from the last 14 days carry bodies, matching the story
 * that request/response logging was switched on two weeks ago).
 */

export interface ContentPair {
  user: string;
  response: string;
}

export const SUPPORT_CONTENT: ContentPair[] = [
  {
    user: "Hi, my order #48213 says delivered but I never got it. What can I do?",
    response:
      "I'm sorry your parcel hasn't turned up. Carriers sometimes mark an order delivered up to 48 hours early, so please check with neighbours and your building's mail room first. If it still hasn't arrived by tomorrow evening, reply here and I'll open a missing-parcel claim so we can send a replacement or refund you.",
  },
  {
    user: "Can I change the delivery address on an order I placed an hour ago?",
    response:
      "Yes, as long as the order hasn't been packed yet. Go to Orders, open the order and choose Edit delivery address. If that button is greyed out, the order is already with the warehouse and I'll hand you over to an agent who can ask the carrier to redirect it.",
  },
  {
    user: "The jacket I bought is too small. How do I return it for a bigger size?",
    response:
      "You can exchange it free of charge within 30 days. Open the order, select Return or exchange, pick the jacket and choose the new size. We'll email a prepaid label, and the new size ships as soon as the carrier scans your return.",
  },
  {
    user: "I was charged twice for the same order. Please fix this.",
    response:
      "I can see why that's worrying. Often the second charge is a temporary card authorisation that drops off within 3 to 5 business days. Because this involves a payment dispute, I'm handing you over to a billing agent who can confirm both transactions and issue a refund if one was captured.",
  },
  {
    user: "How long does standard shipping take to Germany?",
    response:
      "Standard shipping to Germany usually takes 3 to 5 business days after dispatch. Orders placed before 2 pm CET on a weekday leave our warehouse the same day, and you'll get a tracking link by email once it ships.",
  },
  {
    user: "I forgot my password and the reset email never arrives.",
    response:
      "Reset emails can take a few minutes and sometimes land in spam or promotions folders, so please check there first. If nothing arrives within 15 minutes, make sure you're using the email address on the account. For security I can't change account details in chat, so I'll connect you with an agent if it still fails.",
  },
  {
    user: "Do you price match if I find the same item cheaper somewhere else?",
    response:
      "We don't price match other retailers, but if the price of an item you bought from us drops within 14 days, contact us with your order number and we'll refund the difference as store credit.",
  },
  {
    user: "Is the waterproof hiking boot (model TR-220) available in size 46?",
    response:
      "The TR-220 is currently out of stock in size 46 online. You can tap Notify me on the product page and we'll email you as soon as it's back, which is usually within two weeks for this model.",
  },
  {
    user: "Can I add gift wrapping after I've already paid?",
    response:
      "Gift wrapping can only be added before checkout, so I can't add it to an order that's already paid. If the order hasn't shipped, you can cancel it and place it again with gift wrapping selected.",
  },
  {
    user: "Your courier left my package in the rain and the box is ruined. The shoes inside are fine.",
    response:
      "Sorry about the soggy box, that's not the experience we want. Since the shoes are undamaged you don't need to do anything, but if you'd like a replacement shoebox for gifting, reply with your order number and we'll send one out free.",
  },
  {
    user: "Why was my discount code SUMMER15 rejected?",
    response:
      "SUMMER15 ended on 31 August, which is why checkout rejected it. Codes can't be applied retroactively, but you're welcome to sign up for the newsletter for 10% off your next order.",
  },
  {
    user: "I want to close my account and delete my data.",
    response:
      "You can request account deletion under Account settings, then Privacy, then Delete my account. We'll confirm by email and complete the deletion within 30 days, keeping only the order records we're legally required to retain.",
  },
];

/** FAQ-style questions; repeated verbatim, so the response cache gets hits. */
export const FAQ_CONTENT: ContentPair[] = [
  {
    user: "How do I reset my password?",
    response:
      "Click Forgot password on the sign-in page and enter your account email. We'll send a reset link that's valid for 30 minutes.",
  },
  {
    user: "What is your return policy?",
    response:
      "You can return unworn items within 30 days of delivery for a full refund. Returns are free using the prepaid label from your order page.",
  },
  {
    user: "How can I track my order?",
    response:
      "Open Orders in your account and select the order to see the live tracking link. We also email the link as soon as your parcel ships.",
  },
  {
    user: "Do you ship internationally?",
    response:
      "Yes, we ship to 38 countries across Europe and North America. Shipping costs and delivery times are shown at checkout once you enter your address.",
  },
  {
    user: "Which payment methods do you accept?",
    response:
      "We accept Visa, Mastercard, American Express, PayPal, Apple Pay and Klarna. All payments are processed securely and we never store full card numbers.",
  },
  {
    user: "How long do refunds take?",
    response:
      "Refunds are issued within 2 business days of your return being scanned at our warehouse. Your bank may take a further 3 to 5 days to show it.",
  },
  {
    user: "Can I cancel my order?",
    response:
      "You can cancel from the order page until the order is packed, usually within an hour of purchase. After that, you can return it once it arrives.",
  },
  {
    user: "Do you have a size guide?",
    response:
      "Yes, every product page has a Size guide link under the size selector with measurements in centimetres and inches.",
  },
];

export const CODING_CONTENT: ContentPair[] = [
  {
    user: "Review this diff for the checkout service. Anything risky in the retry logic?\n\n```ts\n-    await charge(order)\n+    for (let i = 0; i < 3; i++) {\n+      try { return await charge(order) } catch (e) { await sleep(200 * i) }\n+    }\n```",
    response:
      "Two concerns. First, retrying `charge` without an idempotency key can double-charge a customer if the first attempt succeeded but the response timed out; pass `order.id` as the idempotency key to the payment provider. Second, the loop swallows the final error and returns `undefined`, so callers will treat a failed charge as success. Re-throw after the last attempt and only retry on network or 5xx errors, not on card declines.",
  },
  {
    user: "Write a Vitest unit test for `formatCurrency(amount, currency)` covering EUR, USD and negative values.",
    response:
      "```ts\nimport { describe, it, expect } from 'vitest'\nimport { formatCurrency } from './formatCurrency'\n\ndescribe('formatCurrency', () => {\n  it('formats EUR with the euro sign', () => {\n    expect(formatCurrency(1234.5, 'EUR')).toBe('€1,234.50')\n  })\n  it('formats USD', () => {\n    expect(formatCurrency(99, 'USD')).toBe('$99.00')\n  })\n  it('formats negative amounts', () => {\n    expect(formatCurrency(-10, 'USD')).toBe('-$10.00')\n  })\n})\n```",
  },
  {
    user: "Why does this Postgres query do a sequential scan on orders even though created_at is indexed?\nSELECT * FROM orders WHERE date(created_at) = '2026-09-01';",
    response:
      "Wrapping the column in `date()` stops the planner from using the btree index on `created_at`. Rewrite it as a range: `WHERE created_at >= '2026-09-01' AND created_at < '2026-09-02'`. If you really need the function form, create an expression index on `date(created_at)`, but the range query is usually the better fix.",
  },
  {
    user: "Refactor this React component to use React Query instead of useEffect + useState for fetching the product list.",
    response:
      "Replace the effect and the two state hooks with `const { data: products = [], isLoading, error } = useQuery({ queryKey: ['products', categoryId], queryFn: () => api.getProducts(categoryId) })`. React Query now handles caching, refetch on focus and request de-duplication, and you can delete the manual `isMounted` guard. Render the spinner from `isLoading` and the error banner from `error`.",
  },
  {
    user: "Explain what this regex does: ^(?=.*[A-Z])(?=.*\\d)[A-Za-z\\d@$!%*?&]{12,}$",
    response:
      "It validates a password: the two lookaheads require at least one uppercase letter and at least one digit anywhere in the string, and the main body allows only letters, digits and the symbols @$!%*?& with a minimum length of 12. It does not require a lowercase letter or a symbol.",
  },
  {
    user: "The CI job fails with 'ENOSPC: System limit for number of file watchers reached'. How do I fix it?",
    response:
      "Jest or Vite is starting file watchers in CI. Run tests with `--run` (Vitest) or `--watchAll=false` (Jest) so no watchers are created. If a tool must watch, raise the limit on the runner with `sysctl fs.inotify.max_user_watches=524288`.",
  },
  {
    user: "Generate a SQL migration adding a nullable `returned_at timestamptz` column to order_items with an index.",
    response:
      "```sql\nALTER TABLE order_items ADD COLUMN returned_at timestamptz NULL;\nCREATE INDEX CONCURRENTLY idx_order_items_returned_at ON order_items (returned_at) WHERE returned_at IS NOT NULL;\n```\nUse `CONCURRENTLY` so the index build does not lock writes, which means the migration must run outside a transaction block.",
  },
  {
    user: "Summarize the changes in this PR description for the release notes: 'Moves inventory sync from cron to event-driven consumer, adds DLQ, removes legacy SOAP client.'",
    response:
      "Inventory now syncs in near real time: updates are processed as events instead of an hourly cron job, failed messages go to a dead-letter queue for replay, and the legacy SOAP integration has been removed.",
  },
  {
    user: "Is it safe to use `JSON.parse` on the webhook body before verifying the signature?",
    response:
      "Verify the signature against the raw body bytes first, then parse. Parsing and re-serialising can change whitespace or key order, which breaks HMAC verification, and parsing untrusted input before authenticating it gives attackers a larger surface. Use the raw-body middleware for that route only.",
  },
  {
    user: "Add JSDoc to this function: export function chunk<T>(items: T[], size: number): T[][]",
    response:
      "```ts\n/**\n * Split an array into consecutive chunks of at most `size` items.\n * @param items - The array to split.\n * @param size - Maximum chunk length; must be a positive integer.\n * @returns A new array of chunks; the last chunk may be shorter.\n */\n```",
  },
];

export const RECOMMENDATION_CONTENT: ContentPair[] = [
  {
    user: "Product: Trail running shoes TR-9. Signals: viewed 3 running jackets this week; bought running socks in August; high rating for brand Kestrel.",
    response:
      "Recommended because you've been browsing running gear and rated Kestrel highly, and these trail shoes pair well with the socks you bought in August.",
  },
  {
    user: "Product: Espresso grinder G2. Signals: bought espresso machine 2 weeks ago; viewed coffee beans category.",
    response:
      "A good match for the espresso machine you bought recently, since fresh grinding makes the biggest difference to taste.",
  },
  {
    user: "Product: Kids' rain boots. Signals: bought kids' raincoat size 110; searched 'puddle boots'.",
    response:
      "Picked to go with the kids' raincoat you bought and your recent search for puddle boots.",
  },
  {
    user: "Product: Yoga mat 6mm. Signals: added yoga blocks to wishlist; viewed pilates rings.",
    response:
      "Suggested because you saved yoga blocks to your wishlist and have been looking at home workout gear.",
  },
  {
    user: "Product: Laptop sleeve 14in. Signals: bought 14-inch laptop last month; viewed backpacks.",
    response:
      "Sized to fit the 14-inch laptop you bought last month, and it slides into most of the backpacks you viewed.",
  },
  {
    user: "Product: Cast-iron skillet 28cm. Signals: bought chef's knife; top category this quarter: kitchen.",
    response:
      "Recommended because kitchen gear is your favourite category lately and it complements the chef's knife you bought.",
  },
];

export const FORECAST_CONTENT: ContentPair[] = [
  {
    user: "Summarize next week's forecast for region NORTH, category Outdoor. Forecast vs last week: +18% units. Drivers: temperature drop, promo on rain jackets. Stock cover: rain jackets 4.2 days, boots 11 days.",
    response:
      "Outdoor demand in the North is forecast to rise 18% next week, driven mainly by the colder weather and the rain-jacket promotion. Rain jackets are the main risk with only 4.2 days of cover; reorder now to avoid a stock-out mid-week. Boots are comfortably covered at 11 days.",
  },
  {
    user: "Summarize the weekly forecast for region SOUTH, category Kitchen. Forecast vs last week: -6% units. Drivers: end of back-to-school season. Stock cover: cookware 21 days, small appliances 9 days.",
    response:
      "Kitchen demand in the South is expected to dip 6% as the back-to-school season ends. Cookware is overstocked at 21 days of cover, so consider pausing the next replenishment. Small appliances look balanced at 9 days.",
  },
  {
    user: "Summarize the weekly forecast for region WEST, category Electronics. Forecast vs last week: +31% units. Drivers: product launch (headphones H7), competitor stock-out. Stock cover: H7 2.8 days.",
    response:
      "Electronics demand in the West is forecast up 31%, led by the H7 headphone launch and a competitor stock-out. H7 has only 2.8 days of cover, which is a high stock-out risk; expedite the inbound shipment and consider limiting per-order quantities until it lands.",
  },
  {
    user: "Summarize the weekly forecast for region EAST, category Apparel. Forecast vs last week: +3% units. Drivers: stable. Stock cover: knitwear 14 days, t-shirts 17 days.",
    response:
      "Apparel demand in the East is stable at +3%. Stock cover is healthy across knitwear and t-shirts, so no reorder action is needed this week.",
  },
];

export const RECRUITMENT_CONTENT: ContentPair[] = [
  {
    user: "Job description: Senior data engineer (Spark, Airflow, AWS, 5+ years). Candidate CV: 7 years data engineering; built Airflow pipelines on AWS; PySpark; led migration from Hadoop.",
    response:
      "Matched requirements: 7 years of data engineering (5+ required), Airflow orchestration on AWS, PySpark, and experience leading a platform migration. Missing or unclear: no explicit mention of streaming workloads, which the description lists as a plus.",
  },
  {
    user: "Job description: Customer support team lead (3+ years support, people management, Zendesk). Candidate CV: 4 years support agent; mentored new hires; Freshdesk and Zendesk.",
    response:
      "Matched requirements: 4 years in customer support and hands-on Zendesk experience. Partially matched: mentoring new hires, but no formal people-management role is listed. Missing: evidence of owning team KPIs or scheduling.",
  },
  {
    user: "Job description: Frontend engineer (React, TypeScript, accessibility). Candidate CV: 3 years React and TypeScript; built design-system components; WCAG audits.",
    response:
      "Matched requirements: React and TypeScript experience, design-system component work, and accessibility audits against WCAG. No listed requirement appears to be missing.",
  },
  {
    user: "Job description: Warehouse operations analyst (SQL, Excel, forecasting). Candidate CV: 2 years logistics coordinator; advanced Excel; basic SQL.",
    response:
      "Matched requirements: logistics background and advanced Excel. Partially matched: basic SQL. Missing: no demand-forecasting experience is mentioned.",
  },
];

export const SANDBOX_CONTENT: ContentPair[] = [
  {
    user: "Compare three ways to cluster customers by purchase behaviour and say which scales best to 10M rows.",
    response:
      "Mini-batch k-means scales best to 10M rows because it processes samples incrementally. Hierarchical clustering is quadratic in memory and impractical at that size, and DBSCAN needs careful tuning of eps and struggles with varying density.",
  },
  {
    user: "Draft a short internal note explaining what a holdout set is.",
    response:
      "A holdout set is a slice of data we keep aside and never use for training or tuning. We evaluate the final model on it once, so the score reflects how the model will perform on data it has never seen.",
  },
];

/** Embedding inputs (no response text is logged for embeddings). */
export const EMBEDDING_INPUTS: string[] = [
  "Kestrel TR-9 trail running shoe, breathable mesh upper, 6mm drop, Vibram outsole",
  "Stainless steel espresso grinder with 40 grind settings and anti-static cup",
  "Kids' waterproof rain boots with reflective strip, natural rubber",
  "Organic cotton crew-neck t-shirt, regular fit, 180 gsm",
  "Cast-iron skillet 28cm, pre-seasoned, oven safe to 260°C",
  "Noise-cancelling over-ear headphones H7, 40h battery, USB-C",
];

/** Masked PII text as the gateway rewrites it (`<ENTITY_TYPE>` replacement). */
export interface MaskedMessage {
  /** User message after masking, as stored in request_messages. */
  user: string;
  /** Raw matched substrings, as stored in guardrail_logs.matched_text. */
  entities: { type: string; text: string }[];
  response: string;
}

export const MASKED_SUPPORT_MESSAGES: MaskedMessage[] = [
  {
    user: "Please send the invoice to <EMAIL_ADDRESS> instead of my old address.",
    entities: [{ type: "EMAIL_ADDRESS", text: "jane.doe@example.com" }],
    response:
      "Done. Future invoices for this order will go to the new address, and I've re-sent the latest invoice there too.",
  },
  {
    user: "You can call me back on <PHONE_NUMBER> about the missing parcel.",
    entities: [{ type: "PHONE_NUMBER", text: "+1 415 555 0132" }],
    response:
      "Thanks. I've opened a missing-parcel claim and noted your callback number. The carrier investigation usually takes 2 business days, and an agent will call you with the outcome.",
  },
  {
    user: "My account email is <EMAIL_ADDRESS> and my phone is <PHONE_NUMBER>, the order never arrived.",
    entities: [
      { type: "EMAIL_ADDRESS", text: "m.okafor@example.org" },
      { type: "PHONE_NUMBER", text: "(212) 555-0187" },
    ],
    response:
      "I'm sorry the order hasn't arrived. I've confirmed your account and started a carrier trace. If it isn't found within 48 hours we'll ship a replacement at no cost.",
  },
  {
    user: "Can you update the contact email on order #51877 to <EMAIL_ADDRESS>?",
    entities: [{ type: "EMAIL_ADDRESS", text: "lucas.meyer@example.net" }],
    response:
      "The contact email on order #51877 has been updated. Shipping and delivery notifications will go to the new address from now on.",
  },
];

export const MASKED_RECRUITMENT_MESSAGES: MaskedMessage[] = [
  {
    user: "Job description: Senior data engineer. Candidate CV: contact <EMAIL_ADDRESS>, <PHONE_NUMBER>. 6 years data engineering, Airflow, AWS.",
    entities: [
      { type: "EMAIL_ADDRESS", text: "priya.n@example.com" },
      { type: "PHONE_NUMBER", text: "+44 20 7946 0958" },
    ],
    response:
      "Matched requirements: 6 years of data engineering (5+ required), Airflow orchestration and AWS. Missing or unclear: no Spark experience is listed.",
  },
  {
    user: "Job description: Frontend engineer. Candidate CV: email <EMAIL_ADDRESS>. 4 years React, TypeScript, accessibility audits.",
    entities: [{ type: "EMAIL_ADDRESS", text: "t.alvarez@example.org" }],
    response:
      "Matched requirements: React, TypeScript and accessibility audits. No listed requirement appears to be missing.",
  },
];
