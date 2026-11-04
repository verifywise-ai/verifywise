// shadowAi strings for de, fr and es. English is the key.
// Spread into ../translations.ts. Other areas stay in that file for now.

export const de: Record<string, string> = {
  "Promote to AI app": "Zu KI-App hochstufen",
  "departments": "Abteilungen",
  "Departments (comma-separated)": "Abteilungen (kommagetrennt)",
  "Version (optional)": "Version (optional)",
  "Connect data sources": "Datenquellen verbinden",
  "Create alert rule": "Benachrichtigungsregel erstellen",
  "Create rule": "Regel erstellen",
  "Start governance": "Governance starten",
  "Accessed tools with highest risk": "Genutzte Tools mit höchstem Risiko",
  "AI tool details": "KI-Tool-Details",
  "AI users": "KI-Nutzer",
  "AI users by department": "KI-Nutzer nach Abteilung",
  "Brief risk description": "Kurze Risikobeschreibung",
  "Categorize and govern": "Kategorisieren und steuern",
  "Common rules to start with": "Gängige Regeln für den Einstieg",
  "Cooldown period": "Abklingzeit",
  "Department-level insights": "Erkenntnisse auf Abteilungsebene",
  "Event count threshold": "Schwellenwert für Ereignisanzahl",
  "First detected": "Zuerst erkannt",
  "Governed": "Gesteuert",
  "Highest risk tool": "Tool mit höchstem Risiko",
  "Last seen": "Zuletzt gesehen",
  "Minimum risk score": "Minimale Risikobewertung",
  "Most accessed tools by events": "Am häufigsten genutzte Tools nach Ereignissen",
  "Most accessed tools by users": "Am häufigsten genutzte Tools nach Benutzern",
  "Most active department": "Aktivste Abteilung",
  "Risk score calculation": "Berechnung der Risikobewertung",
  "Find high-risk usage": "Risikoreiche Nutzung finden",
  "Syslog sources": "Syslog-Quellen",
  "Total events": "Ereignisse insgesamt",
  "Total prompts": "Prompts insgesamt",
  "Total users": "Benutzer insgesamt",
  "Trigger type": "Auslösertyp",
  "Trigger-based alerts": "Auslöserbasierte Benachrichtigungen",
  "Unique apps": "Eindeutige Apps",
  "What gets tracked?": "Was wird verfolgt?",
  "No AI tools detected yet. Connect a data source to monitor AI tool usage.":
    "Noch keine KI-Tools erkannt. Verbinden Sie eine Datenquelle, um die Nutzung von KI-Tools zu überwachen.",
  "No alerts have been triggered yet.": "Noch keine Benachrichtigungen ausgelöst.",
  "No rules configured yet. Create rules to automate alerts and enforce AI usage policies.":
    "Noch keine Regeln konfiguriert. Erstellen Sie Regeln, um Benachrichtigungen zu automatisieren und KI-Nutzungsrichtlinien durchzusetzen.",
  "No AI tool activity in the last 30 days. Activity appears here once a log source sends traffic that matches an AI tool.":
    "Keine KI-Tool-Aktivität in den letzten 30 Tagen. Aktivität erscheint hier, sobald eine Protokollquelle Datenverkehr sendet, der einem KI-Tool zugeordnet wird.",
  "Send proxy or firewall logs through the REST API or syslog (Settings). Traffic to known AI tools appears here.":
    "Senden Sie Proxy- oder Firewall-Protokolle über die REST-API oder Syslog (Einstellungen). Datenverkehr zu bekannten KI-Tools erscheint hier.",
  "Each tool gets a risk score from 0 to 100, recalculated nightly. Review the highest scores first.":
    "Jedes Tool erhält eine Risikobewertung von 0 bis 100, die jede Nacht neu berechnet wird. Prüfen Sie die höchsten Werte zuerst.",
  "Identify unauthorized tools": "Unautorisierte Tools identifizieren",
  "Risk scores show which users and departments use the riskiest AI tools.":
    "Risikobewertungen zeigen, welche Benutzer und Abteilungen die riskantesten KI-Tools nutzen.",
  "Get notified": "Benachrichtigt werden",
  'Turn on "Notify me" to get an in-app notification and an email when the rule fires. Every alert is also kept in the alert history.':
    "Aktivieren Sie „Mich benachrichtigen“, um eine In-App-Benachrichtigung und eine E-Mail zu erhalten, wenn die Regel auslöst. Jede Benachrichtigung wird außerdem im Benachrichtigungsverlauf gespeichert.",
  "See which departments have the highest AI tool usage. Identify teams that may need governance training or tool approvals.":
    "Erkennen, welche Abteilungen die höchste Nutzung von KI-Tools haben. Teams identifizieren, die möglicherweise Governance-Schulungen oder Tool-Genehmigungen benötigen.",
  "Select sensitivity level": "Sensitivitätsstufe auswählen",
  "Prompts and events per user and AI tool, grouped by the department your log source sends.":
    "Prompts und Ereignisse pro Benutzer und KI-Tool, gruppiert nach der Abteilung, die Ihre Protokollquelle sendet.",
  "Alert on any new AI tool, on use by Finance, Legal or HR, and on tools with a risk score of 70 or more.":
    "Benachrichtigen Sie bei jedem neuen KI-Tool, bei Nutzung durch Finanzen, Recht oder Personal und bei Tools mit einer Risikobewertung von 70 oder mehr.",
  "Give each tool a status, such as approved, under review or blocked, or start governance to add it to the model inventory.":
    "Geben Sie jedem Tool einen Status, etwa genehmigt, in Prüfung oder blockiert, oder starten Sie die Governance, um es in das Modellinventar aufzunehmen.",
  "Data formats": "Datenformate",
  "Manage API keys for the REST API and syslog sources for proxy and firewall logs, and set the rate limit and data retention for Shadow AI.":
    "API-Schlüssel für die REST-API und Syslog-Quellen für Proxy- und Firewall-Protokolle verwalten sowie Ratenbegrenzung und Datenaufbewahrung für Schatten-KI festlegen.",
  "Overview of Shadow AI activity across your organization. See summary metrics, top tools by usage, risk rankings, and department breakdown at a glance.":
    "Übersicht der Schatten-KI-Aktivität in Ihrer Organisation. Zusammenfassende Kennzahlen, meistgenutzte Tools, Risiko-Rankings und Abteilungsaufschlüsselung auf einen Blick sehen.",
  "Fire an alert on a new tool, a usage threshold, a sensitive department, a blocked attempt, a high risk score or a new user.":
    "Lösen Sie eine Benachrichtigung aus bei einem neuen Tool, einem Nutzungsschwellenwert, einer sensiblen Abteilung, einem blockierten Zugriffsversuch, einer hohen Risikobewertung oder einem neuen Benutzer.",
  "e.g., 100": "z. B. 100",
  "e.g., 4.0": "z. B. 4.0",
  "e.g., 70": "z. B. 70",
  "e.g., Alert on new AI tools": "z. B. Benachrichtigung bei neuen KI-Tools",
  "e.g., ChatGPT": "z. B. ChatGPT",
  "e.g., Finance, Legal, HR": "z. B. Finanzen, Rechtsabteilung, HR",
  "e.g., OpenAI": "z. B. OpenAI",
  "Trigger": "Auslöser",
  "Monitor individual user and department-level AI tool usage across your organization. Track prompts, identify high-risk users, and review activity by department.":
    "Überwachen Sie die Nutzung von KI-Tools auf Benutzer- und Abteilungsebene in Ihrer gesamten Organisation. Verfolgen Sie Prompts, identifizieren Sie Hochrisiko-Benutzer und prüfen Sie die Aktivität nach Abteilung.",
  "View and manage all AI tools detected in your organization's network traffic. Review risk scores, update tool statuses, and start formal governance for any discovered tool.":
    "Sehen und verwalten Sie alle in Ihrem Netzwerkverkehr erkannten KI-Tools. Prüfen Sie Risikobewertungen, aktualisieren Sie Tool-Status und starten Sie die formelle Governance für jedes entdeckte Tool.",
  "Configure alert rules to get notified about Shadow AI activity. Set triggers for new tool detection, usage thresholds, sensitive department usage, and more.":
    "Konfigurieren Sie Alarmregeln, um über Schatten-KI-Aktivität benachrichtigt zu werden. Legen Sie Auslöser für neu erkannte Tools, Nutzungsschwellen, Nutzung in sensiblen Abteilungen und mehr fest.",
  "API key created successfully": "API-Schlüssel erfolgreich erstellt",
  "Automatically create a lifecycle entry for this model":
    "Automatisch einen Lebenszykluseintrag für dieses Modell erstellen",
  "Copy this key now. You won't be able to see it again.":
    "Kopieren Sie diesen Schlüssel jetzt. Sie können ihn nicht mehr einsehen.",
  "Field mapping": "Feldzuordnung",
  "Go to AI tools": "Zu KI-Tools",
  "Governance owner": "Governance-Verantwortlicher",
  "How each parser maps source fields to the normalized event schema:":
    "Wie jeder Parser Quellfelder auf das normalisierte Ereignisschema abbildet:",
  "No API keys created yet": "Noch keine API-Schlüssel erstellt",
  "No data available for this period": "Keine Daten für diesen Zeitraum verfügbar",
  "No rate limit applied": "Keine Ratenbegrenzung angewendet",
  "No syslog sources configured": "Keine Syslog-Quellen konfiguriert",
  "No tool usage recorded": "Keine Tool-Nutzung aufgezeichnet",
  "POST /api/v1/shadow-ai/events": "POST /api/v1/shadow-ai/events",
  "REST API event schema": "REST-API-Ereignisschema",
  "Risk assessment (optional)": "Risikobewertung (optional)",
  "Start lifecycle review": "Lebenszyklus-Überprüfung starten",
  "Syslog format examples": "Syslog-Formatbeispiele",
  "This will stop processing events from this source.":
    "Dies stoppt die Verarbeitung von Ereignissen aus dieser Quelle.",
  "User not found": "Benutzer nicht gefunden",
  "View full integration guide": "Vollständigen Integrationsleitfaden anzeigen",
  "View integration guide": "Integrationsleitfaden anzeigen",
  "View setup instructions": "Einrichtungsanweisungen anzeigen",
  "X-API-Key": "X-API-Key",
  "AI usage aggregated by department": "KI-Nutzung aggregiert nach Abteilung",
  "Configure alerts for Shadow AI activity": "Warnungen für Shadow-AI-Aktivität konfigurieren",
  "Detected": "Erkannt",
  "Failed to start governance.": "Starten der Governance fehlgeschlagen.",
  "Failed to update rule": "Aktualisieren der Regel fehlgeschlagen",
  "Fired at": "Ausgelöst um",
  "Individual user AI tool usage and risk scores":
    "Einzelne KI-Tool-Nutzung und Risikobewertungen pro Nutzer",
  "Past alerts triggered by your rules":
    "Vergangene Warnungen, die durch Ihre Regeln ausgelöst wurden",
  "Recent tools": "Aktuelle Tools",
  "Rule": "Regel",
  "Rule created successfully": "Regel erfolgreich erstellt",
  "Rule deleted successfully": "Regel erfolgreich gelöscht",
  "Rules & alerts": "Regeln & Warnungen",
  "This action cannot be undone. All alert history for this rule will be preserved.":
    "Diese Aktion kann nicht rückgängig gemacht werden. Der gesamte Warnungsverlauf für diese Regel wird beibehalten.",
  "This action cannot be undone. Any integrations using this key will stop working.":
    "Diese Aktion kann nicht rückgängig gemacht werden. Alle Integrationen, die diesen Schlüssel verwenden, funktionieren nicht mehr.",
  "This will permanently remove this API key record. This action cannot be undone.":
    "Dies entfernt diesen API-Schlüssel-Datensatz dauerhaft. Diese Aktion kann nicht rückgängig gemacht werden.",
  "Top tool": "Top-Tool",
  "e.g., 203.0.113.7": "z. B. 203.0.113.7",
  "In IP-only mode, log lines without a key are matched by this IP.":
    "Im Nur-IP-Modus werden Logzeilen ohne Schlüssel über diese IP zugeordnet.",
  "Could not copy. Select the key and copy it by hand.":
    "Kopieren nicht möglich. Markieren Sie den Schlüssel und kopieren Sie ihn manuell.",
  'Remove "{name}"?': "„{name}“ entfernen?",
  // Shadow AI syslog sources
  "Allowed sender IP (optional)": "Zulässige Absender-IP (optional)",
  "Allowed sender IP": "Zulässige Absender-IP",
  "Last received": "Zuletzt empfangen",
  "Dropped": "Verworfen",
  "Last drop reason": "Letzter Verwerfungsgrund",
  "Parser": "Parser",
  "No key yet": "Noch kein Schlüssel",
  "Generate key": "Schlüssel erzeugen",
  "Regenerate key": "Schlüssel neu erzeugen",
  "Not an IP address. Clear it or enter the sender's IP.":
    "Keine IP-Adresse. Leeren Sie das Feld oder geben Sie die IP des Absenders ein.",
  "No user email in the log line": "Keine Benutzer-E-Mail in der Logzeile",
  "No destination host in the log line": "Kein Zielhost in der Logzeile",
  "Line does not match the parser type": "Die Zeile passt nicht zum Parser-Typ",
  "Sent from an IP that isn't allowed or is shared with another source":
    "Von einer IP gesendet, die nicht zulässig ist oder mit einer anderen Quelle geteilt wird",
  "Over the hourly event limit": "Stündliches Ereignislimit überschritten",
  "Unknown reason": "Unbekannter Grund",
  "Syslog listener failed to start. Check the server log.":
    "Der Syslog-Listener konnte nicht starten. Prüfen Sie das Server-Log.",
  "Syslog listener is off. Set SHADOW_AI_SYSLOG_ENABLED=true on the server to turn it on.":
    "Der Syslog-Listener ist aus. Setzen Sie SHADOW_AI_SYSLOG_ENABLED=true auf dem Server, um ihn einzuschalten.",
  "Syslog listener is on. Send to {host}:{port} over TLS.":
    "Der Syslog-Listener ist an. Senden Sie per TLS an {host}:{port}.",
  "Syslog listener is on. Send to {host}:{port} over plain TCP.":
    "Der Syslog-Listener ist an. Senden Sie per einfachem TCP an {host}:{port}.",
  "Enter an IPv4 or IPv6 address.": "Geben Sie eine IPv4- oder IPv6-Adresse ein.",
  "Could not add the source. Try again.":
    "Die Quelle konnte nicht hinzugefügt werden. Versuchen Sie es erneut.",
  "Could not save the source. Try again.":
    "Die Quelle konnte nicht gespeichert werden. Versuchen Sie es erneut.",
  "Could not remove the source. Try again.":
    "Die Quelle konnte nicht entfernt werden. Versuchen Sie es erneut.",
  "Could not generate a key. Try again.":
    "Der Schlüssel konnte nicht erzeugt werden. Versuchen Sie es erneut.",
  "Your source key": "Ihr Quellenschlüssel",
  "Add this to the start or end of each line in the sender's log format":
    "Fügen Sie dies am Anfang oder Ende jeder Zeile im Logformat des Absenders hinzu",
  "Copy log format line": "Logformat-Zeile kopieren",
  "Regenerate key for {name}?": "Schlüssel für {name} neu erzeugen?",
  "The current key stops working within a minute. Update every sender that uses it.":
    "Der aktuelle Schlüssel funktioniert innerhalb einer Minute nicht mehr. Aktualisieren Sie jeden Absender, der ihn verwendet.",
  "Edit source": "Quelle bearbeiten",
  "Remove source": "Quelle entfernen",
  "Highest risk score (0–100) among the AI tools this user accessed. Tool scores are recalculated nightly.":
    "Höchste Risikobewertung (0–100) unter den KI-Tools, auf die dieser Benutzer zugegriffen hat. Tool-Bewertungen werden jede Nacht neu berechnet.",
  "Highest risk score (0–100) among the AI tools this department accessed. Tool scores are recalculated nightly.":
    "Höchste Risikobewertung (0–100) unter den KI-Tools, auf die diese Abteilung zugegriffen hat. Tool-Bewertungen werden jede Nacht neu berechnet.",
  "API keys authenticate events sent to the REST API from a SIEM, script or browser extension. Syslog sources use their own keys.":
    "API-Schlüssel authentifizieren Ereignisse, die von einem SIEM, einem Skript oder einer Browsererweiterung an die REST-API gesendet werden. Syslog-Quellen verwenden eigene Schlüssel.",
  '"blocked" if the proxy refused the request. Any other value is stored as "allowed"':
    '"blocked", wenn der Proxy die Anfrage abgelehnt hat. Jeder andere Wert wird als "allowed" gespeichert',
  'Every line must start or end with vw_source=<key>, using its syslog source\'s key. A Netskope JSON object can carry it as a top-level "vw_source" member instead. An RFC 3164 or RFC 5424 header is removed before parsing. One example line per parser:':
    'Jede Zeile muss mit vw_source=<key> beginnen oder enden, mit dem Schlüssel ihrer Syslog-Quelle. Ein Netskope-JSON-Objekt kann ihn stattdessen als Mitglied "vw_source" auf oberster Ebene enthalten. Ein RFC-3164- oder RFC-5424-Header wird vor dem Parsen entfernt. Eine Beispielzeile pro Parser:',
};

