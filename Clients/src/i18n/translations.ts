// Prototype Turkish translation dictionary for VerifyWise.
// Maps English source text → Turkish. DOM translator looks up by source string.
// Missing keys fall back to the English source.
//
// Glossary (for consistency):
//   use case       → kullanım senaryosu
//   framework      → çerçeve
//   vendor         → tedarikçi
//   risk           → risk
//   policy         → politika
//   evidence       → kanıt
//   control        → kontrol
//   compliance     → uyumluluk
//   governance     → yönetişim
//   incident       → olay
//   assessment     → değerlendirme
//   dataset        → veri kümesi
//   model          → model
//   approval       → onay
//   workflow       → iş akışı
//   subprocessor   → alt işleyici
//   trust center   → güven merkezi

import {
  de as agentDiscoveryDe,
  fr as agentDiscoveryFr,
  es as agentDiscoveryEs,
} from "./modules/agentDiscovery";
import { de as aiAppsDe, fr as aiAppsFr, es as aiAppsEs } from "./modules/aiApps";
import { de as aiAppsBulkDe, fr as aiAppsBulkFr, es as aiAppsBulkEs } from "./modules/aiAppsBulk";
import { de as aiAuditDe, fr as aiAuditFr, es as aiAuditEs } from "./modules/aiAudit";
import {
  de as aiContentReviewDe,
  fr as aiContentReviewFr,
  es as aiContentReviewEs,
} from "./modules/aiContentReview";
import {
  de as aiDetectionDe,
  fr as aiDetectionFr,
  es as aiDetectionEs,
} from "./modules/aiDetection";
import { de as aiGatewayDe, fr as aiGatewayFr, es as aiGatewayEs } from "./modules/aiGateway";
import {
  de as aiObservabilityDe,
  fr as aiObservabilityFr,
  es as aiObservabilityEs,
} from "./modules/aiObservability";
import {
  de as aiTrustCenterDe,
  fr as aiTrustCenterFr,
  es as aiTrustCenterEs,
} from "./modules/aiTrustCenter";
import {
  de as aiTrustIndexDe,
  fr as aiTrustIndexFr,
  es as aiTrustIndexEs,
} from "./modules/aiTrustIndex";
import { de as approvalsDe, fr as approvalsFr, es as approvalsEs } from "./modules/approvals";
import {
  de as authenticationDe,
  fr as authenticationFr,
  es as authenticationEs,
} from "./modules/authentication";
import {
  de as automationsDe,
  fr as automationsFr,
  es as automationsEs,
} from "./modules/automations";
import { de as dashboardDe, fr as dashboardFr, es as dashboardEs } from "./modules/dashboard";
import { de as datasetsDe, fr as datasetsFr, es as datasetsEs } from "./modules/datasets";
import { de as evalsDe, fr as evalsFr, es as evalsEs } from "./modules/evals";
import {
  de as eventTrackerDe,
  fr as eventTrackerFr,
  es as eventTrackerEs,
} from "./modules/eventTracker";
import { de as evidenceDe, fr as evidenceFr, es as evidenceEs } from "./modules/evidence";
import { de as frameworksDe, fr as frameworksFr, es as frameworksEs } from "./modules/frameworks";
import { de as governanceDe, fr as governanceFr, es as governanceEs } from "./modules/governance";
import { de as incidentsDe, fr as incidentsFr, es as incidentsEs } from "./modules/incidents";
import {
  de as intakeLiveChecksDe,
  fr as intakeLiveChecksFr,
  es as intakeLiveChecksEs,
} from "./modules/intakeLiveChecks";
import {
  de as intakeLogicDe,
  fr as intakeLogicFr,
  es as intakeLogicEs,
} from "./modules/intakeLogic";
import {
  de as intakePreviewDe,
  fr as intakePreviewFr,
  es as intakePreviewEs,
} from "./modules/intakePreview";
import {
  de as modelInventoryDe,
  fr as modelInventoryFr,
  es as modelInventoryEs,
} from "./modules/modelInventory";
import { de as mcpServersDe, fr as mcpServersFr, es as mcpServersEs } from "./modules/mcpServers";
import { de as policiesDe, fr as policiesFr, es as policiesEs } from "./modules/policies";
import { de as reportingDe, fr as reportingFr, es as reportingEs } from "./modules/reporting";
import {
  de as riskManagementDe,
  fr as riskManagementFr,
  es as riskManagementEs,
} from "./modules/riskManagement";
import { de as settingsDe, fr as settingsFr, es as settingsEs } from "./modules/settings";
import { de as shadowAiDe, fr as shadowAiFr, es as shadowAiEs } from "./modules/shadowAi";
import { de as startHereDe, fr as startHereFr, es as startHereEs } from "./modules/startHere";
import { de as superAdminDe, fr as superAdminFr, es as superAdminEs } from "./modules/superAdmin";
import { de as tasksDe, fr as tasksFr, es as tasksEs } from "./modules/tasks";
import { de as trainingDe, fr as trainingFr, es as trainingEs } from "./modules/training";
import { de as useCasesDe, fr as useCasesFr, es as useCasesEs } from "./modules/useCases";
import {
  de as useCaseLifecycleDe,
  fr as useCaseLifecycleFr,
  es as useCaseLifecycleEs,
} from "./modules/useCaseLifecycle";
import { de as vendorsDe, fr as vendorsFr, es as vendorsEs } from "./modules/vendors";
import { de as commonDe, fr as commonFr, es as commonEs } from "./modules/common";

