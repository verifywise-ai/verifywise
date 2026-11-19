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

/** One action row of an active automation. */
export interface IAutomationActionRow {
  automation_id: number;
  action_key: string;
  params: Record<string, any> | null;
  order?: number | null;
  /** The automation predates every-action dispatch for risk and policy events. */
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
 * Risk and policy events used to run only one action: the first row of the
 * old query, ordered by aa."order" alone. Automations that existed then are
 * flagged legacy_first_action_only (migration
 * 20261114200100-legacy-automation-first-action) so they keep that behaviour
 * until someone saves them in the editor.
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
    const order = (row: IAutomationActionRow) => Number(row.order ?? 0);
    if (order(action) !== order(best)) return order(action) < order(best) ? action : best;
    return action.automation_id < best.automation_id ? action : best;
  });
  return actions.filter((action) => !action.legacy_first_action_only || action === first);
}

/**
 * The actions a risk or policy event runs: getActiveAutomationActionsQuery
 * with the legacy first-action rule applied. Other events (AI Detection) call
 * getActiveAutomationActionsQuery directly and run every action.
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
