/**
 * Shared automation dispatch: read every action of every active automation of
 * a trigger, then enqueue each one. Several active automations can share a
 * trigger, and one automation can hold several ordered actions; every one of
 * them runs.
 */

import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../../database/db";
import { enqueueAutomationAction } from "../../services/automations/automationProducer";
import logger from "../logger/fileLogger";
import { replaceTemplateVariables } from "./automation.utils";
import { runInSavepoint } from "../../config/changeHistory.config";

/** One action row of an active automation. */
export interface IAutomationActionRow {
  automation_id: number;
  action_key: string;
  params: Record<string, any> | null;
  order?: number | null;
  /** The automation predates every-action dispatch for its trigger's events. */
  legacy_first_action_only?: boolean;
}

/**
 * Every action row of every active automation of the organization that uses
 * `triggerKey`, by automation id, then action order.
 */
export async function getActiveAutomationActionsQuery(
  organizationId: number,
  triggerKey: string,
  transaction?: Transaction,
): Promise<IAutomationActionRow[]> {
  return sequelize.query<IAutomationActionRow>(
    `SELECT a.id AS automation_id, paa.key AS action_key, aa.params, aa."order",
            a.legacy_first_action_only
       FROM automation_triggers pat
       JOIN automations a ON a.trigger_id = pat.id AND a.organization_id = :organizationId
       JOIN automation_actions_data aa ON a.id = aa.automation_id AND aa.organization_id = :organizationId
       JOIN automation_actions paa ON aa.action_type_id = paa.id
      WHERE pat.key = :triggerKey AND a.is_active
      ORDER BY a.id ASC, aa."order" ASC`,
    { replacements: { organizationId, triggerKey }, type: QueryTypes.SELECT, transaction },
  );
}

/**
 * Entity events (risk, policy, vendor, model, use case, task, training and
 * incident added/updated/deleted) used to run only one action: the first row
 * of the old query, ordered by aa."order" alone. Automations that existed then
 * are flagged legacy_first_action_only (migrations
 * 20261114200100-legacy-automation-first-action for risk and policy,
 * 20261124112309-legacy-automation-first-action-entities for the rest) so
 * they keep that behaviour until someone saves them in the editor.
 *
 * Keeps every row of the other automations and, of the legacy rows of the
 * event together, only the single first by aa."order", then a.id. That tie
 * break approximates the old query, whose order among equal aa."order" values
 * was unspecified. The result keeps the input order (a.id, aa."order").
 */
export function keepLegacyFirstActionOnly(actions: IAutomationActionRow[]): IAutomationActionRow[] {
  const legacy = actions.filter((action) => action.legacy_first_action_only);
  if (legacy.length === 0) return actions;
  const first = legacy.reduce((best, action) => {
    // NULL sorts last under ORDER BY aa."order" ASC, as in the old query.
    const order = (row: IAutomationActionRow) =>
      row.order == null ? Number.POSITIVE_INFINITY : Number(row.order);
    if (order(action) !== order(best)) return order(action) < order(best) ? action : best;
    return action.automation_id < best.automation_id ? action : best;
  });
  return actions.filter((action) => !action.legacy_first_action_only || action === first);
}

/**
 * The actions an entity event runs: getActiveAutomationActionsQuery with the
 * legacy first-action rule applied. AI Detection events, which always ran
 * every action, call getActiveAutomationActionsQuery directly.
 */
export async function getEventAutomationActionsQuery(
  organizationId: number,
  triggerKey: string,
  transaction?: Transaction,
): Promise<IAutomationActionRow[]> {
  return keepLegacyFirstActionOnly(
    await getActiveAutomationActionsQuery(organizationId, triggerKey, transaction),
  );
}

/**
 * Enqueue every action with its subject and body filled from the event's
 * replacements, one after another in the order given (the query's
 * a.id, aa."order"). Each action is enqueued on its own: a failed enqueue is
 * logged and never stops the others or throws. Inside a transaction the
 * enqueues wait for the commit, so a rolled-back write sends nothing.
 * `logContext` (e.g. "scan 12") is added to the failure log.
 */
export async function enqueueAutomationActions(
  actions: IAutomationActionRow[],
  replacements: Record<string, any>,
  organizationId: number,
  transaction?: Transaction,
  logContext?: string,
): Promise<void> {
  if (actions.length === 0) return;
  // One at a time, in query order, so actions keep their aa."order".
  const enqueueAll = async () => {
    for (const action of actions) {
      try {
        const params = action.params || {};
        await enqueueAutomationAction(action.action_key, {
          ...params,
          subject: replaceTemplateVariables(params.subject || "", replacements),
          body: replaceTemplateVariables(params.body || "", replacements),
          automation_id: action.automation_id,
          organizationId,
        });
      } catch (error) {
        logger.error(
          `[automation] ${action.action_key} enqueue failed for automation ${action.automation_id}${
            logContext ? ` (${logContext})` : ""
          }: ${String(error)}`,
        );
      }
    }
  };
  if (!transaction) {
    await enqueueAll();
    return;
  }
  transaction.afterCommit(() => {
    void enqueueAll();
  });
}

/**
 * Runs an entity event's automations: getEventAutomationActionsQuery, then
 * enqueueAutomationActions. `buildReplacements` runs only when there is an
 * action to enqueue, so an event with no automation reads nothing more (and a
 * builder never sees a row that is not there).
 *
 * With a transaction, the actions are read inside it and enqueued once it
 * commits, so a rolled-back write sends nothing and a slow queue never holds
 * the write's locks. Without one (a caller that runs after its own commit),
 * they are enqueued at once. A failed enqueue is logged and never fails the
 * write (enqueueAutomationActions).
 *
 * `contained` is for a caller that must not fail because of its automations:
 * the reads run in a savepoint (runInSavepoint), and a failure there is rolled
 * back to it and logged, enqueueing nothing, instead of throwing (a failed
 * statement would otherwise abort the caller's whole transaction). `logContext` (e.g.
 * "task_added, task 12") names the event in a failure log; it defaults to the
 * trigger key.
 */
export async function runEventAutomations(
  organizationId: number,
  triggerKey: string,
  buildReplacements: () => Record<string, any> | Promise<Record<string, any>>,
  options: { transaction?: Transaction; contained?: boolean; logContext?: string } = {},
): Promise<void> {
  const { transaction, contained = false, logContext = triggerKey } = options;
  const read = async () => {
    const actions = await getEventAutomationActionsQuery(organizationId, triggerKey, transaction);
    if (actions.length === 0) return null;
    return { actions, replacements: await buildReplacements() };
  };

  let event: Awaited<ReturnType<typeof read>>;
  if (contained) {
    try {
      event = await runInSavepoint(read, transaction, "automation_lookup");
    } catch (error) {
      logger.error(
        `[automation] ${triggerKey} lookup failed, nothing enqueued (${logContext}): ${String(error)}`,
      );
      return;
    }
  } else {
    event = await read();
  }
  if (!event) return;
  await enqueueAutomationActions(
    event.actions,
    event.replacements,
    organizationId,
    transaction,
    logContext,
  );
}
