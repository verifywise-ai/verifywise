// modelInventory strings for de, fr and es. English is the key.
// Spread into ../translations.ts. Other areas stay in that file for now.

export const de: Record<string, string> = {
  "Add threshold": "Schwellenwert hinzufügen",
  "Alerts & notifications": "Warnungen & Benachrichtigungen",
  "Assigned to": "Zugewiesen an",
  "Breach history": "Verlauf der Überschreitungen",
  "Copy token": "Token kopieren",
  "Copy your token now": "Kopieren Sie Ihren Token jetzt",
  "Create an ingestion token below (per-org, machine-to-machine, revocable).":
    "Erstellen Sie unten einen Ingestion-Token (pro Organisation, Maschine-zu-Maschine, widerrufbar).",
  "Create ingestion token": "Ingestion-Token erstellen",
  "Default thresholds": "Standard-Schwellenwerte",
  "Example request": "Beispielanfrage",
  "How to send metrics": "So senden Sie Metriken",
  "Ingestion tokens": "Ingestion-Token",
  "Last received": "Zuletzt empfangen",
  "Latest": "Aktuell",
  "Maximum": "Maximum",
  "Metric": "Metrik",
  "Metric date": "Metrikdatum",
  "Metric trend": "Metriktrend",
  "Metrics feed & tokens": "Metrik-Feed & Token",
  "Minimum": "Minimum",
  "Name a machine-to-machine token your pipeline will use to push metrics.":
    "Benennen Sie einen Maschine-zu-Maschine-Token, den Ihre Pipeline zum Senden von Metriken verwendet.",
  "No breaches recorded. Every metric is within its threshold.":
    "Keine Überschreitungen erfasst. Jede Metrik liegt innerhalb ihres Schwellenwerts.",
  "No data yet. This model is awaiting its first metric from your monitoring feed.":
    "Noch keine Daten. Dieses Modell wartet auf seine erste Metrik aus Ihrem Monitoring-Feed.",
  "No ingestion tokens yet. Create one to start pushing metrics.":
    "Noch keine Ingestion-Token. Erstellen Sie einen, um mit dem Senden von Metriken zu beginnen.",
  "No threshold defined": "Kein Schwellenwert definiert",
  "No thresholds defined yet. Add one so ingested metrics can be evaluated.":
    "Noch keine Schwellenwerte definiert. Fügen Sie einen hinzu, damit eingehende Metriken ausgewertet werden können.",
  "Notified on breach": "Bei Überschreitung benachrichtigt",
  "On breach": "Bei Überschreitung",
  "POST a metric event to the model&apos;s URL, per metric, on your own cadence.":
    "Senden Sie ein Metrik-Ereignis per POST an die URL des Modells, pro Metrik, in Ihrem eigenen Rhythmus.",
  "Payload schema": "Payload-Schema",
  "Rotate": "Rotieren",
  "Select a model to see who is notified of its breaches.":
    "Wählen Sie ein Modell, um zu sehen, wer über dessen Überschreitungen benachrichtigt wird.",
  "Select a model to view its monitored metrics.":
    "Wählen Sie ein Modell, um dessen überwachte Metriken anzuzeigen.",
  "Select a shape": "Form auswählen",
  "Set the metric, shape and severity VerifyWise evaluates ingested points against.":
    "Legen Sie Metrik, Form und Schweregrad fest, anhand derer VerifyWise eingehende Punkte auswertet.",
  "Shape": "Form",
  "Threshold at evaluation": "Schwellenwert zum Auswertungszeitpunkt",
  "Trend": "Trend",
  "Send email alerts": "E-Mail-Benachrichtigungen senden",
  "Applies to breach and overdue-validation alerts. In-app notifications are always on.":
    "Gilt für Verstoß- und überfällige Validierungsbenachrichtigungen. In-App-Benachrichtigungen sind immer aktiv.",
  "Automatically open a finding on hard breach":
    "Bei hartem Verstoß automatisch eine Feststellung öffnen",
  "One finding per model and metric while it stays open; warnings never open findings.":
    "Eine Feststellung pro Modell und Metrik, solange sie offen ist; Warnungen öffnen nie Feststellungen.",
  "Additional recipients": "Zusätzliche Empfänger",
  "These people are alerted for every model, on top of the model's roles.":
    "Diese Personen werden für jedes Modell benachrichtigt, zusätzlich zu den Rollen des Modells.",
  "Save alert settings": "Benachrichtigungseinstellungen speichern",
  "Alert settings saved": "Benachrichtigungseinstellungen gespeichert",
  "Failed to save alert settings":
    "Benachrichtigungseinstellungen konnten nicht gespeichert werden",
  "A finding must be verified before it can be closed.":
    "Eine Feststellung muss verifiziert sein, bevor sie geschlossen werden kann.",
  "Assign tier": "Stufe zuweisen",
  "Conceptual soundness": "Konzeptionelle Belastbarkeit",
  "Conclusion & sign-off": "Schlussfolgerung & Freigabe",
  "Create finding": "Feststellung erstellen",
  "Data review": "Datenprüfung",
  "Does": "Aufgabe",
  "Due": "Fällig",
  "Findings": "Feststellungen",
  "Findings & limitations": "Feststellungen & Einschränkungen",
  "How will this finding be remediated?": "Wie wird diese Feststellung behoben?",
  "In validation": "In Validierung",
  "Last validated": "Zuletzt validiert",
  "Materiality drivers": "Wesentlichkeitsfaktoren",
  "Model risk management": "Modellrisikomanagement",
  "Attestation": "Attestierung",
  "Could not load the portfolio summary. Try again shortly.":
    "Portfolioübersicht konnte nicht geladen werden. Bitte versuchen Sie es in Kürze erneut.",
  "Fleet attestation status": "Attestierungsstatus des Bestands",
  "Generate attestation report": "Attestierungsbericht erstellen",
  "Advance this validation to In validation to begin writing the report.":
    "Setzen Sie diese Validierung auf In Validierung, um mit dem Bericht zu beginnen.",
  "Models by tier": "Modelle nach Stufe",
  "Monitoring active": "Überwachung aktiv",
  "No models in the inventory yet. Add models and assign tiers to build the portfolio summary.":
    "Noch keine Modelle im Inventar. Fügen Sie Modelle hinzu und weisen Sie Stufen zu, um die Portfolioübersicht zu erstellen.",
  "No tiered models yet. Assign tiers on the Tiering tab.":
    "Noch keine eingestuften Modelle. Weisen Sie Stufen im Tab „Einstufung“ zu.",
  "Open findings": "Offene Feststellungen",
  "Overdue validations": "Überfällige Validierungen",
  "Past their next due date": "Über das nächste Fälligkeitsdatum hinaus",
  "Tiering up to date": "Einstufung aktuell",
  "Validation coverage": "Validierungsabdeckung",
  "Tier increase": "Stufenerhöhung",
  "First use": "Erstnutzung",
  "Breach": "Überschreitung",
  "Next due": "Nächste Fälligkeit",
  "No findings raised yet. Findings are created from a validation.":
    "Noch keine Feststellungen erfasst. Feststellungen werden aus einer Validierung erstellt.",
  "No models to tier yet. Add models to your inventory first.":
    "Noch keine Modelle zum Einstufen. Fügen Sie zuerst Modelle zu Ihrem Inventar hinzu.",
  "No validations yet. Start a validation to open a report.":
    "Noch keine Validierungen. Starten Sie eine Validierung, um einen Bericht zu öffnen.",
  "Not validated": "Nicht validiert",
  "On this model": "Für dieses Modell",
  "Open a new validation cycle for a model. Only one validation can be in progress per model.":
    "Starten Sie einen neuen Validierungszyklus für ein Modell. Pro Modell kann nur eine Validierung laufen.",
  "Outcomes analysis": "Ergebnisanalyse",
  "Purpose & scope": "Zweck & Umfang",
  "Raise a finding against a validation. It joins the register and tracks to closure.":
    "Erfassen Sie eine Feststellung zu einer Validierung. Sie wird ins Register aufgenommen und bis zum Abschluss verfolgt.",
  "Record the validation outcome. This marks the validation as validated and closes the active cycle.":
    "Erfassen Sie das Validierungsergebnis. Damit wird die Validierung als validiert markiert und der aktive Zyklus geschlossen.",
  "Remediation plan": "Maßnahmenplan",
  "Roles & independence": "Rollen & Unabhängigkeit",
  "Save report": "Bericht speichern",
  "Save roles": "Rollen speichern",
  "Breach and evaluation history is always retained; this only ages out benign monitoring points.":
    "Verstoß- und Bewertungshistorie wird immer aufbewahrt; hiermit werden nur unauffällige Überwachungspunkte ausgesondert.",
  "Failed to save retention": "Aufbewahrung konnte nicht gespeichert werden",
  "Monitoring data retention (months)": "Aufbewahrung von Überwachungsdaten (Monate)",
  "Retention must be at least 13 months": "Die Aufbewahrung muss mindestens 13 Monate betragen",
  "Retention saved": "Aufbewahrung gespeichert",
  "Save retention": "Aufbewahrung speichern",
  "Select a model to view and assign its roles.":
    "Wählen Sie ein Modell, um dessen Rollen anzuzeigen und zuzuweisen.",
  "Select a tier": "Stufe auswählen",
  "Select a validation": "Validierung auswählen",
  "Select an outcome": "Ergebnis auswählen",
  "Select stage": "Phase auswählen",
  "Short description of the finding": "Kurzbeschreibung der Feststellung",
  "Sign off": "Freigeben",
  "Sign off validation": "Validierung freigeben",
  "Stage": "Phase",
  "Start": "Starten",
  "Start validation": "Validierung starten",
  "Tier": "Stufe",
  "Tier 1": "Stufe 1",
  "Tier 2": "Stufe 2",
  "Tier 3": "Stufe 3",
  "Tiered on": "Eingestuft am",
  "Tiering": "Einstufung",
  "Tiering rules": "Einstufungsregeln",
  "Tiering, validation, findings and roles for model risk management":
    "Einstufung, Validierung, Feststellungen und Rollen für das Modellrisikomanagement",
  "Validated": "Validiert",
  "Validated with findings": "Validiert mit Feststellungen",
  "Validation depth & revalidation cadence": "Validierungstiefe & Revalidierungszyklus",
  "Validation report": "Validierungsbericht",
  "Validator": "Validator",
  "Why this tier? e.g. capital impact, regulatory reporting, customer exposure":
    "Warum diese Stufe? z. B. Kapitalauswirkung, aufsichtsrechtliches Reporting, Kundenexposition",
  "Add model risk": "Modellrisiko hinzufügen",
  "Add new model": "Neues Modell hinzufügen",
  "Replace Link": "Link ersetzen",
  "Register new models": "Neue Modelle registrieren",
  "Track expiry dates": "Ablaufdaten verfolgen",
  "Track model status": "Modellstatus verfolgen",
  "Link to models": "Mit Modellen verknüpfen",
  "Link to vendors and risks": "Mit Anbietern und Risiken verknüpfen",
  "Organize by control category": "Nach Kontrollkategorie organisieren",
  "Assessed": "Bewertet",
  "Not assessed": "Nicht bewertet",
  "STATUS DATE": "STATUSDATUM",
  "UPDATED": "AKTUALISIERT",
  "APPROVER": "GENEHMIGER",
  "CLASSIFICATION": "KLASSIFIZIERUNG",
  "Version change log": "Versionsänderungsprotokoll",
  "Vendor model documentation": "Anbietermodell-Dokumentation",
  "Model card": "Modellkarte",
  "Model status summary": "Modellstatus-Übersicht",
  "MAPPED MODELS": "ZUGEORDNETE MODELLE",
  "RISKS": "RISIKEN",
  "Evaluations": "Bewertungen",
  "Evaluation metrics summary": "Zusammenfassung der Bewertungsmetriken",
  "ASSESSMENT": "BEURTEILUNG",
  "Security assessment": "Sicherheitsbewertung",
  "Security assessment report": "Sicherheitsbewertungsbericht",
  "Risk assessment report": "Risikobewertungsbericht",
  "Bias and fairness report": "Verzerrungs- und Fairnessbericht",
  "Robustness and stress test report": "Robustheits- und Stresstestbericht",
  "Third-party audit report": "Drittanbieter-Prüfbericht",
  "Conformity assessment report": "Konformitätsbewertungsbericht",
  "Internal approval record": "Interner Genehmigungsnachweis",
  "Data protection impact assessment": "Datenschutz-Folgenabschätzung",
  "Human oversight plan": "Plan zur menschlichen Aufsicht",
  "Post-market monitoring plan": "Plan zur Marktüberwachung",
  "Filter by approval status": "Nach Genehmigungsstatus filtern",
  "Filter evidence": "Nachweise filtern",
  "No datasets found. Add a dataset to start tracking your AI training and validation data.":
    "Keine Datensätze gefunden. Fügen Sie einen Datensatz hinzu, um Ihre KI-Trainings- und Validierungsdaten zu verfolgen.",
  "No evidence yet. Upload documents that prove compliance with each requirement.":
    "Noch keine Nachweise. Laden Sie Dokumente hoch, die die Einhaltung jeder Anforderung belegen.",
  "No models registered yet. Maintain a complete inventory of all AI models your organization uses.":
    "Noch keine Modelle registriert. Führen Sie ein vollständiges Inventar aller KI-Modelle Ihrer Organisation.",
  "There are currently no model risks in this table.":
    "Derzeit keine Modellrisiken in dieser Tabelle.",
  "Risks identified for models in your inventory":
    "Für Modelle in Ihrem Inventar identifizierte Risiken",
  "Label data quality": "Datenqualität kennzeichnen",
  "Compliance evidence and documentation for audits":
    "Compliance-Nachweise und Dokumentation für Audits",
  "What counts as a model?": "Was zählt als Modell?",
  "What counts as evidence?": "Was zählt als Nachweis?",
  "What to document": "Was zu dokumentieren ist",
  "Connect each model to its provider and associated risks. This creates a full traceability map for your audit.":
    "Verknüpfen Sie jedes Modell mit seinem Anbieter und den zugehörigen Risiken. So entsteht eine vollständige Nachverfolgbarkeitskarte für Ihr Audit.",
  "Key result": "Kernergebnis",
  "Any machine learning model, large language model, computer vision system, or automated decision-making tool. Include both internal and third-party models.":
    "Jedes Machine-Learning-Modell, Large-Language-Modell, Computer-Vision-System oder automatisierte Entscheidungsfindungs-Tool. Sowohl interne als auch Drittanbieter-Modelle einbeziehen.",
  "Group evidence by the controls they support. This makes audit preparation faster and keeps your evidence library structured.":
    "Gruppieren Sie Nachweise nach den Kontrollen, die sie stützen. Das beschleunigt die Audit-Vorbereitung und hält Ihre Nachweisbibliothek strukturiert.",
  "This registry manages all AI/LLM models and their associated risks within your organization. You can view, add, and manage model details and track model-specific risks and mitigation plans.":
    "Dieses Register verwaltet alle KI-/LLM-Modelle und ihre zugehörigen Risiken in Ihrer Organisation. Sie können Modelldetails einsehen, hinzufügen und verwalten sowie modellspezifische Risiken und Minderungspläne verfolgen.",
  "View all risks associated with this model":
    "Alle mit diesem Modell verbundenen Risiken anzeigen",
  "Copied to clipboard": "In Zwischenablage kopiert",
  "No risks found for this model.": "Keine Risiken für dieses Modell gefunden.",
  "Connect each dataset to the models that use it for training or validation. This creates traceability for audits and impact analysis.":
    "Jeden Datensatz mit den Modellen verknüpfen, die ihn für Training oder Validierung nutzen. Dies schafft Nachvollziehbarkeit für Audits und Auswirkungsanalysen.",
  "Note whether the dataset has been reviewed for bias, completeness, and accuracy. Track any known quality issues or limitations.":
    "Vermerken, ob der Datensatz auf Verzerrungen, Vollständigkeit und Genauigkeit geprüft wurde. Bekannte Qualitätsprobleme oder Einschränkungen verfolgen.",
  "Policies, meeting minutes, configuration screenshots, training records, risk assessments, vendor agreements, and change logs.":
    "Richtlinien, Besprechungsprotokolle, Konfigurations-Screenshots, Schulungsnachweise, Risikobewertungen, Anbieterverträge und Änderungsprotokolle.",
  "Record dataset name, source, size, format, and the date it was collected or last updated. Include any preprocessing steps applied.":
    "Name, Quelle, Größe, Format des Datensatzes sowie das Erfassungs- oder letzte Aktualisierungsdatum erfassen. Angewandte Vorverarbeitungsschritte einschließen.",
  "Activity History": "Aktivitätsverlauf",
  "Automatically tracks every change to this model.":
    "Verfolgt automatisch jede Änderung an diesem Modell.",
  "Do you want to continue?": "Möchten Sie fortfahren?",
  "No evaluations linked to any model yet": "Noch keine Bewertungen mit einem Modell verknüpft",
  "No model inventory data available.": "Keine Modellinventardaten verfügbar.",
  "Replace Share Link?": "Freigabelink ersetzen?",
  "See what your team is working on and what updates they've made, in real time.":
    "Sehen Sie in Echtzeit, woran Ihr Team arbeitet und welche Aktualisierungen vorgenommen wurden.",
  "Add new AI models to your inventory with comprehensive metadata including provider, version, capabilities, security assessment, and usage details.":
    "Fügen Sie Ihrem Inventar neue KI-Modelle mit umfassenden Metadaten hinzu, einschließlich Anbieter, Version, Fähigkeiten, Sicherheitsbewertung und Nutzungsdetails.",
  "Catalog and track all registered AI/ML models":
    "Alle registrierten KI/ML-Modelle katalogisieren und verfolgen",
  "Document risks specific to your AI models. Track risk severity, assign owners, and define mitigation strategies.":
    "Dokumentieren Sie Risiken spezifisch für Ihre KI-Modelle. Verfolgen Sie den Risikoschweregrad, weisen Sie Verantwortliche zu und definieren Sie Minderungsstrategien.",
  "Failed to load evidence data. Please try again later.":
    "Laden der Nachweisdaten fehlgeschlagen. Bitte später erneut versuchen.",
  "Filter evidence files by type to quickly find compliance documentation, assessments, and audit artifacts.":
    "Filtern Sie Nachweisdateien nach Typ, um Compliance-Dokumentation, Bewertungen und Audit-Artefakte schnell zu finden.",
  "Focus on models that need attention by filtering by approval status. Quickly identify pending approvals or restricted models.":
    "Konzentrieren Sie sich auf Modelle, die Aufmerksamkeit erfordern, indem Sie nach Genehmigungsstatus filtern. Identifizieren Sie schnell ausstehende Genehmigungen oder eingeschränkte Modelle.",
  "LLM evaluations and bias audits linked to models in your inventory":
    "LLM-Bewertungen und Bias-Audits, die mit Modellen in Ihrem Inventar verknüpft sind",
  "Link evaluations to models when creating experiments or bias audits in LLM Evals":
    "Verknüpfen Sie Bewertungen mit Modellen beim Erstellen von Experimenten oder Bias-Audits in LLM-Bewertungen",
  "Search your model inventory by model name, provider, or version to quickly locate specific AI models in your registry.":
    "Durchsuchen Sie Ihr Modellinventar nach Modellname, Anbieter oder Version, um bestimmte KI-Modelle in Ihrem Register schnell zu finden.",
  "Technical file / CE documentation": "Technische Datei / CE-Dokumentation",
  "Track your AI models by approval status at a glance: Approved, Restricted, Pending, and Blocked.":
    "Verfolgen Sie Ihre KI-Modelle nach Genehmigungsstatus auf einen Blick: Genehmigt, Eingeschränkt, Ausstehend und Blockiert.",
  "AI Quality": "AI Quality",
  "MAPPED TRAININGS": "ZUGEORDNETE SCHULUNGEN",
  "Record each model's status: approved, restricted, pending, blocked, or rejected. This gives auditors visibility into your governance coverage.":
    "Erfassen Sie den Status jedes Modells: genehmigt, eingeschränkt, ausstehend, blockiert oder abgelehnt. Dies gibt Auditoren Einblick in Ihre Governance-Abdeckung.",
  "Set expiry dates on evidence so you're reminded to update or re-certify documents before they become stale.":
    "Legen Sie Ablaufdaten für Nachweise fest, damit Sie daran erinnert werden, Dokumente zu aktualisieren oder neu zu zertifizieren, bevor sie veralten.",
  "MLFlow": "MLFlow",
  "Only admins can change retention periods":
    "Nur Administratoren können Aufbewahrungsfristen ändern",
};

