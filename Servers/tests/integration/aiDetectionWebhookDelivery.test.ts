jest.setTimeout(60000);

import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";
import { cleanupDatabase, seedTwoOrgsAndUsers } from "./helpers";
import {
  createRepositoryQuery,
  recordWebhookDeliveryQuery,
} from "../../utils/aiDetectionRepository.utils";

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

    await recordWebhookDeliveryQuery(repoA.id!, orgA, "invalid_signature");
    const a = await deliveryColumns(repoA.id!);
    expect(a.last_webhook_status).toBe("invalid_signature");
    expect(a.last_webhook_at).not.toBeNull();

    const b = await deliveryColumns(repoB.id!);
    expect(b.last_webhook_status).toBeNull();
    expect(b.last_webhook_at).toBeNull();
  });
});
