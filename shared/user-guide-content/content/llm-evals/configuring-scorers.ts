import type { ArticleContent } from '../../contentTypes';

export const configuringScorersContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'What are scorers?',
    },
    {
      type: 'paragraph',
      text: 'Scorers define what you\'re measuring. When you run an experiment, each scorer examines the model\'s responses and produces a score, typically between 0 and 1, indicating how well the response meets that particular criterion.',
    },
    {
      type: 'paragraph',
      text: 'Think of scorers as the rubric for your evaluation. A customer support bot might need scorers for helpfulness, accuracy and tone. A coding assistant might prioritize correctness and completeness. The scorers you choose should reflect what "good" means for your specific application.',
    },
    {
      type: 'heading',
      id: 'default-scorers',
      level: 2,
      text: 'Default scorers',
    },
    {
      type: 'paragraph',
      text: 'LLM Evals enables a set of built-in scorers by default based on your use case. Single-turn experiments enable seven core scorers; chatbot experiments add six more conversational scorers on top. These cover common evaluation needs and work well for most applications:',
    },
    {
      type: 'heading',
      id: 'answer-relevancy',
      level: 3,
      text: 'Answer relevancy',
    },
    {
      type: 'paragraph',
      text: 'The most fundamental metric: does the response actually address the question? A model might generate fluent, grammatically correct text that completely misses the point. This scorer catches that.',
    },
    {
      type: 'paragraph',
      text: 'A score of 1.0 means the response directly and completely addresses the prompt. A score near 0 means the response is off-topic or irrelevant. Most well-tuned models score above 0.7 on typical queries.',
    },
    {
      type: 'heading',
      id: 'bias-detection',
      level: 3,
      text: 'Bias detection',
    },
    {
      type: 'paragraph',
      text: 'Identifies responses containing discriminatory or unfair content. This includes gender bias, racial bias, political bias, age discrimination and other forms of prejudicial language.',
    },
    {
      type: 'paragraph',
      text: 'Lower scores indicate more bias detected. For user-facing applications, you generally want this score to be very high (above 0.9). Any significant bias should trigger a review of your prompts and model selection.',
    },
    {
      type: 'heading',
      id: 'toxicity-detection',
      level: 3,
      text: 'Toxicity detection',
    },
    {
      type: 'paragraph',
      text: 'Flags harmful, offensive, abusive or inappropriate language. This goes beyond bias to include threats, insults, profanity and content that could harm users or your brand.',
    },
    {
      type: 'paragraph',
      text: 'Critical for any model that interacts with the public. Even if your model is generally well-behaved, adversarial prompts might elicit toxic responses. Regular evaluation helps catch these edge cases.',
    },
    {
      type: 'heading',
      id: 'faithfulness',
      level: 3,
      text: 'Faithfulness',
    },
    {
      type: 'paragraph',
      text: 'Measures whether the response accurately reflects provided context. This matters most for RAG (Retrieval-Augmented Generation) systems where the model should ground its answers in retrieved documents.',
    },
    {
      type: 'paragraph',
      text: 'A faithful response only makes claims supported by the context. An unfaithful response adds information that wasn\'t there or contradicts what was provided. If you\'re building knowledge-based applications, this scorer is crucial.',
    },
    {
      type: 'heading',
      id: 'hallucination-detection',
      level: 3,
      text: 'Hallucination detection',
    },
    {
      type: 'paragraph',
      text: 'Identifies fabricated facts, unsupported claims and made-up information. Unlike faithfulness (which requires explicit context), this catches models that confidently state things that simply aren\'t true.',
    },
    {
      type: 'paragraph',
      text: 'Hallucination is one of the most common failure modes in LLMs. Models can sound authoritative while being completely wrong. This scorer helps quantify how often your model makes things up.',
    },
    {
      type: 'heading',
      id: 'contextual-relevancy',
      level: 3,
      text: 'Contextual relevancy',
    },
    {
      type: 'paragraph',
      text: 'For RAG systems, this evaluates the retrieval step: was the context that got retrieved actually relevant to the question? You can have a perfectly faithful response that\'s still wrong because the retrieved context was irrelevant.',
    },
    {
      type: 'paragraph',
      text: 'Low scores here indicate a retrieval problem, not a generation problem. Your model might be doing exactly what it should with the context it\'s given, but the wrong context leads to wrong answers.',
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'Not every scorer applies to every application. A simple Q&A bot without RAG doesn\'t need contextual relevancy. A creative writing assistant might deprioritize faithfulness. Choose the scorers that match your use case.',
    },
    {
      type: 'heading',
      id: 'conversational-metrics',
      level: 2,
      text: 'Conversational metrics',
    },
    {
      type: 'paragraph',
      text: 'When evaluating chatbots with multi-turn datasets, additional metrics become available. These are specifically designed to assess how well a model handles ongoing conversations rather than isolated prompts. Learn how to create multi-turn datasets in [[Managing datasets]](llm-evals/managing-datasets).',
    },
    {
      type: 'heading',
      id: 'turn-relevancy',
      level: 3,
      text: 'Turn relevancy',
    },
    {
      type: 'paragraph',
      text: 'Measures whether each response in a conversation directly addresses the user\'s current message. Unlike general answer relevancy, this considers the conversational context. A response might be relevant to the overall topic but miss what the user just asked.',
    },
    {
      type: 'heading',
      id: 'knowledge-retention',
      level: 3,
      text: 'Knowledge retention',
    },
    {
      type: 'paragraph',
      text: 'Evaluates whether the model remembers information from earlier in the conversation. If a user mentions their name in turn 1 and asks "What\'s my name?" in turn 5, the model should know. Low scores indicate the model is treating each turn as isolated.',
    },
    {
      type: 'heading',
      id: 'conversation-coherence',
      level: 3,
      text: 'Conversation coherence',
    },
    {
      type: 'paragraph',
      text: 'Assesses the logical flow of the conversation. Does the model\'s response make sense given everything that came before? Incoherent responses might contradict earlier statements or suddenly change topic without reason.',
    },
    {
      type: 'heading',
      id: 'conversation-helpfulness',
      level: 3,
      text: 'Conversation helpfulness',
    },
    {
      type: 'paragraph',
      text: 'Measures how useful the model\'s responses are in progressing the conversation toward the user\'s goal. A response can be relevant and coherent but still unhelpful if it doesn\'t actually assist the user.',
    },
    {
      type: 'heading',
      id: 'task-completion',
      level: 3,
      text: 'Task completion',
    },
    {
      type: 'paragraph',
      text: 'For goal-oriented conversations, this evaluates whether the model successfully helps the user complete their task. If someone is trying to book a flight, did the conversation end with a booking? Particularly important for customer service and assistant chatbots.',
    },
    {
      type: 'heading',
      id: 'conversation-safety',
      level: 3,
      text: 'Conversation safety',
    },
    {
      type: 'paragraph',
      text: 'A conversation-aware version of toxicity detection. This evaluates safety across the entire conversation, catching cases where the model might be manipulated through multi-turn prompting that wouldn\'t trigger safety filters in a single turn.',
    },
    {
      type: 'callout',
      variant: 'tip',
      text: 'Conversational metrics are automatically enabled when you select a multi-turn dataset. You\'ll see them in an expandable "Conversational metrics" section in the experiment wizard.',
    },
    {
      type: 'heading',
      id: 'per-turn-safety',
      level: 2,
      text: 'Per-turn safety evaluation',
    },
    {
      type: 'paragraph',
      text: 'For multi-turn conversations, bias and toxicity are evaluated on each individual assistant response, not just the final output. This catches cases where a model might produce problematic content mid-conversation even if the final response is clean.',
    },
    {
      type: 'paragraph',
      text: 'Results show per-turn scores in the experiment detail view, making it easy to identify exactly where in a conversation the model went wrong.',
    },
    {
      type: 'heading',
      id: 'accessing-scorers',
      level: 2,
      text: 'Managing scorers',
    },
    {
      type: 'paragraph',
      text: 'Navigate to the **Scorers** tab in your project. You\'ll see a table listing all configured scorers with their name, type, judge model, metric key and current status (enabled or disabled).',
    },
    {
      type: 'paragraph',
      text: 'Click any row to open the edit panel, or use the gear icon for quick actions like editing or deleting.',
    },
    {
      type: 'heading',
      id: 'creating-scorers',
      level: 2,
      text: 'Creating a custom scorer',
    },
    {
      type: 'paragraph',
      text: 'Need to evaluate something specific to your domain? Create a custom scorer by clicking **New scorer**. You\'ll configure:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Name', text: 'A descriptive label that appears in results (e.g., "Medical Accuracy" or "Code Correctness")' },
        { bold: 'Metric key', text: 'A machine-readable identifier used in API responses and exports (e.g., `medical_accuracy`, `code_correctness`)' },
        { bold: 'Description', text: 'Optional explanation of what this scorer evaluates. Helps teammates understand its purpose.' },
        { bold: 'Type', text: 'LLM (uses a judge model), Builtin (predefined logic), or Custom (your own evaluation code)' },
        { bold: 'Judge model', text: 'For LLM-type scorers, which model evaluates the responses. Same options as the experiment configuration.' },
        { bold: 'Default threshold', text: 'The minimum acceptable score (e.g., 0.7 means 70%). Responses below this are flagged as failures.' },
        { bold: 'Weight', text: 'Relative importance when calculating aggregate scores. Higher weights mean this scorer contributes more to the overall score.' },
      ],
    },
    {
      type: 'heading',
      id: 'scorer-types',
      level: 2,
      text: 'Scorer types explained',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'LLM scorers', text: 'Use a judge model (like GPT-4) to evaluate responses. This is the most flexible option, letting you evaluate nuanced qualities like helpfulness, tone or domain accuracy. They\'re slower and cost more since each evaluation requires API calls.' },
        { bold: 'Builtin scorers', text: 'Use predefined algorithms that don\'t require an LLM. Faster and cheaper, but less flexible. Good for objective metrics like response length, format compliance or keyword presence.' },
        { bold: 'Custom scorers', text: 'Your own evaluation logic. Useful for domain-specific checks that neither LLMs nor builtins handle well. Requires writing code but gives you complete control.' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      text: 'Start with LLM scorers, they\'re the most versatile. Only switch to builtin or custom scorers when you have specific performance or accuracy requirements that LLM evaluation can\'t meet.',
    },
    {
      type: 'heading',
      id: 'thresholds',
      level: 2,
      text: 'Setting thresholds',
    },
    {
      type: 'paragraph',
      text: 'Thresholds determine what counts as "passing." A threshold of 0.7 means any response scoring below 70% is considered a failure for that metric.',
    },
    {
      type: 'paragraph',
      text: 'How to choose thresholds:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Start permissive', text: 'Begin with 0.5 or 0.6 to understand your baseline. You can tighten later.' },
        { bold: 'Review failures manually', text: 'Look at responses that score just below your threshold. Are they actually bad? Adjust accordingly.' },
        { bold: 'Match your quality bar', text: 'If you wouldn\'t ship a response to users, it should fail. Calibrate thresholds to match your standards.' },
        { bold: 'Different thresholds for different metrics', text: 'Toxicity might require 0.95+ (almost no tolerance), while relevancy might be 0.7 (some flexibility).' },
      ],
    },
    {
      type: 'heading',
      id: 'weights',
      level: 2,
      text: 'Using weights',
    },
    {
      type: 'paragraph',
      text: 'Weights let you express which metrics matter most. When calculating an overall score, metrics with higher weights contribute more.',
    },
    {
      type: 'paragraph',
      text: 'For example, if toxicity detection is critical (weight: 2.0) but contextual relevancy is nice-to-have (weight: 0.5), a toxic response will hurt your overall score much more than slightly irrelevant context.',
    },
    {
      type: 'paragraph',
      text: 'Weights are relative: what matters is the ratio between them, not the absolute values. A weight of 2.0 vs. 1.0 has the same effect as 4.0 vs. 2.0.',
    },
    {
      type: 'heading',
      id: 'enabling-disabling',
      level: 2,
      text: 'Enabling and disabling scorers',
    },
    {
      type: 'paragraph',
      text: 'Not every scorer needs to run in every experiment. Disable scorers that don\'t apply to speed up evaluations and reduce noise in your results.',
    },
    {
      type: 'paragraph',
      text: 'To toggle a scorer, click into it and change the enabled status. Disabled scorers remain configured but won\'t be used in new experiments.',
    },
    {
      type: 'callout',
      variant: 'warning',
      text: 'Disabling a scorer doesn\'t affect past experiments. Those results are preserved. It only affects future experiments in this project.',
    },
    {
      type: 'heading',
      id: 'best-practices',
      level: 2,
      text: 'Scorer best practices',
    },
    {
      type: 'paragraph',
      text: 'A few lessons from teams who\'ve built effective evaluation pipelines:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Match scorers to your goals', text: 'Don\'t just enable everything. Think about what makes a response "good" for your users and configure scorers accordingly.' },
        { bold: 'Keep judge models consistent', text: 'If you\'re comparing experiments over time, use the same judge. Different judges may score the same response differently.' },
        { bold: 'Calibrate regularly', text: 'Periodically review scored responses manually. Are the scores matching your intuition? If not, adjust thresholds or scorer configurations.' },
        { bold: 'Document your choices', text: 'Keep notes on why you chose certain thresholds and weights. Future you (or teammates) will thank you when debugging unexpected results.' },
        { bold: 'Start simple', text: 'Begin with the default scorers and thresholds. Add complexity only when you understand how the system behaves.' },
      ],
    },
    {
      type: 'heading',
      id: 'troubleshooting',
      level: 2,
      text: 'Common issues',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'All scores are too low', text: 'Your expected outputs might be too specific. Judges evaluate semantic similarity, not exact matches, but if your expectations are very different from what the model produces, scores suffer.' },
        { bold: 'All scores are too high', text: 'Your dataset might be too easy, or your thresholds too permissive. Add challenging test cases and review failing examples to calibrate.' },
        { bold: 'Inconsistent scores', text: 'Judge model temperature might be too high. Lower it (try 0.3-0.5) for more consistent evaluations.' },
        { bold: 'Evaluations are slow', text: 'Each metric requires a judge call. Disable metrics you don\'t need, or use faster judge models for iterative testing.' },
      ],
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        { collectionId: 'llm-evals', articleId: 'running-experiments', title: 'Running experiments', description: 'Apply your scorers in evaluation runs' },
        { collectionId: 'llm-evals', articleId: 'managing-datasets', title: 'Managing datasets', description: 'Create multi-turn datasets for conversational metrics' },
      ],
    },
  ],
};
