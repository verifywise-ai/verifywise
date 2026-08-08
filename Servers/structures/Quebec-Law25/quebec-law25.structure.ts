import type { FrameworkStructure } from "../types";

export const quebecLaw25Structure: FrameworkStructure = {
  id: 21,
  key: "quebec-law25",
  framework_type: "quebec_law25",
  displayName: "Quebec Law 25 Compliance Framework",
  tables: {
    "l1_struct": "quebec_law25_chapters_struct",
    "l2_struct": "quebec_law25_articles_struct",
    "l2_impl": "quebec_law25_articles",
    "l2_risks": "quebec_law25_articles__risks"
  },
  cols: {
    "l2_struct_parent": "chapter_id",
    "l2_impl_meta": "article_meta_id",
    "l2_risks_impl": "article_id"
  },
  entity_types: {
    "l2_impl": "article"
  },
  source_labels: {
    "article": "Quebec Law 25 articles"
  },
  seed: {
    "name": "Quebec Law 25 Compliance Framework",
    "description": "Framework for ensuring compliance with Quebec's modernized privacy law (Law 25/Bill 64) which came into force in phases from 2022-2024",
    "version": "1.0.0",
    "is_organizational": true,
    "hierarchy": {
      "type": "two_level",
      "level1_name": "Chapter",
      "level2_name": "Article"
    },
    "structure": [
      {
        "title": "Chapter 1: Governance and Accountability",
        "description": "Organizational governance requirements including privacy officer designation, privacy policies, and accountability measures",
        "order_no": 1,
        "items": [
          {
            "title": "Art. 1.1 - Privacy Officer Designation",
            "description": "Designate a person responsible for personal information protection (Privacy Officer) and publish their contact information",
            "order_no": 1,
            "summary": "Mandatory designation of a person responsible for protecting personal information within the organization, with title and contact information publicly accessible on the organization's website",
            "questions": [
              "Has a Privacy Officer been formally designated?",
              "Are the Privacy Officer's title and contact details published on the website?",
              "Does the Privacy Officer have sufficient authority and resources?",
              "Is there a process for individuals to contact the Privacy Officer?"
            ],
            "evidence_examples": [
              "Privacy Officer appointment letter/resolution",
              "Website screenshot showing published contact information",
              "Privacy Officer job description and mandate",
              "Organizational chart showing reporting structure"
            ]
          },
          {
            "title": "Art. 1.2 - Privacy Governance Framework",
            "description": "Establish policies and practices governing personal information protection and retention/destruction schedules",
            "order_no": 2,
            "summary": "Implement comprehensive governance policies including data collection, use, disclosure, retention, and destruction procedures, published on the website in clear language",
            "questions": [
              "Are privacy policies and practices documented and published?",
              "Do policies cover collection, use, disclosure, and retention?",
              "Is there a data retention and destruction schedule?",
              "Are policies written in clear and simple language?"
            ],
            "evidence_examples": [
              "Published privacy policy",
              "Data retention schedule",
              "Data destruction procedures",
              "Policy review and update records"
            ]
          },
          {
            "title": "Art. 1.3 - Privacy Impact Assessments",
            "description": "Conduct Privacy Impact Assessments (PIAs) for new projects, systems, or initiatives involving personal information",
            "order_no": 3,
            "summary": "Mandatory PIAs before acquiring, developing, or redesigning information systems or electronic service delivery involving personal information. Required for any disclosure outside Quebec",
            "questions": [
              "Is there a PIA process and methodology?",
              "Are PIAs conducted before new projects involving personal information?",
              "Do PIAs assess privacy risks and mitigation measures?",
              "Are PIAs conducted before disclosing data outside Quebec?"
            ],
            "evidence_examples": [
              "PIA policy and methodology",
              "Completed PIA templates",
              "Risk assessment documentation",
              "PIA review and approval records"
            ]
          },
          {
            "title": "Art. 1.4 - Privacy Training and Awareness",
            "description": "Ensure staff handling personal information receive appropriate privacy training",
            "order_no": 4,
            "summary": "Provide regular training to employees on privacy obligations, proper handling of personal information, and incident response procedures",
            "questions": [
              "Is privacy training provided to all relevant staff?",
              "Does training cover Law 25 requirements?",
              "Is training provided upon hire and regularly thereafter?",
              "Are training records maintained?"
            ],
            "evidence_examples": [
              "Training program materials",
              "Training attendance records",
              "Training completion certificates",
              "Annual training schedule"
            ]
          },
          {
            "title": "Art. 1.5 - Record of Processing Activities",
            "description": "Maintain an inventory of personal information holdings and processing activities",
            "order_no": 5,
            "summary": "Document all personal information collected, purposes, retention periods, access controls, and third-party disclosures",
            "questions": [
              "Is there an inventory of personal information holdings?",
              "Does the inventory include purposes and retention periods?",
              "Are third-party disclosures documented?",
              "Is the inventory kept current?"
            ],
            "evidence_examples": [
              "Personal information inventory/register",
              "Data flow diagrams",
              "System inventory documentation",
              "Third-party disclosure records"
            ]
          }
        ]
      },
      {
        "title": "Chapter 2: Consent Requirements",
        "description": "Requirements for obtaining valid consent for collection, use, and disclosure of personal information",
        "order_no": 2,
        "items": [
          {
            "title": "Art. 2.2 - Express Consent Requirements",
            "description": "Obtain express (explicit) consent for sensitive personal information",
            "order_no": 1,
            "summary": "Express consent required for: sensitive personal information, disclosure to third parties, new purposes, profiling/targeting, automated decision-making, and identification/location technologies",
            "questions": [
              "Is express consent obtained for sensitive information?",
              "Is express consent obtained for third-party disclosures?",
              "Is express consent obtained for profiling activities?",
              "Is express consent obtained for automated decisions?"
            ],
            "evidence_examples": [
              "Express consent forms",
              "Sensitive data consent records",
              "Third-party disclosure consent forms",
              "Profiling consent documentation"
            ]
          },
          {
            "title": "Art. 2.3 - Withdrawal of Consent",
            "description": "Enable individuals to withdraw consent at any time",
            "order_no": 2,
            "summary": "Individuals must be able to withdraw consent as easily as it was given. Organization must cease processing upon withdrawal unless legal grounds exist",
            "questions": [
              "Is there a clear process for withdrawing consent?",
              "Is withdrawal as easy as giving consent?",
              "Does organization stop processing upon withdrawal?",
              "Are individuals informed of withdrawal consequences?"
            ],
            "evidence_examples": [
              "Consent withdrawal mechanism",
              "Withdrawal process documentation",
              "Withdrawal request logs",
              "Post-withdrawal processing procedures"
            ]
          },
          {
            "title": "Art. 2.4 - Consent for Minors",
            "description": "Special consent requirements for personal information of minors",
            "order_no": 3,
            "summary": "Parental consent required for minors under 14. For minors 14 and over, their own consent or parental consent may be required depending on context",
            "questions": [
              "Is there a process to verify age of individuals?",
              "Is parental consent obtained for minors under 14?",
              "Are appropriate safeguards in place for minors' data?",
              "Is minor-appropriate language used in consent requests?"
            ],
            "evidence_examples": [
              "Age verification procedures",
              "Parental consent forms",
              "Minor data protection policy",
              "Age-appropriate consent mechanisms"
            ]
          },
          {
            "title": "Art. 2.5 - Secondary Use Consent",
            "description": "Obtain fresh consent when using personal information for new purposes",
            "order_no": 4,
            "summary": "New consent required when personal information is to be used for purposes not initially disclosed, unless exemption applies",
            "questions": [
              "Is new consent obtained for secondary uses?",
              "Are individuals notified of proposed new uses?",
              "Are exemptions to secondary use consent documented?",
              "Is there a process to track original purpose limitations?"
            ],
            "evidence_examples": [
              "Secondary use consent procedures",
              "New purpose notification templates",
              "Exemption assessment records",
              "Purpose tracking documentation"
            ]
          }
        ]
      },
      {
        "title": "Chapter 3: Individual Rights",
        "description": "Rights of individuals regarding access, rectification, portability, and erasure of their personal information",
        "order_no": 3,
        "items": [
          {
            "title": "Art. 3.1 - Right of Access",
            "description": "Individuals have the right to access their personal information held by the organization",
            "order_no": 1,
            "summary": "Respond to access requests within 30 days (extendable by 10 days with notice). Provide information in understandable form. May charge reasonable fee for reproduction",
            "questions": [
              "Is there a process for handling access requests?",
              "Are requests responded to within 30 days?",
              "Is information provided in an understandable format?",
              "Are any fees reasonable and documented?"
            ],
            "evidence_examples": [
              "Access request procedure",
              "Request tracking system",
              "Response templates",
              "Fee schedule (if applicable)"
            ]
          },
          {
            "title": "Art. 3.2 - Right to Rectification",
            "description": "Individuals have the right to request rectification of inaccurate, incomplete, or equivocal personal information",
            "order_no": 2,
            "summary": "Correct inaccurate information upon request. Notify third parties who received the incorrect information. Provide written reasons if rectification is refused",
            "questions": [
              "Is there a rectification request process?",
              "Are third parties notified of corrections?",
              "Are refusals documented with reasons?",
              "Can individuals add clarifying comments if rectification is refused?"
            ],
            "evidence_examples": [
              "Rectification request procedure",
              "Third-party notification records",
              "Rectification decision documentation",
              "Annotation/comment procedures"
            ]
          },
          {
            "title": "Art. 3.3 - Right to Data Portability",
            "description": "Individuals have the right to obtain their personal information in a portable format",
            "order_no": 3,
            "summary": "Upon request, provide personal information in a commonly used, structured technological format. Right to have information transferred to another organization. Applies to information provided by the individual",
            "questions": [
              "Can personal information be exported in portable format?",
              "Is the format commonly used and structured (e.g., CSV, JSON)?",
              "Can information be transferred directly to another organization?",
              "Is there a process for portability requests?"
            ],
            "evidence_examples": [
              "Data portability procedure",
              "Supported export formats documentation",
              "Transfer mechanism documentation",
              "Portability request logs"
            ]
          },
          {
            "title": "Art. 3.4 - Right to De-indexation (Be Forgotten)",
            "description": "Individuals have the right to request de-indexation or cessation of dissemination of personal information",
            "order_no": 4,
            "summary": "Upon request, cease disseminating personal information or de-index hyperlinks if: dissemination contravenes law, or causes serious harm and cessation does not exceed public interest",
            "questions": [
              "Is there a process for de-indexation requests?",
              "Are criteria for granting requests documented?",
              "Is there a balancing test against public interest?",
              "Are technical measures in place to cease dissemination?"
            ],
            "evidence_examples": [
              "De-indexation request procedure",
              "Decision criteria documentation",
              "Public interest balancing records",
              "Technical de-indexation capabilities"
            ]
          },
          {
            "title": "Art. 3.5 - Right to Restrict Automated Decisions",
            "description": "Individuals have rights regarding decisions made exclusively through automated processing",
            "order_no": 5,
            "summary": "Individuals must be informed of automated decisions affecting them. Right to be informed of personal information used. Right to present observations to person who can review the decision",
            "questions": [
              "Are individuals informed of automated decisions?",
              "Can individuals learn what information was used?",
              "Is there a process for human review of automated decisions?",
              "Can individuals present observations?"
            ],
            "evidence_examples": [
              "Automated decision notification procedures",
              "Review request process",
              "Human review mechanism documentation",
              "Decision explanation procedures"
            ]
          }
        ]
      },
      {
        "title": "Chapter 4: Data Breach Management",
        "description": "Requirements for detecting, responding to, and reporting privacy incidents (data breaches)",
        "order_no": 4,
        "items": [
          {
            "title": "Art. 4.1 - Incident Detection and Assessment",
            "description": "Implement measures to detect and assess privacy incidents",
            "order_no": 1,
            "summary": "Establish processes to detect unauthorized access, use, disclosure, loss, or other breach of personal information. Assess risk of serious harm to affected individuals",
            "questions": [
              "Are incident detection mechanisms in place?",
              "Is there a process for assessing incident severity?",
              "Can incidents be identified promptly?",
              "Is there criteria for determining risk of serious harm?"
            ],
            "evidence_examples": [
              "Incident detection procedures",
              "Risk assessment methodology",
              "Monitoring systems documentation",
              "Incident classification criteria"
            ]
          },
          {
            "title": "Art. 4.2 - Notification to Commission d'accès à l'information",
            "description": "Notify the Commission of incidents presenting risk of serious harm",
            "order_no": 2,
            "summary": "If incident presents risk of serious harm, notify Commission d'accès à l'information (CAI) with diligence. Include incident details, categories of information affected, and mitigation measures",
            "questions": [
              "Is there a process for notifying the CAI?",
              "Are notification timelines defined (with diligence)?",
              "Does notification include required information?",
              "Is there a designated person responsible for notifications?"
            ],
            "evidence_examples": [
              "CAI notification procedure",
              "Notification templates",
              "Notification logs and confirmations",
              "Contact information for CAI"
            ]
          },
          {
            "title": "Art. 4.3 - Notification to Affected Individuals",
            "description": "Notify affected individuals when incident presents risk of serious harm",
            "order_no": 3,
            "summary": "Notify affected individuals with diligence. Include description of incident, information affected, measures taken, steps individuals can take, and contact information for questions",
            "questions": [
              "Is there a process for notifying affected individuals?",
              "Does notification include all required elements?",
              "Are notifications sent promptly (with diligence)?",
              "Are notifications in clear language?"
            ],
            "evidence_examples": [
              "Individual notification procedure",
              "Notification templates",
              "Notification records",
              "Communication tracking"
            ]
          },
          {
            "title": "Art. 4.4 - Incident Register",
            "description": "Maintain a register of all privacy incidents",
            "order_no": 4,
            "summary": "Keep written record of all confidentiality incidents, whether or not they present risk of serious harm. Register must be available to CAI upon request",
            "questions": [
              "Is an incident register maintained?",
              "Does it include all incidents (not just notifiable)?",
              "Is it kept current and complete?",
              "Can it be produced to CAI upon request?"
            ],
            "evidence_examples": [
              "Privacy incident register",
              "Incident documentation procedures",
              "Register retention policy",
              "Register access controls"
            ]
          },
          {
            "title": "Art. 4.5 - Post-Incident Review",
            "description": "Conduct post-incident review and implement corrective measures",
            "order_no": 5,
            "summary": "After incidents, review root cause and implement measures to prevent recurrence. Update security measures and procedures as needed",
            "questions": [
              "Are post-incident reviews conducted?",
              "Is root cause analysis performed?",
              "Are corrective measures implemented?",
              "Are lessons learned documented and shared?"
            ],
            "evidence_examples": [
              "Post-incident review reports",
              "Root cause analysis documentation",
              "Corrective action records",
              "Security improvement records"
            ]
          }
        ]
      },
      {
        "title": "Chapter 5: Cross-Border Transfers",
        "description": "Requirements for transferring personal information outside Quebec",
        "order_no": 5,
        "items": [
          {
            "title": "Art. 5.1 - Transfer Assessment Requirements",
            "description": "Conduct assessment before transferring personal information outside Quebec",
            "order_no": 1,
            "summary": "Before communicating personal information outside Quebec, assess whether receiving jurisdiction provides adequate protection. Consider legal framework, applicable laws, and data protection rules",
            "questions": [
              "Is a transfer assessment conducted before cross-border disclosures?",
              "Does assessment consider destination's legal framework?",
              "Are applicable foreign laws reviewed?",
              "Is the assessment documented?"
            ],
            "evidence_examples": [
              "Transfer assessment procedure",
              "Adequacy assessment documentation",
              "Legal framework analysis",
              "Transfer decision records"
            ]
          },
          {
            "title": "Art. 5.2 - Contractual Protections",
            "description": "Implement contractual measures for international transfers",
            "order_no": 2,
            "summary": "When transferring outside Quebec, use written agreements that include protections comparable to Law 25. Agreements must address security, use limitations, and return/destruction obligations",
            "questions": [
              "Are written agreements in place for cross-border transfers?",
              "Do agreements include privacy protections?",
              "Are security requirements specified?",
              "Are use limitations and return/destruction addressed?"
            ],
            "evidence_examples": [
              "Standard contractual clauses",
              "Data transfer agreements",
              "Security requirements in contracts",
              "Agreement compliance monitoring"
            ]
          },
          {
            "title": "Art. 5.3 - Privacy Impact Assessment for Transfers",
            "description": "Conduct PIA before disclosing personal information outside Quebec",
            "order_no": 3,
            "summary": "Mandatory Privacy Impact Assessment required before any disclosure of personal information outside Quebec to evaluate risks and mitigations",
            "questions": [
              "Is a PIA conducted before international disclosures?",
              "Does PIA assess transfer-specific risks?",
              "Are mitigation measures documented?",
              "Is PIA reviewed and approved?"
            ],
            "evidence_examples": [
              "Transfer PIA documentation",
              "Risk assessment for transfers",
              "Mitigation measures documentation",
              "PIA approval records"
            ]
          },
          {
            "title": "Art. 5.4 - Public Sector Disclosure Restrictions",
            "description": "Additional restrictions on transfers by public bodies",
            "order_no": 4,
            "summary": "Public bodies face additional restrictions and must ensure destination jurisdiction provides substantially similar protection before transferring personal information",
            "questions": [
              "Are public body transfer restrictions understood?",
              "Is substantially similar protection verified?",
              "Are additional public sector requirements met?",
              "Is there authorization process for public body transfers?"
            ],
            "evidence_examples": [
              "Public body transfer policy",
              "Substantially similar protection analysis",
              "Authorization documentation",
              "Public sector compliance records"
            ]
          }
        ]
      },
      {
        "title": "Chapter 6: Third-Party Management",
        "description": "Requirements for engaging third parties who process personal information",
        "order_no": 6,
        "items": [
          {
            "title": "Art. 6.1 - Third-Party Due Diligence",
            "description": "Conduct due diligence before engaging service providers who process personal information",
            "order_no": 1,
            "summary": "Assess third-party privacy practices, security measures, and compliance capabilities before engaging them to process personal information",
            "questions": [
              "Is due diligence conducted before engaging third parties?",
              "Are third-party privacy practices assessed?",
              "Are security measures evaluated?",
              "Is compliance capability verified?"
            ],
            "evidence_examples": [
              "Third-party assessment questionnaire",
              "Due diligence reports",
              "Security assessment results",
              "Compliance verification records"
            ]
          },
          {
            "title": "Art. 6.2 - Contractual Requirements",
            "description": "Establish written agreements with third parties processing personal information",
            "order_no": 2,
            "summary": "Written contract required specifying: privacy and security measures, use restrictions, return/destruction obligations, audit rights, and breach notification requirements",
            "questions": [
              "Are written contracts in place with all processors?",
              "Do contracts specify privacy measures?",
              "Are use restrictions included?",
              "Are return/destruction and audit rights addressed?"
            ],
            "evidence_examples": [
              "Service provider agreements",
              "Data processing addendums",
              "Security schedules",
              "Contract compliance reviews"
            ]
          },
          {
            "title": "Art. 6.3 - Ongoing Monitoring",
            "description": "Monitor third-party compliance with privacy obligations",
            "order_no": 3,
            "summary": "Implement ongoing monitoring of third-party compliance including periodic reviews, audits, and incident tracking",
            "questions": [
              "Is third-party compliance monitored?",
              "Are periodic reviews conducted?",
              "Is there a process for third-party audits?",
              "Are third-party incidents tracked?"
            ],
            "evidence_examples": [
              "Monitoring procedures",
              "Periodic review records",
              "Audit reports",
              "Third-party incident logs"
            ]
          },
          {
            "title": "Art. 6.4 - Sub-Processor Management",
            "description": "Control and approve use of sub-processors by service providers",
            "order_no": 4,
            "summary": "Require notification or approval for sub-processor engagement. Ensure same contractual protections flow down to sub-processors",
            "questions": [
              "Is sub-processor use controlled?",
              "Is notification or approval required?",
              "Do protections flow to sub-processors?",
              "Is there visibility into sub-processor chain?"
            ],
            "evidence_examples": [
              "Sub-processor policy",
              "Approval records",
              "Flow-down contract clauses",
              "Sub-processor register"
            ]
          }
        ]
      },
      {
        "title": "Chapter 7: Specific Data Types",
        "description": "Special requirements for sensitive and specific categories of personal information",
        "order_no": 7,
        "items": [
          {
            "title": "Art. 7.1 - Sensitive Personal Information",
            "description": "Enhanced protections for sensitive personal information",
            "order_no": 1,
            "summary": "Sensitive information includes: health information, biometric data, information of a highly personal nature. Requires express consent and enhanced security measures",
            "questions": [
              "Is sensitive information identified and classified?",
              "Is express consent obtained for sensitive data?",
              "Are enhanced security measures in place?",
              "Is sensitive data access restricted?"
            ],
            "evidence_examples": [
              "Sensitive data classification",
              "Express consent records",
              "Enhanced security documentation",
              "Access control records"
            ]
          },
          {
            "title": "Art. 7.2 - Biometric Information",
            "description": "Specific requirements for collection and use of biometric information",
            "order_no": 2,
            "summary": "Biometric data for identification purposes requires express consent and notification of any biometric database creation. Enhanced security and retention limits apply",
            "questions": [
              "Is biometric collection justified and minimized?",
              "Is express consent obtained?",
              "Have individuals been notified of database creation?",
              "Are biometric-specific security measures in place?"
            ],
            "evidence_examples": [
              "Biometric use policy",
              "Express consent for biometrics",
              "Database creation notifications",
              "Biometric security measures"
            ]
          },
          {
            "title": "Art. 7.3 - De-identification and Anonymization",
            "description": "Requirements for de-identifying or anonymizing personal information",
            "order_no": 3,
            "summary": "De-identification must be performed according to generally accepted best practices. Risk of re-identification must be assessed and minimized",
            "questions": [
              "Are de-identification methods documented?",
              "Do methods follow best practices?",
              "Is re-identification risk assessed?",
              "Are de-identified datasets protected from re-identification?"
            ],
            "evidence_examples": [
              "De-identification procedures",
              "Best practice references",
              "Re-identification risk assessments",
              "De-identified data protections"
            ]
          },
          {
            "title": "Art. 7.4 - Information About Deceased Persons",
            "description": "Handling of personal information of deceased individuals",
            "order_no": 4,
            "summary": "Protection generally ceases 30 years after death. Before that, heirs and legal representatives may exercise certain rights on behalf of deceased",
            "questions": [
              "Is there policy for deceased persons' information?",
              "Is the 30-year rule understood and implemented?",
              "Are heir/representative rights accommodated?",
              "Is there a process for verifying status and rights?"
            ],
            "evidence_examples": [
              "Deceased persons policy",
              "Heir request procedures",
              "Verification processes",
              "Retention rules for deceased"
            ]
          }
        ]
      },
      {
        "title": "Chapter 8: Technology-Specific Requirements",
        "description": "Requirements related to specific technologies including profiling, automated decisions, and AI",
        "order_no": 8,
        "items": [
          {
            "title": "Art. 8.1 - Automated Decision-Making",
            "description": "Requirements when decisions are made exclusively through automated processing",
            "order_no": 1,
            "summary": "When decisions producing legal effects are made solely by automated means: inform individual at or before decision, explain information used, and allow human review on request",
            "questions": [
              "Are automated decisions identified and documented?",
              "Are individuals informed of automated decisions?",
              "Is information used in decisions explained?",
              "Can individuals request human review?"
            ],
            "evidence_examples": [
              "Automated decision inventory",
              "Notification procedures",
              "Explanation documentation",
              "Human review process"
            ]
          },
          {
            "title": "Art. 8.2 - Profiling and Targeting",
            "description": "Requirements for profiling activities used for targeting or personalization",
            "order_no": 2,
            "summary": "Profiling for targeted advertising or content personalization requires express consent. Individuals must be able to opt out. Profiling activities must be disclosed",
            "questions": [
              "Are profiling activities identified?",
              "Is express consent obtained?",
              "Can individuals opt out of profiling?",
              "Are profiling practices disclosed?"
            ],
            "evidence_examples": [
              "Profiling activity register",
              "Express consent for profiling",
              "Opt-out mechanisms",
              "Profiling disclosures"
            ]
          },
          {
            "title": "Art. 8.3 - Identification and Location Technologies",
            "description": "Requirements for technologies that identify or locate individuals",
            "order_no": 3,
            "summary": "Express consent required before using functions that allow identification or location tracking. Applies to facial recognition, location services, device identification, etc.",
            "questions": [
              "Are identification/location technologies inventoried?",
              "Is express consent obtained before activation?",
              "Are these technologies disclosed to individuals?",
              "Can individuals disable these functions?"
            ],
            "evidence_examples": [
              "Technology inventory",
              "Consent mechanisms",
              "Disclosure documentation",
              "Disable/opt-out options"
            ]
          },
          {
            "title": "Art. 8.4 - AI System Transparency",
            "description": "Transparency requirements for artificial intelligence systems processing personal information",
            "order_no": 4,
            "summary": "When AI systems make decisions or process personal information, ensure transparency about AI use, explain logic involved, and enable human oversight where appropriate",
            "questions": [
              "Are AI systems processing personal information identified?",
              "Is AI use disclosed to affected individuals?",
              "Is the logic of AI processing explainable?",
              "Is there human oversight of AI decisions?"
            ],
            "evidence_examples": [
              "AI system inventory",
              "AI disclosure notices",
              "Explainability documentation",
              "Human oversight procedures"
            ]
          }
        ]
      },
      {
        "title": "Chapter 9: Security Measures",
        "description": "Technical and organizational security measures to protect personal information",
        "order_no": 9,
        "items": [
          {
            "title": "Art. 9.1 - Security Program",
            "description": "Implement a comprehensive security program to protect personal information",
            "order_no": 1,
            "summary": "Establish security measures reasonable having regard to sensitivity of information, purposes, quantity, distribution, format, and method of storage",
            "questions": [
              "Is there a documented security program?",
              "Are measures proportionate to risk?",
              "Does program cover all processing contexts?",
              "Is the program regularly reviewed and updated?"
            ],
            "evidence_examples": [
              "Security policy documentation",
              "Security program overview",
              "Risk-based security assessment",
              "Program review records"
            ]
          },
          {
            "title": "Art. 9.2 - Access Controls",
            "description": "Implement access controls to limit access to personal information",
            "order_no": 2,
            "summary": "Restrict access to personal information to authorized personnel on need-to-know basis. Implement authentication, authorization, and access logging",
            "questions": [
              "Are access controls documented and implemented?",
              "Is access limited to authorized personnel?",
              "Is there role-based access control?",
              "Is access logged and monitored?"
            ],
            "evidence_examples": [
              "Access control policy",
              "Role definitions and permissions",
              "Access logs",
              "Access review records"
            ]
          },
          {
            "title": "Art. 9.3 - Encryption and Data Protection",
            "description": "Implement encryption and other data protection measures",
            "order_no": 3,
            "summary": "Use encryption for sensitive data at rest and in transit. Implement data masking, tokenization, and other technical protections as appropriate",
            "questions": [
              "Is encryption used for data at rest?",
              "Is encryption used for data in transit?",
              "Are encryption standards documented?",
              "Are additional protections used where appropriate?"
            ],
            "evidence_examples": [
              "Encryption policy",
              "Encryption implementation records",
              "Certificate management",
              "Data protection measures documentation"
            ]
          },
          {
            "title": "Art. 9.4 - Secure Destruction",
            "description": "Implement secure destruction of personal information when no longer needed",
            "order_no": 4,
            "summary": "Destroy or anonymize personal information when purpose achieved and retention period expired. Use secure destruction methods that prevent reconstruction",
            "questions": [
              "Is there a secure destruction procedure?",
              "Are retention periods defined and enforced?",
              "Is destruction performed securely?",
              "Are destruction records maintained?"
            ],
            "evidence_examples": [
              "Destruction policy and procedures",
              "Retention schedule compliance",
              "Destruction certificates",
              "Destruction logs"
            ]
          }
        ]
      },
      {
        "title": "Chapter 10: Compliance and Enforcement",
        "description": "Compliance monitoring, sanctions, and private right of action provisions",
        "order_no": 10,
        "items": [
          {
            "title": "Art. 10.1 - Internal Compliance Monitoring",
            "description": "Implement internal compliance monitoring and audit procedures",
            "order_no": 1,
            "summary": "Regularly audit and monitor compliance with Law 25 requirements. Document findings and implement corrective actions",
            "questions": [
              "Is there internal compliance monitoring?",
              "Are regular audits conducted?",
              "Are findings documented?",
              "Are corrective actions implemented?"
            ],
            "evidence_examples": [
              "Audit program documentation",
              "Audit reports",
              "Findings tracking",
              "Corrective action records"
            ]
          },
          {
            "title": "Art. 10.2 - CAI Cooperation",
            "description": "Cooperate with Commission d'accès à l'information inquiries and investigations",
            "order_no": 2,
            "summary": "Respond to CAI inquiries and cooperate with investigations. Provide requested information and documentation in a timely manner",
            "questions": [
              "Is there a process for responding to CAI inquiries?",
              "Can requested documentation be produced?",
              "Is there a designated contact for CAI matters?",
              "Are CAI interactions documented?"
            ],
            "evidence_examples": [
              "CAI response procedures",
              "Inquiry response records",
              "Designated contact documentation",
              "CAI interaction logs"
            ]
          },
          {
            "title": "Art. 10.3 - Administrative Penalty Avoidance",
            "description": "Understand and implement measures to avoid administrative monetary penalties",
            "order_no": 3,
            "summary": "Understand penalty framework (up to $10M or 2% global revenue for serious violations). Implement preventive measures and demonstrate good faith compliance efforts",
            "questions": [
              "Is the penalty framework understood?",
              "Are preventive measures documented?",
              "Is there evidence of good faith compliance?",
              "Are high-risk areas prioritized?"
            ],
            "evidence_examples": [
              "Penalty risk assessment",
              "Compliance program documentation",
              "Good faith compliance evidence",
              "Risk prioritization records"
            ]
          },
          {
            "title": "Art. 10.4 - Private Right of Action Preparedness",
            "description": "Prepare for potential private lawsuits by affected individuals",
            "order_no": 4,
            "summary": "Law 25 enables private right of action with statutory damages ($1,000+ for intentional/gross negligence). Document compliance efforts to defend against claims",
            "questions": [
              "Is private litigation risk understood?",
              "Is compliance documentation sufficient for defense?",
              "Are complaint handling procedures adequate?",
              "Is there litigation readiness plan?"
            ],
            "evidence_examples": [
              "Litigation risk assessment",
              "Compliance documentation",
              "Complaint handling records",
              "Legal response procedures"
            ]
          },
          {
            "title": "Art. 10.5 - Continuous Improvement",
            "description": "Continuously improve privacy program based on learnings and regulatory developments",
            "order_no": 5,
            "summary": "Stay current with CAI guidance and regulatory developments. Incorporate lessons learned from incidents and audits. Update policies and procedures as needed",
            "questions": [
              "Is there a process for tracking regulatory developments?",
              "Are lessons learned incorporated?",
              "Are policies updated regularly?",
              "Is there privacy program maturity assessment?"
            ],
            "evidence_examples": [
              "Regulatory tracking process",
              "Lessons learned documentation",
              "Policy update records",
              "Maturity assessment results"
            ]
          }
        ]
      }
    ]
  },
};

export default quebecLaw25Structure;
