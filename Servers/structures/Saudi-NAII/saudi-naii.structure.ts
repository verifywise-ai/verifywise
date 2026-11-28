import type { FrameworkStructure } from "../types";

/**
 * Saudi National AI Index (NAII), SDAIA-P123 version 1 (May 2025).
 *
 * The index has 3 pillars (Directions, Enablers, Outputs), 7 sub-pillars and
 * 23 domains. Level 1 is the sub-pillar, titled "<pillar>: <sub-pillar>"; level
 * 2 is the domain. Titles and descriptions follow the index document.
 *
 * `questions` come from the index's appendix, "National Artificial
 * Intelligence Index Questions, Supporting Evidence, and Acceptance Criteria":
 * each domain starts with SDAIA's question and its id (AI.AQ.*), followed by
 * what adoption levels 3, 4 and 5 require. Development and deployment has four
 * questions (AI.AQ.AP.1.1 to 1.4), each followed by one line for its levels.
 * `evidence_examples` are the appendix's acceptance evidence for levels 3 to
 * 5 with SDAIA's evidence codes (<question>.<level>.<item>); where the
 * appendix's evidence and criteria columns number an item differently, the
 * criteria column wins.
 *
 * The three Impact domains state the appendix's level 5 thresholds. The index
 * document's own section 3.2.1 puts them one domain apart (it gives the job
 * share and productivity gain under Operational efficiency); the appendix is
 * what SDAIA scores against.
 */