export const fr: Record<string, string> = {
  "Add threshold": "Ajouter un seuil",
  "Alerts & notifications": "Alertes et notifications",
  "Assigned to": "Attribué à",
  "Breach history": "Historique des dépassements",
  "Copy token": "Copier le jeton",
  "Copy your token now": "Copiez votre jeton maintenant",
  "Create an ingestion token below (per-org, machine-to-machine, revocable).":
    "Créez un jeton d'ingestion ci-dessous (par organisation, machine à machine, révocable).",
  "Create ingestion token": "Créer un jeton d'ingestion",
  "Default thresholds": "Seuils par défaut",
  "Example request": "Exemple de requête",
  "How to send metrics": "Comment envoyer des métriques",
  "Ingestion tokens": "Jetons d'ingestion",
  "Last received": "Dernière réception",
  "Latest": "Dernier",
  "Maximum": "Maximum",
  "Metric": "Métrique",
  "Metric date": "Date de la métrique",
  "Metric trend": "Tendance de la métrique",
  "Metrics feed & tokens": "Flux de métriques et jetons",
  "Minimum": "Minimum",
  "Name a machine-to-machine token your pipeline will use to push metrics.":
    "Nommez un jeton machine à machine que votre pipeline utilisera pour envoyer des métriques.",
  "No breaches recorded. Every metric is within its threshold.":
    "Aucun dépassement enregistré. Chaque métrique respecte son seuil.",
  "No data yet. This model is awaiting its first metric from your monitoring feed.":
    "Aucune donnée pour le moment. Ce modèle attend sa première métrique de votre flux de surveillance.",
  "No ingestion tokens yet. Create one to start pushing metrics.":
    "Aucun jeton d'ingestion pour le moment. Créez-en un pour commencer à envoyer des métriques.",
  "No threshold defined": "Aucun seuil défini",
  "No thresholds defined yet. Add one so ingested metrics can be evaluated.":
    "Aucun seuil défini pour le moment. Ajoutez-en un pour que les métriques ingérées puissent être évaluées.",
  "Notified on breach": "Notifié en cas de dépassement",
  "On breach": "En cas de dépassement",
  "POST a metric event to the model&apos;s URL, per metric, on your own cadence.":
    "Envoyez un événement de métrique en POST à l'URL du modèle, par métrique, à votre propre rythme.",
  "Payload schema": "Schéma de la charge utile",
  "Rotate": "Renouveler",
  "Select a model to see who is notified of its breaches.":
    "Sélectionnez un modèle pour voir qui est notifié de ses dépassements.",
  "Select a model to view its monitored metrics.":
    "Sélectionnez un modèle pour afficher ses métriques surveillées.",
  "Select a shape": "Sélectionner une forme",
  "Set the metric, shape and severity VerifyWise evaluates ingested points against.":
    "Définissez la métrique, la forme et la gravité selon lesquelles VerifyWise évalue les points ingérés.",
  "Shape": "Forme",
  "Threshold at evaluation": "Seuil au moment de l'évaluation",
  "Trend": "Tendance",
  "Send email alerts": "Envoyer des alertes par e-mail",
  "Applies to breach and overdue-validation alerts. In-app notifications are always on.":
    "S'applique aux alertes de dépassement et de validation en retard. Les notifications dans l'application sont toujours actives.",
  "Automatically open a finding on hard breach":
    "Ouvrir automatiquement un constat en cas de dépassement critique",
  "One finding per model and metric while it stays open; warnings never open findings.":
    "Un constat par modèle et par métrique tant qu'il reste ouvert ; les avertissements n'ouvrent jamais de constats.",
  "Additional recipients": "Destinataires supplémentaires",
  "These people are alerted for every model, on top of the model's roles.":
    "Ces personnes sont alertées pour chaque modèle, en plus des rôles du modèle.",
  "Save alert settings": "Enregistrer les paramètres d'alerte",
  "Alert settings saved": "Paramètres d'alerte enregistrés",
  "Failed to save alert settings": "Échec de l'enregistrement des paramètres d'alerte",
  "A finding must be verified before it can be closed.":
    "Une constatation doit être vérifiée avant de pouvoir être clôturée.",
  "Assign tier": "Attribuer un niveau",
  "Conceptual soundness": "Solidité conceptuelle",
  "Conclusion & sign-off": "Conclusion et validation",
  "Create finding": "Créer une constatation",
  "Data review": "Revue des données",
  "Does": "Rôle",
  "Due": "Échéance",
  "Findings": "Constatations",
  "Findings & limitations": "Constatations et limites",
  "How will this finding be remediated?": "Comment cette constatation sera-t-elle corrigée ?",
  "In validation": "En validation",
  "Last validated": "Dernière validation",
  "Materiality drivers": "Facteurs de matérialité",
  "Model risk management": "Gestion du risque de modèle",
  "Attestation": "Attestation",
  "Could not load the portfolio summary. Try again shortly.":
    "Impossible de charger le résumé du portefeuille. Réessayez sous peu.",
  "Fleet attestation status": "Statut d’attestation du parc",
  "Generate attestation report": "Générer le rapport d’attestation",
  "Advance this validation to In validation to begin writing the report.":
    "Faites passer cette validation à En validation pour commencer à rédiger le rapport.",
  "Models by tier": "Modèles par niveau",
  "Monitoring active": "Surveillance active",
  "No models in the inventory yet. Add models and assign tiers to build the portfolio summary.":
    "Aucun modèle dans l’inventaire pour l’instant. Ajoutez des modèles et attribuez des niveaux pour créer le résumé du portefeuille.",
  "No tiered models yet. Assign tiers on the Tiering tab.":
    "Aucun modèle classé pour l’instant. Attribuez des niveaux dans l’onglet « Classement ».",
  "Open findings": "Constatations ouvertes",
  "Overdue validations": "Validations en retard",
  "Past their next due date": "Au-delà de leur prochaine échéance",
  "Tiering up to date": "Classement à jour",
  "Validation coverage": "Couverture de validation",
  "Tier increase": "Augmentation de niveau",
  "First use": "Première utilisation",
  "Breach": "Dépassement",
  "Next due": "Prochaine échéance",
  "No findings raised yet. Findings are created from a validation.":
    "Aucune constatation pour le moment. Les constatations sont créées à partir d'une validation.",
  "No models to tier yet. Add models to your inventory first.":
    "Aucun modèle à classer pour le moment. Ajoutez d'abord des modèles à votre inventaire.",
  "No validations yet. Start a validation to open a report.":
    "Aucune validation pour le moment. Démarrez une validation pour ouvrir un rapport.",
  "Not validated": "Non validé",
  "On this model": "Sur ce modèle",
  "Open a new validation cycle for a model. Only one validation can be in progress per model.":
    "Ouvrez un nouveau cycle de validation pour un modèle. Une seule validation peut être en cours par modèle.",
  "Outcomes analysis": "Analyse des résultats",
  "Purpose & scope": "Objet et périmètre",
  "Raise a finding against a validation. It joins the register and tracks to closure.":
    "Enregistrez une constatation liée à une validation. Elle rejoint le registre et est suivie jusqu'à sa clôture.",
  "Record the validation outcome. This marks the validation as validated and closes the active cycle.":
    "Enregistrez le résultat de la validation. Cela marque la validation comme validée et clôt le cycle actif.",
  "Remediation plan": "Plan de remédiation",
  "Roles & independence": "Rôles et indépendance",
  "Save report": "Enregistrer le rapport",
  "Save roles": "Enregistrer les rôles",
  "Breach and evaluation history is always retained; this only ages out benign monitoring points.":
    "L'historique des dépassements et des évaluations est toujours conservé ; seuls les points de surveillance sans incident sont purgés.",
  "Failed to save retention": "Échec de l'enregistrement de la rétention",
  "Monitoring data retention (months)": "Rétention des données de surveillance (mois)",
  "Retention must be at least 13 months": "La rétention doit être d'au moins 13 mois",
  "Retention saved": "Rétention enregistrée",
  "Save retention": "Enregistrer la rétention",
  "Select a model to view and assign its roles.":
    "Sélectionnez un modèle pour afficher et attribuer ses rôles.",
  "Select a tier": "Sélectionner un niveau",
  "Select a validation": "Sélectionner une validation",
  "Select an outcome": "Sélectionner un résultat",
  "Select stage": "Sélectionner une étape",
  "Short description of the finding": "Brève description de la constatation",
  "Sign off": "Valider",
  "Sign off validation": "Valider la validation",
  "Stage": "Étape",
  "Start": "Démarrer",
  "Start validation": "Démarrer la validation",
  "Tier": "Niveau",
  "Tier 1": "Niveau 1",
  "Tier 2": "Niveau 2",
  "Tier 3": "Niveau 3",
  "Tiered on": "Classé le",
  "Tiering": "Classement",
  "Tiering rules": "Règles de classement",
  "Tiering, validation, findings and roles for model risk management":
    "Classement, validation, constatations et rôles pour la gestion du risque de modèle",
  "Validated": "Validé",
  "Validated with findings": "Validé avec constatations",
  "Validation depth & revalidation cadence":
    "Profondeur de validation et fréquence de revalidation",
  "Validation report": "Rapport de validation",
  "Validator": "Validateur",
  "Why this tier? e.g. capital impact, regulatory reporting, customer exposure":
    "Pourquoi ce niveau ? p. ex. impact en capital, reporting réglementaire, exposition client",
  "Add model risk": "Ajouter un risque de modèle",
  "Add new model": "Ajouter un nouveau modèle",
  "Replace Link": "Remplacer le lien",
  "Register new models": "Enregistrer de nouveaux modèles",
  "Track expiry dates": "Suivre les dates d'expiration",
  "Track model status": "Suivre le statut du modèle",
  "Link to models": "Relier aux modèles",
  "Link to vendors and risks": "Relier aux fournisseurs et risques",
  "Organize by control category": "Organiser par catégorie de contrôle",
  "Assessed": "Évalué",
  "Not assessed": "Non évalué",
  "STATUS DATE": "DATE DE STATUT",
  "UPDATED": "MIS À JOUR",
  "APPROVER": "APPROBATEUR",
  "CLASSIFICATION": "CLASSIFICATION",
  "Version change log": "Journal des versions",
  "Vendor model documentation": "Documentation du modèle fournisseur",
  "Model card": "Fiche modèle",
  "Model status summary": "Résumé du statut des modèles",
  "MAPPED MODELS": "MODÈLES RATTACHÉS",
  "RISKS": "RISQUES",
  "Evaluations": "Évaluations",
  "Evaluation metrics summary": "Résumé des métriques d'évaluation",
  "ASSESSMENT": "ÉVALUATION",
  "Security assessment": "Évaluation de sécurité",
  "Security assessment report": "Rapport d'évaluation de sécurité",
  "Risk assessment report": "Rapport d'évaluation des risques",
  "Bias and fairness report": "Rapport de biais et d'équité",
  "Robustness and stress test report": "Rapport de robustesse et de tests de stress",
  "Third-party audit report": "Rapport d'audit tiers",
  "Conformity assessment report": "Rapport d'évaluation de conformité",
  "Internal approval record": "Registre d'approbation interne",
  "Data protection impact assessment": "Analyse d'impact relative à la protection des données",
  "Human oversight plan": "Plan de supervision humaine",
  "Post-market monitoring plan": "Plan de surveillance post-commercialisation",
  "Filter by approval status": "Filtrer par statut d'approbation",
  "Filter evidence": "Filtrer les preuves",
  "No datasets found. Add a dataset to start tracking your AI training and validation data.":
    "Aucun jeu de données trouvé. Ajoutez-en un pour commencer à suivre vos données d'entraînement et de validation.",
  "No evidence yet. Upload documents that prove compliance with each requirement.":
    "Aucune preuve pour le moment. Téléversez des documents démontrant la conformité à chaque exigence.",
  "No models registered yet. Maintain a complete inventory of all AI models your organization uses.":
    "Aucun modèle enregistré pour le moment. Tenez un inventaire complet de tous les modèles IA utilisés par votre organisation.",
  "There are currently no model risks in this table.":
    "Aucun risque de modèle dans ce tableau pour le moment.",
  "Risks identified for models in your inventory":
    "Risques identifiés pour les modèles de votre inventaire",
  "Label data quality": "Qualifier la qualité des données",
  "Compliance evidence and documentation for audits":
    "Preuves et documentation de conformité pour les audits",
  "What counts as a model?": "Qu'est-ce qui compte comme modèle ?",
  "What counts as evidence?": "Qu'est-ce qui compte comme preuve ?",
  "What to document": "Ce qu'il faut documenter",
  "Connect each model to its provider and associated risks. This creates a full traceability map for your audit.":
    "Connectez chaque modèle à son fournisseur et à ses risques associés. Cela crée une carte de traçabilité complète pour votre audit.",
  "Key result": "Résultat clé",
  "Any machine learning model, large language model, computer vision system, or automated decision-making tool. Include both internal and third-party models.":
    "Tout modèle de machine learning, grand modèle de langage, système de vision par ordinateur ou outil de prise de décision automatisée. Incluez les modèles internes et tiers.",
  "Group evidence by the controls they support. This makes audit preparation faster and keeps your evidence library structured.":
    "Groupez les preuves par les contrôles qu'elles soutiennent. Cela accélère la préparation des audits et garde votre bibliothèque de preuves structurée.",
  "This registry manages all AI/LLM models and their associated risks within your organization. You can view, add, and manage model details and track model-specific risks and mitigation plans.":
    "Ce registre gère tous les modèles IA/LLM et leurs risques associés au sein de votre organisation. Vous pouvez consulter, ajouter et gérer les détails des modèles et suivre les risques propres à chaque modèle ainsi que les plans d'atténuation.",
  "View all risks associated with this model": "Voir tous les risques associés à ce modèle",
  "Copied to clipboard": "Copié dans le presse-papiers",
  "No risks found for this model.": "Aucun risque trouvé pour ce modèle.",
  "Connect each dataset to the models that use it for training or validation. This creates traceability for audits and impact analysis.":
    "Reliez chaque jeu de données aux modèles qui l'utilisent pour l'entraînement ou la validation. Cela crée une traçabilité pour les audits et les analyses d'impact.",
  "Note whether the dataset has been reviewed for bias, completeness, and accuracy. Track any known quality issues or limitations.":
    "Indiquez si le jeu de données a été examiné pour les biais, la complétude et l'exactitude. Consignez tout problème ou limitation de qualité connus.",
  "Policies, meeting minutes, configuration screenshots, training records, risk assessments, vendor agreements, and change logs.":
    "Politiques, comptes rendus de réunion, captures d'écran de configuration, enregistrements de formation, évaluations de risques, accords fournisseurs et journaux de changements.",
  "Record dataset name, source, size, format, and the date it was collected or last updated. Include any preprocessing steps applied.":
    "Consignez le nom, la source, la taille, le format du jeu de données et la date de collecte ou de dernière mise à jour. Incluez les étapes de prétraitement appliquées.",
  "Activity History": "Historique d'activité",
  "Automatically tracks every change to this model.":
    "Suit automatiquement chaque modification de ce modèle.",
  "Do you want to continue?": "Voulez-vous continuer ?",
  "No evaluations linked to any model yet": "Aucune évaluation encore liée à un modèle",
  "No model inventory data available.": "Aucune donnée d'inventaire de modèles disponible.",
  "Replace Share Link?": "Remplacer le lien de partage ?",
  "See what your team is working on and what updates they've made, in real time.":
    "Voyez en temps réel sur quoi travaille votre équipe et les mises à jour effectuées.",
  "Add new AI models to your inventory with comprehensive metadata including provider, version, capabilities, security assessment, and usage details.":
    "Ajoutez de nouveaux modèles IA à votre inventaire avec des métadonnées complètes incluant fournisseur, version, capacités, évaluation de sécurité et détails d'utilisation.",
  "Catalog and track all registered AI/ML models":
    "Cataloguer et suivre tous les modèles IA/ML enregistrés",
  "Document risks specific to your AI models. Track risk severity, assign owners, and define mitigation strategies.":
    "Documentez les risques spécifiques à vos modèles IA. Suivez la gravité des risques, attribuez les propriétaires et définissez les stratégies d'atténuation.",
  "Failed to load evidence data. Please try again later.":
    "Échec du chargement des données de preuve. Veuillez réessayer plus tard.",
  "Filter evidence files by type to quickly find compliance documentation, assessments, and audit artifacts.":
    "Filtrez les fichiers de preuve par type pour trouver rapidement la documentation de conformité, les évaluations et les artefacts d'audit.",
  "Focus on models that need attention by filtering by approval status. Quickly identify pending approvals or restricted models.":
    "Concentrez-vous sur les modèles nécessitant une attention en filtrant par statut d'approbation. Identifiez rapidement les approbations en attente ou les modèles restreints.",
  "LLM evaluations and bias audits linked to models in your inventory":
    "Évaluations LLM et audits de biais liés aux modèles de votre inventaire",
  "Link evaluations to models when creating experiments or bias audits in LLM Evals":
    "Liez les évaluations aux modèles lors de la création d'expériences ou d'audits de biais dans les évaluations LLM",
  "Search your model inventory by model name, provider, or version to quickly locate specific AI models in your registry.":
    "Recherchez votre inventaire de modèles par nom, fournisseur ou version pour localiser rapidement des modèles IA spécifiques dans votre registre.",
  "Technical file / CE documentation": "Dossier technique / Documentation CE",
  "Track your AI models by approval status at a glance: Approved, Restricted, Pending, and Blocked.":
    "Suivez vos modèles IA par statut d'approbation en un coup d'œil : Approuvé, Restreint, En attente et Bloqué.",
  "AI Quality": "AI Quality",
  "MAPPED TRAININGS": "FORMATIONS ASSOCIÉES",
  "Record each model's status: approved, restricted, pending, blocked, or rejected. This gives auditors visibility into your governance coverage.":
    "Enregistrez le statut de chaque modèle : approuvé, restreint, en attente, bloqué ou rejeté. Cela offre aux auditeurs une visibilité sur votre couverture de gouvernance.",
  "Set expiry dates on evidence so you're reminded to update or re-certify documents before they become stale.":
    "Définissez des dates d'expiration sur les preuves afin d'être averti de mettre à jour ou de recertifier les documents avant qu'ils ne deviennent obsolètes.",
  "MLFlow": "MLFlow",
  "Only admins can change retention periods":
    "Seuls les administrateurs peuvent modifier les durées de conservation",
};

