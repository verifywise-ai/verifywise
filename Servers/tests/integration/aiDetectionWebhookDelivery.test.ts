jest.setTimeout(60000);

import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";
import { cleanupDatabase, seedTwoOrgsAndUsers } from "./helpers";
import {
  createRepositoryQuery,
  getRepositoriesForWebhookQuery,
  recordWebhookDeliveryQuery,
} from "../../utils/aiDetectionRepository.utils";
import { githubWebhookController } from "../../controllers/webhook.ctrl";
import crypto from "crypto";

const deliveryColumns = (id: number) =>
  sequelize
    .query<{
      webhook_secret: string | null;
      last_webhook_at: Date | null;
      last_webhook_status: string | null;
    }>(
      `SELECT webhook_secret, last_webhook_at, last_webhook_status
         FROM ai_detection_repositories WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT },
    )
    .then((rows) => rows[0]);

/**
 * The webhook endpoint is public, so the delivery it records must land only on
 * the repository row of the organization that owns it.
 */
describe("AI Detection webhook delivery tracking", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("stores the secret given at create and records deliveries per organization", async () => {
    const { orgA, orgB, userA, userB } = await seedTwoOrgsAndUsers();
    const base = {
      repository_url: "https://github.com/acme/widgets",
      repository_owner: "acme",
      repository_name: "widgets",
      ci_enabled: true,
    };
    const repoA = await createRepositoryQuery(
      { ...base, webhook_secret: "secret-a", created_by: userA },
      orgA,
    );
    const repoB = await createRepositoryQuery(
      { ...base, webhook_secret: "secret-b", created_by: userB },
      orgB,
    );

    expect((await deliveryColumns(repoA.id!)).webhook_secret).toBe("secret-a");
    expect(repoA.last_webhook_at).toBeNull();

    // Wrong organization for the id: nothing changes.
    await recordWebhookDeliveryQuery(repoA.id!, orgB, "ok");
    expect((await deliveryColumns(repoA.id!)).last_webhook_status).toBeNull();

    await recordWebhookDeliveryQuery(repoA.id!, orgA, "error");
    const a = await deliveryColumns(repoA.id!);
    expect(a.last_webhook_status).toBe("error");
    expect(a.last_webhook_at).not.toBeNull();

    const b = await deliveryColumns(repoB.id!);
    expect(b.last_webhook_status).toBeNull();
    expect(b.last_webhook_at).toBeNull();
  });

  it("does not let an unsigned or badly signed request overwrite the verified delivery", async () => {
    const { orgA, userA } = await seedTwoOrgsAndUsers();
    const repo = await createRepositoryQuery(
      {
        repository_url: "https://github.com/acme/gadgets",
        repository_owner: "acme",
        repository_name: "gadgets",
        ci_enabled: true,
        webhook_secret: "real-secret",
        created_by: userA,
      },
      orgA,
    );
    const body = Buffer.from(
      JSON.stringify({ zen: "hi", repository: { owner: { login: "acme" }, name: "gadgets" } }),
    );
    const send = async (signature?: string) => {
      const res: any = {};
      res.status = jest.fn().mockReturnValue(res);
      res.json = jest.fn().mockReturnValue(res);
      const headers: Record<string, string> = { "x-github-event": "ping" };
      if (signature) headers["x-hub-signature-256"] = signature;
      await githubWebhookController({ headers, body, t: (k: string) => k } as any, res);
      return res.status.mock.calls[0][0];
    };
    const sign = (secret: string) =>
      "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");

    expect(await send(sign("real-secret"))).toBe(200);
    const verified = await deliveryColumns(repo.id!);
    expect(verified.last_webhook_status).toBe("ok");

    expect(await send(sign("wrong-secret"))).toBe(401);
    expect(await send(undefined)).toBe(401);

    const after = await deliveryColumns(repo.id!);
    expect(after.last_webhook_status).toBe("ok");
    expect(after.last_webhook_at).toEqual(verified.last_webhook_at);
  });

  it("finds the repository in every organization, ignoring case, and acts only on the one whose secret verifies", async () => {
    const { orgA, orgB, userA, userB } = await seedTwoOrgsAndUsers();
    const repoA = await createRepositoryQuery(
      {
        repository_url: "https://github.com/Acme/Shared",
        repository_owner: "Acme",
        repository_name: "Shared",
        ci_enabled: true,
        webhook_secret: "secret-a",
        created_by: userA,
      },
      orgA,
    );
    const repoB = await createRepositoryQuery(
      {
        repository_url: "https://github.com/acme/shared",
        repository_owner: "acme",
        repository_name: "shared",
        ci_enabled: true,
        webhook_secret: "secret-b",
        created_by: userB,
      },
      orgB,
    );

    const candidates = await getRepositoriesForWebhookQuery("ACME", "shared");
    expect(candidates.map((r) => r.id).sort()).toEqual([repoA.id, repoB.id].sort());

    // GitHub sends the canonical case; org B's secret signs the delivery.
    const body = Buffer.from(
      JSON.stringify({ zen: "hi", repository: { owner: { login: "ACME" }, name: "Shared" } }),
    );
    const signature =
      "sha256=" + crypto.createHmac("sha256", "secret-b").update(body).digest("hex");
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    await githubWebhookController(
      {
        headers: { "x-github-event": "ping", "x-hub-signature-256": signature },
        body,
        t: (k: string) => k,
      } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect((await deliveryColumns(repoB.id!)).last_webhook_status).toBe("ok");
    expect((await deliveryColumns(repoA.id!)).last_webhook_status).toBeNull();
  });
});
