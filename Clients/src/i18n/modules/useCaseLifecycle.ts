// Use case lifecycle strings (#5187) for de, fr and es. English is the key.
// Spread into ../translations.ts.

export const de: Record<string, string> = {
  // AI app requests in In review, approval before going live (#5193)
  "Intake requests and AI apps waiting for an approval decision":
    "Intake-Anfragen und KI-Apps, die auf eine Freigabeentscheidung warten",
  "No AI apps are waiting for an approval decision.":
    "Keine KI-Apps warten auf eine Freigabeentscheidung.",
  "Submitted through an intake form. The AI app is created when a reviewer approves the request.":
    "Über ein Intake-Formular eingereicht. Die KI-App wird erstellt, wenn eine prüfende Person die Anfrage freigibt.",
  "Approve this AI app before marking it as live. Change its status to Approved or Restricted below.":
    "Geben Sie diese KI-App frei, bevor Sie sie als live markieren. Ändern Sie ihren Status unten auf „Freigegeben“ oder „Eingeschränkt“.",
  // AI apps lifecycle and intake (#5193)
  "AI app name": "Name der KI-App",
  "Collect requests to use an AI app": "Anfragen zur Nutzung einer KI-App erfassen",
  "Describe what you want to use the AI app for":
    "Beschreiben Sie, wofür Sie die KI-App nutzen möchten",
  "Enter the name of the AI app": "Geben Sie den Namen der KI-App ein",
  "Name of the AI app": "Name der KI-App",
  "Still-live check": "Prüfung auf weitere Nutzung",
  "Teams that use the AI app (several selections, or comma-separated text)":
    "Teams, die die KI-App nutzen (Mehrfachauswahl oder durch Kommas getrennter Text)",
  "What the AI app is used for": "Wofür die KI-App genutzt wird",
  "Use the product name people know it by, so reviewers can find it.":
    "Verwenden Sie den bekannten Produktnamen, damit Prüfende die App finden.",
  "Include the task, the data it will see, and who will use it.":
    "Nennen Sie die Aufgabe, die Daten, die sie sieht, und wer sie nutzt.",
  "e.g. Sales, Support": "z. B. Vertrieb, Support",
  "Separate several departments with commas.": "Trennen Sie mehrere Abteilungen durch Kommas.",
  "Departments": "Abteilungen",
  "AI app preview": "Vorschau der KI-App",
  "Approve and create AI app": "Freigeben und KI-App erstellen",
  "All AI app fields mapped": "Alle KI-App-Felder zugeordnet",
  "How often owners confirm their live use cases and AI apps are still in use. Entries nobody confirms are marked stale and their owners get an email.":
    "Wie oft Verantwortliche bestätigen, dass ihre aktiven Anwendungsfälle und KI-Apps noch genutzt werden. Unbestätigte Einträge werden als veraltet markiert und ihre Verantwortlichen erhalten eine E-Mail.",
  "Still-live check saved": "Prüfung auf weitere Nutzung gespeichert",
  "Failed to save the still-live check":
    "Prüfung auf weitere Nutzung konnte nicht gespeichert werden",
  "AI apps waiting for an approval decision": "KI-Apps, die auf eine Freigabeentscheidung warten",
  "AI apps that are not live yet": "KI-Apps, die noch nicht live sind",
  "AI apps in use today": "Derzeit genutzte KI-Apps",
  "AI apps that are no longer in use": "Nicht mehr genutzte KI-Apps",
  "No AI apps are waiting for review.": "Keine KI-Apps warten auf Prüfung.",
  "No planned AI apps.": "Keine geplanten KI-Apps.",
  "No live AI apps. Open a planned AI app and mark it as live.":
    "Keine aktiven KI-Apps. Öffnen Sie eine geplante KI-App und markieren Sie sie als live.",
  "No retired AI apps.": "Keine außer Betrieb genommenen KI-Apps.",
  "Nobody has confirmed this AI app is still live within the check interval set for your organization. Confirm it, or retire it if it is no longer in use.":
    "Niemand hat innerhalb des für Ihre Organisation festgelegten Prüfintervalls bestätigt, dass diese KI-App noch aktiv ist. Bestätigen Sie sie oder nehmen Sie sie außer Betrieb, wenn sie nicht mehr genutzt wird.",
  "Record the date this AI app went into use. Owners are asked to confirm it is still live at the interval set in Settings.":
    "Erfassen Sie das Datum, an dem diese KI-App in Betrieb ging. Verantwortliche werden im in den Einstellungen festgelegten Intervall um Bestätigung gebeten, dass sie noch aktiv ist.",
  "Retire AI app": "KI-App außer Betrieb nehmen",
  "A retired AI app stays in the inventory under Retired, with its history, but is no longer checked for being live.":
    "Eine außer Betrieb genommene KI-App bleibt mit ihrem Verlauf unter „Außer Betrieb“ im Inventar, wird aber nicht mehr auf Aktivität geprüft.",
  "No intake requests match your search.": "Keine Intake-Anfragen entsprechen Ihrer Suche.",
  "Showing the oldest": "Angezeigt werden die ältesten",
  "of": "von",
  "Intake requests are not included in the use case export.":
    "Intake-Anfragen sind im Export der Anwendungsfälle nicht enthalten.",
  // In review tab and time in review (#5188)
  "Approved in the last 12 months": "In den letzten 12 Monaten freigegeben",
  "Average": "Durchschnitt",
  "Median": "Median",
  "days": "Tage",
  "From submission to approval of use case intake requests.":
    "Von der Einreichung bis zur Freigabe von Intake-Anfragen für Anwendungsfälle.",
  "Intake requests": "Intake-Anfragen",
  "No intake requests were approved in the last 12 months":
    "In den letzten 12 Monaten wurden keine Intake-Anfragen freigegeben",
  "Time in review": "Zeit in Prüfung",
  "Untitled request": "Anfrage ohne Titel",
  "Request": "Anfrage",
  "Intake form": "Intake-Formular",
  "Submitted by": "Eingereicht von",
  "Submitted": "Eingereicht",
  "Days in review": "Tage in Prüfung",
  "Review": "Prüfen",
  "Submitted through an intake form. The use case is created when a reviewer approves the request.":
    "Über ein Intake-Formular eingereicht. Der Anwendungsfall wird erstellt, wenn eine prüfende Person die Anfrage freigibt.",
  "No use cases are waiting for an approval decision.":
    "Keine Anwendungsfälle warten auf eine Freigabeentscheidung.",
  "Intake requests and use cases waiting for an approval decision":
    "Intake-Anfragen und Anwendungsfälle, die auf eine Freigabeentscheidung warten",
  "Live": "Live",
  "Not set": "Nicht festgelegt",
  "Not yet": "Noch nicht",
  "Retire": "Außer Betrieb nehmen",
  "Retire use case": "Anwendungsfall außer Betrieb nehmen",
  "Retired on": "Außer Betrieb seit",
  "Go-live date": "Go-live-Datum",
  "Going live": "Geht live",
  "Regulation": "Regulierung",
  "No department": "Keine Abteilung",
  "Not classified": "Nicht klassifiziert",
  "Every 30 days": "Alle 30 Tage",
  "Every 90 days": "Alle 90 Tage",
  "Every 180 days": "Alle 180 Tage",
  "Ask owners to confirm": "Verantwortliche um Bestätigung bitten",
  "Live use case check": "Prüfung aktiver Anwendungsfälle",
  "Live use case check saved": "Prüfung aktiver Anwendungsfälle gespeichert",
  "Failed to save the live use case check":
    "Prüfung aktiver Anwendungsfälle konnte nicht gespeichert werden",
  "Save check interval": "Prüfintervall speichern",
  "How often owners confirm their live use cases are still in use. Unconfirmed use cases are marked stale and their owners get an email.":
    "Wie oft Verantwortliche bestätigen, dass ihre aktiven Anwendungsfälle noch genutzt werden. Unbestätigte Anwendungsfälle werden als veraltet markiert und ihre Verantwortlichen erhalten eine E-Mail.",
  "Confirm still live": "Weiterhin aktiv bestätigen",
  "Mark as live": "Als live markieren",
  "Edit department": "Abteilung bearbeiten",
  "For example, Finance": "Zum Beispiel Finanzen",
  "Last confirmed live": "Zuletzt als aktiv bestätigt",
  "Last confirmed or went live": "Zuletzt bestätigt oder live gegangen",
  "Live use cases by": "Aktive Anwendungsfälle nach",
  "Stale use cases": "Veraltete Anwendungsfälle",
  "This quarter": "Dieses Quartal",
  "Use case lifecycle": "Lebenszyklus der Anwendungsfälle",
  "Every live use case was confirmed recently":
    "Alle aktiven Anwendungsfälle wurden kürzlich bestätigt",
  "Nothing went live or was retired this quarter":
    "In diesem Quartal ging nichts live oder wurde außer Betrieb genommen",
  "No live use cases have a framework yet": "Noch kein aktiver Anwendungsfall hat ein Framework",
  "No live use cases yet": "Noch keine aktiven Anwendungsfälle",
  "The change could not be saved.": "Die Änderung konnte nicht gespeichert werden.",
  "The go-live date can't be later than today":
    "Das Go-live-Datum darf nicht nach dem heutigen Tag liegen",
  "Use cases waiting for an approval decision":
    "Anwendungsfälle, die auf eine Freigabeentscheidung warten",
  "Use cases that are not live yet": "Anwendungsfälle, die noch nicht live sind",
  "Use cases in use today": "Derzeit genutzte Anwendungsfälle",
  "Use cases that are no longer in use": "Nicht mehr genutzte Anwendungsfälle",
  "No use cases are waiting for review.": "Keine Anwendungsfälle warten auf Prüfung.",
  "No planned use cases.": "Keine geplanten Anwendungsfälle.",
  "No live use cases. Open a planned use case and mark it as live.":
    "Keine aktiven Anwendungsfälle. Öffnen Sie einen geplanten Anwendungsfall und markieren Sie ihn als live.",
  "No retired use cases.": "Keine außer Betrieb genommenen Anwendungsfälle.",
  "A retired use case stays in the inventory under Retired, with its history, but is no longer checked for being live.":
    "Ein außer Betrieb genommener Anwendungsfall bleibt mit seinem Verlauf unter „Außer Betrieb“ im Inventar, wird aber nicht mehr auf Aktivität geprüft.",
  "Record the date this use case went into use. Owners are asked to confirm it is still live at the interval set in Settings.":
    "Erfassen Sie das Datum, an dem dieser Anwendungsfall in Betrieb ging. Verantwortliche werden im in den Einstellungen festgelegten Intervall um Bestätigung gebeten, dass er noch aktiv ist.",
  "The team that runs this use case. Used to group live use cases on the dashboard.":
    "Das Team, das diesen Anwendungsfall betreibt. Wird verwendet, um aktive Anwendungsfälle im Dashboard zu gruppieren.",
  "Nobody has confirmed this use case is still live within the check interval set for your organization. Confirm it, or retire it if it is no longer in use.":
    "Niemand hat innerhalb des für Ihre Organisation festgelegten Prüfintervalls bestätigt, dass dieser Anwendungsfall noch aktiv ist. Bestätigen Sie ihn oder nehmen Sie ihn außer Betrieb, wenn er nicht mehr genutzt wird.",
  "Not confirmed as live within the check interval set for your organization. The owner has been asked to confirm it or retire it.":
    "Innerhalb des für Ihre Organisation festgelegten Prüfintervalls nicht als aktiv bestätigt. Die verantwortliche Person wurde gebeten, ihn zu bestätigen oder außer Betrieb zu nehmen.",
};