export const es: Record<string, string> = {
  "Add threshold": "Añadir umbral",
  "Alerts & notifications": "Alertas y notificaciones",
  "Assigned to": "Asignado a",
  "Breach history": "Historial de incumplimientos",
  "Copy token": "Copiar token",
  "Copy your token now": "Copie su token ahora",
  "Create an ingestion token below (per-org, machine-to-machine, revocable).":
    "Cree un token de ingesta a continuación (por organización, de máquina a máquina, revocable).",
  "Create ingestion token": "Crear token de ingesta",
  "Default thresholds": "Umbrales predeterminados",
  "Example request": "Solicitud de ejemplo",
  "How to send metrics": "Cómo enviar métricas",
  "Ingestion tokens": "Tokens de ingesta",
  "Last received": "Última recepción",
  "Latest": "Último",
  "Maximum": "Máximo",
  "Metric": "Métrica",
  "Metric date": "Fecha de la métrica",
  "Metric trend": "Tendencia de la métrica",
  "Metrics feed & tokens": "Flujo de métricas y tokens",
  "Minimum": "Mínimo",
  "Name a machine-to-machine token your pipeline will use to push metrics.":
    "Asigne un nombre a un token de máquina a máquina que su canalización usará para enviar métricas.",
  "No breaches recorded. Every metric is within its threshold.":
    "No se registraron incumplimientos. Cada métrica está dentro de su umbral.",
  "No data yet. This model is awaiting its first metric from your monitoring feed.":
    "Aún no hay datos. Este modelo está esperando su primera métrica de su flujo de monitoreo.",
  "No ingestion tokens yet. Create one to start pushing metrics.":
    "Aún no hay tokens de ingesta. Cree uno para empezar a enviar métricas.",
  "No threshold defined": "Sin umbral definido",
  "No thresholds defined yet. Add one so ingested metrics can be evaluated.":
    "Aún no se han definido umbrales. Añada uno para que las métricas ingeridas puedan evaluarse.",
  "Notified on breach": "Notificado en caso de incumplimiento",
  "On breach": "En caso de incumplimiento",
  "POST a metric event to the model&apos;s URL, per metric, on your own cadence.":
    "Envíe un evento de métrica mediante POST a la URL del modelo, por métrica, a su propio ritmo.",
  "Payload schema": "Esquema de la carga útil",
  "Rotate": "Rotar",
  "Select a model to see who is notified of its breaches.":
    "Seleccione un modelo para ver quién recibe notificaciones de sus incumplimientos.",
  "Select a model to view its monitored metrics.":
    "Seleccione un modelo para ver sus métricas monitoreadas.",
  "Select a shape": "Seleccionar una forma",
  "Set the metric, shape and severity VerifyWise evaluates ingested points against.":
    "Defina la métrica, la forma y la gravedad con las que VerifyWise evalúa los puntos ingeridos.",
  "Shape": "Forma",
  "Threshold at evaluation": "Umbral en el momento de la evaluación",
  "Trend": "Tendencia",
  "Send email alerts": "Enviar alertas por correo electrónico",
  "Applies to breach and overdue-validation alerts. In-app notifications are always on.":
    "Se aplica a las alertas de incumplimiento y de validación vencida. Las notificaciones en la aplicación siempre están activas.",
  "Automatically open a finding on hard breach":
    "Abrir automáticamente un hallazgo ante un incumplimiento grave",
  "One finding per model and metric while it stays open; warnings never open findings.":
    "Un hallazgo por modelo y métrica mientras permanezca abierto; las advertencias nunca abren hallazgos.",
  "Additional recipients": "Destinatarios adicionales",
  "These people are alerted for every model, on top of the model's roles.":
    "Estas personas reciben alertas de todos los modelos, además de los roles del modelo.",
  "Save alert settings": "Guardar configuración de alertas",
  "Alert settings saved": "Configuración de alertas guardada",
  "Failed to save alert settings": "No se pudo guardar la configuración de alertas",
  "A finding must be verified before it can be closed.":
    "Un hallazgo debe verificarse antes de poder cerrarse.",
  "Assign tier": "Asignar nivel",
  "Conceptual soundness": "Solidez conceptual",
  "Conclusion & sign-off": "Conclusión y aprobación",
  "Create finding": "Crear hallazgo",
  "Data review": "Revisión de datos",
  "Does": "Función",
  "Due": "Vence",
  "Findings": "Hallazgos",
  "Findings & limitations": "Hallazgos y limitaciones",
  "How will this finding be remediated?": "¿Cómo se remediará este hallazgo?",
  "In validation": "En validación",
  "Last validated": "Última validación",
  "Materiality drivers": "Factores de materialidad",
  "Model risk management": "Gestión del riesgo de modelos",
  "Attestation": "Atestación",
  "Could not load the portfolio summary. Try again shortly.":
    "No se pudo cargar el resumen de la cartera. Vuelva a intentarlo en breve.",
  "Fleet attestation status": "Estado de atestación de la flota",
  "Generate attestation report": "Generar informe de atestación",
  "Advance this validation to In validation to begin writing the report.":
    "Avance esta validación a En validación para comenzar a redactar el informe.",
  "Models by tier": "Modelos por nivel",
  "Monitoring active": "Supervisión activa",
  "No models in the inventory yet. Add models and assign tiers to build the portfolio summary.":
    "Aún no hay modelos en el inventario. Agregue modelos y asigne niveles para crear el resumen de la cartera.",
  "No tiered models yet. Assign tiers on the Tiering tab.":
    "Aún no hay modelos clasificados. Asigne niveles en la pestaña «Clasificación».",
  "Open findings": "Hallazgos abiertos",
  "Overdue validations": "Validaciones vencidas",
  "Past their next due date": "Después de su próxima fecha de vencimiento",
  "Tiering up to date": "Clasificación actualizada",
  "Validation coverage": "Cobertura de validación",
  "Tier increase": "Aumento de nivel",
  "First use": "Primer uso",
  "Breach": "Incumplimiento",
  "Next due": "Próximo vencimiento",
  "No findings raised yet. Findings are created from a validation.":
    "Aún no hay hallazgos. Los hallazgos se crean a partir de una validación.",
  "No models to tier yet. Add models to your inventory first.":
    "Aún no hay modelos que clasificar. Añada primero modelos a su inventario.",
  "No validations yet. Start a validation to open a report.":
    "Aún no hay validaciones. Inicie una validación para abrir un informe.",
  "Not validated": "No validado",
  "On this model": "En este modelo",
  "Open a new validation cycle for a model. Only one validation can be in progress per model.":
    "Abra un nuevo ciclo de validación para un modelo. Solo puede haber una validación en curso por modelo.",
  "Outcomes analysis": "Análisis de resultados",
  "Purpose & scope": "Propósito y alcance",
  "Raise a finding against a validation. It joins the register and tracks to closure.":
    "Registre un hallazgo asociado a una validación. Se incorpora al registro y se sigue hasta su cierre.",
  "Record the validation outcome. This marks the validation as validated and closes the active cycle.":
    "Registre el resultado de la validación. Esto marca la validación como validada y cierra el ciclo activo.",
  "Remediation plan": "Plan de remediación",
  "Roles & independence": "Roles e independencia",
  "Save report": "Guardar informe",
  "Save roles": "Guardar roles",
  "Breach and evaluation history is always retained; this only ages out benign monitoring points.":
    "El historial de incumplimientos y evaluaciones siempre se conserva; esto solo depura puntos de monitoreo sin incidencias.",
  "Failed to save retention": "No se pudo guardar la retención",
  "Monitoring data retention (months)": "Retención de datos de monitoreo (meses)",
  "Retention must be at least 13 months": "La retención debe ser de al menos 13 meses",
  "Retention saved": "Retención guardada",
  "Save retention": "Guardar retención",
  "Select a model to view and assign its roles.":
    "Seleccione un modelo para ver y asignar sus roles.",
  "Select a tier": "Seleccionar un nivel",
  "Select a validation": "Seleccionar una validación",
  "Select an outcome": "Seleccionar un resultado",
  "Select stage": "Seleccionar una etapa",
  "Short description of the finding": "Breve descripción del hallazgo",
  "Sign off": "Aprobar",
  "Sign off validation": "Aprobar la validación",
  "Stage": "Etapa",
  "Start": "Iniciar",
  "Start validation": "Iniciar validación",
  "Tier": "Nivel",
  "Tier 1": "Nivel 1",
  "Tier 2": "Nivel 2",
  "Tier 3": "Nivel 3",
  "Tiered on": "Clasificado el",
  "Tiering": "Clasificación",
  "Tiering rules": "Reglas de clasificación",
  "Tiering, validation, findings and roles for model risk management":
    "Clasificación, validación, hallazgos y roles para la gestión del riesgo de modelos",
  "Validated": "Validado",
  "Validated with findings": "Validado con hallazgos",
  "Validation depth & revalidation cadence":
    "Profundidad de validación y frecuencia de revalidación",
  "Validation report": "Informe de validación",
  "Validator": "Validador",
  "Why this tier? e.g. capital impact, regulatory reporting, customer exposure":
    "¿Por qué este nivel? p. ej. impacto de capital, informes regulatorios, exposición de clientes",
  "Add model risk": "Añadir riesgo de modelo",
  "Add new model": "Añadir nuevo modelo",
  "Replace Link": "Reemplazar enlace",
  "Register new models": "Registrar nuevos modelos",
  "Track expiry dates": "Controlar fechas de caducidad",
  "Track model status": "Seguir el estado del modelo",
  "Link to models": "Vincular a modelos",
  "Link to vendors and risks": "Vincular a proveedores y riesgos",
  "Organize by control category": "Organizar por categoría de control",
  "Assessed": "Evaluado",
  "Not assessed": "Sin evaluar",
  "STATUS DATE": "FECHA DE ESTADO",
  "UPDATED": "ACTUALIZADO",
  "APPROVER": "APROBADOR",
  "CLASSIFICATION": "CLASIFICACIÓN",
  "Version change log": "Registro de cambios de versión",
  "Vendor model documentation": "Documentación del modelo del proveedor",
  "Model card": "Ficha del modelo",
  "Model status summary": "Resumen del estado del modelo",
  "MAPPED MODELS": "MODELOS MAPEADOS",
  "RISKS": "RIESGOS",
  "Evaluations": "Evaluaciones",
  "Evaluation metrics summary": "Resumen de métricas de evaluación",
  "ASSESSMENT": "EVALUACIÓN",
  "Security assessment": "Evaluación de seguridad",
  "Security assessment report": "Informe de evaluación de seguridad",
  "Risk assessment report": "Informe de evaluación de riesgos",
  "Bias and fairness report": "Informe de sesgo y equidad",
  "Robustness and stress test report": "Informe de robustez y pruebas de estrés",
  "Third-party audit report": "Informe de auditoría de terceros",
  "Conformity assessment report": "Informe de evaluación de la conformidad",
  "Internal approval record": "Registro de aprobación interna",
  "Data protection impact assessment": "Evaluación de impacto de protección de datos",
  "Human oversight plan": "Plan de supervisión humana",
  "Post-market monitoring plan": "Plan de seguimiento poscomercialización",
  "Filter by approval status": "Filtrar por estado de aprobación",
  "Filter evidence": "Filtrar evidencia",
  "No datasets found. Add a dataset to start tracking your AI training and validation data.":
    "No se encontraron conjuntos de datos. Añada un conjunto de datos para empezar a hacer seguimiento de sus datos de entrenamiento y validación de IA.",
  "No evidence yet. Upload documents that prove compliance with each requirement.":
    "Aún no hay evidencia. Suba documentos que demuestren el cumplimiento de cada requisito.",
  "No models registered yet. Maintain a complete inventory of all AI models your organization uses.":
    "Aún no hay modelos registrados. Mantenga un inventario completo de todos los modelos de IA que utiliza su organización.",
  "There are currently no model risks in this table.":
    "Actualmente no hay riesgos de modelo en esta tabla.",
  "Risks identified for models in your inventory":
    "Riesgos identificados para los modelos de su inventario",
  "Label data quality": "Calidad de los datos de etiquetado",
  "Compliance evidence and documentation for audits":
    "Evidencia y documentación de cumplimiento para auditorías",
  "What counts as a model?": "¿Qué se considera un modelo?",
  "What counts as evidence?": "¿Qué se considera evidencia?",
  "What to document": "Qué documentar",
  "Connect each model to its provider and associated risks. This creates a full traceability map for your audit.":
    "Conecte cada modelo con su proveedor y sus riesgos asociados. Esto crea un mapa de trazabilidad completo para su auditoría.",
  "Key result": "Resultado clave",
  "Any machine learning model, large language model, computer vision system, or automated decision-making tool. Include both internal and third-party models.":
    "Cualquier modelo de aprendizaje automático, gran modelo de lenguaje, sistema de visión por computador o herramienta de toma de decisiones automatizada. Incluya tanto modelos internos como de terceros.",
  "Group evidence by the controls they support. This makes audit preparation faster and keeps your evidence library structured.":
    "Agrupe la evidencia según los controles que respalda. Esto agiliza la preparación de auditorías y mantiene su biblioteca de evidencia estructurada.",
  "This registry manages all AI/LLM models and their associated risks within your organization. You can view, add, and manage model details and track model-specific risks and mitigation plans.":
    "Este registro gestiona todos los modelos de IA/LLM y sus riesgos asociados dentro de su organización. Puede ver, añadir y gestionar los detalles de los modelos y hacer seguimiento de los riesgos específicos de cada modelo y sus planes de mitigación.",
  "View all risks associated with this model": "Ver todos los riesgos asociados a este modelo",
  "Copied to clipboard": "Copiado al portapapeles",
  "No risks found for this model.": "No se han encontrado riesgos para este modelo.",
  "Connect each dataset to the models that use it for training or validation. This creates traceability for audits and impact analysis.":
    "Conecte cada conjunto de datos con los modelos que lo utilizan para entrenamiento o validación. Esto crea trazabilidad para las auditorías y el análisis de impacto.",
  "Note whether the dataset has been reviewed for bias, completeness, and accuracy. Track any known quality issues or limitations.":
    "Indique si el conjunto de datos se ha revisado en cuanto a sesgo, integridad y precisión. Haga un seguimiento de cualquier problema o limitación de calidad conocidos.",
  "Policies, meeting minutes, configuration screenshots, training records, risk assessments, vendor agreements, and change logs.":
    "Políticas, actas de reuniones, capturas de pantalla de configuración, registros de formación, evaluaciones de riesgos, acuerdos con proveedores y registros de cambios.",
  "Record dataset name, source, size, format, and the date it was collected or last updated. Include any preprocessing steps applied.":
    "Registre el nombre, la fuente, el tamaño, el formato del conjunto de datos y la fecha en que se recopiló o actualizó por última vez. Incluya cualquier paso de preprocesamiento aplicado.",
  "Activity History": "Historial de actividad",
  "Automatically tracks every change to this model.":
    "Hace un seguimiento automático de cada cambio en este modelo.",
  "Do you want to continue?": "¿Quieres continuar?",
  "No evaluations linked to any model yet": "Aún no hay evaluaciones vinculadas a ningún modelo",
  "No model inventory data available.": "No hay datos de inventario de modelos disponibles.",
  "Replace Share Link?": "¿Reemplazar enlace para compartir?",
  "See what your team is working on and what updates they've made, in real time.":
    "Vea en qué está trabajando su equipo y qué actualizaciones han realizado, en tiempo real.",
  "Add new AI models to your inventory with comprehensive metadata including provider, version, capabilities, security assessment, and usage details.":
    "Añada nuevos modelos de IA a su inventario con metadatos completos que incluyen proveedor, versión, capacidades, evaluación de seguridad y detalles de uso.",
  "Catalog and track all registered AI/ML models":
    "Catalogue y haga un seguimiento de todos los modelos de IA/ML registrados",
  "Document risks specific to your AI models. Track risk severity, assign owners, and define mitigation strategies.":
    "Documente los riesgos específicos de sus modelos de IA. Haga un seguimiento de la gravedad del riesgo, asigne responsables y defina estrategias de mitigación.",
  "Failed to load evidence data. Please try again later.":
    "No se pudieron cargar los datos de evidencia. Inténtelo de nuevo más tarde.",
  "Filter evidence files by type to quickly find compliance documentation, assessments, and audit artifacts.":
    "Filtre los archivos de evidencia por tipo para encontrar rápidamente documentación de cumplimiento, evaluaciones y artefactos de auditoría.",
  "Focus on models that need attention by filtering by approval status. Quickly identify pending approvals or restricted models.":
    "Céntrese en los modelos que requieren atención filtrando por estado de aprobación. Identifique rápidamente las aprobaciones pendientes o los modelos restringidos.",
  "LLM evaluations and bias audits linked to models in your inventory":
    "Evaluaciones de LLM y auditorías de sesgo vinculadas a los modelos de su inventario",
  "Link evaluations to models when creating experiments or bias audits in LLM Evals":
    "Vincule las evaluaciones a los modelos al crear experimentos o auditorías de sesgo en LLM Evals",
  "Search your model inventory by model name, provider, or version to quickly locate specific AI models in your registry.":
    "Busca en tu inventario de modelos por nombre de modelo, proveedor o versión para localizar rápidamente modelos de IA específicos en tu registro.",
  "Technical file / CE documentation": "Expediente técnico / Documentación CE",
  "Track your AI models by approval status at a glance: Approved, Restricted, Pending, and Blocked.":
    "Haz seguimiento de tus modelos de IA por estado de aprobación de un vistazo: Aprobado, Restringido, Pendiente y Bloqueado.",
  "AI Quality": "Calidad de la IA",
  "MAPPED TRAININGS": "FORMACIONES ASIGNADAS",
  "Record each model's status: approved, restricted, pending, blocked, or rejected. This gives auditors visibility into your governance coverage.":
    "Registre el estado de cada modelo: aprobado, restringido, pendiente, bloqueado o rechazado. Esto ofrece a los auditores visibilidad sobre su cobertura de gobernanza.",
  "Set expiry dates on evidence so you're reminded to update or re-certify documents before they become stale.":
    "Establezca fechas de caducidad en las evidencias para que se le recuerde actualizar o recertificar los documentos antes de que queden obsoletos.",
  "MLFlow": "MLFlow",
  "Only admins can change retention periods":
    "Solo los administradores pueden cambiar los periodos de retención",
};
