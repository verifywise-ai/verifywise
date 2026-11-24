// vendors strings for de, fr and es. English is the key.
// Spread into ../translations.ts. Other areas stay in that file for now.

export const de: Record<string, string> = {
  "Preview suggested risk": "Vorschau des vorgeschlagenen Risikos",
  "Add vendor risk": "Anbieterrisiko hinzufügen",
  "Vendor list": "Anbieterliste",
  "Vendor risk insights": "Erkenntnisse zu Anbieterrisiken",
  "Risks that the research agent suggested for your vendors. Review each finding, then add it to the vendor risk register or dismiss it.":
    "Risiken, die der Recherche-Agent für Ihre Anbieter vorgeschlagen hat. Prüfen Sie jeden Befund und nehmen Sie ihn dann in das Anbieterrisikoregister auf oder verwerfen Sie ihn.",
  "Heat map, blast radius, duplicates and framework coverage of vendor risks.":
    "Heatmap, Wirkungsradius, Duplikate und Rahmenwerksabdeckung der Anbieterrisiken.",
  "Search vendors...": "Anbieter suchen...",
  "Scorecard": "Bewertungskarte",
  "Security and compliance risks from vendor relationships":
    "Sicherheits- und Compliance-Risiken aus Anbieterbeziehungen",
  "Third-party AI suppliers and their review status": "Drittanbieter für KI und ihr Prüfstatus",
  "Document and track risks associated with your vendors. Assess severity, assign owners, and define mitigation strategies for each vendor-related risk.":
    "Dokumentieren und verfolgen Sie Risiken im Zusammenhang mit Ihren Anbietern. Bewerten Sie Schweregrad, weisen Sie Verantwortliche zu und definieren Sie Minderungsstrategien für jedes anbieterbezogene Risiko.",
  "Register external AI providers and third-party services. Document vendor information, contracts, and compliance requirements in one centralized location.":
    "Registrieren Sie externe KI-Anbieter und Drittanbieterdienste. Dokumentieren Sie Anbieterinformationen, Verträge und Compliance-Anforderungen an einem zentralen Ort.",
  "The table now shows only vendor risks with this risk level. Click the card again to see all risks.":
    "Die Tabelle zeigt jetzt nur Anbieterrisiken mit diesem Risikoniveau an. Klicken Sie erneut auf die Karte, um alle Risiken zu sehen.",
  "Vendor risks by likelihood and severity. Select a cell to see its risks in the Risks tab.":
    "Anbieterrisiken nach Wahrscheinlichkeit und Schweregrad. Wählen Sie eine Zelle, um ihre Risiken im Tab Risiken zu sehen.",
  "Risks the research agent suggested, waiting for your decision":
    "Von der Recherche vorgeschlagene Risiken, die auf Ihre Entscheidung warten",
  "Heat map, blast radius, duplicates and framework coverage of vendor risks":
    "Heatmap, Wirkungsradius, Duplikate und Rahmenwerksabdeckung der Anbieterrisiken",
  "Blast radius": "Wirkungsradius",
  "How many project risks and use cases inherit from the risks of each vendor.":
    "Wie viele Projektrisiken und Anwendungsfälle von den Risiken jedes Anbieters erben.",
  "Vendor {id}": "Anbieter {id}",
  "{linked} of {total}": "{linked} von {total}",
  "Vendors with linked project risks": "Anbieter mit verknüpften Projektrisiken",
  "Inheriting project risks": "Erbende Projektrisiken",
  "Affected use cases": "Betroffene Anwendungsfälle",
  "Vendor risks linked": "Verknüpfte Anbieterrisiken",
  "Vendor risks not linked yet": "Noch nicht verknüpfte Anbieterrisiken",
  "View on map": "Auf der Karte anzeigen",
  "Suggested links": "Vorgeschlagene Verknüpfungen",
  "No vendor risks yet.": "Noch keine Anbieterrisiken.",
  "Duplicate vendor risks": "Doppelte Anbieterrisiken",
  "Risks of the same vendor that look like one risk entered twice.":
    "Risiken desselben Anbieters, die wie ein doppelt erfasstes Risiko aussehen.",
  "{scanned} vendor risks scanned, {compared} pairs compared.":
    "{scanned} Anbieterrisiken geprüft, {compared} Paare verglichen.",
  "This scan hit its size limit, so the list below is a sample rather than every pair.":
    "Dieser Scan hat seine Größenbegrenzung erreicht, daher ist die Liste unten eine Stichprobe und nicht jedes Paar.",
  "No likely duplicates among vendor risks.":
    "Keine wahrscheinlichen Duplikate unter den Anbieterrisiken.",
  "Which vendor risks are not mapped to a framework yet.":
    "Welche Anbieterrisiken noch keinem Rahmenwerk zugeordnet sind.",
  "Active vendor risks": "Aktive Anbieterrisiken",
  "Mapped to a framework": "Einem Rahmenwerk zugeordnet",
  "Frameworks in its use cases": "Rahmenwerke in seinen Anwendungsfällen",
  "Every active vendor risk is mapped to at least one framework.":
    "Jedes aktive Anbieterrisiko ist mindestens einem Rahmenwerk zugeordnet.",
  // Vendor form: other names and identifiers
  "Other names": "Andere Namen",
  "e.g. Facebook, Instagram": "z. B. Facebook, Instagram",
  "Other names this vendor is known by, separated by commas. The research looks for them too.":
    "Andere Namen, unter denen dieser Anbieter bekannt ist, durch Kommas getrennt. Die Recherche sucht auch nach ihnen.",
  "Other names must be at most 500 characters":
    "Andere Namen dürfen höchstens 500 Zeichen lang sein",
  "Other names must be at most 500 characters with a comma and a space between names":
    "Andere Namen dürfen höchstens 500 Zeichen lang sein, mit einem Komma und einem Leerzeichen zwischen den Namen",
  "Other names can list at most 8 names": "Es können höchstens 8 andere Namen angegeben werden",
  "Each of the other names must be between 2 and 80 characters":
    "Jeder der anderen Namen muss zwischen 2 und 80 Zeichen lang sein",
  "Each of the other names must contain a letter or a digit":
    "Jeder der anderen Namen muss einen Buchstaben oder eine Ziffer enthalten",
  "Identifiers (optional)": "Kennungen (optional)",
  "Research uses them to find this exact company, such as its SEC filings and its LEI record, instead of matching by name.":
    "Die Recherche findet damit genau dieses Unternehmen, etwa seine SEC-Meldungen und seinen LEI-Eintrag, statt nach dem Namen zu suchen.",
  "Country": "Land",
  "e.g. DE": "z. B. DE",
  "Registration number": "Registernummer",
  "As the company register writes it": "Wie im Handelsregister eingetragen",
  "20 letters and digits": "20 Buchstaben und Ziffern",
  "SEC CIK": "SEC-CIK",
  "Up to 10 digits": "Bis zu 10 Ziffern",
  "Country must be a two-letter ISO 3166-1 code, such as DE":
    "Das Land muss ein zweibuchstabiger ISO-3166-1-Code sein, z. B. DE",
  "Registration number must be at most 64 characters":
    "Die Registernummer darf höchstens 64 Zeichen lang sein",
  "LEI must be 18 letters or digits followed by 2 check digits":
    "Die LEI muss aus 18 Buchstaben oder Ziffern und 2 Prüfziffern bestehen",
  "LEI check digits do not match": "Die Prüfziffern der LEI stimmen nicht",
  "SEC CIK must be one to ten digits": "Die SEC-CIK muss aus einer bis zehn Ziffern bestehen",
  // Vendor risks page layout
  "The table shows only the risks in the selected heat map cell.":
    "Die Tabelle zeigt nur die Risiken in der ausgewählten Heatmap-Zelle.",
  "Show all risks": "Alle Risiken anzeigen",
  // Vendor research: findings section, run summary and start messages
  "Why this rating": "Warum diese Bewertung",
  "Not confirmed on the page. The quotes come from search results.":
    "Auf der Seite nicht bestätigt. Die Zitate stammen aus Suchergebnissen.",
  "Research findings": "Recherchebefunde",
  "AI-suggested from web sources. Verify before accepting.":
    "KI-Vorschläge aus Webquellen. Vor dem Annehmen prüfen.",
  "Loading research findings": "Recherchebefunde werden geladen",
  "Pending research findings": "Ausstehende Recherchebefunde",
  "Could not load research findings.": "Die Recherchebefunde konnten nicht geladen werden.",
  "Vendor research is not set up.": "Die Anbieterrecherche ist nicht eingerichtet.",
  "Research needs an LLM key.": "Die Recherche benötigt einen LLM-Schlüssel.",
  "Add an LLM key": "LLM-Schlüssel hinzufügen",
  "Research settings": "Recherche-Einstellungen",
  "Choose which LLM key runs the vendor research. The research key makes many small calls, so a fast, inexpensive model is enough. The analysis key writes the risks from what the research found, once per run, so a stronger model can help.":
    "Wählen Sie, welcher LLM-Schlüssel die Anbieterrecherche ausführt. Der Recherche-Schlüssel führt viele kleine Aufrufe aus, daher genügt ein schnelles, günstiges Modell. Der Analyse-Schlüssel verfasst die Risiken aus den Ergebnissen der Recherche, einmal pro Durchlauf, daher kann ein stärkeres Modell helfen.",
  "Research key": "Recherche-Schlüssel",
  "Analysis key": "Analyse-Schlüssel",
  "Newest key (default)": "Neuester Schlüssel (Standard)",
  "Same as the research key (default)": "Wie der Recherche-Schlüssel (Standard)",
  "Scheduled scan": "Geplanter Scan",
  "Off": "Aus",
  "Every week": "Jede Woche",
  "Every 2 weeks": "Alle 2 Wochen",
  "Every month": "Jeden Monat",
  "A scheduled scan researches every vendor again on this schedule and tells its assignee when it finds something. It analyses only sources it has not seen before, and it uses the keys above.":
    "Ein geplanter Scan recherchiert jeden Anbieter nach diesem Zeitplan erneut und benachrichtigt die zugewiesene Person, wenn er etwas findet. Er analysiert nur Quellen, die er noch nicht gesehen hat, und verwendet die oben gewählten Schlüssel.",
  "Loading research settings": "Recherche-Einstellungen werden geladen",
  "Could not load the research settings.":
    "Die Recherche-Einstellungen konnten nicht geladen werden.",
  "Research new vendors automatically": "Neue Anbieter automatisch recherchieren",
  "Starts a research run when a vendor is added. Each run uses the keys above.":
    "Startet eine Recherche, wenn ein Anbieter hinzugefügt wird. Jede Recherche verwendet die oben gewählten Schlüssel.",
  "Automatic research is turned off for this deployment.":
    "Die automatische Recherche ist für diese Installation deaktiviert.",
  "Research settings saved.": "Recherche-Einstellungen gespeichert.",
  "This key gets news only from GDELT, which sometimes refuses requests.":
    "Dieser Schlüssel bezieht Nachrichten nur über GDELT, das Anfragen manchmal ablehnt.",
  "Recent research runs got no news.": "Die letzten Recherchen haben keine Nachrichten gefunden.",
  "Choose an Anthropic key for more reliable news.":
    "Wählen Sie einen Anthropic-Schlüssel für zuverlässigere Nachrichten.",
  "One of the chosen LLM keys no longer exists. Choose the keys again.":
    "Einer der gewählten LLM-Schlüssel existiert nicht mehr. Wählen Sie die Schlüssel erneut.",
  "No pending research findings.": "Keine ausstehenden Recherchebefunde.",
  "Showing {shown} of {total} pending findings. Choose a vendor to see the rest.":
    "{shown} von {total} ausstehenden Befunden werden angezeigt. Wählen Sie einen Anbieter, um den Rest zu sehen.",
  "Risk added to the register": "Risiko zum Risikoregister hinzugefügt",
  "Risk added to the register.": "Risiko zum Risikoregister hinzugefügt.",
  "Open risk": "Risiko öffnen",
  "Review suggested risk": "Vorgeschlagenes Risiko prüfen",
  "Suggested by the research agent from web sources. Check the details, change what is not right, then save to add this risk to the vendor risk register.":
    "Vom Recherche-Agenten aus Webquellen vorgeschlagen. Prüfen Sie die Angaben, ändern Sie, was nicht stimmt, und speichern Sie dann, um dieses Risiko in das Anbieterrisikoregister aufzunehmen.",
  "Risk added, but its custom field values could not be saved. Open the risk to try again.":
    "Das Risiko wurde hinzugefügt, aber die Werte seiner benutzerdefinierten Felder konnten nicht gespeichert werden. Öffnen Sie das Risiko, um es erneut zu versuchen.",
  "Sources": "Quellen",
  "Unknown source": "Unbekannte Quelle",
  "Latest research": "Letzte Recherche",
  "Researching…": "Recherche läuft…",
  "Still running. Check back later.": "Läuft noch. Schauen Sie später noch einmal vorbei.",
  "Research again": "Erneut recherchieren",
  "Starting the research": "Die Recherche wird gestartet",
  "Searching the web": "Das Web wird durchsucht",
  "Searching the web: {category}": "Das Web wird durchsucht: {category}",
  "Reading a page": "Eine Seite wird gelesen",
  "Reading a page: {category}": "Eine Seite wird gelesen: {category}",
  "Analysing what was found": "Die Ergebnisse werden analysiert",
  "Researched so far: {categories}": "Bisher recherchiert: {categories}",
  "No research has run for this vendor yet.":
    "Für diesen Anbieter wurde noch keine Recherche durchgeführt.",
  "Could not load the latest research run.": "Die letzte Recherche konnte nicht geladen werden.",
  "Last run: {date}": "Letzte Ausführung: {date}",
  "Searches: {searches}, pages read: {pages}": "Suchen: {searches}, gelesene Seiten: {pages}",
  "Searched with Claude web search": "Mit der Websuche von Claude gesucht",
  "News searched with the GDELT Project (last 3 months)":
    "Nachrichten mit dem GDELT Project durchsucht (letzte 3 Monate)",
  "{category}: {outcome}": "{category}: {outcome}",
  "AI note (unverified)": "KI-Hinweis (ungeprüft)",
  "Credibility": "Glaubwürdigkeit",
  "Official": "Offiziell",
  "Trusted press": "Vertrauenswürdige Presse",
  "Unverified": "Ungeprüft",
  "Withdrawn": "Zurückgezogen",
  "Delisted": "Von der Liste gestrichen",
  "Matched by name only: this may be another company.":
    "Nur über den Namen zugeordnet: Es kann sich um ein anderes Unternehmen handeln.",
  "Rated again with the current rule.": "Mit der aktuellen Regel neu bewertet.",
  "Rated before the source rules; this is the earlier confidence level until the label is recomputed.":
    "Vor den Quellenregeln bewertet; dies ist die frühere Konfidenzstufe, bis die Bewertung neu berechnet wird.",
  "Earlier rating": "Frühere Bewertung",
  "Rated with the earlier confidence rule.": "Mit der früheren Konfidenzregel bewertet.",
  "High: {operator} lists it ({record}), as of {date}.":
    "Hoch: Verzeichnet ({operator}, {record}), Stand: {date}.",
  "High: {operator} lists it ({record}).": "Hoch: Verzeichnet ({operator}, {record}).",
  "High: {operator} lists it, as of {date}.": "Hoch: Verzeichnet ({operator}), Stand: {date}.",
  "High: {operator} lists it.": "Hoch: Verzeichnet ({operator}).",
  "High: an official source reports it ({host}).":
    "Hoch: Eine offizielle Quelle berichtet darüber ({host}).",
  "High: an official source reports it.": "Hoch: Eine offizielle Quelle berichtet darüber.",
  "High: the vendor states it on its own pages ({host}).":
    "Hoch: Der Anbieter gibt es auf seinen eigenen Seiten an ({host}).",
  "High: the vendor states it on its own pages.":
    "Hoch: Der Anbieter gibt es auf seinen eigenen Seiten an.",
  "High: {count} independent trusted publishers report it ({publishers}).":
    "Hoch: {count} unabhängige vertrauenswürdige Medien berichten darüber ({publishers}).",
  "High: {count} independent trusted publishers report it.":
    "Hoch: {count} unabhängige vertrauenswürdige Medien berichten darüber.",
  "Medium: one trusted publisher reports it ({publisher}); no official source and no second independent publisher.":
    "Mittel: Ein vertrauenswürdiges Medium berichtet darüber ({publisher}); keine offizielle Quelle und kein zweites unabhängiges Medium.",
  "Medium: one trusted publisher reports it; no official source and no second independent publisher.":
    "Mittel: Ein vertrauenswürdiges Medium berichtet darüber; keine offizielle Quelle und kein zweites unabhängiges Medium.",
  "Medium: only search results show it; the pages could not be read.":
    "Mittel: Nur Suchergebnisse zeigen es; die Seiten konnten nicht gelesen werden.",
  "Low: the pages do not hold what the search results quoted.":
    "Niedrig: Die Seiten enthalten nicht, was die Suchergebnisse zitiert haben.",
  "Low: the {list} entry matches the vendor by name only.":
    "Niedrig: Der Eintrag ({list}) stimmt nur dem Namen nach mit dem Anbieter überein.",
  "Low: only unverified sources report it ({hosts}).":
    "Niedrig: Nur ungeprüfte Quellen berichten darüber ({hosts}).",
  "Low: only unverified sources report it.": "Niedrig: Nur ungeprüfte Quellen berichten darüber.",
  "Low: only registers that list the vendor are cited, and a register entry is not evidence of a risk.":
    "Niedrig: Es werden nur Register zitiert, die den Anbieter verzeichnen, und ein Registereintrag ist kein Beleg für ein Risiko.",
  "Low: only the vendor's own claims support it.":
    "Niedrig: Nur die eigenen Angaben des Anbieters stützen es.",
  "Low: {operator} withdrew the record on {date}.":
    "Niedrig: Der Eintrag wurde am {date} zurückgezogen ({operator}).",
  "Low: {operator} withdrew the record.": "Niedrig: Der Eintrag wurde zurückgezogen ({operator}).",
  "Low: {operator} rejected the record on {date}.":
    "Niedrig: Der Eintrag wurde am {date} abgelehnt ({operator}).",
  "Low: {operator} rejected the record.": "Niedrig: Der Eintrag wurde abgelehnt ({operator}).",
  "Low: {operator} removed the record on {date}.":
    "Niedrig: Der Eintrag wurde am {date} entfernt ({operator}).",
  "Low: {operator} removed the record.": "Niedrig: Der Eintrag wurde entfernt ({operator}).",
  "The source has not been updated since {date}.":
    "Die Quelle wurde seit dem {date} nicht aktualisiert.",
  "CISA Known Exploited Vulnerabilities": "CISA Known Exploited Vulnerabilities",
  "OFAC Specially Designated Nationals list": "OFAC-Liste der Specially Designated Nationals",
  "UK Sanctions List": "UK Sanctions List",
  "EU consolidated list of financial sanctions": "Konsolidierte Liste der EU-Finanzsanktionen",
  "the National Vulnerability Database": "National Vulnerability Database",
  "SEC EDGAR": "SEC EDGAR",
  "Have I Been Pwned": "Have I Been Pwned",
  "the vendor's status page": "Statusseite des Anbieters",
  "CISA KEV catalog": "CISA-KEV-Katalog",
  "OFAC SDN list": "OFAC-SDN-Liste",
  "EU financial sanctions list": "EU-Finanzsanktionsliste",
  "National Vulnerability Database": "National Vulnerability Database",
  "vendor's status page": "Statusseite des Anbieters",
  "the CVE Program": "CVE-Programm",
  "UN Security Council Consolidated List": "Konsolidierte Liste des UN-Sicherheitsrats",
  "NVD": "NVD",
  "SEC EDGAR filings": "SEC-EDGAR-Einreichungen",
  "CVE List": "CVE-Liste",
  "US Consolidated Screening List": "Consolidated Screening List der USA",
  "AI Incident Database": "AI Incident Database",
  "MITRE ATLAS case studies": "MITRE-ATLAS-Fallstudien",
  "NHTSA Standing General Order crash reports":
    "NHTSA-Unfallmeldungen nach der Standing General Order",
  "FDA list of AI-enabled medical devices": "FDA-Liste KI-gestützter Medizinprodukte",
  "FDA recalls of AI-enabled medical devices": "FDA-Rückrufe KI-gestützter Medizinprodukte",
  "FDA device recall database": "FDA-Rückrufdatenbank für Medizinprodukte",
  "Consolidated Canadian Autonomous Sanctions List":
    "Konsolidierte kanadische Liste autonomer Sanktionen",
  "UK OFSI financial sanctions enforcement notices":
    "Durchsetzungsmitteilungen des britischen OFSI zu Finanzsanktionen",
  "FTC civil penalty cases": "Zivilstrafverfahren der FTC",
  "FTC civil penalty case list": "Liste der Zivilstrafverfahren der FTC",
  "European Commission competition cases": "Wettbewerbsverfahren der Europäischen Kommission",
  "European Commission antitrust, cartel and DMA case data":
    "Falldaten der Europäischen Kommission zu Kartellrecht, Kartellen und DMA",
  "UK Competition and Markets Authority cases":
    "Verfahren der britischen Competition and Markets Authority",
  "FTC nonmerger enforcement actions":
    "Kartellrechtliche Durchsetzungsmaßnahmen der FTC (ohne Fusionen)",
  "FTC nonmerger enforcement action list":
    "Liste kartellrechtlicher Durchsetzungsmaßnahmen der FTC (ohne Fusionen)",
  "Colombia SIC consumer protection sanctions":
    "Verbraucherschutzsanktionen der kolumbianischen SIC",
  "Colombia SIC consumer protection sanctions list":
    "Liste der Verbraucherschutzsanktionen der kolumbianischen SIC",
  "NHTSA vehicle and equipment recalls": "NHTSA-Rückrufe von Fahrzeugen und Ausrüstung",
  "NHTSA recalls file": "NHTSA-Rückrufdatei",
  "UK MHRA field safety notice lists":
    "Listen der Sicherheitsmitteilungen im Feld der britischen MHRA",
  "NHTSA defect investigations": "NHTSA-Mängeluntersuchungen",
  "NHTSA defect investigations file": "NHTSA-Datei der Mängeluntersuchungen",
  "California Attorney General data breach list":
    "Liste der Datenschutzverletzungen beim Attorney General von Kalifornien",
  "AI Hallucination Cases database": "Datenbank AI Hallucination Cases",
  "PipeRoll Agent Incident Registry": "PipeRoll Agent Incident Registry",
  "Government of Canada AI Register": "KI-Register der Regierung von Kanada",
  "US federal AI use case inventory": "Verzeichnis der KI-Anwendungsfälle der US-Bundesbehörden",
  "UK Algorithmic Transparency Recording Standard records":
    "Einträge nach dem britischen Algorithmic Transparency Recording Standard",
  "UK Algorithmic Transparency Records": "Britische Algorithmic Transparency Records",
  "Dutch Algorithm Register": "Niederländisches Algorithmenregister",
  "Epoch AI Data on AI Models": "Epoch AI Data on AI Models",
  "Foundation Model Transparency Index": "Foundation Model Transparency Index",
  "FedRAMP Marketplace": "FedRAMP Marketplace",
  "FedRAMP Marketplace data": "FedRAMP-Marketplace-Daten",
  "C2PA Conforming Products List": "C2PA Conforming Products List",
  "disclose.io program list": "disclose.io-Programmliste",
  "disclose.io vulnerability disclosure program list":
    "disclose.io-Liste der Programme zur Offenlegung von Schwachstellen",
  "GLEIF LEI records": "GLEIF-LEI-Datensätze",
  "Checked: {sources}": "Geprüft: {sources}",
  "Checked 1 public list or register.": "1 öffentliche Liste oder 1 öffentliches Register geprüft.",
  "Checked {count} public lists and registers.": "{count} öffentliche Listen und Register geprüft.",
  "None had a record.": "Keine enthielt einen Eintrag.",
  "1 had a record: {sources}.": "1 enthielt einen Eintrag: {sources}.",
  "{count} had records: {sources}.": "{count} enthielten Einträge: {sources}.",
  "Also checked: {sources}.": "Außerdem geprüft: {sources}.",
  "Data as of {dates}.": "Datenstand: {dates}.",
  "No records: {sources}.": "Keine Einträge: {sources}.",
  "Show all lists": "Alle Listen anzeigen",
  "Hide the lists": "Listen ausblenden",
  "no risks found": "keine Risiken gefunden",
  "Listed in the FedRAMP Marketplace.": "Im FedRAMP Marketplace gelistet.",
  "Listed in the FedRAMP Marketplace: {status}.": "Im FedRAMP Marketplace gelistet: {status}.",
  "Listed in the FedRAMP Marketplace: {status} since {date}.":
    "Im FedRAMP Marketplace gelistet: {status} seit {date}.",
  "Listed in the FedRAMP Marketplace: {status} since {date}, impact level {impact}.":
    "Im FedRAMP Marketplace gelistet: {status} seit {date}, Auswirkungsstufe {impact}.",
  "Listed in the C2PA Conforming Products List.": "In der C2PA Conforming Products List gelistet.",
  "Listed in the C2PA Conforming Products List: 1 conforming product, since {date}.":
    "In der C2PA Conforming Products List gelistet: 1 konformes Produkt, seit {date}.",
  "Listed in the C2PA Conforming Products List: {count} conforming products, the newest since {date}.":
    "In der C2PA Conforming Products List gelistet: {count} konforme Produkte, das neueste seit {date}.",
  "Not checked: {sources}": "Nicht geprüft: {sources}",
  "{source}: last updated {date}, not up to date":
    "{source}: zuletzt aktualisiert am {date}, nicht aktuell",
  "Sources cited: {official} official, {press} trusted press, {vendor} vendor, {unverified} unverified":
    "Zitierte Quellen: {official} offiziell, {press} vertrauenswürdige Presse, {vendor} Anbieter, {unverified} ungeprüft",
  "Public databases turned off": "Öffentliche Datenbanken ausgeschaltet",
  "Data sources: {attributions}": "Datenquellen: {attributions}",
  "Security incidents": "Sicherheitsvorfälle",
  "Certifications": "Zertifizierungen",
  "Legal and regulatory": "Recht und Regulierung",
  "AI-specific risks": "KI-spezifische Risiken",
  "Availability": "Verfügbarkeit",
  "Financial health": "Finanzielle Stabilität",
  "risks found": "Risiken gefunden",
  "nothing found": "nichts gefunden",
  "risks found, left for the next run":
    "Risiken gefunden, für den nächsten Durchlauf zurückgestellt",
  "could not be researched": "Recherche nicht möglich",
  "skipped": "übersprungen",
  "unknown": "unbekannt",
  "The vendor was not found.": "Der Anbieter wurde nicht gefunden.",
  "No LLM key is configured for your organization.":
    "Für Ihre Organisation ist kein LLM-Schlüssel konfiguriert.",
  "The model call failed with HTTP status {status}.":
    "Der Modellaufruf ist mit HTTP-Status {status} fehlgeschlagen.",
  "The model call timed out.": "Beim Modellaufruf ist eine Zeitüberschreitung aufgetreten.",
  "The model answer did not match the expected format.":
    "Die Antwort des Modells entsprach nicht dem erwarteten Format.",
  "The model call failed unexpectedly.": "Der Modellaufruf ist unerwartet fehlgeschlagen.",
  "The research run failed unexpectedly.": "Die Recherche ist unerwartet fehlgeschlagen.",
  "The findings could not be saved.": "Die Befunde konnten nicht gespeichert werden.",
  "The research run timed out.": "Bei der Recherche ist eine Zeitüberschreitung aufgetreten.",
  "The research run could not be queued.":
    "Die Recherche konnte nicht in die Warteschlange gestellt werden.",
  "The web could not be reached from the server.": "Der Server konnte das Web nicht erreichen.",
  "The model did not carry out the research steps.":
    "Das Modell hat die Recherchenschritte nicht ausgeführt.",
  "The research run failed.": "Die Recherche ist fehlgeschlagen.",
  "The vendor website is missing or is not a valid domain.":
    "Die Website des Anbieters fehlt oder ist keine gültige Domain.",
  "Not researched: the time limit was reached.":
    "Nicht recherchiert: Das Zeitlimit wurde erreicht.",
  "Not researched: the research ended before this category was covered.":
    "Nicht recherchiert: Die Recherche endete, bevor diese Kategorie behandelt wurde.",
  "No risks were found in the sources reviewed.":
    "In den geprüften Quellen wurden keine Risiken gefunden.",
  "No new sources were found since the last run.":
    "Seit dem letzten Durchlauf wurden keine neuen Quellen gefunden.",
  "No risks were found. {failed} of {total} pages could not be read.":
    "Es wurden keine Risiken gefunden. {failed} von {total} Seiten konnten nicht gelesen werden.",
  "No risks were found. {failed} of {total} searches were not available.":
    "Es wurden keine Risiken gefunden. {failed} von {total} Suchen waren nicht verfügbar.",
  "No risks were found. {searchesFailed} of {searches} searches were not available, and {pagesFailed} of {pages} pages could not be read.":
    "Es wurden keine Risiken gefunden. {searchesFailed} von {searches} Suchen waren nicht verfügbar, und {pagesFailed} von {pages} Seiten konnten nicht gelesen werden.",
  "Possible risks were found but could not be verified, or are already recorded.":
    "Es wurden mögliche Risiken gefunden, die sich aber nicht bestätigen ließen oder bereits erfasst sind.",
  "More risks were found than one run keeps.":
    "Es wurden mehr Risiken gefunden, als ein Durchlauf behält.",
  "The search was not available.": "Die Suche war nicht verfügbar.",
  "News search was not available, so this was checked only on the vendor's own pages.":
    "Die Nachrichtensuche war nicht verfügbar, daher wurde nur auf den eigenen Seiten des Anbieters geprüft.",
  "News search was not available, so this was checked only on the vendor's own pages and public databases.":
    "Die Nachrichtensuche war nicht verfügbar, daher wurde nur auf den eigenen Seiten des Anbieters und in öffentlichen Datenbanken geprüft.",
  "News search was not available, so results may be incomplete.":
    "Die Nachrichtensuche war nicht verfügbar, daher sind die Ergebnisse möglicherweise unvollständig.",
  "The pages could not be read.": "Die Seiten konnten nicht gelesen werden.",
  "1 potential risk found": "1 mögliches Risiko gefunden",
  "{count} potential risks found": "{count} mögliche Risiken gefunden",
  "Dismiss finding": "Befund verwerfen",
  "Choose why this finding does not belong in the register. Similar findings are not suggested again.":
    "Wählen Sie, warum dieser Befund nicht ins Risikoregister gehört. Ähnliche Befunde werden nicht erneut vorgeschlagen.",
  "Select a reason": "Grund auswählen",
  "Not applicable to this vendor": "Für diesen Anbieter nicht relevant",
  "Already covered by an existing risk": "Bereits durch ein vorhandenes Risiko abgedeckt",
  "Inaccurate or not supported by the sources": "Ungenau oder durch die Quellen nicht belegt",
  "The sources are about another company": "Die Quellen betreffen ein anderes Unternehmen",
  "The sources are out of date": "Die Quellen sind veraltet",
  "Up to 500 characters.": "Bis zu 500 Zeichen.",
  "Research started for {vendorName}. Findings appear on the Research findings tab.":
    "Recherche für {vendorName} gestartet. Die Befunde erscheinen im Tab Recherchebefunde.",
  "Research is already running for {vendorName}.": "Für {vendorName} läuft bereits eine Recherche.",
  "Research ran recently. Try again in {minutes} min.":
    "Die Recherche lief erst kürzlich. Versuchen Sie es in {minutes} Min. erneut.",
  "The daily research limit for your organization was reached. Try again tomorrow.":
    "Das tägliche Recherchelimit Ihrer Organisation wurde erreicht. Versuchen Sie es morgen erneut.",
  "The research could not be started because the job queue is unavailable. Try again later.":
    "Die Recherche konnte nicht gestartet werden, weil die Aufgabenwarteschlange nicht verfügbar ist. Versuchen Sie es später erneut.",
  "The research could not be started. Try again.":
    "Die Recherche konnte nicht gestartet werden. Versuchen Sie es erneut.",
  "Research risks": "Risiken recherchieren",
  "Finding dismissed.": "Befund verworfen.",
  "This finding no longer exists.": "Dieser Befund existiert nicht mehr.",
  // Research findings in plain words: the summary, the one line of a row, its cautions
  "{count} possible risks to review.": "{count} mögliche Risiken zu prüfen.",
  "1 possible risk to review.": "1 mögliches Risiko zu prüfen.",
  "{count} are high risk.": "{count} davon sind hohe Risiken.",
  "1 is high risk.": "1 davon ist ein hohes Risiko.",
  "All are high risk.": "Alle sind hohe Risiken.",
  "It is high risk.": "Es ist ein hohes Risiko.",
  "Most are about: {topics}.": "Die meisten betreffen: {topics}.",
  "One source could not be checked, so results may be incomplete: {sources}.":
    "Eine Quelle konnte nicht geprüft werden, die Ergebnisse können daher unvollständig sein: {sources}.",
  "{count} sources could not be checked, so results may be incomplete: {sources}.":
    "{count} Quellen konnten nicht geprüft werden, die Ergebnisse können daher unvollständig sein: {sources}.",
  "Last researched: {date}": "Zuletzt recherchiert: {date}",
  "How it was researched": "So wurde recherchiert",
  "Hide research details": "Recherchedetails ausblenden",
  "What the last research found": "Was die letzte Recherche ergab",
  "What it checked": "Was geprüft wurde",
  "* Earlier estimate: 1 of these findings was rated before the current rules for rating sources.":
    "* Frühere Einschätzung: 1 dieser Befunde wurde vor den aktuellen Regeln zur Bewertung von Quellen bewertet.",
  "* Earlier estimate: {count} of these findings were rated before the current rules for rating sources.":
    "* Frühere Einschätzung: {count} dieser Befunde wurden vor den aktuellen Regeln zur Bewertung von Quellen bewertet.",
  "Earlier estimate": "Frühere Einschätzung",
  "{label}*: one source reports it.": "{label}*: Eine Quelle berichtet darüber.",
  "{label}*: one source reports it ({host}).": "{label}*: Eine Quelle berichtet darüber ({host}).",
  "{label}*: {count} sources report it.": "{label}*: {count} Quellen berichten darüber.",
  "{label}*: {count} sources report it ({hosts}).":
    "{label}*: {count} Quellen berichten darüber ({hosts}).",
  "Based on search results only: it could not be confirmed on the source pages.":
    "Beruht nur auf Suchergebnissen: Auf den Seiten der Quellen ließ es sich nicht bestätigen.",
  "A cited record was withdrawn by its source.":
    "Ein zitierter Eintrag wurde von seiner Quelle zurückgezogen.",
  "A cited record was rejected by its source.":
    "Ein zitierter Eintrag wurde von seiner Quelle abgelehnt.",
  "A cited record was removed from its list.":
    "Ein zitierter Eintrag wurde von seiner Liste gestrichen.",
  "Why it matters to you": "Warum das für Sie wichtig ist",
  "What to do": "Was zu tun ist",
  "Why this risk level": "Warum diese Risikostufe",
  "Severity: {severity} · Likelihood: {likelihood}":
    "Schweregrad: {severity} · Wahrscheinlichkeit: {likelihood}",
  "Official source": "Offizielle Quelle",
  "Trusted publisher": "Vertrauenswürdiges Medium",
  "Vendor's own page": "Eigene Seite des Anbieters",
  "Unverified source": "Ungeprüfte Quelle",
  "Record withdrawn": "Eintrag zurückgezogen",
  "Record rejected": "Eintrag abgelehnt",
  "Removed from the list": "Von der Liste gestrichen",
  "Not assessed": "Nicht bewertet",
  "Deleted risk": "Gelöschtes Risiko",
  "This risk was deleted. Restore it to edit it again.":
    "Dieses Risiko wurde gelöscht. Stellen Sie es wieder her, um es erneut zu bearbeiten.",
  "Restore risk": "Risiko wiederherstellen",
  "Risk restored.": "Risiko wiederhergestellt.",
  "Could not restore the risk. Please try again.":
    "Das Risiko konnte nicht wiederhergestellt werden. Bitte versuchen Sie es erneut.",
  "It moves to the deleted risks, where it can be restored.":
    "Es wird zu den gelöschten Risiken verschoben und kann dort wiederhergestellt werden.",
  "No vendors match your search or filters.":
    "Keine Anbieter entsprechen Ihrer Suche oder Ihren Filtern.",
  "No vendor risks match your search or filters.":
    "Keine Anbieterrisiken entsprechen Ihrer Suche oder Ihren Filtern.",
  "Add a new vendor risk": "Neues Anbieterrisiko hinzufügen",
  "All use cases are selected": "Alle Anwendungsfälle sind ausgewählt",
  "An error occurred: {message}": "Ein Fehler ist aufgetreten: {message}",
  "An error occurred.": "Ein Fehler ist aufgetreten.",
  "Please try again.": "Bitte versuchen Sie es erneut.",
  "Delete this vendor?": "Diesen Anbieter löschen?",
  "Document and assess a potential risk associated with your vendor. Provide details of the risk, its impact, and your mitigation plan.":
    "Dokumentieren und bewerten Sie ein mögliches Risiko im Zusammenhang mit Ihrem Anbieter. Beschreiben Sie das Risiko, seine Auswirkungen und Ihren Minderungsplan.",
  "Edit risk": "Risiko bearbeiten",
  "Edit vendor": "Anbieter bearbeiten",
  "Failed to load vendor risks": "Anbieterrisiken konnten nicht geladen werden",
  "Failed to load vendors. Please try again later.":
    "Anbieter konnten nicht geladen werden. Bitte versuchen Sie es später erneut.",
  "Filtering by risk level: {level}": "Gefiltert nach Risikostufe: {level}",
  "Loading vendors": "Anbieter werden geladen",
  "No review date": "Kein Prüfdatum",
  "Please select a use case from the dropdown":
    "Bitte wählen Sie einen Anwendungsfall aus der Liste aus",
  "Vendor contact person must only contain letters, spaces, apostrophes, hyphens and periods":
    "Die Kontaktperson des Anbieters darf nur Buchstaben, Leerzeichen, Apostrophe, Bindestriche und Punkte enthalten",
  "Please select an assignee from the dropdown":
    "Bitte wählen Sie aus der Liste aus, wem der Anbieter zugewiesen ist",
  "Please select a vendor from the dropdown": "Bitte wählen Sie einen Anbieter aus der Liste aus",
  "Please select an action owner from the dropdown":
    "Bitte wählen Sie einen Aktionsverantwortlichen aus der Liste aus",
  "Please select a risk severity from the dropdown":
    "Bitte wählen Sie einen Schweregrad aus der Liste aus",
  "Please select a risk likelihood from the dropdown":
    "Bitte wählen Sie eine Wahrscheinlichkeit aus der Liste aus",
  "Select applicable frameworks": "Anwendbare Rahmenwerke auswählen",
  "This table includes a list of external entities that provide AI-related products, services, or components. You can create and manage all vendors here.":
    "Diese Tabelle enthält externe Stellen, die KI-bezogene Produkte, Dienste oder Komponenten bereitstellen. Hier können Sie alle Anbieter anlegen und verwalten.",
  "This table includes a list of risks related to a vendor. You can create and manage all vendor risks here.":
    "Diese Tabelle enthält die Risiken im Zusammenhang mit Anbietern. Hier können Sie alle Anbieterrisiken anlegen und verwalten.",
  "Update risk details including description, impact assessment, and mitigation plan.":
    "Aktualisieren Sie die Risikodetails, einschließlich Beschreibung, Auswirkungsbewertung und Minderungsplan.",
  "Update vendor details including products/services provided, contact information, and review status.":
    "Aktualisieren Sie die Anbieterdetails, einschließlich bereitgestellter Produkte/Dienste, Kontaktinformationen und Prüfstatus.",
  "Use this form to register a new vendor. Include details about what they provide, who is responsible, and the outcome of your review. Provide enough details so your team can assess risks, responsibilities, and compliance requirements.":
    "Verwenden Sie dieses Formular, um einen neuen Anbieter zu registrieren. Geben Sie an, was er bereitstellt, wer verantwortlich ist und welches Ergebnis Ihre Prüfung hatte. Machen Sie genug Angaben, damit Ihr Team Risiken, Verantwortlichkeiten und Compliance-Anforderungen bewerten kann.",
  "User {id}": "Benutzer {id}",
  "Vendor risks list": "Liste der Anbieterrisiken",
  "Vendor risks - {vendor} ({count})": "Anbieterrisiken - {vendor} ({count})",
  "Vendor risks ({count})": "Anbieterrisiken ({count})",
  "When you delete this vendor, all data related to this vendor will be removed. This action is non-recoverable.":
    "Wenn Sie diesen Anbieter löschen, werden alle zugehörigen Daten entfernt. Diese Aktion kann nicht rückgängig gemacht werden.",
  "Each factor is normalized to a 0-1 scale before applying weights. The final score ranges from 0% (lowest risk) to 100% (highest risk).":
    "Jeder Faktor wird vor der Gewichtung auf eine Skala von 0 bis 1 normalisiert. Der endgültige Wert reicht von 0 % (geringstes Risiko) bis 100 % (höchstes Risiko).",
  "Risk score =": "Risikobewertung =",
  "(Data sensitivity × 30%) +": "(Datensensitivität × 30 %) +",
  "(Business criticality × 30%) +": "(Geschäftskritikalität × 30 %) +",
  "(Past issues × 20%) +": "(Vergangene Probleme × 20 %) +",
  "(Regulatory exposure × 20%)": "(Regulatorische Exposition × 20 %)",
  "CCPA (California)": "CCPA (Kalifornien)",
  "{count} risk": "{count} Risiko",
  "{count} risks": "{count} Risiken",
  "Showing {range} of {total} vendor": "Anzeige: {range} von {total} Anbieter",
  "Showing {range} of {total} vendors": "Anzeige: {range} von {total} Anbietern",
  "Anthropic keys search with Claude's own web search, billed by Anthropic at about $10 per 1,000 searches (about 20 to 30 a run); the search results also count as input tokens of the research model. Other keys search the news with Brave when the organization has a Brave search key, and otherwise the news of the last 3 months through the GDELT Project at no charge.":
    "Anthropic-Schlüssel suchen mit der eigenen Websuche von Claude, die Anthropic mit etwa 10 $ pro 1.000 Suchen berechnet (etwa 20 bis 30 pro Ausführung); die Suchergebnisse zählen außerdem als Eingabe-Token des Recherchemodells. Andere Schlüssel durchsuchen die Nachrichten mit Brave, wenn die Organisation einen Brave-Suchschlüssel hat, und sonst die Nachrichten der letzten 3 Monate über das GDELT Project, kostenlos.",
  "Searched with Brave Search": "Mit Brave Search gesucht",
  "News is searched with Brave.": "Nachrichten werden mit Brave durchsucht.",
  "Save, then add a Brave search key for more reliable news.":
    "Speichern Sie zuerst und fügen Sie dann einen Brave-Suchschlüssel für zuverlässigere Nachrichten hinzu.",
  "Add a Brave search key for more reliable news":
    "Fügen Sie einen Brave-Suchschlüssel für zuverlässigere Nachrichten hinzu",
  "Or choose an Anthropic key.": "Oder wählen Sie einen Anthropic-Schlüssel.",
  "Based on a search excerpt; the source page could not be read.":
    "Beruht auf einem Suchauszug; die Quellseite konnte nicht gelesen werden.",
};