export const saudiNaiiStructure: FrameworkStructure = {
  id: 30,
  key: "saudi-naii",
  framework_type: "saudi_naii",
  displayName: "Saudi National AI Index (NAII)",
  tables: {
    l1_struct: "saudi_naii_sub_pillars_struct",
    l2_struct: "saudi_naii_domains_struct",
    l2_impl: "saudi_naii_domains",
    l2_risks: "saudi_naii_domains__risks",
  },
  cols: {
    l2_struct_parent: "sub_pillar_id",
    l2_impl_meta: "domain_meta_id",
    l2_risks_impl: "domain_id",
  },
  entity_types: {
    l2_impl: "domain",
  },
  source_labels: {
    domain: "Saudi NAII domains",
  },
  seed: {
    name: "Saudi National AI Index (NAII)",
    description:
      "SDAIA's National AI Index (SDAIA-P123, May 2025) measuring a government entity's readiness to adopt AI across 3 pillars, 7 sub-pillars and 23 domains, with results on six adoption levels from 0 (absence of capabilities) to 5 (pioneer). Each domain lists SDAIA's assessment question, what levels 3 to 5 require and the evidence SDAIA accepts",
    version: "1",
    is_organizational: true,
    hierarchy: {
      type: "two_level",
      level1_name: "Sub-pillar",
      level2_name: "Domain",
    },
    structure: [
      {
        title: "Directions: Strategy",
        description:
          "An ambitious strategy for integrating AI into the entity's operations that defines priorities, requirements, actions, timelines and the governance needed for sustainable implementation",
        order_no: 1,
        items: [
          {
            title: "Planning and performance",
            description:
              "An AI strategy and vision that serve as the enterprise reference for directing AI efforts toward measurable objectives and priority domains, link initiatives to enterprise objectives and align with national strategies and Saudi Vision 2030",
            order_no: 1,
            summary: "Set an AI strategy with measurable objectives",
            questions: [
              "AI.AQ.ST.1: Has the organization established and implemented a long-term AI strategy and vision, with a clear implementation roadmap and a defined framework to measure its success and impact (e.g., KPIs, business outcomes)?",
              "Level 3: Is a formally approved AI strategy being implemented, with a defined implementation timeline and KPIs partially linked to organizational objectives?",
              "Level 4: Is the strategy fully implemented and under active review, with pilot-to-production deployments within one year and KPIs tracked systematically?",
              "Level 5: Is the strategy institutionalized, continuously reviewed and integrated with national digital transformation goals, with success measured through a framework aligned with cross-sector impact?",
            ],
            evidence_examples: [
              "Officially approved AI strategy or roadmap (ST.1.3.1)",
              "Implementation roadmap or delivery plan (ST.1.3.2)",
              "Approved performance or measurement indicators aligned with some strategic KPIs (ST.1.3.3)",
              "Delivery milestone reports (ST.1.4.1)",
              "AI initiatives implementation dashboard (ST.1.4.2)",
              "Evidence of regular review cycles and reports (ST.1.4.3)",
              "KPI dashboards linked directly to the strategy (ST.1.4.4)",
              "Institutionalized AI strategy document with periodic updates (ST.1.5.1)",
              "Strategic alignment documents showing the link to national programs (ST.1.5.2)",
              "Success frameworks that show AI's contribution to national KPIs (ST.1.5.3)",
              "Reports or audits showing updates based on results and shifting priorities (ST.1.5.4)",
            ],
          },
          {
            title: "Initiatives",
            description:
              "Operational and experimental initiatives that translate the strategic vision into practical projects with tangible impact, such as process automation and intelligent recommendations",
            order_no: 2,
            summary: "Turn the AI strategy into measured, reviewed initiatives",
            questions: [
              "AI.AQ.ST.2: Has the government entity implemented AI initiatives with measurable outcomes and established review mechanisms that align with public sector priorities and strategic direction?",
              "Level 3: Are a moderate number of AI initiatives operational, with a documented measurement framework aligned with strategic priorities and quarterly reviews that inform adjustments?",
              "Level 4: Are AI initiatives integrated across departments, with KPIs for each initiative and monthly performance tracking aligned with national digital transformation agendas?",
              "Level 5: Are AI initiatives scaled across the entity, continuously optimized, aligned with Vision 2030 and reported to the relevant oversight authorities?",
            ],
            evidence_examples: [
              "Registry or log of active AI projects (ST.2.3.1)",
              "Initiative cards or other documents describing each initiative (ST.2.3.2)",
              "Quarterly review reports on initiative performance (ST.2.3.3)",
              "Metrics linked to KPIs (ST.2.3.4)",
              "Dashboards tracking KPIs (ST.2.4.1)",
              "Reports from oversight bodies (ST.2.4.2)",
              "Departmental action plans updated based on review results (ST.2.4.3)",
              "Documentation of coordination with entities related to the initiatives (ST.2.5.1)",
              "Integrated platform for monitoring AI initiatives (ST.2.5.2)",
              "Reports demonstrating measurable impact on national performance indicators (ST.2.5.3)",
              "Policies for review and continuous improvement (ST.2.5.4)",
              "Follow-up reports from higher supervisory authorities (ST.2.5.5)",
            ],
          },
          {
            title: "Budget",
            description:
              "A dedicated budget for implementing AI initiatives within the entity, which turns plans into outcomes and reflects a strategic commitment to digital transformation",
            order_no: 3,
            summary: "Fund AI through a dedicated share of the total budget",
            questions: [
              "AI.AQ.ST.3: Has the government entity allocated a dedicated AI budget, including amounts dedicated to developing solutions or prototypes, and aligned it with strategic priorities?",
              "Level 3: Is a dedicated AI budget of 2% to 4.9% of the total budget allocated in the annual budget planning?",
              "Level 4: Is the AI budget 5% to 6.9% of the total budget, integrated into financial planning, aligned with strategic programs and tracked regularly?",
              "Level 5: Is the AI budget 7% or more of the total budget, an integrated part of the entity's strategic and financial plans?",
            ],
            evidence_examples: [
              "Detailed budget allocation tables (ST.3.3.1)",
              "Budget alignment documents (ST.3.3.2)",
              "Semi-annual and annual review reports (ST.3.3.3)",
              "Multi-year financial plans or forecasts (ST.3.4.1)",
              "Strategic documents aligning AI spending with institutional objectives (ST.3.4.2)",
              "Performance dashboards linked to AI investment (ST.3.4.3)",
              "Documents demonstrating alignment with national or sectoral priorities (ST.3.5.1)",
              "Reports on the efficiency of AI budget use (ST.3.5.2)",
              "Reports confirming the financial return on AI investments (ST.3.5.3)",
            ],
          },
        ],
      },
      {
        title: "Directions: Governance",
        description:
          "Frameworks, policies and enterprise structures that regulate the development and use of AI, define roles, responsibilities and decision-making, and keep its use compliant, safe and responsible through periodic reviews",
        order_no: 2,
        items: [
          {
            title: "Frameworks and policies",
            description:
              "Regulatory frameworks and policies that form the foundation of effective AI governance, support the organized use of smart technologies, strengthen public trust and consider cultural and developmental specificities",
            order_no: 1,
            summary: "Adopt an AI governance framework across the entity",
            questions: [
              "AI.AQ.GO.1: Has the entity adopted governance frameworks and models to oversee AI projects within the organization?",
              "Level 3: Is an organization-wide AI governance framework implemented, followed by key departments and reviewed periodically, for example annually or semi-annually?",
              "Level 4: Are tailored governance models applied consistently across the entity, with defined roles, review cycles and compliance triggers for AI initiatives?",
              "Level 5: Is the governance model updated periodically against benchmarks and evolving standards, with the entity leading nationally in AI governance?",
            ],
            evidence_examples: [
              "Approved AI governance framework (GO.1.3.1)",
              "Departmental-level adoption documentation (GO.1.3.2)",
              "Customized governance documents with specified versions (GO.1.4.1)",
              "Review logs or governance dashboards (GO.1.4.2)",
              "Records of applied frameworks across departments (GO.1.4.3)",
              "Administrative letters or decisions (GO.1.4.4)",
              "Governance framework aligned with national AI guidelines (GO.1.5.1)",
              "Evaluation reports and external benchmarking studies (GO.1.5.2)",
              "Regular framework review documentation (GO.1.5.3)",
              "Additional evidence supporting national leadership (GO.1.5.4)",
            ],
          },
          {
            title: "Regulatory enablement",
            description:
              "A regulatory unit dedicated to AI within the entity, with clearly defined mandates, to strengthen governance and enterprise transformation",
            order_no: 2,
            summary: "Establish an AI unit that reports to senior leadership",
            questions: [
              "AI.AQ.GO.2: Has the entity established a dedicated AI unit or office, and at what organizational level does it report?",
              "Level 3: Does the AI unit report to an official at the N-3 level, such as a general director?",
              "Level 4: Does the AI unit report to an official at the N-2 level, such as a deputy assistant?",
              "Level 5: Does the AI unit report to an official at the N-1 level, such as a minister or an equivalent senior leader?",
            ],
            evidence_examples: [
              "Organizational structure of the entity (GO.2.3.1, GO.2.4.1, GO.2.5.1)",
              "Job descriptions of the AI office (GO.2.3.2, GO.2.4.2, GO.2.5.2)",
              "Administrative decisions (GO.2.3.3, GO.2.4.3, GO.2.5.3)",
              "Strategic plans outlining the role of the unit (GO.2.5.4)",
            ],
          },
          {
            title: "Reliability and safety",
            description:
              "The accuracy and stability of AI systems, ensured through control procedures, adherence to national standards and mitigation of potential risks, in alignment with the relevant regulatory frameworks",
            order_no: 3,
            summary: "Assess, track and mitigate AI safety and reliability risks",
            questions: [
              "AI.AQ.GO.3: To what extent does the entity systematically assess AI project risks to ensure the review, classification, and tracking of risks related to safety and reliability (such as AI system bias) across different AI use cases?",
              "Level 3: Are standardized risk assessment templates used, with risks mapped to specific AI use cases, results documented and mitigation actions planned?",
              "Level 4: Are risk assessments embedded in the AI life cycle (development, deployment, monitoring), with risks reviewed regularly in documented meetings?",
              "Level 5: Is AI risk management automated and aligned with national frameworks, with trust and safety risks tracked on dashboards and reviewed across departments?",
            ],
            evidence_examples: [
              "Approved and in-use AI risk templates (GO.3.3.1)",
              "Risk registers linked to specific systems or services (GO.3.3.2)",
              "Documentation of mitigation plans or actions (GO.3.3.3)",
              "AI life cycle workflows with embedded risk checkpoints (GO.3.4.1)",
              "Governance meeting minutes with risk review discussions (GO.3.4.2)",
              "Risk dashboards in use (GO.3.4.3, GO.3.5.4)",
              "Periodic follow-up reports (GO.3.4.4)",
              "Automated AI risk monitoring tools (GO.3.5.1)",
              "Risk intelligence reports issued periodically (GO.3.5.2)",
              "Evidence of alignment with national standards (GO.3.5.3)",
              "Periodic documents (GO.3.5.5)",
            ],
          },
          {
            title: "Regulatory compliance",
            description:
              "Regulations embedded into daily operations rather than treated as a formality, including the regulatory frameworks issued by SDAIA such as the Generative AI Guidelines and the Deepfake Guidelines",
            order_no: 4,
            summary: "Apply SDAIA's principles and earn AI Ethics badges",
            questions: [
              "AI.AQ.GO.4: To what extent does the entity comply with the implementation of AI regulations and guidelines (such as the Generative AI Principles for Government Entities and the Deepfake Principles)?",
              "Level 3: Does the entity maintain compliance with regulatory frameworks, train staff across the organization on the Generative AI and Deepfake Principles, and hold SDAIA AI Ethics badges for 60% of its initiatives?",
              "Level 4: Does the entity update its practices as SDAIA issues new regulations, take part in regulatory surveys, and hold AI Ethics badges for 80% of its initiatives?",
              "Level 5: Is the entity a national model that contributes to AI governance frameworks, takes part in regulatory surveys regularly, and holds AI Ethics badges for all of its initiatives?",
            ],
            evidence_examples: [
              "Approved AI governance framework (GO.4.3.1)",
              "Governance implementation documents at the departmental level (GO.4.3.2)",
              "SDAIA AI Ethics badge certificates for AI products or initiatives (GO.4.3.3, GO.4.4.5, GO.4.5.5)",
              "Customized governance documents with specified versions (GO.4.4.1)",
              "Review logs or governance dashboards (GO.4.4.2)",
              "Records documenting the implementation of frameworks (GO.4.4.3)",
              "Administrative letters making compliance with frameworks mandatory (GO.4.4.4)",
              "Governance framework aligned with national AI guidelines (GO.4.5.1)",
              "Evaluation reports and external benchmarking studies (GO.4.5.2)",
              "Regular framework review documentation (GO.4.5.3)",
              "Additional evidence supporting national leadership (GO.4.5.4)",
            ],
          },
        ],
      },
      {
        title: "Enablers: Data",
        description:
          "The data foundation of AI applications: a robust enterprise structure, data quality, and privacy and security, supporting the sustainability and efficiency of AI models",
        order_no: 3,
        items: [
          {
            title: "Availability and accessibility",
            description:
              "Data that is available and easy to access through data discovery tools, data catalogs and automated updates that keep it current",
            order_no: 1,
            summary: "Make training data discoverable, current and access-controlled",
            questions: [
              "AI.AQ.DA.1: How does the entity ensure that AI training data is available, regularly updated, and identifiable through official controls aligned with data-related regulatory tools?",
              "Level 3: Is there a secure access control system for data, updated quarterly and available through an internal searchable platform, with a partly documented data-sharing mechanism that complies with the Personal Data Protection Law?",
              "Level 4: Is access to datasets secure and automated, with data updated monthly or near real time and a widely used internal index?",
              "Level 5: Is there a role-based, real-time data access system across departments with automated updates and detailed audit logs, and is compliance with data-related regulatory tools monitored through the Data Management Office?",
            ],
            evidence_examples: [
              "System access permission matrix (DA.1.3.1)",
              "Screenshots of the searchable data catalog (DA.1.3.2)",
              "Quarterly update reports (DA.1.3.3)",
              "Data processing documents (DA.1.3.4)",
              "Audit logs of system access (DA.1.4.1)",
              "Monthly data update reports (DA.1.4.2)",
              "Usage metrics of the internal catalog (DA.1.4.3)",
              "Privacy compliance review reports (DA.1.4.4)",
              "Document showing the system's real-time access capability (DA.1.5.1)",
              "Document on entity-wide catalog analytics access (DA.1.5.2)",
              "Dashboards from the Data Management Office showing compliance with data-related regulatory tools (DA.1.5.3)",
            ],
          },
          {
            title: "Quality and integration",
            description:
              "Data quality that supports model accuracy: tracking data sources, documenting usage rights, conducting legal reviews of data use and complying with intellectual property rights",
            order_no: 2,
            summary: "Validate training data, labels and sources",
            questions: [
              "AI.AQ.DA.2: How does the entity ensure the quality, integrity, and governance of the datasets used to train AI models, including the accuracy of labels, data sources (both open and private), and the handling of missing or inconsistent data?",
              "Level 3: Are dataset quality and integrity assessed with automated tools, all data sources reviewed and approved, and data inconsistencies logged through exception handling?",
              "Level 4: Is label accuracy assured with statistical validation, do all data sources go through legal and risk review, and does a quality assurance pipeline feed model results back into the datasets?",
              "Level 5: Is dataset governance automated and centralized, with real-time quality assessment and correction, and dataset use tracked with transparent sourcing, legal traceability and audits?",
            ],
            evidence_examples: [
              "Reports from automated validation tools (DA.2.3.1)",
              "Approved intake forms for datasets (DA.2.3.2)",
              "Logs showing exception handling of data quality issues (DA.2.3.3)",
              "Statistical audit reports on labeled datasets (DA.2.4.1)",
              "Completed legal and risk evaluation forms (DA.2.4.2)",
              "Documentation of data quality improvements (DA.2.4.3)",
              "Dashboards from a centralized data platform (DA.2.5.1)",
              "Dataset usage logs (DA.2.5.2)",
              "System-generated audit trail reports (DA.2.5.3)",
            ],
          },
          {
            title: "Reliability",
            description:
              "Data continuity and trust, supported by distributed cloud storage and backup solutions for disaster recovery",
            order_no: 3,
            summary: "Back up, recover and version training data",
            questions: [
              "AI.AQ.DA.3: How does the entity ensure secure, reliable, and version-controlled storage of AI training data, including backup, disaster recovery, and dataset versioning systems?",
              "Level 3: Are entity-wide storage solutions in use, with daily backups, partial disaster recovery planning and dataset version tracking tools adopted across teams?",
              "Level 4: Are backup storage systems monitored, with disaster recovery across multiple sites and dataset versioning standardized across teams?",
              "Level 5: Is storage cloud-integrated and redundant, with automated monitoring, real-time failover, immutable version control and fully traceable dataset lineage?",
            ],
            evidence_examples: [
              "Daily backup system reports (DA.3.3.1)",
              "Partial disaster recovery plan (DA.3.3.2)",
              "Usage logs of versioning tools (DA.3.3.3)",
              "Disaster recovery test report (DA.3.4.1)",
              "System architecture diagram with redundancy (DA.3.4.2)",
              "Team-wide versioning standards and sample history logs (DA.3.4.3)",
              "Documentation of cloud-based storage (DA.3.5.1)",
              "Logs from automated backup and failover testing (DA.3.5.2)",
              "Immutable logs of dataset history with timestamps and access control (DA.3.5.3)",
            ],
          },
        ],
      },
      {
        title: "Enablers: Infrastructure",
        description:
          "Digital resources such as servers, cloud and data centers that enable the development and operation of AI applications, kept flexible, scalable and secure for consistent performance",
        order_no: 4,
        items: [
          {
            title: "Technical standards",
            description:
              "Compatibility, performance and sustainability through a scalable, flexible infrastructure that can accommodate growth and integrates with national platforms",
            order_no: 1,
            summary: "Standardize and scale AI infrastructure",
            questions: [
              "AI.AQ.IN.1: To what extent has the entity standardized and scaled its AI infrastructure, including data pipelines, storage systems, orchestration tools, and mechanisms for flexible resource provisioning?",
              "Level 3: Are AI models trained or run regularly on scalable infrastructure with computing accelerators (GPU or TPU), with internal monitoring and usage tracking?",
              "Level 4: Is the infrastructure high-performance and scalable (on-premises or hybrid), supported by optimization tools such as TensorRT or ONNX, with tasks managed through distributed monitoring?",
              "Level 5: Does the entity use advanced infrastructure with dedicated AI processors for large-scale training and inference, and schedule tasks across environments by the type of input data?",
            ],
            evidence_examples: [
              "Performance monitoring reports (IN.1.3.1)",
              "Model execution logs using computing accelerators (IN.1.3.2)",
              "Technical infrastructure documentation (IN.1.3.3)",
              "Official approval from the relevant authority (IN.1.3.4)",
              "Infrastructure architecture diagrams (IN.1.4.1)",
              "Evidence of distributed training or deployment systems (IN.1.4.2)",
              "Evidence of performance optimization tool usage (IN.1.4.3)",
              "Official approval from the entity (IN.1.4.4)",
              "Reports from task scheduling systems (IN.1.5.1)",
              "Documented use of high-performance computing processors (IN.1.5.2)",
              "Automated logs for load management and infrastructure scaling (IN.1.5.3)",
              "Official endorsement (IN.1.5.4)",
            ],
          },
          {
            title: "Availability and monitoring",
            description:
              "A flexible internal high-performance computing infrastructure that supports AI, with scalability, operational efficiency and regular hardware upgrades",
            order_no: 2,
            summary: "Run AI workloads on accelerated, high-performance computing",
            questions: [
              "AI.AQ.IN.2: To what extent has the entity adopted an AI-enabling infrastructure that is scalable and high-performance, featuring advanced computing resources or accelerated technologies to support AI workloads?",
              "Level 3: Is there high-performance computing infrastructure with periodic hardware upgrades, and do 31% to 60% of workloads benefit from acceleration?",
              "Level 4: Is internal high-performance computing flexible and upgraded periodically, with 60% to 85% of workloads on AI-specific acceleration?",
              "Level 5: Do more than 85% of workloads rely on AI acceleration, on a flexible internal high-performance architecture that is updated periodically?",
            ],
            evidence_examples: [
              "Reports showing the percentage of accelerated workloads (IN.2.3.1)",
              "Asset inventory for GPU or TPU supported operations (IN.2.3.2)",
              "Logs confirming shared or cluster-based acceleration (IN.2.3.3)",
              "Inventory of AI workloads using accelerated execution (IN.2.4.1)",
              "Device usage governance documents (IN.2.4.2)",
              "Dashboards monitoring acceleration, access and resource provisioning (IN.2.4.3)",
              "Central acceleration infrastructure policies (IN.2.5.1)",
              "Metrics showing near-complete coverage of AI acceleration devices (IN.2.5.2)",
              "Usage logs (IN.2.5.3)",
            ],
          },
          {
            title: "Operational resilience",
            description:
              "Service continuity with downtime not exceeding 30 minutes a year, and predictive analytics used to reduce potential outages",
            order_no: 3,
            summary: "Keep downtime under 30 minutes a year",
            questions: [
              "AI.AQ.IN.3: To what extent does the entity monitor the availability and uptime of AI applications, and to what extent are internal monitoring mechanisms (such as incident logs and performance dashboards) implemented to ensure continuous service delivery?",
              "Level 3: Is the average annual downtime of each AI application between 1 and 5 hours, with monitoring dashboards and incident response that also cover hybrid environments?",
              "Level 4: Is the annual downtime of each AI application under one hour, with real-time monitoring, automated alerts and defined escalation paths?",
              "Level 5: Is the annual downtime of each AI application 30 minutes or less, with uptime predicted and maintained through analytics and AI-powered fault detection?",
            ],
            evidence_examples: [
              "Uptime and downtime reports (IN.3.3.1)",
              "Informational monitoring dashboards (IN.3.3.2)",
              "Incident logs (IN.3.3.3)",
              "Hybrid computing environment monitoring guides (IN.3.3.4)",
              "Incident response procedure manual (IN.3.3.5)",
              "Uptime reports (IN.3.4.1)",
              "Automated alert logs (IN.3.4.2)",
              "Approved escalation path map (IN.3.4.3)",
              "Real-time monitoring system screenshots (IN.3.4.4)",
              "Incident follow-up reports or minutes (IN.3.4.5)",
              "Certified uptime reports (IN.3.5.1)",
              "Fault prediction system logs (IN.3.5.2)",
              "Reports on AI technologies used in fault detection (IN.3.5.3)",
              "Dashboards showing predicted against actual uptime (IN.3.5.4)",
              "Monitoring team meeting minutes with improvement decisions based on predictive analytics (IN.3.5.5)",
            ],
          },
        ],
      },
      {
        title: "Enablers: Human capabilities",
        description:
          "Specialized expertise in AI design, development, operation and governance: attracting talent, training professionals, building career paths, providing a motivating work environment and fostering academic partnerships",
        order_no: 5,
        items: [
          {
            title: "Headcount and diversity",
            description:
              "Diverse teams with deep expertise, aligned with the National Occupational Standard Framework for Data and Artificial Intelligence",
            order_no: 1,
            summary: "Build a diverse AI team mapped to national occupational standards",
            questions: [
              "AI.AQ.HC.1: To what extent has the government entity established a dedicated AI team, defined its functional scope, provided it with a diverse workforce, and aligned the development of AI roles with the National Occupational Standard Framework for Data and AI?",
              "Level 3: Does an operational unit have 11 to 17 AI roles or a diversity rate of 21% to 30%, with plans for 6 to 10 new roles and most roles aligned with the National Occupational Standard Framework?",
              "Level 4: Does an AI department have 18 to 30 roles across divisions or a diversity rate above 30%, with all roles aligned with the framework and plans for more than 10 new roles?",
              "Level 5: Does the entity's AI workforce exceed 30 roles or keep a diversity rate above 30% under strategic oversight, with all roles aligned with the framework and national talent development programs?",
            ],
            evidence_examples: [
              "List of approved roles within the operational unit (HC.1.3.1)",
              "Workforce diversity report (HC.1.3.2, HC.1.4.2)",
              "Evidence that technical and compliance aspects are included (HC.1.3.3)",
              "Plan for establishing new roles (HC.1.3.4)",
              "Role alignment document with the National Occupational Standard Framework (HC.1.3.5, HC.1.4.3)",
              "Department structure with 18 to 30 roles (HC.1.4.1)",
              "Long-term human resources strategy (HC.1.4.4)",
              "Approved job descriptions (HC.1.4.5)",
              "Administrative distribution reports (HC.1.4.6)",
              "Entity-level record of AI roles (HC.1.5.1)",
              "Sustainable workforce diversity report (HC.1.5.2)",
              "Evidence of alignment with SDAIA and Ministry of Human Resources talent initiatives (HC.1.5.3)",
              "Strategic oversight plan (HC.1.5.4)",
              "Updated organizational chart (HC.1.5.5)",
              "Periodic follow-up reports (HC.1.5.6)",
            ],
          },
          {
            title: "Professional development",
            description:
              "A sustainable training plan that supports continuous learning, is aligned with job roles and offers accredited certifications in the field",
            order_no: 2,
            summary: "Train and certify AI staff by role",
            questions: [
              "AI.AQ.HC.2: To what extent does the entity provide structured and measurable training programs, certification opportunities, and career development support for professional AI specialists, including alignment with national competency standards (such as the National Occupational Standard Framework for Data and AI)?",
              "Level 3: Is there a formal training and certification program with clear learning paths, tracked career development plans and some alignment with national competency standards?",
              "Level 4: Is AI training part of the workforce development strategy, with mandatory certifications tracked for each role and development aligned with SDAIA's National Occupational Standard Framework?",
              "Level 5: Is AI skill development institutionalized, with career paths for all AI specialists, tracked performance indicators, updated skill matrices and a leading national role in alignment?",
            ],
            evidence_examples: [
              "Official training program document (HC.2.3.1)",
              "Career development strategy for AI professionals (HC.2.3.2)",
              "Evidence of alignment with national competency standards (HC.2.3.3)",
              "Records or periodic reports (HC.2.3.4)",
              "Workforce development strategy (HC.2.4.1)",
              "Competency matrix by job role (HC.2.4.2)",
              "Mandatory certification policy by role (HC.2.4.3)",
              "Training and certification tracking records or system (HC.2.4.4)",
              "Individual career development plans (HC.2.4.5)",
              "Detailed alignment document with the National Occupational Standard Framework (HC.2.4.6)",
              "Performance measurement reports for learning and certification (HC.2.4.7)",
              "Institutional skill development strategy (HC.2.5.1)",
              "Updated skill matrix for all roles (HC.2.5.2)",
              "Individual career development paths for all specialists (HC.2.5.3)",
              "Institutional performance indicators report on AI skill development (HC.2.5.4)",
              "National alignment document (HC.2.5.5)",
              "National participation and feedback document (HC.2.5.6)",
              "Skill development governance plan (HC.2.5.7)",
            ],
          },
          {
            title: "Academic collaboration",
            description:
              "Partnerships with universities and institutes that supply qualified talent, create an applied learning environment and attract talented students through training programs and technology competitions",
            order_no: 3,
            summary: "Partner with universities and plan AI hiring",
            questions: [
              "AI.AQ.HC.3: Does the entity have a structured approach for recruiting AI trainees and maintaining partnerships with universities, or a dedicated roadmap for AI-focused hiring aimed at developing future national talent in the field?",
              "Level 3: Are internship programs combined with university partnerships, such as memoranda of understanding or cooperation agreements, with mid-term AI hiring plans that have KPIs?",
              "Level 4: Is academic collaboration structured through a defined talent development pathway and curriculum alignment, with periodic progress tracking?",
              "Level 5: Is there a comprehensive roadmap with detailed milestones and long-term academic collaboration aligned with national AI goals?",
            ],
            evidence_examples: [
              "Signed memoranda of understanding or partnership contracts with academic institutions (HC.3.3.1)",
              "Joint training plan (HC.3.3.2)",
              "Mid-term hiring plan covering 2 to 4 years (HC.3.3.3)",
              "Strategic document for developing an academic pathway (HC.3.4.1)",
              "Curriculum alignment plan (HC.3.4.2)",
              "Semi-annual academic collaboration progress report (HC.3.4.3)",
              "Approved strategic document (HC.3.5.1)",
              "Long-term cooperation agreements of more than 5 years (HC.3.5.2)",
              "Annual performance reports (HC.3.5.3)",
            ],
          },
          {
            title: "Job stability",
            description:
              "Retention of specialized AI talent by analyzing the causes of attrition, developing professional and financial incentives and aligning HR policies with the National Occupational Standard Framework",
            order_no: 4,
            summary: "Retain AI talent through a measured retention strategy",
            questions: [
              "AI.AQ.HC.4: What mechanisms are in place to reduce turnover and retain AI talents in the organization?",
              "Level 3: Are formal retention programs, such as career paths and training incentives, offered regularly to AI professionals?",
              "Level 4: Is retention part of a comprehensive workforce strategy for AI roles, with KPIs such as turnover reduction targets and exit analysis?",
              "Level 5: Is a data-driven retention strategy in place, aligned with government directions, continuously improved and fully compliant with the National Occupational Standard Framework?",
            ],
            evidence_examples: [
              "Formal retention program approved by the head of the AI office or department (HC.4.3.1)",
              "Integrated retention strategy approved by the head of the AI office or department (HC.4.4.1)",
              "Advanced retention strategy approved by the head of the entity (HC.4.5.1)",
            ],
          },
        ],
      },
      {
        title: "Outputs: Applications",
        description:
          "In-house capabilities to develop AI-based products and applications, one of the most significant indicators of enterprise AI maturity",
        order_no: 6,
        items: [
          {
            title: "Development and deployment",
            description:
              "The number of AI applications developed, and the development and deployment of intelligent applications tailored to the entity's needs through an internal development environment that supports model life cycle management with frameworks such as MLOps",
            order_no: 1,
            summary: "Identify use cases, build models and run AI applications",
            questions: [
              "AI.AQ.AP.1.1: What methodology does the entity follow to identify AI use cases, detail them, and translate them into business requirements documents?",
              "AP.1.1 levels 3 to 5: Are use cases identified against approved criteria, with a documented list and business requirements documents (level 3), through a detailed methodology with specifications for each use case (level 4), and in line with international best practices and standards (level 5)?",
              "AI.AQ.AP.1.2: To what extent does the entity develop AI models internally, and to what extent does it follow standardized processes or frameworks to guide their development, training, and deployment?",
              "AP.1.2 levels 3 to 5: Are open-source models adapted to each use case, with procedures for version updates and performance evaluation (level 3), and are some models (level 4) or all models (level 5) built through fully automated, governed pipelines that cover the whole model life cycle?",
              "AI.AQ.AP.1.3: To what extent does the entity distinguish between open-source and commercial AI tools and manage their use for model development purposes?",
              "AP.1.3 levels 3 to 5: Are tools approved through a governance committee or formal process (level 3), kept in an updated organization-wide inventory with periodically reviewed evaluation criteria (level 4), and are all tools, licenses and risks tracked automatically (level 5)?",
              "AI.AQ.AP.1.4: How many AI applications, solutions, or products are currently activated and in actual use within the entity?",
              "AP.1.4 levels 3 to 5: Are 5 to 7 AI applications active across several units (level 3), 8 to 10 fully operational across departments (level 4), or more than 10 fully operational and institutionally adopted (level 5)?",
            ],
            evidence_examples: [
              "Structured list of use cases (AP.1.3.1, AP.1.4.1, AP.1.5.1)",
              "Approved criteria for identifying use cases (AP.1.3.2, AP.1.4.2, AP.1.5.2)",
              "Use case timeline document (AP.1.3.3, AP.1.4.3, AP.1.5.3)",
              "Completed business requirements documents, for at least one use case at level 3 and for all use cases from level 4 (AP.1.3.4, AP.1.4.4, AP.1.5.4)",
              "Feasibility assessment for use cases (AP.1.4.5, AP.1.5.5)",
              "Approved methodology for selecting use cases (AP.1.4.6, AP.1.5.6)",
              "Decisions resulting from use case evaluations (AP.1.4.7, AP.1.5.7)",
              "Record of amendments and updates (AP.1.5.8)",
              "Future plans and recommendations (AP.1.5.9)",
              "Approved document listing the models used, their sources and licenses (AP.2.3.1, AP.2.4.1, AP.2.5.1)",
              "Approved documentation of developed models: use case, model domain, algorithm and category (AP.2.3.2, AP.2.4.2, AP.2.5.2)",
              "Model update procedure with review steps and license verification (AP.2.3.3, AP.2.4.3, AP.2.5.3)",
              "Performance measurement framework comparing updated and previous models (AP.2.3.4, AP.2.4.4, AP.2.5.4)",
              "Development phase roadmap for internally developed models (AP.2.3.5, AP.2.4.5, AP.2.5.5)",
              "Working methodology document (AP.2.3.6, AP.2.4.6, AP.2.5.6)",
              "Sample outputs from the developed models (AP.2.3.7, AP.2.4.7, AP.2.5.7)",
              "Approved model life cycle governance document (AP.2.4.8, AP.2.5.8)",
              "Governance policy review plan (AP.2.5.9)",
              "Audit reports on compliance rates (AP.2.5.10)",
              "Policy improvement actions (AP.2.5.11)",
              "Final approved list of tools in use (AP.3.3.1, AP.3.3.3)",
              "Tool evaluation and selection criteria (AP.3.3.2)",
              "Tool evaluation template (AP.3.3.4)",
              "Updated tools inventory (AP.3.4.1, AP.3.5.1)",
              "Tool performance evaluation reports (AP.3.4.2, AP.3.5.2)",
              "Actions taken based on evaluations (AP.3.4.3)",
              "Evaluation schedule (AP.3.4.4)",
              "Tool improvement plan (AP.3.5.3)",
              "Document linking tool usage to organizational objectives (AP.3.5.4)",
              "Evidence of improvement implementation (AP.3.5.5)",
              "Proof of continuous improvement (AP.3.5.6)",
              "AI applications or solutions profile (AP.4.3.1, AP.4.4.1, AP.4.5.1)",
              "Application usage evidence (AP.4.3.2, AP.4.4.2, AP.4.5.2)",
              "Application integration mechanisms (AP.4.3.3, AP.4.4.3, AP.4.5.3)",
              "Integration implementation document (AP.4.3.4, AP.4.4.4, AP.4.5.4)",
              "Application deployment plans (AP.4.4.5)",
              "Performance and impact evaluation reports (AP.4.4.6, AP.4.5.5)",
              "Application improvement documentation (AP.4.5.6)",
            ],
          },
          {
            title: "Privacy and security",
            description:
              "A security and privacy by design approach that builds in encryption and access controls from the earliest stages of analysis, complies with national regulations such as the Personal Data Protection Law, and keeps immediate recovery plans and periodic risk measurement",
            order_no: 2,
            summary: "Secure AI systems and plan for their recovery",
            questions: [
              "AI.AQ.AP.2: How does the entity ensure the security, privacy, and continuity of its AI systems and data, including disaster recovery plans and preventive measures?",
              "Level 3: Do comprehensive protection measures exist for AI systems, even if applied manually, with security and business continuity plans that cover AI assets and models?",
              "Level 4: Are AI security policies automated and governed by internal frameworks, with encryption, access controls and privacy protections enforced across all AI processes?",
              "Level 5: Are AI security, privacy and disaster recovery aligned with national frameworks and automated across environments, with proactive scenario testing done regularly?",
            ],
            evidence_examples: [
              "Documented AI disaster recovery plan (AP.5.3.1)",
              "List of systems or components covered by the plan (AP.5.3.2)",
              "Security audit results or vulnerability assessment reports (AP.5.3.3)",
              "Periodic AI security review reports (AP.5.4.1)",
              "Updated policies and procedures (AP.5.4.2)",
              "Security training and incident response log (AP.5.4.3)",
              "Alignment report with national cybersecurity or disaster recovery standards (AP.5.5.1)",
              "AI application improvement plan (AP.5.5.2)",
              "Evidence of advanced security testing (AP.5.5.3)",
            ],
          },
          {
            title: "Operation and management",
            description:
              "Tracking model usage and linking performance to enterprise indicators such as service quality and cost reduction, with intelligent monitoring for proactive improvement and analytical reports to senior management",
            order_no: 3,
            summary: "Run and monitor AI applications across departments",
            questions: [
              "AI.AQ.AP.3: To what extent does the entity commit to deploying and managing AI applications in production environments, including monitoring their performance and tracking adoption results?",
              "Level 3: Are AI applications deployed and monitored regularly across 2 to 4 departments, with results reviewed against organizational goals?",
              "Level 4: Are AI applications integrated into operations across 4 to 6 departments, with automated monitoring of performance and workflow anomalies?",
              "Level 5: Is AI adoption monitored across the whole organization against strategic KPIs, with proactive improvement and reporting?",
            ],
            evidence_examples: [
              "List of AI applications in use (AP.6.3.1, AP.6.4.1, AP.6.5.1)",
              "Deployment plan (AP.6.3.2, AP.6.4.2, AP.6.5.2)",
              "Monitoring reports (AP.6.3.3, AP.6.4.3, AP.6.5.3)",
              "Monitoring procedures (AP.6.3.4, AP.6.4.4, AP.6.5.4)",
              "Number of business domains covered by AI (AP.6.3.5, AP.6.4.5, AP.6.5.5)",
            ],
          },
        ],
      },
      {
        title: "Outputs: Impact",
        description:
          "The impact of AI, from cost reduction and efficiency to better user experience and more accurate decisions, realized when AI is integrated in alignment with strategy, governance and enablers",
        order_no: 7,
        items: [
          {
            title: "Operational efficiency",
            description:
              "Lower costs and higher productivity from automating manual processes, measured with return on investment models covering productivity gains, time savings and performance improvements. The top adoption level is reached when AI supports more than 25% of operations or improves efficiency by more than 20%",
            order_no: 1,
            summary: "Support more than 25% of operations with AI",
            questions: [
              "AI.AQ.IM.1: To what extent has the entity improved operational efficiency through the use of AI, such as cost reduction, process optimization, time savings, or error minimization?",
              "Level 3: Is AI integrated into 16% to 20% of business tasks, or does it improve efficiency by 11% to 15% with periodic review?",
              "Level 4: Does AI support 21% to 25% of operations, or improve efficiency by 16% to 20%?",
              "Level 5: Does AI support more than 25% of operations, or improve efficiency by more than 20%?",
            ],
            evidence_examples: [
              "Operational efficiency measurement methodology (IM.1.3.1, IM.1.4.1, IM.1.5.1)",
              "Performance indicator reports with data before and after AI (IM.1.3.2, IM.1.4.2, IM.1.5.2)",
              "Process benchmarking document (IM.1.3.3, IM.1.4.3, IM.1.5.3)",
              "Data sources and their validity period (IM.1.3.4, IM.1.4.4, IM.1.5.4)",
              "Documentation of AI's contribution to the efficiency improvement (IM.1.3.5, IM.1.4.5, IM.1.5.5)",
            ],
          },
          {
            title: "Employee productivity",
            description:
              "AI used to raise workforce productivity, by increasing per-employee output or supporting decision-making and task execution. The top adoption level is reached when AI supports more than 25% of job roles or productivity gains exceed 15% to 20%, about 8 or more hours saved per week",
            order_no: 2,
            summary: "Support more than 25% of job roles with AI",
            questions: [
              "AI.AQ.IM.2: To what extent has the entity used AI to enhance workforce productivity, whether by increasing per-employee output or supporting decision-making and task execution?",
              "Level 3: Does AI support 16% to 20% of job roles, or raise productivity by 7% to 10% (about 3 to 5 hours saved per week)?",
              "Level 4: Does AI support 21% to 25% of the workforce, or raise productivity by 11% to 15% (about 5 to 7 hours saved per week)?",
              "Level 5: Does AI support more than 25% of job roles, or raise productivity by more than 15% to 20% (about 8 or more hours saved per week)?",
            ],
            evidence_examples: [
              "Methodology for measuring the increase in productivity and decision-making support (IM.2.3.1, IM.2.4.1, IM.2.5.1)",
              "Quantitative usage reports (IM.2.3.2, IM.2.4.2, IM.2.5.2)",
              "Comparative charts or tables showing the relevant ratios (IM.2.3.3, IM.2.4.3, IM.2.5.3)",
              "Data sources and their validity period (IM.2.3.4, IM.2.4.4, IM.2.5.4)",
              "Explanation of how AI contributed to the results (IM.2.3.5, IM.2.4.5, IM.2.5.5)",
            ],
          },
          {
            title: "Service quality and improvement",
            description:
              "AI used to deliver interactive, personalized and proactive services through diverse channels for users, customers or citizens. AI powers more than 25% of services, with improvements in response time, satisfaction and personalization exceeding 20%",
            order_no: 3,
            summary: "Power more than 25% of services with AI",
            questions: [
              "AI.AQ.IM.3: To what extent has the entity adopted AI to improve the quality, speed, and personalization of services provided to users, customers, or citizens?",
              "Level 3: Is AI integrated into 16% to 20% of service channels, or are 10% to 15% improvements in quality, response time or user experience tracked across channels?",
              "Level 4: Does AI enhance 21% to 25% of services, or improve performance indicators by 15% to 20% with continuous real-time personalization?",
              "Level 5: Does AI support more than 25% of services, or improve response time, satisfaction and personalization by more than 20%?",
            ],
            evidence_examples: [
              "Documented performance reports on quality and speed improvements (IM.3.3.1, IM.3.4.1, IM.3.5.1)",
              "Reports on beneficiary satisfaction indicators or SLA metrics (IM.3.3.2, IM.3.4.2, IM.3.5.2)",
              "System and service operation reports (IM.3.3.3, IM.3.4.3, IM.3.5.3)",
              "Documentation identifying AI-enabled services (IM.3.3.4, IM.3.5.4)",
              "AI-driven service personalization models (IM.3.4.4)",
            ],
          },
        ],
      },
    ],
  },
  textRevision: 2,
};

export default saudiNaiiStructure;
