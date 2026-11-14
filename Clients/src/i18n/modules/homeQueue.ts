// Home queue (Today tab) strings for de, fr and es. English is the key.
// Templates keep their {placeholders}; fill() puts the values in.
// Spread into ../translations.ts.

export const de: Record<string, string> = {
  // Greeting (also used by Start here)
  "Good morning": "Guten Morgen",
  "Good afternoon": "Guten Tag",
  "Good evening": "Guten Abend",
  "Good night": "Gute Nacht",
  "Burning the midnight oil": "Noch spät bei der Arbeit",
  "Still up? You're dedicated": "Noch wach? Sie sind engagiert",
  "Night owl mode activated": "Nachteulen-Modus aktiviert",
  "Coffee might be needed": "Vielleicht ist ein Kaffee fällig",
  "Early bird or night owl": "Frühaufsteher oder Nachteule",
  "{greeting}, {name}": "{greeting}, {name}",
  "Everything that needs you today, in one list.":
    "Alles, was heute Ihre Aufmerksamkeit braucht, in einer Liste.",

  // Queue card
  "Needs your attention": "Braucht Ihre Aufmerksamkeit",
  "Show": "Anzeigen",
  "Filter by source": "Nach Quelle filtern",
  "Nothing needs you right now.": "Gerade braucht nichts Ihre Aufmerksamkeit.",
  "Nothing from this source needs you right now.":
    "Aus dieser Quelle braucht gerade nichts Ihre Aufmerksamkeit.",
  "Home couldn't be loaded": "Die Startseite konnte nicht geladen werden",
  "Try again in a moment.": "Versuchen Sie es gleich noch einmal.",
  "Loading your queue": "Ihre Liste wird geladen",
  "{source} couldn't be loaded.": "{source} konnte nicht geladen werden.",
  "Agent approvals aren't shown here yet.": "Agentenfreigaben werden hier noch nicht angezeigt.",

  // Sources
  "Policy reviews": "Richtlinienprüfungen",
  "Vendor reviews": "Anbieterprüfungen",
  "Model risk findings": "Modellrisiko-Feststellungen",

  // Item titles
  "Approval: {name}": "Freigabe: {name}",
  "Task: {name}": "Aufgabe: {name}",
  "Second review: {name}": "Zweitprüfung: {name}",
  "Intake review: {name}": "Intake-Prüfung: {name}",
  "Anonymous": "Anonym",
  "Risk: {name}": "Risiko: {name}",
  "Policy review: {name}": "Richtlinienprüfung: {name}",
  "Next vendor review: {name}": "Nächste Anbieterprüfung: {name}",
  "Vendor review: {name}": "Anbieterprüfung: {name}",
  "Incident: {name}": "Vorfall: {name}",
  "Untitled": "Ohne Titel",
  "Finding: {name}": "Feststellung: {name}",

  // Item context
  "step {step} of {count}": "Schritt {step} von {count}",
  "step {step}": "Schritt {step}",
  "waiting since today": "wartet seit heute",
  "waiting {count} day": "wartet seit {count} Tag",
  "waiting {count} days": "wartet seit {count} Tagen",
  "due {date}": "fällig am {date}",
  "review due {date}": "Prüfung fällig am {date}",

  // Counts strip
  "Intake waiting": "Wartende Intake-Anfragen",
  "Agents to review": "Zu prüfende Agenten",
  "AI on the record": "Erfasste KI",
  "Untreated risks": "Unbehandelte Risiken",
  "Vendor reviews due": "Fällige Anbieterprüfungen",
  "Policy reviews due": "Fällige Richtlinienprüfungen",
  "Prompts blocked or masked (last 24 hours)":
    "Blockierte oder maskierte Prompts (letzte 24 Stunden)",
  "Couldn't be loaded": "Konnte nicht geladen werden",
};

