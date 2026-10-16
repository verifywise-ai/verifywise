// Side-effect entry for the backend's environment: `import "./database/config/env"`
// as the first import of an entry point, in place of `import "dotenv/config"`.
// Imports are evaluated in order, so this runs before any module that reads
// process.env at import time. See loadEnv.js for the precedence rules.
require("./loadEnv").loadEnv();