export const fr: Record<string, string> = {
  "Preview suggested risk": "Aperçu du risque suggéré",
  "Add vendor risk": "Ajouter un risque fournisseur",
  "Vendor list": "Liste des fournisseurs",
  "Vendor risk insights": "Analyses des risques fournisseurs",
  "Risks that the research agent suggested for your vendors. Review each finding, then add it to the vendor risk register or dismiss it.":
    "Risques que l'agent de recherche a suggérés pour vos fournisseurs. Examinez chaque résultat, puis ajoutez-le au registre des risques fournisseurs ou rejetez-le.",
  "Heat map, blast radius, duplicates and framework coverage of vendor risks.":
    "Carte thermique, rayon d'impact, doublons et couverture des référentiels des risques fournisseurs.",
  "Search vendors...": "Rechercher des fournisseurs...",
  "Scorecard": "Tableau de bord",
  "Security and compliance risks from vendor relationships":
    "Risques de sécurité et de conformité issus des relations fournisseurs",
  "Third-party AI suppliers and their review status":
    "Fournisseurs IA tiers et leur statut de relecture",
  "Document and track risks associated with your vendors. Assess severity, assign owners, and define mitigation strategies for each vendor-related risk.":
    "Documentez et suivez les risques associés à vos fournisseurs. Évaluez la gravité, attribuez les propriétaires et définissez les stratégies d'atténuation pour chaque risque lié au fournisseur.",
  "Register external AI providers and third-party services. Document vendor information, contracts, and compliance requirements in one centralized location.":
    "Enregistrez les fournisseurs IA externes et les services tiers. Documentez les informations sur les fournisseurs, contrats et exigences de conformité dans un emplacement centralisé.",
  "The table now shows only vendor risks with this risk level. Click the card again to see all risks.":
    "Le tableau affiche maintenant uniquement les risques fournisseur avec ce niveau de risque. Cliquez à nouveau sur la carte pour voir tous les risques.",
  "Vendor risks by likelihood and severity. Select a cell to see its risks in the Risks tab.":
    "Risques fournisseurs par probabilité et gravité. Sélectionnez une cellule pour voir ses risques dans l'onglet Risques.",
  "Risks the research agent suggested, waiting for your decision":
    "Risques suggérés par la recherche, en attente de votre décision",
  "Heat map, blast radius, duplicates and framework coverage of vendor risks":
    "Carte thermique, rayon d'impact, doublons et couverture des référentiels des risques fournisseurs",
  "Blast radius": "Rayon d'impact",
  "How many project risks and use cases inherit from the risks of each vendor.":
    "Combien de risques de projet et de cas d'usage héritent des risques de chaque fournisseur.",
  "Vendor {id}": "Fournisseur {id}",
  "{linked} of {total}": "{linked} sur {total}",
  "Vendors with linked project risks": "Fournisseurs avec risques de projet liés",
  "Inheriting project risks": "Risques de projet héritiers",
  "Affected use cases": "Cas d'usage concernés",
  "Vendor risks linked": "Risques fournisseurs liés",
  "Vendor risks not linked yet": "Risques fournisseurs pas encore liés",
  "View on map": "Voir sur la carte",
  "Suggested links": "Liens suggérés",
  "No vendor risks yet.": "Aucun risque fournisseur pour l'instant.",
  "Duplicate vendor risks": "Risques fournisseurs en double",
  "Risks of the same vendor that look like one risk entered twice.":
    "Risques d'un même fournisseur qui ressemblent à un seul risque saisi deux fois.",
  "{scanned} vendor risks scanned, {compared} pairs compared.":
    "{scanned} risques fournisseurs analysés, {compared} paires comparées.",
  "This scan hit its size limit, so the list below is a sample rather than every pair.":
    "Cette analyse a atteint sa limite de taille ; la liste ci-dessous est donc un échantillon et non l'ensemble des paires.",
  "No likely duplicates among vendor risks.":
    "Aucun doublon probable parmi les risques fournisseurs.",
  "Which vendor risks are not mapped to a framework yet.":
    "Quels risques fournisseurs ne sont pas encore associés à un référentiel.",
  "Active vendor risks": "Risques fournisseurs actifs",
  "Mapped to a framework": "Associés à un référentiel",
  "Frameworks in its use cases": "Référentiels de ses cas d'usage",
  "Every active vendor risk is mapped to at least one framework.":
    "Chaque risque fournisseur actif est associé à au moins un référentiel.",
  // Vendor form: other names and identifiers
  "Other names": "Autres noms",
  "e.g. Facebook, Instagram": "p. ex. Facebook, Instagram",
  "Other names this vendor is known by, separated by commas. The research looks for them too.":
    "Autres noms sous lesquels ce fournisseur est connu, séparés par des virgules. La recherche les prend aussi en compte.",
  "Other names must be at most 500 characters":
    "Les autres noms doivent contenir au plus 500 caractères",
  "Other names must be at most 500 characters with a comma and a space between names":
    "Les autres noms doivent contenir au plus 500 caractères, avec une virgule et une espace entre les noms",
  "Other names can list at most 8 names": "Vous pouvez indiquer au plus 8 autres noms",
  "Each of the other names must be between 2 and 80 characters":
    "Chacun des autres noms doit comporter entre 2 et 80 caractères",
  "Each of the other names must contain a letter or a digit":
    "Chacun des autres noms doit contenir une lettre ou un chiffre",
  "Identifiers (optional)": "Identifiants (facultatif)",
  "Research uses them to find this exact company, such as its SEC filings and its LEI record, instead of matching by name.":
    "La recherche s'en sert pour trouver cette entreprise précise, par exemple ses dépôts auprès de la SEC et sa fiche LEI, au lieu de chercher par le nom.",
  "Country": "Pays",
  "e.g. DE": "p. ex. DE",
  "Registration number": "Numéro d'immatriculation",
  "As the company register writes it": "Tel qu'inscrit au registre du commerce",
  "20 letters and digits": "20 lettres et chiffres",
  "SEC CIK": "CIK de la SEC",
  "Up to 10 digits": "Jusqu'à 10 chiffres",
  "Country must be a two-letter ISO 3166-1 code, such as DE":
    "Le pays doit être un code ISO 3166-1 à deux lettres, par exemple DE",
  "Registration number must be at most 64 characters":
    "Le numéro d'immatriculation doit comporter au plus 64 caractères",
  "LEI must be 18 letters or digits followed by 2 check digits":
    "Le LEI doit comporter 18 lettres ou chiffres suivis de 2 chiffres de contrôle",
  "LEI check digits do not match": "Les chiffres de contrôle du LEI ne correspondent pas",
  "SEC CIK must be one to ten digits": "Le CIK de la SEC doit comporter de un à dix chiffres",
  // Vendor risks page layout
  "The table shows only the risks in the selected heat map cell.":
    "Le tableau n'affiche que les risques de la cellule sélectionnée de la carte thermique.",
  "Show all risks": "Afficher tous les risques",
  // Vendor research: findings section, run summary and start messages
  "Why this rating": "Pourquoi cette évaluation",
  "Not confirmed on the page. The quotes come from search results.":
    "Non confirmé sur la page. Les citations proviennent de résultats de recherche.",
  "Research findings": "Résultats de recherche",
  "AI-suggested from web sources. Verify before accepting.":
    "Suggestions de l'IA issues de sources web. À vérifier avant d'accepter.",
  "Loading research findings": "Chargement des résultats de recherche",
  "Pending research findings": "Résultats de recherche en attente",
  "Could not load research findings.": "Impossible de charger les résultats de recherche.",
  "Vendor research is not set up.": "La recherche sur les fournisseurs n'est pas configurée.",
  "Research needs an LLM key.": "La recherche nécessite une clé LLM.",
  "Add an LLM key": "Ajouter une clé LLM",
  "Research settings": "Paramètres de la recherche",
  "Choose which LLM key runs the vendor research. The research key makes many small calls, so a fast, inexpensive model is enough. The analysis key writes the risks from what the research found, once per run, so a stronger model can help.":
    "Choisissez la clé LLM qui exécute la recherche sur les fournisseurs. La clé de recherche effectue de nombreux petits appels, un modèle rapide et peu coûteux suffit donc. La clé d'analyse rédige les risques à partir de ce que la recherche a trouvé, une fois par exécution : un modèle plus puissant peut aider.",
  "Research key": "Clé de recherche",
  "Analysis key": "Clé d'analyse",
  "Newest key (default)": "Clé la plus récente (par défaut)",
  "Same as the research key (default)": "Identique à la clé de recherche (par défaut)",
  "Scheduled scan": "Analyse planifiée",
  "Off": "Désactivé",
  "Every week": "Chaque semaine",
  "Every 2 weeks": "Toutes les 2 semaines",
  "Every month": "Chaque mois",
  "A scheduled scan researches every vendor again on this schedule and tells its assignee when it finds something. It analyses only sources it has not seen before, and it uses the keys above.":
    "Une analyse planifiée recherche de nouveau chaque fournisseur selon ce calendrier et prévient la personne assignée lorsqu'elle trouve quelque chose. Elle n'analyse que les sources qu'elle n'a pas encore vues et utilise les clés ci-dessus.",
  "Loading research settings": "Chargement des paramètres de la recherche",
  "Could not load the research settings.": "Impossible de charger les paramètres de la recherche.",
  "Research new vendors automatically": "Rechercher automatiquement les nouveaux fournisseurs",
  "Starts a research run when a vendor is added. Each run uses the keys above.":
    "Lance une recherche lorsqu'un fournisseur est ajouté. Chaque recherche utilise les clés ci-dessus.",
  "Automatic research is turned off for this deployment.":
    "La recherche automatique est désactivée pour ce déploiement.",
  "Research settings saved.": "Paramètres de la recherche enregistrés.",
  "This key gets news only from GDELT, which sometimes refuses requests.":
    "Cette clé obtient les actualités uniquement via GDELT, qui refuse parfois les requêtes.",
  "Recent research runs got no news.": "Les dernières recherches n'ont trouvé aucune actualité.",
  "Choose an Anthropic key for more reliable news.":
    "Choisissez une clé Anthropic pour des actualités plus fiables.",
  "One of the chosen LLM keys no longer exists. Choose the keys again.":
    "L'une des clés LLM choisies n'existe plus. Choisissez à nouveau les clés.",
  "No pending research findings.": "Aucun résultat de recherche en attente.",
  "Showing {shown} of {total} pending findings. Choose a vendor to see the rest.":
    "{shown} résultats en attente sur {total} affichés. Choisissez un fournisseur pour voir le reste.",
  "Risk added to the register": "Risque ajouté au registre des risques",
  "Risk added to the register.": "Risque ajouté au registre des risques.",
  "Open risk": "Ouvrir le risque",
  "Review suggested risk": "Vérifier le risque suggéré",
  "Suggested by the research agent from web sources. Check the details, change what is not right, then save to add this risk to the vendor risk register.":
    "Suggéré par l'agent de recherche à partir de sources web. Vérifiez les détails, corrigez ce qui n'est pas exact, puis enregistrez pour ajouter ce risque au registre des risques fournisseurs.",
  "Risk added, but its custom field values could not be saved. Open the risk to try again.":
    "Le risque a été ajouté, mais les valeurs de ses champs personnalisés n'ont pas pu être enregistrées. Ouvrez le risque pour réessayer.",
  "Sources": "Sources",
  "Unknown source": "Source inconnue",
  "Latest research": "Dernière recherche",
  "Researching…": "Recherche en cours…",
  "Still running. Check back later.": "Toujours en cours. Revenez plus tard.",
  "Research again": "Relancer la recherche",
  "Starting the research": "Démarrage de la recherche",
  "Searching the web": "Recherche sur le web",
  "Searching the web: {category}": "Recherche sur le web : {category}",
  "Reading a page": "Lecture d'une page",
  "Reading a page: {category}": "Lecture d'une page : {category}",
  "Analysing what was found": "Analyse des résultats",
  "Researched so far: {categories}": "Déjà étudié : {categories}",
  "No research has run for this vendor yet.":
    "Aucune recherche n'a encore été effectuée pour ce fournisseur.",
  "Could not load the latest research run.": "Impossible de charger la dernière recherche.",
  "Last run: {date}": "Dernière exécution : {date}",
  "Searches: {searches}, pages read: {pages}": "Recherches : {searches}, pages lues : {pages}",
  "Searched with Claude web search": "Recherche effectuée avec la recherche web de Claude",
  "News searched with the GDELT Project (last 3 months)":
    "Actualités recherchées avec le GDELT Project (3 derniers mois)",
  "{category}: {outcome}": "{category} : {outcome}",
  "AI note (unverified)": "Note de l'IA (non vérifiée)",
  "Credibility": "Crédibilité",
  "Official": "Officielle",
  "Trusted press": "Presse fiable",
  "Unverified": "Non vérifiée",
  "Withdrawn": "Retiré",
  "Delisted": "Radié de la liste",
  "Matched by name only: this may be another company.":
    "Correspondance par le nom uniquement : il peut s'agir d'une autre entreprise.",
  "Rated again with the current rule.": "Réévalué avec la règle actuelle.",
  "Rated before the source rules; this is the earlier confidence level until the label is recomputed.":
    "Évalué avant les règles relatives aux sources ; il s'agit du niveau de confiance antérieur, en attendant que l'évaluation soit recalculée.",
  "Earlier rating": "Évaluation antérieure",
  "Rated with the earlier confidence rule.": "Évalué avec l'ancienne règle de confiance.",
  "High: {operator} lists it ({record}), as of {date}.":
    "Élevé : répertorié ({operator}, {record}), à la date du {date}.",
  "High: {operator} lists it ({record}).": "Élevé : répertorié ({operator}, {record}).",
  "High: {operator} lists it, as of {date}.":
    "Élevé : répertorié ({operator}), à la date du {date}.",
  "High: {operator} lists it.": "Élevé : répertorié ({operator}).",
  "High: an official source reports it ({host}).":
    "Élevé : une source officielle le signale ({host}).",
  "High: an official source reports it.": "Élevé : une source officielle le signale.",
  "High: the vendor states it on its own pages ({host}).":
    "Élevé : le fournisseur l'indique sur ses propres pages ({host}).",
  "High: the vendor states it on its own pages.":
    "Élevé : le fournisseur l'indique sur ses propres pages.",
  "High: {count} independent trusted publishers report it ({publishers}).":
    "Élevé : {count} éditeurs fiables indépendants le signalent ({publishers}).",
  "High: {count} independent trusted publishers report it.":
    "Élevé : {count} éditeurs fiables indépendants le signalent.",
  "Medium: one trusted publisher reports it ({publisher}); no official source and no second independent publisher.":
    "Moyen : un éditeur fiable le signale ({publisher}) ; aucune source officielle ni second éditeur indépendant.",
  "Medium: one trusted publisher reports it; no official source and no second independent publisher.":
    "Moyen : un éditeur fiable le signale ; aucune source officielle ni second éditeur indépendant.",
  "Medium: only search results show it; the pages could not be read.":
    "Moyen : seuls des résultats de recherche le montrent ; les pages n'ont pas pu être lues.",
  "Low: the pages do not hold what the search results quoted.":
    "Faible : les pages ne contiennent pas ce que citaient les résultats de recherche.",
  "Low: the {list} entry matches the vendor by name only.":
    "Faible : l'entrée ({list}) ne correspond au fournisseur que par le nom.",
  "Low: only unverified sources report it ({hosts}).":
    "Faible : seules des sources non vérifiées le signalent ({hosts}).",
  "Low: only unverified sources report it.":
    "Faible : seules des sources non vérifiées le signalent.",
  "Low: only registers that list the vendor are cited, and a register entry is not evidence of a risk.":
    "Faible : seuls des registres qui répertorient le fournisseur sont cités, et une entrée de registre n'est pas la preuve d'un risque.",
  "Low: only the vendor's own claims support it.":
    "Faible : seules les affirmations du fournisseur lui-même l'étayent.",
  "Low: {operator} withdrew the record on {date}.":
    "Faible : l'enregistrement a été retiré le {date} ({operator}).",
  "Low: {operator} withdrew the record.": "Faible : l'enregistrement a été retiré ({operator}).",
  "Low: {operator} rejected the record on {date}.":
    "Faible : l'enregistrement a été rejeté le {date} ({operator}).",
  "Low: {operator} rejected the record.": "Faible : l'enregistrement a été rejeté ({operator}).",
  "Low: {operator} removed the record on {date}.":
    "Faible : l'enregistrement a été supprimé le {date} ({operator}).",
  "Low: {operator} removed the record.": "Faible : l'enregistrement a été supprimé ({operator}).",
  "The source has not been updated since {date}.":
    "La source n'a pas été mise à jour depuis le {date}.",
  "CISA Known Exploited Vulnerabilities": "CISA Known Exploited Vulnerabilities",
  "OFAC Specially Designated Nationals list": "liste des Specially Designated Nationals de l'OFAC",
  "UK Sanctions List": "UK Sanctions List",
  "EU consolidated list of financial sanctions":
    "liste consolidée des sanctions financières de l'UE",
  "the National Vulnerability Database": "National Vulnerability Database",
  "SEC EDGAR": "SEC EDGAR",
  "Have I Been Pwned": "Have I Been Pwned",
  "the vendor's status page": "page d'état du fournisseur",
  "CISA KEV catalog": "catalogue KEV de la CISA",
  "OFAC SDN list": "liste SDN de l'OFAC",
  "EU financial sanctions list": "liste des sanctions financières de l'UE",
  "National Vulnerability Database": "National Vulnerability Database",
  "vendor's status page": "page d'état du fournisseur",
  "the CVE Program": "programme CVE",
  "UN Security Council Consolidated List": "liste récapitulative du Conseil de sécurité de l'ONU",
  "NVD": "NVD",
  "SEC EDGAR filings": "dépôts SEC EDGAR",
  "CVE List": "liste CVE",
  "US Consolidated Screening List": "Consolidated Screening List des États-Unis",
  "AI Incident Database": "AI Incident Database",
  "MITRE ATLAS case studies": "études de cas MITRE ATLAS",
  "NHTSA Standing General Order crash reports":
    "rapports d'accident de la NHTSA au titre du Standing General Order",
  "FDA list of AI-enabled medical devices": "liste de la FDA des dispositifs médicaux dotés d'IA",
  "FDA recalls of AI-enabled medical devices":
    "rappels de dispositifs médicaux dotés d'IA enregistrés par la FDA",
  "FDA device recall database": "base de données de la FDA sur les rappels de dispositifs médicaux",
  "Consolidated Canadian Autonomous Sanctions List":
    "liste consolidée des sanctions autonomes canadiennes",
  "UK OFSI financial sanctions enforcement notices":
    "avis d'application des sanctions financières de l'OFSI (Royaume-Uni)",
  "FTC civil penalty cases": "affaires de sanctions civiles de la FTC",
  "FTC civil penalty case list": "liste des affaires de sanctions civiles de la FTC",
  "European Commission competition cases": "affaires de concurrence de la Commission européenne",
  "European Commission antitrust, cartel and DMA case data":
    "données de la Commission européenne sur les affaires d'antitrust, de cartels et du DMA",
  "UK Competition and Markets Authority cases":
    "affaires de la Competition and Markets Authority (Royaume-Uni)",
  "FTC nonmerger enforcement actions":
    "actions de la FTC en matière de concurrence (hors concentrations)",
  "FTC nonmerger enforcement action list":
    "liste des actions de la FTC en matière de concurrence (hors concentrations)",
  "Colombia SIC consumer protection sanctions":
    "sanctions de protection des consommateurs de la SIC (Colombie)",
  "Colombia SIC consumer protection sanctions list":
    "liste des sanctions de protection des consommateurs de la SIC (Colombie)",
  "NHTSA vehicle and equipment recalls": "rappels de véhicules et d'équipements de la NHTSA",
  "NHTSA recalls file": "fichier des rappels de la NHTSA",
  "UK MHRA field safety notice lists": "listes d'avis de sécurité de la MHRA (Royaume-Uni)",
  "NHTSA defect investigations": "enquêtes de la NHTSA sur les défauts",
  "NHTSA defect investigations file": "fichier des enquêtes de la NHTSA sur les défauts",
  "California Attorney General data breach list":
    "liste des violations de données du procureur général de Californie",
  "AI Hallucination Cases database": "base de données AI Hallucination Cases",
  "PipeRoll Agent Incident Registry": "PipeRoll Agent Incident Registry",
  "Government of Canada AI Register": "registre de l'IA du gouvernement du Canada",
  "US federal AI use case inventory":
    "inventaire des cas d'usage de l'IA de l'administration fédérale américaine",
  "UK Algorithmic Transparency Recording Standard records":
    "fiches de l'Algorithmic Transparency Recording Standard (Royaume-Uni)",
  "UK Algorithmic Transparency Records": "fiches de transparence algorithmique (Royaume-Uni)",
  "Dutch Algorithm Register": "registre néerlandais des algorithmes",
  "Epoch AI Data on AI Models": "Epoch AI Data on AI Models",
  "Foundation Model Transparency Index": "Foundation Model Transparency Index",
  "FedRAMP Marketplace": "FedRAMP Marketplace",
  "FedRAMP Marketplace data": "données du FedRAMP Marketplace",
  "C2PA Conforming Products List": "C2PA Conforming Products List",
  "disclose.io program list": "liste des programmes disclose.io",
  "disclose.io vulnerability disclosure program list":
    "liste disclose.io des programmes de divulgation de vulnérabilités",
  "GLEIF LEI records": "enregistrements LEI de la GLEIF",
  "Checked: {sources}": "Sources consultées : {sources}",
  "Checked 1 public list or register.": "1 liste ou registre public consulté.",
  "Checked {count} public lists and registers.": "{count} listes et registres publics consultés.",
  "None had a record.": "Aucun ne contenait d'enregistrement.",
  "1 had a record: {sources}.": "1 contenait un enregistrement : {sources}.",
  "{count} had records: {sources}.": "{count} contenaient des enregistrements : {sources}.",
  "Also checked: {sources}.": "Également consultés : {sources}.",
  "Data as of {dates}.": "Données à la date du {dates}.",
  "No records: {sources}.": "Aucun enregistrement : {sources}.",
  "Show all lists": "Afficher toutes les listes",
  "Hide the lists": "Masquer les listes",
  "no risks found": "aucun risque trouvé",
  "Listed in the FedRAMP Marketplace.": "Répertorié dans le FedRAMP Marketplace.",
  "Listed in the FedRAMP Marketplace: {status}.":
    "Répertorié dans le FedRAMP Marketplace : {status}.",
  "Listed in the FedRAMP Marketplace: {status} since {date}.":
    "Répertorié dans le FedRAMP Marketplace : {status} depuis le {date}.",
  "Listed in the FedRAMP Marketplace: {status} since {date}, impact level {impact}.":
    "Répertorié dans le FedRAMP Marketplace : {status} depuis le {date}, niveau d'impact {impact}.",
  "Listed in the C2PA Conforming Products List.":
    "Répertorié dans la C2PA Conforming Products List.",
  "Listed in the C2PA Conforming Products List: 1 conforming product, since {date}.":
    "Répertorié dans la C2PA Conforming Products List : 1 produit conforme, depuis le {date}.",
  "Listed in the C2PA Conforming Products List: {count} conforming products, the newest since {date}.":
    "Répertorié dans la C2PA Conforming Products List : {count} produits conformes, le plus récent depuis le {date}.",
  "Not checked: {sources}": "Sources non consultées : {sources}",
  "{source}: last updated {date}, not up to date":
    "{source} : dernière mise à jour le {date}, pas à jour",
  "Sources cited: {official} official, {press} trusted press, {vendor} vendor, {unverified} unverified":
    "Sources citées : {official} officielles, {press} presse fiable, {vendor} fournisseur, {unverified} non vérifiées",
  "Public databases turned off": "Bases de données publiques désactivées",
  "Data sources: {attributions}": "Sources des données : {attributions}",
  "Security incidents": "Incidents de sécurité",
  "Certifications": "Certifications",
  "Legal and regulatory": "Juridique et réglementaire",
  "AI-specific risks": "Risques propres à l'IA",
  "Availability": "Disponibilité",
  "Financial health": "Santé financière",
  "risks found": "risques trouvés",
  "nothing found": "rien trouvé",
  "risks found, left for the next run": "risques trouvés, reportés à la prochaine exécution",
  "could not be researched": "recherche impossible",
  "skipped": "ignoré",
  "unknown": "inconnu",
  "The vendor was not found.": "Le fournisseur est introuvable.",
  "No LLM key is configured for your organization.":
    "Aucune clé LLM n'est configurée pour votre organisation.",
  "The model call failed with HTTP status {status}.":
    "L'appel au modèle a échoué avec le statut HTTP {status}.",
  "The model call timed out.": "L'appel au modèle a expiré.",
  "The model answer did not match the expected format.":
    "La réponse du modèle ne correspondait pas au format attendu.",
  "The model call failed unexpectedly.": "L'appel au modèle a échoué de manière inattendue.",
  "The research run failed unexpectedly.": "La recherche a échoué de manière inattendue.",
  "The findings could not be saved.": "Les résultats n'ont pas pu être enregistrés.",
  "The research run timed out.": "La recherche a expiré.",
  "The research run could not be queued.": "La recherche n'a pas pu être mise en file d'attente.",
  "The web could not be reached from the server.": "Le serveur n'a pas pu accéder au web.",
  "The model did not carry out the research steps.":
    "Le modèle n'a pas exécuté les étapes de la recherche.",
  "The research run failed.": "La recherche a échoué.",
  "The vendor website is missing or is not a valid domain.":
    "Le site web du fournisseur est absent ou n'est pas un domaine valide.",
  "Not researched: the time limit was reached.":
    "Non recherché : la limite de temps a été atteinte.",
  "Not researched: the research ended before this category was covered.":
    "Non recherché : la recherche s'est terminée avant que cette catégorie ne soit couverte.",
  "No risks were found in the sources reviewed.":
    "Aucun risque n'a été trouvé dans les sources examinées.",
  "No new sources were found since the last run.":
    "Aucune nouvelle source n'a été trouvée depuis la dernière exécution.",
  "No risks were found. {failed} of {total} pages could not be read.":
    "Aucun risque n'a été trouvé. {failed} pages sur {total} n'ont pas pu être lues.",
  "No risks were found. {failed} of {total} searches were not available.":
    "Aucun risque n'a été trouvé. {failed} recherches sur {total} n'étaient pas disponibles.",
  "No risks were found. {searchesFailed} of {searches} searches were not available, and {pagesFailed} of {pages} pages could not be read.":
    "Aucun risque n'a été trouvé. {searchesFailed} recherches sur {searches} n'étaient pas disponibles, et {pagesFailed} pages sur {pages} n'ont pas pu être lues.",
  "Possible risks were found but could not be verified, or are already recorded.":
    "Des risques possibles ont été trouvés, mais ils n'ont pas pu être vérifiés ou sont déjà enregistrés.",
  "More risks were found than one run keeps.":
    "Plus de risques ont été trouvés qu'une exécution n'en conserve.",
  "The search was not available.": "La recherche n'était pas disponible.",
  "News search was not available, so this was checked only on the vendor's own pages.":
    "La recherche d'actualités n'était pas disponible, la vérification s'est donc limitée aux pages du fournisseur.",
  "News search was not available, so this was checked only on the vendor's own pages and public databases.":
    "La recherche d'actualités n'était pas disponible, la vérification s'est donc limitée aux pages du fournisseur et aux bases de données publiques.",
  "News search was not available, so results may be incomplete.":
    "La recherche d'actualités n'était pas disponible, les résultats peuvent donc être incomplets.",
  "The pages could not be read.": "Les pages n'ont pas pu être lues.",
  "1 potential risk found": "1 risque potentiel trouvé",
  "{count} potential risks found": "{count} risques potentiels trouvés",
  "Dismiss finding": "Rejeter le résultat",
  "Choose why this finding does not belong in the register. Similar findings are not suggested again.":
    "Indiquez pourquoi ce résultat n'a pas sa place dans le registre des risques. Les résultats similaires ne seront plus suggérés.",
  "Select a reason": "Sélectionnez une raison",
  "Not applicable to this vendor": "Non applicable à ce fournisseur",
  "Already covered by an existing risk": "Déjà couvert par un risque existant",
  "Inaccurate or not supported by the sources": "Inexact ou non étayé par les sources",
  "The sources are about another company": "Les sources concernent une autre entreprise",
  "The sources are out of date": "Les sources sont obsolètes",
  "Up to 500 characters.": "500 caractères maximum.",
  "Research started for {vendorName}. Findings appear on the Research findings tab.":
    "Recherche lancée pour {vendorName}. Les résultats apparaissent dans l'onglet Résultats de recherche.",
  "Research is already running for {vendorName}.":
    "Une recherche est déjà en cours pour {vendorName}.",
  "Research ran recently. Try again in {minutes} min.":
    "Une recherche a été effectuée récemment. Réessayez dans {minutes} min.",
  "The daily research limit for your organization was reached. Try again tomorrow.":
    "La limite quotidienne de recherches de votre organisation a été atteinte. Réessayez demain.",
  "The research could not be started because the job queue is unavailable. Try again later.":
    "La recherche n'a pas pu être lancée car la file d'attente des tâches est indisponible. Réessayez plus tard.",
  "The research could not be started. Try again.":
    "La recherche n'a pas pu être lancée. Réessayez.",
  "Research risks": "Rechercher les risques",
  "Finding dismissed.": "Résultat rejeté.",
  "This finding no longer exists.": "Ce résultat n'existe plus.",
  // Research findings in plain words: the summary, the one line of a row, its cautions
  "{count} possible risks to review.": "{count} risques possibles à examiner.",
  "1 possible risk to review.": "1 risque possible à examiner.",
  "{count} are high risk.": "{count} présentent un risque élevé.",
  "1 is high risk.": "1 présente un risque élevé.",
  "All are high risk.": "Tous présentent un risque élevé.",
  "It is high risk.": "Il présente un risque élevé.",
  "Most are about: {topics}.": "La plupart concernent : {topics}.",
  "One source could not be checked, so results may be incomplete: {sources}.":
    "Une source n'a pas pu être consultée, les résultats peuvent donc être incomplets : {sources}.",
  "{count} sources could not be checked, so results may be incomplete: {sources}.":
    "{count} sources n'ont pas pu être consultées, les résultats peuvent donc être incomplets : {sources}.",
  "Last researched: {date}": "Dernière recherche : {date}",
  "How it was researched": "Comment la recherche a été menée",
  "Hide research details": "Masquer les détails de la recherche",
  "What the last research found": "Ce que la dernière recherche a trouvé",
  "What it checked": "Ce qui a été consulté",
  "* Earlier estimate: 1 of these findings was rated before the current rules for rating sources.":
    "* Estimation antérieure : 1 de ces résultats a été évalué avant les règles actuelles d'évaluation des sources.",
  "* Earlier estimate: {count} of these findings were rated before the current rules for rating sources.":
    "* Estimation antérieure : {count} de ces résultats ont été évalués avant les règles actuelles d'évaluation des sources.",
  "Earlier estimate": "Estimation antérieure",
  "{label}*: one source reports it.": "{label}* : une source le signale.",
  "{label}*: one source reports it ({host}).": "{label}* : une source le signale ({host}).",
  "{label}*: {count} sources report it.": "{label}* : {count} sources le signalent.",
  "{label}*: {count} sources report it ({hosts}).":
    "{label}* : {count} sources le signalent ({hosts}).",
  "Based on search results only: it could not be confirmed on the source pages.":
    "Repose uniquement sur des résultats de recherche : les pages des sources n'ont pas permis de le confirmer.",
  "A cited record was withdrawn by its source.":
    "Un enregistrement cité a été retiré par sa source.",
  "A cited record was rejected by its source.":
    "Un enregistrement cité a été rejeté par sa source.",
  "A cited record was removed from its list.": "Un enregistrement cité a été radié de sa liste.",
  "Why it matters to you": "Pourquoi cela vous concerne",
  "What to do": "Que faire",
  "Why this risk level": "Pourquoi ce niveau de risque",
  "Severity: {severity} · Likelihood: {likelihood}":
    "Gravité : {severity} · Probabilité : {likelihood}",
  "Official source": "Source officielle",
  "Trusted publisher": "Éditeur fiable",
  "Vendor's own page": "Page du fournisseur lui-même",
  "Unverified source": "Source non vérifiée",
  "Record withdrawn": "Enregistrement retiré",
  "Record rejected": "Enregistrement rejeté",
  "Removed from the list": "Radié de la liste",
  "Not assessed": "Non évalué",
  "Deleted risk": "Risque supprimé",
  "This risk was deleted. Restore it to edit it again.":
    "Ce risque a été supprimé. Restaurez-le pour le modifier à nouveau.",
  "Restore risk": "Restaurer le risque",
  "Risk restored.": "Risque restauré.",
  "Could not restore the risk. Please try again.":
    "Impossible de restaurer le risque. Veuillez réessayer.",
  "It moves to the deleted risks, where it can be restored.":
    "Il est déplacé vers les risques supprimés, où il peut être restauré.",
  "No vendors match your search or filters.":
    "Aucun fournisseur ne correspond à votre recherche ou à vos filtres.",
  "No vendor risks match your search or filters.":
    "Aucun risque fournisseur ne correspond à votre recherche ou à vos filtres.",
  "Add a new vendor risk": "Ajouter un nouveau risque fournisseur",
  "All use cases are selected": "Tous les cas d'usage sont sélectionnés",
  "An error occurred: {message}": "Une erreur s'est produite : {message}",
  "An error occurred.": "Une erreur s'est produite.",
  "Please try again.": "Veuillez réessayer.",
  "Delete this vendor?": "Supprimer ce fournisseur ?",
  "Document and assess a potential risk associated with your vendor. Provide details of the risk, its impact, and your mitigation plan.":
    "Documentez et évaluez un risque potentiel lié à votre fournisseur. Décrivez le risque, son impact et votre plan d'atténuation.",
  "Edit risk": "Modifier le risque",
  "Edit vendor": "Modifier le fournisseur",
  "Failed to load vendor risks": "Impossible de charger les risques fournisseurs",
  "Failed to load vendors. Please try again later.":
    "Impossible de charger les fournisseurs. Veuillez réessayer plus tard.",
  "Filtering by risk level: {level}": "Filtré par niveau de risque : {level}",
  "Loading vendors": "Chargement des fournisseurs",
  "No review date": "Aucune date de révision",
  "Please select a use case from the dropdown":
    "Veuillez sélectionner un cas d'usage dans la liste",
  "Vendor contact person must only contain letters, spaces, apostrophes, hyphens and periods":
    "La personne de contact du fournisseur ne peut contenir que des lettres, des espaces, des apostrophes, des traits d'union et des points",
  "Please select an assignee from the dropdown":
    "Veuillez sélectionner une personne assignée dans la liste",
  "Please select a vendor from the dropdown": "Veuillez sélectionner un fournisseur dans la liste",
  "Please select an action owner from the dropdown":
    "Veuillez sélectionner un responsable d'action dans la liste",
  "Please select a risk severity from the dropdown":
    "Veuillez sélectionner une gravité dans la liste",
  "Please select a risk likelihood from the dropdown":
    "Veuillez sélectionner une probabilité dans la liste",
  "Select applicable frameworks": "Sélectionner les référentiels applicables",
  "This table includes a list of external entities that provide AI-related products, services, or components. You can create and manage all vendors here.":
    "Ce tableau liste les entités externes qui fournissent des produits, services ou composants liés à l'IA. Vous pouvez y créer et gérer tous les fournisseurs.",
  "This table includes a list of risks related to a vendor. You can create and manage all vendor risks here.":
    "Ce tableau liste les risques liés aux fournisseurs. Vous pouvez y créer et gérer tous les risques fournisseurs.",
  "Update risk details including description, impact assessment, and mitigation plan.":
    "Mettez à jour les détails du risque : description, évaluation de l'impact et plan d'atténuation.",
  "Update vendor details including products/services provided, contact information, and review status.":
    "Mettez à jour les détails du fournisseur : produits/services fournis, coordonnées et statut de relecture.",
  "Use this form to register a new vendor. Include details about what they provide, who is responsible, and the outcome of your review. Provide enough details so your team can assess risks, responsibilities, and compliance requirements.":
    "Utilisez ce formulaire pour enregistrer un nouveau fournisseur. Indiquez ce qu'il fournit, qui en est responsable et le résultat de votre relecture. Donnez assez de détails pour que votre équipe puisse évaluer les risques, les responsabilités et les exigences de conformité.",
  "User {id}": "Utilisateur {id}",
  "Vendor risks list": "Liste des risques fournisseurs",
  "Vendor risks - {vendor} ({count})": "Risques fournisseurs - {vendor} ({count})",
  "Vendor risks ({count})": "Risques fournisseurs ({count})",
  "When you delete this vendor, all data related to this vendor will be removed. This action is non-recoverable.":
    "Si vous supprimez ce fournisseur, toutes les données qui s'y rapportent seront supprimées. Cette action est irréversible.",
  "Each factor is normalized to a 0-1 scale before applying weights. The final score ranges from 0% (lowest risk) to 100% (highest risk).":
    "Chaque facteur est ramené sur une échelle de 0 à 1 avant d'appliquer les pondérations. Le score final va de 0 % (risque le plus faible) à 100 % (risque le plus élevé).",
  "Risk score =": "Score de risque =",
  "(Data sensitivity × 30%) +": "(Sensibilité des données × 30 %) +",
  "(Business criticality × 30%) +": "(Criticité métier × 30 %) +",
  "(Past issues × 20%) +": "(Problèmes passés × 20 %) +",
  "(Regulatory exposure × 20%)": "(Exposition réglementaire × 20 %)",
  "CCPA (California)": "CCPA (Californie)",
  "{count} risk": "{count} risque",
  "{count} risks": "{count} risques",
  "Showing {range} of {total} vendor": "Affichage de {range} sur {total} fournisseur",
  "Showing {range} of {total} vendors": "Affichage de {range} sur {total} fournisseurs",
  "Anthropic keys search with Claude's own web search, billed by Anthropic at about $10 per 1,000 searches (about 20 to 30 a run); the search results also count as input tokens of the research model. Other keys search the news with Brave when the organization has a Brave search key, and otherwise the news of the last 3 months through the GDELT Project at no charge.":
    "Les clés Anthropic effectuent leurs recherches avec la recherche web propre à Claude, facturée par Anthropic à environ 10 $ les 1 000 recherches (environ 20 à 30 par exécution) ; les résultats de recherche comptent aussi comme jetons d'entrée du modèle de recherche. Les autres clés recherchent dans les actualités avec Brave lorsque l'organisation a une clé de recherche Brave, et sinon dans les actualités des 3 derniers mois via le GDELT Project, sans frais.",
  "Searched with Brave Search": "Recherche effectuée avec Brave Search",
  "News is searched with Brave.": "Les actualités sont recherchées avec Brave.",
  "Save, then add a Brave search key for more reliable news.":
    "Enregistrez d'abord, puis ajoutez une clé de recherche Brave pour des actualités plus fiables.",
  "Add a Brave search key for more reliable news":
    "Ajoutez une clé de recherche Brave pour des actualités plus fiables",
  "Or choose an Anthropic key.": "Ou choisissez une clé Anthropic.",
  "Based on a search excerpt; the source page could not be read.":
    "D'après un extrait de recherche ; la page source n'a pas pu être lue.",
};