export const fr: Record<string, string> = {
  // Greeting (also used by Start here)
  "Good morning": "Bonjour",
  "Good afternoon": "Bon après-midi",
  "Good evening": "Bonsoir",
  "Good night": "Bonne nuit",
  "Burning the midnight oil": "Vous travaillez tard",
  "Still up? You're dedicated": "Encore debout ? Quel engagement",
  "Night owl mode activated": "Mode oiseau de nuit activé",
  "Coffee might be needed": "Un café s'impose peut-être",
  "Early bird or night owl": "Lève-tôt ou couche-tard",
  "{greeting}, {name}": "{greeting}, {name}",
  "Everything that needs you today, in one list.":
    "Tout ce qui demande votre attention aujourd'hui, dans une seule liste.",

  // Queue card
  "Needs your attention": "Demande votre attention",
  "Show": "Afficher",
  "Filter by source": "Filtrer par source",
  "Nothing needs you right now.": "Rien ne demande votre attention pour le moment.",
  "Nothing from this source needs you right now.":
    "Rien de cette source ne demande votre attention pour le moment.",
  "Home couldn't be loaded": "L'accueil n'a pas pu être chargé",
  "Try again in a moment.": "Réessayez dans un instant.",
  "Loading your queue": "Chargement de votre liste",
  "{source} couldn't be loaded.": "{source} : chargement impossible.",
  "Agent approvals aren't shown here yet.":
    "Les approbations d'agents ne sont pas encore affichées ici.",

  // Sources
  "Policy reviews": "Revues de politiques",
  "Vendor reviews": "Revues de fournisseurs",
  "Model risk findings": "Constats de risque de modèle",

  // Item titles
  "Approval: {name}": "Approbation : {name}",
  "Task: {name}": "Tâche : {name}",
  "Second review: {name}": "Deuxième revue : {name}",
  "Intake review: {name}": "Revue de demande : {name}",
  "Anonymous": "Anonyme",
  "Risk: {name}": "Risque : {name}",
  "Policy review: {name}": "Revue de politique : {name}",
  "Next vendor review: {name}": "Prochaine revue fournisseur : {name}",
  "Vendor review: {name}": "Revue fournisseur : {name}",
  "Incident: {name}": "Incident : {name}",
  "Untitled": "Sans titre",
  "Finding: {name}": "Constat : {name}",

  // Item context
  "step {step} of {count}": "étape {step} sur {count}",
  "step {step}": "étape {step}",
  "waiting since today": "en attente depuis aujourd'hui",
  "waiting {count} day": "en attente depuis {count} jour",
  "waiting {count} days": "en attente depuis {count} jours",
  "due {date}": "échéance le {date}",
  "review due {date}": "revue prévue le {date}",

  // Counts strip
  "Intake waiting": "Demandes en attente",
  "Agents to review": "Agents à examiner",
  "AI on the record": "IA répertoriées",
  "Untreated risks": "Risques non traités",
  "Vendor reviews due": "Revues de fournisseurs à faire",
  "Policy reviews due": "Revues de politiques à faire",
  "Prompts blocked or masked (last 24 hours)": "Prompts bloqués ou masqués (dernières 24 heures)",
  "Couldn't be loaded": "Chargement impossible",
};

export const es: Record<string, string> = {
  // Greeting (also used by Start here)
  "Good morning": "Buenos días",
  "Good afternoon": "Buenas tardes",
  "Good evening": "Buenas noches",
  "Good night": "Buenas noches",
  "Burning the midnight oil": "Trabajando hasta tarde",
  "Still up? You're dedicated": "¿Sigue despierto? Qué dedicación",
  "Night owl mode activated": "Modo noctámbulo activado",
  "Coffee might be needed": "Quizá haga falta un café",
  "Early bird or night owl": "Madrugador o noctámbulo",
  "{greeting}, {name}": "{greeting}, {name}",
  "Everything that needs you today, in one list.":
    "Todo lo que necesita su atención hoy, en una sola lista.",

  // Queue card
  "Needs your attention": "Necesita su atención",
  "Show": "Mostrar",
  "Filter by source": "Filtrar por origen",
  "Nothing needs you right now.": "Ahora mismo nada necesita su atención.",
  "Nothing from this source needs you right now.":
    "Ahora mismo nada de este origen necesita su atención.",
  "Home couldn't be loaded": "No se pudo cargar el inicio",
  "Try again in a moment.": "Vuelva a intentarlo en un momento.",
  "Loading your queue": "Cargando su lista",
  "{source} couldn't be loaded.": "No se pudo cargar {source}.",
  "Agent approvals aren't shown here yet.": "Las aprobaciones de agentes aún no se muestran aquí.",

  // Sources
  "Policy reviews": "Revisiones de políticas",
  "Vendor reviews": "Revisiones de proveedores",
  "Model risk findings": "Hallazgos de riesgo de modelos",

  // Item titles
  "Approval: {name}": "Aprobación: {name}",
  "Task: {name}": "Tarea: {name}",
  "Second review: {name}": "Segunda revisión: {name}",
  "Intake review: {name}": "Revisión de solicitud: {name}",
  "Anonymous": "Anónimo",
  "Risk: {name}": "Riesgo: {name}",
  "Policy review: {name}": "Revisión de política: {name}",
  "Next vendor review: {name}": "Próxima revisión de proveedor: {name}",
  "Vendor review: {name}": "Revisión de proveedor: {name}",
  "Incident: {name}": "Incidente: {name}",
  "Untitled": "Sin título",
  "Finding: {name}": "Hallazgo: {name}",

  // Item context
  "step {step} of {count}": "paso {step} de {count}",
  "step {step}": "paso {step}",
  "waiting since today": "en espera desde hoy",
  "waiting {count} day": "en espera desde hace {count} día",
  "waiting {count} days": "en espera desde hace {count} días",
  "due {date}": "vence el {date}",
  "review due {date}": "revisión el {date}",

  // Counts strip
  "Intake waiting": "Solicitudes en espera",
  "Agents to review": "Agentes por revisar",
  "AI on the record": "IA registrada",
  "Untreated risks": "Riesgos sin tratar",
  "Vendor reviews due": "Revisiones de proveedores pendientes",
  "Policy reviews due": "Revisiones de políticas pendientes",
  "Prompts blocked or masked (last 24 hours)":
    "Prompts bloqueados o enmascarados (últimas 24 horas)",
  "Couldn't be loaded": "No se pudo cargar",
};
