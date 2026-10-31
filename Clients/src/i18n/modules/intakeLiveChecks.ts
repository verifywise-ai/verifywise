// Intake live checks strings for de, fr and es. English is the key.
// Spread into ../translations.ts. Rule hint copy must match RULE_COPY in
// application/utils/intakeLiveChecks/ruleTerms.ts word for word.

export const de: Record<string, string> = {
  // Reviewer view and form builder
  "Intake checks": "Intake-Prüfungen",
  "No answers were flagged.": "Keine Antworten wurden markiert.",
  "AI checks still running": "KI-Prüfungen laufen noch",
  "AI checks unavailable": "KI-Prüfungen nicht verfügbar",
  "AI-suggested from": "KI-Vorschlag aus",
  "Not confirmed": "Nicht bestätigt",
  "Check answers while the submitter types": "Antworten während der Eingabe prüfen",
  "AI checks and vendor document prefill need the form's LLM key. Rule checks match English answers.":
    "KI-Prüfungen und das Ausfüllen aus Anbieterdokumenten benötigen den LLM-Schlüssel des Formulars. Regelprüfungen erkennen englische Antworten.",
  // Public form
  "AI can point out vague or conflicting answers when you select Check my answers. Your answers go to AI only when you ask.":
    "KI kann auf vage oder widersprüchliche Antworten hinweisen, wenn Sie Meine Antworten prüfen wählen. Ihre Antworten gehen nur an die KI, wenn Sie das möchten.",
  "Check my answers": "Meine Antworten prüfen",
  "Checking answers": "Antworten werden geprüft",
  "Check again": "Erneut prüfen",
  "This check didn't work. You can try again.":
    "Diese Prüfung hat nicht funktioniert. Sie können es erneut versuchen.",
  "Nothing else to flag": "Keine weiteren Hinweise",
  "Checked. Edit an answer to check again.":
    "Geprüft. Ändern Sie eine Antwort, um erneut zu prüfen.",
  "Write a sentence or two first": "Schreiben Sie zuerst ein oder zwei Sätze",
  "Intake assistant": "Intake-Assistent",
  "These checks never block submission. Your reviewer sees them too.":
    "Diese Prüfungen verhindern das Absenden nie. Ihr Prüfer sieht sie ebenfalls.",
  "AI checks paused for a few minutes": "KI-Prüfungen für einige Minuten pausiert",
  "No hints so far.": "Bisher keine Hinweise.",
  "Possible regulated use": "Mögliche regulierte Nutzung",
  "Conflicting answers": "Widersprüchliche Antworten",
  "answer was read from the vendor document. Confirm before submitting.":
    "Antwort wurde aus dem Anbieterdokument gelesen. Bitte vor dem Absenden bestätigen.",
  "answers were read from the vendor document. Confirm before submitting.":
    "Antworten wurden aus dem Anbieterdokument gelesen. Bitte vor dem Absenden bestätigen.",
  "Fill from a vendor document": "Aus einem Anbieterdokument ausfüllen",
  "Upload a PDF or Word file, up to 10 MB. AI suggests answers for empty questions, and you confirm each one.":
    "Laden Sie eine PDF- oder Word-Datei mit bis zu 10 MB hoch. Die KI schlägt Antworten für leere Fragen vor, und Sie bestätigen jede einzeln.",
  "Choose a file": "Datei auswählen",
  "Reading the document...": "Dokument wird gelesen...",
  "This file is larger than 10 MB.": "Diese Datei ist größer als 10 MB.",
  "No answers were found in this document for the empty questions.":
    "In diesem Dokument wurden keine Antworten für die leeren Fragen gefunden.",
  "We couldn't read answers from this document. You can fill in the form as usual.":
    "Wir konnten keine Antworten aus diesem Dokument lesen. Sie können das Formular wie gewohnt ausfüllen.",
  "Confirmed by submitter": "Vom Einreicher bestätigt",
  "Read from": "Gelesen aus",

  // Rule hints
  "Needs more detail": "Mehr Details nötig",
  "This answer looks like a placeholder. Describe the task, what the output is and what happens with it.":
    "Diese Antwort wirkt wie ein Platzhalter. Beschreiben Sie die Aufgabe, was das Ergebnis ist und was damit geschieht.",
  "This answer is very short. Describe the task, what the output is and what happens with it.":
    "Diese Antwort ist sehr kurz. Beschreiben Sie die Aufgabe, was das Ergebnis ist und was damit geschieht.",
  "Possible prohibited practice": "Mögliche verbotene Praktik",
  "This answer may describe a practice prohibited under the EU AI Act. Manipulative or deceptive techniques that materially distort behaviour and are likely to cause significant harm are prohibited.":
    "Diese Antwort beschreibt möglicherweise eine nach dem EU AI Act verbotene Praktik. Manipulative oder täuschende Techniken, die das Verhalten wesentlich verzerren und wahrscheinlich erheblichen Schaden verursachen, sind verboten.",
  "EU AI Act, Article 5(1)(a)": "EU AI Act, Artikel 5 Absatz 1 Buchstabe a",
  "This answer may describe a practice prohibited under the EU AI Act. Exploiting vulnerabilities due to age, disability or a social or economic situation is prohibited.":
    "Diese Antwort beschreibt möglicherweise eine nach dem EU AI Act verbotene Praktik. Das Ausnutzen von Schwächen aufgrund von Alter, Behinderung oder einer sozialen oder wirtschaftlichen Lage ist verboten.",
  "EU AI Act, Article 5(1)(b)": "EU AI Act, Artikel 5 Absatz 1 Buchstabe b",
  "This answer may describe a practice prohibited under the EU AI Act. Social scoring that leads to unjustified or unrelated detrimental treatment is prohibited.":
    "Diese Antwort beschreibt möglicherweise eine nach dem EU AI Act verbotene Praktik. Social Scoring, das zu ungerechtfertigter oder sachfremder Benachteiligung führt, ist verboten.",
  "EU AI Act, Article 5(1)(c)": "EU AI Act, Artikel 5 Absatz 1 Buchstabe c",
  "This answer may describe a practice prohibited under the EU AI Act. Predicting criminal offences based solely on profiling or personality traits is prohibited.":
    "Diese Antwort beschreibt möglicherweise eine nach dem EU AI Act verbotene Praktik. Die Vorhersage von Straftaten allein auf Grundlage von Profiling oder Persönlichkeitsmerkmalen ist verboten.",
  "EU AI Act, Article 5(1)(d)": "EU AI Act, Artikel 5 Absatz 1 Buchstabe d",
  "This answer may describe a practice prohibited under the EU AI Act. Building facial recognition databases through untargeted scraping is prohibited.":
    "Diese Antwort beschreibt möglicherweise eine nach dem EU AI Act verbotene Praktik. Der Aufbau von Gesichtserkennungsdatenbanken durch ungezieltes Auslesen ist verboten.",
  "EU AI Act, Article 5(1)(e)": "EU AI Act, Artikel 5 Absatz 1 Buchstabe e",
  "This answer may describe a practice prohibited under the EU AI Act. Emotion recognition at work or in education institutions, other than for medical or safety reasons, is prohibited.":
    "Diese Antwort beschreibt möglicherweise eine nach dem EU AI Act verbotene Praktik. Emotionserkennung am Arbeitsplatz oder in Bildungseinrichtungen ist verboten, außer aus medizinischen oder Sicherheitsgründen.",
  "EU AI Act, Article 5(1)(f)": "EU AI Act, Artikel 5 Absatz 1 Buchstabe f",
  "This answer may describe a practice prohibited under the EU AI Act. Biometric categorisation to infer sensitive characteristics is prohibited.":
    "Diese Antwort beschreibt möglicherweise eine nach dem EU AI Act verbotene Praktik. Biometrische Kategorisierung zur Ableitung sensibler Merkmale ist verboten.",
  "EU AI Act, Article 5(1)(g)": "EU AI Act, Artikel 5 Absatz 1 Buchstabe g",
  "Possible high-risk use": "Mögliche Hochrisiko-Nutzung",
  "This answer mentions biometrics. AI used in this area may be high-risk under the EU AI Act.":
    "Diese Antwort erwähnt Biometrie. KI in diesem Bereich kann nach dem EU AI Act ein hohes Risiko darstellen.",
  "EU AI Act, Annex III, point 1": "EU AI Act, Anhang III, Nummer 1",
  "This answer mentions critical infrastructure. AI used in this area may be high-risk under the EU AI Act.":
    "Diese Antwort erwähnt kritische Infrastruktur. KI in diesem Bereich kann nach dem EU AI Act ein hohes Risiko darstellen.",
  "EU AI Act, Annex III, point 2": "EU AI Act, Anhang III, Nummer 2",
  "This answer mentions education or vocational training. AI used in this area may be high-risk under the EU AI Act.":
    "Diese Antwort erwähnt allgemeine oder berufliche Bildung. KI in diesem Bereich kann nach dem EU AI Act ein hohes Risiko darstellen.",
  "EU AI Act, Annex III, point 3": "EU AI Act, Anhang III, Nummer 3",
  "This answer mentions employment or worker management. AI used in this area may be high-risk under the EU AI Act.":
    "Diese Antwort erwähnt Beschäftigung oder Personalmanagement. KI in diesem Bereich kann nach dem EU AI Act ein hohes Risiko darstellen.",
  "EU AI Act, Annex III, point 4": "EU AI Act, Anhang III, Nummer 4",
  "This answer mentions access to essential private or public services. AI used in this area may be high-risk under the EU AI Act.":
    "Diese Antwort erwähnt den Zugang zu grundlegenden privaten oder öffentlichen Diensten. KI in diesem Bereich kann nach dem EU AI Act ein hohes Risiko darstellen.",
  "EU AI Act, Annex III, point 5": "EU AI Act, Anhang III, Nummer 5",
  "This answer mentions law enforcement. AI used in this area may be high-risk under the EU AI Act.":
    "Diese Antwort erwähnt Strafverfolgung. KI in diesem Bereich kann nach dem EU AI Act ein hohes Risiko darstellen.",
  "EU AI Act, Annex III, point 6": "EU AI Act, Anhang III, Nummer 6",
  "This answer mentions migration, asylum or border control. AI used in this area may be high-risk under the EU AI Act.":
    "Diese Antwort erwähnt Migration, Asyl oder Grenzkontrolle. KI in diesem Bereich kann nach dem EU AI Act ein hohes Risiko darstellen.",
  "EU AI Act, Annex III, point 7": "EU AI Act, Anhang III, Nummer 7",
  "This answer mentions the administration of justice or democratic processes. AI used in this area may be high-risk under the EU AI Act.":
    "Diese Antwort erwähnt die Rechtspflege oder demokratische Prozesse. KI in diesem Bereich kann nach dem EU AI Act ein hohes Risiko darstellen.",
  "EU AI Act, Annex III, point 8": "EU AI Act, Anhang III, Nummer 8",
  "Decisions without human review": "Entscheidungen ohne menschliche Prüfung",
  "This answer may describe decisions made without human review. Under GDPR, people have the right not to be subject to a decision based solely on automated processing that significantly affects them.":
    "Diese Antwort beschreibt möglicherweise Entscheidungen ohne menschliche Prüfung. Nach der DSGVO haben Personen das Recht, keiner ausschließlich auf automatisierter Verarbeitung beruhenden Entscheidung unterworfen zu werden, die sie erheblich beeinträchtigt.",
  "GDPR, Article 22": "DSGVO, Artikel 22",
  // Suggested risk level (#5190)
  "Suggested risk level from your answers": "Vorgeschlagene Risikostufe anhand Ihrer Antworten",
  "Working out the suggested risk level": "Vorgeschlagene Risikostufe wird ermittelt",
  "Why this matters": "Warum das wichtig ist",
  "Explain in plain words": "In einfachen Worten erklären",
  "Explaining": "Wird erklärt",
  "Sends your risk answers to AI.": "Sendet Ihre Risikoantworten an die KI.",
  "An explanation isn't available right now. The reasons above still apply.":
    "Eine Erklärung ist gerade nicht verfügbar. Die obigen Gründe gelten weiterhin.",
  "Add context": "Kontext hinzufügen",
  "What should the reviewer know?": "Was sollte der Prüfer wissen?",
  "The governance team makes the final call.":
    "Das Governance-Team trifft die endgültige Entscheidung.",
  "Applicant's response to the suggested level":
    "Antwort des Antragstellers auf die vorgeschlagene Stufe",
  "Accepted the suggestion": "Vorschlag angenommen",
  "Added context": "Kontext hinzugefügt",
};

