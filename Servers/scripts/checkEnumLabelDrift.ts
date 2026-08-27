import fs from "fs";
import path from "path";
import YAML from "yamljs";

const MANIFEST_PATH = path.resolve(__dirname, "../enum-manifest.json");
const SWAGGER_PATH = path.resolve(__dirname, "../swagger.yaml");
const REPO_ROOT = path.resolve(__dirname, "../..");

const STRICT = process.env.ENUM_DRIFT_STRICT === "1" || process.env.ENUM_DRIFT_STRICT === "true";

interface FrontendTarget {
  file: string;
  enum?: string;
  constArray?: string;
  objectArray?: string;
  objectValueKey?: string;
}

interface Check {
  key: string;
  frontend: FrontendTarget | FrontendTarget[];
  swaggerSchema?: string;
}

const checks: Check[] = [
  {
    key: "aiRiskClassification",
    frontend: {
      file: "Clients/src/domain/enums/aiRiskClassification.enum.ts",
      enum: "AiRiskClassification",
    },
    swaggerSchema: "AiRiskClassification",
  },
  {
    key: "highRiskRole",
    frontend: { file: "Clients/src/domain/enums/highRiskRole.enum.ts", enum: "HighRiskRole" },
    swaggerSchema: "HighRiskRole",
  },
  {
    key: "projectStatus",
    frontend: {
      file: "Clients/src/presentation/components/Forms/ProjectForm/index.tsx",
      objectArray: "PROJECT_STATUS_ITEMS",
      objectValueKey: "name",
    },
    swaggerSchema: "ProjectStatus",
  },
  {
    key: "taskStatus",
    frontend: { file: "Clients/src/domain/enums/task.enum.ts", enum: "TaskStatus" },
  },
  {
    key: "taskPriority",
    frontend: { file: "Clients/src/domain/enums/task.enum.ts", enum: "TaskPriority" },
  },
  {
    key: "dataClassification",
    frontend: { file: "Clients/src/domain/enums/dataset.enum.ts", enum: "DataClassification" },
  },
  {
    key: "modelInventoryStatus",
    frontend: {
      file: "Clients/src/domain/enums/modelInventory.enum.ts",
      enum: "ModelInventoryStatus",
    },
  },
  {
    key: "aiLifecyclePhase",
    frontend: {
      file: "Clients/src/domain/enums/aiLifeCyclePhase.enum.ts",
      enum: "AiLifeCyclePhase",
    },
  },
  {
    key: "riskLikelihood",
    frontend: { file: "Clients/src/domain/enums/likelihood.enum.ts", enum: "Likelihood" },
  },
  {
    key: "riskSeverity",
    frontend: { file: "Clients/src/domain/enums/severity.enum.ts", enum: "Severity" },
  },
  {
    key: "riskSeverityAlt",
    frontend: { file: "Clients/src/domain/enums/riskSeverity.enum.ts", enum: "RiskSeverity" },
  },
  {
    key: "mitigationStatus",
    frontend: {
      file: "Clients/src/domain/enums/mitigationStatus.enum.ts",
      enum: "MitigationStatus",
    },
  },
  {
    key: "currentRiskLevel",
    frontend: {
      file: "Clients/src/domain/enums/currentRiskLevel.enum.ts",
      enum: "CurrentRiskLevel",
    },
  },
  {
    key: "riskLevelAutocalculated",
    frontend: {
      file: "Clients/src/domain/enums/riskLevelAutoCalculated.enum.ts",
      enum: "RiskLevelAutoCalculated",
    },
  },
];

function readFile(relativePath: string): string {
  return fs.readFileSync(path.resolve(REPO_ROOT, relativePath), "utf-8");
}

function extractEnumValues(content: string, enumName: string): string[] {
  const regex = new RegExp(`export\\s+enum\\s+${enumName}\\s*\\{([\\s\\S]*?)\\}`, "m");
  const match = content.match(regex);
  if (!match) return [];
  const values: string[] = [];
  const valueRegex = /=\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = valueRegex.exec(match[1])) !== null) {
    values.push(m[1]);
  }
  return values;
}

