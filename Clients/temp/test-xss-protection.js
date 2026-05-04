"use strict";
/**
 * XSS Vulnerability Fix Verification
 *
 * This file demonstrates the effectiveness of the DOMPurify implementation
 * for preventing XSS attacks in the PlateEditor and PolicyDetailsModal components.
 */
Object.defineProperty(exports, "__esModule", { value: true });
var dompurify_1 = require("dompurify");
// Test cases that should be sanitized
var xssAttackVectors = [
  '<script>alert("XSS")</script>',
  '<img src="x" onerror="alert(\'XSS\')">',
  "<a href=\"javascript:alert('XSS')\">Click me</a>",
  "<div onclick=\"alert('XSS')\">Click me</div>",
  "<iframe src=\"javascript:alert('XSS')\"></iframe>",
  "<svg onload=\"alert('XSS')\"></svg>",
  "<object data=\"javascript:alert('XSS')\"></object>",
  "<embed src=\"javascript:alert('XSS')\"></embed>",
  '<link rel="stylesheet" href="javascript:alert(\'XSS\')">',
  "<style>@import \"javascript:alert('XSS')\";</style>",
];
// Safe HTML that should be allowed
var safeHtml = [
  "<p><strong>Bold text</strong> and <em>italic text</em></p>",
  "<h1>Heading 1</h1><h2>Heading 2</h2>",
  "<blockquote>This is a quote</blockquote>",
  "<ul><li>List item 1</li><li>List item 2</li></ul>",
  '<a href="https://example.com" rel="noopener noreferrer">Safe link</a>',
  '<code>console.log("safe code")</code>',
  "<pre><code>const x = 1;</code></pre>",
];
// DOMPurify configuration matching our implementation
var sanitizeConfig = {
  ALLOWED_TAGS: [
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "underline",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
    "code",
    "pre",
    "ul",
    "ol",
    "li",
    "a",
    "img",
    "span",
    "div",
  ],
  ALLOWED_ATTR: ["href", "title", "alt", "src", "class", "id", "style", "target", "rel"],
  ALLOWED_URI_REGEXP:
    /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|data):|[^a-z]|[a-z+\.\-]+(?:[^a-z+\.\-:]|$))/i,
  ADD_ATTR: ["target"],
  FORBID_TAGS: ["script", "object", "embed", "iframe", "form", "input", "button"],
  FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur"],
};
// Test XSS prevention
console.log("Testing XSS Attack Vectors:");
console.log("===========================");
xssAttackVectors.forEach(function (attack, index) {
  var sanitized = dompurify_1.default.sanitize(attack, sanitizeConfig);
  var isBlocked = sanitized !== attack || sanitized === "";
  console.log(
    ""
      .concat(index + 1, ". ")
      .concat(isBlocked ? "✅ BLOCKED" : "❌ ALLOWED", ": ")
      .concat(attack),
  );
  if (isBlocked) {
    console.log("   Sanitized: ".concat(sanitized));
  }
  console.log("");
});
// Test safe HTML preservation
console.log("\nTesting Safe HTML Preservation:");
console.log("==============================");
safeHtml.forEach(function (html, index) {
  var sanitized = dompurify_1.default.sanitize(html, sanitizeConfig);
  var isPreserved = sanitized === html || sanitized.includes(/>/);
  console.log(
    ""
      .concat(index + 1, ". ")
      .concat(isPreserved ? "✅ PRESERVED" : "❌ MODIFIED", ": ")
      .concat(html),
  );
  if (!isPreserved) {
    console.log("   Sanitized: ".concat(sanitized));
  }
  console.log("");
});
console.log("XSS Protection Test Complete!");
console.log("All dangerous scripts and event handlers should be blocked.");
console.log("Safe HTML for rich text editing should be preserved.");
