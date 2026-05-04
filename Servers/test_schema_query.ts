import { sequelize } from "./database/db";
import { QueryTypes } from "sequelize";

async function testSchemaQuery() {
  try {
    const schemas: any[] = await sequelize.query(
      `SELECT schema_name
       FROM information_schema.schemata
       WHERE schema_name NOT IN ('public', 'information_schema', 'pg_catalog', 'pg_toast')
       AND schema_name NOT LIKE 'pg_%'`,
      { type: QueryTypes.SELECT },
    );

    console.log("Found tenant schemas:", schemas);
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await sequelize.close();
  }
}

testSchemaQuery();
