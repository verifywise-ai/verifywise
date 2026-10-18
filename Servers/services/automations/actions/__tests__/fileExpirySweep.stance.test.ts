/**
 * The file expiry sweep never notifies about a bias audit stance PDF: over a
 * table holding only a stance PDF it does exactly what it does over an empty
 * one.
 */
import {
  fakeFilesQuery,
  stanceRow,
  visibleRow,
  type FakeFileRow,
} from "../../../../utils/files/__tests__/helpers/fakeFilesTable";

let table: FakeFileRow[] = [];
jest.mock("../../../../database/db", () => ({
  sequelize: { query: (sql: string, options: any) => fakeFilesQuery(table)(sql, options) },
}));
jest.mock("../../../../utils/organization.utils", () => ({ getAllOrganizationsQuery: jest.fn() }));
jest.mock("../../../inAppNotification.service", () => ({ notifyFileExpiring: jest.fn() }));
jest.mock("../../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn() },
}));

import { runFileExpirySweep } from "../fileExpirySweep";
import { notifyFileExpiring } from "../../../inAppNotification.service";

const mockNotify = notifyFileExpiring as jest.Mock;
const expiring = { uploaded_by: 3, expiry_date: "2026-10-20", days_remaining: 2 };

async function sweep(rows: FakeFileRow[]) {
  jest.clearAllMocks();
  table = rows;
  const result = await runFileExpirySweep(1);
  return { result, notified: mockNotify.mock.calls };
}

describe("file expiry sweep and bias audit stance PDFs", () => {
  it("still notifies about a visible file (sanity)", async () => {
    const { notified } = await sweep([visibleRow(expiring)]);
    expect(notified).toHaveLength(1);
  });

  it("treats a stance PDF exactly as a missing file", async () => {
    const stance = await sweep([stanceRow(expiring)]);
    const missing = await sweep([]);
    expect(stance).toEqual(missing);
    expect(stance.notified).toHaveLength(0);
  });
});
