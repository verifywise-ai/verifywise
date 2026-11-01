// vendors strings for de, fr and es. English is the key.
// Spread into ../translations.ts. Other areas stay in that file for now.

export const de: Record<string, string> = {
  "Add vendor risk": "Anbieterrisiko hinzufügen",
  "Vendor List": "Anbieterliste",
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
  "Vendor risks by likelihood and severity. Select a cell to filter the table.":
    "Anbieterrisiken nach Wahrscheinlichkeit und Schweregrad. Wählen Sie eine Zelle, um die Tabelle zu filtern.",
  "Blast radius": "Wirkungsradius",
  "How many project risks and use cases inherit from the risks of each vendor.":
    "Wie viele Projektrisiken und Anwendungsfälle von den Risiken jedes Anbieters erben.",
  "Vendor {id}": "Anbieter {id}",
  "{linked} of {total}": "{linked} von {total}",
  "Vendors with reach": "Anbieter mit Reichweite",
  "Inheriting project risks": "Erbende Projektrisiken",
  "Affected use cases": "Betroffene Anwendungsfälle",
  "Vendor risks with children": "Anbieterrisiken mit untergeordneten Risiken",
  "Vendor risks with no children": "Anbieterrisiken ohne untergeordnete Risiken",
  "View on map": "Auf der Karte anzeigen",
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
  "Other names can list at most 8 names": "Es können höchstens 8 andere Namen angegeben werden",
  "Each of the other names must be between 2 and 80 characters":
    "Jeder der anderen Namen muss zwischen 2 und 80 Zeichen lang sein",
  "Each of the other names must contain a letter or a digit":
    "Jeder der anderen Namen muss einen Buchstaben oder eine Ziffer enthalten",
  "Identifiers": "Kennungen",
  "Turns a match by name into a match by identifier.":
    "Macht aus einem Treffer über den Namen einen Treffer über eine Kennung.",
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
  "Heat map, blast radius, duplicates and framework coverage of vendor risks.":
    "Heatmap, Wirkungsradius, Duplikate und Rahmenwerksabdeckung der Anbieterrisiken.",
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
  "Pending: {count}": "Ausstehend: {count}",
  "Loading research findings": "Recherchebefunde werden geladen",
  "Pending research findings": "Ausstehende Recherchebefunde",
  "Could not load research findings.": "Die Recherchebefunde konnten nicht geladen werden.",
  "Vendor research is not set up.": "Die Anbieterrecherche ist nicht eingerichtet.",
  "Add an LLM key under Settings → API Keys, in the LLM Keys section.":
    "Fügen Sie unter Einstellungen → API-Schlüssel im Bereich LLM-Schlüssel einen LLM-Schlüssel hinzu.",
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
  "Research settings saved.": "Recherche-Einstellungen gespeichert.",
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
  "Anthropic keys search with Claude's own web search, billed by Anthropic at about $10 per 1,000 searches (about 20 to 30 a run). Other keys search the news of the last 3 months through the GDELT Project at no charge.":
    "Anthropic-Schlüssel suchen mit der eigenen Websuche von Claude, die Anthropic mit etwa 10 $ pro 1.000 Suchen berechnet (etwa 20 bis 30 pro Ausführung). Andere Schlüssel durchsuchen die Nachrichten der letzten 3 Monate über das GDELT Project, kostenlos.",
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
  "Checked: {sources}": "Geprüft: {sources}",
  "Not checked: {sources}": "Nicht geprüft: {sources}",
  "No records in {sources} as of {dates}": "Keine Einträge ({sources}), Stand: {dates}",
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
  "The search was not available.": "Die Suche war nicht verfügbar.",
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
  "Research started for {vendorName}. Findings appear on the Risks tab.":
    "Recherche für {vendorName} gestartet. Die Befunde erscheinen im Tab Risiken.",
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
};

