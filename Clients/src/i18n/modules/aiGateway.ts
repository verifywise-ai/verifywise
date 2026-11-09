// aiGateway strings for de, fr and es. English is the key.
// Spread into ../translations.ts. Other areas stay in that file for now.

export const de: Record<string, string> = {
  "Use monitor only mode?": "Modus „Nur überwachen“ verwenden?",
  "Use monitor only": "Nur überwachen verwenden",
  "Calls made with this key will no longer be blocked or paused for approval.":
    "Aufrufe mit diesem Schlüssel werden nicht mehr blockiert oder zur Genehmigung pausiert.",
  'Guardrails and approval rules are still checked, and so are the key\'s tool lists for calls through the MCP proxy, and for native tool calls when the key\'s "Also apply tool lists to native tool calls" setting is on. Every match is logged in Activity as "Would block" or "Would need approval". No approval requests are created. Rate limits still apply.':
    "Guardrails und Genehmigungsregeln werden weiterhin geprüft, bei Aufrufen über den MCP-Proxy auch die Tool-Listen des Schlüssels, und bei nativen Tool-Aufrufen ebenfalls, wenn die Einstellung „Tool-Listen auch auf native Tool-Aufrufe anwenden“ des Schlüssels aktiviert ist. Jeder Treffer wird unter „Aktivität“ als „Würde blockieren“ oder „Würde Genehmigung erfordern“ protokolliert. Es werden keine Genehmigungsanfragen erstellt. Ratenlimits gelten weiterhin.",
  "Would block": "Würde blockieren",
  "Would need approval": "Würde Genehmigung erfordern",
  "{count} would block": "{count} würden blockiert",
  "{count} would need approval": "{count} würden Genehmigung erfordern",
  "Also apply tool lists to native tool calls (hooks and SDK)":
    "Tool-Listen auch auf native Tool-Aufrufe anwenden (Hooks und SDK)",
  "Off: the allowed and blocked tool lists apply only to MCP server tools called through the proxy. On: they also apply to the agent's own tool calls checked by the hook script or the Python SDK, such as Bash, Edit or your Python functions. Leave it off for keys used by Claude Code or Cursor unless the lists name those tools.":
    "Aus: Die Listen erlaubter und blockierter Tools gelten nur für MCP-Server-Tools, die über den Proxy aufgerufen werden. An: Sie gelten auch für die eigenen Tool-Aufrufe des Agenten, die vom Hook-Skript oder vom Python SDK geprüft werden, etwa Bash, Edit oder Ihre Python-Funktionen. Lassen Sie die Einstellung für Schlüssel, die Claude Code oder Cursor verwenden, aus, sofern die Listen diese Tools nicht nennen.",
  "The server offered no tools": "Der Server hat keine Tools angeboten",
  "One tool found": "Ein Tool gefunden",
  "{count} tools found": "{count} Tools gefunden",
  "{count} new": "{count} neu",
  "{count} removed": "{count} entfernt",
  "{count} changed": "{count} geändert",
  "Back to MCP servers": "Zurück zu MCP-Servern",
  "Model calls": "Modellaufrufe",
  "Filter": "Filter",
  "No agent runs yet": "Noch keine Agentenläufe",
  "Recent activity": "Letzte Aktivität",
  "Avg Latency": "Durchschnittliche Latenz",
  "Avg input tokens": "Durchschnittliche Eingabe-Tokens",
  "Avg latency, top 10 tools": "Durchschnittliche Latenz, Top 10 Tools",
  "Avg output tokens": "Durchschnittliche Ausgabe-Tokens",
  "Cache TTL (seconds)": "Cache-TTL (Sekunden)",
  "Config (JSON)": "Konfiguration (JSON)",
  "Create risk": "Risiko erstellen",
  "Default TTL (seconds)": "Standard-TTL (Sekunden)",
  "Each discovered tool can be assigned a risk level (low, medium, high). High-risk tools can require approval before execution.":
    "Jedem erkannten Tool kann ein Risikoniveau (niedrig, mittel, hoch) zugewiesen werden. Tools mit hohem Risiko können vor der Ausführung eine Genehmigung erfordern.",
  "Guardrail rules are evaluated against tool input data before the MCP tool is executed. Block or mask sensitive content to protect your downstream systems.":
    "Guardrail-Regeln werden vor der Ausführung des MCP-Tools gegen die Tool-Eingabedaten ausgewertet. Sensible Inhalte blockieren oder maskieren, um nachgelagerte Systeme zu schützen.",
  "I copied, continue": "Habe kopiert, fortfahren",
  "Label name": "Label-Name",
  "Log request body (prompts)": "Anfragetext protokollieren (Prompts)",
  "Log response body (LLM output)": "Antworttext protokollieren (LLM-Ausgabe)",
  "Monthly budget (USD)": "Monatliches Budget (USD)",
  "Monthly limit (USD)": "Monatliche Obergrenze (USD)",
  "None (no fallback)": "Keine (kein Fallback)",
  "Rate limit (RPM)": "Ratenlimit (RPM)",
  "Rate limit (requests per minute)": "Ratenlimit (Anfragen pro Minute)",
  "Reason (optional)": "Grund (optional)",
  "Remove key": "Schlüssel entfernen",
  "Retention period (days)": "Aufbewahrungsdauer (Tage)",
  "Security &amp; guardrails": "Sicherheit und Guardrails",
  "Your provider API keys are encrypted using AES-256-GCM before being stored. They are only decrypted when proxying a request and are never exposed in logs.":
    "Ihre Anbieter-API-Schlüssel werden vor der Speicherung mit AES-256-GCM verschlüsselt. Sie werden nur beim Weiterleiten einer Anfrage entschlüsselt und erscheinen nie in Protokollen.",
  "Playground settings": "Playground-Einstellungen",
  "Add an API key": "API-Schlüssel hinzufügen",
  "Add content filter rule": "Inhaltsfilterregel hinzufügen",
  "Add endpoint": "Endpunkt hinzufügen",
  "Add filter rule": "Filterregel hinzufügen",
  "Add from catalog": "Aus Katalog hinzufügen",
  "Add guardrail": "Guardrail hinzufügen",
  "Add key": "Schlüssel hinzufügen",
  "Add label": "Label hinzufügen",
  "Add message": "Nachricht hinzufügen",
  "Add PII detection rule": "Regel für Erkennung personenbezogener Daten hinzufügen",
  "Add PII rule": "Regel für personenbezogene Daten hinzufügen",
  "Add test case": "Testfall hinzufügen",
  "Back to prompts": "Zurück zu Prompts",
  "Compare": "Vergleichen",
  "Copy key": "Schlüssel kopieren",
  "Copy the key below. It will not be shown again.":
    "Kopieren Sie den Schlüssel unten. Er wird nicht erneut angezeigt.",
  "Create endpoint": "Endpunkt erstellen",
  "Create key": "Schlüssel erstellen",
  "Create prompt": "Prompt erstellen",
  "Create virtual key": "Virtuellen Schlüssel erstellen",
  "Delete endpoint": "Endpunkt löschen",
  "Delete prompt": "Prompt löschen",
  "Denied": "Abgelehnt",
  "Dismiss suggestion": "Vorschlag verwerfen",
  "Edit tool settings": "Tool-Einstellungen bearbeiten",
  "Filter by risk": "Nach Risiko filtern",
  "Filter by server": "Nach Server filtern",
  "Filter by tool": "Nach Tool filtern",
  "Go to Endpoints": "Zu Endpunkten",
  "Go to Settings": "Zu Einstellungen",
  "Make your first request": "Erste Anfrage senden",
  "Purge old logs": "Alte Protokolle löschen",
  "Read the guide": "Anleitung lesen",
  "Remove from comparison": "Aus Vergleich entfernen",
  "Remove guardrail rule": "Guardrail-Regel entfernen",
  "Revoke virtual key": "Virtuellen Schlüssel widerrufen",
  "Run all": "Alle ausführen",
  "Save dataset": "Datensatz speichern",
  "Save version": "Version speichern",
  "Send a message to test this prompt": "Nachricht senden, um diesen Prompt zu testen",
  "Test endpoint": "Endpunkt testen",
  "Test guardrails": "Guardrails testen",
  "Accept as risk": "Als Risiko akzeptieren",
  "Agent activity": "Agentenaktivität",
  "All agents": "Alle Agenten",
  "Applies to agents": "Gilt für Agenten",
  "No activity recorded for this agent yet":
    "Für diesen Agenten wurde noch keine Aktivität erfasst",
  "Failed to load agent activity": "Aktivität dieses Agenten konnte nicht geladen werden",
  "Selected agents": "Ausgewählte Agenten",
  "Select agents": "Agenten auswählen",
  "No agents": "Keine Agenten",
  "Select at least one agent, or apply the rule to all agents":
    "Wählen Sie mindestens einen Agenten aus oder wenden Sie die Regel auf alle Agenten an",
  "Last active {date}": "Zuletzt aktiv {date}",
  "Tool use ID": "Tool-Use-ID",
  "This agent": "Dieser Agent",
  "{name} · last {days} days": "{name} · letzte {days} Tage",
  "Rule: {name}": "Regel: {name}",
  "Alert threshold": "Alarmschwelle",
  "Allowed models": "Zugelassene Modelle",
  "Allowed providers": "Zugelassene Anbieter",
  "Any language or framework": "Beliebige Sprache oder Rahmenwerk",
  "Any endpoint or model": "Beliebiger Endpunkt oder beliebiges Modell",
  "Applies to tools": "Gilt für Tools",
  "Approval required": "Genehmigung erforderlich",
  "Audit log retention": "Aufbewahrung von Prüfprotokollen",
  "Audit trail": "Prüfpfad",
  "Average round-trip time for tool calls": "Durchschnittliche Antwortzeit für Tool-Aufrufe",
  "Average round-trip time from request to complete response":
    "Durchschnittliche Antwortzeit von der Anfrage bis zur vollständigen Antwort",
  "Average round-trip time per tool call, useful for spotting slow tools":
    "Durchschnittliche Antwortzeit pro Tool-Aufruf, nützlich um langsame Tools zu erkennen",
  "Bearer token": "Bearer-Token",
  "Bind prompts to endpoints": "Prompts an Endpunkte binden",
  "Blocked models": "Blockierte Modelle",
  "Blocked providers": "Blockierte Anbieter",
  "Browse pre-built guardrails and enable them with one click":
    "Vorgefertigte Guardrails durchsuchen und mit einem Klick aktivieren",
  "Budget controls": "Budgetkontrollen",
  "Combined prompt and completion tokens across all requests":
    "Kombinierte Prompt- und Completion-Tokens über alle Anfragen",
  "Configuration changes": "Konfigurationsänderungen",
  "Content filter on error": "Inhaltsfilter bei Fehler",
  "Content filter replacement": "Inhaltsfilter-Ersatz",
  "Cost by endpoint": "Kosten nach Endpunkt",
  "Cost by model": "Kosten nach Modell",
  "Cost by provider": "Kosten nach Anbieter",
  "Cost over time": "Kosten im Zeitverlauf",
  "Cost per request": "Kosten pro Anfrage",
  "Current spend": "Aktuelle Ausgaben",
  "Drop-in replacement for any OpenAI SDK": "Drop-in-Ersatz für jedes OpenAI-SDK",
  "Each endpoint references an API key": "Jeder Endpunkt verweist auf einen API-Schlüssel",
  "Enable caching globally": "Caching global aktivieren",
  "Enable response caching": "Antwort-Caching aktivieren",
  "Endpoint name": "Endpunktname",
  "Expected": "Erwartet",
  "Fallback chains": "Fallback-Ketten",
  "Fallback endpoint": "Fallback-Endpunkt",
  "Feature": "Funktion",
  "Full request and response audit": "Vollständige Anfrage- und Antwortprüfung",
  "Function calling": "Function Calling",
  "Guardrail catalog": "Guardrail-Katalog",
  "Guardrail detection logs": "Guardrail-Erkennungsprotokolle",
  "Guardrail detections": "Guardrail-Erkennungen",
  "Guardrails activity": "Guardrail-Aktivität",
  "Hard limit": "Hartes Limit",
  "In-process PII scanning": "In-Prozess-PII-Scan",
  "Includes:": "Enthält:",
  "Keys are encrypted at rest": "Schlüssel werden im Ruhezustand verschlüsselt",
  "Keyword and regex matching": "Schlüsselwort- und Regex-Abgleich",
  "Labels": "Labels",
  "LLM providers": "LLM-Anbieter",
  "Log details info": "Protokolldetailinfo",
  "Masked": "Maskiert",
  "Masked preview:": "Maskierte Vorschau:",
  "Match type": "Abgleichstyp",
  "Messages": "Nachrichten",
  "Model parameters": "Modellparameter",
  "Monthly limit": "Monatliches Limit",
  "Most frequently invoked tools in the selected period, ranked by total call count":
    "Am häufigsten aufgerufene Tools im ausgewählten Zeitraum, sortiert nach Gesamtaufrufen",
  "Multiple rule types": "Mehrere Regeltypen",
  "Number of completion and embedding requests processed":
    "Anzahl verarbeiteter Completion- und Embedding-Anfragen",
  "Number of distinct tools called": "Anzahl verschiedener aufgerufener Tools",
  "OpenAI-compatible format": "OpenAI-kompatibles Format",
  "Optional": "Optional",
  "Optional system prompt prepended to all requests":
    "Optionaler System-Prompt, der allen Anfragen vorangestellt wird",
  "Or search for any model...": "Oder nach einem beliebigen Modell suchen...",
  "Output appears here": "Ausgabe erscheint hier",
  "PDF input": "PDF-Eingabe",
  "Per-key budgets and rate limits": "Budgets und Ratenlimits pro Schlüssel",
  "Percentage of tool calls that failed": "Prozentsatz fehlgeschlagener Tool-Aufrufe",
  "PII replacement format": "Ersatzformat für personenbezogene Daten",
  "PII scan on error": "PII-Scan bei Fehler",
  "POPULAR MODELS": "BELIEBTE MODELLE",
  "Prompt caching": "Prompt-Caching",
  "Prompt label": "Prompt-Label",
  "Prompt not found.": "Prompt nicht gefunden.",
  "Prompt template": "Prompt-Vorlage",
  "Prompts are reusable message templates": "Prompts sind wiederverwendbare Nachrichtenvorlagen",
  "Recent requests": "Letzte Anfragen",
  "Recent tool calls": "Letzte Tool-Aufrufe",
  "1 call": "1 Aufruf",
  "{count} calls": "{count} Aufrufe",
  "{count} denied": "{count} abgelehnt",
  "Replacement text": "Ersatztext",
  "Request body logging": "Protokollierung des Anfragetextes",
  "Requires approval": "Erfordert Genehmigung",
  "Response": "Antwort",
  "Response caching": "Antwort-Caching",
  "REST API": "REST-API",
  "Risk detection settings": "Einstellungen zur Risikoerkennung",
  "Role-based access": "Rollenbasierter Zugriff",
  "Rule type": "Regeltyp",
  "Runs on every request, zero latency": "Läuft bei jeder Anfrage, null Latenz",
  "Scan tool inputs before execution": "Tool-Eingaben vor der Ausführung scannen",
  "Scope rules to specific tools": "Regeln auf bestimmte Tools beschränken",
  "Search endpoints, models, users...": "Endpunkte, Modelle, Benutzer suchen...",
  "Search guardrails...": "Guardrails suchen...",
  "Spend log cleanup": "Bereinigung von Ausgabenprotokollen",
  "Status: All": "Status: Alle",
  "Suggested:": "Vorgeschlagen:",
  "System prompt": "System-Prompt",
  "Temperature": "Temperatur",
  "Tokens": "Tokens",
  "Tokens per request": "Tokens pro Anfrage",
  "Total Calls": "Gesamtaufrufe",
  "Total requests": "Anfragen insgesamt",
  "Total spend across all endpoints for this period":
    "Gesamtausgaben über alle Endpunkte für diesen Zeitraum",
  "Total tool invocations in the selected period": "Gesamte Tool-Aufrufe im ausgewählten Zeitraum",
  "Traffic controls": "Verkehrskontrollen",
  "Unified proxy with governance controls": "Einheitlicher Proxy mit Governance-Kontrollen",
  "Unique Tools": "Eindeutige Tools",
  "Variables": "Variablen",
  "Variables:": "Variablen:",
  "VerifyWise AI gateway": "VerifyWise-KI-Gateway",
  "Version A": "Version A",
  "Version B": "Version B",
  "Virtual key created": "Virtueller Schlüssel erstellt",
  "What changed?": "Was hat sich geändert?",
  "Your app": "Ihre App",
  "No API keys configured. Add a provider API key to start creating endpoints.":
    "Keine API-Schlüssel konfiguriert. Fügen Sie einen Anbieter-API-Schlüssel hinzu, um Endpunkte zu erstellen.",
  "No audit logs yet": "Noch keine Prüfprotokolle",
  "No budget configured. All requests are allowed without cost limits.":
    "Kein Budget konfiguriert. Alle Anfragen werden ohne Kostenlimit zugelassen.",
  "No content filter rules configured. Add keyword or regex rules to block or mask prohibited content.":
    "Keine Inhaltsfilterregeln konfiguriert. Fügen Sie Schlüsselwort- oder Regex-Regeln hinzu, um verbotene Inhalte zu blockieren oder zu maskieren.",
  "No detections in this period": "Keine Erkennungen in diesem Zeitraum",
  "No differences found": "Keine Unterschiede gefunden",
  "No endpoint data": "Keine Endpunktdaten",
  "No endpoints configured yet. Add your first LLM endpoint to start routing requests through the gateway.":
    "Noch keine Endpunkte konfiguriert. Fügen Sie Ihren ersten LLM-Endpunkt hinzu, um Anfragen durch das Gateway zu leiten.",
  "No guardrail detections yet.": "Noch keine Guardrail-Erkennungen.",
  "No MCP tools discovered yet. Tools will appear here after servers are connected and their tools are fetched.":
    "Noch keine MCP-Tools erkannt. Tools erscheinen hier, nachdem Server verbunden und ihre Tools abgerufen wurden.",
  "No models match your filters.": "Keine Modelle entsprechen Ihren Filtern.",
  "No pending risk suggestions. Run detection or wait for the next scheduled check.":
    "Keine ausstehenden Risikovorschläge. Erkennung ausführen oder auf die nächste geplante Prüfung warten.",
  "No PII detection rules configured. Add rules to automatically detect and protect personal data in AI requests.":
    "Keine PII-Erkennungsregeln konfiguriert. Fügen Sie Regeln hinzu, um personenbezogene Daten in KI-Anfragen automatisch zu erkennen und zu schützen.",
  "No prompts yet. Create your first prompt template to centralize and version-control system instructions.":
    "Noch keine Prompts. Erstellen Sie Ihre erste Prompt-Vorlage, um Systemanweisungen zu zentralisieren und zu versionieren.",
  "No request logs yet. Send requests through the gateway to see detailed logs here.":
    "Noch keine Anfrageprotokolle. Senden Sie Anfragen durch das Gateway, um detaillierte Protokolle hier zu sehen.",
  "No results matching the current filters.": "Keine Ergebnisse passen zu den aktuellen Filtern.",
  "Add a provider API key for your gateway endpoints":
    "Anbieter-API-Schlüssel für Ihre Gateway-Endpunkte hinzufügen",
  "Block or mask content matching a keyword or regex pattern":
    "Inhalte blockieren oder maskieren, die einem Schlüsselwort oder Regex-Muster entsprechen",
  "Block or mask detected PII": "Erkannte personenbezogene Daten blockieren oder maskieren",
  "Compare message content and configuration between two versions.":
    "Nachrichteninhalt und Konfiguration zwischen zwei Versionen vergleichen.",
  "Configure a new LLM provider endpoint": "Einen neuen LLM-Anbieter-Endpunkt konfigurieren",
  "Scan agent tool calls, MCP and native tools like Bash, for PII, prohibited content or prompt injection, then block or mask what matches.":
    "Durchsuchen Sie Agent-Tool-Aufrufe, MCP- und native Tools wie Bash, nach PII, unzulässigen Inhalten oder Prompt-Injection und blockieren oder maskieren Sie dann die Treffer.",
  "Configure LLM provider endpoints for your organization.":
    "LLM-Anbieter-Endpunkte für Ihre Organisation konfigurieren.",
  "Configure monthly spending limits for the AI Gateway":
    "Monatliche Ausgabenlimits für das KI-Gateway konfigurieren",
  "Configure parameters for your requests": "Parameter für Ihre Anfragen konfigurieren",
  "Configure PII detection and content filtering rules for your AI Gateway.":
    "PII-Erkennung und Inhaltsfilterregeln für Ihr KI-Gateway konfigurieren.",
  "Configure which personal data types to detect":
    "Konfigurieren, welche Arten personenbezogener Daten erkannt werden sollen",
  "Create versioned prompt templates with variables and bind them to endpoints.":
    "Versionierte Prompt-Vorlagen mit Variablen erstellen und an Endpunkte binden.",
  "Require approval on sensitive tools so a person reviews them before the agent runs them.":
    "Verlangen Sie für sensible Tools eine Genehmigung, damit eine Person sie prüft, bevor der Agent sie ausführt.",
  "Fine-tune how the model generates responses.":
    "Feinjustieren, wie das Modell Antworten generiert.",
  "Generate an API key for developers to use the gateway":
    "API-Schlüssel für Entwickler generieren, um das Gateway zu nutzen",
  "Generate an API key for developers to use the gateway with the OpenAI SDK.":
    "API-Schlüssel für Entwickler generieren, um das Gateway mit dem OpenAI-SDK zu nutzen.",
  "Generate API keys for developers to use the gateway from their code.":
    "API-Schlüssel für Entwickler generieren, um das Gateway aus ihrem Code zu nutzen.",
  "How to generate audit logs": "Wie Prüfprotokolle erstellt werden",
  "Issue scoped API keys for AI agents to authenticate with MCP servers.":
    "Begrenzte API-Schlüssel für KI-Agenten ausstellen, um sich bei MCP-Servern zu authentifizieren.",
  "Manage API keys, budget, and guardrail settings for the AI Gateway.":
    "API-Schlüssel, Budget und Guardrail-Einstellungen für das KI-Gateway verwalten.",
  "Manage tool risk levels": "Risikostufen von Tools verwalten",
  "Monitor costs and enforce budgets": "Kosten überwachen und Budgets durchsetzen",
  "Optionally describe what changed in this version.":
    "Beschreiben Sie optional, was sich in dieser Version geändert hat.",
  "Paste sample text to preview what your active guardrail rules would detect":
    "Fügen Sie Beispieltext ein, um eine Vorschau zu sehen, was Ihre aktiven Guardrail-Regeln erkennen würden",
  "Every tool call your AI agents make, MCP tools and native tools like Bash, with outcome, latency and which agent.":
    "Jeder Tool-Aufruf Ihrer KI-Agenten, MCP-Tools und native Tools wie Bash, mit Ergebnis, Latenz und ausführendem Agenten.",
  "Run a test request through the gateway to complete setup":
    "Eine Testanfrage durch das Gateway senden, um die Einrichtung abzuschließen",
  "Select action": "Aktion auswählen",
  "Select an API key": "API-Schlüssel auswählen",
  "Select endpoint": "Endpunkt auswählen",
  "Select rule type": "Regeltyp auswählen",
  "Select scope": "Umfang auswählen",
  "Select version": "Version auswählen",
  "Select versions and send a message": "Versionen auswählen und eine Nachricht senden",
  "Set up a new prompt template.": "Neue Prompt-Vorlage einrichten.",
  "Test your configured endpoints with an interactive chat interface.":
    "Testen Sie Ihre konfigurierten Endpunkte mit einer interaktiven Chat-Oberfläche.",
  "This will create a new risk in Risk Management pre-filled with the suggestion data.":
    "Dies erstellt ein neues Risiko im Risikomanagement, vorab mit den Vorschlagsdaten ausgefüllt.",
  "Type a message to compare...": "Nachricht zum Vergleichen eingeben...",
  "Type a message...": "Nachricht eingeben...",
  "View and manage all discovered MCP tools across your servers.":
    "Alle auf Ihren Servern entdeckten MCP-Tools anzeigen und verwalten.",
  "View request, response, and guardrail detection logs for all AI Gateway traffic.":
    "Anfrage-, Antwort- und Guardrail-Erkennungsprotokolle für den gesamten KI-Gateway-Verkehr anzeigen.",
  "After adding a key, create endpoints in the Endpoints tab. Each endpoint uses one API key to authenticate with the LLM provider.":
    "Nach dem Hinzufügen eines Schlüssels erstellen Sie Endpunkte im Endpunkte-Tab. Jeder Endpunkt verwendet einen API-Schlüssel zur Authentifizierung beim LLM-Anbieter.",
  "Apply guardrails globally or restrict them to specific MCP tools. For example, block PII only when invoking database-query tools.":
    "Guardrails global anwenden oder auf bestimmte MCP-Tools beschränken. Beispiel: PII nur beim Aufruf von Datenbankabfrage-Tools blockieren.",
  "Choose from PII detection, content filtering, or prompt injection detection. Each rule can either block the request or mask matched content.":
    "Wählen Sie zwischen PII-Erkennung, Inhaltsfilterung oder Prompt-Injection-Erkennung. Jede Regel kann entweder die Anfrage blockieren oder erkannte Inhalte maskieren.",
  "Click a row to expand and see full request/response details":
    "Klicken Sie auf eine Zeile, um vollständige Anfrage-/Antwortdetails einzublenden",
  "Content filters execute in-process with no external API calls. Rules are evaluated before the request reaches the LLM provider.":
    "Inhaltsfilter laufen in-process ohne externe API-Aufrufe. Regeln werden ausgewertet, bevor die Anfrage den LLM-Anbieter erreicht.",
  "Error Rate": "Fehlerrate",
  "Error behavior": "Fehlerverhalten",
  "Every request through the gateway is logged with cost, tokens, and latency. Set a monthly budget to prevent unexpected cost overruns.":
    "Jede Anfrage durch das Gateway wird mit Kosten, Tokens und Latenz protokolliert. Legen Sie ein monatliches Budget fest, um unerwartete Kostenüberschreitungen zu vermeiden.",
  "Make tool calls through the MCP Gateway using an agent key at POST /v1/mcp with the tools/call method.":
    "Tool-Aufrufe über das MCP-Gateway mit einem Agentenschlüssel an POST /v1/mcp mit der Methode tools/call senden.",
  "Max entries per org": "Max. Einträge pro Organisation",
  "Max tokens": "Max. Tokens",
  "No guardrail rules configured yet. Add rules to scan agent tool calls for PII, prohibited content, or prompt injection attempts.":
    "Noch keine Guardrail-Regeln konfiguriert. Fügen Sie Regeln hinzu, um Agent-Tool-Aufrufe auf PII, verbotene Inhalte oder Prompt-Injection-Versuche zu prüfen.",
  "Requests/day": "Anfragen/Tag",
  "Top 10 tools by calls": "Top 10 Tools nach Aufrufen",
  "Top P": "Top P",
  "e.g. 4096": "z. B. 4096",
  "e.g. Added few-shot examples for edge cases":
    "z. B. Few-Shot-Beispiele für Randfälle hinzugefügt",
  "e.g. Customer support agent": "z. B. Kundensupport-Agent",
  "e.g. greet": "z. B. begrüßen",
  "e.g. production, staging, canary": "z. B. production, staging, canary",
  "e.g., 100.00": "z. B. 100.00",
  "e.g., 60": "z. B. 60",
  "e.g., Already addressed, Not applicable": "z. B. Bereits behandelt, Nicht zutreffend",
  "e.g., Backend production key": "z. B. Backend-Produktionsschlüssel",
  "e.g., Block PII in database queries": "z. B. PII in Datenbankabfragen blockieren",
  "e.g., Block competitor names": "z. B. Namen von Mitbewerbern blockieren",
  "e.g., Block credit cards": "z. B. Kreditkarten blockieren",
  "e.g., Production GPT-4o": "z. B. Produktions-GPT-4o",
  "e.g., Production OpenAI key": "z. B. Produktions-OpenAI-Schlüssel",
  "Last 24 hours": "Letzte 24 Stunden",
  "PII detection runs within your gateway infrastructure. No data is sent to external services for scanning. Supports email, phone, credit card, names, IBAN, Turkish TCKN, and more.":
    "Die PII-Erkennung läuft in Ihrer Gateway-Infrastruktur. Zum Scannen werden keine Daten an externe Dienste gesendet. Unterstützt E-Mail, Telefon, Kreditkarte, Namen, IBAN, türkische TCKN und mehr.",
  "Block requests containing personal data, or mask it with placeholders (e.g., <EMAIL_ADDRESS>) before sending to the LLM. Input is scanned before the model sees it.":
    "Anfragen mit personenbezogenen Daten blockieren oder mit Platzhaltern (z. B. <EMAIL_ADDRESS>) maskieren, bevor sie an das LLM gesendet werden. Die Eingabe wird gescannt, bevor das Modell sie sieht.",
  "Block specific words (exact match with word boundaries) or define custom regex patterns to catch formats like internal project codes, employee IDs, or confidential terms.":
    "Bestimmte Wörter blockieren (exakte Übereinstimmung mit Wortgrenzen) oder eigene Regex-Muster definieren, um Formate wie interne Projektcodes, Mitarbeiter-IDs oder vertrauliche Begriffe zu erfassen.",
  "Add rule": "Regel hinzufügen",
  "Remove rule": "Regel entfernen",
  "Block": "Blockieren",
  "Mask": "Maskieren",
  "Keyword": "Schlüsselwort",
  "Regex pattern": "Regex-Muster",
  "PII entities covered by this rule will no longer be detected or masked in LLM requests.":
    "Die von dieser Regel abgedeckten PII-Entitäten werden in LLM-Anfragen nicht mehr erkannt oder maskiert.",
  "Content matching this filter pattern will no longer be blocked or masked.":
    "Inhalte, die diesem Filtermuster entsprechen, werden nicht mehr blockiert oder maskiert.",
  "You can re-enable this guardrail at any time from the catalog or by creating a new rule.":
    "Sie können dieses Guardrail jederzeit aus dem Katalog oder durch Erstellen einer neuen Regel wieder aktivieren.",
  "Content safety": "Inhaltssicherheit",
  "Prompt security": "Prompt-Sicherheit",
  "Data leakage prevention": "Verhinderung von Datenabfluss",
  "No guardrails match your search.": "Keine Guardrails entsprechen Ihrer Suche.",
  "Email addresses": "E-Mail-Adressen",
  "Phone numbers": "Telefonnummern",
  "Credit card numbers": "Kreditkartennummern",
  "US Social Security numbers": "US-Sozialversicherungsnummern",
  "Person names": "Personennamen",
  "IBAN codes": "IBAN-Codes",
  "IP addresses": "IP-Adressen",
  "Physical locations": "Physische Standorte",
  "Dates and times": "Datums- und Zeitangaben",
  "Medical license numbers": "Nummern medizinischer Zulassungen",
  "Nationality, religion, politics": "Nationalität, Religion, Politik",
  "EU phone numbers": "EU-Telefonnummern",
  "Turkish identity numbers": "Türkische Identitätsnummern",
  "Profanity filter": "Schimpfwortfilter",
  "Hate speech and slurs": "Hassrede und Beschimpfungen",
  "Violence instructions": "Anleitungen zu Gewalt",
  "Self-harm content": "Inhalte zu Selbstverletzung",
  "Prompt injection (basic)": "Prompt-Injection (grundlegend)",
  "Jailbreak attempts": "Jailbreak-Versuche",
  "System prompt extraction": "Extraktion des System-Prompts",
  "Instruction override": "Anweisungsüberschreibung",
  "API keys and tokens": "API-Schlüssel und Tokens",
  "AWS credentials": "AWS-Anmeldedaten",
  "Private keys": "Private Schlüssel",
  "Database connection strings": "Datenbank-Verbindungszeichenfolgen",
  "Internal URLs": "Interne URLs",
  "Environment variables": "Umgebungsvariablen",
  "GDPR personal data (all)": "DSGVO-personenbezogene Daten (alle)",
  "HIPAA protected health info": "HIPAA-geschützte Gesundheitsdaten",
  "PCI DSS cardholder data": "PCI-DSS-Karteninhaberdaten",
  "SOC 2 sensitive data": "SOC-2-sensible Daten",
  "Detect and protect email addresses in prompts.":
    "E-Mail-Adressen in Prompts erkennen und schützen.",
  "Detect phone numbers including international formats.":
    "Telefonnummern einschließlich internationaler Formate erkennen.",
  "Detect Visa, Mastercard, Amex, and other card formats.":
    "Visa-, Mastercard-, Amex- und andere Kartenformate erkennen.",
  "Detect US SSN formats (XXX-XX-XXXX).": "US-SSN-Formate (XXX-XX-XXXX) erkennen.",
  "Detect personal names in text.": "Personennamen im Text erkennen.",
  "Detect International Bank Account Numbers.": "Internationale Bankkontonummern erkennen.",
  "Detect IPv4 and IPv6 addresses.": "IPv4- und IPv6-Adressen erkennen.",
  "Detect addresses, cities, and location references.":
    "Adressen, Städte und Ortsangaben erkennen.",
  "Detect date of birth and other date/time references.":
    "Geburtsdatum und andere Datum-/Zeitangaben erkennen.",
  "Detect medical license and DEA numbers.": "Medizinische Zulassungs- und DEA-Nummern erkennen.",
  "Detect references to nationality, religious, or political affiliation.":
    "Verweise auf Nationalität, Religionszugehörigkeit oder politische Zugehörigkeit erkennen.",
  "Detect European phone number formats.": "Europäische Telefonnummernformate erkennen.",
  "Detect Turkish national identity (TCKN) numbers.":
    "Türkische nationale Identitätsnummern (TCKN) erkennen.",
  "Block common profane and offensive words across 10+ terms.":
    "Gängige Schimpf- und Beleidigungswörter aus über 10 Begriffen blockieren.",
  "Block racial, ethnic, and identity-based slurs.":
    "Rassistische, ethnische und identitätsbezogene Beschimpfungen blockieren.",
  "Block requests for instructions on causing physical harm.":
    "Anfragen nach Anleitungen zur körperlichen Schädigung blockieren.",
  "Block content related to self-harm or suicide instructions.":
    "Inhalte im Zusammenhang mit Selbstverletzung oder Suizidanleitungen blockieren.",
  "Detect common prompt injection patterns that attempt to override system instructions.":
    "Gängige Prompt-Injection-Muster erkennen, die Systemanweisungen überschreiben wollen.",
  "Detect DAN-style jailbreak patterns and role override attempts.":
    "Jailbreak-Muster im DAN-Stil und Versuche der Rollenüberschreibung erkennen.",
  "Block attempts to extract the system prompt or internal instructions.":
    "Versuche blockieren, den System-Prompt oder interne Anweisungen zu extrahieren.",
  "Block attempts to override safety guidelines or role-play as unrestricted.":
    "Versuche blockieren, Sicherheitsrichtlinien zu überschreiben oder uneingeschränkte Rollen zu spielen.",
  "Detect API keys, bearer tokens, and secret keys in prompts.":
    "API-Schlüssel, Bearer-Tokens und geheime Schlüssel in Prompts erkennen.",
  "Detect AWS access keys and secret keys.":
    "AWS-Zugriffsschlüssel und geheime Schlüssel erkennen.",
  "Detect SSH, RSA, and other private key blocks.":
    "SSH-, RSA- und andere private Schlüsselblöcke erkennen.",
  "Detect database URLs and connection strings.":
    "Datenbank-URLs und Verbindungszeichenfolgen erkennen.",
  "Detect references to internal/private network URLs.":
    "Verweise auf interne/private Netzwerk-URLs erkennen.",
  "Detect environment variable assignments with secrets.":
    "Zuweisungen von Umgebungsvariablen mit Geheimnissen erkennen.",
  "Detect all GDPR-relevant personal data: email, phone, name, location, DOB, IP, nationality.":
    "Alle DSGVO-relevanten personenbezogenen Daten erkennen: E-Mail, Telefon, Name, Ort, Geburtsdatum, IP, Nationalität.",
  "Detect PHI identifiers: names, dates, SSNs, medical licenses, phone, email.":
    "PHI-Kennungen erkennen: Namen, Datumsangaben, SSNs, medizinische Zulassungen, Telefon, E-Mail.",
  "Block credit card numbers and IBANs per PCI DSS requirements.":
    "Kreditkartennummern und IBANs gemäß PCI-DSS-Anforderungen blockieren.",
  "Block API keys, private keys, connection strings, and credentials.":
    "API-Schlüssel, private Schlüssel, Verbindungszeichenfolgen und Anmeldedaten blockieren.",
  "Phone number": "Telefonnummer",
  "Credit card": "Kreditkarte",
  "Person name": "Personenname",
  "IBAN": "IBAN",
  "Turkish TCKN": "Türkische TCKN",
  "EU phone number": "EU-Telefonnummer",
  "US SSN": "US-SSN",
  "IP address": "IP-Adresse",
  "Date/time": "Datum/Uhrzeit",
  "Nationality/religion/politics": "Nationalität/Religion/Politik",
  "Medical license": "Medizinische Zulassung",
  "Select up to 5 models to compare side by side.":
    "Wählen Sie bis zu 5 Modelle für den Vergleich nebeneinander aus.",
  "Search and select models above to compare features side by side.":
    "Suchen und wählen Sie oben Modelle aus, um ihre Funktionen nebeneinander zu vergleichen.",
  "Visualize your LLM traffic": "Visualisieren Sie Ihren LLM-Verkehr",
  "Make your first request to see a real-time map of your model connections":
    "Senden Sie Ihre erste Anfrage, um eine Echtzeit-Karte Ihrer Modellverbindungen zu sehen",
  "Add a provider API key": "Anbieter-API-Schlüssel hinzufügen",
  "Create an endpoint": "Endpunkt erstellen",
  "Create a virtual key": "Virtuellen Schlüssel erstellen",
  "No API keys configured": "Keine API-Schlüssel konfiguriert",
  "Go to the Settings tab in the sidebar and add your provider API key (OpenAI, Anthropic, etc.). Once added, come back here to create your first endpoint.":
    "Wechseln Sie zum Einstellungen-Tab in der Seitenleiste und fügen Sie Ihren Anbieter-API-Schlüssel (OpenAI, Anthropic usw.) hinzu. Sobald er hinzugefügt ist, kehren Sie hierher zurück, um Ihren ersten Endpunkt zu erstellen.",
  "Agent key": "Agent-Schlüssel",
  "All tools": "Alle Tools",
  "Arguments": "Argumente",
  "Delete guardrail": "Guardrail löschen",
  "Edit guardrail": "Guardrail bearbeiten",
  "Edit tool": "Tool bearbeiten",
  "MCP servers": "MCP-Server",
  "MCP tools": "MCP-Tools",
  "Require approval": "Genehmigung erforderlich",
  "No result captured (older adapter, or the tool did not report back).":
    "Kein Ergebnis erfasst (älterer Adapter oder das Tool hat nicht zurückgemeldet).",
  "By endpoint": "Nach Endpunkt",
  "CORS is disabled on gateway routes. Use virtual keys from backend services only.":
    "CORS ist auf Gateway-Routen deaktiviert. Verwenden Sie virtuelle Schlüssel ausschließlich aus Backend-Diensten.",
  "Comma-separated tool names. Leave empty to apply to all MCP tools.":
    "Komma-getrennte Tool-Namen. Leer lassen, um auf alle MCP-Tools anzuwenden.",
  "Create at least one endpoint before generating virtual keys.":
    "Erstellen Sie mindestens einen Endpunkt, bevor Sie virtuelle Schlüssel generieren.",
  "Endpoint slug:": "Endpunkt-Slug:",
  "Every guardrail detection across all endpoints, newest first. A request with several matches has one row for each.":
    "Jede Guardrail-Erkennung über alle Endpunkte hinweg, neueste zuerst. Eine Anfrage mit mehreren Treffern hat für jeden Treffer eine Zeile.",
  "Live updates": "Live-Aktualisierungen",
  "Lower values are more focused, higher values are more creative":
    "Niedrigere Werte sind fokussierter, höhere Werte sind kreativer",
  "No API keys available. Complete step 1 first.":
    "Keine API-Schlüssel verfügbar. Schritt 1 zuerst abschließen.",
  "No API keys available. Go to Settings to add one first.":
    "Keine API-Schlüssel verfügbar. Gehen Sie zu den Einstellungen, um zuerst einen hinzuzufügen.",
  "No endpoints configured": "Keine Endpunkte konfiguriert",
  "No tools match the selected filters.": "Keine Tools entsprechen den ausgewählten Filtern.",
  "No versions yet": "Noch keine Versionen",
  "Optional JSON configuration for advanced rule settings.":
    "Optionale JSON-Konfiguration für erweiterte Regeleinstellungen.",
  "Prompt:": "Prompt:",
  "Reject requests when budget is exceeded": "Anfragen ablehnen, wenn das Budget überschritten ist",
  "Request": "Anfrage",
  "Setup required": "Einrichtung erforderlich",
  "Slug:": "Slug:",
  "This key will not be shown again. Store it securely.":
    "Dieser Schlüssel wird nicht erneut angezeigt. Bewahren Sie ihn sicher auf.",
  "This key won't be shown again. Store it securely.":
    "Dieser Schlüssel wird nicht erneut angezeigt. Bewahren Sie ihn sicher auf.",
  "Top detections": "Top-Erkennungen",
  "View all guardrail logs": "Alle Guardrail-Protokolle anzeigen",
  "When enabled, tool invocations must be approved before execution.":
    "Wenn aktiviert, müssen Tool-Aufrufe vor der Ausführung genehmigt werden.",
  "You can re-create this guardrail at any time.":
    "Sie können diesen Guardrail jederzeit neu erstellen.",
  "All modes": "Alle Modi",
  "All providers": "Alle Anbieter",
  "All risk levels": "Alle Risikoniveaus",
  "All servers": "Alle Server",
  "Allow request (fail-open)": "Anfrage erlauben (Fail-Open)",
  "Audio transcription": "Audio-Transkription",
  "Block request (fail-closed)": "Anfrage blockieren (Fail-Closed)",
  "Chat": "Chat",
  "Embedding": "Embedding",
  "Flags active endpoints with zero requests, which increase the attack surface unnecessarily.":
    "Markiert aktive Endpunkte mit null Anfragen, die die Angriffsfläche unnötig vergrößern.",
  "Flags when monthly AI Gateway spend approaches the configured budget limit.":
    "Markiert, wenn die monatlichen AI-Gateway-Ausgaben dem konfigurierten Budgetlimit nahe kommen.",
  "Flags when most of the spend is concentrated on a single LLM provider, increasing vendor risk.":
    "Markiert, wenn der Großteil der Ausgaben auf einen einzigen LLM-Anbieter konzentriert ist, was das Anbieterrisiko erhöht.",
  "Flags when the 24-hour error rate exceeds a multiple of the 7-day average, indicating provider issues.":
    "Markiert, wenn die 24-Stunden-Fehlerrate ein Vielfaches des 7-Tage-Durchschnitts überschreitet, was auf Anbieterprobleme hindeutet.",
  "Flags when users send personal data (names, emails, SSNs) to LLM providers above a threshold.":
    "Markiert, wenn Benutzer persönliche Daten (Namen, E-Mails, SSNs) an LLM-Anbieter über einem Schwellenwert senden.",
  "Google Gemini": "Google Gemini",
  "Guardrail logs": "Guardrail-Protokolle",
  "Image generation": "Bilderzeugung",
  "Last 14 days": "Letzte 14 Tage",
  "Max input tokens": "Maximale Eingabetoken",
  "Max output tokens": "Maximale Ausgabetoken",
  "No response body": "Kein Antwortkörper",
  "Parallel tools": "Parallele Tools",
  "Rate limited": "Ratenbegrenzt",
  "Request logs": "Anforderungsprotokolle",
  "Response schema": "Antwortschema",
  "Run": "Lauf",
  "Showing the most recent 50 runs.": "Die neuesten 50 Läufe werden angezeigt.",
  "Reconstruct a full agent turn: the model calls (the conversation) and tool calls (the actions) correlated into one run.":
    "Setzen Sie eine vollständige Agentenrunde zusammen: die Modellaufrufe (das Gespräch) und die Tool-Aufrufe (die Aktionen) zu einem Lauf verknüpft.",
  "Runs appear when an agent sends the same run id (header":
    "Läufe erscheinen, wenn ein Agent dieselbe Lauf-ID sendet (Header",
  "Select an endpoint first.": "Wählen Sie zuerst einen Endpunkt aus.",
  "Source: All": "Quelle: Alle",
  "Source: Playground": "Quelle: Playground",
  "Source: Virtual key": "Quelle: Virtueller Schlüssel",
  "Started": "Gestartet",
  "Status: Error": "Status: Fehler",
  "Status: Success": "Status: Erfolg",
  "System messages": "Systemmeldungen",
  "Tool calls": "Tool-Aufrufe",
  "Tool input": "Tool-Eingabe",
  "By {name} · {date}": "Von {name} · {date}",
  "Click Save draft to create your first version.":
    "Klicken Sie auf Entwurf speichern, um Ihre erste Version zu erstellen.",
  "Could not load this run.": "Dieser Lauf konnte nicht geladen werden.",
  "Create your first version": "Erstellen Sie Ihre erste Version",
  "Failed to load invocation details.": "Aufrufdetails konnten nicht geladen werden.",
  "Refresh": "Aktualisieren",
  "Select a log to view details.": "Wählen Sie ein Protokoll aus, um Details anzuzeigen.",
  "{name} (inactive)": "{name} (inaktiv)",
  "#{id} (not found)": "#{id} (nicht gefunden)",
  "No endpoints": "Keine Endpunkte",
  "Sample text must be at most {max} characters":
    "Der Beispieltext darf höchstens {max} Zeichen lang sein",
  "{count} logs deleted": "{count} Protokolle gelöscht",
  "Permanently delete guardrail logs older than {days} days?":
    "Guardrail-Protokolle, die älter als {days} Tage sind, endgültig löschen?",
  "How long to keep guardrail detection logs and spend logs. Guardrail logs record every blocked or masked request for compliance auditing (EU AI Act Art. 12).":
    "Wie lange Guardrail-Erkennungsprotokolle und Ausgabenprotokolle aufbewahrt werden. Guardrail-Protokolle erfassen jede blockierte oder maskierte Anfrage für die Compliance-Prüfung (EU-KI-Verordnung, Art. 12).",
  "When on, logs older than their retention period are deleted every day. When off, logs are kept until you purge them.":
    "Wenn aktiviert, werden Protokolle, die älter als ihre Aufbewahrungsfrist sind, täglich gelöscht. Wenn deaktiviert, werden Protokolle aufbewahrt, bis Sie sie löschen.",
  "Spend log retention (days)": "Aufbewahrung der Ausgabenprotokolle (Tage)",
  "Purge logs": "Protokolle löschen",
  "This cannot be undone. The saved retention period is used, so save any change to it first.":
    "Dies kann nicht rückgängig gemacht werden. Es gilt die gespeicherte Aufbewahrungsfrist, speichern Sie daher zuerst jede Änderung daran.",
  "Delete old spend log entries based on the spend log retention period above.":
    "Alte Ausgabenprotokolleinträge anhand der oben festgelegten Aufbewahrungsfrist für Ausgabenprotokolle löschen.",
  "Retention periods must be whole numbers from {min} to {max} days":
    "Aufbewahrungsfristen müssen ganze Zahlen von {min} bis {max} Tagen sein",
  "Confirm automatic deletion": "Automatisches Löschen bestätigen",
  "Failed to purge logs": "Protokolle konnten nicht gelöscht werden",
  "Delete automatically": "Automatisch löschen",
  "This setting applies to both AI Gateway log types.":
    "Diese Einstellung gilt für beide Protokolltypen des AI Gateway.",
  "Delete records": "Datensätze löschen",
  "Failed to save settings": "Einstellungen konnten nicht gespeichert werden",
};

