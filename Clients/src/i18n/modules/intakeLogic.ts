// Intake form builder logic overview strings for de, fr and es. English is the key.
// Spread into ../translations.ts. Numbers and field names stay outside these
// strings, so sentences around them are split into parts.

export const de: Record<string, string> = {
  "Other problems": "Weitere Probleme",
  "missing field": "fehlendes Feld",
  "Scores less than": "Bewertungen weniger als",
  "points from": "Punkte von",
  "of regular review approvals by reviewers who are not expert reviewers are picked at random for a second review by an expert reviewer.":
    "der regulären Genehmigungen durch Prüfer, die keine Expertenprüfer sind, werden zufällig für eine zweite Prüfung durch einen Expertenprüfer ausgewählt.",
  "Logic": "Logik",
  "What each rule and formula reads. Click a row to edit it.":
    "Was jede Regel und Formel liest. Klicken Sie auf eine Zeile, um sie zu bearbeiten.",
  "Calculated values": "Berechnete Werte",
  "No calculated values yet. Add a calculated field from the Advanced section.":
    "Noch keine berechneten Werte. Fügen Sie ein berechnetes Feld aus dem Bereich Erweitert hinzu.",
  "No formula yet": "Noch keine Formel",
  "Conditional fields": "Bedingte Felder",
  "No conditional fields yet.": "Noch keine bedingten Felder.",
  "Feeds": "Fließt ein in",
  "Reviewer assignment": "Prüferzuweisung",
  "Reviewer assignment is off. Turn it on in Form settings.":
    "Die Prüferzuweisung ist aus. Schalten Sie sie in den Formulareinstellungen ein.",
  "Prohibited practices go to expert reviewers.": "Verbotene Praktiken gehen an Expertenprüfer.",
  "Submissions without a score go to expert reviewers.":
    "Einreichungen ohne Bewertung gehen an Expertenprüfer.",
  "or more go to expert reviewers.": "oder mehr gehen an Expertenprüfer.",
  "Other submissions go to regular reviewers.": "Andere Einreichungen gehen an reguläre Prüfer.",
  "Expert reviewers:": "Expertenprüfer:",
  "Regular reviewers:": "Reguläre Prüfer:",
  // Routing number tooltips
  "About the threshold": "Über den Schwellenwert",
  "About the close-call margin": "Über die Spanne für Grenzfälle",
  "About the second review share": "Über den Anteil der Zweitprüfungen",
  "Scores at or above the threshold go to expert reviewers. Lower scores go to regular reviewers, unless they are within the close-call margin.":
    "Werte ab dem Schwellenwert gehen an Expertenprüfer. Niedrigere Werte gehen an reguläre Prüfer, außer sie liegen innerhalb der Spanne für Grenzfälle.",
  "Scores below the threshold but within this margin of it also go to expert reviewers.":
    "Werte unter dem Schwellenwert, die innerhalb dieser Spanne liegen, gehen ebenfalls an Expertenprüfer.",
  "Approvals in the regular lane by anyone who isn't an expert reviewer are picked at random at this rate for a second review. Rejections aren't picked.":
    "Genehmigungen in der regulären Spur von Personen, die keine Expertenprüfer sind, werden mit dieser Rate zufällig für eine Zweitprüfung ausgewählt. Ablehnungen werden nicht ausgewählt.",
  "Risk scores run from 0 to 100": "Risikowerte reichen von 0 bis 100",
  "Prohibited practices always go to expert reviewers. So do submissions that have no score or whose AI scoring failed.":
    "Verbotene Praktiken gehen immer an Expertenprüfer. Das gilt auch für Einreichungen ohne Wert oder mit fehlgeschlagener KI-Bewertung.",
};