function extractConstArrayStrings(content: string, arrayName: string): string[] {
  const regex = new RegExp(`export\\s+const\\s+${arrayName}\\s*=\\s*\\[([\\s\\S]*?)\\]`, "m");
  const match = content.match(regex);
  if (!match) return [];
  const values: string[] = [];
  const valueRegex = /"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = valueRegex.exec(match[1])) !== null) {
    values.push(m[1]);
  }
  return values;
}

function extractObjectArrayNames(content: string, arrayName: string, valueKey: string): string[] {
  const regex = new RegExp(`const\\s+${arrayName}\\s*=\\s*\\[([\\s\\S]*?)\\];`, "m");
  const match = content.match(regex);
  if (!match) return [];
  const values: string[] = [];
  const valueRegex = new RegExp(`${valueKey}:\\s*"([^"]+)"`, "g");
  let m: RegExpExecArray | null;
  while ((m = valueRegex.exec(match[1])) !== null) {
    values.push(m[1]);
  }
  return values;
}

function extractFrontendValues(target: FrontendTarget): string[] {
  const content = readFile(target.file);
  if (target.enum) {
    return extractEnumValues(content, target.enum);
  }
  if (target.constArray) {
    return extractConstArrayStrings(content, target.constArray);
  }
  if (target.objectArray && target.objectValueKey) {
    return extractObjectArrayNames(content, target.objectArray, target.objectValueKey);
  }
  return [];
}

function extractSwaggerEnum(schemaName: string): string[] | null {
  if (!fs.existsSync(SWAGGER_PATH)) return null;
  const swagger = YAML.load(SWAGGER_PATH) as any;
  const schema = swagger.components?.schemas?.[schemaName];
  if (!schema) return null;
  return schema.enum || null;
}

function diff(expected: string[], actual: string[]) {
  const expSet = new Set(expected);
  const actSet = new Set(actual);
  return {
    missing: expected.filter((v) => !actSet.has(v)),
    extra: actual.filter((v) => !expSet.has(v)),
  };
}

function main(): number {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(
      `Manifest not found at ${MANIFEST_PATH}. Run npm run generate:enum-manifest first.`,
    );
    return 1;
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8")) as Record<string, string[]>;
  let driftCount = 0;

  for (const check of checks) {
    const expected = manifest[check.key];
    if (!expected) {
      console.warn(`No manifest entry for ${check.key}; skipping.`);
      continue;
    }

    const targets = Array.isArray(check.frontend) ? check.frontend : [check.frontend];
    for (const target of targets) {
      const actual = extractFrontendValues(target);
      const { missing, extra } = diff(expected, actual);
      if (missing.length || extra.length) {
        driftCount++;
        console.log(`\n[${check.key}] backend vs ${target.file}`);
        if (missing.length)
          console.log(`  backend values missing in frontend: ${JSON.stringify(missing)}`);
        if (extra.length)
          console.log(`  frontend values not in backend:     ${JSON.stringify(extra)}`);
      }
    }

    if (check.swaggerSchema) {
      const swaggerValues = extractSwaggerEnum(check.swaggerSchema);
      if (swaggerValues) {
        const { missing, extra } = diff(expected, swaggerValues);
        if (missing.length || extra.length) {
          driftCount++;
          console.log(`\n[${check.key}] backend vs swagger.yaml#${check.swaggerSchema}`);
          if (missing.length)
            console.log(`  backend values missing in swagger: ${JSON.stringify(missing)}`);
          if (extra.length)
            console.log(`  swagger values not in backend:     ${JSON.stringify(extra)}`);
        }
      }
    }
  }

  console.log("");
  if (driftCount === 0) {
    console.log("No enum/label drift detected.");
    return 0;
  }

  console.log(
    `${driftCount} drift(s) detected between backend enums and frontend/swagger sources.`,
  );
  if (STRICT) {
    console.error("Failing because ENUM_DRIFT_STRICT is enabled.");
    return 1;
  }
  console.log("Running in warning mode (set ENUM_DRIFT_STRICT=1 to fail the gate).");
  return 0;
}

const exitCode = main();
process.exit(exitCode);
