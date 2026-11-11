import type { ArticleContent } from '../../contentTypes';

export const vendorRisksContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'Vendor risk assessment looks at the risks that come from relying on third-party providers for AI capabilities. When you use external AI services, models or platforms, you inherit risks from those relationships, and they\'re different from the risks of systems you build and control yourself.',
    },
    {
      type: 'paragraph',
      text: 'Third-party AI creates dependencies that can affect your compliance, security and operations. A vendor security breach could expose your data. A vendor going out of business could disrupt your services. Changes to a vendor\'s model could alter your system\'s behavior in unexpected ways. You need to understand and manage these risks.',
    },
    {
      type: 'heading',
      id: 'why-assess-vendor-risks',
      level: 2,
      text: 'Why assess vendor risks?',
    },
    {
      type: 'paragraph',
      text: 'Vendor risk assessment helps you:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Maintain compliance', text: 'Under regulations like the EU AI Act, you remain responsible for AI systems even when using third-party components' },
        { bold: 'Protect sensitive data', text: 'Knowing what data flows to vendors helps you make better decisions about data sharing' },
        { bold: 'Plan for continuity', text: 'Spotting critical vendor dependencies helps you prepare contingency plans' },
        { bold: 'Prioritize oversight', text: 'Risk scores help you focus review efforts on the vendors that matter most' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Vendor risk scores are calculated based on the scorecard fields on each vendor record. Update these fields regularly to maintain accurate risk profiles.',
    },
    {
      type: 'heading',
      id: 'scorecard-dimensions',
      level: 2,
      text: 'Scorecard dimensions',
    },
    {
      type: 'image',
      src: '/images/user-guide/vendor-scorecard.png',
      alt: 'Vendor scorecard advanced section showing dropdown fields for data sensitivity, business criticality, past issues, and regulatory exposure',
      caption: 'The vendor scorecard captures risk factors to calculate an overall risk score.',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise assesses vendor risk across four dimensions:',
    },
    {
      type: 'icon-cards',
      items: [
        {
          icon: 'Database',
          title: 'Data sensitivity',
          description: 'The sensitivity level of data shared with or processed by the vendor.',
        },
        {
          icon: 'AlertTriangle',
          title: 'Business criticality',
          description: 'How critical the vendor is to your core business operations.',
        },
        {
          icon: 'Clock',
          title: 'Past issues',
          description: 'Historical incidents or problems with this vendor relationship.',
        },
        {
          icon: 'Scale',
          title: 'Regulatory exposure',
          description: 'Which regulations apply to this vendor relationship.',
        },
      ],
    },
    {
      type: 'heading',
      id: 'data-sensitivity-assessment',
      level: 2,
      text: 'Assessing data sensitivity',
    },
    {
      type: 'paragraph',
      text: 'Higher data sensitivity increases vendor risk. Classify the most sensitive data shared with the vendor:',
    },
    {
      type: 'ordered-list',
      items: [
        { bold: 'None', text: 'No sensitive data (lowest risk)' },
        { bold: 'Internal only', text: 'Internal business data' },
        { bold: 'Personally identifiable information (PII)', text: 'Names, emails, identifiers and other personal data' },
        { bold: 'Financial data', text: 'Financial records, transactions or payment information' },
        { bold: 'Health data (e.g. HIPAA)', text: 'Health and medical information subject to privacy regulation' },
        { bold: 'Model weights or AI assets', text: 'Proprietary model parameters or training data (highest risk)' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Best practice',
      text: 'Minimize data shared with vendors when possible. Consider data anonymization or synthetic data for development and testing environments.',
    },
    {
      type: 'heading',
      id: 'criticality-assessment',
      level: 2,
      text: 'Assessing business criticality',
    },
    {
      type: 'paragraph',
      text: 'Evaluate how dependent your operations are on this vendor:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Low (vendor supports non-core functions)', text: 'Non-essential services; alternatives are readily available' },
        { bold: 'Medium (affects operations but is replaceable)', text: 'Important but not critical; disruption would be manageable' },
        { bold: 'High (critical to core services or products)', text: 'Disruption would significantly impact business' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Consider these factors when assessing criticality:',
    },
    {
      type: 'checklist',
      items: [
        'Number of projects depending on this vendor',
        'Availability of alternative vendors',
        'Time required to switch providers',
        'Revenue impact if vendor services are unavailable',
      ],
    },
    {
      type: 'heading',
      id: 'past-issues-assessment',
      level: 2,
      text: 'Recording past issues',
    },
    {
      type: 'paragraph',
      text: 'Document any historical incidents with the vendor to inform future risk decisions:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'None', text: 'No known issues (best)' },
        { bold: 'Minor incident (e.g. small delay, minor bug)', text: 'Small issues that were resolved satisfactorily' },
        { bold: 'Major incident (e.g. data breach, legal issue)', text: 'Significant incidents affecting operations or compliance' },
      ],
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'Important',
      text: 'A history of major incidents significantly increases vendor risk. Consider whether the vendor has addressed root causes before continuing the relationship.',
    },
    {
      type: 'heading',
      id: 'regulatory-assessment',
      level: 2,
      text: 'Tracking regulatory exposure',
    },
    {
      type: 'paragraph',
      text: 'Identify which regulations apply to your relationship with this vendor:',
    },
    {
      type: 'checklist',
      items: [
        'GDPR, European data protection requirements',
        'HIPAA, US healthcare data requirements',
        'SOC 2, security and availability controls',
        'ISO 27001, information security management',
        'EU AI Act, European AI regulation',
        'CCPA, California consumer privacy',
      ],
    },
    {
      type: 'paragraph',
      text: 'More regulatory exposure means higher risk and more oversight. Make sure vendors can demonstrate compliance with all applicable regulations.',
    },
    {
      type: 'heading',
      id: 'risk-score-calculation',
      level: 2,
      text: 'Understanding risk scores',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise calculates an overall risk score from the scorecard inputs. Higher scores mean greater risk. Things that push the score up include:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Higher data sensitivity levels' },
        { text: 'High business criticality' },
        { text: 'History of past issues' },
        { text: 'Multiple regulatory exposures' },
      ],
    },
    {
      type: 'heading',
      id: 'acting-on-scores',
      level: 2,
      text: 'Acting on risk scores',
    },
    {
      type: 'paragraph',
      text: 'Use risk scores to guide vendor oversight intensity:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Low scores', text: 'Annual reviews; standard monitoring' },
        { bold: 'Medium scores', text: 'Semi-annual reviews; enhanced monitoring' },
        { bold: 'High scores', text: 'Quarterly reviews; active oversight and mitigation planning' },
      ],
    },
    {
      type: 'heading',
      id: 'review-workflow',
      level: 2,
      text: 'Risk review workflow',
    },
    {
      type: 'paragraph',
      text: 'Use the vendor review workflow to track risk assessments:',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Assign a reviewer to conduct the assessment' },
        { text: 'Update review status to "In review"' },
        { text: 'Complete the scorecard fields based on current information' },
        { text: 'Document findings in the review result' },
        { text: 'Set status to "Reviewed" or "Requires follow-up"' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Best practice',
      text: 'Schedule vendor risk reviews based on risk score. High-risk vendors should be reviewed more frequently than low-risk vendors.',
    },
    {
      type: 'heading',
      id: 'research-findings',
      level: 2,
      text: 'Research findings',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise can research a vendor on the web for you. An agent searches public sources for six kinds of risk: security incidents, certification gaps, legal and regulatory actions, AI-specific risks such as customer data being used to train models, outages of the service, and signs that the finances of the vendor threaten the service, such as layoffs, a bankruptcy or a sale of the company. It reads public pages and PDF documents, such as a vendor\'s trust and security pages and its data processing agreement, and obeys each site\'s `robots.txt`. The vendor\'s name and other names, its website, what it provides, the text of the pages it reads and your scorecard answers on data sensitivity, business criticality and regulatory exposure (which help rate how serious a risk is) go to your organization\'s LLM provider; the scorecard answers are never used in a web search. The press does not always use the name in your record ("Facebook" for "Meta Platforms"), so the agent also looks for the other names you list in the vendor\'s **Other names** field and for the names the vendor\'s own home page gives itself, and counts a source that uses one of them as a source about your vendor. The press of Germany, Austria, France, Italy, Spain, the Netherlands, Portugal and Brazil reports in its own language, so a vendor in one of those countries is also searched in that language, with the name of the local data protection authority. The agent reads the country from the **Country** you give the vendor under **Identifiers**, else from the country domain of the vendor\'s website, or from the legal form in its name (GmbH, SAS, S.r.l., B.V. and the like), and a vendor with a .com domain and no such form is searched in English only. For a vendor with no market of another language, the agent names the authority of its country in the news searches about fines and settlements: the FTC for a vendor in the United States or with no known country, the ICO in the United Kingdom, the DPC in Ireland and the OAIC in Australia. The findings are written in English, and a quote keeps the language of its source. The search itself depends on the key the research runs on. A run on an Anthropic key uses Claude\'s own web search, which Anthropic charges for at about $10 per 1,000 searches (a run makes about 20 to 30), and the search results also count as input tokens of the research model; the vendor\'s name and the words of the search go to Anthropic, as the rest of the run already does. A run on any other key searches the news of the last 3 months through the GDELT Project (https://www.gdeltproject.org), a free index of news from around the world, which VerifyWise credits as the source of those results; such a search finds news and does not search the whole web, and the agent says so when a category needs more. For security incidents the agent also looks the vendor up in five public databases, with no search: the CISA catalog of known exploited vulnerabilities, the National Vulnerability Database (its critical vulnerabilities of the last four months), the CVE Program\'s records (its critical vulnerabilities of the last 24 months), Have I Been Pwned (breaches of the domain of your vendor, licensed under CC BY 4.0) and the filings of the SEC (the report of a material cybersecurity incident that a listed vendor files itself in a Form 8-K, Item 1.05). A record counts only when the database names the vendor by its name or by the brand of its domain, letter for letter (the SEC only by its name, or by the SEC CIK you give the vendor), and the agent cites it like any other source. A record of a vulnerability is about a flaw in a product and not necessarily about a breach of the systems of the vendor, and the finding says which it is. For outages of the service the agent also reads the incident history that the vendor publishes on its status page, found by guessing the address from the domain of the vendor, and a finding that rests on it is rated as what it is, the vendor\'s own statement (see the credibility labels below). For legal and regulatory matters the agent also checks the name of the vendor against the sanctions lists of the United States Treasury (the list of Specially Designated Nationals and Blocked Persons, a public list of companies, people and ships that persons of the United States may not deal with), of the United Kingdom and of the European Union. Only companies are checked, and a match by name alone is a reason to find out who the vendor is and never a finding that the vendor is sanctioned, and it is rated Low. The agent also checks the name against the US Consolidated Screening List, which the International Trade Administration compiles from the export control and trade restriction lists of the Departments of Commerce, State and Treasury (the Entity List, the Denied Persons List, the Unverified List, the Military End User List and others; VerifyWise leaves out the Treasury\'s list of Specially Designated Nationals, which it checks above). Several of those lists are export controls and not sanctions lists: a listing on the Entity List, for example, means that an export licence is required to send certain goods or technology to the entity, and it is not a sanction. The lists of Commerce and State do not say whether an entry is a company or a person, so a match can be a person with the same name. A match by name alone is a reason to find out who the vendor is and never a finding that the vendor is on the list, and it is rated Low. For AI-specific risks the agent also checks the name of the vendor against public sources, starting with four: the case studies of MITRE ATLAS (attacks on AI systems that MITRE documents, each marked as an incident, an attack in the wild, or as an exercise, a demonstration by researchers), the crash reports that makers of automated driving systems and of Level 2 driver assistance must file with NHTSA, the road safety agency of the United States (the agent counts them; a report is not a finding of fault, and NHTSA states that its data may be incomplete or unverified), the list of AI-enabled medical devices that the United States Food and Drug Administration has authorized (an authorization is the status of a product and not an incident), and the recalls that the FDA records for the devices on that list (a recall is a company\'s correction or removal of a device, and it is not a finding that the AI failed; the company that recalled a device can be a subsidiary or a distributor of the company on the list, so a recall can be about another company than your vendor). None of these four carries a registration number, so a match is by name alone: it is a reason to find out who the vendor is and never a finding that the vendor was involved, and a finding that rests on such an entry alone is rated Low. These lookups need the website of the vendor: a vendor with none is not looked up in them (the Consolidated Screening List does not need one), and the summary of the run does not list them. More lists, for AI incidents and registers among others, are described under "Credibility labels and the vendor risk database" below. Whoever runs your VerifyWise server can turn these lookups off, and the vendor risk database with them. Before a finding is shown, the agent checks it a second time and leaves it out when its sources are about another company, when its quote does not say what the finding claims, or when the matter is older than the period the agent looks back over. It starts by itself when you add a vendor (whoever runs your VerifyWise server can turn this off), and you can start it again whenever you like. When a run that started by itself finds something, the vendor\'s assignee gets a notification. The results appear as findings in the **Research findings** section on the **Risks** tab of the Vendors page, and nothing is added to your vendor risk register until you review a finding and save it.',
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'Check before you save',
      text: 'Findings are AI-suggested from web sources, so they can be wrong. Each one is a single line until you open it: its risk level, the risk in a sentence, and how well its sources establish it (the credibility line, see below). When there is something to be careful about, a warning under that line says so without a click, for example "Based on search results only: it could not be confirmed on the source pages." when the agent could not confirm the quotes on the pages themselves. Click the risk to open the finding. It then shows why the risk matters to you, what to do about it, why the risk level is what it is (one sentence, and the severity and the likelihood the level is worked out from), and its sources with a quote from each. The risk, "Why it matters to you" and "What to do" go into your register when you save the finding (you can change them in the form first). Read all three texts, open the sources and check that they are about your vendor and say what the finding claims.',
    },
    {
      type: 'paragraph',
      text: 'The section starts with a short summary of what is waiting for you, for example "16 possible risks to review. 10 are high risk." and "Most are about: Legal and regulatory (7), Security incidents (5)." Under it the findings stand in groups, with the highest risk level first in each group: by category when you have chosen a vendor in the vendor filter, and by vendor when all vendors are listed. With a vendor chosen, the summary also says when the vendor was last researched and, in a sentence, what that run could not check ("One source could not be checked, so results may be incomplete: SEC EDGAR."), so that a gap is never read as a clean result. **How it was researched** opens the rest: what the run found in each category, including where it found nothing, which lists and databases it checked, and how many searches and pages it used. The credits that the sources of the research ask for are under the list of findings.',
    },
    {
      type: 'paragraph',
      text: 'For each finding, and for the research itself, you can:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Preview', text: 'Opens the vendor risk form on the finding, already filled in, on the same page. Check the details and change what is not right, then save to add the finding to the vendor risk register as a normal vendor risk. If you close the form without saving, nothing is added and the finding stays in the list. The action owner starts as the vendor\'s assignee, if the assignee is a user of your organization, and otherwise as you; you can change it before you save. You can also edit the risk afterwards like any other risk' },
        { bold: 'Dismiss', text: 'Removes the finding from the list. Choose a reason and, if you like, add a note. Similar findings are not suggested again. Choose "The sources are about another company" or "The sources are out of date" when the research went wrong and not the risk: those two show where the research needs to improve' },
        { bold: 'Research again', text: 'Choose a vendor in the section\'s vendor filter to see when it was last researched and to start a new run. **How it was researched** shows what the latest run found in each category, including where it found nothing. The microscope icon ("Research risks") in a vendor\'s row on the Vendors tab starts a run too, and the Risks tab then opens on that vendor so that you can follow it. While a run is working the section updates by itself and shows what the research is doing now (for example "Searching the web: Security incidents"), the categories it has researched so far and how many searches and pages it has used, and it keeps following the run for as long as it makes progress. If a run makes no progress for about two minutes, the section says "Still running. Check back later." and **Check again** looks again and, if the run has moved on, keeps updating' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Admins and Editors can preview and add findings, dismiss them and start research. Reviewers and Auditors can see the findings but not change them. By default a vendor can be researched again 10 minutes after its last run, and an organization can start 50 runs in 24 hours.',
    },
    {
      type: 'heading',
      id: 'credibility',
      level: 3,
      text: 'Credibility labels and the vendor risk database',
    },
    {
      type: 'paragraph',
      text: 'The vendor risk database is always on. VerifyWise keeps copies of official lists and brings them up to date on a schedule: the CISA catalog of known exploited vulnerabilities every hour, the sanctions lists of the United States Treasury (OFAC), the United Kingdom and the European Union and the US Consolidated Screening List every 6 hours, and the records of the CVE Program, the case studies of MITRE ATLAS, the crash reports of NHTSA, the list of AI-enabled medical devices of the FDA and the FDA\'s recalls of those devices every day (their publishers add to them less often, so most days nothing changes). The newer lists described below are brought up to date every day or every week. The sanctions of the United Nations Security Council reach your runs through the lists of the United Kingdom and the European Union, which include them; such an entry shows its UN reference number. It also keeps what the National Vulnerability Database answers about a vendor for 6 hours, what the SEC answers for 1 hour and what GLEIF, the register of legal entity identifiers, answers about a vendor\'s LEI for 24 hours. A run looks your vendor up in these copies instead of on the web, and each finding shows a credibility label in place of a confidence level. VerifyWise works the label out with fixed rules from the sources the finding cites; the AI model has no say in it. The label tells you how well the sources establish what the finding reports. It says nothing about how likely or how serious the risk is: that is what the likelihood and the severity are for. Whoever runs your VerifyWise server can turn the records, and with them this database, off.',
    },
    {
      type: 'paragraph',
      text: 'A run also checks your vendor against newer kinds of public lists, so that more of what an authority or a court has published about a company of that name reaches the research. For legal and regulatory matters these are lists of enforcement and court cases (penalty and competition cases of the United States Federal Trade Commission, competition cases of the European Commission and of the UK Competition and Markets Authority, consumer protection sanctions in Colombia, and the penalty notices that the United Kingdom publishes for breaches of its financial sanctions), the autonomous sanctions list of Canada, and lists about product safety (vehicle recalls and defect investigations of NHTSA, and the safety notices that makers of medical devices send to the UK regulator). For security incidents, a run checks the list of data breach notices that organizations file with the California Attorney General and a community list of the vulnerability disclosure programs that companies run. For AI-specific risks, it checks lists of AI incidents (court decisions about false content that an AI tool produced in a filing, and a registry of incidents with AI agents) and registers about AI that public bodies and research groups publish. For certifications, it checks the FedRAMP list of cloud services of the United States government and a list of products that follow the C2PA standard for content provenance. When you give a vendor an LEI (a legal entity identifier), a run also looks that identifier up in the company identifier register of GLEIF, which holds the registered name, the country and the registration status of the company. The lists about AI and for certifications are checked only for a vendor with a website.',
    },
    {
      type: 'paragraph',
      text: 'An entry in one of these lists is not a finding about your vendor. A case, an investigation, a recall or a notice says what a court, an authority or a maker did or reported about a company of that name: it does not say that your vendor broke a rule, and a recall or a safety notice is the maker\'s own correction of a product. Most of these lists carry no registration number, so an entry matches your vendor by its name alone and may be another company. The finding then says so, with the note "Matched by name only: this may be another company.", and you check the vendor\'s registration number, address and owners against the entry before you act on it. A few lists match by more than a name: the company identifier register matches only the LEI you give the vendor, the FedRAMP list and the list of vulnerability disclosure programs can match the verified website of your vendor, and the UK records of algorithmic tools can match the registration number of your vendor beside its name.',
    },
    {
      type: 'paragraph',
      text: 'Some of these lists only give background and never raise a risk by themselves: the registers about AI, the index of how openly AI developers disclose their work, the database of AI models, the C2PA and FedRAMP lists, the list of vulnerability disclosure programs and the company identifier register. A run uses an entry of such a list only to add context to a risk that other sources show, and a vendor that is missing from one of them is no risk either. An entry in one of them is no proof that the vendor or its product is safe, compliant or approved: it shows only that the list names the vendor. It is not counted when VerifyWise works out the credibility label of a finding, so a finding that cites nothing else is Low, and its credibility line says so: "Low: only registers that list the vendor are cited, and a register entry is not evidence of a risk." In the credibility line of any other finding, such a list is never named, and the line does not say how old its copy is or that the list withdrew or removed an entry.',
    },
    {
      type: 'paragraph',
      text: 'The CVE Program\'s records are the critical vulnerabilities (a CVSS score of 9.0 or more) of the vendor\'s products that were published in the last 24 months; a record that the CVE Program has rejected is never offered as evidence. Whoever runs your VerifyWise server loads them once in full and VerifyWise then follows the changes of each day. Until that first load a run lists the CVE Program under "Not checked". A record that is later scored below critical is left out of later research, and a finding that already cites it keeps its label. A run credits the records in its Data sources line: CVE records Copyright © 1999-2026, The MITRE Corporation, under the CVE Terms of Use (https://www.cve.org/Legal/TermsOfUse). As the Terms ask, here is MITRE\'s copyright designation, Copyright © 1999-2026, The MITRE Corporation, and the CVE Usage paragraph of the Terms, word for word: MITRE hereby grants you a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable copyright license to reproduce, prepare derivative works of, publicly display, publicly perform, sublicense, and distribute Common Vulnerabilities and Exposures (CVE™). Any copy you make for such purposes is authorized provided that you reproduce MITRE\'s copyright designation and this license in any such copy.',
    },
    {
      type: 'paragraph',
      text: 'The case studies of MITRE ATLAS are published under the Apache License 2.0 (https://www.apache.org/licenses/LICENSE-2.0). A run credits them in its Data sources line with the copyright notice of The MITRE Corporation and the name of the licence, and says that VerifyWise adapted them. The NHTSA crash reports and the FDA list of AI-enabled medical devices are works of the United States Government. A run credits them by name; for the crash reports it also says that VerifyWise counted the reports and that NHTSA states the data may be incomplete or unverified. The Consolidated Screening List is compiled by the International Trade Administration from lists of the United States Government. A run credits it with the Administration\'s notice that the product is not endorsed or certified by it, and says that VerifyWise adapted the entries. The recalls, and the class that the FDA gave each recall, come from openFDA, which releases them under the Creative Commons CC0 1.0 dedication; a run credits them as FDA data through openFDA, joined by VerifyWise to the FDA list of AI-enabled medical devices.',
    },
    {
      type: 'paragraph',
      text: 'The newer lists have licences of their own, and many ask for credit. A run shows the credit of each list that gave it an entry in the **Data sources** line under the list of findings, with a note that VerifyWise adapted the entries: the Open Government Licences of the United Kingdom and of Canada, the Creative Commons licences of several lists (CC BY-SA for the Colombian sanctions list), the notices that United States agencies and the California Attorney General ask for, which say that they do not endorse the entry, and the statement that GLEIF is not associated with VerifyWise. A newer list that gave a run no entry is not credited in it, except the autonomous sanctions list of Canada, which is credited whenever a run asked it.',
    },
    {
      type: 'table',
      columns: [
        { key: 'label', label: 'Credibility', width: '15%' },
        { key: 'when', label: 'When', width: '85%' },
      ],
      rows: [
        { label: 'High', when: 'An official list holds a record that is tied to your vendor by more than its name (for example a vulnerability of its product in the CISA catalog or the National Vulnerability Database, or a sanctions entry that carries your vendor\'s LEI, or its registration number beside its name); a government, regulator or court reports it; the vendor states it itself, either as an event of its own (an incident, an outage, a legal matter or a financial event) or on its status page or its trust, security, privacy, legal, terms or subprocessor pages; or at least two independent trusted publishers report it.' },
        { label: 'Medium', when: 'One trusted publisher reports it, with no official source and no second independent publisher (an entry of a list that matches your vendor by its name alone does not count as a publisher); or a source that would make it High shows it only in search results, because nobody could read the page.' },
        { label: 'Low', when: 'A list entry matches your vendor by its name alone; only unverified sources report it; only registers that list your vendor are cited; only the vendor\'s own claims about itself support it, for example on its product or news pages or in its press releases; the pages do not hold what the search results quoted; or the list has withdrawn, rejected or removed the record.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The credibility line of a finding starts with the label and says why, for example "High: CISA Known Exploited Vulnerabilities lists it (CVE-2026-30001), as of 7 Oct 2026." When the copy of a list was out of date, the line adds the day it was last updated (a list that only gives background, described above, is left out of this). When a cited list entry matches your vendor by its name alone, a note says "Matched by name only: this may be another company." Before you act on such a finding, check the vendor\'s registration number, address and owners against the entry. When you give the vendor its identifiers (see [[Vendor management]](risk-management/vendor-management)), a list that carries the same number matches it by that number instead. The AI-specific lists carry no such number but for the UK records of algorithmic tools, which can name a supplier\'s Companies House number, so an entry of one of them matches by name as a rule. Of the Consolidated Screening List, only the entries of the Treasury\'s lists carry a number or a website, and the Entity List and the other lists of the Departments of Commerce and State carry none: a vendor that really is on the Entity List is therefore shown as Low, with the note that it may be another company, and you check the entry against the official publication of the list yourself, since the Consolidated Screening List is an aid to screening and not the official list. When a list later withdraws, rejects or removes a record that a finding cites, VerifyWise works the label of the finding out again, as long as you have not saved or dismissed the finding, and the record shows its new status from the day it changed; for a vulnerability that was rejected, the line names who rejected it. A vulnerability that the National Vulnerability Database no longer lists among the vendor\'s critical ones is left out of later research, and a finding that already cites it keeps its label. A finding you saved or dismissed is never changed, and nobody is notified.',
    },
    {
      type: 'paragraph',
      text: 'Findings from before credibility labels existed have a confidence level and no label, and the list shows the earlier level where the label would be until VerifyWise rates them again. Such a level carries an asterisk, and its line counts the sources of the finding, for example "Medium*: one source reports it (news.example.com)." A note above the list says what the asterisk means: "* Earlier estimate: 13 of these findings were rated before the current rules for rating sources." When whoever runs your VerifyWise server has them rated, a finding still waiting for your decision is rated with the current rules from what its research run kept, and its line, once you open the finding, ends with "Rated again with the current rule." A source whose page the run did not keep counts as one nobody could read, so a finding that rests on such a source is Medium at most. A finding you already accepted or dismissed keeps the confidence level it had as its label, since that is the level you decided by; the list of findings shows only the ones waiting for your decision.',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Official source', text: 'A government, a regulator, a court or an official database. A page that someone else filed on an official site, such as a company\'s filing or a comment on a public consultation, is unverified' },
        { bold: 'Trusted publisher', text: 'A news publisher that VerifyWise has reviewed, the case studies of MITRE ATLAS, which MITRE writes from published reports, and the entries of five lists that research groups and other organizations publish: the database of court decisions about false content that an AI tool produced, the index of how openly AI developers disclose their work, the database of AI models, the C2PA list and the company identifier register' },
        { bold: 'Vendor\'s own page', text: 'The vendor speaking for itself on its own website, or in a press release that gives an e-mail address on the vendor\'s domain' },
        { bold: 'Unverified source', text: 'Anything else, including what users post on the vendor\'s website and on platforms where anyone can publish, and the entries of the registry of incidents with AI agents and of the community list of vulnerability disclosure programs' },
        { bold: 'Record withdrawn, Record rejected, Removed from the list', text: 'Shown next to a record that its list or database no longer stands by, in the sources of an open finding; a warning on the finding says so without a click. Such a record supports nothing, so the finding is Low unless its other sources earn more' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Each source of such a finding shows one of the first four tags above, once you open the finding. The summary of the run also says what it checked, behind **How it was researched**: **Checked** names the lists and the databases it asked, with the number of records each list held for your vendor (a newer list is named only when it held a record, except the autonomous sanctions list of Canada, which is named whenever it was asked, and the newer lists that were asked and held nothing are counted together, as in "3 more lists with no records"); **Not checked** names the lists and the databases that could not be asked, such as a list that has not been copied yet, so their silence is not a clean result (the summary also says this in a sentence, without a click); **No records in** names the other lists that held nothing, as of the day of their copy; a list whose copy is out of date gets a line with the day it was last updated, whether or not it held a record, and that line is on screen without a click; and **Sources cited** counts the sources of the findings by kind. **Public databases turned off** means the lists were not asked, because whoever runs your server turned the lookups off. **Data sources**, under the list of findings, credits each list that was asked as its owner asks to be credited, and a newer list only when it held a record for your vendor, except the autonomous sanctions list of Canada, which is credited whenever it was asked.',
    },
    {
      type: 'callout',
      variant: 'info',
      title: 'Setup',
      text: 'Research needs an LLM key and nothing else to set up. An Admin adds the key under **Settings → API Keys**, in the LLM Keys section, and the research runs on it. With several keys, an Admin can choose which one to use under **Research settings**, in the Research findings section on the Risks tab: one for the web research, which makes many small calls, and one for the analysis that writes the risks, which can be a stronger model. The same window has a **Scheduled scan** setting, which is off until an Admin chooses how often VerifyWise researches every vendor again: every week, every 2 weeks or every month. A scheduled scan starts a few vendors an hour, uses at most half of the daily limit of runs, analyses only the sources it has not seen before, and tells the person assigned to a vendor when it finds something. Every run, scheduled or not, also keeps the text of the terms, the privacy policy, the data processing agreement, the list of subprocessors and the security page that a vendor publishes on its own website. When one of these pages has changed since the last run, the lines that were added and removed can become the source of a finding, and that source is titled "Change to" followed by the name of the page. The VerifyWise server needs internet access to read public web pages. Without an LLM key, the section says vendor research is not set up and the research buttons are disabled.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'risk-management',
          articleId: 'vendor-management',
          title: 'Vendor management',
          description: 'Manage your complete vendor registry',
        },
        {
          collectionId: 'risk-management',
          articleId: 'risk-assessment',
          title: 'Conducting risk assessments',
          description: 'General risk assessment methodology',
        },
        {
          collectionId: 'risk-management',
          articleId: 'risk-mitigation',
          title: 'Risk mitigation strategies',
          description: 'Implement controls for identified risks',
        },
      ],
    },
  ],
};
