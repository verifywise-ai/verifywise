import { Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { VendorModel } from "../domain.layer/models/vendor/vendor.model";

export async function checkOrganizationalProjectExists(organizationId: number, transaction: Transaction): Promise<number> {
  const result = await sequelize.query(
    `SELECT COUNT(*) as count FROM projects WHERE organization_id = :organizationId AND is_organizational;`,
    { replacements: { organizationId }, transaction }
  ) as [{ count: string }[], number];
  return parseInt(result[0][0].count) || 0;
}

export async function getData(tableName: string, organizationId: number, transaction: Transaction): Promise<any[]> {
  const result = await sequelize.query(
    `SELECT * FROM ${tableName} WHERE organization_id = :organizationId AND is_demo;`,
    { replacements: { organizationId }, transaction }
  );
  return result[0];
}

export async function insertData(
  insertQuery: string,
  transaction: Transaction
): Promise<any> {
  const result = await sequelize.query(insertQuery, { transaction });
  return result;
}

export async function deleteDemoVendorsData(organizationId: number, transaction: Transaction): Promise<void> {
  const result = await sequelize.query(
    `SELECT id FROM vendors WHERE organization_id = :organizationId AND is_demo;`,
    {
      replacements: { organizationId },
      mapToModel: true,
      model: VendorModel,
      transaction,
    }
  );

  // Delete vendors_projects relationships for demo vendors
  await Promise.all(
    result.map(async (r) => {
      await sequelize.query(
        `DELETE FROM vendors_projects WHERE organization_id = :organizationId AND vendor_id = :vendor_id`,
        {
          replacements: { organizationId, vendor_id: r.id },
          transaction,
        }
      );
    })
  );

  // Delete demo vendor risks directly by is_demo flag (more robust than by vendor_id)
  await sequelize.query(
    `DELETE FROM vendorrisks WHERE organization_id = :organizationId AND is_demo = true`,
    { replacements: { organizationId }, transaction }
  );

  // Delete demo vendors
  await sequelize.query(`DELETE FROM vendors WHERE organization_id = :organizationId AND is_demo;`, { replacements: { organizationId }, transaction });
}