export type Lang = "en" | "de" | "fr" | "es";

export const translations: Record<string, Record<string, string>> = {
  de: {
    ...agentDiscoveryDe,
    ...aiAppsDe,
    ...aiAppsBulkDe,
    ...aiAuditDe,
    ...aiContentReviewDe,
    ...aiDetectionDe,
    ...aiGatewayDe,
    ...aiObservabilityDe,
    ...aiTrustCenterDe,
    ...aiTrustIndexDe,
    ...approvalsDe,
    ...authenticationDe,
    ...automationsDe,
    ...dashboardDe,
    ...datasetsDe,
    ...evalsDe,
    ...eventTrackerDe,
    ...evidenceDe,
    ...frameworksDe,
    ...governanceDe,
    ...incidentsDe,
    ...intakeLiveChecksDe,
    ...intakeLogicDe,
    ...intakePreviewDe,
    ...modelInventoryDe,
    ...mcpServersDe,
    ...policiesDe,
    ...reportingDe,
    ...riskManagementDe,
    ...settingsDe,
    ...shadowAiDe,
    ...startHereDe,
    ...superAdminDe,
    ...tasksDe,
    ...trainingDe,
    ...useCasesDe,
    ...useCaseLifecycleDe,
    ...vendorsDe,
    ...commonDe,
  },

  fr: {
    ...agentDiscoveryFr,
    ...aiAppsFr,
    ...aiAppsBulkFr,
    ...aiAuditFr,
    ...aiContentReviewFr,
    ...aiDetectionFr,
    ...aiGatewayFr,
    ...aiObservabilityFr,
    ...aiTrustCenterFr,
    ...aiTrustIndexFr,
    ...approvalsFr,
    ...authenticationFr,
    ...automationsFr,
    ...dashboardFr,
    ...datasetsFr,
    ...evalsFr,
    ...eventTrackerFr,
    ...evidenceFr,
    ...frameworksFr,
    ...governanceFr,
    ...incidentsFr,
    ...intakeLiveChecksFr,
    ...intakeLogicFr,
    ...intakePreviewFr,
    ...modelInventoryFr,
    ...mcpServersFr,
    ...policiesFr,
    ...reportingFr,
    ...riskManagementFr,
    ...settingsFr,
    ...shadowAiFr,
    ...startHereFr,
    ...superAdminFr,
    ...tasksFr,
    ...trainingFr,
    ...useCasesFr,
    ...useCaseLifecycleFr,
    ...vendorsFr,
    ...commonFr,
  },

  es: {
    ...agentDiscoveryEs,
    ...aiAppsEs,
    ...aiAppsBulkEs,
    ...aiAuditEs,
    ...aiContentReviewEs,
    ...aiDetectionEs,
    ...aiGatewayEs,
    ...aiObservabilityEs,
    ...aiTrustCenterEs,
    ...aiTrustIndexEs,
    ...approvalsEs,
    ...authenticationEs,
    ...automationsEs,
    ...dashboardEs,
    ...datasetsEs,
    ...evalsEs,
    ...eventTrackerEs,
    ...evidenceEs,
    ...frameworksEs,
    ...governanceEs,
    ...incidentsEs,
    ...intakeLiveChecksEs,
    ...intakeLogicEs,
    ...intakePreviewEs,
    ...modelInventoryEs,
    ...mcpServersEs,
    ...policiesEs,
    ...reportingEs,
    ...riskManagementEs,
    ...settingsEs,
    ...shadowAiEs,
    ...startHereEs,
    ...superAdminEs,
    ...tasksEs,
    ...trainingEs,
    ...useCasesEs,
    ...useCaseLifecycleEs,
    ...vendorsEs,
    ...commonEs,
  },
};
