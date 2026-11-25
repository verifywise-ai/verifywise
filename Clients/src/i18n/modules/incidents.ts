// incidents strings for de, fr and es. English is the key.
// Spread into ../translations.ts. Other areas stay in that file for now.

export const de: Record<string, string> = {
  "Active + archived": "Aktiv + archiviert",
  "Archived only": "Nur archiviert",
  "Incident restored.": "Vorfall wiederhergestellt.",
  "Could not restore the incident. Please try again.":
    "Der Vorfall konnte nicht wiederhergestellt werden. Bitte versuchen Sie es erneut.",
  "Archive this incident?": "Diesen Vorfall archivieren?",
  "Archived incidents are left out of the default incident list, the dashboard, search and reports. You can restore it later from the Archived only view.":
    "Archivierte Vorfälle erscheinen nicht in der Standardliste der Vorfälle, im Dashboard, in der Suche und in Berichten. Sie können den Vorfall später in der Ansicht „Nur archiviert“ wiederherstellen.",
  "No archived incidents.": "Keine archivierten Vorfälle.",
  "Restore incident": "Vorfall wiederherstellen",
  "No incidents to link. Incidents appear here when they belong to this use case and are not archived.":
    "Keine Vorfälle zum Verknüpfen. Vorfälle erscheinen hier, wenn sie zu diesem Anwendungsfall gehören und nicht archiviert sind.",
  "The selected use case is no longer available.":
    "Der ausgewählte Anwendungsfall ist nicht mehr verfügbar.",
  "The selected affected model is no longer available.":
    "Das ausgewählte betroffene Modell ist nicht mehr verfügbar.",
  "The selected owner is no longer available.":
    "Der ausgewählte Verantwortliche ist nicht mehr verfügbar.",
  "The selected reporter is no longer available.":
    "Die ausgewählte meldende Person ist nicht mehr verfügbar.",
  "Add new incident": "Neuen Vorfall hinzufügen",
  "Log new incidents": "Neue Vorfälle erfassen",
  "Assign owners and track resolution": "Verantwortliche zuweisen und Lösung verfolgen",
  "APPROVED BY": "GENEHMIGT VON",
  "OCCURRED DATE": "EREIGNISDATUM",
  "Incident ID": "Vorfall-ID",
  "INCIDENT ID": "VORFALL-ID",
  "Search incidents": "Vorfälle suchen",
  "Search incidents...": "Vorfälle suchen...",
  "No incidents reported yet. Track and manage AI-related incidents to maintain compliance.":
    "Noch keine Vorfälle gemeldet. Verfolgen und verwalten Sie KI-bezogene Vorfälle zur Wahrung der Compliance.",
  "AFFECTED MODEL": "BETROFFENES MODELL",
  "Any unintended AI behavior, data breach, biased output, system outage, or safety concern. Log them early, even if minor.":
    "Jedes unbeabsichtigte KI-Verhalten, jede Datenpanne, voreingenommene Ausgabe, Systemstörung oder Sicherheitsbedenken. Erfassen Sie sie frühzeitig, auch wenn sie geringfügig sind.",
  "Incident lifecycle overview": "Übersicht des Vorfallslebenszyklus",
  "Document root cause and response": "Ursache und Reaktion dokumentieren",
  "What counts as an incident?": "Was zählt als Vorfall?",
  "End-to-end management of the AI incident lifecycle. You can log events in full detail, analyze root causes, and document corrective and preventive actions.":
    "Durchgängige Verwaltung des KI-Vorfallslebenszyklus. Ereignisse vollständig protokollieren, Ursachen analysieren und korrigierende sowie präventive Maßnahmen dokumentieren.",
  "Assign each incident to a responsible person and track it through to resolution. A clear ownership chain speeds up response times.":
    "Weisen Sie jedem Vorfall eine verantwortliche Person zu und verfolgen Sie ihn bis zur Lösung. Eine klare Verantwortungskette beschleunigt die Reaktionszeiten.",
  "Record what happened, why it happened, the impact, and what corrective actions were taken. This builds your incident response history.":
    "Erfassen, was passiert ist, warum, die Auswirkung und welche Korrekturmaßnahmen ergriffen wurden. Dies baut Ihren Vorfallsreaktionsverlauf auf.",
  "Click the card again to see all incidents.":
    "Klicken Sie erneut auf die Karte, um alle Vorfälle zu sehen.",
  "Document AI-related incidents with full details including severity, impact assessment, affected parties, immediate mitigations, and planned corrective actions.":
    "Dokumentieren Sie KI-bezogene Vorfälle mit vollständigen Details, einschließlich Schweregrad, Folgenabschätzung, Betroffene, Sofortmaßnahmen und geplante Korrekturmaßnahmen.",
  "Incident updated successfully!": "Vorfall erfolgreich aktualisiert!",
  "Monitor incidents across their lifecycle: Open, Investigating, Mitigated, Closed, Suspended, and Emergency action. Track resolution progress and identify incidents requiring immediate attention.":
    "Überwachen Sie Vorfälle über ihren Lebenszyklus: Offen, In Untersuchung, Gemildert, Geschlossen, Ausgesetzt und Notfallmaßnahme. Verfolgen Sie den Behebungsfortschritt und identifizieren Sie Vorfälle, die sofortige Aufmerksamkeit erfordern.",
  "New incident added successfully!": "Neuer Vorfall erfolgreich hinzugefügt!",
  "Record approval": "Genehmigung erfassen",
  "Set when approved or rejected": "Wird bei Genehmigung oder Ablehnung gesetzt",
  "Incident type is required.": "Der Vorfallstyp ist erforderlich.",
  "Severity is required.": "Der Schweregrad ist erforderlich.",
  "Cannot be in the future.": "Darf nicht in der Zukunft liegen.",
  "Detected date cannot be before the occurred date.":
    "Das Erkennungsdatum darf nicht vor dem Ereignisdatum liegen.",
  "Model / system version cannot exceed 255 characters.":
    "Modell-/Systemversion darf 255 Zeichen nicht überschreiten.",
  "Incident management": "Vorfallmanagement",
  "Use case": "Anwendungsfall",
  "USE CASE": "ANWENDUNGSFALL",
  "Select use case": "Anwendungsfall auswählen",
  "Use case is required.": "Der Anwendungsfall ist erforderlich.",
  "Occurred date is required.": "Das Ereignisdatum ist erforderlich.",
  "Detected date is required.": "Das Erkennungsdatum ist erforderlich.",
  "Reporter is required.": "Die meldende Person ist erforderlich.",
  "Select at least one category of harm.": "Wählen Sie mindestens eine Schadenskategorie aus.",
  "(none)": "(keine)",
  "View incident": "Vorfall anzeigen",
  "Edit incident": "Vorfall bearbeiten",
  "Create new incident": "Neuen Vorfall erstellen",
  "(Incident ID: {id})": "(Vorfall-ID: {id})",
  "Incident information": "Vorfallsinformationen",
  "Basic incident details": "Grundlegende Angaben zum Vorfall",
  "Impact assessment": "Folgenabschätzung",
  "What was affected": "Was betroffen war",
  "Response and actions": "Reaktion und Maßnahmen",
  "What was or will be done": "Was getan wurde oder getan wird",
  "Approval and reporting": "Genehmigung und Berichterstattung",
  "Update incident": "Vorfall aktualisieren",
  "Save incident": "Vorfall speichern",
  "Failed to update incident.": "Der Vorfall konnte nicht aktualisiert werden.",
  "Failed to add incident.": "Der Vorfall konnte nicht hinzugefügt werden.",
  "Filtering by {status}": "Gefiltert nach {status}",
  "Search by ID, use case or reporter": "Nach ID, Anwendungsfall oder meldender Person suchen",
  "Search incidents by ID, use case or reporter":
    "Vorfälle nach ID, Anwendungsfall oder meldender Person suchen",
  "Find an incident by its ID (for example INC-12), its use case or its reporter.":
    "Finden Sie einen Vorfall über seine ID (zum Beispiel INC-12), seinen Anwendungsfall oder die meldende Person.",
  "No incidents match these filters.": "Keine Vorfälle entsprechen diesen Filtern.",
  "No active incidents. Archived incidents are in the Archived only view.":
    "Keine aktiven Vorfälle. Archivierte Vorfälle finden Sie in der Ansicht „Nur archiviert“.",
  "Malfunction": "Fehlfunktion",
  "Unexpected behavior": "Unerwartetes Verhalten",
  "Model drift": "Modelldrift",
  "Misuse": "Missbrauch",
  "Data corruption": "Datenbeschädigung",
  "Security breach": "Sicherheitsverletzung",
  "Performance degradation": "Leistungsabfall",
  "Rights": "Grundrechte",
  "Property": "Eigentum",
  "Environment": "Umwelt",
  "Archive incident": "Vorfall archivieren",
  "Incident actions": "Aktionen für den Vorfall",
  "Linked tasks": "Verknüpfte Aufgaben",
  "No linked tasks you can see.": "Keine verknüpften Aufgaben, die Sie sehen können.",
};

