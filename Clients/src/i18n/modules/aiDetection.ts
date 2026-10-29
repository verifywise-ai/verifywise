// aiDetection strings for de, fr and es. English is the key.
// Spread into ../translations.ts. Other areas stay in that file for now.

export const de: Record<string, string> = {
  "Add repository": "Repository hinzufügen",
  "Documentation": "Dokumentation",
  "AI/ML imports": "KI/ML-Importe",
  "AI/ML libraries (TensorFlow, PyTorch, scikit-learn), LLM SDKs (OpenAI, Anthropic), model files, ML pipelines, and containerized AI workloads.":
    "KI/ML-Bibliotheken (TensorFlow, PyTorch, scikit-learn), LLM-SDKs (OpenAI, Anthropic), Modelldateien, ML-Pipelines und containerisierte KI-Workloads.",
  "AI/ML library imports and framework dependencies detected in source code (e.g., TensorFlow, PyTorch, OpenAI SDK).":
    "Im Quellcode erkannte Importe von KI/ML-Bibliotheken und Rahmenwerksabhängigkeiten (z. B. TensorFlow, PyTorch, OpenAI SDK).",
  "Default branch": "Standard-Branch",
  "Export AI Bill of Materials (AI-BOM)": "KI-Stückliste (AI-BOM) exportieren",
  "Hour (UTC)": "Stunde (UTC)",
  "Only scans files changed between two commits. Findings from unchanged files are carried forward from the most recent full scan. Requires a completed full scan of this repository as a baseline.":
    "Scannt nur Dateien, die zwischen zwei Commits geändert wurden. Erkenntnisse aus unveränderten Dateien werden vom letzten vollständigen Scan übernommen. Erfordert einen abgeschlossenen vollständigen Scan dieses Repositories als Basis.",
  "Token name (optional)": "Tokenname (optional)",
  "Add a repository first": "Zuerst ein Repository hinzufügen",
  "Back to history": "Zurück zum Verlauf",
  "Delete scan?": "Scan löschen?",
  "Export AI-BOM": "AI-BOM exportieren",
  "Recalculate risk score": "Risikobewertung neu berechnen",
  "Recalculate score": "Bewertung neu berechnen",
  "Recalculating risk score": "Risikobewertung wird neu berechnet",
  "Scan another": "Weiteren scannen",
  "AI analysis": "KI-Analyse",
  "All detections": "Alle Erkennungen",
  "API calls": "API-Aufrufe",
  "Below 70 threshold": "Unter Schwelle 70",
  "Clear status": "Status löschen",
  "Day of month": "Tag des Monats",
  "Day of week": "Wochentag",
  "Dimensions at risk": "Gefährdete Dimensionen",
  "Files scanned": "Gescannte Dateien",
  "Findings with high detection confidence": "Erkenntnisse mit hoher Erkennungskonfidenz",
  "Findings with medium detection confidence": "Erkenntnisse mit mittlerer Erkennungskonfidenz",
  "GitHub URL": "GitHub-URL",
  "Grade": "Note",
  "High confidence": "Hohe Konfidenz",
  "Incremental": "Inkrementell",
  "Incremental scan": "Inkrementeller Scan",
  "Libraries": "Bibliotheken",
  "LLM provider": "LLM-Anbieter",
  "Medium confidence": "Mittlere Konfidenz",
  "Number of unique repositories that have been scanned. Multiple scans of the same repo count as one.":
    "Anzahl eindeutiger gescannter Repositories. Mehrere Scans desselben Repositories zählen als einer.",
  "Optional friendly name": "Optionaler Anzeigename",
  "Percentage of EU AI Act requirements triggered by detected AI components":
    "Prozentsatz der durch erkannte KI-Komponenten ausgelösten EU-KI-Verordnung-Anforderungen",
  "Personal access token": "Persönliches Zugriffstoken",
  "Provider integrations": "Anbieterintegrationen",
  "Risk score threshold": "Schwellenwert der Risikobewertung",
  "Scan results": "Scan-Ergebnisse",
  "Scans scoring above this will fail the check":
    "Scans über diesem Wert bestehen die Prüfung nicht",
  "Scans with more findings will fail": "Scans mit mehr Erkenntnissen schlagen fehl",
  "Search scans...": "Scans suchen...",
  "Security issues": "Sicherheitsprobleme",
  "Total findings": "Erkenntnisse insgesamt",
  "Total LLM vulnerability findings across all OWASP Top 10 for LLM types":
    "Gesamtzahl der LLM-Sicherheitslücken über alle OWASP-Top-10-LLM-Typen",
  "Total number of repository scans performed, including completed, failed, and cancelled scans.":
    "Gesamtzahl durchgeführter Repository-Scans, einschließlich abgeschlossener, fehlgeschlagener und abgebrochener Scans.",
  "Total number of source files analyzed": "Gesamtzahl analysierter Quelldateien",
  "Total scans": "Scans insgesamt",
  "Unique repos scanned": "Eindeutige gescannte Repositories",
  "Vulnerabilities found": "Gefundene Sicherheitslücken",
  "Webhook Secret": "Webhook-Secret",
  "Webhook URL": "Webhook-URL",
  "What gets detected?": "Was wird erkannt?",
  "No scans yet. Scan your repositories to detect AI and ML libraries.":
    "Noch keine Scans. Scannen Sie Ihre Repositories, um KI- und ML-Bibliotheken zu erkennen.",
  "Configure integrations and tokens for AI detection scanning.":
    "Integrationen und Token für KI-Erkennungsscans konfigurieren.",
  "Direct API calls to AI providers detected in code, including REST endpoints and SDK method invocations.":
    "Direkte API-Aufrufe an KI-Anbieter, die im Code erkannt wurden, einschließlich REST-Endpunkten und SDK-Methodenaufrufen.",
  "How incremental scans work": "Wie inkrementelle Scans funktionieren",
  "Select an LLM key": "LLM-Schlüssel auswählen",
  "Track changes over time": "Änderungen im Zeitverlauf verfolgen",
  "View past repository scans and their results.":
    "Vergangene Repository-Scans und deren Ergebnisse anzeigen.",
  "Combined count of all AI/ML detections across completed scans, including libraries, API calls, and secrets.":
    "Gesamtanzahl aller KI-/ML-Erkennungen über abgeschlossene Scans hinweg, einschließlich Bibliotheken, API-Aufrufen und Geheimnissen.",
  "Each scan creates a snapshot. Compare scans to see what AI components were added, removed, or changed across your codebase.":
    "Jeder Scan erstellt einen Snapshot. Vergleichen Sie Scans, um zu sehen, welche KI-Komponenten in Ihrer Codebasis hinzugefügt, entfernt oder geändert wurden.",
  "Enter a public GitHub repository URL to detect AI/ML libraries and frameworks.":
    "Geben Sie die URL eines öffentlichen GitHub-Repositories ein, um KI-/ML-Bibliotheken und Rahmenwerke zu erkennen.",
  "Go to the Repositories tab and add a GitHub repository URL. Once added, you can run scans to detect AI/ML usage.":
    "Gehen Sie zum Repositories-Tab und fügen Sie eine GitHub-Repository-URL hinzu. Nach dem Hinzufügen können Sie Scans ausführen, um KI-/ML-Nutzung zu erkennen.",
  "Max critical findings": "Max. kritische Erkenntnisse",
  "Security concerns including hardcoded API keys/secrets and model file vulnerabilities that could pose risks.":
    "Sicherheitsbedenken einschließlich hartcodierter API-Schlüssel/Geheimnisse und Sicherheitslücken in Modelldateien, die Risiken darstellen können.",
  "Total AI/ML detections found in this scan": "Gesamte KI-/ML-Erkennungen in diesem Scan",
  "e.g., VerifyWise Scanner Token": "z. B. VerifyWise-Scanner-Token",
  "e.g., abc1234...": "z. B. abc1234...",
  "e.g., def5678...": "z. B. def5678...",
  "e.g., https://github.com/owner/repo or owner/repo":
    "z. B. https://github.com/owner/repo oder owner/repo",
  "Operator": "Operator",
  "Repository URL": "Repository-URL",
  "Configure a GitHub token in Settings to scan private repositories. Try these examples:":
    "Konfigurieren Sie in den Einstellungen ein GitHub-Token, um private Repositories zu scannen. Probieren Sie diese Beispiele:",
  "Shubhamsaboo/awesome-llm-apps": "Shubhamsaboo/awesome-llm-apps",
  "langchain-ai/chat-langchain": "langchain-ai/chat-langchain",
  "verifywise-ai/llm-security-tester": "verifywise-ai/llm-security-tester",
  "Edit repository": "Repository bearbeiten",
  "Update repository settings and scan schedule.":
    "Repository-Einstellungen und Scan-Zeitplan aktualisieren.",
  "REPOSITORY": "REPOSITORY",
  "FILES SCANNED": "GESCANNTE DATEIEN",
  "FINDINGS": "ERKENNTNISSE",
  "RISK SCORE": "RISIKOBEWERTUNG",
  "TRIGGERED BY": "AUSGELÖST VON",
  "Cancelled": "Abgebrochen",
  "Cloning": "Wird geklont",
  "Scanning": "Wird gescannt",
  "Failed to delete scan:": "Scan konnte nicht gelöscht werden:",
  "Failed to load scans:": "Scans konnten nicht geladen werden:",
  "AI and machine learning libraries detected in the repository. Click on a finding to see file locations.":
    "Im Repository erkannte KI- und Machine-Learning-Bibliotheken. Klicken Sie auf eine Erkenntnis, um die Dateipfade zu sehen.",
  "Pre-trained AI/ML model references detected in the codebase. These include Hugging Face models, Ollama models, and other model identifiers.":
    "Im Code erkannte Verweise auf vortrainierte KI-/ML-Modelle. Dazu zählen Hugging-Face-Modelle, Ollama-Modelle und andere Modellkennungen.",
  "API calls to AI/ML services detected in the codebase. These represent active usage of AI models and services.":
    "Im Code erkannte API-Aufrufe an KI-/ML-Dienste. Sie stehen für die aktive Nutzung von KI-Modellen und -Diensten.",
  "All API call findings are marked as high confidence. These indicate direct integration with AI services.":
    "Alle API-Aufruf-Erkenntnisse sind mit hoher Konfidenz markiert. Sie weisen auf eine direkte Integration mit KI-Diensten hin.",
  "No API calls detected in this repository": "Keine API-Aufrufe in diesem Repository erkannt",
  "API calls to OpenAI, Anthropic, Google AI, and other AI services will appear here":
    "API-Aufrufe an OpenAI, Anthropic, Google AI und andere KI-Dienste erscheinen hier",
  "Hardcoded API keys and secrets detected in the codebase. These should be moved to environment variables or a secrets manager.":
    "Im Code hart codierte API-Schlüssel und Geheimnisse erkannt. Diese sollten in Umgebungsvariablen oder einen Secret-Manager verschoben werden.",
  "Hardcoded secrets in source code can be exposed if the repository is made public or accessed by unauthorized users. Rotate any exposed credentials immediately.":
    "Hart codierte Geheimnisse im Quellcode können offengelegt werden, wenn das Repository öffentlich gemacht oder von unbefugten Benutzern eingesehen wird. Rotieren Sie alle offengelegten Anmeldedaten umgehend.",
  "No hardcoded secrets detected": "Keine hart codierten Geheimnisse erkannt",
  "No API keys, tokens, or other secrets were found in the scanned code.":
    "Im gescannten Code wurden keine API-Schlüssel, Tokens oder andere Geheimnisse gefunden.",
  "No LLM vulnerabilities detected": "Keine LLM-Sicherheitslücken erkannt",
  "Enable vulnerability scanning in settings for deep LLM analysis.":
    "Aktivieren Sie das Scannen auf Sicherheitslücken in den Einstellungen für eine tiefgehende LLM-Analyse.",
  "Insecure output handling": "Unsichere Ausgabeverarbeitung",
  "Sensitive information disclosure": "Offenlegung sensibler Informationen",
  "LLM01 — Untrusted input injected into system prompts":
    "LLM01 — Nicht vertrauenswürdige Eingaben in System-Prompts eingeschleust",
  "LLM02 — LLM output flowing to dangerous sinks":
    "LLM02 — LLM-Ausgabe fließt in gefährliche Ziele",
  "LLM03 — Unsafe model loading or untrusted training data":
    "LLM03 — Unsicheres Laden von Modellen oder nicht vertrauenswürdige Trainingsdaten",
  "LLM04 — Missing token limits or input validation":
    "LLM04 — Fehlende Token-Limits oder Eingabevalidierung",
  "LLM05 — Risky AI package versions or untrusted model sources":
    "LLM05 — Riskante KI-Paketversionen oder nicht vertrauenswürdige Modellquellen",
  "LLM06 — PII passed to or from LLM calls without redaction":
    "LLM06 — PII wird ohne Redaktion an LLM-Aufrufe übergeben oder von diesen zurückgegeben",
  "LLM07 — Plugins accepting raw input without validation":
    "LLM07 — Plugins akzeptieren Rohdaten ohne Validierung",
  "LLM08 — Agents with overly broad tool access":
    "LLM08 — Agenten mit zu weitreichendem Tool-Zugriff",
  "LLM09 — LLM output used for decisions without validation":
    "LLM09 — LLM-Ausgabe für Entscheidungen ohne Validierung genutzt",
  "LLM10 — Model weights exposed without access controls":
    "LLM10 — Modellgewichte ohne Zugriffskontrollen offengelegt",
  "Security findings": "Sicherheits-Erkenntnisse",
  "No security issues detected": "Keine Sicherheitsprobleme erkannt",
  "Total requirements": "Gesamtanforderungen",
  "High priority": "Hohe Priorität",
  "Medium priority": "Mittlere Priorität",
  "Requirements scope": "Anforderungsumfang",
  "Requirements by category": "Anforderungen nach Kategorie",
  "Recent scans": "Letzte Scans",
  "AI agent frameworks and autonomous systems detected in the codebase. These include LangChain agents, CrewAI, AutoGen, and MCP servers.":
    "Im Code wurden KI-Agenten-Frameworks und autonome Systeme erkannt. Dazu gehören LangChain-Agenten, CrewAI, AutoGen und MCP-Server.",
  "AI agents can take autonomous actions and interact with external systems. Review these carefully for governance and security implications.":
    "KI-Agenten können autonome Aktionen ausführen und mit externen Systemen interagieren. Prüfen Sie diese sorgfältig auf Governance- und Sicherheitsauswirkungen.",
  "AI governance risk score": "KI-Governance-Risikobewertung",
  "Agent findings are marked as high risk due to their autonomous nature and ability to interact with external systems.":
    "Agentenfunde werden aufgrund ihrer autonomen Natur und ihrer Fähigkeit, mit externen Systemen zu interagieren, als hochriskant eingestuft.",
  "Automatically scan this repository on a recurring schedule.":
    "Dieses Repository automatisch nach einem wiederkehrenden Zeitplan scannen.",
  "Autonomous AI systems detected": "Autonome KI-Systeme erkannt",
  "Base commit SHA (older)": "Basis-Commit-SHA (älter)",
  "Based on the scan results, no additional compliance requirements were identified.":
    "Basierend auf den Scanergebnissen wurden keine zusätzlichen Compliance-Anforderungen identifiziert.",
  "CI/CD Integration": "CI/CD-Integration",
  "Compliance checklist": "Compliance-Checkliste",
  "Create a new token on GitHub": "Neues Token auf GitHub erstellen",
  "Cross-ref": "Querverweis",
  "Detected libraries": "Erkannte Bibliotheken",
  "Dimension breakdown": "Dimensionsaufschlüsselung",
  "Dimension weights": "Dimensionsgewichte",
  "Enable LLM-enhanced analysis above to use vulnerability detection.":
    "Aktivieren Sie oben die LLM-gestützte Analyse, um die Schwachstellenerkennung zu nutzen.",
  "Failed to load scan details": "Scandetails konnten nicht geladen werden",
  "Found in:": "Gefunden in:",
  "Head commit SHA (newer)": "Head-Commit-SHA (neuer)",
  "LLM-enhanced analysis": "LLM-gestützte Analyse",
  "Couldn't load LLM keys. Reload the page to try again.":
    "LLM-Schlüssel konnten nicht geladen werden. Laden Sie die Seite neu, um es erneut zu versuchen.",
  "Loading compliance data...": "Compliance-Daten werden geladen...",
  "Loading repositories...": "Repositories werden geladen...",
  "Loading scan details...": "Scandetails werden geladen...",
  "Loading scan results...": "Scanergebnisse werden geladen...",
  "Model references indicate usage of pre-trained models from Hugging Face Hub, Ollama, and other sources.":
    "Modellreferenzen weisen auf die Nutzung vortrainierter Modelle von Hugging Face Hub, Ollama und anderen Quellen hin.",
  "No AI agents detected in this repository": "Keine KI-Agenten in diesem Repository erkannt",
  "No RAG components detected in this repository":
    "Keine RAG-Komponenten in diesem Repository erkannt",
  "No model references detected in this repository":
    "Keine Modellreferenzen in diesem Repository erkannt",
  "No specific compliance actions needed": "Keine spezifischen Compliance-Aktionen erforderlich",
  "OWASP ML": "OWASP ML",
  "Post PR comments": "PR-Kommentare posten",
  "Post status checks": "Statusprüfungen posten",
  "RAG (Retrieval-Augmented Generation) pipeline components detected in the codebase. These include vector databases, document loaders, and embedding models.":
    "RAG-Pipeline-Komponenten (Retrieval-Augmented Generation) im Code erkannt. Dazu gehören Vektordatenbanken, Dokumentenlader und Einbettungsmodelle.",
  "RAG components indicate usage of vector databases, document loaders, and embedding systems for retrieval-augmented generation.":
    "RAG-Komponenten weisen auf die Nutzung von Vektordatenbanken, Dokumentenladern und Einbettungssystemen für retrieval-augmentierte Generierung hin.",
  "Recommended mitigation": "Empfohlene Minderung",
  "Risks to consider:": "Zu berücksichtigende Risiken:",
  "Run scans on pull requests and block merges that exceed risk thresholds.":
    "Scans bei Pull-Requests ausführen und Merges blockieren, die Risikoschwellen überschreiten.",
  "Scan completed": "Scan abgeschlossen",
  "Scan failed": "Scan fehlgeschlagen",
  "Scheduled scans": "Geplante Scans",
  "Security risk detected": "Sicherheitsrisiko erkannt",
  "Test token": "Test-Token",
  "This has already been added before": "Dies wurde bereits hinzugefügt",
  "This is not a real risk": "Dies ist kein echtes Risiko",
  "Threat type": "Bedrohungstyp",
  "Token configured": "Token konfiguriert",
  "Unable to load compliance data": "Compliance-Daten konnten nicht geladen werden",
  "Use this secret when configuring the webhook in your GitHub repository settings.":
    "Verwenden Sie dieses Geheimnis bei der Konfiguration des Webhooks in den Einstellungen Ihres GitHub-Repositorys.",
  "Vulnerability detection": "Schwachstellenerkennung",
  "AI is thinking really hard": "Die KI denkt angestrengt nach",
  "AI/ML libraries detected in this repository": "In diesem Repository erkannte KI/ML-Bibliotheken",
  "Accepted risk": "Akzeptiertes Risiko",
  "Address immediately - critical for compliance":
    "Sofort behandeln – entscheidend für die Compliance",
  "Address soon - important for compliance": "Bald behandeln – wichtig für die Compliance",
  "Address when possible - recommended for compliance":
    "Bei Gelegenheit behandeln – für die Compliance empfohlen",
  "All findings of this type": "Alle Befunde dieses Typs",
  "All findings with this name": "Alle Befunde mit diesem Namen",
  "Almost there, finalizing score": "Fast geschafft, Bewertung wird finalisiert",
  "Asking AI for a second opinion": "KI um eine zweite Meinung bitten",
  "Autonomous AI agent implementations": "Implementierungen autonomer KI-Agenten",
  "Calculating dimension penalties": "Dimensions-Strafen werden berechnet",
  "Configure AI Governance Risk Score settings":
    "Einstellungen für die KI-Governance-Risikobewertung konfigurieren",
  "Connect a GitHub token to scan private repositories":
    "Verbinden Sie ein GitHub-Token, um private Repositories zu scannen",
  "Create a rule that hides matching findings from future scans and excludes them from risk scores.":
    "Erstellen Sie eine Regel, die übereinstimmende Befunde aus zukünftigen Scans ausblendet und aus Risikobewertungen ausschließt.",
  "Cross-referencing correlations": "Querverweis-Korrelationen",
  "Data sent to external cloud APIs. Risk of data leakage, vendor lock-in, and compliance violations.":
    "Daten werden an externe Cloud-APIs gesendet. Risiko von Datenlecks, Anbieterabhängigkeit und Compliance-Verstößen.",
  "Delete rule": "Regel löschen",
  "Delete suppression rule": "Unterdrückungsregel löschen",
  "Delete suppression rule?": "Unterdrückungsregel löschen?",
  "Exposed API keys and credentials": "Offengelegte API-Schlüssel und Anmeldedaten",
  "External AI API calls found in the code": "Externe KI-API-Aufrufe im Code gefunden",
  "Failed to create suppression rule": "Erstellen der Unterdrückungsregel fehlgeschlagen",
  "Failed to delete token": "Löschen des Tokens fehlgeschlagen",
  "Failed to load token status": "Laden des Token-Status fehlgeschlagen",
  "Failed to save token": "Speichern des Tokens fehlgeschlagen",
  "Failed to test token": "Testen des Tokens fehlgeschlagen",
  "Framework that can connect to cloud APIs depending on configuration. Review usage to assess actual risk.":
    "Rahmenwerk, das je nach Konfiguration eine Verbindung zu Cloud-APIs herstellen kann. Überprüfen Sie die Nutzung, um das tatsächliche Risiko zu bewerten.",
  "Gathering scan findings": "Scan-Befunde werden gesammelt",
  "GitHub integration": "GitHub-Integration",
  "GitHub token deleted successfully": "GitHub-Token erfolgreich gelöscht",
  "GitHub token saved successfully": "GitHub-Token erfolgreich gespeichert",
  "LAST SCAN": "LETZTER SCAN",
  "LLM-specific vulnerabilities (prompt injection, PII exposure, excessive agency, jailbreak risk)":
    "LLM-spezifische Schwachstellen (Prompt-Injection, PII-Exposition, übermäßige Handlungsfähigkeit, Jailbreak-Risiko)",
  "License could not be determined. Verify manually before commercial use.":
    "Lizenz konnte nicht bestimmt werden. Vor kommerzieller Nutzung manuell überprüfen.",
  "Local processing only. Data stays on your infrastructure with minimal external exposure.":
    "Nur lokale Verarbeitung. Daten bleiben in Ihrer Infrastruktur mit minimaler externer Exposition.",
  "Manage rules that suppress matching findings on future scans":
    "Regeln verwalten, die übereinstimmende Befunde bei zukünftigen Scans unterdrücken",
  "Mapping findings to risk dimensions": "Befunde Risikodimensionen zuordnen",
  "Moderate restrictions (LGPL, MPL, CC-BY-SA). Some obligations but generally allows commercial use.":
    "Mäßige Einschränkungen (LGPL, MPL, CC-BY-SA). Einige Verpflichtungen, erlaubt aber im Allgemeinen die kommerzielle Nutzung.",
  "NEXT SCAN": "NÄCHSTER SCAN",
  "No suppression rules yet": "Noch keine Unterdrückungsregeln",
  "Permissive": "Permissiv",
  "Permissive license (MIT, Apache, BSD). Minimal restrictions, allows commercial use.":
    "Permissive Lizenz (MIT, Apache, BSD). Minimale Einschränkungen, erlaubt kommerzielle Nutzung.",
  "Please enter a token": "Bitte geben Sie ein Token ein",
  "Please enter a token to test": "Bitte geben Sie ein Token zum Testen ein",
  "Please select an LLM key or disable LLM analysis":
    "Bitte wählen Sie einen LLM-Schlüssel oder deaktivieren Sie die LLM-Analyse",
  "References to AI models in the codebase": "Verweise auf KI-Modelle im Code",
  "Regulatory compliance checks and mappings":
    "Regulatorische Compliance-Prüfungen und Zuordnungen",
  "Requirements for human control over AI decisions":
    "Anforderungen an die menschliche Kontrolle über KI-Entscheidungen",
  "Requirements for identifying and mitigating AI-related risks":
    "Anforderungen an die Identifikation und Minderung KI-bezogener Risiken",
  "Requirements for maintaining technical records of AI components":
    "Anforderungen an die Pflege technischer Aufzeichnungen über KI-Komponenten",
  "Requirements for making AI systems understandable to users and deployers":
    "Anforderungen, KI-Systeme für Nutzer und Bereitsteller verständlich zu machen",
  "Requirements for managing data used by AI systems":
    "Anforderungen an die Verwaltung von Daten, die von KI-Systemen verwendet werden",
  "Requirements for ongoing observation of AI performance":
    "Anforderungen an die laufende Beobachtung der KI-Leistung",
  "Requirements for protecting AI systems from attacks":
    "Anforderungen zum Schutz von KI-Systemen vor Angriffen",
  "Requirements for quality management and responsibility":
    "Anforderungen an Qualitätsmanagement und Verantwortung",
  "Restrictive": "Restriktiv",
  "Restrictive license (GPL, AGPL, CC-NC). May require code disclosure or prohibit commercial use.":
    "Restriktive Lizenz (GPL, AGPL, CC-NC). Kann Codefreigabe erfordern oder kommerzielle Nutzung untersagen.",
  "Retrieval-augmented generation components":
    "Komponenten der retrieval-augmentierten Generierung",
  "Risk scoring settings saved": "Risikobewertungseinstellungen gespeichert",
  "Secrets": "Geheimnisse",
  "Security vulnerabilities in AI dependencies": "Sicherheitsschwachstellen in KI-Abhängigkeiten",
  "Show suppressed findings": "Unterdrückte Befunde anzeigen",
  "Suppress": "Unterdrücken",
  "Suppress finding": "Befund unterdrücken",
  "Suppressed": "Unterdrückt",
  "Suppression rules": "Unterdrückungsregeln",
  "Token is valid": "Token ist gültig",
  "Vulnerabilities": "Schwachstellen",
  "Weighing risk dimensions": "Risikodimensionen abwägen",
};

