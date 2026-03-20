import { sequelize } from "../database/db";
import { createNewUserQuery } from "../utils/user.utils";
import { exec } from "child_process";
import { promisify } from "util";
import { insertMockData } from "../infrastructure.layer/driver/autoDriver.driver";
import { QueryTypes } from "sequelize";
import { UserModel } from "../domain.layer/models/user/user.model";

const execAsync = promisify(exec);

async function resetDatabase() {
  const transaction = await sequelize.transaction();
  try {
    console.log("Resetting database...");

    // Drop all tables
    await sequelize.query(`
      DO $$ DECLARE
          r RECORD;
      BEGIN
          FOR r IN (
              SELECT tablename FROM pg_tables 
              WHERE schemaname = current_schema() 
              AND tablename NOT LIKE 'spatial_ref_sys' -- optional: skip system tables
          ) LOOP
              EXECUTE 'DROP TABLE IF EXISTS "' || r.tablename || '" CASCADE';
          END LOOP;
      END $$;
    `);
    console.log("All tables dropped.");

    await sequelize.query(`
      DO $$ DECLARE
          r RECORD;
      BEGIN
          FOR r IN (
              SELECT n.nspname, t.typname
              FROM pg_type t
              JOIN pg_enum e ON t.oid = e.enumtypid
              JOIN pg_namespace n ON n.oid = t.typnamespace
              WHERE n.nspname = current_schema()
              GROUP BY n.nspname, t.typname
          ) LOOP
              EXECUTE 'DROP TYPE IF EXISTS "' || r.typname || '" CASCADE';
          END LOOP;
      END $$;
    `);
    console.log("All enum types dropped.");

    // Run migrations
    await execAsync("npx sequelize db:migrate");
    console.log("Migrations applied.");

    // Create default admin user
    const admin = await createNewUserQuery(
      await UserModel.createNewUser(
        "VerifyWise",
        "Admin",
        "verifywise@email.com",
        "MyJH4rTm!@.45L0wm",
        1,
        1
      ),
      transaction,
      true
    );
    await transaction.commit();
    console.log("Default admin user created.");

    // Insert mock data (awaiting it to complete)
    await insertMockData(1, 1, admin.id!);
    console.log("Mock data inserted.");

    // Fetch the first project to get its ID
    const project = await sequelize.query("SELECT * FROM projects LIMIT 1", {
      type: QueryTypes.SELECT,
    });

    if (!project || project.length === 0) {
      throw new Error("No projects found in the database.");
    }
    const projectId = (project[0] as { id: number }).id;
    console.log(`Project found with ID: ${projectId}`);

    await sequelize.query(
      `INSERT INTO projects_members (project_id, user_id, is_demo) VALUES (:project_id, :user_id, :is_demo) RETURNING *`,
      {
        replacements: {
          project_id: projectId,
          user_id: admin.id,
          is_demo: true,
        },
        type: QueryTypes.INSERT,
      }
    );

    console.log("Database reset successfully.");

    process.exit(0);
  } catch (err) {
    await transaction.rollback();
    console.error("Error resetting database:", err);
    process.exit(1);
  }
}

resetDatabase();