export const fr: Record<string, string> = {
  "Active + archived": "Actifs + archivés",
  "Archived only": "Archivés uniquement",
  "Incident restored.": "Incident restauré.",
  "Could not restore the incident. Please try again.":
    "Impossible de restaurer l'incident. Veuillez réessayer.",
  "Archive this incident?": "Archiver cet incident ?",
  "Archived incidents are left out of the default incident list, the dashboard, search and reports. You can restore it later from the Archived only view.":
    "Les incidents archivés n'apparaissent pas dans la liste par défaut des incidents, le tableau de bord, la recherche et les rapports. Vous pourrez le restaurer plus tard depuis la vue « Archivés uniquement ».",
  "No archived incidents.": "Aucun incident archivé.",
  "Restore incident": "Restaurer l'incident",
  "No incidents to link. Incidents appear here when they belong to this use case and are not archived.":
    "Aucun incident à lier. Les incidents apparaissent ici lorsqu'ils appartiennent à ce cas d'usage et ne sont pas archivés.",
  "The selected use case is no longer available.":
    "Le cas d'usage sélectionné n'est plus disponible.",
  "The selected affected model is no longer available.":
    "Le modèle concerné sélectionné n'est plus disponible.",
  "The selected owner is no longer available.": "Le responsable sélectionné n'est plus disponible.",
  "The selected reporter is no longer available.":
    "La personne déclarante sélectionnée n'est plus disponible.",
  "Add new incident": "Ajouter un nouvel incident",
  "Log new incidents": "Consigner de nouveaux incidents",
  "Assign owners and track resolution": "Attribuer des responsables et suivre la résolution",
  "APPROVED BY": "APPROUVÉ PAR",
  "OCCURRED DATE": "DATE DE SURVENANCE",
  "Incident ID": "ID d'incident",
  "INCIDENT ID": "ID D'INCIDENT",
  "Search incidents": "Rechercher des incidents",
  "Search incidents...": "Rechercher des incidents...",
  "No incidents reported yet. Track and manage AI-related incidents to maintain compliance.":
    "Aucun incident signalé pour le moment. Suivez et gérez les incidents liés à l'IA pour maintenir la conformité.",
  "AFFECTED MODEL": "MODÈLE AFFECTÉ",
  "Any unintended AI behavior, data breach, biased output, system outage, or safety concern. Log them early, even if minor.":
    "Tout comportement IA non désiré, violation de données, résultat biaisé, panne système ou préoccupation de sécurité. Consignez-les tôt, même mineurs.",
  "Incident lifecycle overview": "Vue d'ensemble du cycle de vie des incidents",
  "Document root cause and response": "Documenter la cause racine et la réponse",
  "What counts as an incident?": "Qu'est-ce qui compte comme incident ?",
  "End-to-end management of the AI incident lifecycle. You can log events in full detail, analyze root causes, and document corrective and preventive actions.":
    "Gestion de bout en bout du cycle de vie des incidents IA. Vous pouvez consigner les événements en détail, analyser les causes racines et documenter les actions correctives et préventives.",
  "Assign each incident to a responsible person and track it through to resolution. A clear ownership chain speeds up response times.":
    "Attribuez chaque incident à une personne responsable et suivez-le jusqu'à résolution. Une chaîne de responsabilité claire accélère les délais de réponse.",
  "Record what happened, why it happened, the impact, and what corrective actions were taken. This builds your incident response history.":
    "Consignez ce qui s'est passé, pourquoi, l'impact et les actions correctives prises. Cela constitue votre historique de réponse aux incidents.",
  "Click the card again to see all incidents.":
    "Cliquez à nouveau sur la carte pour voir tous les incidents.",
  "Document AI-related incidents with full details including severity, impact assessment, affected parties, immediate mitigations, and planned corrective actions.":
    "Documentez les incidents liés à l'IA avec des détails complets, y compris la gravité, l'évaluation d'impact, les parties affectées, les atténuations immédiates et les actions correctives planifiées.",
  "Incident updated successfully!": "Incident mis à jour avec succès !",
  "Monitor incidents across their lifecycle: Open, Investigating, Mitigated, Closed, Suspended, and Emergency action. Track resolution progress and identify incidents requiring immediate attention.":
    "Surveillez les incidents tout au long de leur cycle de vie : Ouverts, En cours d'investigation, Atténués, Clôturés, Suspendus et Action d'urgence. Suivez la progression de la résolution et identifiez les incidents nécessitant une attention immédiate.",
  "New incident added successfully!": "Nouvel incident ajouté avec succès !",
  "Record approval": "Enregistrer l'approbation",
  "Set when approved or rejected": "Défini lors de l'approbation ou du rejet",
  "Incident type is required.": "Le type d'incident est obligatoire.",
  "Severity is required.": "La gravité est obligatoire.",
  "Cannot be in the future.": "Ne peut pas être dans le futur.",
  "Detected date cannot be before the occurred date.":
    "La date de détection ne peut pas être antérieure à la date de survenance.",
  "Model / system version cannot exceed 255 characters.":
    "La version du modèle / système ne peut pas dépasser 255 caractères.",
  "Incident management": "Gestion des incidents",
  "Use case": "Cas d'usage",
  "USE CASE": "CAS D'USAGE",
  "Select use case": "Sélectionner un cas d'usage",
  "Use case is required.": "Le cas d'usage est obligatoire.",
  "Occurred date is required.": "La date de survenue est obligatoire.",
  "Detected date is required.": "La date de détection est obligatoire.",
  "Reporter is required.": "La personne déclarante est obligatoire.",
  "Select at least one category of harm.": "Sélectionnez au moins une catégorie de préjudice.",
  "(none)": "(aucun)",
  "View incident": "Voir l'incident",
  "Edit incident": "Modifier l'incident",
  "Create new incident": "Créer un nouvel incident",
  "(Incident ID: {id})": "(ID de l'incident : {id})",
  "Incident information": "Informations sur l'incident",
  "Basic incident details": "Informations de base sur l'incident",
  "Impact assessment": "Évaluation de l'impact",
  "What was affected": "Ce qui a été touché",
  "Response and actions": "Réponse et actions",
  "What was or will be done": "Ce qui a été ou sera fait",
  "Approval and reporting": "Approbation et rapports",
  "Update incident": "Mettre à jour l'incident",
  "Save incident": "Enregistrer l'incident",
  "Failed to update incident.": "Impossible de mettre à jour l'incident.",
  "Failed to add incident.": "Impossible d'ajouter l'incident.",
  "Filtering by {status}": "Filtré par {status}",
  "Search by ID, use case or reporter": "Rechercher par ID, cas d'usage ou déclarant",
  "Search incidents by ID, use case or reporter":
    "Rechercher des incidents par ID, cas d'usage ou déclarant",
  "Find an incident by its ID (for example INC-12), its use case or its reporter.":
    "Trouvez un incident par son ID (par exemple INC-12), son cas d'usage ou son déclarant.",
  "No incidents match these filters.": "Aucun incident ne correspond à ces filtres.",
  "No active incidents. Archived incidents are in the Archived only view.":
    "Aucun incident actif. Les incidents archivés se trouvent dans la vue « Archivés uniquement ».",
  "Malfunction": "Dysfonctionnement",
  "Unexpected behavior": "Comportement inattendu",
  "Model drift": "Dérive du modèle",
  "Misuse": "Usage abusif",
  "Data corruption": "Corruption des données",
  "Security breach": "Faille de sécurité",
  "Performance degradation": "Dégradation des performances",
  "Rights": "Droits",
  "Property": "Biens",
  "Environment": "Environnement",
  "Archive incident": "Archiver l'incident",
  "Incident actions": "Actions sur l'incident",
  "Linked tasks": "Tâches liées",
  "No linked tasks you can see.": "Aucune tâche liée que vous pouvez voir.",
};