export const fr: Record<string, string> = {
  "Add vendor risk": "Ajouter un risque fournisseur",
  "Vendor List": "Liste des fournisseurs",
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
  "Vendor risks by likelihood and severity. Select a cell to filter the table.":
    "Risques fournisseurs par probabilité et gravité. Sélectionnez une cellule pour filtrer le tableau.",
  "Blast radius": "Rayon d'impact",
  "How many project risks and use cases inherit from the risks of each vendor.":
    "Combien de risques de projet et de cas d'usage héritent des risques de chaque fournisseur.",
  "Vendor {id}": "Fournisseur {id}",
  "{linked} of {total}": "{linked} sur {total}",
  "Vendors with reach": "Fournisseurs avec portée",
  "Inheriting project risks": "Risques de projet héritiers",
  "Affected use cases": "Cas d'usage concernés",
  "Vendor risks with children": "Risques fournisseurs avec enfants",
  "Vendor risks with no children": "Risques fournisseurs sans enfants",
  "View on map": "Voir sur la carte",
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
  "Other names can list at most 8 names": "Vous pouvez indiquer au plus 8 autres noms",
  "Each of the other names must be between 2 and 80 characters":
    "Chacun des autres noms doit comporter entre 2 et 80 caractères",
  "Each of the other names must contain a letter or a digit":
    "Chacun des autres noms doit contenir une lettre ou un chiffre",
  "Identifiers": "Identifiants",
  "Turns a match by name into a match by identifier.":
    "Transforme une correspondance par le nom en correspondance par identifiant.",
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
  "Heat map, blast radius, duplicates and framework coverage of vendor risks.":
    "Carte thermique, rayon d'impact, doublons et couverture des référentiels des risques fournisseurs.",
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
  "Pending: {count}": "En attente : {count}",
  "Loading research findings": "Chargement des résultats de recherche",
  "Pending research findings": "Résultats de recherche en attente",
  "Could not load research findings.": "Impossible de charger les résultats de recherche.",
  "Vendor research is not set up.": "La recherche sur les fournisseurs n'est pas configurée.",
  "Add an LLM key under Settings → API Keys, in the LLM Keys section.":
    "Ajoutez une clé LLM sous Paramètres → Clés API, dans la section Clés LLM.",
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
  "Research settings saved.": "Paramètres de la recherche enregistrés.",
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
  "Anthropic keys search with Claude's own web search, billed by Anthropic at about $10 per 1,000 searches (about 20 to 30 a run). Other keys search the news of the last 3 months through the GDELT Project at no charge.":
    "Les clés Anthropic effectuent leurs recherches avec la recherche web propre à Claude, facturée par Anthropic à environ 10 $ les 1 000 recherches (environ 20 à 30 par exécution). Les autres clés recherchent dans les actualités des 3 derniers mois via le GDELT Project, sans frais.",
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
  "Checked: {sources}": "Sources consultées : {sources}",
  "Not checked: {sources}": "Sources non consultées : {sources}",
  "No records in {sources} as of {dates}": "Aucun enregistrement ({sources}) à la date du {dates}",
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
  "The search was not available.": "La recherche n'était pas disponible.",
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
  "Research started for {vendorName}. Findings appear on the Risks tab.":
    "Recherche lancée pour {vendorName}. Les résultats apparaissent dans l'onglet Risques.",
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
};

export const es: Record<string, string> = {
  "Add vendor risk": "Añadir riesgo de proveedor",
  "Vendor List": "Lista de proveedores",
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
  "Vendor risks by likelihood and severity. Select a cell to filter the table.":
    "Riesgos del proveedor por probabilidad y gravedad. Seleccione una celda para filtrar la tabla.",
  "Blast radius": "Radio de impacto",
  "How many project risks and use cases inherit from the risks of each vendor.":
    "Cuántos riesgos de proyecto y casos de uso heredan de los riesgos de cada proveedor.",
  "Vendor {id}": "Proveedor {id}",
  "{linked} of {total}": "{linked} de {total}",
  "Vendors with reach": "Proveedores con alcance",
  "Inheriting project risks": "Riesgos de proyecto que heredan",
  "Affected use cases": "Casos de uso afectados",
  "Vendor risks with children": "Riesgos del proveedor con dependientes",
  "Vendor risks with no children": "Riesgos del proveedor sin dependientes",
  "View on map": "Ver en el mapa",
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
  "Other names can list at most 8 names": "Se pueden indicar como máximo 8 otros nombres",
  "Each of the other names must be between 2 and 80 characters":
    "Cada uno de los otros nombres debe tener entre 2 y 80 caracteres",
  "Each of the other names must contain a letter or a digit":
    "Cada uno de los otros nombres debe contener una letra o un dígito",
  "Identifiers": "Identificadores",
  "Turns a match by name into a match by identifier.":
    "Convierte una coincidencia por nombre en una coincidencia por identificador.",
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
  "Heat map, blast radius, duplicates and framework coverage of vendor risks.":
    "Mapa de calor, radio de impacto, duplicados y cobertura del marco de los riesgos de proveedor.",
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
  "Pending: {count}": "Pendientes: {count}",
  "Loading research findings": "Cargando los hallazgos de la investigación",
  "Pending research findings": "Hallazgos de investigación pendientes",
  "Could not load research findings.": "No se pudieron cargar los hallazgos de la investigación.",
  "Vendor research is not set up.": "La investigación de proveedores no está configurada.",
  "Add an LLM key under Settings → API Keys, in the LLM Keys section.":
    "Añada una clave de LLM en Configuración → Claves de API, en la sección Claves de LLM.",
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
  "Research settings saved.": "Ajustes de la investigación guardados.",
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
  "Anthropic keys search with Claude's own web search, billed by Anthropic at about $10 per 1,000 searches (about 20 to 30 a run). Other keys search the news of the last 3 months through the GDELT Project at no charge.":
    "Las claves de Anthropic buscan con la búsqueda web propia de Claude, que Anthropic factura a unos 10 $ por cada 1000 búsquedas (entre 20 y 30 por ejecución). Las demás claves buscan en las noticias de los últimos 3 meses mediante el GDELT Project, sin coste.",
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
  "Checked: {sources}": "Fuentes consultadas: {sources}",
  "Not checked: {sources}": "Fuentes no consultadas: {sources}",
  "No records in {sources} as of {dates}": "Ningún registro ({sources}) a fecha de {dates}",
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
  "The search was not available.": "La búsqueda no estaba disponible.",
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
  "Research started for {vendorName}. Findings appear on the Risks tab.":
    "Investigación iniciada para {vendorName}. Los hallazgos aparecen en la pestaña Riesgos.",
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
};
