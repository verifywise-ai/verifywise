import { NISTAIMRFFunctionType } from "../../domain.layer/enums/nist-ai-rmf-function.enum";

export const NIST_AI_RMF_Structure = {
  functions: [
    {
      title: "GOVERN",
      type: NISTAIMRFFunctionType.GOVERN,
      description:
        "This function establishes an AI risk management culture and policies across the organization.",
      categories: [
        {
          title: "GOVERN",
          index: 1,
          description:
            "Policies, processes, procedures, and practices across the organization related to the mapping, measuring, and managing of AI risks are in place, transparent, and implemented effectively.",
          subcategories: [
            {
              title: "GOVERN",
              index: 1,
              description:
                "Legal and regulatory requirements involving AI are understood, managed, and documented.",
            },
            {
              title: "GOVERN",
              index: 2,
              description:
                "The characteristics of trustworthy AI are integrated into organizational policies, processes, procedures, and practices.",
            },
            {
              title: "GOVERN",
              index: 3,
              description:
                "Processes, procedures, and practices are in place to determine the needed level of risk management activities based on the organization's risk tolerance.",
            },
            {
              title: "GOVERN",
              index: 4,
              description:
                "The risk management process and its outcomes are established through transparent policies, procedures, and other controls based on organizational risk priorities.",
            },
            {
              title: "GOVERN",
              index: 5,
              description:
                "Ongoing monitoring and periodic review of the risk management process and its outcomes are planned and organizational roles and responsibilities clearly defined, including determining the frequency of periodic review.",
            },
            {
              title: "GOVERN",
              index: 6,
              description:
                "Mechanisms are in place to inventory AI systems and are resourced according to organizational risk priorities.",
            },
            {
              title: "GOVERN",
              index: 7,
              description:
                "Processes and procedures are in place for decommissioning and phasing out AI systems safely and in a manner that does not increase risks or decrease the organization's trustworthiness.",
            },
          ],
        },
        {
          title: "GOVERN",
          index: 2,
          description:
            "Accountability structures are in place so that the appropriate teams and individuals are empowered, responsible, and trained for mapping, measuring, and managing AI risks.",
          subcategories: [
            {
              title: "GOVERN",
              index: 1,
              description:
                "Roles and responsibilities and lines of communication related to mapping, measuring, and managing AI risks are documented and are clear to individuals and teams throughout the organization.",
            },
            {
              title: "GOVERN",
              index: 2,
              description:
                "The organization's personnel and partners receive AI risk management training to enable them to perform their duties and responsibilities consistent with related policies, procedures, and agreements.",
            },
            {
              title: "GOVERN",
              index: 3,
              description:
                "Executive leadership of the organization takes responsibility for decisions about risks associated with AI system development and deployment.",
            },
          ],
        },
        {
          title: "GOVERN",
          index: 3,
          description:
            "Workforce diversity, equity, inclusion, and accessibility processes are prioritized in the mapping, measuring, and managing of AI risks throughout the lifecycle.",
          subcategories: [
            {
              title: "GOVERN",
              index: 1,
              description:
                "Decision-making related to mapping, measuring, and managing AI risks throughout the lifecycle is informed by a diverse team (e.g., diversity of demographics, disciplines, experience, expertise, and backgrounds).",
            },
            {
              title: "GOVERN",
              index: 2,
              description:
                "Policies and procedures are in place to define and differentiate roles and responsibilities for human-AI configurations and oversight of AI systems.",
            },
          ],
        },
        {
          title: "GOVERN",
          index: 4,
          description:
            "Organizational teams are committed to a culture that considers and communicates AI risk.",
          subcategories: [
            {
              title: "GOVERN",
              index: 1,
              description:
                "Organizational policies and practices are in place to foster a critical thinking and safety-first mindset in the design, development, deployment, and uses of AI systems to minimize potential negative impacts.",
            },
            {
              title: "GOVERN",
              index: 2,
              description:
                "Organizational teams document the risks and potential impacts of the AI technology they design, develop, deploy, evaluate, and use, and they communicate about the impacts more broadly.",
            },
            {
              title: "GOVERN",
              index: 3,
              description:
                "Organizational practices are in place to enable AI testing, identification of incidents, and information sharing.",
            },
          ],
        },
        {
          title: "GOVERN",
          index: 5,
          description: "Processes are in place for robust engagement with relevant AI actors.",
          subcategories: [
            {
              title: "GOVERN",
              index: 1,
              description:
                "Organizational policies and practices are in place to collect, consider, prioritize, and integrate feedback from those external to the team that developed or deployed the AI system regarding the potential individual and societal impacts related to AI risks.",
            },
            {
              title: "GOVERN",
              index: 2,
              description:
                "Mechanisms are established to enable the team that developed or deployed AI systems to regularly incorporate adjudicated feedback from relevant AI actors into system design and implementation.",
            },
          ],
        },
        {
          title: "GOVERN",
          index: 6,
          description:
            "Policies and procedures are in place to address AI risks and benefits arising from third-party software and data and other supply chain issues.",
          subcategories: [
            {
              title: "GOVERN",
              index: 1,
              description:
                "Policies and procedures are in place that address AI risks associated with third-party entities, including risks of infringement of a third-party's intellectual property or other rights.",
            },
            {
              title: "GOVERN",
              index: 2,
              description:
                "Contingency processes are in place to handle failures or incidents in third-party data or AI systems deemed to be high-risk.",
            },
          ],
        },
      ],
    },
    {
      title: "MAP",
      type: NISTAIMRFFunctionType.MAP,
      description: "This function frames the context and scope of AI risks.",
      categories: [
        {
          title: "MAP",
          index: 1,
          description: "Context is established and understood.",
          subcategories: [
            {
              title: "MAP",
              index: 1,
              description:
                "Intended purposes, potentially beneficial uses, context-specific laws, norms and expectations, and prospective settings in which the AI system will be deployed are understood and documented. Considerations include: the specific set or types of users along with their expectations; potential positive and negative impacts of system uses to individuals, communities, organizations, society, and the planet; assumptions and related limitations about AI system purposes, uses, and risks across the development or product AI lifecycle; and related TEVV and system metrics.",
            },
            {
              title: "MAP",
              index: 2,
              description:
                "Interdisciplinary AI actors, competencies, skills, and capacities for establishing context reflect demographic diversity and broad domain and user experience expertise, and their participation is documented. Opportunities for interdisciplinary collaboration are prioritized.",
            },
            {
              title: "MAP",
              index: 3,
              description:
                "The organization's mission and relevant goals for AI technology are understood and documented.",
            },
            {
              title: "MAP",
              index: 4,
              description:
                "The business value or context of business use has been clearly defined or – in the case of assessing existing AI systems – re-evaluated.",
            },
            {
              title: "MAP",
              index: 5,
              description: "Organizational risk tolerances are determined and documented.",
            },
            {
              title: "MAP",
              index: 6,
              description:
                "System requirements (e.g., 'the system shall respect the privacy of its users') are elicited from and understood by relevant AI actors. Design decisions take socio-technical implications into account to address AI risks.",
            },
          ],
        },
        {
          title: "MAP",
          index: 2,
          description: "Categorization of the AI system is performed.",
          subcategories: [
            {
              title: "MAP",
              index: 1,
              description:
                "The specific tasks and methods used to implement the tasks that the AI system will support are defined (e.g., classifiers, generative models, recommenders).",
            },
            {
              title: "MAP",
              index: 2,
              description:
                "Information about the AI system's knowledge limits and how system output may be utilized and overseen by humans is documented. Documentation provides sufficient information to assist relevant AI actors when making decisions and taking subsequent actions.",
            },
            {
              title: "MAP",
              index: 3,
              description:
                "Scientific integrity and TEVV considerations are identified and documented, including those related to experimental design, data collection and selection (e.g., availability, representativeness, suitability), system trustworthiness, and construct validation.",
            },
          ],
        },
        {
          title: "MAP",
          index: 3,
          description:
            "AI capabilities, targeted usage, goals, and expected benefits and costs compared with appropriate benchmarks are understood.",
          subcategories: [
            {
              title: "MAP",
              index: 1,
              description:
                "Potential benefits of intended AI system functionality and performance are examined and documented.",
            },
            {
              title: "MAP",
              index: 2,
              description:
                "Potential costs, including non-monetary costs, which result from expected or realized AI errors or system functionality and trustworthiness – as connected to organizational risk tolerance – are examined and documented.",
            },
            {
              title: "MAP",
              index: 3,
              description:
                "Targeted application scope is specified and documented based on the system's capability, established context, and AI system categorization.",
            },
            {
              title: "MAP",
              index: 4,
              description:
                "Processes for operator and practitioner proficiency with AI system performance and trustworthiness – and relevant technical standards and certifications – are defined, assessed, and documented.",
            },
            {
              title: "MAP",
              index: 5,
              description:
                "Processes for human oversight are defined, assessed, and documented in accordance with organizational policies from the GOVERN function.",
            },
          ],
        },
        {
          title: "MAP",
          index: 4,
          description:
            "Risks and benefits are mapped for all components of the AI system including third-party software and data.",
          subcategories: [
            {
              title: "MAP",
              index: 1,
              description:
                "Approaches for mapping AI technology and legal risks of its components – including the use of third-party data or software – are in place, followed, and documented, as are risks of infringement of a third party's intellectual property or other rights.",
            },
            {
              title: "MAP",
              index: 2,
              description:
                "Internal risk controls for components of the AI system, including third-party AI technologies, are identified and documented.",
            },
          ],
        },
        {
          title: "MAP",
          index: 5,
          description:
            "Impacts to individuals, groups, communities, organizations, and society are characterized.",
          subcategories: [
            {
              title: "MAP",
              index: 1,
              description:
                "Likelihood and magnitude of each identified impact (both potentially beneficial and harmful) based on expected use, past uses of AI systems in similar contexts, public incident reports, feedback from those external to the team that developed or deployed the AI system, or other data are identified and documented.",
            },
            {
              title: "MAP",
              index: 2,
              description:
                "Practices and personnel for supporting regular engagement with relevant AI actors and integrating feedback about positive, negative, and unanticipated impacts are in place and documented.",
            },
          ],
        },
      ],
    },
    {
      title: "MEASURE",
      type: NISTAIMRFFunctionType.MEASURE,
      description: "This function defines how AI risks and trustworthiness are evaluated.",
      categories: [
        {
          title: "MEASURE",
          index: 1,
          description: "Appropriate methods and metrics are identified and applied.",
          subcategories: [
            {
              title: "MEASURE",
              index: 1,
              description:
                "Approaches and metrics for measurement of AI risks enumerated during the MAP function are selected for implementation starting with the most significant AI risks. The risks or trustworthiness characteristics that will not – or cannot – be measured are properly documented.",
            },
            {
              title: "MEASURE",
              index: 2,
              description:
                "Appropriateness of AI metrics and effectiveness of existing controls are regularly assessed and updated, including reports of errors and potential impacts on affected communities.",
            },
            {
              title: "MEASURE",
              index: 3,
              description:
                "Internal experts who did not serve as front-line developers for the system and/or independent assessors are involved in regular assessments and updates. Domain experts, users, AI actors external to the team that developed or deployed the AI system, and affected communities are consulted in support of assessments as necessary per organizational risk tolerance.",
            },
          ],
        },
        {
          title: "MEASURE",
          index: 2,
          description: "AI systems are evaluated for trustworthy characteristics.",
          subcategories: [
            {
              title: "MEASURE",
              index: 1,
              description:
                "Test sets, metrics, and details about the tools used during TEVV are documented.",
            },
            {
              title: "MEASURE",
              index: 2,
              description:
                "Evaluations involving human subjects meet applicable requirements (including human subject protection) and are representative of the relevant population.",
            },
            {
              title: "MEASURE",
              index: 3,
              description:
                "AI system performance or assurance criteria are measured qualitatively or quantitatively and demonstrated for conditions similar to deployment setting(s). Measures are documented.",
            },
            {
              title: "MEASURE",
              index: 4,
              description:
                "The functionality and behavior of the AI system and its components – as identified in the MAP function – are monitored when in production.",
            },
            {
              title: "MEASURE",
              index: 5,
              description:
                "The AI system to be deployed is demonstrated to be valid and reliable. Limitations of the generalizability beyond the conditions under which the technology was developed are documented.",
            },
            {
              title: "MEASURE",
              index: 6,
              description:
                "The AI system is evaluated regularly for safety risks – as identified in the MAP function. The AI system to be deployed is demonstrated to be safe, its residual negative risk does not exceed the risk tolerance, and it can fail safely, particularly if made to operate beyond its knowledge limits. Safety metrics reflect system reliability and robustness, real-time monitoring, and response times for AI system failures.",
            },
            {
              title: "MEASURE",
              index: 7,
              description:
                "AI system security and resilience – as identified in the MAP function – are evaluated and documented.",
            },
            {
              title: "MEASURE",
              index: 8,
              description:
                "Risks associated with transparency and accountability – as identified in the MAP function – are examined and documented.",
            },
            {
              title: "MEASURE",
              index: 9,
              description:
                "The AI model is explained, validated, and documented, and AI system output is interpreted within its context – as identified in the MAP function – to inform responsible use and governance.",
            },
            {
              title: "MEASURE",
              index: 10,
              description:
                "Privacy risk of the AI system – as identified in the MAP function – is examined and documented.",
            },
            {
              title: "MEASURE",
              index: 11,
              description:
                "Fairness and bias – as identified in the MAP function – are evaluated and results are documented.",
            },
            {
              title: "MEASURE",
              index: 12,
              description:
                "Environmental impact and sustainability of AI model training and management activities – as identified in the MAP function – are assessed and documented.",
            },
            {
              title: "MEASURE",
              index: 13,
              description:
                "Effectiveness of the employed TEVV metrics and processes in the MEASURE function are evaluated and documented.",
            },
          ],
        },
        {
          title: "MEASURE",
          index: 3,
          description: "Mechanisms for tracking identified AI risks over time are in place.",
          subcategories: [
            {
              title: "MEASURE",
              index: 1,
              description:
                "Approaches, personnel, and documentation are in place to regularly identify and track existing, unanticipated, and emergent AI risks based on factors such as intended and actual performance in deployed contexts.",
            },
            {
              title: "MEASURE",
              index: 2,
              description:
                "Risk tracking approaches are considered for settings where AI risks are difficult to assess using currently available measurement techniques or where metrics are not yet available.",
            },
            {
              title: "MEASURE",
              index: 3,
              description:
                "Feedback processes for end users and impacted communities to report problems and appeal system outcomes are established and integrated into AI system evaluation metrics.",
            },
          ],
        },
        {
          title: "MEASURE",
          index: 4,
          description: "Feedback about efficacy of measurement is gathered and assessed.",
          subcategories: [
            {
              title: "MEASURE",
              index: 1,
              description:
                "Measurement approaches for identifying AI risks are connected to deployment context(s) and informed through consultation with domain experts and other end users. Approaches are documented.",
            },
            {
              title: "MEASURE",
              index: 2,
              description:
                "Measurement results regarding AI system trustworthiness in deployment context(s) and across the AI lifecycle are informed by input from domain experts and relevant AI actors to validate whether the system is performing consistently as intended. Results are documented.",
            },
            {
              title: "MEASURE",
              index: 3,
              description:
                "Measurable performance improvements or declines based on consultations with relevant AI actors, including affected communities, and field data about context-relevant risks and trustworthiness characteristics are identified and documented.",
            },
          ],
        },
      ],
    },
    {
      title: "MANAGE",
      type: NISTAIMRFFunctionType.MANAGE,
      description: "This function specifies how identified risks are addressed.",
      categories: [
        {
          title: "MANAGE",
          index: 1,
          description:
            "AI risks based on assessments and other analytical output from the MAP and MEASURE functions are prioritized, responded to, and managed.",
          subcategories: [
            {
              title: "MANAGE",
              index: 1,
              description:
                "A determination is made as to whether the AI system achieves its intended purposes and stated objectives and whether its development or deployment should proceed.",
            },
            {
              title: "MANAGE",
              index: 2,
              description:
                "Treatment of documented AI risks is prioritized based on impact, likelihood, and available resources or methods.",
            },
            {
              title: "MANAGE",
              index: 3,
              description:
                "Responses to the AI risks deemed high priority, as identified by the MAP function, are developed, planned, and documented. Risk response options can include mitigating, transferring, avoiding, or accepting.",
            },
            {
              title: "MANAGE",
              index: 4,
              description:
                "Negative residual risks (defined as the sum of all unmitigated risks) to both downstream acquirers of AI systems and end users are documented.",
            },
          ],
        },
        {
          title: "MANAGE",
          index: 2,
          description:
            "Strategies to maximize AI benefits and minimize negative impacts are planned, prepared, implemented, documented, and informed by input from relevant AI actors.",
          subcategories: [
            {
              title: "MANAGE",
              index: 1,
              description:
                "Resources required to manage AI risks are taken into account – along with viable non-AI alternative systems, approaches, or methods – to reduce the magnitude or likelihood of potential impacts.",
            },
            {
              title: "MANAGE",
              index: 2,
              description:
                "Mechanisms are in place and applied to sustain the value of deployed AI systems.",
            },
            {
              title: "MANAGE",
              index: 3,
              description:
                "Procedures are followed to respond to and recover from a previously unknown risk when it is identified.",
            },
            {
              title: "MANAGE",
              index: 4,
              description:
                "Mechanisms are in place and applied, and responsibilities assigned, to supersede automated systems when indicated, including in safety-critical, time-critical, or high-risk scenarios.",
            },
          ],
        },
        {
          title: "MANAGE",
          index: 3,
          description: "AI risks and benefits from third-party entities are managed.",
          subcategories: [
            {
              title: "MANAGE",
              index: 1,
              description:
                "AI risks from third-party resources are regularly monitored, and risk response is taken based on organizational risk tolerance.",
            },
            {
              title: "MANAGE",
              index: 2,
              description:
                "Mechanisms for third-party agreements about data, model, system, and application security, privacy, and intellectual property and data ownership are in place and used.",
            },
            {
              title: "MANAGE",
              index: 3,
              description:
                "Plans and strategies are in place, documented, and properly resourced to respond to and recover from incidents that arise from third-party software and data dependencies.",
            },
          ],
        },
        {
          title: "MANAGE",
          index: 4,
          description:
            "Risk treatments, including response and triage, and incident response plans, procedures and processes are documented and monitored regularly.",
          subcategories: [
            {
              title: "MANAGE",
              index: 1,
              description:
                "Post-deployment AI system monitoring plans are implemented, including mechanisms for capturing and evaluating input from users and other relevant AI actors, appeal and override, decommissioning, incident response, recovery, and change management.",
            },
            {
              title: "MANAGE",
              index: 2,
              description:
                "Measurable continuous improvement, including performance enhancements, risk minimization, resilience enhancement, and mechanisms for system updates and discontinuance are in place.",
            },
            {
              title: "MANAGE",
              index: 3,
              description:
                "Incidents and errors are communicated to relevant AI actors, including affected communities. Processes for tracking, responding to, recovering from, and learning from incidents are in place and used.",
            },
            {
              title: "MANAGE",
              index: 4,
              description:
                "Systems are in place to track, respond to, and recover from risks and incidents that cross organizational boundaries or liability domains.",
            },
          ],
        },
      ],
    },
  ],
};