export const fr: Record<string, string> = {
  "Use monitor only mode?": "Utiliser le mode surveillance uniquement ?",
  "Use monitor only": "Utiliser la surveillance uniquement",
  "Calls made with this key will no longer be blocked or paused for approval.":
    "Les appels effectués avec cette clé ne seront plus bloqués ni suspendus pour approbation.",
  'Guardrails and approval rules are still checked, and so are the key\'s tool lists for calls through the MCP proxy, and for native tool calls when the key\'s "Also apply tool lists to native tool calls" setting is on. Every match is logged in Activity as "Would block" or "Would need approval". No approval requests are created. Rate limits still apply.':
    "Les garde-fous et les règles d'approbation sont toujours vérifiés, ainsi que les listes d'outils de la clé pour les appels passant par le proxy MCP, et pour les appels d'outils natifs lorsque le paramètre « Appliquer aussi les listes d'outils aux appels d'outils natifs » de la clé est activé. Chaque correspondance est journalisée dans Activité comme « Bloquerait » ou « Nécessiterait une approbation ». Aucune demande d'approbation n'est créée. Les limites de débit s'appliquent toujours.",
  "Would block": "Bloquerait",
  "Would need approval": "Nécessiterait une approbation",
  "{count} would block": "{count} bloqueraient",
  "{count} would need approval": "{count} nécessiteraient une approbation",
  "Also apply tool lists to native tool calls (hooks and SDK)":
    "Appliquer aussi les listes d'outils aux appels d'outils natifs (hooks et SDK)",
  "Off: the allowed and blocked tool lists apply only to MCP server tools called through the proxy. On: they also apply to the agent's own tool calls checked by the hook script or the Python SDK, such as Bash, Edit or your Python functions. Leave it off for keys used by Claude Code or Cursor unless the lists name those tools.":
    "Désactivé : les listes d'outils autorisés et bloqués ne s'appliquent qu'aux outils de serveur MCP appelés via le proxy. Activé : elles s'appliquent aussi aux appels d'outils propres de l'agent vérifiés par le script de hook ou le SDK Python, comme Bash, Edit ou vos fonctions Python. Laissez-le désactivé pour les clés utilisées par Claude Code ou Cursor, sauf si les listes nomment ces outils.",
  "The server offered no tools": "Le serveur n'a proposé aucun outil",
  "One tool found": "Un outil trouvé",
  "{count} tools found": "{count} outils trouvés",
  "{count} new": "{count} nouveau(x)",
  "{count} removed": "{count} supprimé(s)",
  "{count} changed": "{count} modifié(s)",
  "Back to MCP servers": "Retour aux serveurs MCP",
  "Model calls": "Appels de modèle",
  "Filter": "Filtrer",
  "No agent runs yet": "Aucune exécution d'agent pour le moment",
  "Recent activity": "Activité récente",
  "Avg Latency": "Latence moyenne",
  "Avg input tokens": "Tokens d'entrée moyens",
  "Avg latency, top 10 tools": "Latence moyenne, top 10 outils",
  "Avg output tokens": "Tokens de sortie moyens",
  "Cache TTL (seconds)": "TTL du cache (secondes)",
  "Config (JSON)": "Configuration (JSON)",
  "Create risk": "Créer un risque",
  "Default TTL (seconds)": "TTL par défaut (secondes)",
  "Each discovered tool can be assigned a risk level (low, medium, high). High-risk tools can require approval before execution.":
    "Chaque outil découvert peut se voir attribuer un niveau de risque (faible, moyen, élevé). Les outils à haut risque peuvent exiger une approbation avant exécution.",
  "Guardrail rules are evaluated against tool input data before the MCP tool is executed. Block or mask sensitive content to protect your downstream systems.":
    "Les règles de garde-fou sont évaluées sur les données d'entrée de l'outil avant l'exécution de l'outil MCP. Bloquez ou masquez le contenu sensible pour protéger vos systèmes en aval.",
  "I copied, continue": "C'est copié, continuer",
  "Label name": "Nom du libellé",
  "Log request body (prompts)": "Journaliser le corps de la requête (prompts)",
  "Log response body (LLM output)": "Journaliser le corps de la réponse (sortie LLM)",
  "Monthly budget (USD)": "Budget mensuel (USD)",
  "Monthly limit (USD)": "Limite mensuelle (USD)",
  "None (no fallback)": "Aucun (pas de repli)",
  "Rate limit (RPM)": "Limite de débit (RPM)",
  "Rate limit (requests per minute)": "Limite de débit (requêtes par minute)",
  "Reason (optional)": "Motif (optionnel)",
  "Remove key": "Retirer la clé",
  "Retention period (days)": "Durée de rétention (jours)",
  "Security &amp; guardrails": "Sécurité et garde-fous",
  "Your provider API keys are encrypted using AES-256-GCM before being stored. They are only decrypted when proxying a request and are never exposed in logs.":
    "Vos clés API de fournisseurs sont chiffrées avec AES-256-GCM avant stockage. Elles ne sont déchiffrées que pour relayer une requête et ne sont jamais exposées dans les journaux.",
  "Playground settings": "Paramètres du playground",
  "Add an API key": "Ajouter une clé API",
  "Add content filter rule": "Ajouter une règle de filtre de contenu",
  "Add endpoint": "Ajouter un point de terminaison",
  "Add filter rule": "Ajouter une règle de filtrage",
  "Add from catalog": "Ajouter depuis le catalogue",
  "Add guardrail": "Ajouter un garde-fou",
  "Add key": "Ajouter une clé",
  "Add label": "Ajouter un libellé",
  "Add message": "Ajouter un message",
  "Add PII detection rule": "Ajouter une règle de détection de données personnelles",
  "Add PII rule": "Ajouter une règle de données personnelles",
  "Add test case": "Ajouter un cas de test",
  "Back to prompts": "Retour aux prompts",
  "Compare": "Comparer",
  "Copy key": "Copier la clé",
  "Copy the key below. It will not be shown again.":
    "Copiez la clé ci-dessous. Elle ne sera plus affichée.",
  "Create endpoint": "Créer un point de terminaison",
  "Create key": "Créer une clé",
  "Create prompt": "Créer un prompt",
  "Create virtual key": "Créer une clé virtuelle",
  "Delete endpoint": "Supprimer le point de terminaison",
  "Delete prompt": "Supprimer le prompt",
  "Denied": "Refusé",
  "Dismiss suggestion": "Ignorer la suggestion",
  "Edit tool settings": "Modifier les paramètres de l'outil",
  "Filter by risk": "Filtrer par risque",
  "Filter by server": "Filtrer par serveur",
  "Filter by tool": "Filtrer par outil",
  "Go to Endpoints": "Aller aux points de terminaison",
  "Go to Settings": "Aller aux paramètres",
  "Make your first request": "Envoyez votre première requête",
  "Purge old logs": "Purger les anciens journaux",
  "Read the guide": "Lire le guide",
  "Remove from comparison": "Retirer de la comparaison",
  "Remove guardrail rule": "Retirer la règle de garde-fou",
  "Revoke virtual key": "Révoquer la clé virtuelle",
  "Run all": "Tout exécuter",
  "Save dataset": "Enregistrer le jeu de données",
  "Save version": "Enregistrer la version",
  "Send a message to test this prompt": "Envoyer un message pour tester ce prompt",
  "Test endpoint": "Tester le point de terminaison",
  "Test guardrails": "Tester les garde-fous",
  "Accept as risk": "Accepter comme risque",
  "Agent activity": "Activité de l'agent",
  "All agents": "Tous les agents",
  "Applies to agents": "S'applique aux agents",
  "No activity recorded for this agent yet":
    "Aucune activité enregistrée pour cet agent pour le moment",
  "Failed to load agent activity": "Échec du chargement de l'activité de cet agent",
  "Selected agents": "Agents sélectionnés",
  "Select agents": "Sélectionner des agents",
  "No agents": "Aucun agent",
  "Select at least one agent, or apply the rule to all agents":
    "Sélectionnez au moins un agent, ou appliquez la règle à tous les agents",
  "Last active {date}": "Dernière activité {date}",
  "Tool use ID": "ID d'utilisation de l'outil",
  "This agent": "Cet agent",
  "{name} · last {days} days": "{name} · {days} derniers jours",
  "Rule: {name}": "Règle : {name}",
  "Alert threshold": "Seuil d'alerte",
  "Allowed models": "Modèles autorisés",
  "Allowed providers": "Fournisseurs autorisés",
  "Any language or framework": "Toute langue ou référentiel",
  "Any endpoint or model": "N'importe quel point de terminaison ou modèle",
  "Applies to tools": "S'applique aux outils",
  "Approval required": "Approbation requise",
  "Audit log retention": "Rétention du journal d'audit",
  "Audit trail": "Piste d'audit",
  "Average round-trip time for tool calls": "Temps aller-retour moyen pour les appels d'outils",
  "Average round-trip time from request to complete response":
    "Temps aller-retour moyen de la requête à la réponse complète",
  "Average round-trip time per tool call, useful for spotting slow tools":
    "Temps aller-retour moyen par appel d'outil, utile pour repérer les outils lents",
  "Bearer token": "Jeton bearer",
  "Bind prompts to endpoints": "Lier les prompts aux points de terminaison",
  "Blocked models": "Modèles bloqués",
  "Blocked providers": "Fournisseurs bloqués",
  "Browse pre-built guardrails and enable them with one click":
    "Parcourir les garde-fous prêts à l'emploi et les activer en un clic",
  "Budget controls": "Contrôles budgétaires",
  "Combined prompt and completion tokens across all requests":
    "Tokens combinés de prompt et complétion sur toutes les requêtes",
  "Configuration changes": "Modifications de configuration",
  "Content filter on error": "Filtre de contenu en cas d'erreur",
  "Content filter replacement": "Remplacement du filtre de contenu",
  "Cost by endpoint": "Coût par point de terminaison",
  "Cost by model": "Coût par modèle",
  "Cost by provider": "Coût par fournisseur",
  "Cost over time": "Coût dans le temps",
  "Cost per request": "Coût par requête",
  "Current spend": "Dépense actuelle",
  "Drop-in replacement for any OpenAI SDK": "Remplacement direct pour tout SDK OpenAI",
  "Each endpoint references an API key": "Chaque point de terminaison référence une clé API",
  "Enable caching globally": "Activer le cache globalement",
  "Enable response caching": "Activer le cache des réponses",
  "Endpoint name": "Nom du point de terminaison",
  "Expected": "Attendu",
  "Fallback chains": "Chaînes de repli",
  "Fallback endpoint": "Point de terminaison de repli",
  "Feature": "Fonctionnalité",
  "Full request and response audit": "Audit complet de la requête et de la réponse",
  "Function calling": "Appel de fonction",
  "Guardrail catalog": "Catalogue de garde-fous",
  "Guardrail detection logs": "Journaux de détection des garde-fous",
  "Guardrail detections": "Détections des garde-fous",
  "Guardrails activity": "Activité des garde-fous",
  "Hard limit": "Limite stricte",
  "In-process PII scanning": "Analyse des données personnelles in-process",
  "Includes:": "Inclut :",
  "Keys are encrypted at rest": "Les clés sont chiffrées au repos",
  "Keyword and regex matching": "Correspondance par mots-clés et regex",
  "Labels": "Libellés",
  "LLM providers": "Fournisseurs LLM",
  "Log details info": "Info détails du journal",
  "Masked": "Masqué",
  "Masked preview:": "Aperçu masqué :",
  "Match type": "Type de correspondance",
  "Messages": "Messages",
  "Model parameters": "Paramètres du modèle",
  "Monthly limit": "Limite mensuelle",
  "Most frequently invoked tools in the selected period, ranked by total call count":
    "Outils les plus souvent invoqués sur la période sélectionnée, classés par nombre total d'appels",
  "Multiple rule types": "Plusieurs types de règles",
  "Number of completion and embedding requests processed":
    "Nombre de requêtes de complétion et d'embedding traitées",
  "Number of distinct tools called": "Nombre d'outils distincts appelés",
  "OpenAI-compatible format": "Format compatible OpenAI",
  "Optional": "Optionnel",
  "Optional system prompt prepended to all requests":
    "Prompt système optionnel ajouté au début de chaque requête",
  "Or search for any model...": "Ou rechercher un modèle...",
  "Output appears here": "La sortie apparaît ici",
  "PDF input": "Entrée PDF",
  "Per-key budgets and rate limits": "Budgets et limites de débit par clé",
  "Percentage of tool calls that failed": "Pourcentage d'appels d'outils ayant échoué",
  "PII replacement format": "Format de remplacement des données personnelles",
  "PII scan on error": "Analyse des données personnelles en cas d'erreur",
  "POPULAR MODELS": "MODÈLES POPULAIRES",
  "Prompt caching": "Cache de prompts",
  "Prompt label": "Libellé du prompt",
  "Prompt not found.": "Prompt introuvable.",
  "Prompt template": "Modèle de prompt",
  "Prompts are reusable message templates": "Les prompts sont des modèles de message réutilisables",
  "Recent requests": "Requêtes récentes",
  "Recent tool calls": "Appels d'outils récents",
  "1 call": "1 appel",
  "{count} calls": "{count} appels",
  "{count} denied": "{count} refusés",
  "Replacement text": "Texte de remplacement",
  "Request body logging": "Journalisation du corps de requête",
  "Requires approval": "Requiert une approbation",
  "Response": "Réponse",
  "Response caching": "Cache des réponses",
  "REST API": "API REST",
  "Risk detection settings": "Paramètres de détection des risques",
  "Role-based access": "Accès basé sur les rôles",
  "Rule type": "Type de règle",
  "Runs on every request, zero latency": "S'exécute à chaque requête, latence nulle",
  "Scan tool inputs before execution": "Analyser les entrées d'outils avant exécution",
  "Scope rules to specific tools": "Limiter les règles à des outils spécifiques",
  "Search endpoints, models, users...":
    "Rechercher points de terminaison, modèles, utilisateurs...",
  "Search guardrails...": "Rechercher des garde-fous...",
  "Spend log cleanup": "Nettoyage des journaux de dépenses",
  "Status: All": "Statut : Tous",
  "Suggested:": "Suggéré :",
  "System prompt": "Prompt système",
  "Temperature": "Température",
  "Tokens": "Tokens",
  "Tokens per request": "Tokens par requête",
  "Total Calls": "Appels totaux",
  "Total requests": "Requêtes au total",
  "Total spend across all endpoints for this period":
    "Dépense totale sur l'ensemble des points de terminaison pour cette période",
  "Total tool invocations in the selected period":
    "Invocations totales d'outils sur la période sélectionnée",
  "Traffic controls": "Contrôles de trafic",
  "Unified proxy with governance controls": "Proxy unifié avec contrôles de gouvernance",
  "Unique Tools": "Outils uniques",
  "Variables": "Variables",
  "Variables:": "Variables :",
  "VerifyWise AI gateway": "Passerelle IA VerifyWise",
  "Version A": "Version A",
  "Version B": "Version B",
  "Virtual key created": "Clé virtuelle créée",
  "What changed?": "Qu'est-ce qui a changé ?",
  "Your app": "Votre application",
  "No API keys configured. Add a provider API key to start creating endpoints.":
    "Aucune clé API configurée. Ajoutez une clé API de fournisseur pour commencer à créer des points de terminaison.",
  "No audit logs yet": "Aucun journal d'audit pour le moment",
  "No budget configured. All requests are allowed without cost limits.":
    "Aucun budget configuré. Toutes les requêtes sont autorisées sans limite de coût.",
  "No content filter rules configured. Add keyword or regex rules to block or mask prohibited content.":
    "Aucune règle de filtre de contenu configurée. Ajoutez des règles par mot-clé ou regex pour bloquer ou masquer le contenu interdit.",
  "No detections in this period": "Aucune détection sur cette période",
  "No differences found": "Aucune différence trouvée",
  "No endpoint data": "Aucune donnée de point de terminaison",
  "No endpoints configured yet. Add your first LLM endpoint to start routing requests through the gateway.":
    "Aucun point de terminaison configuré pour le moment. Ajoutez votre premier point de terminaison LLM pour commencer à router les requêtes via la passerelle.",
  "No guardrail detections yet.": "Aucune détection de garde-fou pour le moment.",
  "No MCP tools discovered yet. Tools will appear here after servers are connected and their tools are fetched.":
    "Aucun outil MCP découvert pour le moment. Les outils apparaîtront ici une fois les serveurs connectés et leurs outils récupérés.",
  "No models match your filters.": "Aucun modèle ne correspond à vos filtres.",
  "No pending risk suggestions. Run detection or wait for the next scheduled check.":
    "Aucune suggestion de risque en attente. Lancez la détection ou attendez la prochaine vérification planifiée.",
  "No PII detection rules configured. Add rules to automatically detect and protect personal data in AI requests.":
    "Aucune règle de détection de données personnelles configurée. Ajoutez des règles pour détecter et protéger automatiquement les données personnelles dans les requêtes IA.",
  "No prompts yet. Create your first prompt template to centralize and version-control system instructions.":
    "Aucun prompt pour le moment. Créez votre premier modèle de prompt pour centraliser et versionner les instructions système.",
  "No request logs yet. Send requests through the gateway to see detailed logs here.":
    "Aucun journal de requête pour le moment. Envoyez des requêtes via la passerelle pour voir ici les journaux détaillés.",
  "No results matching the current filters.": "Aucun résultat ne correspond aux filtres actuels.",
  "Add a provider API key for your gateway endpoints":
    "Ajouter une clé API de fournisseur pour vos points de terminaison de passerelle",
  "Block or mask content matching a keyword or regex pattern":
    "Bloquer ou masquer le contenu correspondant à un mot-clé ou à un motif regex",
  "Block or mask detected PII": "Bloquer ou masquer les données personnelles détectées",
  "Compare message content and configuration between two versions.":
    "Comparer le contenu des messages et la configuration entre deux versions.",
  "Configure a new LLM provider endpoint":
    "Configurer un nouveau point de terminaison de fournisseur LLM",
  "Scan agent tool calls, MCP and native tools like Bash, for PII, prohibited content or prompt injection, then block or mask what matches.":
    "Analysez les appels d'outils des agents, MCP et outils natifs comme Bash, à la recherche de données personnelles, de contenu interdit ou d'injection de prompt, puis bloquez ou masquez les correspondances.",
  "Configure LLM provider endpoints for your organization.":
    "Configurer les points de terminaison des fournisseurs LLM pour votre organisation.",
  "Configure monthly spending limits for the AI Gateway":
    "Configurer des limites de dépenses mensuelles pour la passerelle IA",
  "Configure parameters for your requests": "Configurer les paramètres de vos requêtes",
  "Configure PII detection and content filtering rules for your AI Gateway.":
    "Configurer les règles de détection de données personnelles et de filtrage de contenu pour votre passerelle IA.",
  "Configure which personal data types to detect":
    "Configurer les types de données personnelles à détecter",
  "Create versioned prompt templates with variables and bind them to endpoints.":
    "Créez des modèles de prompt versionnés avec variables et reliez-les à des points de terminaison.",
  "Require approval on sensitive tools so a person reviews them before the agent runs them.":
    "Exigez une approbation sur les outils sensibles pour qu'une personne les relise avant que l'agent ne les exécute.",
  "Fine-tune how the model generates responses.":
    "Affinez la manière dont le modèle génère ses réponses.",
  "Generate an API key for developers to use the gateway":
    "Générer une clé API pour que les développeurs utilisent la passerelle",
  "Generate an API key for developers to use the gateway with the OpenAI SDK.":
    "Générer une clé API pour que les développeurs utilisent la passerelle avec le SDK OpenAI.",
  "Generate API keys for developers to use the gateway from their code.":
    "Générer des clés API pour que les développeurs utilisent la passerelle depuis leur code.",
  "How to generate audit logs": "Comment générer des journaux d'audit",
  "Issue scoped API keys for AI agents to authenticate with MCP servers.":
    "Émettre des clés API restreintes pour que les agents IA s'authentifient auprès des serveurs MCP.",
  "Manage API keys, budget, and guardrail settings for the AI Gateway.":
    "Gérez les clés API, le budget et les paramètres des garde-fous pour la passerelle IA.",
  "Manage tool risk levels": "Gérer les niveaux de risque des outils",
  "Monitor costs and enforce budgets": "Surveiller les coûts et faire respecter les budgets",
  "Optionally describe what changed in this version.":
    "Décrivez éventuellement ce qui a changé dans cette version.",
  "Paste sample text to preview what your active guardrail rules would detect":
    "Collez un exemple de texte pour prévisualiser ce que vos règles de garde-fou actives détecteraient",
  "Every tool call your AI agents make, MCP tools and native tools like Bash, with outcome, latency and which agent.":
    "Chaque appel d'outil effectué par vos agents IA, outils MCP et outils natifs comme Bash, avec le résultat, la latence et l'agent concerné.",
  "Run a test request through the gateway to complete setup":
    "Envoyez une requête de test via la passerelle pour terminer la configuration",
  "Select action": "Sélectionner une action",
  "Select an API key": "Sélectionner une clé API",
  "Select endpoint": "Sélectionner un point de terminaison",
  "Select rule type": "Sélectionner le type de règle",
  "Select scope": "Sélectionner la portée",
  "Select version": "Sélectionner une version",
  "Select versions and send a message": "Sélectionner des versions et envoyer un message",
  "Set up a new prompt template.": "Configurer un nouveau modèle de prompt.",
  "Test your configured endpoints with an interactive chat interface.":
    "Testez vos points de terminaison configurés avec une interface de chat interactive.",
  "This will create a new risk in Risk Management pre-filled with the suggestion data.":
    "Cela créera un nouveau risque dans la gestion des risques, pré-rempli avec les données de la suggestion.",
  "Type a message to compare...": "Saisir un message à comparer...",
  "Type a message...": "Saisir un message...",
  "View and manage all discovered MCP tools across your servers.":
    "Consulter et gérer tous les outils MCP découverts sur vos serveurs.",
  "View request, response, and guardrail detection logs for all AI Gateway traffic.":
    "Consulter les journaux de requête, de réponse et de détection par les garde-fous pour tout le trafic de la passerelle IA.",
  "After adding a key, create endpoints in the Endpoints tab. Each endpoint uses one API key to authenticate with the LLM provider.":
    "Après avoir ajouté une clé, créez des points de terminaison dans l'onglet Points de terminaison. Chaque point de terminaison utilise une clé API pour s'authentifier auprès du fournisseur LLM.",
  "Apply guardrails globally or restrict them to specific MCP tools. For example, block PII only when invoking database-query tools.":
    "Appliquez les garde-fous globalement ou restreignez-les à des outils MCP spécifiques. Par exemple, bloquer les données personnelles uniquement lors de l'invocation d'outils d'interrogation de base de données.",
  "Choose from PII detection, content filtering, or prompt injection detection. Each rule can either block the request or mask matched content.":
    "Choisissez entre la détection de données personnelles, le filtrage de contenu ou la détection d'injection de prompt. Chaque règle peut bloquer la requête ou masquer le contenu correspondant.",
  "Click a row to expand and see full request/response details":
    "Cliquez sur une ligne pour l'étendre et voir les détails complets de la requête/réponse",
  "Content filters execute in-process with no external API calls. Rules are evaluated before the request reaches the LLM provider.":
    "Les filtres de contenu s'exécutent in-process sans appels API externes. Les règles sont évaluées avant que la requête n'atteigne le fournisseur LLM.",
  "Error Rate": "Taux d'erreur",
  "Error behavior": "Comportement en cas d'erreur",
  "Every request through the gateway is logged with cost, tokens, and latency. Set a monthly budget to prevent unexpected cost overruns.":
    "Chaque requête via la passerelle est journalisée avec coût, tokens et latence. Définissez un budget mensuel pour éviter les dépassements de coûts inattendus.",
  "Make tool calls through the MCP Gateway using an agent key at POST /v1/mcp with the tools/call method.":
    "Effectuez des appels d'outils via la passerelle MCP en utilisant une clé d'agent sur POST /v1/mcp avec la méthode tools/call.",
  "Max entries per org": "Max. entrées par organisation",
  "Max tokens": "Tokens max.",
  "No guardrail rules configured yet. Add rules to scan agent tool calls for PII, prohibited content, or prompt injection attempts.":
    "Aucune règle de garde-fou configurée pour le moment. Ajoutez des règles pour analyser les appels d'outils des agents à la recherche de données personnelles, de contenu interdit ou de tentatives d'injection de prompt.",
  "Requests/day": "Requêtes/jour",
  "Top 10 tools by calls": "Top 10 des outils par appels",
  "Top P": "Top P",
  "e.g. 4096": "ex. 4096",
  "e.g. Added few-shot examples for edge cases":
    "ex. Ajout d'exemples few-shot pour les cas limites",
  "e.g. Customer support agent": "ex. Agent de support client",
  "e.g. greet": "ex. saluer",
  "e.g. production, staging, canary": "ex. production, staging, canary",
  "e.g., 100.00": "ex. 100,00",
  "e.g., 60": "ex. 60",
  "e.g., Already addressed, Not applicable": "ex. Déjà traité, Non applicable",
  "e.g., Backend production key": "ex. Clé de production backend",
  "e.g., Block PII in database queries":
    "ex. Bloquer les données personnelles dans les requêtes de base de données",
  "e.g., Block competitor names": "ex. Bloquer les noms de concurrents",
  "e.g., Block credit cards": "ex. Bloquer les cartes de crédit",
  "e.g., Production GPT-4o": "ex. GPT-4o de production",
  "e.g., Production OpenAI key": "ex. Clé OpenAI de production",
  "Last 24 hours": "Dernières 24 heures",
  "PII detection runs within your gateway infrastructure. No data is sent to external services for scanning. Supports email, phone, credit card, names, IBAN, Turkish TCKN, and more.":
    "La détection de données personnelles s'exécute dans votre infrastructure de passerelle. Aucune donnée n'est envoyée à des services externes pour analyse. Prend en charge e-mail, téléphone, carte de crédit, noms, IBAN, TCKN turc et plus.",
  "Block requests containing personal data, or mask it with placeholders (e.g., <EMAIL_ADDRESS>) before sending to the LLM. Input is scanned before the model sees it.":
    "Bloquer les requêtes contenant des données personnelles, ou les masquer avec des espaces réservés (ex. <EMAIL_ADDRESS>) avant l'envoi au LLM. L'entrée est analysée avant que le modèle ne la voie.",
  "Block specific words (exact match with word boundaries) or define custom regex patterns to catch formats like internal project codes, employee IDs, or confidential terms.":
    "Bloquez des mots spécifiques (correspondance exacte avec limites de mot) ou définissez des motifs regex personnalisés pour capturer des formats comme les codes de projet internes, les identifiants d'employés ou les termes confidentiels.",
  "Add rule": "Ajouter une règle",
  "Remove rule": "Retirer la règle",
  "Block": "Bloquer",
  "Mask": "Masquer",
  "Keyword": "Mot-clé",
  "Regex pattern": "Motif regex",
  "PII entities covered by this rule will no longer be detected or masked in LLM requests.":
    "Les entités de données personnelles couvertes par cette règle ne seront plus détectées ni masquées dans les requêtes LLM.",
  "Content matching this filter pattern will no longer be blocked or masked.":
    "Le contenu correspondant à ce motif de filtre ne sera plus bloqué ni masqué.",
  "You can re-enable this guardrail at any time from the catalog or by creating a new rule.":
    "Vous pouvez réactiver ce garde-fou à tout moment depuis le catalogue ou en créant une nouvelle règle.",
  "Content safety": "Sécurité du contenu",
  "Prompt security": "Sécurité des prompts",
  "Data leakage prevention": "Prévention des fuites de données",
  "No guardrails match your search.": "Aucun garde-fou ne correspond à votre recherche.",
  "Email addresses": "Adresses e-mail",
  "Phone numbers": "Numéros de téléphone",
  "Credit card numbers": "Numéros de carte de crédit",
  "US Social Security numbers": "Numéros de sécurité sociale américains",
  "Person names": "Noms de personne",
  "IBAN codes": "Codes IBAN",
  "IP addresses": "Adresses IP",
  "Physical locations": "Emplacements physiques",
  "Dates and times": "Dates et heures",
  "Medical license numbers": "Numéros de licence médicale",
  "Nationality, religion, politics": "Nationalité, religion, politique",
  "EU phone numbers": "Numéros de téléphone UE",
  "Turkish identity numbers": "Numéros d'identité turcs",
  "Profanity filter": "Filtre d'injures",
  "Hate speech and slurs": "Discours de haine et insultes",
  "Violence instructions": "Instructions de violence",
  "Self-harm content": "Contenu d'automutilation",
  "Prompt injection (basic)": "Injection de prompt (basique)",
  "Jailbreak attempts": "Tentatives de jailbreak",
  "System prompt extraction": "Extraction du prompt système",
  "Instruction override": "Remplacement d'instruction",
  "API keys and tokens": "Clés API et jetons",
  "AWS credentials": "Identifiants AWS",
  "Private keys": "Clés privées",
  "Database connection strings": "Chaînes de connexion à la base de données",
  "Internal URLs": "URL internes",
  "Environment variables": "Variables d'environnement",
  "GDPR personal data (all)": "Données personnelles RGPD (toutes)",
  "HIPAA protected health info": "Informations de santé protégées par HIPAA",
  "PCI DSS cardholder data": "Données de titulaires de carte PCI DSS",
  "SOC 2 sensitive data": "Données sensibles SOC 2",
  "Detect and protect email addresses in prompts.":
    "Détecter et protéger les adresses e-mail dans les prompts.",
  "Detect phone numbers including international formats.":
    "Détecter les numéros de téléphone, y compris les formats internationaux.",
  "Detect Visa, Mastercard, Amex, and other card formats.":
    "Détecter les formats Visa, Mastercard, Amex et d'autres cartes.",
  "Detect US SSN formats (XXX-XX-XXXX).": "Détecter les formats de SSN américains (XXX-XX-XXXX).",
  "Detect personal names in text.": "Détecter les noms de personne dans un texte.",
  "Detect International Bank Account Numbers.":
    "Détecter les numéros de compte bancaire internationaux (IBAN).",
  "Detect IPv4 and IPv6 addresses.": "Détecter les adresses IPv4 et IPv6.",
  "Detect addresses, cities, and location references.":
    "Détecter les adresses, villes et références de lieux.",
  "Detect date of birth and other date/time references.":
    "Détecter les dates de naissance et autres références de date/heure.",
  "Detect medical license and DEA numbers.": "Détecter les numéros de licence médicale et DEA.",
  "Detect references to nationality, religious, or political affiliation.":
    "Détecter les références à la nationalité, l'appartenance religieuse ou politique.",
  "Detect European phone number formats.":
    "Détecter les formats de numéros de téléphone européens.",
  "Detect Turkish national identity (TCKN) numbers.":
    "Détecter les numéros d'identité nationaux turcs (TCKN).",
  "Block common profane and offensive words across 10+ terms.":
    "Bloquer les mots injurieux et offensants courants sur plus de 10 termes.",
  "Block racial, ethnic, and identity-based slurs.":
    "Bloquer les insultes raciales, ethniques et fondées sur l'identité.",
  "Block requests for instructions on causing physical harm.":
    "Bloquer les demandes d'instructions pour causer un préjudice physique.",
  "Block content related to self-harm or suicide instructions.":
    "Bloquer le contenu lié à l'automutilation ou aux instructions de suicide.",
  "Detect common prompt injection patterns that attempt to override system instructions.":
    "Détecter les motifs d'injection de prompt courants qui tentent de contourner les instructions système.",
  "Detect DAN-style jailbreak patterns and role override attempts.":
    "Détecter les motifs de jailbreak de type DAN et les tentatives de remplacement de rôle.",
  "Block attempts to extract the system prompt or internal instructions.":
    "Bloquer les tentatives d'extraction du prompt système ou des instructions internes.",
  "Block attempts to override safety guidelines or role-play as unrestricted.":
    "Bloquer les tentatives de contourner les consignes de sécurité ou de jouer un rôle sans restrictions.",
  "Detect API keys, bearer tokens, and secret keys in prompts.":
    "Détecter les clés API, jetons bearer et clés secrètes dans les prompts.",
  "Detect AWS access keys and secret keys.": "Détecter les clés d'accès et clés secrètes AWS.",
  "Detect SSH, RSA, and other private key blocks.":
    "Détecter les blocs de clés privées SSH, RSA et autres.",
  "Detect database URLs and connection strings.":
    "Détecter les URL de base de données et chaînes de connexion.",
  "Detect references to internal/private network URLs.":
    "Détecter les références à des URL internes/de réseau privé.",
  "Detect environment variable assignments with secrets.":
    "Détecter les affectations de variables d'environnement contenant des secrets.",
  "Detect all GDPR-relevant personal data: email, phone, name, location, DOB, IP, nationality.":
    "Détecter toutes les données personnelles pertinentes au RGPD : e-mail, téléphone, nom, lieu, date de naissance, IP, nationalité.",
  "Detect PHI identifiers: names, dates, SSNs, medical licenses, phone, email.":
    "Détecter les identifiants PHI : noms, dates, SSN, licences médicales, téléphone, e-mail.",
  "Block credit card numbers and IBANs per PCI DSS requirements.":
    "Bloquer les numéros de carte de crédit et IBAN conformément aux exigences PCI DSS.",
  "Block API keys, private keys, connection strings, and credentials.":
    "Bloquer les clés API, clés privées, chaînes de connexion et identifiants.",
  "Phone number": "Numéro de téléphone",
  "Credit card": "Carte de crédit",
  "Person name": "Nom de personne",
  "IBAN": "IBAN",
  "Turkish TCKN": "TCKN turc",
  "EU phone number": "Numéro de téléphone UE",
  "US SSN": "SSN américain",
  "IP address": "Adresse IP",
  "Date/time": "Date/heure",
  "Nationality/religion/politics": "Nationalité/religion/politique",
  "Medical license": "Licence médicale",
  "Select up to 5 models to compare side by side.":
    "Sélectionnez jusqu'à 5 modèles pour les comparer côte à côte.",
  "Search and select models above to compare features side by side.":
    "Recherchez et sélectionnez des modèles ci-dessus pour comparer leurs fonctionnalités côte à côte.",
  "Visualize your LLM traffic": "Visualisez votre trafic LLM",
  "Make your first request to see a real-time map of your model connections":
    "Envoyez votre première requête pour voir une carte en temps réel de vos connexions aux modèles",
  "Add a provider API key": "Ajouter une clé API de fournisseur",
  "Create an endpoint": "Créer un point de terminaison",
  "Create a virtual key": "Créer une clé virtuelle",
  "No API keys configured": "Aucune clé API configurée",
  "Go to the Settings tab in the sidebar and add your provider API key (OpenAI, Anthropic, etc.). Once added, come back here to create your first endpoint.":
    "Allez dans l'onglet Paramètres de la barre latérale et ajoutez votre clé API de fournisseur (OpenAI, Anthropic, etc.). Une fois ajoutée, revenez ici pour créer votre premier point de terminaison.",
  "Agent key": "Clé d'agent",
  "All tools": "Tous les outils",
  "Arguments": "Arguments",
  "Delete guardrail": "Supprimer le garde-fou",
  "Edit guardrail": "Modifier le garde-fou",
  "Edit tool": "Modifier l'outil",
  "MCP servers": "Serveurs MCP",
  "MCP tools": "Outils MCP",
  "Require approval": "Approbation requise",
  "No result captured (older adapter, or the tool did not report back).":
    "Aucun résultat capturé (adaptateur plus ancien ou l'outil n'a rien renvoyé).",
  "By endpoint": "Par point de terminaison",
  "CORS is disabled on gateway routes. Use virtual keys from backend services only.":
    "CORS est désactivé sur les routes de la passerelle. Utilisez les clés virtuelles uniquement depuis les services backend.",
  "Comma-separated tool names. Leave empty to apply to all MCP tools.":
    "Noms d'outils séparés par des virgules. Laissez vide pour appliquer à tous les outils MCP.",
  "Create at least one endpoint before generating virtual keys.":
    "Créez au moins un point de terminaison avant de générer des clés virtuelles.",
  "Endpoint slug:": "Slug du point de terminaison :",
  "Every guardrail detection across all endpoints, newest first. A request with several matches has one row for each.":
    "Chaque détection de garde-fou sur tous les points de terminaison, les plus récentes en premier. Une requête avec plusieurs correspondances a une ligne pour chacune.",
  "Live updates": "Mises à jour en direct",
  "Lower values are more focused, higher values are more creative":
    "Les valeurs basses sont plus ciblées, les valeurs élevées sont plus créatives",
  "No API keys available. Complete step 1 first.":
    "Aucune clé API disponible. Terminez d'abord l'étape 1.",
  "No API keys available. Go to Settings to add one first.":
    "Aucune clé API disponible. Allez dans Paramètres pour en ajouter une d'abord.",
  "No endpoints configured": "Aucun point de terminaison configuré",
  "No tools match the selected filters.": "Aucun outil ne correspond aux filtres sélectionnés.",
  "No versions yet": "Pas encore de versions",
  "Optional JSON configuration for advanced rule settings.":
    "Configuration JSON optionnelle pour les paramètres de règle avancés.",
  "Prompt:": "Invite :",
  "Reject requests when budget is exceeded": "Rejeter les requêtes lorsque le budget est dépassé",
  "Request": "Requête",
  "Setup required": "Configuration requise",
  "Slug:": "Slug :",
  "This key will not be shown again. Store it securely.":
    "Cette clé ne sera plus affichée. Stockez-la en sécurité.",
  "This key won't be shown again. Store it securely.":
    "Cette clé ne sera plus affichée. Stockez-la en sécurité.",
  "Top detections": "Principales détections",
  "View all guardrail logs": "Voir tous les journaux de garde-fou",
  "When enabled, tool invocations must be approved before execution.":
    "Lorsqu'activé, les invocations d'outils doivent être approuvées avant l'exécution.",
  "You can re-create this guardrail at any time.":
    "Vous pouvez recréer ce garde-fou à tout moment.",
  "All modes": "Tous les modes",
  "All providers": "Tous les fournisseurs",
  "All risk levels": "Tous les niveaux de risque",
  "All servers": "Tous les serveurs",
  "Allow request (fail-open)": "Autoriser la requête (fail-open)",
  "Audio transcription": "Transcription audio",
  "Block request (fail-closed)": "Bloquer la requête (fail-closed)",
  "Chat": "Chat",
  "Embedding": "Embedding",
  "Flags active endpoints with zero requests, which increase the attack surface unnecessarily.":
    "Signale les points de terminaison actifs avec zéro requête, qui augmentent inutilement la surface d'attaque.",
  "Flags when monthly AI Gateway spend approaches the configured budget limit.":
    "Signale lorsque les dépenses mensuelles d'AI Gateway approchent la limite de budget configurée.",
  "Flags when most of the spend is concentrated on a single LLM provider, increasing vendor risk.":
    "Signale lorsque la majeure partie des dépenses est concentrée sur un seul fournisseur LLM, augmentant le risque fournisseur.",
  "Flags when the 24-hour error rate exceeds a multiple of the 7-day average, indicating provider issues.":
    "Signale lorsque le taux d'erreur sur 24 heures dépasse un multiple de la moyenne sur 7 jours, indiquant des problèmes du fournisseur.",
  "Flags when users send personal data (names, emails, SSNs) to LLM providers above a threshold.":
    "Signale lorsque les utilisateurs envoient des données personnelles (noms, e-mails, SSN) aux fournisseurs LLM au-dessus d'un seuil.",
  "Google Gemini": "Google Gemini",
  "Guardrail logs": "Journaux de garde-fou",
  "Image generation": "Génération d'images",
  "Last 14 days": "Derniers 14 jours",
  "Max input tokens": "Jetons d'entrée maximum",
  "Max output tokens": "Jetons de sortie maximum",
  "No response body": "Aucun corps de réponse",
  "Parallel tools": "Outils parallèles",
  "Rate limited": "Limité en débit",
  "Request logs": "Journaux de requêtes",
  "Response schema": "Schéma de réponse",
  "Run": "Exécution",
  "Showing the most recent 50 runs.": "Affichage des 50 exécutions les plus récentes.",
  "Reconstruct a full agent turn: the model calls (the conversation) and tool calls (the actions) correlated into one run.":
    "Reconstituez un tour complet de l'agent : les appels de modèle (la conversation) et les appels d'outil (les actions) regroupés en une seule exécution.",
  "Runs appear when an agent sends the same run id (header":
    "Les exécutions apparaissent lorsqu'un agent envoie le même identifiant d'exécution (en-tête",
  "Select an endpoint first.": "Sélectionnez d'abord un point de terminaison.",
  "Source: All": "Source : Toutes",
  "Source: Playground": "Source : Playground",
  "Source: Virtual key": "Source : Clé virtuelle",
  "Started": "Démarré",
  "Status: Error": "Statut : Erreur",
  "Status: Success": "Statut : Réussite",
  "System messages": "Messages système",
  "Tool calls": "Appels d'outil",
  "Tool input": "Entrée de l'outil",
  "By {name} · {date}": "Par {name} · {date}",
  "Click Save draft to create your first version.":
    "Cliquez sur Enregistrer le brouillon pour créer votre première version.",
  "Could not load this run.": "Impossible de charger cette exécution.",
  "Create your first version": "Créer votre première version",
  "Failed to load invocation details.": "Échec du chargement des détails de l'invocation.",
  "Refresh": "Actualiser",
  "Select a log to view details.": "Sélectionnez un journal pour voir les détails.",
  "{name} (inactive)": "{name} (inactif)",
  "#{id} (not found)": "#{id} (introuvable)",
  "No endpoints": "Aucun point de terminaison",
  "Sample text must be at most {max} characters":
    "Le texte d'exemple ne doit pas dépasser {max} caractères",
  "{count} logs deleted": "{count} journaux supprimés",
  "Permanently delete guardrail logs older than {days} days?":
    "Supprimer définitivement les journaux de garde-fous datant de plus de {days} jours ?",
  "How long to keep guardrail detection logs and spend logs. Guardrail logs record every blocked or masked request for compliance auditing (EU AI Act Art. 12).":
    "Durée de conservation des journaux de détection des garde-fous et des journaux de dépenses. Les journaux des garde-fous enregistrent chaque requête bloquée ou masquée pour l'audit de conformité (règlement européen sur l'IA, art. 12).",
  "When on, logs older than their retention period are deleted every day. When off, logs are kept until you purge them.":
    "Si activé, les journaux plus anciens que leur durée de conservation sont supprimés chaque jour. Si désactivé, les journaux sont conservés jusqu'à ce que vous les purgiez.",
  "Spend log retention (days)": "Conservation des journaux de dépenses (jours)",
  "Purge logs": "Purger les journaux",
  "This cannot be undone. The saved retention period is used, so save any change to it first.":
    "Cette action est irréversible. La durée de conservation enregistrée est utilisée, enregistrez donc d'abord toute modification.",
  "Delete old spend log entries based on the spend log retention period above.":
    "Supprimer les anciennes entrées du journal des dépenses selon la durée de conservation des journaux de dépenses ci-dessus.",
  "Retention periods must be whole numbers from {min} to {max} days":
    "Les durées de conservation doivent être des nombres entiers de {min} à {max} jours",
  "Confirm automatic deletion": "Confirmer la suppression automatique",
  "Failed to purge logs": "Échec de la purge des journaux",
  "Delete automatically": "Supprimer automatiquement",
  "This setting applies to both AI Gateway log types.":
    "Ce paramètre s'applique aux deux types de journaux de l'AI Gateway.",
  "Delete records": "Supprimer les enregistrements",
  "Failed to save settings": "Impossible d'enregistrer les paramètres",
};

