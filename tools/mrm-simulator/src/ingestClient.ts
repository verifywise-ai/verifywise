import { SimConfig, MetricPoint, IngestResultPoint } from "./types.js";
import { parseEnvelope } from "./httpEnvelope.js";

export class IngestClient {
  constructor(private cfg: SimConfig, private token: string) {}

  async pushBatch(externalKey: string, points: MetricPoint[]): Promise<IngestResultPoint[]> {
    const res = await fetch(
      `${this.cfg.baseUrl}/api/mrm/models/${encodeURIComponent(externalKey)}/metrics`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({ points }),
      },
    );
    const { data } = await parseEnvelope<{ accepted: number; results: IngestResultPoint[] }>(res);
    return data.results;
  }
}