export const fr: Record<string, string> = {
  // AI app requests in In review, approval before going live (#5193)
  "Intake requests and AI apps waiting for an approval decision":
    "Demandes d'intake et applications IA en attente d'une décision d'approbation",
  "No AI apps are waiting for an approval decision.":
    "Aucune application IA n'attend de décision d'approbation.",
  "Submitted through an intake form. The AI app is created when a reviewer approves the request.":
    "Soumise via un formulaire d'intake. L'application IA est créée lorsqu'un examinateur approuve la demande.",
  "Approve this AI app before marking it as live. Change its status to Approved or Restricted below.":
    "Approuvez cette application IA avant de la marquer comme en service. Passez son statut à Approuvé ou Restreint ci-dessous.",
  // AI apps lifecycle and intake (#5193)
  "AI app name": "Nom de l'application IA",
  "Collect requests to use an AI app": "Recueillir des demandes d'utilisation d'une application IA",
  "Describe what you want to use the AI app for":
    "Décrivez à quoi vous souhaitez utiliser l'application IA",
  "Enter the name of the AI app": "Saisissez le nom de l'application IA",
  "Name of the AI app": "Nom de l'application IA",
  "Still-live check": "Vérification de mise en service",
  "Teams that use the AI app (several selections, or comma-separated text)":
    "Équipes qui utilisent l'application IA (plusieurs choix, ou texte séparé par des virgules)",
  "What the AI app is used for": "À quoi sert l'application IA",
  "Use the product name people know it by, so reviewers can find it.":
    "Utilisez le nom de produit connu de tous, pour que les examinateurs la retrouvent.",
  "Include the task, the data it will see, and who will use it.":
    "Indiquez la tâche, les données qu'elle verra et qui l'utilisera.",
  "e.g. Sales, Support": "ex. Ventes, Support",
  "Separate several departments with commas.": "Séparez plusieurs services par des virgules.",
  "Departments": "Services",
  "AI app preview": "Aperçu de l'application IA",
  "Approve and create AI app": "Approuver et créer l'application IA",
  "All AI app fields mapped": "Tous les champs de l'application IA sont associés",
  "How often owners confirm their live use cases and AI apps are still in use. Entries nobody confirms are marked stale and their owners get an email.":
    "Fréquence à laquelle les responsables confirment que leurs cas d'usage et applications IA en service sont toujours utilisés. Les entrées non confirmées sont marquées comme obsolètes et leurs responsables reçoivent un e-mail.",
  "Still-live check saved": "Vérification de mise en service enregistrée",
  "Failed to save the still-live check":
    "Impossible d'enregistrer la vérification de mise en service",
  "AI apps waiting for an approval decision":
    "Applications IA en attente d'une décision d'approbation",
  "AI apps that are not live yet": "Applications IA pas encore en service",
  "AI apps in use today": "Applications IA utilisées aujourd'hui",
  "AI apps that are no longer in use": "Applications IA qui ne sont plus utilisées",
  "No AI apps are waiting for review.": "Aucune application IA n'attend d'examen.",
  "No planned AI apps.": "Aucune application IA planifiée.",
  "No live AI apps. Open a planned AI app and mark it as live.":
    "Aucune application IA en service. Ouvrez une application IA planifiée et marquez-la comme en service.",
  "No retired AI apps.": "Aucune application IA retirée.",
  "Nobody has confirmed this AI app is still live within the check interval set for your organization. Confirm it, or retire it if it is no longer in use.":
    "Personne n'a confirmé que cette application IA est toujours en service dans l'intervalle de vérification défini pour votre organisation. Confirmez-la, ou retirez-la si elle n'est plus utilisée.",
  "Record the date this AI app went into use. Owners are asked to confirm it is still live at the interval set in Settings.":
    "Indiquez la date de mise en service de cette application IA. Les responsables sont invités à confirmer qu'elle est toujours en service selon l'intervalle défini dans les paramètres.",
  "Retire AI app": "Retirer l'application IA",
  "A retired AI app stays in the inventory under Retired, with its history, but is no longer checked for being live.":
    "Une application IA retirée reste dans l'inventaire sous Retiré, avec son historique, mais n'est plus vérifiée comme étant en service.",
  "No intake requests match your search.":
    "Aucune demande d'intake ne correspond à votre recherche.",
  "Showing the oldest": "Affichage des plus anciennes",
  "of": "sur",
  "Intake requests are not included in the use case export.":
    "Les demandes d'intake ne sont pas incluses dans l'export des cas d'usage.",
  // In review tab and time in review (#5188)
  "Approved in the last 12 months": "Approuvées au cours des 12 derniers mois",
  "Average": "Moyenne",
  "Median": "Médiane",
  "days": "jours",
  "From submission to approval of use case intake requests.":
    "De la soumission à l'approbation des demandes d'intake de cas d'usage.",
  "Intake requests": "Demandes d'intake",
  "No intake requests were approved in the last 12 months":
    "Aucune demande d'intake approuvée au cours des 12 derniers mois",
  "Time in review": "Temps en examen",
  "Untitled request": "Demande sans titre",
  "Request": "Demande",
  "Intake form": "Formulaire d'intake",
  "Submitted by": "Soumis par",
  "Submitted": "Soumis",
  "Days in review": "Jours en examen",
  "Review": "Examiner",
  "Submitted through an intake form. The use case is created when a reviewer approves the request.":
    "Soumise via un formulaire d'intake. Le cas d'usage est créé lorsqu'un examinateur approuve la demande.",
  "No use cases are waiting for an approval decision.":
    "Aucun cas d'usage n'attend de décision d'approbation.",
  "Intake requests and use cases waiting for an approval decision":
    "Demandes d'intake et cas d'usage en attente d'une décision d'approbation",
  "Live": "En service",
  "Not set": "Non défini",
  "Not yet": "Pas encore",
  "Retire": "Retirer",
  "Retire use case": "Retirer le cas d'usage",
  "Retired on": "Retiré le",
  "Go-live date": "Date de mise en service",
  "Going live": "Mise en service",
  "Regulation": "Réglementation",
  "No department": "Aucun service",
  "Not classified": "Non classé",
  "Every 30 days": "Tous les 30 jours",
  "Every 90 days": "Tous les 90 jours",
  "Every 180 days": "Tous les 180 jours",
  "Ask owners to confirm": "Demander aux responsables de confirmer",
  "Live use case check": "Vérification des cas d'usage en service",
  "Live use case check saved": "Vérification des cas d'usage en service enregistrée",
  "Failed to save the live use case check":
    "Impossible d'enregistrer la vérification des cas d'usage en service",
  "Save check interval": "Enregistrer l'intervalle de vérification",
  "How often owners confirm their live use cases are still in use. Unconfirmed use cases are marked stale and their owners get an email.":
    "Fréquence à laquelle les responsables confirment que leurs cas d'usage en service sont toujours utilisés. Les cas d'usage non confirmés sont marqués comme obsolètes et leurs responsables reçoivent un e-mail.",
  "Confirm still live": "Confirmer toujours en service",
  "Mark as live": "Marquer comme en service",
  "Edit department": "Modifier le service",
  "For example, Finance": "Par exemple, Finance",
  "Last confirmed live": "Dernière confirmation de mise en service",
  "Last confirmed or went live": "Dernière confirmation ou mise en service",
  "Live use cases by": "Cas d'usage en service par",
  "Stale use cases": "Cas d'usage obsolètes",
  "This quarter": "Ce trimestre",
  "Use case lifecycle": "Cycle de vie des cas d'usage",
  "Every live use case was confirmed recently":
    "Tous les cas d'usage en service ont été confirmés récemment",
  "Nothing went live or was retired this quarter":
    "Aucune mise en service ni aucun retrait ce trimestre",
  "No live use cases have a framework yet":
    "Aucun cas d'usage en service n'a encore de référentiel",
  "No live use cases yet": "Aucun cas d'usage en service pour l'instant",
  "The change could not be saved.": "La modification n'a pas pu être enregistrée.",
  "The go-live date can't be later than today":
    "La date de mise en service ne peut pas être postérieure à aujourd'hui",
  "Use cases waiting for an approval decision":
    "Cas d'usage en attente d'une décision d'approbation",
  "Use cases that are not live yet": "Cas d'usage pas encore en service",
  "Use cases in use today": "Cas d'usage utilisés aujourd'hui",
  "Use cases that are no longer in use": "Cas d'usage qui ne sont plus utilisés",
  "No use cases are waiting for review.": "Aucun cas d'usage n'attend d'examen.",
  "No planned use cases.": "Aucun cas d'usage planifié.",
  "No live use cases. Open a planned use case and mark it as live.":
    "Aucun cas d'usage en service. Ouvrez un cas d'usage planifié et marquez-le comme en service.",
  "No retired use cases.": "Aucun cas d'usage retiré.",
  "A retired use case stays in the inventory under Retired, with its history, but is no longer checked for being live.":
    "Un cas d'usage retiré reste dans l'inventaire sous Retiré, avec son historique, mais n'est plus vérifié comme étant en service.",
  "Record the date this use case went into use. Owners are asked to confirm it is still live at the interval set in Settings.":
    "Indiquez la date de mise en service de ce cas d'usage. Les responsables sont invités à confirmer qu'il est toujours en service selon l'intervalle défini dans les paramètres.",
  "The team that runs this use case. Used to group live use cases on the dashboard.":
    "L'équipe qui exploite ce cas d'usage. Sert à regrouper les cas d'usage en service dans le tableau de bord.",
  "Nobody has confirmed this use case is still live within the check interval set for your organization. Confirm it, or retire it if it is no longer in use.":
    "Personne n'a confirmé que ce cas d'usage est toujours en service dans l'intervalle de vérification défini pour votre organisation. Confirmez-le, ou retirez-le s'il n'est plus utilisé.",
  "Not confirmed as live within the check interval set for your organization. The owner has been asked to confirm it or retire it.":
    "Non confirmé comme en service dans l'intervalle de vérification défini pour votre organisation. Le responsable a été invité à le confirmer ou à le retirer.",
};