export const fr: Record<string, string> = {
  "Add repository": "Ajouter un dépôt",
  "Documentation": "Documentation",
  "AI/ML imports": "Imports IA/ML",
  "AI/ML libraries (TensorFlow, PyTorch, scikit-learn), LLM SDKs (OpenAI, Anthropic), model files, ML pipelines, and containerized AI workloads.":
    "Bibliothèques IA/ML (TensorFlow, PyTorch, scikit-learn), SDK LLM (OpenAI, Anthropic), fichiers de modèles, pipelines ML et charges IA conteneurisées.",
  "AI/ML library imports and framework dependencies detected in source code (e.g., TensorFlow, PyTorch, OpenAI SDK).":
    "Imports de bibliothèques IA/ML et dépendances de frameworks détectés dans le code source (ex. TensorFlow, PyTorch, SDK OpenAI).",
  "Default branch": "Branche par défaut",
  "Export AI Bill of Materials (AI-BOM)": "Exporter la nomenclature IA (AI-BOM)",
  "Hour (UTC)": "Heure (UTC)",
  "Only scans files changed between two commits. Findings from unchanged files are carried forward from the most recent full scan. Requires a completed full scan of this repository as a baseline.":
    "N'analyse que les fichiers modifiés entre deux commits. Les constats des fichiers inchangés sont repris de la dernière analyse complète. Nécessite une analyse complète terminée de ce dépôt comme référence.",
  "Token name (optional)": "Nom du jeton (optionnel)",
  "Add a repository first": "Ajoutez d'abord un dépôt",
  "Back to history": "Retour à l'historique",
  "Delete scan?": "Supprimer l'analyse ?",
  "Export AI-BOM": "Exporter AI-BOM",
  "Recalculate risk score": "Recalculer le score de risque",
  "Recalculate score": "Recalculer le score",
  "Recalculating risk score": "Recalcul du score de risque",
  "Scan another": "Analyser un autre",
  "AI analysis": "Analyse IA",
  "All detections": "Toutes les détections",
  "API calls": "Appels API",
  "Below 70 threshold": "Sous le seuil de 70",
  "Clear status": "Effacer le statut",
  "Day of month": "Jour du mois",
  "Day of week": "Jour de la semaine",
  "Dimensions at risk": "Dimensions à risque",
  "Files scanned": "Fichiers analysés",
  "Findings with high detection confidence": "Constats avec une confiance de détection élevée",
  "Findings with medium detection confidence": "Constats avec une confiance de détection moyenne",
  "GitHub URL": "URL GitHub",
  "Grade": "Note",
  "High confidence": "Confiance élevée",
  "Incremental": "Incrémental",
  "Incremental scan": "Analyse incrémentale",
  "Libraries": "Bibliothèques",
  "LLM provider": "Fournisseur LLM",
  "Medium confidence": "Confiance moyenne",
  "Number of unique repositories that have been scanned. Multiple scans of the same repo count as one.":
    "Nombre de dépôts uniques analysés. Plusieurs analyses du même dépôt comptent pour un.",
  "Optional friendly name": "Nom lisible optionnel",
  "Percentage of EU AI Act requirements triggered by detected AI components":
    "Pourcentage d'exigences du règlement IA de l'UE déclenchées par les composants IA détectés",
  "Personal access token": "Jeton d'accès personnel",
  "Provider integrations": "Intégrations des fournisseurs",
  "Risk score threshold": "Seuil du score de risque",
  "Scan results": "Résultats de l'analyse",
  "Scans scoring above this will fail the check":
    "Les analyses notées au-dessus de ce seuil échoueront",
  "Scans with more findings will fail": "Les analyses avec plus de constats échoueront",
  "Search scans...": "Rechercher des analyses...",
  "Security issues": "Problèmes de sécurité",
  "Total findings": "Constats au total",
  "Total LLM vulnerability findings across all OWASP Top 10 for LLM types":
    "Total des vulnérabilités LLM détectées sur l'ensemble des types OWASP Top 10 pour LLM",
  "Total number of repository scans performed, including completed, failed, and cancelled scans.":
    "Nombre total d'analyses de dépôts effectuées, y compris celles terminées, échouées et annulées.",
  "Total number of source files analyzed": "Nombre total de fichiers source analysés",
  "Total scans": "Analyses au total",
  "Unique repos scanned": "Dépôts uniques analysés",
  "Vulnerabilities found": "Vulnérabilités trouvées",
  "Webhook Secret": "Secret du webhook",
  "Webhook URL": "URL du webhook",
  "What gets detected?": "Qu'est-ce qui est détecté ?",
  "No scans yet. Scan your repositories to detect AI and ML libraries.":
    "Aucune analyse pour le moment. Analysez vos dépôts pour détecter les bibliothèques IA et ML.",
  "Configure integrations and tokens for AI detection scanning.":
    "Configurer les intégrations et les jetons pour l'analyse de détection IA.",
  "Direct API calls to AI providers detected in code, including REST endpoints and SDK method invocations.":
    "Appels API directs à des fournisseurs IA détectés dans le code, y compris points de terminaison REST et invocations de méthodes SDK.",
  "How incremental scans work": "Comment fonctionnent les analyses incrémentales",
  "Select an LLM key": "Sélectionner une clé LLM",
  "Track changes over time": "Suivre les changements dans le temps",
  "View past repository scans and their results.":
    "Consulter les analyses de dépôt passées et leurs résultats.",
  "Combined count of all AI/ML detections across completed scans, including libraries, API calls, and secrets.":
    "Nombre combiné de toutes les détections IA/ML sur les analyses terminées, y compris les bibliothèques, les appels API et les secrets.",
  "Each scan creates a snapshot. Compare scans to see what AI components were added, removed, or changed across your codebase.":
    "Chaque analyse crée un instantané. Comparez les analyses pour voir quels composants IA ont été ajoutés, retirés ou modifiés dans votre code.",
  "Enter a public GitHub repository URL to detect AI/ML libraries and frameworks.":
    "Saisissez l'URL d'un dépôt GitHub public pour détecter les bibliothèques et référentiels IA/ML.",
  "Go to the Repositories tab and add a GitHub repository URL. Once added, you can run scans to detect AI/ML usage.":
    "Allez dans l'onglet Dépôts et ajoutez une URL de dépôt GitHub. Une fois ajouté, vous pouvez lancer des analyses pour détecter l'usage d'IA/ML.",
  "Max critical findings": "Max. constats critiques",
  "Security concerns including hardcoded API keys/secrets and model file vulnerabilities that could pose risks.":
    "Préoccupations de sécurité, notamment clés API/secrets codés en dur et vulnérabilités de fichiers de modèles pouvant présenter des risques.",
  "Total AI/ML detections found in this scan":
    "Total des détections IA/ML trouvées dans cette analyse",
  "e.g., VerifyWise Scanner Token": "ex. Jeton VerifyWise Scanner",
  "e.g., abc1234...": "ex. abc1234...",
  "e.g., def5678...": "ex. def5678...",
  "e.g., https://github.com/owner/repo or owner/repo":
    "ex. https://github.com/owner/repo ou owner/repo",
  "Operator": "Opérateur",
  "Repository URL": "URL du dépôt",
  "Configure a GitHub token in Settings to scan private repositories. Try these examples:":
    "Configurez un jeton GitHub dans les paramètres pour analyser les dépôts privés. Essayez ces exemples :",
  "Shubhamsaboo/awesome-llm-apps": "Shubhamsaboo/awesome-llm-apps",
  "langchain-ai/chat-langchain": "langchain-ai/chat-langchain",
  "verifywise-ai/llm-security-tester": "verifywise-ai/llm-security-tester",
  "Edit repository": "Modifier le dépôt",
  "Update repository settings and scan schedule.":
    "Mettre à jour les paramètres du dépôt et le calendrier d'analyse.",
  "REPOSITORY": "DÉPÔT",
  "FILES SCANNED": "FICHIERS ANALYSÉS",
  "FINDINGS": "CONSTATS",
  "RISK SCORE": "SCORE DE RISQUE",
  "TRIGGERED BY": "DÉCLENCHÉ PAR",
  "Cancelled": "Annulé",
  "Cloning": "Clonage",
  "Scanning": "Analyse en cours",
  "Failed to delete scan:": "Échec de la suppression de l'analyse :",
  "Failed to load scans:": "Échec du chargement des analyses :",
  "AI and machine learning libraries detected in the repository. Click on a finding to see file locations.":
    "Bibliothèques d'IA et d'apprentissage automatique détectées dans le dépôt. Cliquez sur un constat pour voir les emplacements des fichiers.",
  "Pre-trained AI/ML model references detected in the codebase. These include Hugging Face models, Ollama models, and other model identifiers.":
    "Références de modèles IA/ML préentraînés détectées dans le code. Cela inclut les modèles Hugging Face, Ollama et d'autres identifiants de modèles.",
  "API calls to AI/ML services detected in the codebase. These represent active usage of AI models and services.":
    "Appels API vers des services IA/ML détectés dans le code. Ils représentent un usage actif de modèles et de services IA.",
  "All API call findings are marked as high confidence. These indicate direct integration with AI services.":
    "Tous les constats d'appels API sont marqués comme haute confiance. Ils indiquent une intégration directe avec des services IA.",
  "No API calls detected in this repository": "Aucun appel API détecté dans ce dépôt",
  "API calls to OpenAI, Anthropic, Google AI, and other AI services will appear here":
    "Les appels API vers OpenAI, Anthropic, Google AI et d'autres services IA apparaîtront ici",
  "Hardcoded API keys and secrets detected in the codebase. These should be moved to environment variables or a secrets manager.":
    "Clés API et secrets codés en dur détectés dans le code. Ils devraient être déplacés vers des variables d'environnement ou un gestionnaire de secrets.",
  "Hardcoded secrets in source code can be exposed if the repository is made public or accessed by unauthorized users. Rotate any exposed credentials immediately.":
    "Les secrets codés en dur dans le code source peuvent être exposés si le dépôt est rendu public ou consulté par des utilisateurs non autorisés. Renouvelez immédiatement toutes les informations d'identification exposées.",
  "No hardcoded secrets detected": "Aucun secret codé en dur détecté",
  "No API keys, tokens, or other secrets were found in the scanned code.":
    "Aucune clé API, jeton ou autre secret n'a été trouvé dans le code analysé.",
  "No LLM vulnerabilities detected": "Aucune vulnérabilité LLM détectée",
  "Enable vulnerability scanning in settings for deep LLM analysis.":
    "Activez l'analyse des vulnérabilités dans les paramètres pour une analyse LLM approfondie.",
  "Insecure output handling": "Traitement de sortie non sécurisé",
  "Sensitive information disclosure": "Divulgation d'informations sensibles",
  "LLM01 — Untrusted input injected into system prompts":
    "LLM01 — Entrée non fiable injectée dans les prompts système",
  "LLM02 — LLM output flowing to dangerous sinks":
    "LLM02 — Sortie LLM dirigée vers des destinations dangereuses",
  "LLM03 — Unsafe model loading or untrusted training data":
    "LLM03 — Chargement de modèle non sûr ou données d'entraînement non fiables",
  "LLM04 — Missing token limits or input validation":
    "LLM04 — Limites de tokens ou validation d'entrée manquantes",
  "LLM05 — Risky AI package versions or untrusted model sources":
    "LLM05 — Versions de paquets IA risquées ou sources de modèles non fiables",
  "LLM06 — PII passed to or from LLM calls without redaction":
    "LLM06 — Données personnelles transmises vers ou depuis des appels LLM sans expurgation",
  "LLM07 — Plugins accepting raw input without validation":
    "LLM07 — Plugins acceptant une entrée brute sans validation",
  "LLM08 — Agents with overly broad tool access":
    "LLM08 — Agents avec un accès aux outils trop étendu",
  "LLM09 — LLM output used for decisions without validation":
    "LLM09 — Sortie LLM utilisée pour des décisions sans validation",
  "LLM10 — Model weights exposed without access controls":
    "LLM10 — Poids de modèle exposés sans contrôles d'accès",
  "Security findings": "Constats de sécurité",
  "No security issues detected": "Aucun problème de sécurité détecté",
  "Total requirements": "Exigences au total",
  "High priority": "Priorité élevée",
  "Medium priority": "Priorité moyenne",
  "Requirements scope": "Portée des exigences",
  "Requirements by category": "Exigences par catégorie",
  "Recent scans": "Analyses récentes",
  "AI agent frameworks and autonomous systems detected in the codebase. These include LangChain agents, CrewAI, AutoGen, and MCP servers.":
    "Frameworks d'agents IA et systèmes autonomes détectés dans le code. Cela inclut les agents LangChain, CrewAI, AutoGen et les serveurs MCP.",
  "AI agents can take autonomous actions and interact with external systems. Review these carefully for governance and security implications.":
    "Les agents IA peuvent effectuer des actions autonomes et interagir avec des systèmes externes. Examinez-les attentivement pour leurs implications en matière de gouvernance et de sécurité.",
  "AI governance risk score": "Score de risque de gouvernance IA",
  "Agent findings are marked as high risk due to their autonomous nature and ability to interact with external systems.":
    "Les détections d'agents sont marquées à haut risque en raison de leur nature autonome et de leur capacité à interagir avec des systèmes externes.",
  "Automatically scan this repository on a recurring schedule.":
    "Analyser automatiquement ce dépôt selon un calendrier récurrent.",
  "Autonomous AI systems detected": "Systèmes IA autonomes détectés",
  "Base commit SHA (older)": "SHA du commit de base (plus ancien)",
  "Based on the scan results, no additional compliance requirements were identified.":
    "D'après les résultats de l'analyse, aucune exigence de conformité supplémentaire n'a été identifiée.",
  "CI/CD Integration": "Intégration CI/CD",
  "Compliance checklist": "Liste de contrôle de conformité",
  "Create a new token on GitHub": "Créer un nouveau jeton sur GitHub",
  "Cross-ref": "Référence croisée",
  "Detected libraries": "Bibliothèques détectées",
  "Dimension breakdown": "Détail des dimensions",
  "Dimension weights": "Poids des dimensions",
  "Enable LLM-enhanced analysis above to use vulnerability detection.":
    "Activez l'analyse améliorée par LLM ci-dessus pour utiliser la détection de vulnérabilités.",
  "Failed to load scan details": "Échec du chargement des détails de l'analyse",
  "Found in:": "Trouvé dans :",
  "Head commit SHA (newer)": "SHA du commit HEAD (plus récent)",
  "LLM-enhanced analysis": "Analyse améliorée par LLM",
  "Couldn't load LLM keys. Reload the page to try again.":
    "Impossible de charger les clés LLM. Rechargez la page pour réessayer.",
  "Loading compliance data...": "Chargement des données de conformité...",
  "Loading repositories...": "Chargement des dépôts...",
  "Loading scan details...": "Chargement des détails de l'analyse...",
  "Loading scan results...": "Chargement des résultats de l'analyse...",
  "Model references indicate usage of pre-trained models from Hugging Face Hub, Ollama, and other sources.":
    "Les références de modèles indiquent l'utilisation de modèles pré-entraînés provenant de Hugging Face Hub, Ollama et d'autres sources.",
  "No AI agents detected in this repository": "Aucun agent IA détecté dans ce dépôt",
  "No RAG components detected in this repository": "Aucun composant RAG détecté dans ce dépôt",
  "No model references detected in this repository":
    "Aucune référence de modèle détectée dans ce dépôt",
  "No specific compliance actions needed": "Aucune action de conformité spécifique requise",
  "OWASP ML": "OWASP ML",
  "Post PR comments": "Publier des commentaires PR",
  "Post status checks": "Publier des vérifications de statut",
  "RAG (Retrieval-Augmented Generation) pipeline components detected in the codebase. These include vector databases, document loaders, and embedding models.":
    "Composants de pipeline RAG (Génération augmentée par récupération) détectés dans le code. Cela inclut les bases de données vectorielles, les chargeurs de documents et les modèles d'embedding.",
  "RAG components indicate usage of vector databases, document loaders, and embedding systems for retrieval-augmented generation.":
    "Les composants RAG indiquent l'utilisation de bases de données vectorielles, chargeurs de documents et systèmes d'embedding pour la génération augmentée par récupération.",
  "Recommended mitigation": "Atténuation recommandée",
  "Risks to consider:": "Risques à considérer :",
  "Run scans on pull requests and block merges that exceed risk thresholds.":
    "Exécutez des analyses sur les pull requests et bloquez les fusions qui dépassent les seuils de risque.",
  "Scan completed": "Analyse terminée",
  "Scan failed": "Échec de l'analyse",
  "Scheduled scans": "Analyses planifiées",
  "Security risk detected": "Risque de sécurité détecté",
  "Test token": "Jeton de test",
  "This has already been added before": "Cela a déjà été ajouté",
  "This is not a real risk": "Ce n'est pas un risque réel",
  "Threat type": "Type de menace",
  "Token configured": "Jeton configuré",
  "Unable to load compliance data": "Impossible de charger les données de conformité",
  "Use this secret when configuring the webhook in your GitHub repository settings.":
    "Utilisez ce secret lors de la configuration du webhook dans les paramètres de votre dépôt GitHub.",
  "Vulnerability detection": "Détection de vulnérabilités",
  "AI is thinking really hard": "L'IA réfléchit intensément",
  "AI/ML libraries detected in this repository": "Bibliothèques IA/ML détectées dans ce dépôt",
  "Accepted risk": "Risque accepté",
  "Address immediately - critical for compliance":
    "À traiter immédiatement — critique pour la conformité",
  "Address soon - important for compliance": "À traiter rapidement — important pour la conformité",
  "Address when possible - recommended for compliance":
    "À traiter dès que possible — recommandé pour la conformité",
  "All findings of this type": "Tous les résultats de ce type",
  "All findings with this name": "Tous les résultats avec ce nom",
  "Almost there, finalizing score": "Presque terminé, finalisation du score",
  "Asking AI for a second opinion": "Demander un deuxième avis à l'IA",
  "Autonomous AI agent implementations": "Implémentations d'agents IA autonomes",
  "Calculating dimension penalties": "Calcul des pénalités de dimension",
  "Configure AI Governance Risk Score settings":
    "Configurer les paramètres du score de risque de gouvernance IA",
  "Connect a GitHub token to scan private repositories":
    "Connectez un jeton GitHub pour analyser les dépôts privés",
  "Create a rule that hides matching findings from future scans and excludes them from risk scores.":
    "Créez une règle qui masque les résultats correspondants des futures analyses et les exclut des scores de risque.",
  "Cross-referencing correlations": "Corrélations de références croisées",
  "Data sent to external cloud APIs. Risk of data leakage, vendor lock-in, and compliance violations.":
    "Données envoyées à des API cloud externes. Risque de fuite de données, de dépendance fournisseur et de non-conformité.",
  "Delete rule": "Supprimer la règle",
  "Delete suppression rule": "Supprimer la règle de suppression",
  "Delete suppression rule?": "Supprimer la règle de suppression ?",
  "Exposed API keys and credentials": "Clés API et identifiants exposés",
  "External AI API calls found in the code": "Appels API IA externes trouvés dans le code",
  "Failed to create suppression rule": "Échec de la création de la règle de suppression",
  "Failed to delete token": "Échec de la suppression du jeton",
  "Failed to load token status": "Échec du chargement du statut du jeton",
  "Failed to save token": "Échec de l'enregistrement du jeton",
  "Failed to test token": "Échec du test du jeton",
  "Framework that can connect to cloud APIs depending on configuration. Review usage to assess actual risk.":
    "Référentiel pouvant se connecter à des API cloud selon la configuration. Examinez l'utilisation pour évaluer le risque réel.",
  "Gathering scan findings": "Collecte des résultats d'analyse",
  "GitHub integration": "Intégration GitHub",
  "GitHub token deleted successfully": "Jeton GitHub supprimé avec succès",
  "GitHub token saved successfully": "Jeton GitHub enregistré avec succès",
  "LAST SCAN": "DERNIÈRE ANALYSE",
  "LLM-specific vulnerabilities (prompt injection, PII exposure, excessive agency, jailbreak risk)":
    "Vulnérabilités spécifiques aux LLM (injection d'invites, exposition PII, agence excessive, risque de jailbreak)",
  "License could not be determined. Verify manually before commercial use.":
    "La licence n'a pas pu être déterminée. Vérifiez manuellement avant utilisation commerciale.",
  "Local processing only. Data stays on your infrastructure with minimal external exposure.":
    "Traitement local uniquement. Les données restent sur votre infrastructure avec une exposition externe minimale.",
  "Manage rules that suppress matching findings on future scans":
    "Gérer les règles qui suppriment les résultats correspondants lors des futures analyses",
  "Mapping findings to risk dimensions": "Mappage des résultats aux dimensions de risque",
  "Moderate restrictions (LGPL, MPL, CC-BY-SA). Some obligations but generally allows commercial use.":
    "Restrictions modérées (LGPL, MPL, CC-BY-SA). Certaines obligations mais autorise généralement l'utilisation commerciale.",
  "NEXT SCAN": "PROCHAINE ANALYSE",
  "No suppression rules yet": "Pas encore de règles de suppression",
  "Permissive": "Permissif",
  "Permissive license (MIT, Apache, BSD). Minimal restrictions, allows commercial use.":
    "Licence permissive (MIT, Apache, BSD). Restrictions minimales, autorise l'utilisation commerciale.",
  "Please enter a token": "Veuillez saisir un jeton",
  "Please enter a token to test": "Veuillez saisir un jeton à tester",
  "Please select an LLM key or disable LLM analysis":
    "Veuillez sélectionner une clé LLM ou désactiver l'analyse LLM",
  "References to AI models in the codebase": "Références aux modèles IA dans le code",
  "Regulatory compliance checks and mappings":
    "Vérifications de conformité réglementaire et mappages",
  "Requirements for human control over AI decisions":
    "Exigences pour le contrôle humain sur les décisions IA",
  "Requirements for identifying and mitigating AI-related risks":
    "Exigences pour identifier et atténuer les risques liés à l'IA",
  "Requirements for maintaining technical records of AI components":
    "Exigences pour la tenue des registres techniques des composants IA",
  "Requirements for making AI systems understandable to users and deployers":
    "Exigences pour rendre les systèmes IA compréhensibles aux utilisateurs et déployeurs",
  "Requirements for managing data used by AI systems":
    "Exigences pour gérer les données utilisées par les systèmes IA",
  "Requirements for ongoing observation of AI performance":
    "Exigences pour l'observation continue de la performance IA",
  "Requirements for protecting AI systems from attacks":
    "Exigences pour protéger les systèmes IA contre les attaques",
  "Requirements for quality management and responsibility":
    "Exigences pour la gestion de la qualité et la responsabilité",
  "Restrictive": "Restrictif",
  "Restrictive license (GPL, AGPL, CC-NC). May require code disclosure or prohibit commercial use.":
    "Licence restrictive (GPL, AGPL, CC-NC). Peut nécessiter la divulgation du code ou interdire l'utilisation commerciale.",
  "Retrieval-augmented generation components":
    "Composants de génération augmentée par récupération",
  "Risk scoring settings saved": "Paramètres de scoring de risque enregistrés",
  "Secrets": "Secrets",
  "Security vulnerabilities in AI dependencies":
    "Vulnérabilités de sécurité dans les dépendances IA",
  "Show suppressed findings": "Afficher les résultats supprimés",
  "Suppress": "Supprimer",
  "Suppress finding": "Supprimer le résultat",
  "Suppressed": "Supprimé",
  "Suppression rules": "Règles de suppression",
  "Token is valid": "Le jeton est valide",
  "Vulnerabilities": "Vulnérabilités",
  "Weighing risk dimensions": "Pondération des dimensions de risque",
};