export const fr: Record<string, string> = {
  "Promote to AI app": "Promouvoir en application IA",
  "departments": "départements",
  "Departments (comma-separated)": "Départements (séparés par des virgules)",
  "Version (optional)": "Version (optionnelle)",
  "Connect data sources": "Connecter les sources de données",
  "Create alert rule": "Créer une règle d'alerte",
  "Create rule": "Créer une règle",
  "Start governance": "Démarrer la gouvernance",
  "Accessed tools with highest risk": "Outils consultés au risque le plus élevé",
  "AI tool details": "Détails de l'outil IA",
  "AI users": "Utilisateurs IA",
  "AI users by department": "Utilisateurs IA par département",
  "Brief risk description": "Brève description du risque",
  "Categorize and govern": "Catégoriser et gouverner",
  "Common rules to start with": "Règles courantes pour commencer",
  "Cooldown period": "Période de pause",
  "Department-level insights": "Informations au niveau du département",
  "Event count threshold": "Seuil de nombre d'événements",
  "First detected": "Première détection",
  "Governed": "Gouverné",
  "Highest risk tool": "Outil au risque le plus élevé",
  "Last seen": "Vu pour la dernière fois",
  "Minimum risk score": "Score de risque minimum",
  "Most accessed tools by events": "Outils les plus consultés par événements",
  "Most accessed tools by users": "Outils les plus consultés par utilisateurs",
  "Most active department": "Département le plus actif",
  "Risk score calculation": "Calcul du score de risque",
  "Find high-risk usage": "Repérer les usages à risque",
  "Syslog sources": "Sources syslog",
  "Total events": "Événements au total",
  "Total prompts": "Prompts au total",
  "Total users": "Utilisateurs au total",
  "Trigger type": "Type de déclencheur",
  "Trigger-based alerts": "Alertes basées sur des déclencheurs",
  "Unique apps": "Applications uniques",
  "What gets tracked?": "Qu'est-ce qui est suivi ?",
  "No AI tools detected yet. Connect a data source to monitor AI tool usage.":
    "Aucun outil IA détecté pour le moment. Connectez une source de données pour surveiller l'utilisation des outils IA.",
  "No alerts have been triggered yet.": "Aucune alerte n'a encore été déclenchée.",
  "No rules configured yet. Create rules to automate alerts and enforce AI usage policies.":
    "Aucune règle configurée pour le moment. Créez des règles pour automatiser les alertes et faire appliquer les politiques d'usage IA.",
  "No AI tool activity in the last 30 days. Activity appears here once a log source sends traffic that matches an AI tool.":
    "Aucune activité d'outil IA au cours des 30 derniers jours. L'activité apparaît ici dès qu'une source de journaux envoie du trafic correspondant à un outil IA.",
  "Send proxy or firewall logs through the REST API or syslog (Settings). Traffic to known AI tools appears here.":
    "Envoyez les journaux de proxy ou de pare-feu via l'API REST ou syslog (Paramètres). Le trafic vers les outils IA connus apparaît ici.",
  "Each tool gets a risk score from 0 to 100, recalculated nightly. Review the highest scores first.":
    "Chaque outil reçoit un score de risque de 0 à 100, recalculé chaque nuit. Examinez d'abord les scores les plus élevés.",
  "Identify unauthorized tools": "Identifier les outils non autorisés",
  "Risk scores show which users and departments use the riskiest AI tools.":
    "Les scores de risque montrent quels utilisateurs et départements utilisent les outils IA les plus risqués.",
  "Get notified": "Recevoir des notifications",
  'Turn on "Notify me" to get an in-app notification and an email when the rule fires. Every alert is also kept in the alert history.':
    "Activez « M'avertir » pour recevoir une notification dans l'application et un e-mail lorsque la règle se déclenche. Chaque alerte est aussi conservée dans l'historique des alertes.",
  "See which departments have the highest AI tool usage. Identify teams that may need governance training or tool approvals.":
    "Voyez quels départements ont le plus recours aux outils IA. Identifiez les équipes qui pourraient avoir besoin d'une formation à la gouvernance ou de validations d'outils.",
  "Select sensitivity level": "Sélectionner le niveau de sensibilité",
  "Prompts and events per user and AI tool, grouped by the department your log source sends.":
    "Prompts et événements par utilisateur et par outil IA, regroupés selon le département envoyé par votre source de journaux.",
  "Alert on any new AI tool, on use by Finance, Legal or HR, and on tools with a risk score of 70 or more.":
    "Soyez alerté pour tout nouvel outil IA, pour une utilisation par la finance, le juridique ou les RH, et pour les outils dont le score de risque atteint 70 ou plus.",
  "Give each tool a status, such as approved, under review or blocked, or start governance to add it to the model inventory.":
    "Attribuez un statut à chaque outil, par exemple approuvé, en cours d'examen ou bloqué, ou lancez la gouvernance pour l'ajouter à l'inventaire des modèles.",
  "Data formats": "Formats de données",
  "Manage API keys for the REST API and syslog sources for proxy and firewall logs, and set the rate limit and data retention for Shadow AI.":
    "Gérez les clés API pour l'API REST et les sources syslog pour les journaux de proxy et de pare-feu, et définissez la limite de débit et la conservation des données pour l'IA fantôme.",
  "Overview of Shadow AI activity across your organization. See summary metrics, top tools by usage, risk rankings, and department breakdown at a glance.":
    "Vue d'ensemble de l'activité d'IA fantôme dans votre organisation. Consultez en un coup d'œil les métriques synthétiques, les outils les plus utilisés, les classements de risques et la répartition par département.",
  "Fire an alert on a new tool, a usage threshold, a sensitive department, a blocked attempt, a high risk score or a new user.":
    "Déclenchez une alerte pour un nouvel outil, un seuil d'utilisation, un département sensible, une tentative bloquée, un score de risque élevé ou un nouvel utilisateur.",
  "e.g., 100": "ex. 100",
  "e.g., 4.0": "ex. 4.0",
  "e.g., 70": "ex. 70",
  "e.g., Alert on new AI tools": "ex. Alerte pour nouveaux outils IA",
  "e.g., ChatGPT": "ex. ChatGPT",
  "e.g., Finance, Legal, HR": "ex. Finance, Juridique, RH",
  "e.g., OpenAI": "ex. OpenAI",
  "Trigger": "Déclencheur",
  "Monitor individual user and department-level AI tool usage across your organization. Track prompts, identify high-risk users, and review activity by department.":
    "Surveillez l'utilisation des outils IA au niveau des utilisateurs individuels et des départements. Suivez les prompts, identifiez les utilisateurs à haut risque et examinez l'activité par département.",
  "View and manage all AI tools detected in your organization's network traffic. Review risk scores, update tool statuses, and start formal governance for any discovered tool.":
    "Consultez et gérez tous les outils IA détectés dans le trafic réseau de votre organisation. Examinez les scores de risque, mettez à jour les statuts des outils et démarrez la gouvernance formelle pour tout outil découvert.",
  "Configure alert rules to get notified about Shadow AI activity. Set triggers for new tool detection, usage thresholds, sensitive department usage, and more.":
    "Configurez des règles d'alerte pour être notifié de l'activité IA fantôme. Définissez des déclencheurs pour la détection de nouveaux outils, les seuils d'utilisation, l'utilisation dans des départements sensibles, etc.",
  "API key created successfully": "Clé API créée avec succès",
  "Automatically create a lifecycle entry for this model":
    "Créer automatiquement une entrée de cycle de vie pour ce modèle",
  "Copy this key now. You won't be able to see it again.":
    "Copiez cette clé maintenant. Vous ne pourrez plus la voir.",
  "Field mapping": "Mappage des champs",
  "Go to AI tools": "Aller aux outils IA",
  "Governance owner": "Responsable de gouvernance",
  "How each parser maps source fields to the normalized event schema:":
    "Comment chaque analyseur mappe les champs source au schéma d'événement normalisé :",
  "No API keys created yet": "Aucune clé API encore créée",
  "No data available for this period": "Aucune donnée disponible pour cette période",
  "No rate limit applied": "Aucune limite de taux appliquée",
  "No syslog sources configured": "Aucune source syslog configurée",
  "No tool usage recorded": "Aucune utilisation d'outil enregistrée",
  "POST /api/v1/shadow-ai/events": "POST /api/v1/shadow-ai/events",
  "REST API event schema": "Schéma d'événement de l'API REST",
  "Risk assessment (optional)": "Évaluation des risques (optionnelle)",
  "Start lifecycle review": "Démarrer l'examen du cycle de vie",
  "Syslog format examples": "Exemples de format syslog",
  "This will stop processing events from this source.":
    "Cela arrêtera le traitement des événements provenant de cette source.",
  "User not found": "Utilisateur introuvable",
  "View full integration guide": "Voir le guide d'intégration complet",
  "View integration guide": "Voir le guide d'intégration",
  "View setup instructions": "Voir les instructions de configuration",
  "X-API-Key": "X-API-Key",
  "AI usage aggregated by department": "Utilisation IA agrégée par département",
  "Configure alerts for Shadow AI activity": "Configurer les alertes pour l'activité Shadow AI",
  "Detected": "Détecté",
  "Failed to start governance.": "Échec du démarrage de la gouvernance.",
  "Failed to update rule": "Échec de la mise à jour de la règle",
  "Fired at": "Déclenché à",
  "Individual user AI tool usage and risk scores":
    "Utilisation d'outils IA et scores de risque par utilisateur",
  "Past alerts triggered by your rules": "Alertes passées déclenchées par vos règles",
  "Recent tools": "Outils récents",
  "Rule": "Règle",
  "Rule created successfully": "Règle créée avec succès",
  "Rule deleted successfully": "Règle supprimée avec succès",
  "Rules & alerts": "Règles et alertes",
  "This action cannot be undone. All alert history for this rule will be preserved.":
    "Cette action est irréversible. Tout l'historique des alertes pour cette règle sera conservé.",
  "This action cannot be undone. Any integrations using this key will stop working.":
    "Cette action est irréversible. Toute intégration utilisant cette clé cessera de fonctionner.",
  "This will permanently remove this API key record. This action cannot be undone.":
    "Cela supprimera définitivement cet enregistrement de clé API. Cette action est irréversible.",
  "Top tool": "Outil principal",
  "e.g., 203.0.113.7": "p. ex. 203.0.113.7",
  "In IP-only mode, log lines without a key are matched by this IP.":
    "En mode IP seule, les lignes de journal sans clé sont associées via cette IP.",
  "Could not copy. Select the key and copy it by hand.":
    "Copie impossible. Sélectionnez la clé et copiez-la manuellement.",
  'Remove "{name}"?': "Supprimer « {name} » ?",
  // Shadow AI syslog sources
  "Allowed sender IP (optional)": "IP d'expéditeur autorisée (facultatif)",
  "Allowed sender IP": "IP d'expéditeur autorisée",
  "Last received": "Dernière réception",
  "Dropped": "Rejetés",
  "Last drop reason": "Dernier motif de rejet",
  "Parser": "Analyseur",
  "No key yet": "Pas encore de clé",
  "Generate key": "Générer une clé",
  "Regenerate key": "Régénérer la clé",
  "Not an IP address. Clear it or enter the sender's IP.":
    "Ce n'est pas une adresse IP. Videz le champ ou saisissez l'IP de l'expéditeur.",
  "No user email in the log line": "Aucun e-mail d'utilisateur dans la ligne de journal",
  "No destination host in the log line": "Aucun hôte de destination dans la ligne de journal",
  "Line does not match the parser type": "La ligne ne correspond pas au type d'analyseur",
  "Sent from an IP that isn't allowed or is shared with another source":
    "Envoyé depuis une IP non autorisée ou partagée avec une autre source",
  "Over the hourly event limit": "Limite horaire d'événements dépassée",
  "Unknown reason": "Motif inconnu",
  "Syslog listener failed to start. Check the server log.":
    "Le listener syslog n'a pas pu démarrer. Consultez le journal du serveur.",
  "Syslog listener is off. Set SHADOW_AI_SYSLOG_ENABLED=true on the server to turn it on.":
    "L'écouteur Syslog est désactivé. Définissez SHADOW_AI_SYSLOG_ENABLED=true sur le serveur pour l'activer.",
  "Syslog listener is on. Send to {host}:{port} over TLS.":
    "L'écouteur Syslog est activé. Envoyez vers {host}:{port} via TLS.",
  "Syslog listener is on. Send to {host}:{port} over plain TCP.":
    "L'écouteur Syslog est activé. Envoyez vers {host}:{port} via TCP simple.",
  "Enter an IPv4 or IPv6 address.": "Saisissez une adresse IPv4 ou IPv6.",
  "Could not add the source. Try again.": "Impossible d'ajouter la source. Réessayez.",
  "Could not save the source. Try again.": "Impossible d'enregistrer la source. Réessayez.",
  "Could not remove the source. Try again.": "Impossible de supprimer la source. Réessayez.",
  "Could not generate a key. Try again.": "Impossible de générer la clé. Réessayez.",
  "Your source key": "Votre clé de source",
  "Add this to the start or end of each line in the sender's log format":
    "Ajoutez ceci au début ou à la fin de chaque ligne du format de journal de l'expéditeur",
  "Copy log format line": "Copier la ligne de format de journal",
  "Regenerate key for {name}?": "Régénérer la clé de {name} ?",
  "The current key stops working within a minute. Update every sender that uses it.":
    "La clé actuelle cesse de fonctionner en moins d'une minute. Mettez à jour chaque expéditeur qui l'utilise.",
  "Edit source": "Modifier la source",
  "Remove source": "Supprimer la source",
  "Highest risk score (0–100) among the AI tools this user accessed. Tool scores are recalculated nightly.":
    "Score de risque le plus élevé (0–100) parmi les outils IA utilisés par cet utilisateur. Les scores des outils sont recalculés chaque nuit.",
  "Highest risk score (0–100) among the AI tools this department accessed. Tool scores are recalculated nightly.":
    "Score de risque le plus élevé (0–100) parmi les outils IA utilisés par ce département. Les scores des outils sont recalculés chaque nuit.",
  "API keys authenticate events sent to the REST API from a SIEM, script or browser extension. Syslog sources use their own keys.":
    "Les clés API authentifient les événements envoyés à l'API REST par un SIEM, un script ou une extension de navigateur. Les sources syslog utilisent leurs propres clés.",
  '"blocked" if the proxy refused the request. Any other value is stored as "allowed"':
    '"blocked" si le proxy a refusé la requête. Toute autre valeur est enregistrée comme "allowed"',
  'Every line must start or end with vw_source=<key>, using its syslog source\'s key. A Netskope JSON object can carry it as a top-level "vw_source" member instead. An RFC 3164 or RFC 5424 header is removed before parsing. One example line per parser:':
    "Chaque ligne doit commencer ou se terminer par vw_source=<key>, avec la clé de sa source syslog. Un objet JSON Netskope peut à la place la porter comme membre \"vw_source\" de premier niveau. Un en-tête RFC 3164 ou RFC 5424 est supprimé avant l'analyse. Une ligne d'exemple par parseur :",
};