export const fr: Record<string, string> = {
  // Reviewer view and form builder
  "Intake checks": "Vérifications de la demande",
  "No answers were flagged.": "Aucune réponse n'a été signalée.",
  "AI checks still running": "Vérifications IA en cours",
  "AI checks unavailable": "Vérifications IA indisponibles",
  "AI-suggested from": "Suggéré par l'IA à partir de",
  "Not confirmed": "Non confirmé",
  "Check answers while the submitter types": "Vérifier les réponses pendant la saisie",
  "AI checks and vendor document prefill need the form's LLM key. Rule checks match English answers.":
    "Les vérifications IA et le remplissage à partir d'un document fournisseur nécessitent la clé LLM du formulaire. Les vérifications par règles reconnaissent les réponses en anglais.",
  // Public form
  "AI can point out vague or conflicting answers when you select Check my answers. Your answers go to AI only when you ask.":
    "L'IA peut signaler les réponses vagues ou contradictoires lorsque vous sélectionnez Vérifier mes réponses. Vos réponses ne sont envoyées à l'IA que si vous le demandez.",
  "Check my answers": "Vérifier mes réponses",
  "Checking answers": "Vérification en cours",
  "Check again": "Vérifier à nouveau",
  "This check didn't work. You can try again.":
    "Cette vérification n'a pas fonctionné. Vous pouvez réessayer.",
  "Nothing else to flag": "Rien d'autre à signaler",
  "Checked. Edit an answer to check again.":
    "Vérifié. Modifiez une réponse pour vérifier à nouveau.",
  "Write a sentence or two first": "Écrivez d'abord une ou deux phrases",
  "Intake assistant": "Assistant de saisie",
  "These checks never block submission. Your reviewer sees them too.":
    "Ces vérifications ne bloquent jamais l'envoi. Votre réviseur les voit aussi.",
  "AI checks paused for a few minutes": "Vérifications IA en pause pour quelques minutes",
  "No hints so far.": "Aucune remarque pour l'instant.",
  "Possible regulated use": "Usage réglementé possible",
  "Conflicting answers": "Réponses contradictoires",
  "answer was read from the vendor document. Confirm before submitting.":
    "réponse a été lue dans le document du fournisseur. Confirmez-la avant l'envoi.",
  "answers were read from the vendor document. Confirm before submitting.":
    "réponses ont été lues dans le document du fournisseur. Confirmez-les avant l'envoi.",
  "Fill from a vendor document": "Remplir à partir d'un document fournisseur",
  "Upload a PDF or Word file, up to 10 MB. AI suggests answers for empty questions, and you confirm each one.":
    "Importez un fichier PDF ou Word de 10 Mo maximum. L'IA propose des réponses aux questions vides, et vous confirmez chacune d'elles.",
  "Choose a file": "Choisir un fichier",
  "Reading the document...": "Lecture du document...",
  "This file is larger than 10 MB.": "Ce fichier dépasse 10 Mo.",
  "No answers were found in this document for the empty questions.":
    "Aucune réponse aux questions vides n'a été trouvée dans ce document.",
  "We couldn't read answers from this document. You can fill in the form as usual.":
    "Nous n'avons pas pu lire de réponses dans ce document. Vous pouvez remplir le formulaire normalement.",
  "Confirmed by submitter": "Confirmé par le demandeur",
  "Read from": "Lu dans",

  // Rule hints
  "Needs more detail": "Plus de détails nécessaires",
  "This answer looks like a placeholder. Describe the task, what the output is and what happens with it.":
    "Cette réponse ressemble à un texte provisoire. Décrivez la tâche, le résultat produit et ce qu'il en advient.",
  "This answer is very short. Describe the task, what the output is and what happens with it.":
    "Cette réponse est très courte. Décrivez la tâche, le résultat produit et ce qu'il en advient.",
  "Possible prohibited practice": "Pratique interdite possible",
  "This answer may describe a practice prohibited under the EU AI Act. Manipulative or deceptive techniques that materially distort behaviour and are likely to cause significant harm are prohibited.":
    "Cette réponse peut décrire une pratique interdite par l'AI Act de l'UE. Les techniques manipulatrices ou trompeuses qui altèrent sensiblement le comportement et sont susceptibles de causer un préjudice important sont interdites.",
  "EU AI Act, Article 5(1)(a)": "AI Act de l'UE, article 5, paragraphe 1, point a)",
  "This answer may describe a practice prohibited under the EU AI Act. Exploiting vulnerabilities due to age, disability or a social or economic situation is prohibited.":
    "Cette réponse peut décrire une pratique interdite par l'AI Act de l'UE. L'exploitation des vulnérabilités liées à l'âge, au handicap ou à une situation sociale ou économique est interdite.",
  "EU AI Act, Article 5(1)(b)": "AI Act de l'UE, article 5, paragraphe 1, point b)",
  "This answer may describe a practice prohibited under the EU AI Act. Social scoring that leads to unjustified or unrelated detrimental treatment is prohibited.":
    "Cette réponse peut décrire une pratique interdite par l'AI Act de l'UE. La notation sociale menant à un traitement préjudiciable injustifié ou sans rapport est interdite.",
  "EU AI Act, Article 5(1)(c)": "AI Act de l'UE, article 5, paragraphe 1, point c)",
  "This answer may describe a practice prohibited under the EU AI Act. Predicting criminal offences based solely on profiling or personality traits is prohibited.":
    "Cette réponse peut décrire une pratique interdite par l'AI Act de l'UE. Prédire des infractions pénales uniquement sur la base du profilage ou de traits de personnalité est interdit.",
  "EU AI Act, Article 5(1)(d)": "AI Act de l'UE, article 5, paragraphe 1, point d)",
  "This answer may describe a practice prohibited under the EU AI Act. Building facial recognition databases through untargeted scraping is prohibited.":
    "Cette réponse peut décrire une pratique interdite par l'AI Act de l'UE. La constitution de bases de données de reconnaissance faciale par moissonnage non ciblé est interdite.",
  "EU AI Act, Article 5(1)(e)": "AI Act de l'UE, article 5, paragraphe 1, point e)",
  "This answer may describe a practice prohibited under the EU AI Act. Emotion recognition at work or in education institutions, other than for medical or safety reasons, is prohibited.":
    "Cette réponse peut décrire une pratique interdite par l'AI Act de l'UE. La reconnaissance des émotions sur le lieu de travail ou dans les établissements d'enseignement est interdite, sauf pour des raisons médicales ou de sécurité.",
  "EU AI Act, Article 5(1)(f)": "AI Act de l'UE, article 5, paragraphe 1, point f)",
  "This answer may describe a practice prohibited under the EU AI Act. Biometric categorisation to infer sensitive characteristics is prohibited.":
    "Cette réponse peut décrire une pratique interdite par l'AI Act de l'UE. La catégorisation biométrique visant à déduire des caractéristiques sensibles est interdite.",
  "EU AI Act, Article 5(1)(g)": "AI Act de l'UE, article 5, paragraphe 1, point g)",
  "Possible high-risk use": "Usage à haut risque possible",
  "This answer mentions biometrics. AI used in this area may be high-risk under the EU AI Act.":
    "Cette réponse mentionne la biométrie. L'IA utilisée dans ce domaine peut être à haut risque selon l'AI Act de l'UE.",
  "EU AI Act, Annex III, point 1": "AI Act de l'UE, annexe III, point 1",
  "This answer mentions critical infrastructure. AI used in this area may be high-risk under the EU AI Act.":
    "Cette réponse mentionne des infrastructures critiques. L'IA utilisée dans ce domaine peut être à haut risque selon l'AI Act de l'UE.",
  "EU AI Act, Annex III, point 2": "AI Act de l'UE, annexe III, point 2",
  "This answer mentions education or vocational training. AI used in this area may be high-risk under the EU AI Act.":
    "Cette réponse mentionne l'éducation ou la formation professionnelle. L'IA utilisée dans ce domaine peut être à haut risque selon l'AI Act de l'UE.",
  "EU AI Act, Annex III, point 3": "AI Act de l'UE, annexe III, point 3",
  "This answer mentions employment or worker management. AI used in this area may be high-risk under the EU AI Act.":
    "Cette réponse mentionne l'emploi ou la gestion des travailleurs. L'IA utilisée dans ce domaine peut être à haut risque selon l'AI Act de l'UE.",
  "EU AI Act, Annex III, point 4": "AI Act de l'UE, annexe III, point 4",
  "This answer mentions access to essential private or public services. AI used in this area may be high-risk under the EU AI Act.":
    "Cette réponse mentionne l'accès à des services privés ou publics essentiels. L'IA utilisée dans ce domaine peut être à haut risque selon l'AI Act de l'UE.",
  "EU AI Act, Annex III, point 5": "AI Act de l'UE, annexe III, point 5",
  "This answer mentions law enforcement. AI used in this area may be high-risk under the EU AI Act.":
    "Cette réponse mentionne les activités répressives. L'IA utilisée dans ce domaine peut être à haut risque selon l'AI Act de l'UE.",
  "EU AI Act, Annex III, point 6": "AI Act de l'UE, annexe III, point 6",
  "This answer mentions migration, asylum or border control. AI used in this area may be high-risk under the EU AI Act.":
    "Cette réponse mentionne la migration, l'asile ou le contrôle aux frontières. L'IA utilisée dans ce domaine peut être à haut risque selon l'AI Act de l'UE.",
  "EU AI Act, Annex III, point 7": "AI Act de l'UE, annexe III, point 7",
  "This answer mentions the administration of justice or democratic processes. AI used in this area may be high-risk under the EU AI Act.":
    "Cette réponse mentionne l'administration de la justice ou les processus démocratiques. L'IA utilisée dans ce domaine peut être à haut risque selon l'AI Act de l'UE.",
  "EU AI Act, Annex III, point 8": "AI Act de l'UE, annexe III, point 8",
  "Decisions without human review": "Décisions sans examen humain",
  "This answer may describe decisions made without human review. Under GDPR, people have the right not to be subject to a decision based solely on automated processing that significantly affects them.":
    "Cette réponse peut décrire des décisions prises sans examen humain. Selon le RGPD, les personnes ont le droit de ne pas faire l'objet d'une décision fondée exclusivement sur un traitement automatisé qui les affecte de manière significative.",
  "GDPR, Article 22": "RGPD, article 22",
  // Suggested risk level (#5190)
  "Suggested risk level from your answers": "Niveau de risque proposé d'après vos réponses",
  "Working out the suggested risk level": "Calcul du niveau de risque proposé",
  "Why this matters": "Pourquoi c'est important",
  "Explain in plain words": "Expliquer simplement",
  "Explaining": "Explication en cours",
  "Sends your risk answers to AI.": "Envoie vos réponses sur les risques à l'IA.",
  "An explanation isn't available right now. The reasons above still apply.":
    "Aucune explication n'est disponible pour le moment. Les raisons ci-dessus restent valables.",
  "Add context": "Ajouter du contexte",
  "What should the reviewer know?": "Que doit savoir le réviseur ?",
  "The governance team makes the final call.": "L'équipe de gouvernance prend la décision finale.",
  "Applicant's response to the suggested level": "Réponse du demandeur au niveau proposé",
  "Accepted the suggestion": "Proposition acceptée",
  "Added context": "Contexte ajouté",
};

