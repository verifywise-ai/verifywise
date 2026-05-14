import { BaseConnector } from "./baseConnector";
import { AwsConnector } from "./awsConnector";
import { GithubConnector } from "./githubConnector";
import { GenericApiConnector } from "./genericApiConnector";
import { MockConnector } from "./mockConnector";

export { BaseConnector, AwsConnector, GithubConnector, GenericApiConnector, MockConnector };
export type { TestExecutionResult, ConnectorConfig } from "./baseConnector";

const connectorRegistry: Record<string, new () => BaseConnector> = {
  aws: AwsConnector,
  github: GithubConnector,
  generic_api: GenericApiConnector,
  mock: MockConnector,
};

export function getConnectorTypes(): { type: string; displayName: string }[] {
  return Object.entries(connectorRegistry).map(([type, ConnectorClass]) => {
    const instance = new ConnectorClass();
    return { type, displayName: instance.displayName };
  });
}

export function createConnector(type: string): BaseConnector {
  const ConnectorClass = connectorRegistry[type];
  if (!ConnectorClass) {
    throw new Error(`Unknown connector type: ${type}. Available: ${Object.keys(connectorRegistry).join(", ")}`);
  }
  return new ConnectorClass();
}
