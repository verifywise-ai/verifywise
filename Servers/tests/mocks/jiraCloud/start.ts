// Run: cd Servers && npx ts-node --transpile-only tests/mocks/jiraCloud/start.ts --port 4010
import { startJiraCloudMock } from "./server";

const portArg = process.argv.indexOf("--port");
const port = portArg > 0 ? Number(process.argv[portArg + 1]) : 4010;
startJiraCloudMock({ port }).then((mock) => {
  process.stdout.write(
    `Simulated Jira Cloud on ${mock.url}\n` +
      `Credentials: ${mock.state.email} / ${mock.state.token}\n` +
      `Create an issue: curl -X POST ${mock.url}/__mock/issues -H 'Content-Type: application/json' -d '{"summary":"Model leaked data"}'\n`,
  );
});