export const es: Record<string, string> = {
  // Reviewer view and form builder
  "Intake checks": "Comprobaciones de la solicitud",
  "No answers were flagged.": "No se marcó ninguna respuesta.",
  "AI checks still running": "Comprobaciones de IA en curso",
  "AI checks unavailable": "Comprobaciones de IA no disponibles",
  "AI-suggested from": "Sugerido por IA a partir de",
  "Not confirmed": "No confirmado",
  "Check answers while the submitter types": "Comprobar las respuestas mientras se escribe",
  "AI checks and vendor document prefill need the form's LLM key. Rule checks match English answers.":
    "Las comprobaciones de IA y el relleno desde un documento del proveedor necesitan la clave LLM del formulario. Las comprobaciones por reglas reconocen respuestas en inglés.",
  // Public form
  "AI can point out vague or conflicting answers when you select Check my answers. Your answers go to AI only when you ask.":
    "La IA puede señalar respuestas vagas o contradictorias cuando selecciona Revisar mis respuestas. Sus respuestas solo se envían a la IA cuando usted lo pide.",
  "Check my answers": "Revisar mis respuestas",
  "Checking answers": "Revisando respuestas",
  "Check again": "Revisar de nuevo",
  "This check didn't work. You can try again.":
    "Esta revisión no ha funcionado. Puede intentarlo de nuevo.",
  "Nothing else to flag": "Nada más que señalar",
  "Checked. Edit an answer to check again.": "Revisado. Edite una respuesta para revisar de nuevo.",
  "Write a sentence or two first": "Escriba primero una o dos frases",
  "Intake assistant": "Asistente de solicitud",
  "These checks never block submission. Your reviewer sees them too.":
    "Estas comprobaciones nunca bloquean el envío. Su revisor también las ve.",
  "AI checks paused for a few minutes": "Comprobaciones de IA en pausa durante unos minutos",
  "No hints so far.": "Todavía no hay indicaciones.",
  "Possible regulated use": "Posible uso regulado",
  "Conflicting answers": "Respuestas contradictorias",
  "answer was read from the vendor document. Confirm before submitting.":
    "respuesta se leyó del documento del proveedor. Confírmela antes de enviar.",
  "answers were read from the vendor document. Confirm before submitting.":
    "respuestas se leyeron del documento del proveedor. Confírmelas antes de enviar.",
  "Fill from a vendor document": "Rellenar desde un documento del proveedor",
  "Upload a PDF or Word file, up to 10 MB. AI suggests answers for empty questions, and you confirm each one.":
    "Suba un archivo PDF o Word de hasta 10 MB. La IA sugiere respuestas para las preguntas vacías y usted confirma cada una.",
  "Choose a file": "Elegir un archivo",
  "Reading the document...": "Leyendo el documento...",
  "This file is larger than 10 MB.": "Este archivo supera los 10 MB.",
  "No answers were found in this document for the empty questions.":
    "No se encontraron respuestas en este documento para las preguntas vacías.",
  "We couldn't read answers from this document. You can fill in the form as usual.":
    "No pudimos leer respuestas de este documento. Puede rellenar el formulario como de costumbre.",
  "Confirmed by submitter": "Confirmado por el solicitante",
  "Read from": "Leído de",

  // Rule hints
  "Needs more detail": "Se necesitan más detalles",
  "This answer looks like a placeholder. Describe the task, what the output is and what happens with it.":
    "Esta respuesta parece un texto provisional. Describa la tarea, cuál es el resultado y qué se hace con él.",
  "This answer is very short. Describe the task, what the output is and what happens with it.":
    "Esta respuesta es muy corta. Describa la tarea, cuál es el resultado y qué se hace con él.",
  "Possible prohibited practice": "Posible práctica prohibida",
  "This answer may describe a practice prohibited under the EU AI Act. Manipulative or deceptive techniques that materially distort behaviour and are likely to cause significant harm are prohibited.":
    "Esta respuesta puede describir una práctica prohibida por la Ley de IA de la UE. Están prohibidas las técnicas manipuladoras o engañosas que alteran de forma sustancial el comportamiento y pueden causar perjuicios considerables.",
  "EU AI Act, Article 5(1)(a)": "Ley de IA de la UE, artículo 5, apartado 1, letra a)",
  "This answer may describe a practice prohibited under the EU AI Act. Exploiting vulnerabilities due to age, disability or a social or economic situation is prohibited.":
    "Esta respuesta puede describir una práctica prohibida por la Ley de IA de la UE. Está prohibido aprovechar vulnerabilidades derivadas de la edad, la discapacidad o una situación social o económica.",
  "EU AI Act, Article 5(1)(b)": "Ley de IA de la UE, artículo 5, apartado 1, letra b)",
  "This answer may describe a practice prohibited under the EU AI Act. Social scoring that leads to unjustified or unrelated detrimental treatment is prohibited.":
    "Esta respuesta puede describir una práctica prohibida por la Ley de IA de la UE. Está prohibida la puntuación social que conduce a un trato perjudicial injustificado o sin relación.",
  "EU AI Act, Article 5(1)(c)": "Ley de IA de la UE, artículo 5, apartado 1, letra c)",
  "This answer may describe a practice prohibited under the EU AI Act. Predicting criminal offences based solely on profiling or personality traits is prohibited.":
    "Esta respuesta puede describir una práctica prohibida por la Ley de IA de la UE. Está prohibido predecir delitos basándose únicamente en la elaboración de perfiles o en rasgos de personalidad.",
  "EU AI Act, Article 5(1)(d)": "Ley de IA de la UE, artículo 5, apartado 1, letra d)",
  "This answer may describe a practice prohibited under the EU AI Act. Building facial recognition databases through untargeted scraping is prohibited.":
    "Esta respuesta puede describir una práctica prohibida por la Ley de IA de la UE. Está prohibido crear bases de datos de reconocimiento facial mediante la extracción no selectiva de imágenes.",
  "EU AI Act, Article 5(1)(e)": "Ley de IA de la UE, artículo 5, apartado 1, letra e)",
  "This answer may describe a practice prohibited under the EU AI Act. Emotion recognition at work or in education institutions, other than for medical or safety reasons, is prohibited.":
    "Esta respuesta puede describir una práctica prohibida por la Ley de IA de la UE. Está prohibido el reconocimiento de emociones en el trabajo o en centros educativos, salvo por motivos médicos o de seguridad.",
  "EU AI Act, Article 5(1)(f)": "Ley de IA de la UE, artículo 5, apartado 1, letra f)",
  "This answer may describe a practice prohibited under the EU AI Act. Biometric categorisation to infer sensitive characteristics is prohibited.":
    "Esta respuesta puede describir una práctica prohibida por la Ley de IA de la UE. Está prohibida la categorización biométrica para inferir características sensibles.",
  "EU AI Act, Article 5(1)(g)": "Ley de IA de la UE, artículo 5, apartado 1, letra g)",
  "Possible high-risk use": "Posible uso de alto riesgo",
  "This answer mentions biometrics. AI used in this area may be high-risk under the EU AI Act.":
    "Esta respuesta menciona la biometría. La IA utilizada en este ámbito puede ser de alto riesgo según la Ley de IA de la UE.",
  "EU AI Act, Annex III, point 1": "Ley de IA de la UE, anexo III, punto 1",
  "This answer mentions critical infrastructure. AI used in this area may be high-risk under the EU AI Act.":
    "Esta respuesta menciona infraestructuras críticas. La IA utilizada en este ámbito puede ser de alto riesgo según la Ley de IA de la UE.",
  "EU AI Act, Annex III, point 2": "Ley de IA de la UE, anexo III, punto 2",
  "This answer mentions education or vocational training. AI used in this area may be high-risk under the EU AI Act.":
    "Esta respuesta menciona la educación o la formación profesional. La IA utilizada en este ámbito puede ser de alto riesgo según la Ley de IA de la UE.",
  "EU AI Act, Annex III, point 3": "Ley de IA de la UE, anexo III, punto 3",
  "This answer mentions employment or worker management. AI used in this area may be high-risk under the EU AI Act.":
    "Esta respuesta menciona el empleo o la gestión de trabajadores. La IA utilizada en este ámbito puede ser de alto riesgo según la Ley de IA de la UE.",
  "EU AI Act, Annex III, point 4": "Ley de IA de la UE, anexo III, punto 4",
  "This answer mentions access to essential private or public services. AI used in this area may be high-risk under the EU AI Act.":
    "Esta respuesta menciona el acceso a servicios privados o públicos esenciales. La IA utilizada en este ámbito puede ser de alto riesgo según la Ley de IA de la UE.",
  "EU AI Act, Annex III, point 5": "Ley de IA de la UE, anexo III, punto 5",
  "This answer mentions law enforcement. AI used in this area may be high-risk under the EU AI Act.":
    "Esta respuesta menciona la aplicación de la ley. La IA utilizada en este ámbito puede ser de alto riesgo según la Ley de IA de la UE.",
  "EU AI Act, Annex III, point 6": "Ley de IA de la UE, anexo III, punto 6",
  "This answer mentions migration, asylum or border control. AI used in this area may be high-risk under the EU AI Act.":
    "Esta respuesta menciona la migración, el asilo o el control fronterizo. La IA utilizada en este ámbito puede ser de alto riesgo según la Ley de IA de la UE.",
  "EU AI Act, Annex III, point 7": "Ley de IA de la UE, anexo III, punto 7",
  "This answer mentions the administration of justice or democratic processes. AI used in this area may be high-risk under the EU AI Act.":
    "Esta respuesta menciona la administración de justicia o los procesos democráticos. La IA utilizada en este ámbito puede ser de alto riesgo según la Ley de IA de la UE.",
  "EU AI Act, Annex III, point 8": "Ley de IA de la UE, anexo III, punto 8",
  "Decisions without human review": "Decisiones sin revisión humana",
  "This answer may describe decisions made without human review. Under GDPR, people have the right not to be subject to a decision based solely on automated processing that significantly affects them.":
    "Esta respuesta puede describir decisiones tomadas sin revisión humana. Según el RGPD, las personas tienen derecho a no ser objeto de una decisión basada únicamente en un tratamiento automatizado que les afecte de forma significativa.",
  "GDPR, Article 22": "RGPD, artículo 22",
  // Suggested risk level (#5190)
  "Suggested risk level from your answers": "Nivel de riesgo sugerido según sus respuestas",
  "Working out the suggested risk level": "Calculando el nivel de riesgo sugerido",
  "Why this matters": "Por qué es importante",
  "Explain in plain words": "Explicar con palabras sencillas",
  "Explaining": "Explicando",
  "Sends your risk answers to AI.": "Envía sus respuestas sobre riesgos a la IA.",
  "An explanation isn't available right now. The reasons above still apply.":
    "No hay una explicación disponible ahora. Los motivos anteriores siguen siendo válidos.",
  "Add context": "Añadir contexto",
  "What should the reviewer know?": "¿Qué debe saber el revisor?",
  "The governance team makes the final call.": "El equipo de gobernanza toma la decisión final.",
  "Applicant's response to the suggested level": "Respuesta del solicitante al nivel sugerido",
  "Accepted the suggestion": "Sugerencia aceptada",
  "Added context": "Contexto añadido",
};