export const es: Record<string, string> = {
  "Preview suggested risk": "Vista previa del riesgo sugerido",
  "Add vendor risk": "Añadir riesgo de proveedor",
  "Vendor list": "Lista de proveedores",
  "Vendor risk insights": "Información sobre los riesgos del proveedor",
  "Risks that the research agent suggested for your vendors. Review each finding, then add it to the vendor risk register or dismiss it.":
    "Riesgos que el agente de investigación sugirió para sus proveedores. Revise cada hallazgo y luego añádalo al registro de riesgos de proveedores o descártelo.",
  "Heat map, blast radius, duplicates and framework coverage of vendor risks.":
    "Mapa de calor, radio de impacto, duplicados y cobertura del marco de los riesgos de proveedor.",
  "Search vendors...": "Buscar proveedores...",
  "Scorecard": "Cuadro de mando",
  "Security and compliance risks from vendor relationships":
    "Riesgos de seguridad y cumplimiento derivados de las relaciones con proveedores",
  "Third-party AI suppliers and their review status":
    "Proveedores de IA externos y su estado de revisión",
  "Document and track risks associated with your vendors. Assess severity, assign owners, and define mitigation strategies for each vendor-related risk.":
    "Documente y haga un seguimiento de los riesgos asociados a sus proveedores. Evalúe la gravedad, asigne responsables y defina estrategias de mitigación para cada riesgo relacionado con un proveedor.",
  "Register external AI providers and third-party services. Document vendor information, contracts, and compliance requirements in one centralized location.":
    "Registre proveedores de IA externos y servicios de terceros. Documente la información de los proveedores, los contratos y los requisitos de cumplimiento en una ubicación centralizada.",
  "The table now shows only vendor risks with this risk level. Click the card again to see all risks.":
    "La tabla ahora muestra solo los riesgos de proveedor con este nivel de riesgo. Haz clic de nuevo en la tarjeta para ver todos los riesgos.",
  "Vendor risks by likelihood and severity. Select a cell to see its risks in the Risks tab.":
    "Riesgos del proveedor por probabilidad y gravedad. Seleccione una celda para ver sus riesgos en la pestaña Riesgos.",
  "Risks the research agent suggested, waiting for your decision":
    "Riesgos que sugirió la investigación, a la espera de su decisión",
  "Heat map, blast radius, duplicates and framework coverage of vendor risks":
    "Mapa de calor, radio de impacto, duplicados y cobertura del marco de los riesgos de proveedor",
  "Blast radius": "Radio de impacto",
  "How many project risks and use cases inherit from the risks of each vendor.":
    "Cuántos riesgos de proyecto y casos de uso heredan de los riesgos de cada proveedor.",
  "Vendor {id}": "Proveedor {id}",
  "{linked} of {total}": "{linked} de {total}",
  "Vendors with linked project risks": "Proveedores con riesgos de proyecto vinculados",
  "Inheriting project risks": "Riesgos de proyecto que heredan",
  "Affected use cases": "Casos de uso afectados",
  "Vendor risks linked": "Riesgos del proveedor vinculados",
  "Vendor risks not linked yet": "Riesgos del proveedor aún sin vincular",
  "View on map": "Ver en el mapa",
  "Suggested links": "Vínculos sugeridos",
  "No vendor risks yet.": "Todavía no hay riesgos del proveedor.",
  "Duplicate vendor risks": "Riesgos del proveedor duplicados",
  "Risks of the same vendor that look like one risk entered twice.":
    "Riesgos del mismo proveedor que parecen un solo riesgo introducido dos veces.",
  "{scanned} vendor risks scanned, {compared} pairs compared.":
    "{scanned} riesgos del proveedor analizados, {compared} pares comparados.",
  "This scan hit its size limit, so the list below is a sample rather than every pair.":
    "Este análisis alcanzó su límite de tamaño, así que la lista de abajo es una muestra y no todos los pares.",
  "No likely duplicates among vendor risks.":
    "No hay duplicados probables entre los riesgos del proveedor.",
  "Which vendor risks are not mapped to a framework yet.":
    "Qué riesgos del proveedor aún no están asignados a un marco.",
  "Active vendor risks": "Riesgos del proveedor activos",
  "Mapped to a framework": "Asignados a un marco",
  "Frameworks in its use cases": "Marcos en sus casos de uso",
  "Every active vendor risk is mapped to at least one framework.":
    "Cada riesgo del proveedor activo está asignado al menos a un marco.",
  // Vendor form: other names and identifiers
  "Other names": "Otros nombres",
  "e.g. Facebook, Instagram": "p. ej. Facebook, Instagram",
  "Other names this vendor is known by, separated by commas. The research looks for them too.":
    "Otros nombres con los que se conoce a este proveedor, separados por comas. La investigación también los busca.",
  "Other names must be at most 500 characters":
    "Los otros nombres deben tener como máximo 500 caracteres",
  "Other names must be at most 500 characters with a comma and a space between names":
    "Los otros nombres deben tener como máximo 500 caracteres, con una coma y un espacio entre los nombres",
  "Other names can list at most 8 names": "Se pueden indicar como máximo 8 otros nombres",
  "Each of the other names must be between 2 and 80 characters":
    "Cada uno de los otros nombres debe tener entre 2 y 80 caracteres",
  "Each of the other names must contain a letter or a digit":
    "Cada uno de los otros nombres debe contener una letra o un dígito",
  "Identifiers (optional)": "Identificadores (opcional)",
  "Research uses them to find this exact company, such as its SEC filings and its LEI record, instead of matching by name.":
    "La investigación los usa para encontrar esta empresa exacta, como sus registros ante la SEC y su ficha LEI, en lugar de buscar por el nombre.",
  "Country": "País",
  "e.g. DE": "p. ej., DE",
  "Registration number": "Número de registro",
  "As the company register writes it": "Tal como figura en el registro mercantil",
  "20 letters and digits": "20 letras y dígitos",
  "SEC CIK": "CIK de la SEC",
  "Up to 10 digits": "Hasta 10 dígitos",
  "Country must be a two-letter ISO 3166-1 code, such as DE":
    "El país debe ser un código ISO 3166-1 de dos letras, por ejemplo DE",
  "Registration number must be at most 64 characters":
    "El número de registro debe tener como máximo 64 caracteres",
  "LEI must be 18 letters or digits followed by 2 check digits":
    "El LEI debe tener 18 letras o dígitos seguidos de 2 dígitos de control",
  "LEI check digits do not match": "Los dígitos de control del LEI no coinciden",
  "SEC CIK must be one to ten digits": "El CIK de la SEC debe tener entre uno y diez dígitos",
  // Vendor risks page layout
  "The table shows only the risks in the selected heat map cell.":
    "La tabla muestra solo los riesgos de la celda seleccionada del mapa de calor.",
  "Show all risks": "Mostrar todos los riesgos",
  // Vendor research: findings section, run summary and start messages
  "Why this rating": "Por qué esta valoración",
  "Not confirmed on the page. The quotes come from search results.":
    "No confirmado en la página. Las citas proceden de resultados de búsqueda.",
  "Research findings": "Hallazgos de la investigación",
  "AI-suggested from web sources. Verify before accepting.":
    "Sugerencias de la IA a partir de fuentes web. Verifique antes de aceptar.",
  "Loading research findings": "Cargando los hallazgos de la investigación",
  "Pending research findings": "Hallazgos de investigación pendientes",
  "Could not load research findings.": "No se pudieron cargar los hallazgos de la investigación.",
  "Vendor research is not set up.": "La investigación de proveedores no está configurada.",
  "Research needs an LLM key.": "La investigación necesita una clave de LLM.",
  "Add an LLM key": "Añadir una clave de LLM",
  "Research settings": "Ajustes de la investigación",
  "Choose which LLM key runs the vendor research. The research key makes many small calls, so a fast, inexpensive model is enough. The analysis key writes the risks from what the research found, once per run, so a stronger model can help.":
    "Elija qué clave de LLM ejecuta la investigación de proveedores. La clave de investigación hace muchas llamadas pequeñas, así que basta un modelo rápido y económico. La clave de análisis redacta los riesgos a partir de lo que encontró la investigación, una vez por ejecución, por lo que un modelo más potente puede ayudar.",
  "Research key": "Clave de investigación",
  "Analysis key": "Clave de análisis",
  "Newest key (default)": "Clave más reciente (predeterminada)",
  "Same as the research key (default)": "Igual que la clave de investigación (predeterminada)",
  "Scheduled scan": "Análisis programado",
  "Off": "Desactivado",
  "Every week": "Cada semana",
  "Every 2 weeks": "Cada 2 semanas",
  "Every month": "Cada mes",
  "A scheduled scan researches every vendor again on this schedule and tells its assignee when it finds something. It analyses only sources it has not seen before, and it uses the keys above.":
    "Un análisis programado vuelve a investigar a cada proveedor con esta frecuencia y avisa a la persona asignada cuando encuentra algo. Solo analiza fuentes que no ha visto antes y usa las claves de arriba.",
  "Loading research settings": "Cargando los ajustes de la investigación",
  "Could not load the research settings.": "No se pudieron cargar los ajustes de la investigación.",
  "Research new vendors automatically": "Investigar automáticamente los proveedores nuevos",
  "Starts a research run when a vendor is added. Each run uses the keys above.":
    "Inicia una investigación cuando se añade un proveedor. Cada investigación usa las claves anteriores.",
  "Automatic research is turned off for this deployment.":
    "La investigación automática está desactivada en esta instalación.",
  "Research settings saved.": "Ajustes de la investigación guardados.",
  "This key gets news only from GDELT, which sometimes refuses requests.":
    "Esta clave obtiene noticias solo a través de GDELT, que a veces rechaza las solicitudes.",
  "Recent research runs got no news.": "Las últimas investigaciones no obtuvieron noticias.",
  "Choose an Anthropic key for more reliable news.":
    "Elija una clave de Anthropic para obtener noticias más fiables.",
  "One of the chosen LLM keys no longer exists. Choose the keys again.":
    "Una de las claves de LLM elegidas ya no existe. Elija las claves de nuevo.",
  "No pending research findings.": "No hay hallazgos de investigación pendientes.",
  "Showing {shown} of {total} pending findings. Choose a vendor to see the rest.":
    "Se muestran {shown} de {total} hallazgos pendientes. Elija un proveedor para ver el resto.",
  "Risk added to the register": "Riesgo añadido al registro de riesgos",
  "Risk added to the register.": "Riesgo añadido al registro de riesgos.",
  "Open risk": "Abrir riesgo",
  "Review suggested risk": "Revisar el riesgo sugerido",
  "Suggested by the research agent from web sources. Check the details, change what is not right, then save to add this risk to the vendor risk register.":
    "Sugerido por el agente de investigación a partir de fuentes web. Revise los detalles, cambie lo que no sea correcto y guarde para añadir este riesgo al registro de riesgos de proveedores.",
  "Risk added, but its custom field values could not be saved. Open the risk to try again.":
    "El riesgo se añadió, pero los valores de sus campos personalizados no se pudieron guardar. Abra el riesgo para intentarlo de nuevo.",
  "Sources": "Fuentes",
  "Unknown source": "Fuente desconocida",
  "Latest research": "Última investigación",
  "Researching…": "Investigando…",
  "Still running. Check back later.": "Sigue en curso. Vuelva a mirar más tarde.",
  "Research again": "Investigar de nuevo",
  "Starting the research": "Iniciando la investigación",
  "Searching the web": "Buscando en la web",
  "Searching the web: {category}": "Buscando en la web: {category}",
  "Reading a page": "Leyendo una página",
  "Reading a page: {category}": "Leyendo una página: {category}",
  "Analysing what was found": "Analizando lo encontrado",
  "Researched so far: {categories}": "Investigado hasta ahora: {categories}",
  "No research has run for this vendor yet.":
    "Todavía no se ha realizado ninguna investigación para este proveedor.",
  "Could not load the latest research run.": "No se pudo cargar la última investigación.",
  "Last run: {date}": "Última ejecución: {date}",
  "Searches: {searches}, pages read: {pages}": "Búsquedas: {searches}, páginas leídas: {pages}",
  "Searched with Claude web search": "Búsqueda realizada con la búsqueda web de Claude",
  "News searched with the GDELT Project (last 3 months)":
    "Noticias buscadas con el GDELT Project (últimos 3 meses)",
  "{category}: {outcome}": "{category}: {outcome}",
  "AI note (unverified)": "Nota de la IA (sin verificar)",
  "Credibility": "Credibilidad",
  "Official": "Oficial",
  "Trusted press": "Prensa fiable",
  "Unverified": "Sin verificar",
  "Withdrawn": "Retirado",
  "Delisted": "Excluido de la lista",
  "Matched by name only: this may be another company.":
    "Coincidencia solo por el nombre: puede tratarse de otra empresa.",
  "Rated again with the current rule.": "Reevaluado con la regla actual.",
  "Rated before the source rules; this is the earlier confidence level until the label is recomputed.":
    "Evaluado antes de las reglas sobre las fuentes; es el nivel de confianza anterior hasta que se recalcule la evaluación.",
  "Earlier rating": "Evaluación anterior",
  "Rated with the earlier confidence rule.": "Evaluado con la regla de confianza anterior.",
  "High: {operator} lists it ({record}), as of {date}.":
    "Alto: registrado ({operator}, {record}), a fecha de {date}.",
  "High: {operator} lists it ({record}).": "Alto: registrado ({operator}, {record}).",
  "High: {operator} lists it, as of {date}.": "Alto: registrado ({operator}), a fecha de {date}.",
  "High: {operator} lists it.": "Alto: registrado ({operator}).",
  "High: an official source reports it ({host}).": "Alto: una fuente oficial lo informa ({host}).",
  "High: an official source reports it.": "Alto: una fuente oficial lo informa.",
  "High: the vendor states it on its own pages ({host}).":
    "Alto: el proveedor lo indica en sus propias páginas ({host}).",
  "High: the vendor states it on its own pages.":
    "Alto: el proveedor lo indica en sus propias páginas.",
  "High: {count} independent trusted publishers report it ({publishers}).":
    "Alto: {count} medios fiables independientes lo informan ({publishers}).",
  "High: {count} independent trusted publishers report it.":
    "Alto: {count} medios fiables independientes lo informan.",
  "Medium: one trusted publisher reports it ({publisher}); no official source and no second independent publisher.":
    "Medio: un medio fiable lo informa ({publisher}); ninguna fuente oficial ni un segundo medio independiente.",
  "Medium: one trusted publisher reports it; no official source and no second independent publisher.":
    "Medio: un medio fiable lo informa; ninguna fuente oficial ni un segundo medio independiente.",
  "Medium: only search results show it; the pages could not be read.":
    "Medio: solo los resultados de búsqueda lo muestran; no se pudieron leer las páginas.",
  "Low: the pages do not hold what the search results quoted.":
    "Bajo: las páginas no contienen lo que citaban los resultados de búsqueda.",
  "Low: the {list} entry matches the vendor by name only.":
    "Bajo: la entrada ({list}) coincide con el proveedor solo por el nombre.",
  "Low: only unverified sources report it ({hosts}).":
    "Bajo: solo fuentes sin verificar lo informan ({hosts}).",
  "Low: only unverified sources report it.": "Bajo: solo fuentes sin verificar lo informan.",
  "Low: only registers that list the vendor are cited, and a register entry is not evidence of a risk.":
    "Bajo: solo se citan registros públicos en los que figura el proveedor, y una entrada de un registro no es prueba de un riesgo.",
  "Low: only the vendor's own claims support it.":
    "Bajo: solo las afirmaciones del propio proveedor lo respaldan.",
  "Low: {operator} withdrew the record on {date}.":
    "Bajo: el registro se retiró el {date} ({operator}).",
  "Low: {operator} withdrew the record.": "Bajo: el registro se retiró ({operator}).",
  "Low: {operator} rejected the record on {date}.":
    "Bajo: el registro se rechazó el {date} ({operator}).",
  "Low: {operator} rejected the record.": "Bajo: el registro se rechazó ({operator}).",
  "Low: {operator} removed the record on {date}.":
    "Bajo: el registro se eliminó el {date} ({operator}).",
  "Low: {operator} removed the record.": "Bajo: el registro se eliminó ({operator}).",
  "The source has not been updated since {date}.":
    "La fuente no se ha actualizado desde el {date}.",
  "CISA Known Exploited Vulnerabilities": "CISA Known Exploited Vulnerabilities",
  "OFAC Specially Designated Nationals list": "lista de Specially Designated Nationals de la OFAC",
  "UK Sanctions List": "UK Sanctions List",
  "EU consolidated list of financial sanctions":
    "lista consolidada de sanciones financieras de la UE",
  "the National Vulnerability Database": "National Vulnerability Database",
  "SEC EDGAR": "SEC EDGAR",
  "Have I Been Pwned": "Have I Been Pwned",
  "the vendor's status page": "página de estado del proveedor",
  "CISA KEV catalog": "catálogo KEV de la CISA",
  "OFAC SDN list": "lista SDN de la OFAC",
  "EU financial sanctions list": "lista de sanciones financieras de la UE",
  "National Vulnerability Database": "National Vulnerability Database",
  "vendor's status page": "página de estado del proveedor",
  "the CVE Program": "programa CVE",
  "UN Security Council Consolidated List": "lista consolidada del Consejo de Seguridad de la ONU",
  "NVD": "NVD",
  "SEC EDGAR filings": "presentaciones en SEC EDGAR",
  "CVE List": "lista CVE",
  "US Consolidated Screening List": "Consolidated Screening List de EE. UU.",
  "AI Incident Database": "AI Incident Database",
  "MITRE ATLAS case studies": "casos de estudio de MITRE ATLAS",
  "NHTSA Standing General Order crash reports":
    "informes de accidentes de la NHTSA en virtud de la Standing General Order",
  "FDA list of AI-enabled medical devices": "lista de la FDA de productos sanitarios con IA",
  "FDA recalls of AI-enabled medical devices":
    "retiradas de productos sanitarios con IA registradas por la FDA",
  "FDA device recall database": "base de datos de la FDA sobre retiradas de productos sanitarios",
  "Consolidated Canadian Autonomous Sanctions List":
    "lista consolidada de sanciones autónomas de Canadá",
  "UK OFSI financial sanctions enforcement notices":
    "avisos de aplicación de sanciones financieras de la OFSI (Reino Unido)",
  "FTC civil penalty cases": "casos de sanciones civiles de la FTC",
  "FTC civil penalty case list": "lista de casos de sanciones civiles de la FTC",
  "European Commission competition cases": "asuntos de competencia de la Comisión Europea",
  "European Commission antitrust, cartel and DMA case data":
    "datos de la Comisión Europea sobre asuntos de defensa de la competencia, cárteles y DMA",
  "UK Competition and Markets Authority cases":
    "casos de la Competition and Markets Authority (Reino Unido)",
  "FTC nonmerger enforcement actions":
    "acciones de la FTC en materia de competencia (sin fusiones)",
  "FTC nonmerger enforcement action list":
    "lista de acciones de la FTC en materia de competencia (sin fusiones)",
  "Colombia SIC consumer protection sanctions":
    "sanciones de protección al consumidor de la SIC (Colombia)",
  "Colombia SIC consumer protection sanctions list":
    "lista de sanciones de protección al consumidor de la SIC (Colombia)",
  "NHTSA vehicle and equipment recalls": "llamadas a revisión de vehículos y equipos de la NHTSA",
  "NHTSA recalls file": "archivo de llamadas a revisión de la NHTSA",
  "UK MHRA field safety notice lists":
    "listas de notas de aviso de seguridad de la MHRA (Reino Unido)",
  "NHTSA defect investigations": "investigaciones de defectos de la NHTSA",
  "NHTSA defect investigations file": "archivo de investigaciones de defectos de la NHTSA",
  "California Attorney General data breach list":
    "lista de brechas de datos del fiscal general de California",
  "AI Hallucination Cases database": "base de datos AI Hallucination Cases",
  "PipeRoll Agent Incident Registry": "PipeRoll Agent Incident Registry",
  "Government of Canada AI Register": "registro de IA del Gobierno de Canadá",
  "US federal AI use case inventory":
    "inventario de casos de uso de IA del Gobierno federal de EE. UU.",
  "UK Algorithmic Transparency Recording Standard records":
    "registros del Algorithmic Transparency Recording Standard (Reino Unido)",
  "UK Algorithmic Transparency Records": "registros de transparencia algorítmica (Reino Unido)",
  "Dutch Algorithm Register": "registro neerlandés de algoritmos",
  "Epoch AI Data on AI Models": "Epoch AI Data on AI Models",
  "Foundation Model Transparency Index": "Foundation Model Transparency Index",
  "FedRAMP Marketplace": "FedRAMP Marketplace",
  "FedRAMP Marketplace data": "datos del FedRAMP Marketplace",
  "C2PA Conforming Products List": "C2PA Conforming Products List",
  "disclose.io program list": "lista de programas de disclose.io",
  "disclose.io vulnerability disclosure program list":
    "lista de disclose.io de programas de divulgación de vulnerabilidades",
  "GLEIF LEI records": "registros LEI de la GLEIF",
  "Checked: {sources}": "Fuentes consultadas: {sources}",
  "Checked 1 public list or register.": "Se consultó 1 lista o registro público.",
  "Checked {count} public lists and registers.":
    "Se consultaron {count} listas y registros públicos.",
  "None had a record.": "Ninguno tenía registros.",
  "1 had a record: {sources}.": "1 tenía un registro: {sources}.",
  "{count} had records: {sources}.": "{count} tenían registros: {sources}.",
  "Also checked: {sources}.": "También se consultó: {sources}.",
  "Data as of {dates}.": "Datos a fecha de {dates}.",
  "No records: {sources}.": "Sin registros: {sources}.",
  "Show all lists": "Mostrar todas las listas",
  "Hide the lists": "Ocultar las listas",
  "no risks found": "no se encontraron riesgos",
  "Listed in the FedRAMP Marketplace.": "Figura en el FedRAMP Marketplace.",
  "Listed in the FedRAMP Marketplace: {status}.": "Figura en el FedRAMP Marketplace: {status}.",
  "Listed in the FedRAMP Marketplace: {status} since {date}.":
    "Figura en el FedRAMP Marketplace: {status} desde el {date}.",
  "Listed in the FedRAMP Marketplace: {status} since {date}, impact level {impact}.":
    "Figura en el FedRAMP Marketplace: {status} desde el {date}, nivel de impacto {impact}.",
  "Listed in the C2PA Conforming Products List.": "Figura en la C2PA Conforming Products List.",
  "Listed in the C2PA Conforming Products List: 1 conforming product, since {date}.":
    "Figura en la C2PA Conforming Products List: 1 producto conforme, desde el {date}.",
  "Listed in the C2PA Conforming Products List: {count} conforming products, the newest since {date}.":
    "Figura en la C2PA Conforming Products List: {count} productos conformes, el más reciente desde el {date}.",
  "Not checked: {sources}": "Fuentes no consultadas: {sources}",
  "{source}: last updated {date}, not up to date":
    "{source}: última actualización el {date}, no está al día",
  "Sources cited: {official} official, {press} trusted press, {vendor} vendor, {unverified} unverified":
    "Fuentes citadas: {official} oficiales, {press} prensa fiable, {vendor} proveedor, {unverified} sin verificar",
  "Public databases turned off": "Bases de datos públicas desactivadas",
  "Data sources: {attributions}": "Fuentes de datos: {attributions}",
  "Security incidents": "Incidentes de seguridad",
  "Certifications": "Certificaciones",
  "Legal and regulatory": "Legal y regulatorio",
  "AI-specific risks": "Riesgos específicos de la IA",
  "Availability": "Disponibilidad",
  "Financial health": "Salud financiera",
  "risks found": "riesgos encontrados",
  "nothing found": "no se encontró nada",
  "risks found, left for the next run": "riesgos encontrados, aplazados para la próxima ejecución",
  "could not be researched": "no se pudo investigar",
  "skipped": "omitido",
  "unknown": "desconocido",
  "The vendor was not found.": "No se encontró el proveedor.",
  "No LLM key is configured for your organization.":
    "No hay ninguna clave de LLM configurada para su organización.",
  "The model call failed with HTTP status {status}.":
    "La llamada al modelo falló con el estado HTTP {status}.",
  "The model call timed out.": "Se agotó el tiempo de espera de la llamada al modelo.",
  "The model answer did not match the expected format.":
    "La respuesta del modelo no coincidía con el formato esperado.",
  "The model call failed unexpectedly.": "La llamada al modelo falló de forma inesperada.",
  "The research run failed unexpectedly.": "La investigación falló de forma inesperada.",
  "The findings could not be saved.": "No se pudieron guardar los hallazgos.",
  "The research run timed out.": "Se agotó el tiempo de espera de la investigación.",
  "The research run could not be queued.": "No se pudo poner la investigación en cola.",
  "The web could not be reached from the server.": "El servidor no pudo acceder a la web.",
  "The model did not carry out the research steps.":
    "El modelo no ejecutó los pasos de la investigación.",
  "The research run failed.": "La investigación falló.",
  "The vendor website is missing or is not a valid domain.":
    "Falta el sitio web del proveedor o no es un dominio válido.",
  "Not researched: the time limit was reached.": "No investigado: se alcanzó el límite de tiempo.",
  "Not researched: the research ended before this category was covered.":
    "No investigado: la investigación terminó antes de cubrir esta categoría.",
  "No risks were found in the sources reviewed.":
    "No se encontraron riesgos en las fuentes revisadas.",
  "No new sources were found since the last run.":
    "No se encontraron fuentes nuevas desde la última ejecución.",
  "No risks were found. {failed} of {total} pages could not be read.":
    "No se encontraron riesgos. No se pudieron leer {failed} de {total} páginas.",
  "No risks were found. {failed} of {total} searches were not available.":
    "No se encontraron riesgos. {failed} de {total} búsquedas no estaban disponibles.",
  "No risks were found. {searchesFailed} of {searches} searches were not available, and {pagesFailed} of {pages} pages could not be read.":
    "No se encontraron riesgos. {searchesFailed} de {searches} búsquedas no estaban disponibles y no se pudieron leer {pagesFailed} de {pages} páginas.",
  "Possible risks were found but could not be verified, or are already recorded.":
    "Se encontraron posibles riesgos, pero no se pudieron verificar o ya están registrados.",
  "More risks were found than one run keeps.":
    "Se encontraron más riesgos de los que conserva una ejecución.",
  "The search was not available.": "La búsqueda no estaba disponible.",
  "News search was not available, so this was checked only on the vendor's own pages.":
    "La búsqueda de noticias no estaba disponible, así que solo se revisaron las páginas propias del proveedor.",
  "News search was not available, so this was checked only on the vendor's own pages and public databases.":
    "La búsqueda de noticias no estaba disponible, así que solo se revisaron las páginas propias del proveedor y las bases de datos públicas.",
  "News search was not available, so results may be incomplete.":
    "La búsqueda de noticias no estaba disponible, así que los resultados pueden estar incompletos.",
  "The pages could not be read.": "No se pudieron leer las páginas.",
  "1 potential risk found": "1 posible riesgo encontrado",
  "{count} potential risks found": "{count} posibles riesgos encontrados",
  "Dismiss finding": "Descartar el hallazgo",
  "Choose why this finding does not belong in the register. Similar findings are not suggested again.":
    "Indique por qué este hallazgo no pertenece al registro de riesgos. No se volverán a sugerir hallazgos similares.",
  "Select a reason": "Seleccione un motivo",
  "Not applicable to this vendor": "No aplicable a este proveedor",
  "Already covered by an existing risk": "Ya cubierto por un riesgo existente",
  "Inaccurate or not supported by the sources": "Inexacto o no respaldado por las fuentes",
  "The sources are about another company": "Las fuentes tratan de otra empresa",
  "The sources are out of date": "Las fuentes están desactualizadas",
  "Up to 500 characters.": "Hasta 500 caracteres.",
  "Research started for {vendorName}. Findings appear on the Research findings tab.":
    "Investigación iniciada para {vendorName}. Los hallazgos aparecen en la pestaña Hallazgos de la investigación.",
  "Research is already running for {vendorName}.":
    "Ya hay una investigación en curso para {vendorName}.",
  "Research ran recently. Try again in {minutes} min.":
    "La investigación se ejecutó hace poco. Inténtelo de nuevo en {minutes} min.",
  "The daily research limit for your organization was reached. Try again tomorrow.":
    "Se alcanzó el límite diario de investigaciones de su organización. Inténtelo de nuevo mañana.",
  "The research could not be started because the job queue is unavailable. Try again later.":
    "No se pudo iniciar la investigación porque la cola de tareas no está disponible. Inténtelo de nuevo más tarde.",
  "The research could not be started. Try again.":
    "No se pudo iniciar la investigación. Inténtelo de nuevo.",
  "Research risks": "Investigar riesgos",
  "Finding dismissed.": "Hallazgo descartado.",
  "This finding no longer exists.": "Este hallazgo ya no existe.",
  // Research findings in plain words: the summary, the one line of a row, its cautions
  "{count} possible risks to review.": "{count} posibles riesgos por revisar.",
  "1 possible risk to review.": "1 posible riesgo por revisar.",
  "{count} are high risk.": "{count} son de riesgo alto.",
  "1 is high risk.": "1 es de riesgo alto.",
  "All are high risk.": "Todos son de riesgo alto.",
  "It is high risk.": "Es de riesgo alto.",
  "Most are about: {topics}.": "La mayoría trata de: {topics}.",
  "One source could not be checked, so results may be incomplete: {sources}.":
    "No se pudo consultar una fuente, por lo que los resultados pueden estar incompletos: {sources}.",
  "{count} sources could not be checked, so results may be incomplete: {sources}.":
    "No se pudieron consultar {count} fuentes, por lo que los resultados pueden estar incompletos: {sources}.",
  "Last researched: {date}": "Última investigación: {date}",
  "How it was researched": "Cómo se investigó",
  "Hide research details": "Ocultar los detalles de la investigación",
  "What the last research found": "Qué encontró la última investigación",
  "What it checked": "Qué se consultó",
  "* Earlier estimate: 1 of these findings was rated before the current rules for rating sources.":
    "* Estimación anterior: 1 de estos hallazgos se evaluó antes de las reglas actuales para evaluar las fuentes.",
  "* Earlier estimate: {count} of these findings were rated before the current rules for rating sources.":
    "* Estimación anterior: {count} de estos hallazgos se evaluaron antes de las reglas actuales para evaluar las fuentes.",
  "Earlier estimate": "Estimación anterior",
  "{label}*: one source reports it.": "{label}*: una fuente lo informa.",
  "{label}*: one source reports it ({host}).": "{label}*: una fuente lo informa ({host}).",
  "{label}*: {count} sources report it.": "{label}*: {count} fuentes lo informan.",
  "{label}*: {count} sources report it ({hosts}).":
    "{label}*: {count} fuentes lo informan ({hosts}).",
  "Based on search results only: it could not be confirmed on the source pages.":
    "Se basa solo en resultados de búsqueda: no se pudo confirmar en las páginas de las fuentes.",
  "A cited record was withdrawn by its source.": "Un registro citado fue retirado por su fuente.",
  "A cited record was rejected by its source.": "Un registro citado fue rechazado por su fuente.",
  "A cited record was removed from its list.": "Un registro citado fue excluido de su lista.",
  "Why it matters to you": "Por qué le afecta",
  "What to do": "Qué hacer",
  "Why this risk level": "Por qué este nivel de riesgo",
  "Severity: {severity} · Likelihood: {likelihood}":
    "Gravedad: {severity} · Probabilidad: {likelihood}",
  "Official source": "Fuente oficial",
  "Trusted publisher": "Medio fiable",
  "Vendor's own page": "Página del propio proveedor",
  "Unverified source": "Fuente sin verificar",
  "Record withdrawn": "Registro retirado",
  "Record rejected": "Registro rechazado",
  "Removed from the list": "Excluido de la lista",
  "Not assessed": "Sin evaluar",
  "Deleted risk": "Riesgo eliminado",
  "This risk was deleted. Restore it to edit it again.":
    "Este riesgo se eliminó. Restáurelo para volver a editarlo.",
  "Restore risk": "Restaurar riesgo",
  "Risk restored.": "Riesgo restaurado.",
  "Could not restore the risk. Please try again.":
    "No se pudo restaurar el riesgo. Inténtelo de nuevo.",
  "It moves to the deleted risks, where it can be restored.":
    "Pasa a los riesgos eliminados, donde se puede restaurar.",
  "No vendors match your search or filters.":
    "Ningún proveedor coincide con tu búsqueda o tus filtros.",
  "No vendor risks match your search or filters.":
    "Ningún riesgo de proveedor coincide con tu búsqueda o tus filtros.",
  "Add a new vendor risk": "Añadir un nuevo riesgo de proveedor",
  "All use cases are selected": "Todos los casos de uso están seleccionados",
  "An error occurred: {message}": "Se produjo un error: {message}",
  "An error occurred.": "Se produjo un error.",
  "Please try again.": "Inténtelo de nuevo.",
  "Delete this vendor?": "¿Eliminar este proveedor?",
  "Document and assess a potential risk associated with your vendor. Provide details of the risk, its impact, and your mitigation plan.":
    "Documente y evalúe un posible riesgo asociado a su proveedor. Describa el riesgo, su impacto y su plan de mitigación.",
  "Edit risk": "Editar riesgo",
  "Edit vendor": "Editar proveedor",
  "Failed to load vendor risks": "No se pudieron cargar los riesgos del proveedor",
  "Failed to load vendors. Please try again later.":
    "No se pudieron cargar los proveedores. Inténtelo de nuevo más tarde.",
  "Filtering by risk level: {level}": "Filtrado por nivel de riesgo: {level}",
  "Loading vendors": "Cargando proveedores",
  "No review date": "Sin fecha de revisión",
  "Please select a use case from the dropdown": "Seleccione un caso de uso de la lista",
  "Vendor contact person must only contain letters, spaces, apostrophes, hyphens and periods":
    "La persona de contacto del proveedor solo puede contener letras, espacios, apóstrofos, guiones y puntos",
  "Please select an assignee from the dropdown": "Seleccione a quién se asigna de la lista",
  "Please select a vendor from the dropdown": "Seleccione un proveedor de la lista",
  "Please select an action owner from the dropdown":
    "Seleccione un responsable de la acción de la lista",
  "Please select a risk severity from the dropdown": "Seleccione una gravedad de la lista",
  "Please select a risk likelihood from the dropdown": "Seleccione una probabilidad de la lista",
  "Select applicable frameworks": "Seleccione los marcos aplicables",
  "This table includes a list of external entities that provide AI-related products, services, or components. You can create and manage all vendors here.":
    "Esta tabla incluye las entidades externas que proporcionan productos, servicios o componentes relacionados con la IA. Aquí puede crear y gestionar todos los proveedores.",
  "This table includes a list of risks related to a vendor. You can create and manage all vendor risks here.":
    "Esta tabla incluye los riesgos relacionados con proveedores. Aquí puede crear y gestionar todos los riesgos de proveedor.",
  "Update risk details including description, impact assessment, and mitigation plan.":
    "Actualice los detalles del riesgo, incluidos la descripción, la evaluación del impacto y el plan de mitigación.",
  "Update vendor details including products/services provided, contact information, and review status.":
    "Actualice los detalles del proveedor, incluidos los productos/servicios que ofrece, la información de contacto y el estado de revisión.",
  "Use this form to register a new vendor. Include details about what they provide, who is responsible, and the outcome of your review. Provide enough details so your team can assess risks, responsibilities, and compliance requirements.":
    "Use este formulario para registrar un nuevo proveedor. Indique qué proporciona, quién es el responsable y el resultado de su revisión. Aporte suficientes detalles para que su equipo pueda evaluar los riesgos, las responsabilidades y los requisitos de cumplimiento.",
  "User {id}": "Usuario {id}",
  "Vendor risks list": "Lista de riesgos de proveedores",
  "Vendor risks - {vendor} ({count})": "Riesgos del proveedor - {vendor} ({count})",
  "Vendor risks ({count})": "Riesgos del proveedor ({count})",
  "When you delete this vendor, all data related to this vendor will be removed. This action is non-recoverable.":
    "Si elimina este proveedor, se eliminarán todos los datos relacionados con él. Esta acción no se puede deshacer.",
  "Each factor is normalized to a 0-1 scale before applying weights. The final score ranges from 0% (lowest risk) to 100% (highest risk).":
    "Cada factor se normaliza a una escala de 0 a 1 antes de aplicar las ponderaciones. La puntuación final va del 0 % (riesgo más bajo) al 100 % (riesgo más alto).",
  "Risk score =": "Puntuación de riesgo =",
  "(Data sensitivity × 30%) +": "(Sensibilidad de los datos × 30 %) +",
  "(Business criticality × 30%) +": "(Criticidad para el negocio × 30 %) +",
  "(Past issues × 20%) +": "(Incidencias anteriores × 20 %) +",
  "(Regulatory exposure × 20%)": "(Exposición regulatoria × 20 %)",
  "CCPA (California)": "CCPA (California)",
  "{count} risk": "{count} riesgo",
  "{count} risks": "{count} riesgos",
  "Showing {range} of {total} vendor": "Mostrando {range} de {total} proveedor",
  "Showing {range} of {total} vendors": "Mostrando {range} de {total} proveedores",
  "Anthropic keys search with Claude's own web search, billed by Anthropic at about $10 per 1,000 searches (about 20 to 30 a run); the search results also count as input tokens of the research model. Other keys search the news with Brave when the organization has a Brave search key, and otherwise the news of the last 3 months through the GDELT Project at no charge.":
    "Las claves de Anthropic buscan con la búsqueda web propia de Claude, que Anthropic factura a unos 10 $ por cada 1000 búsquedas (entre 20 y 30 por ejecución); los resultados de búsqueda también cuentan como tokens de entrada del modelo de investigación. Las demás claves buscan en las noticias con Brave cuando la organización tiene una clave de búsqueda de Brave y, si no, en las noticias de los últimos 3 meses mediante el GDELT Project, sin coste.",
  "Searched with Brave Search": "Búsqueda realizada con Brave Search",
  "News is searched with Brave.": "Las noticias se buscan con Brave.",
  "Save, then add a Brave search key for more reliable news.":
    "Guarde primero y luego añada una clave de búsqueda de Brave para obtener noticias más fiables.",
  "Add a Brave search key for more reliable news":
    "Añada una clave de búsqueda de Brave para obtener noticias más fiables",
  "Or choose an Anthropic key.": "O elija una clave de Anthropic.",
  "Based on a search excerpt; the source page could not be read.":
    "Basado en un extracto de búsqueda; no se pudo leer la página de origen.",
};
