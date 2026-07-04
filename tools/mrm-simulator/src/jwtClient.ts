import { SimConfig, ThresholdSpec } from "./types.js";
import { parseEnvelope } from "./httpEnvelope.js";

export class JwtClient {
  private token = "";
  constructor(private cfg: SimConfig) {}

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
    };
  }

  async login(): Promise<void> {
    const res = await fetch(`${this.cfg.baseUrl}/api/users/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: this.cfg.email, password: this.cfg.password }),
    });
    const { data } = await parseEnvelope<{ token: string }>(res);
    this.token = data.token;
  }

  async createModel(name: string, provider: string): Promise<number> {
    const res = await fetch(`${this.cfg.baseUrl}/api/modelInventory`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ model: name, provider, status: "Approved" }),
    });
    const { data } = await parseEnvelope<{ id: number }>(res);
    return data.id;
  }

  async setExternalKey(modelId: number, key: string): Promise<void> {
    const res = await fetch(`${this.cfg.baseUrl}/api/modelInventory/${modelId}`, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify({ external_key: key }),
    });
    await parseEnvelope(res);
  }

  async assignTier(modelId: number, tier: "1" | "2" | "3", drivers: string): Promise<void> {
    const res = await fetch(`${this.cfg.baseUrl}/api/mrm/models/${modelId}/tier`, {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify({ tier, materiality_drivers: drivers }),
    });
    await parseEnvelope(res);
  }

  async createMetricKey(key: string): Promise<void> {
    const res = await fetch(`${this.cfg.baseUrl}/api/mrm/metric-keys`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ key }),
    });
    // 409 (already exists) is fine — swallow it.
    if (res.status !== 409) await parseEnvelope(res);
  }

  async createThreshold(modelId: number, spec: ThresholdSpec): Promise<void> {
    const res = await fetch(`${this.cfg.baseUrl}/api/mrm/models/${modelId}/thresholds`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(spec),
    });
    await parseEnvelope(res);
  }

  async createIngestionToken(name: string): Promise<string> {
    const res = await fetch(`${this.cfg.baseUrl}/api/mrm/ingestion-tokens`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ name, model_inventory_id: null }),
    });
    const { data } = await parseEnvelope<{ token: string }>(res);
    return data.token;
  }

  async getAttestationSummary(): Promise<any> {
    const res = await fetch(`${this.cfg.baseUrl}/api/mrm/attestation/summary`, { headers: this.headers() });
    const { data } = await parseEnvelope<any>(res);
    return data;
  }

  async getRevalidationEvents(modelId: number): Promise<any[]> {
    const res = await fetch(`${this.cfg.baseUrl}/api/mrm/models/${modelId}/revalidation-events`, { headers: this.headers() });
    const { data } = await parseEnvelope<any[]>(res);
    return data;
  }

  async getValidations(modelId: number): Promise<any[]> {
    const res = await fetch(`${this.cfg.baseUrl}/api/mrm/validations?modelId=${modelId}`, { headers: this.headers() });
    const { data } = await parseEnvelope<any[]>(res);
    return data;
  }

  async getBreaches(modelId: number, metric?: string): Promise<any[]> {
    const q = metric ? `?metric=${encodeURIComponent(metric)}` : "";
    const res = await fetch(`${this.cfg.baseUrl}/api/mrm/models/${modelId}/monitoring/breaches${q}`, { headers: this.headers() });
    const { data } = await parseEnvelope<any[]>(res);
    return data;
  }
}