export const fr: Record<string, string> = {
  "Other problems": "Autres problèmes",
  "missing field": "champ manquant",
  "Scores less than": "Les scores à moins de",
  "points from": "points de",
  "of regular review approvals by reviewers who are not expert reviewers are picked at random for a second review by an expert reviewer.":
    "des approbations en revue habituelle par des réviseurs qui ne sont pas experts sont tirées au hasard pour une deuxième revue par un réviseur expert.",
  "Logic": "Logique",
  "What each rule and formula reads. Click a row to edit it.":
    "Ce que lit chaque règle et chaque formule. Cliquez sur une ligne pour la modifier.",
  "Calculated values": "Valeurs calculées",
  "No calculated values yet. Add a calculated field from the Advanced section.":
    "Aucune valeur calculée pour le moment. Ajoutez un champ calculé depuis la section Avancé.",
  "No formula yet": "Pas encore de formule",
  "Conditional fields": "Champs conditionnels",
  "No conditional fields yet.": "Aucun champ conditionnel pour le moment.",
  "Feeds": "Alimente",
  "Reviewer assignment": "Attribution des réviseurs",
  "Reviewer assignment is off. Turn it on in Form settings.":
    "L'attribution des réviseurs est désactivée. Activez-la dans les paramètres du formulaire.",
  "Prohibited practices go to expert reviewers.":
    "Les pratiques interdites vont aux réviseurs experts.",
  "Submissions without a score go to expert reviewers.":
    "Les soumissions sans score vont aux réviseurs experts.",
  "or more go to expert reviewers.": "ou plus vont aux réviseurs experts.",
  "Other submissions go to regular reviewers.":
    "Les autres soumissions vont aux réviseurs habituels.",
  "Expert reviewers:": "Réviseurs experts :",
  "Regular reviewers:": "Réviseurs habituels :",
  // Routing number tooltips
  "About the threshold": "À propos du seuil",
  "About the close-call margin": "À propos de la marge des cas limites",
  "About the second review share": "À propos de la part de seconds examens",
  "Scores at or above the threshold go to expert reviewers. Lower scores go to regular reviewers, unless they are within the close-call margin.":
    "Les scores égaux ou supérieurs au seuil vont aux réviseurs experts. Les scores inférieurs vont aux réviseurs habituels, sauf s'ils sont dans la marge des cas limites.",
  "Scores below the threshold but within this margin of it also go to expert reviewers.":
    "Les scores sous le seuil mais dans cette marge vont aussi aux réviseurs experts.",
  "Approvals in the regular lane by anyone who isn't an expert reviewer are picked at random at this rate for a second review. Rejections aren't picked.":
    "Les approbations du circuit habituel faites par une personne qui n'est pas réviseur expert sont tirées au hasard à ce taux pour un second examen. Les refus ne sont pas tirés.",
  "Risk scores run from 0 to 100": "Les scores de risque vont de 0 à 100",
  "Prohibited practices always go to expert reviewers. So do submissions that have no score or whose AI scoring failed.":
    "Les pratiques interdites vont toujours aux réviseurs experts. Les soumissions sans score ou dont l'évaluation par IA a échoué aussi.",
};

export const es: Record<string, string> = {
  "Other problems": "Otros problemas",
  "missing field": "campo faltante",
  "Scores less than": "Las puntuaciones a menos de",
  "points from": "puntos de",
  "of regular review approvals by reviewers who are not expert reviewers are picked at random for a second review by an expert reviewer.":
    "de las aprobaciones en revisión habitual hechas por revisores que no son expertos se eligen al azar para una segunda revisión de un revisor experto.",
  "Logic": "Lógica",
  "What each rule and formula reads. Click a row to edit it.":
    "Lo que lee cada regla y fórmula. Haga clic en una fila para editarla.",
  "Calculated values": "Valores calculados",
  "No calculated values yet. Add a calculated field from the Advanced section.":
    "Aún no hay valores calculados. Agregue un campo calculado desde la sección Avanzado.",
  "No formula yet": "Aún no hay fórmula",
  "Conditional fields": "Campos condicionales",
  "No conditional fields yet.": "Aún no hay campos condicionales.",
  "Feeds": "Alimenta",
  "Reviewer assignment": "Asignación de revisores",
  "Reviewer assignment is off. Turn it on in Form settings.":
    "La asignación de revisores está desactivada. Actívela en la configuración del formulario.",
  "Prohibited practices go to expert reviewers.":
    "Las prácticas prohibidas pasan a los revisores expertos.",
  "Submissions without a score go to expert reviewers.":
    "Los envíos sin puntuación pasan a los revisores expertos.",
  "or more go to expert reviewers.": "o más pasan a los revisores expertos.",
  "Other submissions go to regular reviewers.":
    "Los demás envíos pasan a los revisores habituales.",
  "Expert reviewers:": "Revisores expertos:",
  "Regular reviewers:": "Revisores habituales:",
  // Routing number tooltips
  "About the threshold": "Acerca del umbral",
  "About the close-call margin": "Acerca del margen de casos límite",
  "About the second review share": "Acerca de la proporción de segundas revisiones",
  "Scores at or above the threshold go to expert reviewers. Lower scores go to regular reviewers, unless they are within the close-call margin.":
    "Las puntuaciones iguales o superiores al umbral pasan a los revisores expertos. Las inferiores pasan a los revisores habituales, salvo que estén dentro del margen de casos límite.",
  "Scores below the threshold but within this margin of it also go to expert reviewers.":
    "Las puntuaciones por debajo del umbral pero dentro de este margen también pasan a los revisores expertos.",
  "Approvals in the regular lane by anyone who isn't an expert reviewer are picked at random at this rate for a second review. Rejections aren't picked.":
    "Las aprobaciones del circuito habitual hechas por alguien que no es revisor experto se eligen al azar con esta tasa para una segunda revisión. Los rechazos no se eligen.",
  "Risk scores run from 0 to 100": "Las puntuaciones de riesgo van de 0 a 100",
  "Prohibited practices always go to expert reviewers. So do submissions that have no score or whose AI scoring failed.":
    "Las prácticas prohibidas siempre pasan a los revisores expertos. También los envíos sin puntuación o cuya evaluación por IA falló.",
};