export const es: Record<string, string> = {
  "Use monitor only mode?": "¿Usar el modo solo supervisión?",
  "Use monitor only": "Usar solo supervisión",
  "Calls made with this key will no longer be blocked or paused for approval.":
    "Las llamadas realizadas con esta clave ya no se bloquearán ni se pausarán para aprobación.",
  'Guardrails and approval rules are still checked, and so are the key\'s tool lists for calls through the MCP proxy, and for native tool calls when the key\'s "Also apply tool lists to native tool calls" setting is on. Every match is logged in Activity as "Would block" or "Would need approval". No approval requests are created. Rate limits still apply.':
    "Las barreras de protección y las reglas de aprobación se siguen comprobando, y también las listas de herramientas de la clave en las llamadas a través del proxy MCP, y en las llamadas a herramientas nativas cuando la opción «Aplicar también las listas de herramientas a las llamadas nativas» de la clave está activada. Cada coincidencia se registra en Actividad como «Bloquearía» o «Requeriría aprobación». No se crean solicitudes de aprobación. Los límites de frecuencia siguen aplicándose.",
  "Would block": "Bloquearía",
  "Would need approval": "Requeriría aprobación",
  "{count} would block": "{count} se bloquearían",
  "{count} would need approval": "{count} requerirían aprobación",
  "Also apply tool lists to native tool calls (hooks and SDK)":
    "Aplicar también las listas de herramientas a las llamadas nativas (hooks y SDK)",
  "Off: the allowed and blocked tool lists apply only to MCP server tools called through the proxy. On: they also apply to the agent's own tool calls checked by the hook script or the Python SDK, such as Bash, Edit or your Python functions. Leave it off for keys used by Claude Code or Cursor unless the lists name those tools.":
    "Desactivado: las listas de herramientas permitidas y bloqueadas solo se aplican a las herramientas de servidor MCP invocadas a través del proxy. Activado: también se aplican a las llamadas a herramientas propias del agente que comprueban el script de hook o el SDK de Python, como Bash, Edit o sus funciones de Python. Déjelo desactivado en las claves que usan Claude Code o Cursor, salvo que las listas nombren esas herramientas.",
  "The server offered no tools": "El servidor no ofreció herramientas",
  "One tool found": "Se encontró una herramienta",
  "{count} tools found": "Se encontraron {count} herramientas",
  "{count} new": "{count} nueva(s)",
  "{count} removed": "{count} eliminada(s)",
  "{count} changed": "{count} modificada(s)",
  "Back to MCP servers": "Volver a servidores MCP",
  "Model calls": "Llamadas al modelo",
  "Filter": "Filtrar",
  "No agent runs yet": "Aún no hay ejecuciones de agente",
  "Recent activity": "Actividad reciente",
  "Avg Latency": "Latencia media",
  "Avg input tokens": "Tokens de entrada medios",
  "Avg latency, top 10 tools": "Latencia media, 10 herramientas principales",
  "Avg output tokens": "Tokens de salida medios",
  "Cache TTL (seconds)": "TTL de caché (segundos)",
  "Config (JSON)": "Configuración (JSON)",
  "Create risk": "Crear riesgo",
  "Default TTL (seconds)": "TTL predeterminado (segundos)",
  "Each discovered tool can be assigned a risk level (low, medium, high). High-risk tools can require approval before execution.":
    "A cada herramienta descubierta se le puede asignar un nivel de riesgo (bajo, medio, alto). Las herramientas de alto riesgo pueden requerir aprobación antes de ejecutarse.",
  "Guardrail rules are evaluated against tool input data before the MCP tool is executed. Block or mask sensitive content to protect your downstream systems.":
    "Las reglas de las barreras de protección se evalúan frente a los datos de entrada de la herramienta antes de ejecutar la herramienta MCP. Bloquee o enmascare el contenido sensible para proteger sus sistemas posteriores.",
  "I copied, continue": "Lo he copiado, continuar",
  "Label name": "Nombre de la etiqueta",
  "Log request body (prompts)": "Registrar el cuerpo de la solicitud (prompts)",
  "Log response body (LLM output)": "Registrar el cuerpo de la respuesta (salida del LLM)",
  "Monthly budget (USD)": "Presupuesto mensual (USD)",
  "Monthly limit (USD)": "Límite mensual (USD)",
  "None (no fallback)": "Ninguno (sin alternativa)",
  "Rate limit (RPM)": "Límite de frecuencia (RPM)",
  "Rate limit (requests per minute)": "Límite de frecuencia (solicitudes por minuto)",
  "Reason (optional)": "Motivo (opcional)",
  "Remove key": "Eliminar clave",
  "Retention period (days)": "Periodo de retención (días)",
  "Security &amp; guardrails": "Seguridad &amp; barreras de protección",
  "Your provider API keys are encrypted using AES-256-GCM before being stored. They are only decrypted when proxying a request and are never exposed in logs.":
    "Las claves de API de su proveedor se cifran con AES-256-GCM antes de almacenarse. Solo se descifran al redirigir una solicitud y nunca se exponen en los registros.",
  "Playground settings": "Configuración del playground",
  "Add an API key": "Añadir una clave de API",
  "Add content filter rule": "Añadir regla de filtro de contenido",
  "Add endpoint": "Añadir endpoint",
  "Add filter rule": "Añadir regla de filtro",
  "Add from catalog": "Añadir desde el catálogo",
  "Add guardrail": "Añadir barrera de protección",
  "Add key": "Añadir clave",
  "Add label": "Añadir etiqueta",
  "Add message": "Añadir mensaje",
  "Add PII detection rule": "Añadir regla de detección de PII",
  "Add PII rule": "Añadir regla de PII",
  "Add test case": "Añadir caso de prueba",
  "Back to prompts": "Volver a los prompts",
  "Compare": "Comparar",
  "Copy key": "Copiar clave",
  "Copy the key below. It will not be shown again.":
    "Copie la clave que aparece a continuación. No volverá a mostrarse.",
  "Create endpoint": "Crear endpoint",
  "Create key": "Crear clave",
  "Create prompt": "Crear prompt",
  "Create virtual key": "Crear clave virtual",
  "Delete endpoint": "Eliminar endpoint",
  "Delete prompt": "Eliminar prompt",
  "Denied": "Denegado",
  "Dismiss suggestion": "Descartar sugerencia",
  "Edit tool settings": "Editar configuración de la herramienta",
  "Filter by risk": "Filtrar por riesgo",
  "Filter by server": "Filtrar por servidor",
  "Filter by tool": "Filtrar por herramienta",
  "Go to Endpoints": "Ir a Endpoints",
  "Go to Settings": "Ir a configuración",
  "Make your first request": "Realiza tu primera solicitud",
  "Purge old logs": "Purgar registros antiguos",
  "Read the guide": "Leer la guía",
  "Remove from comparison": "Eliminar de la comparación",
  "Remove guardrail rule": "Eliminar regla de barrera de protección",
  "Revoke virtual key": "Revocar clave virtual",
  "Run all": "Ejecutar todo",
  "Save dataset": "Guardar conjunto de datos",
  "Save version": "Guardar versión",
  "Send a message to test this prompt": "Envía un mensaje para probar este prompt",
  "Test endpoint": "Probar endpoint",
  "Test guardrails": "Probar barreras de protección",
  "Accept as risk": "Aceptar como riesgo",
  "Agent activity": "Actividad del agente",
  "All agents": "Todos los agentes",
  "Applies to agents": "Se aplica a los agentes",
  "No activity recorded for this agent yet": "Aún no se ha registrado actividad para este agente",
  "Failed to load agent activity": "No se pudo cargar la actividad de este agente",
  "Selected agents": "Agentes seleccionados",
  "Select agents": "Seleccionar agentes",
  "No agents": "Ningún agente",
  "Select at least one agent, or apply the rule to all agents":
    "Selecciona al menos un agente o aplica la regla a todos los agentes",
  "Last active {date}": "Última actividad {date}",
  "Tool use ID": "ID de uso de herramienta",
  "This agent": "Este agente",
  "{name} · last {days} days": "{name} · últimos {days} días",
  "Rule: {name}": "Regla: {name}",
  "Alert threshold": "Umbral de alerta",
  "Allowed models": "Modelos permitidos",
  "Allowed providers": "Proveedores permitidos",
  "Any language or framework": "Cualquier lenguaje o marco",
  "Any endpoint or model": "Cualquier endpoint o modelo",
  "Applies to tools": "Se aplica a las herramientas",
  "Approval required": "Aprobación requerida",
  "Audit log retention": "Retención del registro de auditoría",
  "Audit trail": "Registro de auditoría",
  "Average round-trip time for tool calls":
    "Tiempo medio de ida y vuelta de las llamadas a herramientas",
  "Average round-trip time from request to complete response":
    "Tiempo medio de ida y vuelta desde la solicitud hasta la respuesta completa",
  "Average round-trip time per tool call, useful for spotting slow tools":
    "Tiempo medio de ida y vuelta por llamada a herramienta, útil para detectar herramientas lentas",
  "Bearer token": "Token Bearer",
  "Bind prompts to endpoints": "Vincular prompts a endpoints",
  "Blocked models": "Modelos bloqueados",
  "Blocked providers": "Proveedores bloqueados",
  "Browse pre-built guardrails and enable them with one click":
    "Explore barreras de protección predefinidas y actívelas con un solo clic",
  "Budget controls": "Controles de presupuesto",
  "Combined prompt and completion tokens across all requests":
    "Tokens combinados de prompt y completado en todas las solicitudes",
  "Configuration changes": "Cambios de configuración",
  "Content filter on error": "Filtro de contenido en caso de error",
  "Content filter replacement": "Sustitución del filtro de contenido",
  "Cost by endpoint": "Coste por endpoint",
  "Cost by model": "Coste por modelo",
  "Cost by provider": "Coste por proveedor",
  "Cost over time": "Coste a lo largo del tiempo",
  "Cost per request": "Coste por solicitud",
  "Current spend": "Gasto actual",
  "Drop-in replacement for any OpenAI SDK": "Sustituto directo de cualquier OpenAI SDK",
  "Each endpoint references an API key": "Cada endpoint hace referencia a una clave de API",
  "Enable caching globally": "Habilitar caché de forma global",
  "Enable response caching": "Habilitar caché de respuestas",
  "Endpoint name": "Nombre del endpoint",
  "Expected": "Esperado",
  "Fallback chains": "Cadenas de respaldo",
  "Fallback endpoint": "Endpoint de respaldo",
  "Feature": "Función",
  "Full request and response audit": "Auditoría completa de solicitud y respuesta",
  "Function calling": "Llamada a funciones",
  "Guardrail catalog": "Catálogo de barreras de protección",
  "Guardrail detection logs": "Registros de detección de barreras de protección",
  "Guardrail detections": "Detecciones de barreras de protección",
  "Guardrails activity": "Actividad de barreras de protección",
  "Hard limit": "Límite estricto",
  "In-process PII scanning": "Análisis de PII en proceso",
  "Includes:": "Incluye:",
  "Keys are encrypted at rest": "Las claves se cifran en reposo",
  "Keyword and regex matching": "Coincidencia de palabras clave y regex",
  "Labels": "Etiquetas",
  "LLM providers": "Proveedores de LLM",
  "Log details info": "Información de detalles del registro",
  "Masked": "Enmascarado",
  "Masked preview:": "Vista previa enmascarada:",
  "Match type": "Tipo de coincidencia",
  "Messages": "Mensajes",
  "Model parameters": "Parámetros del modelo",
  "Monthly limit": "Límite mensual",
  "Most frequently invoked tools in the selected period, ranked by total call count":
    "Herramientas invocadas con más frecuencia en el periodo seleccionado, clasificadas por número total de llamadas",
  "Multiple rule types": "Varios tipos de reglas",
  "Number of completion and embedding requests processed":
    "Número de solicitudes de completado e incrustación procesadas",
  "Number of distinct tools called": "Número de herramientas distintas invocadas",
  "OpenAI-compatible format": "Formato compatible con OpenAI",
  "Optional": "Opcional",
  "Optional system prompt prepended to all requests":
    "Prompt de sistema opcional que se antepone a todas las solicitudes",
  "Or search for any model...": "O busca cualquier modelo...",
  "Output appears here": "La salida aparece aquí",
  "PDF input": "Entrada PDF",
  "Per-key budgets and rate limits": "Presupuestos y límites de tasa por clave",
  "Percentage of tool calls that failed": "Porcentaje de invocaciones de herramientas fallidas",
  "PII replacement format": "Formato de reemplazo de PII",
  "PII scan on error": "Análisis de PII en caso de error",
  "POPULAR MODELS": "MODELOS POPULARES",
  "Prompt caching": "Almacenamiento en caché de prompts",
  "Prompt label": "Etiqueta del prompt",
  "Prompt not found.": "Prompt no encontrado.",
  "Prompt template": "Plantilla de prompt",
  "Prompts are reusable message templates": "Los prompts son plantillas de mensajes reutilizables",
  "Recent requests": "Solicitudes recientes",
  "Recent tool calls": "Invocaciones de herramientas recientes",
  "1 call": "1 invocación",
  "{count} calls": "{count} invocaciones",
  "{count} denied": "{count} denegadas",
  "Replacement text": "Texto de reemplazo",
  "Request body logging": "Registro del cuerpo de la solicitud",
  "Requires approval": "Requiere aprobación",
  "Response": "Respuesta",
  "Response caching": "Almacenamiento en caché de respuestas",
  "REST API": "REST API",
  "Risk detection settings": "Configuración de detección de riesgos",
  "Role-based access": "Acceso basado en roles",
  "Rule type": "Tipo de regla",
  "Runs on every request, zero latency": "Se ejecuta en cada solicitud, latencia cero",
  "Scan tool inputs before execution":
    "Analizar las entradas de la herramienta antes de la ejecución",
  "Scope rules to specific tools": "Limitar las reglas a herramientas específicas",
  "Search endpoints, models, users...": "Buscar endpoints, modelos, usuarios...",
  "Search guardrails...": "Buscar barreras de protección...",
  "Spend log cleanup": "Limpieza del registro de gastos",
  "Status: All": "Estado: Todos",
  "Suggested:": "Sugerido:",
  "System prompt": "Prompt del sistema",
  "Temperature": "Temperatura",
  "Tokens": "Tokens",
  "Tokens per request": "Tokens por solicitud",
  "Total Calls": "Total de llamadas",
  "Total requests": "Total de solicitudes",
  "Total spend across all endpoints for this period":
    "Gasto total en todos los endpoints durante este periodo",
  "Total tool invocations in the selected period":
    "Total de invocaciones de herramientas en el periodo seleccionado",
  "Traffic controls": "Controles de tráfico",
  "Unified proxy with governance controls": "Proxy unificado con controles de gobernanza",
  "Unique Tools": "Herramientas únicas",
  "Variables": "Variables",
  "Variables:": "Variables:",
  "VerifyWise AI gateway": "VerifyWise AI gateway",
  "Version A": "Versión A",
  "Version B": "Versión B",
  "Virtual key created": "Clave virtual creada",
  "What changed?": "¿Qué ha cambiado?",
  "Your app": "Tu aplicación",
  "No API keys configured. Add a provider API key to start creating endpoints.":
    "No hay claves de API configuradas. Añada una clave de API de proveedor para empezar a crear endpoints.",
  "No audit logs yet": "Aún no hay registros de auditoría",
  "No budget configured. All requests are allowed without cost limits.":
    "No hay presupuesto configurado. Se permiten todas las solicitudes sin límites de coste.",
  "No content filter rules configured. Add keyword or regex rules to block or mask prohibited content.":
    "No hay reglas de filtro de contenido configuradas. Añada reglas de palabras clave o expresiones regulares para bloquear o enmascarar el contenido prohibido.",
  "No detections in this period": "No hay detecciones en este periodo",
  "No differences found": "No se han encontrado diferencias",
  "No endpoint data": "No hay datos de endpoint",
  "No endpoints configured yet. Add your first LLM endpoint to start routing requests through the gateway.":
    "Aún no hay endpoints configurados. Añada su primer endpoint de LLM para empezar a redirigir solicitudes a través del gateway.",
  "No guardrail detections yet.": "Todavía no hay detecciones de barreras de protección.",
  "No MCP tools discovered yet. Tools will appear here after servers are connected and their tools are fetched.":
    "Aún no se han descubierto herramientas MCP. Las herramientas aparecerán aquí una vez que se conecten los servidores y se obtengan sus herramientas.",
  "No models match your filters.": "Ningún modelo coincide con tus filtros.",
  "No pending risk suggestions. Run detection or wait for the next scheduled check.":
    "No hay sugerencias de riesgo pendientes. Ejecute la detección o espere a la próxima comprobación programada.",
  "No PII detection rules configured. Add rules to automatically detect and protect personal data in AI requests.":
    "No hay reglas de detección de PII configuradas. Añada reglas para detectar y proteger automáticamente los datos personales en las solicitudes de IA.",
  "No prompts yet. Create your first prompt template to centralize and version-control system instructions.":
    "Aún no hay prompts. Cree su primera plantilla de prompt para centralizar y controlar las versiones de las instrucciones del sistema.",
  "No request logs yet. Send requests through the gateway to see detailed logs here.":
    "Aún no hay registros de solicitudes. Envíe solicitudes a través del gateway para ver aquí los registros detallados.",
  "No results matching the current filters.":
    "No hay resultados que coincidan con los filtros actuales.",
  "Add a provider API key for your gateway endpoints":
    "Añada una clave de API de proveedor para sus endpoints del gateway",
  "Block or mask content matching a keyword or regex pattern":
    "Bloquee o enmascare el contenido que coincida con una palabra clave o un patrón de expresión regular",
  "Block or mask detected PII": "Bloquear o enmascarar la PII detectada",
  "Compare message content and configuration between two versions.":
    "Compare el contenido del mensaje y la configuración entre dos versiones.",
  "Configure a new LLM provider endpoint": "Configurar un nuevo endpoint de proveedor de LLM",
  "Scan agent tool calls, MCP and native tools like Bash, for PII, prohibited content or prompt injection, then block or mask what matches.":
    "Analice las llamadas a herramientas de los agentes, MCP y herramientas nativas como Bash, en busca de PII, contenido prohibido o inyección de prompts y luego bloquee o enmascare las coincidencias.",
  "Configure LLM provider endpoints for your organization.":
    "Configure los endpoints de los proveedores de LLM para su organización.",
  "Configure monthly spending limits for the AI Gateway":
    "Configure los límites de gasto mensuales para el AI Gateway",
  "Configure parameters for your requests": "Configura los parámetros de tus solicitudes",
  "Configure PII detection and content filtering rules for your AI Gateway.":
    "Configure las reglas de detección de PII y de filtrado de contenido para su AI Gateway.",
  "Configure which personal data types to detect":
    "Configure qué tipos de datos personales detectar",
  "Create versioned prompt templates with variables and bind them to endpoints.":
    "Cree plantillas de prompt con versiones y variables, y vincúlelas a endpoints.",
  "Require approval on sensitive tools so a person reviews them before the agent runs them.":
    "Exige aprobación en las herramientas sensibles para que una persona las revise antes de que el agente las ejecute.",
  "Fine-tune how the model generates responses.":
    "Ajuste con precisión cómo genera respuestas el modelo.",
  "Generate an API key for developers to use the gateway":
    "Genere una clave de API para que los desarrolladores utilicen el gateway",
  "Generate an API key for developers to use the gateway with the OpenAI SDK.":
    "Genere una clave de API para que los desarrolladores utilicen el gateway con el OpenAI SDK.",
  "Generate API keys for developers to use the gateway from their code.":
    "Genere claves de API para que los desarrolladores utilicen el gateway desde su código.",
  "How to generate audit logs": "Cómo generar registros de auditoría",
  "Issue scoped API keys for AI agents to authenticate with MCP servers.":
    "Emita claves de API con alcance limitado para que los agentes de IA se autentiquen con los servidores MCP.",
  "Manage API keys, budget, and guardrail settings for the AI Gateway.":
    "Gestione las claves de API, el presupuesto y la configuración de las barreras de protección del AI Gateway.",
  "Manage tool risk levels": "Gestionar los niveles de riesgo de las herramientas",
  "Monitor costs and enforce budgets": "Supervisar costes y aplicar presupuestos",
  "Optionally describe what changed in this version.":
    "Si lo desea, describa qué ha cambiado en esta versión.",
  "Paste sample text to preview what your active guardrail rules would detect":
    "Pegue un texto de muestra para previsualizar lo que detectarían sus barreras de protección activas",
  "Every tool call your AI agents make, MCP tools and native tools like Bash, with outcome, latency and which agent.":
    "Cada llamada a herramienta que hacen sus agentes de IA, herramientas MCP y herramientas nativas como Bash, con el resultado, la latencia y qué agente.",
  "Run a test request through the gateway to complete setup":
    "Ejecute una solicitud de prueba a través del gateway para completar la configuración",
  "Select action": "Selecciona una acción",
  "Select an API key": "Selecciona una API key",
  "Select endpoint": "Selecciona un endpoint",
  "Select rule type": "Selecciona el tipo de regla",
  "Select scope": "Selecciona el alcance",
  "Select version": "Selecciona una versión",
  "Select versions and send a message": "Selecciona versiones y envía un mensaje",
  "Set up a new prompt template.": "Configura una nueva plantilla de prompt.",
  "Test your configured endpoints with an interactive chat interface.":
    "Pruebe sus endpoints configurados con una interfaz de chat interactiva.",
  "This will create a new risk in Risk Management pre-filled with the suggestion data.":
    "Esto creará un nuevo riesgo en Gestión de riesgos rellenado previamente con los datos de la sugerencia.",
  "Type a message to compare...": "Escribe un mensaje para comparar...",
  "Type a message...": "Escribe un mensaje...",
  "View and manage all discovered MCP tools across your servers.":
    "Vea y gestione todas las herramientas MCP descubiertas en sus servidores.",
  "View request, response, and guardrail detection logs for all AI Gateway traffic.":
    "Vea los registros de solicitudes, respuestas y detecciones de barreras de protección de todo el tráfico de AI Gateway.",
  "After adding a key, create endpoints in the Endpoints tab. Each endpoint uses one API key to authenticate with the LLM provider.":
    "Después de añadir una clave, cree endpoints en la pestaña Endpoints. Cada endpoint utiliza una clave de API para autenticarse con el proveedor del LLM.",
  "Apply guardrails globally or restrict them to specific MCP tools. For example, block PII only when invoking database-query tools.":
    "Aplique barreras de protección de forma global o restríjalas a herramientas MCP específicas. Por ejemplo, bloquee la PII solo al invocar herramientas de consulta de bases de datos.",
  "Choose from PII detection, content filtering, or prompt injection detection. Each rule can either block the request or mask matched content.":
    "Elija entre detección de PII, filtrado de contenido o detección de inyección de prompts. Cada regla puede bloquear la solicitud o enmascarar el contenido coincidente.",
  "Click a row to expand and see full request/response details":
    "Haga clic en una fila para expandirla y ver todos los detalles de la solicitud/respuesta",
  "Content filters execute in-process with no external API calls. Rules are evaluated before the request reaches the LLM provider.":
    "Los filtros de contenido se ejecutan en el propio proceso, sin llamadas a API externas. Las reglas se evalúan antes de que la solicitud llegue al proveedor del LLM.",
  "Error Rate": "Tasa de error",
  "Error behavior": "Comportamiento de error",
  "Every request through the gateway is logged with cost, tokens, and latency. Set a monthly budget to prevent unexpected cost overruns.":
    "Cada solicitud a través del gateway se registra con su coste, tokens y latencia. Establezca un presupuesto mensual para evitar sobrecostes inesperados.",
  "Make tool calls through the MCP Gateway using an agent key at POST /v1/mcp with the tools/call method.":
    "Realice llamadas a herramientas a través de MCP Gateway utilizando una clave de agente en POST /v1/mcp con el método tools/call.",
  "Max entries per org": "Máximo de entradas por organización",
  "Max tokens": "Tokens máximos",
  "No guardrail rules configured yet. Add rules to scan agent tool calls for PII, prohibited content, or prompt injection attempts.":
    "Aún no hay reglas de barreras de protección configuradas. Añada reglas para analizar las llamadas a herramientas de los agentes en busca de PII, contenido prohibido o intentos de inyección de prompts.",
  "Requests/day": "Solicitudes/día",
  "Top 10 tools by calls": "Las 10 herramientas principales por llamadas",
  "Top P": "Top P",
  "e.g. 4096": "p. ej. 4096",
  "e.g. Added few-shot examples for edge cases":
    "p. ej., Se añadieron ejemplos de few-shot para casos límite",
  "e.g. Customer support agent": "p. ej. Agente de atención al cliente",
  "e.g. greet": "p. ej. saludar",
  "e.g. production, staging, canary": "p. ej. production, staging, canary",
  "e.g., 100.00": "p. ej., 100.00",
  "e.g., 60": "p. ej., 60",
  "e.g., Already addressed, Not applicable": "p. ej., Ya abordado, No aplicable",
  "e.g., Backend production key": "p. ej., Clave de producción de backend",
  "e.g., Block PII in database queries": "p. ej., Bloquear PII en consultas a la base de datos",
  "e.g., Block competitor names": "p. ej., Bloquear nombres de competidores",
  "e.g., Block credit cards": "p. ej., Bloquear tarjetas de crédito",
  "e.g., Production GPT-4o": "p. ej., GPT-4o de producción",
  "e.g., Production OpenAI key": "p. ej., Clave de OpenAI de producción",
  "Last 24 hours": "Últimas 24 horas",
  "PII detection runs within your gateway infrastructure. No data is sent to external services for scanning. Supports email, phone, credit card, names, IBAN, Turkish TCKN, and more.":
    "La detección de PII se ejecuta dentro de la infraestructura de su gateway. No se envían datos a servicios externos para su análisis. Admite correo electrónico, teléfono, tarjeta de crédito, nombres, IBAN, TCKN turco y más.",
  "Block requests containing personal data, or mask it with placeholders (e.g., <EMAIL_ADDRESS>) before sending to the LLM. Input is scanned before the model sees it.":
    "Bloquee las solicitudes que contengan datos personales o enmascárelos con marcadores de posición (p. ej., <EMAIL_ADDRESS>) antes de enviarlos al LLM. La entrada se analiza antes de que el modelo la vea.",
  "Block specific words (exact match with word boundaries) or define custom regex patterns to catch formats like internal project codes, employee IDs, or confidential terms.":
    "Bloquee palabras específicas (coincidencia exacta con límites de palabra) o defina patrones de regex personalizados para detectar formatos como códigos internos de proyecto, identificadores de empleados o términos confidenciales.",
  "Add rule": "Añadir regla",
  "Remove rule": "Eliminar regla",
  "Block": "Bloquear",
  "Mask": "Enmascarar",
  "Keyword": "Palabra clave",
  "Regex pattern": "Patrón de expresión regular",
  "PII entities covered by this rule will no longer be detected or masked in LLM requests.":
    "Las entidades de PII cubiertas por esta regla dejarán de detectarse o enmascararse en las solicitudes al LLM.",
  "Content matching this filter pattern will no longer be blocked or masked.":
    "El contenido que coincida con este patrón de filtro dejará de bloquearse o enmascararse.",
  "You can re-enable this guardrail at any time from the catalog or by creating a new rule.":
    "Puede volver a habilitar esta barrera de protección en cualquier momento desde el catálogo o creando una nueva regla.",
  "Content safety": "Seguridad del contenido",
  "Prompt security": "Seguridad del prompt",
  "Data leakage prevention": "Prevención de fugas de datos",
  "No guardrails match your search.": "Ninguna barrera de protección coincide con tu búsqueda.",
  "Email addresses": "Direcciones de correo electrónico",
  "Phone numbers": "Números de teléfono",
  "Credit card numbers": "Números de tarjeta de crédito",
  "US Social Security numbers": "Números de la Seguridad Social de EE. UU.",
  "Person names": "Nombres de personas",
  "IBAN codes": "Códigos IBAN",
  "IP addresses": "Direcciones IP",
  "Physical locations": "Ubicaciones físicas",
  "Dates and times": "Fechas y horas",
  "Medical license numbers": "Números de licencia médica",
  "Nationality, religion, politics": "Nacionalidad, religión, política",
  "EU phone numbers": "Números de teléfono de la UE",
  "Turkish identity numbers": "Números de identidad turcos",
  "Profanity filter": "Filtro de lenguaje soez",
  "Hate speech and slurs": "Discurso de odio e insultos",
  "Violence instructions": "Instrucciones de violencia",
  "Self-harm content": "Contenido de autolesión",
  "Prompt injection (basic)": "Inyección de prompts (básica)",
  "Jailbreak attempts": "Intentos de jailbreak",
  "System prompt extraction": "Extracción del prompt del sistema",
  "Instruction override": "Anulación de instrucciones",
  "API keys and tokens": "API keys y tokens",
  "AWS credentials": "Credenciales de AWS",
  "Private keys": "Claves privadas",
  "Database connection strings": "Cadenas de conexión a la base de datos",
  "Internal URLs": "URL internas",
  "Environment variables": "Variables de entorno",
  "GDPR personal data (all)": "Datos personales de GDPR (todos)",
  "HIPAA protected health info": "Información sanitaria protegida por HIPAA",
  "PCI DSS cardholder data": "Datos del titular de tarjeta de PCI DSS",
  "SOC 2 sensitive data": "Datos sensibles de SOC 2",
  "Detect and protect email addresses in prompts.":
    "Detecte y proteja las direcciones de correo electrónico en los prompts.",
  "Detect phone numbers including international formats.":
    "Detecte números de teléfono, incluidos los formatos internacionales.",
  "Detect Visa, Mastercard, Amex, and other card formats.":
    "Detecte Visa, Mastercard, Amex y otros formatos de tarjeta.",
  "Detect US SSN formats (XXX-XX-XXXX).": "Detecta formatos de SSN de EE. UU. (XXX-XX-XXXX).",
  "Detect personal names in text.": "Detecta nombres de personas en el texto.",
  "Detect International Bank Account Numbers.": "Detecta números de cuenta bancaria internacional.",
  "Detect IPv4 and IPv6 addresses.": "Detecta direcciones IPv4 e IPv6.",
  "Detect addresses, cities, and location references.":
    "Detecte direcciones, ciudades y referencias de ubicación.",
  "Detect date of birth and other date/time references.":
    "Detecte fechas de nacimiento y otras referencias de fecha/hora.",
  "Detect medical license and DEA numbers.": "Detecta números de licencia médica y DEA.",
  "Detect references to nationality, religious, or political affiliation.":
    "Detecte referencias a la nacionalidad o a la afiliación religiosa o política.",
  "Detect European phone number formats.": "Detecta formatos de números de teléfono europeos.",
  "Detect Turkish national identity (TCKN) numbers.":
    "Detecte números de identidad nacional turca (TCKN).",
  "Block common profane and offensive words across 10+ terms.":
    "Bloquee palabras malsonantes y ofensivas habituales en más de 10 términos.",
  "Block racial, ethnic, and identity-based slurs.":
    "Bloquee insultos raciales, étnicos y basados en la identidad.",
  "Block requests for instructions on causing physical harm.":
    "Bloquee las solicitudes de instrucciones para causar daño físico.",
  "Block content related to self-harm or suicide instructions.":
    "Bloquee el contenido relacionado con la autolesión o las instrucciones de suicidio.",
  "Detect common prompt injection patterns that attempt to override system instructions.":
    "Detecte patrones habituales de inyección de prompts que intentan anular las instrucciones del sistema.",
  "Detect DAN-style jailbreak patterns and role override attempts.":
    "Detecte patrones de jailbreak de estilo DAN e intentos de anulación de roles.",
  "Block attempts to extract the system prompt or internal instructions.":
    "Bloquee los intentos de extraer el prompt del sistema o las instrucciones internas.",
  "Block attempts to override safety guidelines or role-play as unrestricted.":
    "Bloquee los intentos de anular las directrices de seguridad o de adoptar un rol sin restricciones.",
  "Detect API keys, bearer tokens, and secret keys in prompts.":
    "Detecte claves de API, tokens de portador y claves secretas en los prompts.",
  "Detect AWS access keys and secret keys.": "Detectar claves de acceso y claves secretas de AWS.",
  "Detect SSH, RSA, and other private key blocks.":
    "Detecte bloques de claves privadas SSH, RSA y otras.",
  "Detect database URLs and connection strings.":
    "Detecte URL de bases de datos y cadenas de conexión.",
  "Detect references to internal/private network URLs.":
    "Detecte referencias a URL de redes internas/privadas.",
  "Detect environment variable assignments with secrets.":
    "Detecte asignaciones de variables de entorno con secretos.",
  "Detect all GDPR-relevant personal data: email, phone, name, location, DOB, IP, nationality.":
    "Detecte todos los datos personales relevantes para el GDPR: correo electrónico, teléfono, nombre, ubicación, fecha de nacimiento, IP, nacionalidad.",
  "Detect PHI identifiers: names, dates, SSNs, medical licenses, phone, email.":
    "Detecte identificadores de PHI: nombres, fechas, números de la seguridad social, licencias médicas, teléfono, correo electrónico.",
  "Block credit card numbers and IBANs per PCI DSS requirements.":
    "Bloquee los números de tarjeta de crédito y los IBAN según los requisitos de PCI DSS.",
  "Block API keys, private keys, connection strings, and credentials.":
    "Bloquee claves de API, claves privadas, cadenas de conexión y credenciales.",
  "Phone number": "Número de teléfono",
  "Credit card": "Tarjeta de crédito",
  "Person name": "Nombre de persona",
  "IBAN": "IBAN",
  "Turkish TCKN": "TCKN turco",
  "EU phone number": "Número de teléfono de la UE",
  "US SSN": "SSN de EE. UU.",
  "IP address": "Dirección IP",
  "Date/time": "Fecha/hora",
  "Nationality/religion/politics": "Nacionalidad/religión/política",
  "Medical license": "Licencia médica",
  "Select up to 5 models to compare side by side.":
    "Seleccione hasta 5 modelos para compararlos en paralelo.",
  "Search and select models above to compare features side by side.":
    "Busque y seleccione modelos arriba para comparar sus características en paralelo.",
  "Visualize your LLM traffic": "Visualiza tu tráfico de LLM",
  "Make your first request to see a real-time map of your model connections":
    "Realice su primera solicitud para ver un mapa en tiempo real de las conexiones de sus modelos",
  "Add a provider API key": "Añadir una clave de API de proveedor",
  "Create an endpoint": "Crear un endpoint",
  "Create a virtual key": "Crear una clave virtual",
  "No API keys configured": "No hay claves de API configuradas",
  "Go to the Settings tab in the sidebar and add your provider API key (OpenAI, Anthropic, etc.). Once added, come back here to create your first endpoint.":
    "Vaya a la pestaña Configuración de la barra lateral y añada la clave de API de su proveedor (OpenAI, Anthropic, etc.). Una vez añadida, vuelva aquí para crear su primer endpoint.",
  "Agent key": "Clave de agente",
  "All tools": "Todas las herramientas",
  "Arguments": "Argumentos",
  "Delete guardrail": "Eliminar barrera de protección",
  "Edit guardrail": "Editar barrera de protección",
  "Edit tool": "Editar herramienta",
  "MCP servers": "Servidores MCP",
  "MCP tools": "Herramientas MCP",
  "Require approval": "Aprobación requerida",
  "No result captured (older adapter, or the tool did not report back).":
    "No se capturó ningún resultado (adaptador antiguo o la herramienta no respondió).",
  "By endpoint": "Por endpoint",
  "CORS is disabled on gateway routes. Use virtual keys from backend services only.":
    "CORS está deshabilitado en las rutas de la puerta de enlace. Utilice claves virtuales únicamente desde servicios backend.",
  "Comma-separated tool names. Leave empty to apply to all MCP tools.":
    "Nombres de herramientas separados por comas. Déjelo vacío para aplicarlo a todas las herramientas MCP.",
  "Create at least one endpoint before generating virtual keys.":
    "Cree al menos un endpoint antes de generar claves virtuales.",
  "Endpoint slug:": "Slug del endpoint:",
  "Every guardrail detection across all endpoints, newest first. A request with several matches has one row for each.":
    "Cada detección de barreras de protección en todos los endpoints, de la más reciente a la más antigua. Una solicitud con varias coincidencias tiene una fila por cada una.",
  "Live updates": "Actualizaciones en directo",
  "Lower values are more focused, higher values are more creative":
    "Los valores más bajos son más enfocados, los más altos son más creativos",
  "No API keys available. Complete step 1 first.":
    "No hay claves de API disponibles. Complete primero el paso 1.",
  "No API keys available. Go to Settings to add one first.":
    "No hay claves de API disponibles. Vaya a Configuración para añadir una primero.",
  "No endpoints configured": "No hay endpoints configurados",
  "No tools match the selected filters.":
    "Ninguna herramienta coincide con los filtros seleccionados.",
  "No versions yet": "Aún no hay versiones",
  "Optional JSON configuration for advanced rule settings.":
    "Configuración JSON opcional para los ajustes avanzados de las reglas.",
  "Prompt:": "Prompt:",
  "Reject requests when budget is exceeded": "Rechazar solicitudes cuando se supere el presupuesto",
  "Request": "Solicitud",
  "Setup required": "Configuración requerida",
  "Slug:": "Slug:",
  "This key will not be shown again. Store it securely.":
    "Esta clave no se volverá a mostrar. Guárdela de forma segura.",
  "This key won't be shown again. Store it securely.":
    "Esta clave no se volverá a mostrar. Guárdela de forma segura.",
  "Top detections": "Principales detecciones",
  "View all guardrail logs": "Ver todos los registros de barreras de protección",
  "When enabled, tool invocations must be approved before execution.":
    "Cuando está activado, las invocaciones de herramientas deben aprobarse antes de su ejecución.",
  "You can re-create this guardrail at any time.":
    "Puede volver a crear esta barrera de protección en cualquier momento.",
  "All modes": "Todos los modos",
  "All providers": "Todos los proveedores",
  "All risk levels": "Todos los niveles de riesgo",
  "All servers": "Todos los servidores",
  "Allow request (fail-open)": "Permitir la solicitud (fallo abierto)",
  "Audio transcription": "Transcripción de audio",
  "Block request (fail-closed)": "Bloquear la solicitud (fallo cerrado)",
  "Chat": "Chat",
  "Embedding": "Embedding",
  "Flags active endpoints with zero requests, which increase the attack surface unnecessarily.":
    "Señala los endpoints activos sin solicitudes, que aumentan innecesariamente la superficie de ataque.",
  "Flags when monthly AI Gateway spend approaches the configured budget limit.":
    "Señala cuando el gasto mensual del AI Gateway se acerca al límite de presupuesto configurado.",
  "Flags when most of the spend is concentrated on a single LLM provider, increasing vendor risk.":
    "Señala cuando la mayor parte del gasto se concentra en un único proveedor de LLM, lo que aumenta el riesgo de proveedor.",
  "Flags when the 24-hour error rate exceeds a multiple of the 7-day average, indicating provider issues.":
    "Señala cuando la tasa de errores de 24 horas supera un múltiplo de la media de 7 días, lo que indica problemas del proveedor.",
  "Flags when users send personal data (names, emails, SSNs) to LLM providers above a threshold.":
    "Señala cuando los usuarios envían datos personales (nombres, correos electrónicos, números de la seguridad social) a los proveedores de LLM por encima de un umbral.",
  "Google Gemini": "Google Gemini",
  "Guardrail logs": "Registros de barreras de protección",
  "Image generation": "Generación de imágenes",
  "Last 14 days": "Últimos 14 días",
  "Max input tokens": "Máximo de tokens de entrada",
  "Max output tokens": "Máximo de tokens de salida",
  "No response body": "Sin cuerpo de respuesta",
  "Parallel tools": "Herramientas en paralelo",
  "Rate limited": "Limitado por tasa",
  "Request logs": "Registros de solicitudes",
  "Response schema": "Esquema de respuesta",
  "Run": "Ejecución",
  "Showing the most recent 50 runs.": "Mostrando las 50 ejecuciones más recientes.",
  "Reconstruct a full agent turn: the model calls (the conversation) and tool calls (the actions) correlated into one run.":
    "Reconstruye un turno completo del agente: las llamadas al modelo (la conversación) y las llamadas a herramientas (las acciones) agrupadas en una sola ejecución.",
  "Runs appear when an agent sends the same run id (header":
    "Las ejecuciones aparecen cuando un agente envía el mismo id de ejecución (encabezado",
  "Select an endpoint first.": "Selecciona primero un endpoint.",
  "Source: All": "Origen: Todos",
  "Source: Playground": "Origen: Playground",
  "Source: Virtual key": "Origen: Clave virtual",
  "Started": "Iniciado",
  "Status: Error": "Estado: Error",
  "Status: Success": "Estado: Correcto",
  "System messages": "Mensajes del sistema",
  "Tool calls": "Llamadas a herramientas",
  "Tool input": "Entrada de la herramienta",
  "By {name} · {date}": "Por {name} · {date}",
  "Click Save draft to create your first version.":
    "Haga clic en Guardar borrador para crear su primera versión.",
  "Could not load this run.": "No se pudo cargar esta ejecución.",
  "Create your first version": "Crear su primera versión",
  "Failed to load invocation details.": "No se pudieron cargar los detalles de la invocación.",
  "Refresh": "Actualizar",
  "Select a log to view details.": "Seleccione un registro para ver los detalles.",
  "{name} (inactive)": "{name} (inactivo)",
  "#{id} (not found)": "#{id} (no encontrado)",
  "No endpoints": "Sin endpoints",
  "Sample text must be at most {max} characters":
    "El texto de ejemplo no puede superar los {max} caracteres",
  "{count} logs deleted": "{count} registros eliminados",
  "Permanently delete guardrail logs older than {days} days?":
    "¿Eliminar permanentemente los registros de guardrails con más de {days} días?",
  "How long to keep guardrail detection logs and spend logs. Guardrail logs record every blocked or masked request for compliance auditing (EU AI Act Art. 12).":
    "Cuánto tiempo se conservan los registros de detección de guardrails y los registros de gasto. Los registros de guardrails recogen cada solicitud bloqueada o enmascarada para la auditoría de cumplimiento (Reglamento de IA de la UE, art. 12).",
  "When on, logs older than their retention period are deleted every day. When off, logs are kept until you purge them.":
    "Si está activado, los registros más antiguos que su periodo de retención se eliminan cada día. Si está desactivado, los registros se conservan hasta que los purgues.",
  "Spend log retention (days)": "Retención de registros de gasto (días)",
  "Purge logs": "Purgar registros",
  "This cannot be undone. The saved retention period is used, so save any change to it first.":
    "Esta acción no se puede deshacer. Se usa el periodo de retención guardado, así que guarda primero cualquier cambio.",
  "Delete old spend log entries based on the spend log retention period above.":
    "Eliminar las entradas antiguas del registro de gasto según el periodo de retención de registros de gasto indicado arriba.",
  "Retention periods must be whole numbers from {min} to {max} days":
    "Los periodos de retención deben ser números enteros de {min} a {max} días",
  "Confirm automatic deletion": "Confirmar la eliminación automática",
  "Failed to purge logs": "No se pudieron purgar los registros",
  "Delete automatically": "Eliminar automáticamente",
  "This setting applies to both AI Gateway log types.":
    "Este ajuste se aplica a ambos tipos de registros del AI Gateway.",
  "Delete records": "Eliminar registros",
  "Failed to save settings": "No se pudo guardar la configuración",
};