export const es: Record<string, string> = {
  "Promote to AI app": "Promover a aplicación de IA",
  "departments": "departamentos",
  "Departments (comma-separated)": "Departamentos (separados por comas)",
  "Version (optional)": "Versión (opcional)",
  "Connect data sources": "Conectar fuentes de datos",
  "Create alert rule": "Crear regla de alerta",
  "Create rule": "Crear regla",
  "Start governance": "Iniciar gobernanza",
  "Accessed tools with highest risk": "Herramientas con mayor riesgo a las que se ha accedido",
  "AI tool details": "Detalles de la herramienta de IA",
  "AI users": "Usuarios de IA",
  "AI users by department": "Usuarios de IA por departamento",
  "Brief risk description": "Breve descripción del riesgo",
  "Categorize and govern": "Categorizar y gobernar",
  "Common rules to start with": "Reglas comunes para empezar",
  "Cooldown period": "Periodo de enfriamiento",
  "Department-level insights": "Información a nivel de departamento",
  "Event count threshold": "Umbral de recuento de eventos",
  "First detected": "Detectado por primera vez",
  "Governed": "Gobernado",
  "Highest risk tool": "Herramienta de mayor riesgo",
  "Last seen": "Visto por última vez",
  "Minimum risk score": "Puntuación de riesgo mínima",
  "Most accessed tools by events": "Herramientas más accedidas por eventos",
  "Most accessed tools by users": "Herramientas más accedidas por usuarios",
  "Most active department": "Departamento más activo",
  "Risk score calculation": "Cálculo de la puntuación de riesgo",
  "Find high-risk usage": "Detectar el uso de alto riesgo",
  "Syslog sources": "Fuentes de syslog",
  "Total events": "Total de eventos",
  "Total prompts": "Total de prompts",
  "Total users": "Total de usuarios",
  "Trigger type": "Tipo de disparador",
  "Trigger-based alerts": "Alertas basadas en disparadores",
  "Unique apps": "Aplicaciones únicas",
  "What gets tracked?": "¿Qué se sigue?",
  "No AI tools detected yet. Connect a data source to monitor AI tool usage.":
    "Aún no se han detectado herramientas de IA. Conecte una fuente de datos para supervisar el uso de herramientas de IA.",
  "No alerts have been triggered yet.": "Aún no se ha activado ninguna alerta.",
  "No rules configured yet. Create rules to automate alerts and enforce AI usage policies.":
    "Aún no hay reglas configuradas. Cree reglas para automatizar las alertas y aplicar las políticas de uso de IA.",
  "No AI tool activity in the last 30 days. Activity appears here once a log source sends traffic that matches an AI tool.":
    "No hay actividad de herramientas de IA en los últimos 30 días. La actividad aparece aquí cuando una fuente de registros envía tráfico que coincide con una herramienta de IA.",
  "Send proxy or firewall logs through the REST API or syslog (Settings). Traffic to known AI tools appears here.":
    "Envíe registros de proxy o firewall mediante la API REST o syslog (Configuración). El tráfico hacia herramientas de IA conocidas aparece aquí.",
  "Each tool gets a risk score from 0 to 100, recalculated nightly. Review the highest scores first.":
    "Cada herramienta recibe una puntuación de riesgo de 0 a 100, que se recalcula cada noche. Revise primero las puntuaciones más altas.",
  "Identify unauthorized tools": "Identificar herramientas no autorizadas",
  "Risk scores show which users and departments use the riskiest AI tools.":
    "Las puntuaciones de riesgo muestran qué usuarios y departamentos usan las herramientas de IA más riesgosas.",
  "Get notified": "Recibir notificaciones",
  'Turn on "Notify me" to get an in-app notification and an email when the rule fires. Every alert is also kept in the alert history.':
    "Active «Notificarme» para recibir una notificación en la aplicación y un correo electrónico cuando se active la regla. Cada alerta también se guarda en el historial de alertas.",
  "See which departments have the highest AI tool usage. Identify teams that may need governance training or tool approvals.":
    "Vea qué departamentos tienen el mayor uso de herramientas de IA. Identifique los equipos que puedan necesitar formación en gobernanza o aprobaciones de herramientas.",
  "Select sensitivity level": "Selecciona el nivel de sensibilidad",
  "Prompts and events per user and AI tool, grouped by the department your log source sends.":
    "Prompts y eventos por usuario y herramienta de IA, agrupados por el departamento que envía su fuente de registros.",
  "Alert on any new AI tool, on use by Finance, Legal or HR, and on tools with a risk score of 70 or more.":
    "Reciba alertas ante cualquier herramienta de IA nueva, ante el uso por Finanzas, Legal o RR. HH., y ante herramientas con una puntuación de riesgo de 70 o más.",
  "Give each tool a status, such as approved, under review or blocked, or start governance to add it to the model inventory.":
    "Asigne un estado a cada herramienta, como aprobada, en revisión o bloqueada, o inicie la gobernanza para añadirla al inventario de modelos.",
  "Data formats": "Formatos de datos",
  "Manage API keys for the REST API and syslog sources for proxy and firewall logs, and set the rate limit and data retention for Shadow AI.":
    "Gestione las claves de API para la API REST y las fuentes de syslog para los registros de proxy y firewall, y defina el límite de tasa y la retención de datos de Shadow AI.",
  "Overview of Shadow AI activity across your organization. See summary metrics, top tools by usage, risk rankings, and department breakdown at a glance.":
    "Resumen de la actividad de Shadow AI en su organización. Vea de un vistazo las métricas resumidas, las principales herramientas por uso, las clasificaciones de riesgo y el desglose por departamento.",
  "Fire an alert on a new tool, a usage threshold, a sensitive department, a blocked attempt, a high risk score or a new user.":
    "Active una alerta ante una herramienta nueva, un umbral de uso, un departamento sensible, un intento bloqueado, una puntuación de riesgo alta o un usuario nuevo.",
  "e.g., 100": "p. ej., 100",
  "e.g., 4.0": "p. ej., 4.0",
  "e.g., 70": "p. ej., 70",
  "e.g., Alert on new AI tools": "p. ej., Alertar sobre nuevas herramientas de IA",
  "e.g., ChatGPT": "p. ej., ChatGPT",
  "e.g., Finance, Legal, HR": "p. ej., Finanzas, Legal, RR. HH.",
  "e.g., OpenAI": "p. ej., OpenAI",
  "Trigger": "Disparador",
  "Monitor individual user and department-level AI tool usage across your organization. Track prompts, identify high-risk users, and review activity by department.":
    "Monitorice el uso de herramientas de IA a nivel de usuario individual y de departamento en toda su organización. Haga un seguimiento de los prompts, identifique a los usuarios de alto riesgo y revise la actividad por departamento.",
  "View and manage all AI tools detected in your organization's network traffic. Review risk scores, update tool statuses, and start formal governance for any discovered tool.":
    "Visualice y gestione todas las herramientas de IA detectadas en el tráfico de red de su organización. Revise las puntuaciones de riesgo, actualice los estados de las herramientas e inicie una gobernanza formal para cualquier herramienta descubierta.",
  "Configure alert rules to get notified about Shadow AI activity. Set triggers for new tool detection, usage thresholds, sensitive department usage, and more.":
    "Configure reglas de alerta para recibir notificaciones sobre la actividad de IA en la sombra. Establezca desencadenantes para la detección de nuevas herramientas, los umbrales de uso, el uso en departamentos sensibles y más.",
  "API key created successfully": "Clave de API creada correctamente",
  "Automatically create a lifecycle entry for this model":
    "Crear automáticamente una entrada de ciclo de vida para este modelo",
  "Copy this key now. You won't be able to see it again.":
    "Copie esta clave ahora. No podrá volver a verla.",
  "Field mapping": "Asignación de campos",
  "Go to AI tools": "Ir a herramientas de IA",
  "Governance owner": "Responsable de gobernanza",
  "How each parser maps source fields to the normalized event schema:":
    "Cómo asigna cada analizador los campos de origen al esquema de eventos normalizado:",
  "No API keys created yet": "Aún no se han creado claves de API",
  "No data available for this period": "No hay datos disponibles para este periodo",
  "No rate limit applied": "No se ha aplicado ningún límite de frecuencia",
  "No syslog sources configured": "No hay fuentes de syslog configuradas",
  "No tool usage recorded": "No se ha registrado uso de herramientas",
  "POST /api/v1/shadow-ai/events": "POST /api/v1/shadow-ai/events",
  "REST API event schema": "Esquema de eventos de la API REST",
  "Risk assessment (optional)": "Evaluación de riesgos (opcional)",
  "Start lifecycle review": "Iniciar revisión del ciclo de vida",
  "Syslog format examples": "Ejemplos de formato de syslog",
  "This will stop processing events from this source.":
    "Esto detendrá el procesamiento de eventos de esta fuente.",
  "User not found": "Usuario no encontrado",
  "View full integration guide": "Ver la guía de integración completa",
  "View integration guide": "Ver la guía de integración",
  "View setup instructions": "Ver instrucciones de configuración",
  "X-API-Key": "X-API-Key",
  "AI usage aggregated by department": "Uso de IA agregado por departamento",
  "Configure alerts for Shadow AI activity": "Configurar alertas para actividad de Shadow AI",
  "Detected": "Detectado",
  "Failed to start governance.": "Error al iniciar la gobernanza.",
  "Failed to update rule": "Error al actualizar la regla",
  "Fired at": "Activado a las",
  "Individual user AI tool usage and risk scores":
    "Uso de herramientas de IA por usuario individual y puntuaciones de riesgo",
  "Past alerts triggered by your rules": "Alertas anteriores activadas por sus reglas",
  "Recent tools": "Herramientas recientes",
  "Rule": "Regla",
  "Rule created successfully": "Regla creada correctamente",
  "Rule deleted successfully": "Regla eliminada correctamente",
  "Rules & alerts": "Reglas y alertas",
  "This action cannot be undone. All alert history for this rule will be preserved.":
    "Esta acción no se puede deshacer. Se conservará todo el historial de alertas de esta regla.",
  "This action cannot be undone. Any integrations using this key will stop working.":
    "Esta acción no se puede deshacer. Cualquier integración que utilice esta clave dejará de funcionar.",
  "This will permanently remove this API key record. This action cannot be undone.":
    "Esto eliminará permanentemente este registro de clave API. Esta acción no se puede deshacer.",
  "Top tool": "Herramienta principal",
  "e.g., 203.0.113.7": "p. ej., 203.0.113.7",
  "In IP-only mode, log lines without a key are matched by this IP.":
    "En modo solo IP, las líneas de registro sin clave se asocian mediante esta IP.",
  "Could not copy. Select the key and copy it by hand.":
    "No se pudo copiar. Seleccione la clave y cópiela a mano.",
  'Remove "{name}"?': "¿Eliminar «{name}»?",
  // Shadow AI syslog sources
  "Allowed sender IP (optional)": "IP de origen permitida (opcional)",
  "Allowed sender IP": "IP de origen permitida",
  "Last received": "Última recepción",
  "Dropped": "Descartados",
  "Last drop reason": "Último motivo de descarte",
  "Parser": "Analizador",
  "No key yet": "Aún no hay clave",
  "Generate key": "Generar clave",
  "Regenerate key": "Regenerar clave",
  "Not an IP address. Clear it or enter the sender's IP.":
    "No es una dirección IP. Bórrelo o introduzca la IP del remitente.",
  "No user email in the log line": "No hay correo de usuario en la línea de registro",
  "No destination host in the log line": "No hay host de destino en la línea de registro",
  "Line does not match the parser type": "La línea no coincide con el tipo de analizador",
  "Sent from an IP that isn't allowed or is shared with another source":
    "Enviado desde una IP no permitida o compartida con otra fuente",
  "Over the hourly event limit": "Límite de eventos por hora superado",
  "Unknown reason": "Motivo desconocido",
  "Syslog listener failed to start. Check the server log.":
    "El listener de syslog no pudo iniciarse. Revise el registro del servidor.",
  "Syslog listener is off. Set SHADOW_AI_SYSLOG_ENABLED=true on the server to turn it on.":
    "El receptor de Syslog está desactivado. Defina SHADOW_AI_SYSLOG_ENABLED=true en el servidor para activarlo.",
  "Syslog listener is on. Send to {host}:{port} over TLS.":
    "El receptor de Syslog está activado. Envíe a {host}:{port} mediante TLS.",
  "Syslog listener is on. Send to {host}:{port} over plain TCP.":
    "El receptor de Syslog está activado. Envíe a {host}:{port} mediante TCP sin cifrar.",
  "Enter an IPv4 or IPv6 address.": "Introduzca una dirección IPv4 o IPv6.",
  "Could not add the source. Try again.": "No se pudo añadir la fuente. Inténtelo de nuevo.",
  "Could not save the source. Try again.": "No se pudo guardar la fuente. Inténtelo de nuevo.",
  "Could not remove the source. Try again.": "No se pudo eliminar la fuente. Inténtelo de nuevo.",
  "Could not generate a key. Try again.": "No se pudo generar la clave. Inténtelo de nuevo.",
  "Your source key": "Su clave de fuente",
  "Add this to the start or end of each line in the sender's log format":
    "Añada esto al principio o al final de cada línea del formato de registro del remitente",
  "Copy log format line": "Copiar línea de formato de registro",
  "Regenerate key for {name}?": "¿Regenerar la clave de {name}?",
  "The current key stops working within a minute. Update every sender that uses it.":
    "La clave actual deja de funcionar en menos de un minuto. Actualice cada remitente que la utilice.",
  "Edit source": "Editar fuente",
  "Remove source": "Eliminar fuente",
  "Highest risk score (0–100) among the AI tools this user accessed. Tool scores are recalculated nightly.":
    "Puntuación de riesgo más alta (0–100) entre las herramientas de IA a las que accedió este usuario. Las puntuaciones se recalculan cada noche.",
  "Highest risk score (0–100) among the AI tools this department accessed. Tool scores are recalculated nightly.":
    "Puntuación de riesgo más alta (0–100) entre las herramientas de IA a las que accedió este departamento. Las puntuaciones se recalculan cada noche.",
  "API keys authenticate events sent to the REST API from a SIEM, script or browser extension. Syslog sources use their own keys.":
    "Las claves de API autentican los eventos enviados a la API REST desde un SIEM, un script o una extensión del navegador. Las fuentes de syslog usan sus propias claves.",
  '"blocked" if the proxy refused the request. Any other value is stored as "allowed"':
    '"blocked" si el proxy rechazó la solicitud. Cualquier otro valor se guarda como "allowed"',
  'Every line must start or end with vw_source=<key>, using its syslog source\'s key. A Netskope JSON object can carry it as a top-level "vw_source" member instead. An RFC 3164 or RFC 5424 header is removed before parsing. One example line per parser:':
    'Cada línea debe empezar o terminar con vw_source=<key>, con la clave de su fuente de syslog. Un objeto JSON de Netskope puede llevarla en su lugar como miembro "vw_source" de nivel superior. Un encabezado RFC 3164 o RFC 5424 se elimina antes del análisis. Una línea de ejemplo por parser:',
};
