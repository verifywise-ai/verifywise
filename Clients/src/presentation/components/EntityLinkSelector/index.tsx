/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Stack, Typography, useTheme, Box, IconButton } from "@mui/material";
import { Plus, X, RotateCcw } from "lucide-react";
import SelectComponent from "../Inputs/Select";
import { getAllEntities } from "../../../application/repository/entity.repository";
import { getAllVendors } from "../../../application/repository/vendor.repository";
import { getAllPolicies } from "../../../application/repository/policy.repository";
import { EntityType } from "../../../application/hooks/useTaskEntityLinks";
import { background } from "../../themes/palette";

interface EntityLink {
  entity_id: number;
  entity_type: EntityType;
  entity_name?: string;
}

interface EntityLinkSelectorProps {
  value: EntityLink[];
  onChange: (links: EntityLink[]) => void;
  disabled?: boolean;
}

// Top-level entity type options
const ENTITY_TYPE_OPTIONS = [
  { _id: "vendor", name: "Vendor" },
  { _id: "model", name: "Model" },
  { _id: "policy", name: "Policy" },
  { _id: "use_case", name: "Use-case" },
  { _id: "framework", name: "Framework (Organizational)" },
];

const EntityLinkSelector: React.FC<EntityLinkSelectorProps> = ({
  value = [],
  onChange,
  disabled = false,
}) => {
  const theme = useTheme();

  // State for the cascading selection
  const [selectedTopLevel, setSelectedTopLevel] = useState<string>("");
  const [selectedProject, setSelectedProject] = useState<number | "">("");
  const [selectedFramework, setSelectedFramework] = useState<number | "">("");
  const [selectedEntityId, setSelectedEntityId] = useState<number | "">("");

  // Data states
  const [vendors, setVendors] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [policies, setPolicies] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [frameworks, setFrameworks] = useState<any[]>([]);
  const [projectFrameworks, setProjectFrameworks] = useState<any[]>([]);
  const [subEntities, setSubEntities] = useState<any[]>([]);

  // Loading states
  const [loadingEntities, setLoadingEntities] = useState(false);

  // Track links that are pending removal (shown with strikethrough until saved)
  const [pendingRemovals, setPendingRemovals] = useState<EntityLink[]>([]);

  // Fetch vendors
  const fetchVendors = useCallback(async () => {
    try {
      const response = await getAllVendors();
      setVendors(response?.data || []);
    } catch (error) {
      console.error("Error fetching vendors:", error);
    }
  }, []);

  // Fetch models
  const fetchModels = useCallback(async () => {
    try {
      const response = await getAllEntities({ routeUrl: "/modelInventory" });
      setModels(response?.data || response || []);
    } catch (error) {
      console.error("Error fetching models:", error);
    }
  }, []);

  // Fetch policies
  const fetchPolicies = useCallback(async () => {
    try {
      const data = await getAllPolicies();
      setPolicies(data || []);
    } catch (error) {
      console.error("Error fetching policies:", error);
    }
  }, []);

  // Fetch projects (use-cases)
  const fetchProjects = useCallback(async () => {
    try {
      const response = await getAllEntities({ routeUrl: "/projects" });
      // Filter to only non-organizational projects (use-cases)
      const allProjects = response?.data || [];
      setProjects(allProjects.filter((p: any) => !p.is_organizational));
    } catch (error) {
      console.error("Error fetching projects:", error);
    }
  }, []);

  // Fetch organizational frameworks (these are organizational projects with is_organizational = true)
  const fetchFrameworks = useCallback(async () => {
    try {
      const response = await getAllEntities({ routeUrl: "/projects" });
      // Filter to only organizational projects (organizational frameworks)
      const allProjects = response?.data || [];
      const orgProjects = allProjects.filter((p: any) => p.is_organizational);

      // For each organizational project, we need its framework info
      // Fetch full details for each to get framework association
      const orgFrameworksWithDetails: any[] = [];

      await Promise.all(
        orgProjects.map(async (project: any) => {
          try {
            const detailResponse = await getAllEntities({ routeUrl: `/projects/${project.id}` });
            // Handle nested data structure: response could be {data: project} or project directly
            const projectData = detailResponse?.data || detailResponse;
            // Framework array could be at different levels depending on serialization
            const frameworks = projectData?.framework
              || projectData?.dataValues?.framework
              || (projectData?.data?.framework)
              || (projectData?.data?.dataValues?.framework)
              || [];

            // Add ALL frameworks from this organizational project, not just the first one
            frameworks.forEach((framework: any) => {
              // Extract project_framework_id - might be named differently
              const pfId = framework?.project_framework_id
                || framework?.projectFrameworkId
                || framework?.id;

              if (pfId && framework?.framework_id) {
                orgFrameworksWithDetails.push({
                  id: project.id,
                  // Use framework name for display
                  name: framework?.name || `Framework ${framework?.framework_id || project.id}`,
                  framework_id: framework?.framework_id,
                  project_framework_id: pfId,
                  // Create a unique key combining project id and framework id
                  uniqueKey: `${project.id}_${framework?.framework_id}`,
                });
              }
            });
          } catch (err) {
            console.error(`Error fetching project ${project.id} details:`, err);
            orgFrameworksWithDetails.push({
              id: project.id,
              name: `Framework ${project.id}`,
              uniqueKey: `${project.id}_unknown`,
            });
          }
        })
      );

      setFrameworks(orgFrameworksWithDetails);
    } catch (error) {
      console.error("Error fetching organizational frameworks:", error);
    }
  }, []);

  // Fetch frameworks for a specific project
  const fetchProjectFrameworks = useCallback(async (projectId: number) => {
    try {
      const response = await getAllEntities({ routeUrl: `/projects/${projectId}` });
      // Handle both { data: project } and project directly
      const project = response?.data || response;
      const frameworks = project?.framework || project?.dataValues?.framework || [];
      setProjectFrameworks(frameworks);
    } catch (error) {
      console.error("Error fetching project frameworks:", error);
      setProjectFrameworks([]);
    }
  }, []);

  // Fetch sub-entities for a framework
  const fetchSubEntities = useCallback(async (frameworkId: number, projectFrameworkId?: number) => {
    setLoadingEntities(true);
    try {
      let subEntityList: any[] = [];

      switch (frameworkId) {
        case 1: // EU AI Act
          if (projectFrameworkId) {
            // Fetch compliance controls
            const euResponse = await getAllEntities({
              routeUrl: `/eu-ai-act/compliances/byProjectId/${projectFrameworkId}`
            });
            // Response is array of control categories, each with controls
            const euData = euResponse?.data || euResponse || [];
            euData.forEach((category: any) => {
              const categoryNo = category.order_no || category.id || "";
              const controls = category.controls || [];
              controls.forEach((control: any) => {
                // API returns 'id' as the control ID from controls_eu table
                const controlId = control.id;
                const controlNo = control.order_no || "";
                const controlTitle = control.title;
                // Format: "1.1 - Control Title" or "Category - Control Title"
                const displayName = categoryNo && controlNo
                  ? `${categoryNo}.${controlNo} - ${controlTitle}`
                  : `${category.title} - ${controlTitle}`;
                subEntityList.push({
                  _id: `eu_control_${controlId}`,
                  entity_id: controlId,
                  name: displayName,
                  type: "eu_control",
                });
                const subControls = control.subControls || control.dataValues?.subControls || [];
                subControls.forEach((sub: any) => {
                  const subId = sub.id || sub.dataValues?.id;
                  const subNo = sub.order_no || sub.dataValues?.order_no || "";
                  const subTitle = sub.title || sub.dataValues?.title || "Subcontrol";
                  // Format: "1.1.a - Subcontrol Title"
                  const subDisplayName = categoryNo && controlNo && subNo
                    ? `${categoryNo}.${controlNo}.${subNo} - ${subTitle}`
                    : `${controlTitle || "Control"} - ${subTitle}`;
                  subEntityList.push({
                    _id: `eu_subcontrol_${subId}`,
                    entity_id: subId,
                    name: subDisplayName,
                    type: "eu_subcontrol",
                  });
                });
              });
            });

            // Fetch assessment questions
            const euAssessmentResponse = await getAllEntities({
              routeUrl: `/eu-ai-act/assessments/byProjectId/${projectFrameworkId}`
            });
            const euAssessmentData = euAssessmentResponse?.data || euAssessmentResponse || [];
            euAssessmentData.forEach((topic: any) => {
              const topicData = topic.dataValues || topic;
              const topicNo = topicData.order_no || "";
              const subTopics = topicData.subTopics || [];
              subTopics.forEach((subTopic: any) => {
                const subTopicData = subTopic.dataValues || subTopic;
                const subTopicNo = subTopicData.order_no || "";
                const questions = subTopicData.questions || [];
                questions.forEach((question: any) => {
                  const questionData = question.dataValues || question;
                  const answerId = questionData.answer_id || questionData.id;
                  const questionNo = questionData.order_no || "";
                  const questionTitle = questionData.question || questionData.title || "Question";
                  // Format: "1.1.1 - Question text"
                  const displayName = topicNo && subTopicNo && questionNo
                    ? `${topicNo}.${subTopicNo}.${questionNo} - ${questionTitle.substring(0, 80)}${questionTitle.length > 80 ? "..." : ""}`
                    : questionTitle.substring(0, 100);
                  subEntityList.push({
                    _id: `eu_assessment_${answerId}`,
                    entity_id: answerId,
                    name: displayName,
                    type: "eu_assessment",
                  });
                });
              });
            });
          }
          break;

        case 2: // ISO 42001
          if (projectFrameworkId) {
            // Fetch subclauses
            const isoClausesResponse = await getAllEntities({
              routeUrl: `/iso-42001/clauses/byProjectId/${projectFrameworkId}`
            });
            const isoClauses = isoClausesResponse?.data || isoClausesResponse || [];
            isoClauses.forEach((clause: any) => {
              const clauseData = clause.dataValues || clause;
              const subClauses = clauseData.subClauses || [];
              subClauses.forEach((sub: any) => {
                const subData = sub.dataValues || sub;
                // Format: "Clause 4.1 - Understanding the organization..."
                // Fields: clauseData.clause_no, subData.order_no
                subEntityList.push({
                  _id: `iso42001_subclause_${subData.id}`,
                  entity_id: subData.id,
                  name: `Clause ${clauseData.clause_no}.${subData.order_no} - ${subData.title}`,
                  type: "iso42001_subclause",
                });
              });
            });

            // Fetch annex categories - backend returns data in 'subClauses' field
            const isoAnnexesResponse = await getAllEntities({
              routeUrl: `/iso-42001/annexes/byProjectId/${projectFrameworkId}`
            });
            const isoAnnexes = isoAnnexesResponse?.data || isoAnnexesResponse || [];
            isoAnnexes.forEach((annex: any) => {
              const annexData = annex.dataValues || annex;
              // Backend uses 'subClauses' for annex categories (naming inconsistency with getReferenceControlsQuery)
              const annexCategories = annexData.subClauses || annexData.annexCategories || [];
              annexCategories.forEach((cat: any) => {
                const catData = cat.dataValues || cat;
                // Format: "Annex A.5.1 - Policies for AI"
                // Fields: annexData.annex_no, catData.order_no
                subEntityList.push({
                  _id: `iso42001_annexcategory_${catData.id}`,
                  entity_id: catData.id,
                  name: `Annex ${annexData.annex_no}.${catData.order_no} - ${catData.title}`,
                  type: "iso42001_annexcategory",
                });
              });
            });
          }
          break;

        case 3: // ISO 27001
          if (projectFrameworkId) {
            // Fetch subclauses
            const iso27ClausesResponse = await getAllEntities({
              routeUrl: `/iso-27001/clauses/byProjectId/${projectFrameworkId}`
            });
            const iso27Clauses = iso27ClausesResponse?.data || iso27ClausesResponse || [];
            iso27Clauses.forEach((clause: any) => {
              const clauseData = clause.dataValues || clause;
              const subClauses = clauseData.subClauses || [];
              subClauses.forEach((sub: any) => {
                const subData = sub.dataValues || sub;
                // Format: "Clause 4.1 - Context of the organization"
                // Fields: clauseData.arrangement, subData.order_no
                subEntityList.push({
                  _id: `iso27001_subclause_${subData.id}`,
                  entity_id: subData.id,
                  name: `Clause ${clauseData.arrangement}.${subData.order_no} - ${subData.title}`,
                  type: "iso27001_subclause",
                });
              });
            });

            // Fetch annex controls - backend uses 'subClauses' field (naming inconsistency)
            const iso27AnnexesResponse = await getAllEntities({
              routeUrl: `/iso-27001/annexes/byProjectId/${projectFrameworkId}`
            });
            const iso27Annexes = iso27AnnexesResponse?.data || iso27AnnexesResponse || [];
            iso27Annexes.forEach((annex: any) => {
              const annexData = annex.dataValues || annex;
              const annexControls = annexData.subClauses || annexData.annexControls || [];
              annexControls.forEach((ctrl: any) => {
                const ctrlData = ctrl.dataValues || ctrl;
                // Format: "A.5.1 - Policies for information security"
                // Fields: annexData.arrangement, annexData.order_no, ctrlData.order_no
                subEntityList.push({
                  _id: `iso27001_annexcontrol_${ctrlData.id}`,
                  entity_id: ctrlData.id,
                  name: `${annexData.arrangement}.${annexData.order_no}.${ctrlData.order_no} - ${ctrlData.title}`,
                  type: "iso27001_annexcontrol",
                });
              });
            });
          }
          break;

        case 4: // NIST AI RMF
          if (projectFrameworkId) {
            const nistResponse = await getAllEntities({
              routeUrl: `/nist-ai-rmf/overview`
            });
            const nistData = nistResponse?.data || nistResponse;
            const functions = nistData?.functions || [];
            functions.forEach((func: any) => {
              const funcData = func.dataValues || func;
              const funcType = funcData.type?.toUpperCase() || "FUNCTION";
              const categories = funcData.categories || [];
              categories.forEach((cat: any, catIndex: number) => {
                const catData = cat.dataValues || cat;
                const subcategories = catData.subcategories || [];
                // Always use function type + category index for unique category label
                const categoryLabel = `${funcType} ${catIndex + 1}`;
                subcategories.forEach((sub: any, subIndex: number) => {
                  const subData = sub.dataValues || sub;
                  const subTitle = subData.title || "";
                  // Format: "GOVERN 1.1: Description..." or just "GOVERN 1.1" if no title
                  const subLabel = subTitle
                    ? `${categoryLabel}.${subIndex + 1}: ${subTitle.substring(0, 60)}${subTitle.length > 60 ? "..." : ""}`
                    : `${categoryLabel}.${subIndex + 1}`;
                  subEntityList.push({
                    _id: `nist_subcategory_${subData.id}`,
                    entity_id: subData.id,
                    name: subLabel,
                    type: "nist_subcategory",
                  });
                });
              });
            });
          }
          break;
      }

      setSubEntities(subEntityList);
    } catch (error) {
      console.error("Error fetching sub-entities:", error);
      setSubEntities([]);
    } finally {
      setLoadingEntities(false);
    }
  }, []);

  // Load initial data
  useEffect(() => {
    fetchVendors();
    fetchModels();
    fetchPolicies();
    fetchProjects();
    fetchFrameworks();
  }, [fetchVendors, fetchModels, fetchPolicies, fetchProjects, fetchFrameworks]);

  // Load project frameworks when project is selected
  useEffect(() => {
    if (selectedTopLevel === "use_case" && selectedProject) {
      fetchProjectFrameworks(selectedProject as number);
    } else {
      setProjectFrameworks([]);
    }
    setSelectedFramework("");
    setSubEntities([]);
    setSelectedEntityId("");
  }, [selectedTopLevel, selectedProject, fetchProjectFrameworks]);

  // Load sub-entities when framework is selected
  useEffect(() => {
    if (selectedFramework) {
      let frameworkId: number | undefined;
      let projectFrameworkId: number | undefined;

      if (selectedTopLevel === "use_case") {
        // For use-case, selectedFramework is the project_framework_id
        const pf = projectFrameworks.find((f: any) =>
          f.project_framework_id === selectedFramework || f.id === selectedFramework
        );
        frameworkId = pf?.framework_id;
        projectFrameworkId = selectedFramework as number;
      } else {
        // For organizational framework, selectedFramework is the uniqueKey (projectId_frameworkId)
        // We need to get framework_id and project_framework_id from the frameworks array
        const orgFramework = frameworks.find((f: any) => f.uniqueKey === selectedFramework || f.id === selectedFramework);
        frameworkId = orgFramework?.framework_id;
        projectFrameworkId = orgFramework?.project_framework_id;
      }

      if (frameworkId) {
        fetchSubEntities(frameworkId, projectFrameworkId);
      } else {
        setSubEntities([]);
      }
    } else {
      setSubEntities([]);
    }
    setSelectedEntityId("");
  }, [selectedFramework, selectedTopLevel, projectFrameworks, frameworks, fetchSubEntities]);

  // Reset cascading selections when top level changes
  useEffect(() => {
    setSelectedProject("");
    setSelectedFramework("");
    setSelectedEntityId("");
    setSubEntities([]);
  }, [selectedTopLevel]);

  // Get entity options for direct selection (vendor, model, policy)
  const directEntityOptions = useMemo(() => {
    switch (selectedTopLevel) {
      case "vendor":
        return vendors.map((v) => ({
          _id: v.id,
          name: v.vendor_name || v.name || `Vendor ${v.id}`,
        }));
      case "model":
        return models.map((m) => ({
          _id: m.id,
          name: `${m.provider || ""} ${m.model || ""}`.trim() || `Model ${m.id}`,
        }));
      case "policy":
        return policies.map((p) => ({
          _id: p.id,
          name: p.title || `Policy ${p.id}`,
        }));
      default:
        return [];
    }
  }, [selectedTopLevel, vendors, models, policies]);

  // Get project options
  const projectOptions = useMemo(() => {
    return projects.map((p) => ({
      _id: p.id,
      name: p.project_title || p.name || `Project ${p.id}`,
    }));
  }, [projects]);

  // Get framework options (for organizational frameworks)
  const frameworkOptions = useMemo(() => {
    return frameworks.map((f) => ({
      _id: f.uniqueKey || f.id,
      name: f.name || `Framework ${f.id}`,
    }));
  }, [frameworks]);

  // Get project framework options
  const projectFrameworkOptions = useMemo(() => {
    return projectFrameworks.map((pf: any) => ({
      _id: pf.project_framework_id || pf.id,
      name: pf.name || `Framework ${pf.framework_id}`,
    }));
  }, [projectFrameworks]);

  // Determine if we can add a link
  const canAddLink = useMemo(() => {
    if (!selectedTopLevel) return false;

    if (["vendor", "model", "policy"].includes(selectedTopLevel)) {
      return !!selectedEntityId;
    }

    if (selectedTopLevel === "use_case" || selectedTopLevel === "framework") {
      return !!selectedEntityId;
    }

    return false;
  }, [selectedTopLevel, selectedEntityId]);

  // Handle adding a new entity link
  const handleAddLink = () => {
    if (!canAddLink) return;

    let entityType: EntityType;
    let entityName: string = "";
    let entityId: number;

    if (["vendor", "model", "policy"].includes(selectedTopLevel)) {
      entityType = selectedTopLevel as EntityType;
      const option = directEntityOptions.find((opt) => opt._id === selectedEntityId);
      entityName = option?.name || `${selectedTopLevel} #${selectedEntityId}`;
      entityId = Number(selectedEntityId);
    } else {
      // For use-case or framework, get the type and actual entity_id from sub-entity
      const subEntity = subEntities.find((s) => s._id === selectedEntityId);
      entityType = subEntity?.type as EntityType;
      entityName = subEntity?.name || `Sub-entity #${selectedEntityId}`;
      entityId = subEntity?.entity_id;
    }

    const newLink: EntityLink = {
      entity_id: entityId,
      entity_type: entityType,
      entity_name: entityName,
    };

    // Check for duplicates
    const isDuplicate = value.some(
      (link) =>
        link.entity_id === newLink.entity_id &&
        link.entity_type === newLink.entity_type
    );

    if (!isDuplicate) {
      onChange([...value, newLink]);
    }

    // Reset selection
    setSelectedTopLevel("");
    setSelectedProject("");
    setSelectedFramework("");
    setSelectedEntityId("");
  };

  // Handle removing an entity link (marks as pending removal)
  const handleRemoveLink = (index: number) => {
    const linkToRemove = value[index];
    // Add to pending removals for strikethrough display
    setPendingRemovals((prev) => [...prev, linkToRemove]);
    // Remove from actual value
    const newLinks = value.filter((_, i) => i !== index);
    onChange(newLinks);
  };

  // Handle undoing a pending removal
  const handleUndoRemove = (link: EntityLink) => {
    // Remove from pending removals
    setPendingRemovals((prev) =>
      prev.filter(
        (l) =>
          !(l.entity_id === link.entity_id && l.entity_type === link.entity_type)
      )
    );
    // Add back to value
    onChange([...value, link]);
  };

  // Get display name for entity type
  const getEntityTypeDisplayName = (type: EntityType): string => {
    const displayNames: Record<string, string> = {
      vendor: "Vendor",
      model: "Model",
      policy: "Policy",
      nist_subcategory: "NIST AI RMF",
      iso42001_subclause: "ISO 42001 Clause",
      iso42001_annexcategory: "ISO 42001 Annex",
      iso42001_assessment: "ISO 42001 Assessment",
      iso27001_subclause: "ISO 27001 Clause",
      iso27001_annexcontrol: "ISO 27001 Annex",
      iso27001_assessment: "ISO 27001 Assessment",
      eu_control: "EU AI Act Control",
      eu_subcontrol: "EU AI Act Subcontrol",
      eu_assessment: "EU AI Act Assessment",
    };
    return displayNames[type] || type;
  };

  // Render the appropriate dropdowns based on selection
  const renderSelectionDropdowns = () => {
    const dropdowns: React.ReactNode[] = [];

    // First dropdown - Entity Type
    dropdowns.push(
      <SelectComponent
        key="entity-type"
        id="entity-type-select"
        label=""
        placeholder="Select type"
        value={selectedTopLevel}
        items={ENTITY_TYPE_OPTIONS}
        onChange={(e: any) => setSelectedTopLevel(e.target.value)}
        disabled={disabled}
        sx={{
          width: "200px",
          backgroundColor: theme.palette.background.main,
        }}
      />
    );

    if (!selectedTopLevel) return dropdowns;

    // Direct entity selection (vendor, model, policy)
    if (["vendor", "model", "policy"].includes(selectedTopLevel)) {
      dropdowns.push(
        <SelectComponent
          key="direct-entity"
          id="direct-entity-select"
          label=""
          placeholder={`Select ${selectedTopLevel}`}
          value={selectedEntityId}
          items={directEntityOptions}
          onChange={(e: any) => setSelectedEntityId(e.target.value)}
          disabled={disabled || directEntityOptions.length === 0}
          sx={{
            width: "280px",
            backgroundColor: theme.palette.background.main,
          }}
        />
      );
    }

    // Use-case selection (Project → Framework → Sub-entity)
    if (selectedTopLevel === "use_case") {
      dropdowns.push(
        <SelectComponent
          key="project"
          id="project-select"
          label=""
          placeholder="Select use-case"
          value={selectedProject}
          items={projectOptions}
          onChange={(e: any) => setSelectedProject(e.target.value)}
          disabled={disabled || projectOptions.length === 0}
          sx={{
            width: "200px",
            backgroundColor: theme.palette.background.main,
          }}
        />
      );

      if (selectedProject) {
        dropdowns.push(
          <SelectComponent
            key="project-framework"
            id="project-framework-select"
            label=""
            placeholder="Select framework"
            value={selectedFramework}
            items={projectFrameworkOptions}
            onChange={(e: any) => setSelectedFramework(e.target.value)}
            disabled={disabled || projectFrameworkOptions.length === 0}
            sx={{
              width: "180px",
              backgroundColor: theme.palette.background.main,
            }}
          />
        );
      }

      if (selectedFramework && subEntities.length > 0) {
        dropdowns.push(
          <SelectComponent
            key="sub-entity"
            id="sub-entity-select"
            label=""
            placeholder={loadingEntities ? "Loading..." : "Select sub-entity"}
            value={selectedEntityId}
            items={subEntities}
            onChange={(e: any) => setSelectedEntityId(e.target.value)}
            disabled={disabled || loadingEntities}
            sx={{
              width: "280px",
              backgroundColor: theme.palette.background.main,
            }}
          />
        );
      }
    }

    // Framework (Organizational) selection (Framework → Sub-entity)
    if (selectedTopLevel === "framework") {
      dropdowns.push(
        <SelectComponent
          key="framework"
          id="framework-select"
          label=""
          placeholder="Select framework"
          value={selectedFramework}
          items={frameworkOptions}
          onChange={(e: any) => setSelectedFramework(e.target.value)}
          disabled={disabled || frameworkOptions.length === 0}
          sx={{
            width: "200px",
            backgroundColor: theme.palette.background.main,
          }}
        />
      );

      if (selectedFramework && subEntities.length > 0) {
        dropdowns.push(
          <SelectComponent
            key="sub-entity"
            id="sub-entity-select"
            label=""
            placeholder={loadingEntities ? "Loading..." : "Select sub-entity"}
            value={selectedEntityId}
            items={subEntities}
            onChange={(e: any) => setSelectedEntityId(e.target.value)}
            disabled={disabled || loadingEntities}
            sx={{
              width: "280px",
              backgroundColor: theme.palette.background.main,
            }}
          />
        );
      }
    }

    return dropdowns;
  };

  return (
    <Stack gap={theme.spacing(2)}>
      <Typography
        component="p"
        variant="body1"
        color={theme.palette.text.secondary}
        fontWeight={500}
        fontSize={"13px"}
        sx={{ margin: 0, height: "22px" }}
      >
        Linked Items
      </Typography>

      {/* Display existing links */}
      {(value.length > 0 || pendingRemovals.length > 0) && (
        <Stack gap={1} sx={{ mb: 1 }}>
          {/* Active links */}
          {value.map((link, index) => (
            <Box
              key={`${link.entity_type}-${link.entity_id}`}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 12px",
                backgroundColor: theme.palette.background.accent,
                borderRadius: theme.shape.borderRadius,
                fontSize: "13px",
              }}
            >
              <Box>
                <Typography
                  component="span"
                  sx={{
                    fontSize: "11px",
                    color: theme.palette.text.secondary,
                    marginRight: 1,
                  }}
                >
                  {getEntityTypeDisplayName(link.entity_type)}:
                </Typography>
                <Typography component="span" sx={{ fontSize: "13px" }}>
                  {link.entity_name || `#${link.entity_id}`}
                </Typography>
              </Box>
              <IconButton
                size="small"
                onClick={() => handleRemoveLink(index)}
                disabled={disabled}
                sx={{ padding: "2px" }}
              >
                <X size={14} />
              </IconButton>
            </Box>
          ))}

          {/* Pending removal links (strikethrough) */}
          {pendingRemovals.map((link) => (
            <Box
              key={`removed-${link.entity_type}-${link.entity_id}`}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 12px",
                backgroundColor: theme.palette.action?.disabledBackground || background.surface,
                borderRadius: theme.shape.borderRadius,
                fontSize: "13px",
                opacity: 0.7,
              }}
            >
              <Box>
                <Typography
                  component="span"
                  sx={{
                    fontSize: "11px",
                    color: theme.palette.text.disabled,
                    marginRight: 1,
                    textDecoration: "line-through",
                  }}
                >
                  {getEntityTypeDisplayName(link.entity_type)}:
                </Typography>
                <Typography
                  component="span"
                  sx={{
                    fontSize: "13px",
                    color: theme.palette.text.disabled,
                    textDecoration: "line-through",
                  }}
                >
                  {link.entity_name || `#${link.entity_id}`}
                </Typography>
                <Typography
                  component="span"
                  sx={{
                    fontSize: "11px",
                    color: theme.palette.error.main,
                    marginLeft: 1,
                    fontStyle: "italic",
                  }}
                >
                  (will be removed)
                </Typography>
              </Box>
              <IconButton
                size="small"
                onClick={() => handleUndoRemove(link)}
                disabled={disabled}
                sx={{
                  padding: "2px",
                  color: theme.palette.primary.main,
                }}
                title="Undo removal"
              >
                <RotateCcw size={14} />
              </IconButton>
            </Box>
          ))}
        </Stack>
      )}

      {/* Add new link - cascading dropdowns */}
      <Stack direction="row" spacing={2} alignItems="flex-end" flexWrap="wrap" gap={1}>
        {renderSelectionDropdowns()}

        {canAddLink && (
          <IconButton
            size="small"
            onClick={handleAddLink}
            disabled={disabled}
            sx={{
              backgroundColor: theme.palette.primary.main,
              color: "white",
              borderRadius: theme.shape.borderRadius,
              "&:hover": {
                backgroundColor: theme.palette.primary.dark,
              },
              height: "34px",
              width: "34px",
            }}
          >
            <Plus size={16} />
          </IconButton>
        )}
      </Stack>

      {/* Helper messages */}
      {selectedTopLevel === "use_case" && projectOptions.length === 0 && (
        <Typography
          sx={{
            fontSize: "12px",
            color: theme.palette.text.secondary,
            fontStyle: "italic",
          }}
        >
          No use-cases available
        </Typography>
      )}

      {selectedTopLevel === "framework" && frameworkOptions.length === 0 && (
        <Typography
          sx={{
            fontSize: "12px",
            color: theme.palette.text.secondary,
            fontStyle: "italic",
          }}
        >
          No organizational frameworks available
        </Typography>
      )}

      {selectedFramework && !loadingEntities && subEntities.length === 0 && (
        <Typography
          sx={{
            fontSize: "12px",
            color: theme.palette.text.secondary,
            fontStyle: "italic",
          }}
        >
          No sub-entities found for this framework
        </Typography>
      )}
    </Stack>
  );
};

export default EntityLinkSelector;
export type { EntityLink };