export const es: Record<string, string> = {
  "Active + archived": "Activos + archivados",
  "Archived only": "Solo archivados",
  "Incident restored.": "Incidente restaurado.",
  "Could not restore the incident. Please try again.":
    "No se pudo restaurar el incidente. Inténtelo de nuevo.",
  "Archive this incident?": "¿Archivar este incidente?",
  "Archived incidents are left out of the default incident list, the dashboard, search and reports. You can restore it later from the Archived only view.":
    "Los incidentes archivados no aparecen en la lista predeterminada de incidentes, el panel, la búsqueda ni los informes. Puede restaurarlo más tarde desde la vista «Solo archivados».",
  "No archived incidents.": "No hay incidentes archivados.",
  "Restore incident": "Restaurar incidente",
  "No incidents to link. Incidents appear here when they belong to this use case and are not archived.":
    "No hay incidentes para vincular. Los incidentes aparecen aquí cuando pertenecen a este caso de uso y no están archivados.",
  "The selected use case is no longer available.":
    "El caso de uso seleccionado ya no está disponible.",
  "The selected affected model is no longer available.":
    "El modelo afectado seleccionado ya no está disponible.",
  "The selected owner is no longer available.":
    "El responsable seleccionado ya no está disponible.",
  "The selected reporter is no longer available.":
    "La persona informante seleccionada ya no está disponible.",
  "Add new incident": "Añadir nuevo incidente",
  "Log new incidents": "Registrar nuevos incidentes",
  "Assign owners and track resolution": "Asignar responsables y seguir la resolución",
  "APPROVED BY": "APROBADO POR",
  "OCCURRED DATE": "FECHA DE OCURRENCIA",
  "Incident ID": "ID del incidente",
  "INCIDENT ID": "ID DEL INCIDENTE",
  "Search incidents": "Buscar incidentes",
  "Search incidents...": "Buscar incidentes...",
  "No incidents reported yet. Track and manage AI-related incidents to maintain compliance.":
    "Aún no se han notificado incidentes. Haga seguimiento y gestione los incidentes relacionados con la IA para mantener el cumplimiento.",
  "AFFECTED MODEL": "MODELO AFECTADO",
  "Any unintended AI behavior, data breach, biased output, system outage, or safety concern. Log them early, even if minor.":
    "Cualquier comportamiento no intencionado de la IA, violación de datos, resultado sesgado, interrupción del sistema o problema de seguridad. Regístrelos pronto, aunque sean menores.",
  "Incident lifecycle overview": "Resumen del ciclo de vida del incidente",
  "Document root cause and response": "Documente la causa raíz y la respuesta",
  "What counts as an incident?": "¿Qué se considera un incidente?",
  "End-to-end management of the AI incident lifecycle. You can log events in full detail, analyze root causes, and document corrective and preventive actions.":
    "Gestión de extremo a extremo del ciclo de vida de los incidentes de IA. Puede registrar los eventos con todo detalle, analizar las causas raíz y documentar las acciones correctivas y preventivas.",
  "Assign each incident to a responsible person and track it through to resolution. A clear ownership chain speeds up response times.":
    "Asigne cada incidente a un responsable y haga un seguimiento hasta su resolución. Una cadena de responsabilidad clara acelera los tiempos de respuesta.",
  "Record what happened, why it happened, the impact, and what corrective actions were taken. This builds your incident response history.":
    "Registre qué ocurrió, por qué ocurrió, el impacto y qué acciones correctivas se tomaron. Esto construye su historial de respuesta a incidentes.",
  "Click the card again to see all incidents.":
    "Vuelva a hacer clic en la tarjeta para ver todos los incidentes.",
  "Document AI-related incidents with full details including severity, impact assessment, affected parties, immediate mitigations, and planned corrective actions.":
    "Documente los incidentes relacionados con la IA con todos los detalles, incluidos la gravedad, la evaluación de impacto, las partes afectadas, las mitigaciones inmediatas y las acciones correctivas planificadas.",
  "Incident updated successfully!": "¡Incidente actualizado correctamente!",
  "Monitor incidents across their lifecycle: Open, Investigating, Mitigated, Closed, Suspended, and Emergency action. Track resolution progress and identify incidents requiring immediate attention.":
    "Supervise los incidentes a lo largo de su ciclo de vida: Abierto, En investigación, Mitigado, Cerrado, Suspendido y Acción de emergencia. Haga seguimiento del progreso de resolución e identifique los incidentes que requieren atención inmediata.",
  "New incident added successfully!": "¡Nuevo incidente añadido correctamente!",
  "Record approval": "Registrar la aprobación",
  "Set when approved or rejected": "Se establece al aprobar o rechazar",
  "Incident type is required.": "El tipo de incidente es obligatorio.",
  "Severity is required.": "La gravedad es obligatoria.",
  "Cannot be in the future.": "No puede estar en el futuro.",
  "Detected date cannot be before the occurred date.":
    "La fecha de detección no puede ser anterior a la fecha del suceso.",
  "Model / system version cannot exceed 255 characters.":
    "La versión del modelo / sistema no puede superar los 255 caracteres.",
  "Incident management": "Gestión de incidentes",
  "Use case": "Caso de uso",
  "USE CASE": "CASO DE USO",
  "Select use case": "Seleccionar caso de uso",
  "Use case is required.": "El caso de uso es obligatorio.",
  "Occurred date is required.": "La fecha de ocurrencia es obligatoria.",
  "Detected date is required.": "La fecha de detección es obligatoria.",
  "Reporter is required.": "La persona informante es obligatoria.",
  "Select at least one category of harm.": "Seleccione al menos una categoría de daño.",
  "(none)": "(ninguno)",
  "View incident": "Ver incidente",
  "Edit incident": "Editar incidente",
  "Create new incident": "Crear nuevo incidente",
  "(Incident ID: {id})": "(ID del incidente: {id})",
  "Incident information": "Información del incidente",
  "Basic incident details": "Datos básicos del incidente",
  "Impact assessment": "Evaluación del impacto",
  "What was affected": "Qué se vio afectado",
  "Response and actions": "Respuesta y acciones",
  "What was or will be done": "Qué se hizo o se hará",
  "Approval and reporting": "Aprobación e informes",
  "Update incident": "Actualizar incidente",
  "Save incident": "Guardar incidente",
  "Failed to update incident.": "No se pudo actualizar el incidente.",
  "Failed to add incident.": "No se pudo añadir el incidente.",
  "Filtering by {status}": "Filtrado por {status}",
  "Search by ID, use case or reporter": "Buscar por ID, caso de uso o informante",
  "Search incidents by ID, use case or reporter":
    "Buscar incidentes por ID, caso de uso o informante",
  "Find an incident by its ID (for example INC-12), its use case or its reporter.":
    "Encuentre un incidente por su ID (por ejemplo, INC-12), su caso de uso o su informante.",
  "No incidents match these filters.": "Ningún incidente coincide con estos filtros.",
  "No active incidents. Archived incidents are in the Archived only view.":
    "No hay incidentes activos. Los incidentes archivados están en la vista «Solo archivados».",
  "Malfunction": "Mal funcionamiento",
  "Unexpected behavior": "Comportamiento inesperado",
  "Model drift": "Deriva del modelo",
  "Misuse": "Uso indebido",
  "Data corruption": "Corrupción de datos",
  "Security breach": "Brecha de seguridad",
  "Performance degradation": "Degradación del rendimiento",
  "Rights": "Derechos",
  "Property": "Bienes",
  "Environment": "Medio ambiente",
  "Archive incident": "Archivar incidente",
  "Incident actions": "Acciones del incidente",
  "Linked tasks": "Tareas vinculadas",
  "No linked tasks you can see.": "No hay tareas vinculadas que pueda ver.",
};