export const es: Record<string, string> = {
  "Add repository": "Añadir repositorio",
  "Documentation": "Documentación",
  "AI/ML imports": "Importaciones de IA/ML",
  "AI/ML libraries (TensorFlow, PyTorch, scikit-learn), LLM SDKs (OpenAI, Anthropic), model files, ML pipelines, and containerized AI workloads.":
    "Bibliotecas de IA/ML (TensorFlow, PyTorch, scikit-learn), SDK de LLM (OpenAI, Anthropic), archivos de modelo, pipelines de ML y cargas de trabajo de IA en contenedores.",
  "AI/ML library imports and framework dependencies detected in source code (e.g., TensorFlow, PyTorch, OpenAI SDK).":
    "Importaciones de bibliotecas de IA/ML y dependencias de marcos detectadas en el código fuente (p. ej., TensorFlow, PyTorch, OpenAI SDK).",
  "Default branch": "Rama predeterminada",
  "Export AI Bill of Materials (AI-BOM)": "Exportar la lista de materiales de IA (AI-BOM)",
  "Hour (UTC)": "Hora (UTC)",
  "Only scans files changed between two commits. Findings from unchanged files are carried forward from the most recent full scan. Requires a completed full scan of this repository as a baseline.":
    "Solo analiza los archivos modificados entre dos commits. Los hallazgos de los archivos sin cambios se conservan del análisis completo más reciente. Requiere un análisis completo de este repositorio como referencia.",
  "Token name (optional)": "Nombre del token (opcional)",
  "Add a repository first": "Añada primero un repositorio",
  "Back to history": "Volver al historial",
  "Delete scan?": "¿Eliminar análisis?",
  "Export AI-BOM": "Exportar AI-BOM",
  "Recalculate risk score": "Recalcular puntuación de riesgo",
  "Recalculate score": "Recalcular puntuación",
  "Recalculating risk score": "Recalculando puntuación de riesgo",
  "Scan another": "Escanear otro",
  "AI analysis": "Análisis de IA",
  "All detections": "Todas las detecciones",
  "API calls": "Llamadas a la API",
  "Below 70 threshold": "Por debajo del umbral de 70",
  "Clear status": "Borrar estado",
  "Day of month": "Día del mes",
  "Day of week": "Día de la semana",
  "Dimensions at risk": "Dimensiones en riesgo",
  "Files scanned": "Archivos escaneados",
  "Findings with high detection confidence": "Hallazgos con alta confianza de detección",
  "Findings with medium detection confidence": "Hallazgos con confianza de detección media",
  "GitHub URL": "URL de GitHub",
  "Grade": "Calificación",
  "High confidence": "Confianza alta",
  "Incremental": "Incremental",
  "Incremental scan": "Escaneo incremental",
  "Libraries": "Bibliotecas",
  "LLM provider": "Proveedor de LLM",
  "Medium confidence": "Confianza media",
  "Number of unique repositories that have been scanned. Multiple scans of the same repo count as one.":
    "Número de repositorios únicos que se han analizado. Varios análisis del mismo repositorio cuentan como uno.",
  "Optional friendly name": "Nombre descriptivo opcional",
  "Percentage of EU AI Act requirements triggered by detected AI components":
    "Porcentaje de requisitos del EU AI Act activados por los componentes de IA detectados",
  "Personal access token": "Token de acceso personal",
  "Provider integrations": "Integraciones de proveedores",
  "Risk score threshold": "Umbral de la puntuación de riesgo",
  "Scan results": "Resultados del análisis",
  "Scans scoring above this will fail the check":
    "Los análisis con una puntuación superior a este valor no superarán la comprobación",
  "Scans with more findings will fail": "Los análisis con más hallazgos fallarán",
  "Search scans...": "Buscar análisis...",
  "Security issues": "Problemas de seguridad",
  "Total findings": "Total de hallazgos",
  "Total LLM vulnerability findings across all OWASP Top 10 for LLM types":
    "Total de hallazgos de vulnerabilidades de LLM en todos los tipos del OWASP Top 10 para LLM",
  "Total number of repository scans performed, including completed, failed, and cancelled scans.":
    "Número total de análisis de repositorios realizados, incluidos los análisis completados, fallidos y cancelados.",
  "Total number of source files analyzed": "Número total de archivos de origen analizados",
  "Total scans": "Total de análisis",
  "Unique repos scanned": "Repositorios únicos analizados",
  "Vulnerabilities found": "Vulnerabilidades encontradas",
  "Webhook Secret": "Secreto del webhook",
  "Webhook URL": "URL del webhook",
  "What gets detected?": "¿Qué se detecta?",
  "No scans yet. Scan your repositories to detect AI and ML libraries.":
    "Aún no hay análisis. Analice sus repositorios para detectar bibliotecas de IA y ML.",
  "Configure integrations and tokens for AI detection scanning.":
    "Configure integraciones y tokens para el análisis de detección de IA.",
  "Direct API calls to AI providers detected in code, including REST endpoints and SDK method invocations.":
    "Llamadas directas a la API de proveedores de IA detectadas en el código, incluidos endpoints REST e invocaciones de métodos de SDK.",
  "How incremental scans work": "Cómo funcionan los análisis incrementales",
  "Select an LLM key": "Selecciona una clave de LLM",
  "Track changes over time": "Seguir los cambios a lo largo del tiempo",
  "View past repository scans and their results.":
    "Vea los análisis de repositorios anteriores y sus resultados.",
  "Combined count of all AI/ML detections across completed scans, including libraries, API calls, and secrets.":
    "Recuento combinado de todas las detecciones de IA/ML en los análisis completados, incluidas bibliotecas, llamadas a API y secretos.",
  "Each scan creates a snapshot. Compare scans to see what AI components were added, removed, or changed across your codebase.":
    "Cada análisis crea una instantánea. Compare los análisis para ver qué componentes de IA se han añadido, eliminado o modificado en su base de código.",
  "Enter a public GitHub repository URL to detect AI/ML libraries and frameworks.":
    "Introduzca la URL de un repositorio público de GitHub para detectar bibliotecas y marcos de IA/ML.",
  "Go to the Repositories tab and add a GitHub repository URL. Once added, you can run scans to detect AI/ML usage.":
    "Vaya a la pestaña Repositorios y añada la URL de un repositorio de GitHub. Una vez añadido, podrá ejecutar análisis para detectar el uso de IA/ML.",
  "Max critical findings": "Máximo de hallazgos críticos",
  "Security concerns including hardcoded API keys/secrets and model file vulnerabilities that could pose risks.":
    "Problemas de seguridad, incluidas claves de API/secretos codificados en el código y vulnerabilidades en archivos de modelos que podrían suponer riesgos.",
  "Total AI/ML detections found in this scan":
    "Total de detecciones de IA/ML encontradas en este análisis",
  "e.g., VerifyWise Scanner Token": "p. ej., Token del escáner de VerifyWise",
  "e.g., abc1234...": "p. ej., abc1234...",
  "e.g., def5678...": "p. ej., def5678...",
  "e.g., https://github.com/owner/repo or owner/repo":
    "p. ej., https://github.com/owner/repo u owner/repo",
  "Operator": "Operador",
  "Repository URL": "URL del repositorio",
  "Configure a GitHub token in Settings to scan private repositories. Try these examples:":
    "Configure un token de GitHub en Configuración para analizar repositorios privados. Pruebe estos ejemplos:",
  "Shubhamsaboo/awesome-llm-apps": "Shubhamsaboo/awesome-llm-apps",
  "langchain-ai/chat-langchain": "langchain-ai/chat-langchain",
  "verifywise-ai/llm-security-tester": "verifywise-ai/llm-security-tester",
  "Edit repository": "Editar repositorio",
  "Update repository settings and scan schedule.":
    "Actualice la configuración del repositorio y la programación del análisis.",
  "REPOSITORY": "REPOSITORIO",
  "FILES SCANNED": "ARCHIVOS ANALIZADOS",
  "FINDINGS": "HALLAZGOS",
  "RISK SCORE": "PUNTUACIÓN DE RIESGO",
  "TRIGGERED BY": "ACTIVADO POR",
  "Cancelled": "Cancelado",
  "Cloning": "Clonando",
  "Scanning": "Analizando",
  "Failed to delete scan:": "No se pudo eliminar el análisis:",
  "Failed to load scans:": "No se pudieron cargar los análisis:",
  "AI and machine learning libraries detected in the repository. Click on a finding to see file locations.":
    "Bibliotecas de IA y de aprendizaje automático detectadas en el repositorio. Haga clic en un hallazgo para ver las ubicaciones de los archivos.",
  "Pre-trained AI/ML model references detected in the codebase. These include Hugging Face models, Ollama models, and other model identifiers.":
    "Referencias a modelos de IA/ML preentrenados detectadas en el código base. Incluyen modelos de Hugging Face, modelos de Ollama y otros identificadores de modelos.",
  "API calls to AI/ML services detected in the codebase. These represent active usage of AI models and services.":
    "Llamadas a la API de servicios de IA/ML detectadas en el código base. Representan un uso activo de modelos y servicios de IA.",
  "All API call findings are marked as high confidence. These indicate direct integration with AI services.":
    "Todos los hallazgos de llamadas a la API se marcan como de alta confianza. Indican una integración directa con servicios de IA.",
  "No API calls detected in this repository":
    "No se han detectado llamadas a la API en este repositorio",
  "API calls to OpenAI, Anthropic, Google AI, and other AI services will appear here":
    "Aquí aparecerán las llamadas a la API de OpenAI, Anthropic, Google AI y otros servicios de IA",
  "Hardcoded API keys and secrets detected in the codebase. These should be moved to environment variables or a secrets manager.":
    "Claves de API y secretos codificados de forma fija detectados en el código base. Deberían trasladarse a variables de entorno o a un gestor de secretos.",
  "Hardcoded secrets in source code can be exposed if the repository is made public or accessed by unauthorized users. Rotate any exposed credentials immediately.":
    "Los secretos codificados de forma fija en el código fuente pueden quedar expuestos si el repositorio se hace público o si acceden a él usuarios no autorizados. Rote de inmediato todas las credenciales expuestas.",
  "No hardcoded secrets detected": "No se han detectado secretos codificados",
  "No API keys, tokens, or other secrets were found in the scanned code.":
    "No se encontraron claves de API, tokens ni otros secretos en el código analizado.",
  "No LLM vulnerabilities detected": "No se han detectado vulnerabilidades de LLM",
  "Enable vulnerability scanning in settings for deep LLM analysis.":
    "Active el análisis de vulnerabilidades en la configuración para un análisis profundo de LLM.",
  "Insecure output handling": "Gestión insegura de salidas",
  "Sensitive information disclosure": "Divulgación de información sensible",
  "LLM01 — Untrusted input injected into system prompts":
    "LLM01 — Entrada no confiable inyectada en los prompts de sistema",
  "LLM02 — LLM output flowing to dangerous sinks":
    "LLM02 — Salida de LLM que fluye hacia destinos peligrosos",
  "LLM03 — Unsafe model loading or untrusted training data":
    "LLM03 — Carga de modelos insegura o datos de entrenamiento no confiables",
  "LLM04 — Missing token limits or input validation":
    "LLM04 — Ausencia de límites de tokens o de validación de entrada",
  "LLM05 — Risky AI package versions or untrusted model sources":
    "LLM05 — Versiones de paquetes de IA arriesgadas o fuentes de modelos no confiables",
  "LLM06 — PII passed to or from LLM calls without redaction":
    "LLM06 — PII transmitida hacia o desde llamadas a LLM sin redacción",
  "LLM07 — Plugins accepting raw input without validation":
    "LLM07 — Complementos que aceptan entrada sin procesar sin validación",
  "LLM08 — Agents with overly broad tool access":
    "LLM08 — Agentes con un acceso a herramientas demasiado amplio",
  "LLM09 — LLM output used for decisions without validation":
    "LLM09 — Salida de LLM utilizada para decisiones sin validación",
  "LLM10 — Model weights exposed without access controls":
    "LLM10 — Pesos del modelo expuestos sin controles de acceso",
  "Security findings": "Hallazgos de seguridad",
  "No security issues detected": "No se han detectado problemas de seguridad",
  "Total requirements": "Total de requisitos",
  "High priority": "Prioridad alta",
  "Medium priority": "Prioridad media",
  "Requirements scope": "Alcance de los requisitos",
  "Requirements by category": "Requisitos por categoría",
  "Recent scans": "Análisis recientes",
  "AI agent frameworks and autonomous systems detected in the codebase. These include LangChain agents, CrewAI, AutoGen, and MCP servers.":
    "Marcos de agentes de IA y sistemas autónomos detectados en el código base. Incluyen agentes de LangChain, CrewAI, AutoGen y servidores MCP.",
  "AI agents can take autonomous actions and interact with external systems. Review these carefully for governance and security implications.":
    "Los agentes de IA pueden realizar acciones autónomas e interactuar con sistemas externos. Revíselos cuidadosamente por sus implicaciones para la gobernanza y la seguridad.",
  "AI governance risk score": "Puntuación de riesgo de gobernanza de IA",
  "Agent findings are marked as high risk due to their autonomous nature and ability to interact with external systems.":
    "Los hallazgos de agentes se marcan como de alto riesgo debido a su naturaleza autónoma y su capacidad para interactuar con sistemas externos.",
  "Automatically scan this repository on a recurring schedule.":
    "Analizar automáticamente este repositorio según una programación periódica.",
  "Autonomous AI systems detected": "Sistemas de IA autónomos detectados",
  "Base commit SHA (older)": "SHA del commit base (anterior)",
  "Based on the scan results, no additional compliance requirements were identified.":
    "Según los resultados del análisis, no se identificaron requisitos de cumplimiento adicionales.",
  "CI/CD Integration": "Integración de CI/CD",
  "Compliance checklist": "Lista de verificación de cumplimiento",
  "Create a new token on GitHub": "Crear un nuevo token en GitHub",
  "Cross-ref": "Referencia cruzada",
  "Detected libraries": "Bibliotecas detectadas",
  "Dimension breakdown": "Desglose por dimensión",
  "Dimension weights": "Pesos de las dimensiones",
  "Enable LLM-enhanced analysis above to use vulnerability detection.":
    "Active el análisis mejorado con LLM de arriba para utilizar la detección de vulnerabilidades.",
  "Failed to load scan details": "No se pudieron cargar los detalles del análisis",
  "Found in:": "Encontrado en:",
  "Head commit SHA (newer)": "SHA del commit principal (más reciente)",
  "LLM-enhanced analysis": "Análisis mejorado con LLM",
  "Couldn't load LLM keys. Reload the page to try again.":
    "No se pudieron cargar las claves LLM. Recarga la página para volver a intentarlo.",
  "Loading compliance data...": "Cargando datos de cumplimiento...",
  "Loading repositories...": "Cargando repositorios...",
  "Loading scan details...": "Cargando detalles del análisis...",
  "Loading scan results...": "Cargando resultados del análisis...",
  "Model references indicate usage of pre-trained models from Hugging Face Hub, Ollama, and other sources.":
    "Las referencias a modelos indican el uso de modelos preentrenados de Hugging Face Hub, Ollama y otras fuentes.",
  "No AI agents detected in this repository":
    "No se han detectado agentes de IA en este repositorio",
  "No RAG components detected in this repository":
    "No se detectaron componentes RAG en este repositorio",
  "No model references detected in this repository":
    "No se detectaron referencias a modelos en este repositorio",
  "No specific compliance actions needed": "No se necesitan acciones de cumplimiento específicas",
  "OWASP ML": "OWASP ML",
  "Post PR comments": "Publicar comentarios de PR",
  "Post status checks": "Publicar comprobaciones de estado",
  "RAG (Retrieval-Augmented Generation) pipeline components detected in the codebase. These include vector databases, document loaders, and embedding models.":
    "Componentes de la canalización RAG (generación aumentada por recuperación) detectados en el código base. Incluyen bases de datos vectoriales, cargadores de documentos y modelos de incrustación.",
  "RAG components indicate usage of vector databases, document loaders, and embedding systems for retrieval-augmented generation.":
    "Los componentes RAG indican el uso de bases de datos vectoriales, cargadores de documentos y sistemas de incrustación para la generación aumentada por recuperación.",
  "Recommended mitigation": "Mitigación recomendada",
  "Risks to consider:": "Riesgos a tener en cuenta:",
  "Run scans on pull requests and block merges that exceed risk thresholds.":
    "Ejecute análisis en las solicitudes de incorporación de cambios y bloquee las fusiones que superen los umbrales de riesgo.",
  "Scan completed": "Análisis completado",
  "Scan failed": "Error en el análisis",
  "Scheduled scans": "Análisis programados",
  "Security risk detected": "Riesgo de seguridad detectado",
  "Test token": "Probar token",
  "This has already been added before": "Esto ya se ha añadido antes",
  "This is not a real risk": "Este no es un riesgo real",
  "Threat type": "Tipo de amenaza",
  "Token configured": "Token configurado",
  "Unable to load compliance data": "No se han podido cargar los datos de cumplimiento",
  "Use this secret when configuring the webhook in your GitHub repository settings.":
    "Use este secreto al configurar el webhook en la configuración de su repositorio de GitHub.",
  "Vulnerability detection": "Detección de vulnerabilidades",
  "AI is thinking really hard": "La IA está pensando intensamente",
  "AI/ML libraries detected in this repository":
    "Bibliotecas de IA/ML detectadas en este repositorio",
  "Accepted risk": "Riesgo aceptado",
  "Address immediately - critical for compliance":
    "Abordar de inmediato: fundamental para el cumplimiento",
  "Address soon - important for compliance": "Atender pronto: importante para el cumplimiento",
  "Address when possible - recommended for compliance":
    "Abordar cuando sea posible: recomendado para el cumplimiento",
  "All findings of this type": "Todos los hallazgos de este tipo",
  "All findings with this name": "Todos los hallazgos con este nombre",
  "Almost there, finalizing score": "Casi listo, finalizando la puntuación",
  "Asking AI for a second opinion": "Pidiendo a la IA una segunda opinión",
  "Autonomous AI agent implementations": "Implementaciones de agentes de IA autónomos",
  "Calculating dimension penalties": "Calculando penalizaciones por dimensión",
  "Configure AI Governance Risk Score settings":
    "Configure los ajustes de la puntuación de riesgo de gobernanza de IA",
  "Connect a GitHub token to scan private repositories":
    "Conecte un token de GitHub para analizar repositorios privados",
  "Create a rule that hides matching findings from future scans and excludes them from risk scores.":
    "Cree una regla que oculte los hallazgos coincidentes en futuros análisis y los excluya de las puntuaciones de riesgo.",
  "Cross-referencing correlations": "Correlación de referencias cruzadas",
  "Data sent to external cloud APIs. Risk of data leakage, vendor lock-in, and compliance violations.":
    "Datos enviados a API en la nube externas. Riesgo de fuga de datos, dependencia del proveedor e incumplimientos normativos.",
  "Delete rule": "Eliminar regla",
  "Delete suppression rule": "Eliminar regla de supresión",
  "Delete suppression rule?": "¿Eliminar regla de supresión?",
  "Exposed API keys and credentials": "Claves de API y credenciales expuestas",
  "External AI API calls found in the code":
    "Se encontraron llamadas a API de IA externas en el código",
  "Failed to create suppression rule": "Error al crear la regla de supresión",
  "Failed to delete token": "Error al eliminar el token",
  "Failed to load token status": "Error al cargar el estado del token",
  "Failed to save token": "Error al guardar el token",
  "Failed to test token": "Error al probar el token",
  "Framework that can connect to cloud APIs depending on configuration. Review usage to assess actual risk.":
    "Marco que puede conectarse a API en la nube según la configuración. Revise el uso para evaluar el riesgo real.",
  "Gathering scan findings": "Recopilando hallazgos del análisis",
  "GitHub integration": "Integración con GitHub",
  "GitHub token deleted successfully": "Token de GitHub eliminado correctamente",
  "GitHub token saved successfully": "Token de GitHub guardado correctamente",
  "LAST SCAN": "ÚLTIMO ESCANEO",
  "LLM-specific vulnerabilities (prompt injection, PII exposure, excessive agency, jailbreak risk)":
    "Vulnerabilidades específicas de los LLM (inyección de prompts, exposición de PII, agencia excesiva, riesgo de jailbreak)",
  "License could not be determined. Verify manually before commercial use.":
    "No se pudo determinar la licencia. Verifíquela manualmente antes de su uso comercial.",
  "Local processing only. Data stays on your infrastructure with minimal external exposure.":
    "Solo procesamiento local. Los datos permanecen en su infraestructura con una exposición externa mínima.",
  "Manage rules that suppress matching findings on future scans":
    "Gestione reglas que supriman los hallazgos coincidentes en futuros análisis",
  "Mapping findings to risk dimensions": "Asignación de hallazgos a dimensiones de riesgo",
  "Moderate restrictions (LGPL, MPL, CC-BY-SA). Some obligations but generally allows commercial use.":
    "Restricciones moderadas (LGPL, MPL, CC-BY-SA). Algunas obligaciones, pero por lo general permite el uso comercial.",
  "NEXT SCAN": "PRÓXIMO ESCANEO",
  "No suppression rules yet": "Aún no hay reglas de supresión",
  "Permissive": "Permisivo",
  "Permissive license (MIT, Apache, BSD). Minimal restrictions, allows commercial use.":
    "Licencia permisiva (MIT, Apache, BSD). Restricciones mínimas, permite el uso comercial.",
  "Please enter a token": "Introduce un token",
  "Please enter a token to test": "Introduce un token para probar",
  "Please select an LLM key or disable LLM analysis":
    "Seleccione una clave de LLM o deshabilite el análisis con LLM",
  "References to AI models in the codebase": "Referencias a modelos de IA en el código",
  "Regulatory compliance checks and mappings": "Comprobaciones y mapeos de cumplimiento normativo",
  "Requirements for human control over AI decisions":
    "Requisitos para el control humano sobre las decisiones de IA",
  "Requirements for identifying and mitigating AI-related risks":
    "Requisitos para identificar y mitigar los riesgos relacionados con la IA",
  "Requirements for maintaining technical records of AI components":
    "Requisitos para mantener registros técnicos de los componentes de IA",
  "Requirements for making AI systems understandable to users and deployers":
    "Requisitos para hacer que los sistemas de IA sean comprensibles para los usuarios y los responsables del despliegue",
  "Requirements for managing data used by AI systems":
    "Requisitos para gestionar los datos utilizados por los sistemas de IA",
  "Requirements for ongoing observation of AI performance":
    "Requisitos para la observación continua del rendimiento de la IA",
  "Requirements for protecting AI systems from attacks":
    "Requisitos para proteger los sistemas de IA frente a ataques",
  "Requirements for quality management and responsibility":
    "Requisitos para la gestión de la calidad y la responsabilidad",
  "Restrictive": "Restrictivo",
  "Restrictive license (GPL, AGPL, CC-NC). May require code disclosure or prohibit commercial use.":
    "Licencia restrictiva (GPL, AGPL, CC-NC). Puede exigir la divulgación del código o prohibir el uso comercial.",
  "Retrieval-augmented generation components":
    "Componentes de generación aumentada por recuperación",
  "Risk scoring settings saved": "Configuración de puntuación de riesgos guardada",
  "Secrets": "Secretos",
  "Security vulnerabilities in AI dependencies":
    "Vulnerabilidades de seguridad en las dependencias de IA",
  "Show suppressed findings": "Mostrar hallazgos suprimidos",
  "Suppress": "Suprimir",
  "Suppress finding": "Suprimir hallazgo",
  "Suppressed": "Suprimido",
  "Suppression rules": "Reglas de supresión",
  "Token is valid": "El token es válido",
  "Vulnerabilities": "Vulnerabilidades",
  "Weighing risk dimensions": "Ponderación de las dimensiones de riesgo",
};
