/**
 * Thin fetch-based wrapper around the JIRA Service Management Assets API.
 *
 * Supports both cloud (api.atlassian.com/jsm/assets/workspace/{id}/v1) and
 * datacenter (`{baseUrl}/rest/insight/1.0`) deployments. All authentication
 * is Basic email:api_token.
 */

export type JiraDeploymentType = "cloud" | "datacenter";

export interface JiraSchema {
  id: string;
  name: string;
  objectSchemaKey?: string;
  description?: string;
}

export interface JiraObjectType {
  id: string;
  name: string;
  description?: string;
  iconId?: string;
  objectCount?: number;
}

export interface JiraAttribute {
  id: string;
  name: string;
  type: number;
  typeValue?: string;
  defaultType?: unknown;
  description?: string;
}

export interface JiraObject {
  id: string;
  objectKey: string;
  label: string;
  objectType: { id: string; name: string };
  attributes: Array<{
    objectAttributeValues: Array<{ value: unknown; displayValue?: string }>;
    objectTypeAttribute: { id: string; name: string };
  }>;
  created: string;
  updated: string;
}

export class JiraAssetsClient {
  private baseUrl: string;
  private workspaceId: string;
  private authHeader: string;
  private deploymentType: JiraDeploymentType;

  constructor(
    baseUrl: string,
    workspaceId: string,
    email: string,
    apiToken: string,
    deploymentType: JiraDeploymentType = "cloud",
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.workspaceId = workspaceId;
    this.deploymentType = deploymentType;
    const credentials = Buffer.from(`${email}:${apiToken}`).toString("base64");
    this.authHeader = `Basic ${credentials}`;
  }

  private async request<T>(endpoint: string, method: string = "GET", body?: any): Promise<T> {
    const url =
      this.deploymentType === "cloud"
        ? `https://api.atlassian.com/jsm/assets/workspace/${this.workspaceId}/v1/${endpoint}`
        : `${this.baseUrl}/rest/insight/1.0/${endpoint}`;
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`JIRA API error ${response.status}: ${errorText || "no details"}`);
    }
    return (await response.json()) as T;
  }

  async getSchemas(): Promise<JiraSchema[]> {
    if (this.deploymentType === "datacenter") {
      const result = await this.request<JiraSchema[]>("objectschema/list");
      return Array.isArray(result) ? result : [];
    }
    const result = await this.request<{ values: JiraSchema[] }>("objectschema/list");
    return result.values || [];
  }

  async getObjectTypes(schemaId: string): Promise<JiraObjectType[]> {
    if (this.deploymentType === "datacenter") {
      const result = await this.request<JiraObjectType[]>(
        `objectschema/${schemaId}/objecttypes/flat`,
      );
      return Array.isArray(result) ? result : [];
    }
    const result = await this.request<any>(`objectschema/${schemaId}/objecttypes`);
    if (Array.isArray(result)) return result;
    return result?.values || [];
  }

  async getAttributes(objectTypeId: string): Promise<JiraAttribute[]> {
    const result = await this.request<JiraAttribute[]>(`objecttype/${objectTypeId}/attributes`);
    return Array.isArray(result) ? result : [];
  }

  async getObjects(objectTypeId: string, maxResults: number = 1000): Promise<JiraObject[]> {
    if (this.deploymentType === "datacenter") {
      const result = await this.request<{ objectEntries: JiraObject[] }>(
        `iql/objects?objectSchemaId=${this.workspaceId}&iql=objectTypeId=${objectTypeId}` +
          `&resultPerPage=${maxResults}&includeAttributes=true`,
      );
      return result.objectEntries || [];
    }
    // Cloud: fetch attribute defs first to build id→name mapping, inject it
    // onto each object so the caller can resolve JIRA's cryptic attr ids to
    // human names when flattening.
    const attrDefs = await this.getAttributes(objectTypeId);
    const attrIdToName: Record<string, string> = {};
    for (const attr of attrDefs) attrIdToName[attr.id] = attr.name;

    const result = await this.request<any>(`object/aql`, "POST", {
      qlQuery: `objectTypeId = ${objectTypeId}`,
      resultPerPage: maxResults,
      includeAttributes: true,
    });
    const objects: JiraObject[] = result?.values || result?.objectEntries || [];
    for (const obj of objects) {
      (obj as any)._attrIdToName = attrIdToName;
    }
    return objects;
  }

  async getObjectById(objectId: string): Promise<JiraObject> {
    return this.request<JiraObject>(`object/${objectId}`);
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.getSchemas();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
