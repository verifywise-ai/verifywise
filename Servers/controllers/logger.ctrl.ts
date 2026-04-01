import { Request, Response } from "express";
import { getEventsQuery, getLogsQuery } from "../utils/logger.util";
import { STATUS_CODE } from "../utils/statusCode.utils";

async function getEvents(req: Request, res: Response): Promise<any> {
  try {
    const organizationId = req.organizationId;
    if (!organizationId) {
      return res.status(401).json(STATUS_CODE[401]("Unauthorized"));
    }
    const events = await getEventsQuery(organizationId);
    return res.status(200).json(STATUS_CODE[200](events));
  } catch (error) {
    return res.status(500).json({ message: "Failed to get events" });
  }
}

async function getLogs(req: Request, res: Response): Promise<any> {
  try {
    const organizationId = req.organizationId;
    if (!organizationId) {
      return res.status(401).json(STATUS_CODE[401]("Unauthorized"));
    }
    const logs = await getLogsQuery(organizationId);
    return res.status(200).json(STATUS_CODE[200](logs));
  } catch (error) {
    return res.status(500).json({ message: "Failed to get logs" });
  }
}

export { getEvents, getLogs };