export const es: Record<string, string> = {
  // AI app requests in In review, approval before going live (#5193)
  "Intake requests and AI apps waiting for an approval decision":
    "Solicitudes de intake y apps de IA a la espera de una decisión de aprobación",
  "No AI apps are waiting for an approval decision.":
    "Ninguna app de IA espera una decisión de aprobación.",
  "Submitted through an intake form. The AI app is created when a reviewer approves the request.":
    "Enviada mediante un formulario de intake. La app de IA se crea cuando un revisor aprueba la solicitud.",
  "Approve this AI app before marking it as live. Change its status to Approved or Restricted below.":
    "Apruebe esta app de IA antes de marcarla como en producción. Cambie su estado a Aprobada o Restringida más abajo.",
  // AI apps lifecycle and intake (#5193)
  "AI app name": "Nombre de la app de IA",
  "Collect requests to use an AI app": "Recopilar solicitudes para usar una app de IA",
  "Describe what you want to use the AI app for": "Describa para qué quiere usar la app de IA",
  "Enter the name of the AI app": "Introduzca el nombre de la app de IA",
  "Name of the AI app": "Nombre de la app de IA",
  "Still-live check": "Comprobación de uso continuado",
  "Teams that use the AI app (several selections, or comma-separated text)":
    "Equipos que usan la app de IA (varias opciones o texto separado por comas)",
  "What the AI app is used for": "Para qué se usa la app de IA",
  "Use the product name people know it by, so reviewers can find it.":
    "Use el nombre de producto que la gente conoce, para que los revisores la encuentren.",
  "Include the task, the data it will see, and who will use it.":
    "Indique la tarea, los datos que verá y quién la usará.",
  "e.g. Sales, Support": "p. ej., Ventas, Soporte",
  "Separate several departments with commas.": "Separe varios departamentos con comas.",
  "Departments": "Departamentos",
  "AI app preview": "Vista previa de la app de IA",
  "Approve and create AI app": "Aprobar y crear la app de IA",
  "All AI app fields mapped": "Todos los campos de la app de IA asignados",
  "How often owners confirm their live use cases and AI apps are still in use. Entries nobody confirms are marked stale and their owners get an email.":
    "Con qué frecuencia los responsables confirman que sus casos de uso y apps de IA en producción siguen en uso. Las entradas sin confirmar se marcan como obsoletas y sus responsables reciben un correo.",
  "Still-live check saved": "Comprobación de uso continuado guardada",
  "Failed to save the still-live check": "No se pudo guardar la comprobación de uso continuado",
  "AI apps waiting for an approval decision":
    "Apps de IA a la espera de una decisión de aprobación",
  "AI apps that are not live yet": "Apps de IA que aún no están en producción",
  "AI apps in use today": "Apps de IA en uso actualmente",
  "AI apps that are no longer in use": "Apps de IA que ya no se usan",
  "No AI apps are waiting for review.": "Ninguna app de IA espera revisión.",
  "No planned AI apps.": "No hay apps de IA planificadas.",
  "No live AI apps. Open a planned AI app and mark it as live.":
    "No hay apps de IA en producción. Abra una app de IA planificada y márquela como en producción.",
  "No retired AI apps.": "No hay apps de IA retiradas.",
  "Nobody has confirmed this AI app is still live within the check interval set for your organization. Confirm it, or retire it if it is no longer in use.":
    "Nadie ha confirmado que esta app de IA siga en producción dentro del intervalo de comprobación de su organización. Confírmela o retírela si ya no se usa.",
  "Record the date this AI app went into use. Owners are asked to confirm it is still live at the interval set in Settings.":
    "Registre la fecha en que esta app de IA entró en uso. Se pide a los responsables que confirmen que sigue en producción con el intervalo definido en Configuración.",
  "Retire AI app": "Retirar la app de IA",
  "A retired AI app stays in the inventory under Retired, with its history, but is no longer checked for being live.":
    "Una app de IA retirada permanece en el inventario en Retirado, con su historial, pero ya no se comprueba si está en producción.",
  "No intake requests match your search.": "Ninguna solicitud de intake coincide con su búsqueda.",
  "Showing the oldest": "Se muestran las más antiguas",
  "of": "de",
  "Intake requests are not included in the use case export.":
    "Las solicitudes de intake no se incluyen en la exportación de casos de uso.",
  // In review tab and time in review (#5188)
  "Approved in the last 12 months": "Aprobadas en los últimos 12 meses",
  "Average": "Promedio",
  "Median": "Mediana",
  "days": "días",
  "From submission to approval of use case intake requests.":
    "Desde el envío hasta la aprobación de las solicitudes de intake de casos de uso.",
  "Intake requests": "Solicitudes de intake",
  "No intake requests were approved in the last 12 months":
    "No se aprobó ninguna solicitud de intake en los últimos 12 meses",
  "Time in review": "Tiempo en revisión",
  "Untitled request": "Solicitud sin título",
  "Request": "Solicitud",
  "Intake form": "Formulario de intake",
  "Submitted by": "Enviado por",
  "Submitted": "Enviado",
  "Days in review": "Días en revisión",
  "Review": "Revisar",
  "Submitted through an intake form. The use case is created when a reviewer approves the request.":
    "Enviada mediante un formulario de intake. El caso de uso se crea cuando un revisor aprueba la solicitud.",
  "No use cases are waiting for an approval decision.":
    "Ningún caso de uso espera una decisión de aprobación.",
  "Intake requests and use cases waiting for an approval decision":
    "Solicitudes de intake y casos de uso a la espera de una decisión de aprobación",
  "Live": "En producción",
  "Not set": "Sin definir",
  "Not yet": "Todavía no",
  "Retire": "Retirar",
  "Retire use case": "Retirar el caso de uso",
  "Retired on": "Retirado el",
  "Go-live date": "Fecha de puesta en producción",
  "Going live": "Puesta en producción",
  "Regulation": "Regulación",
  "No department": "Sin departamento",
  "Not classified": "Sin clasificar",
  "Every 30 days": "Cada 30 días",
  "Every 90 days": "Cada 90 días",
  "Every 180 days": "Cada 180 días",
  "Ask owners to confirm": "Pedir a los responsables que confirmen",
  "Live use case check": "Comprobación de casos de uso en producción",
  "Live use case check saved": "Comprobación de casos de uso en producción guardada",
  "Failed to save the live use case check":
    "No se pudo guardar la comprobación de casos de uso en producción",
  "Save check interval": "Guardar intervalo de comprobación",
  "How often owners confirm their live use cases are still in use. Unconfirmed use cases are marked stale and their owners get an email.":
    "Con qué frecuencia los responsables confirman que sus casos de uso en producción siguen en uso. Los casos de uso sin confirmar se marcan como obsoletos y sus responsables reciben un correo.",
  "Confirm still live": "Confirmar que sigue en producción",
  "Mark as live": "Marcar como en producción",
  "Edit department": "Editar departamento",
  "For example, Finance": "Por ejemplo, Finanzas",
  "Last confirmed live": "Última confirmación en producción",
  "Last confirmed or went live": "Última confirmación o puesta en producción",
  "Live use cases by": "Casos de uso en producción por",
  "Stale use cases": "Casos de uso obsoletos",
  "This quarter": "Este trimestre",
  "Use case lifecycle": "Ciclo de vida de los casos de uso",
  "Every live use case was confirmed recently":
    "Todos los casos de uso en producción se confirmaron recientemente",
  "Nothing went live or was retired this quarter":
    "Nada se puso en producción ni se retiró este trimestre",
  "No live use cases have a framework yet": "Ningún caso de uso en producción tiene aún un marco",
  "No live use cases yet": "Todavía no hay casos de uso en producción",
  "The change could not be saved.": "No se pudo guardar el cambio.",
  "The go-live date can't be later than today":
    "La fecha de puesta en producción no puede ser posterior a hoy",
  "Use cases waiting for an approval decision":
    "Casos de uso a la espera de una decisión de aprobación",
  "Use cases that are not live yet": "Casos de uso que aún no están en producción",
  "Use cases in use today": "Casos de uso en uso actualmente",
  "Use cases that are no longer in use": "Casos de uso que ya no se usan",
  "No use cases are waiting for review.": "Ningún caso de uso espera revisión.",
  "No planned use cases.": "No hay casos de uso planificados.",
  "No live use cases. Open a planned use case and mark it as live.":
    "No hay casos de uso en producción. Abra un caso de uso planificado y márquelo como en producción.",
  "No retired use cases.": "No hay casos de uso retirados.",
  "A retired use case stays in the inventory under Retired, with its history, but is no longer checked for being live.":
    "Un caso de uso retirado permanece en el inventario en Retirado, con su historial, pero ya no se comprueba si está en producción.",
  "Record the date this use case went into use. Owners are asked to confirm it is still live at the interval set in Settings.":
    "Registre la fecha en que este caso de uso entró en uso. Se pide a los responsables que confirmen que sigue en producción con el intervalo definido en Configuración.",
  "The team that runs this use case. Used to group live use cases on the dashboard.":
    "El equipo que gestiona este caso de uso. Se usa para agrupar los casos de uso en producción en el panel.",
  "Nobody has confirmed this use case is still live within the check interval set for your organization. Confirm it, or retire it if it is no longer in use.":
    "Nadie ha confirmado que este caso de uso siga en producción dentro del intervalo de comprobación de su organización. Confírmelo o retírelo si ya no se usa.",
  "Not confirmed as live within the check interval set for your organization. The owner has been asked to confirm it or retire it.":
    "No se ha confirmado que siga en producción dentro del intervalo de comprobación de su organización. Se ha pedido al responsable que lo confirme o lo retire.",
};
