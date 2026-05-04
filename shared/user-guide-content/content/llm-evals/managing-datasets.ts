import type { ArticleContent } from '../../contentTypes';

export const managingDatasetsContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Why datasets matter',
    },
    {
      type: 'paragraph',
      text: 'Your evaluation is only as good as your dataset. A well-crafted dataset exposes how your model handles the scenarios that actually matter to your users, from common questions to edge cases and tricky phrasings.',
    },
    {
      type: 'paragraph',
      text: 'LLM Evals gives you two paths: start with built-in datasets to get quick results, or invest time in custom datasets that precisely match your use case. Most teams do both, using built-in datasets for general benchmarking while building custom ones for application-specific testing.',
    },
    {
      type: 'heading',
      id: 'builtin-datasets',
      level: 2,
      text: 'Built-in datasets',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise maintains a library of curated datasets organized by use case. Each dataset specifies its type (single-turn or multi-turn) and intended use case, helping you quickly find relevant test cases.',
    },
    {
      type: 'heading',
      id: 'chatbot-datasets',
      level: 3,
      text: 'Chatbot datasets',
    },
    {
      type: 'paragraph',
      text: 'For conversational AI evaluation:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Basic Chatbot', text: 'General-purpose prompts covering conversation, coding, math, knowledge, creative writing and reasoning. Single-turn format, great for getting started.' },
        { bold: 'Coding Helper', text: 'Programming assistance scenarios testing code generation, debugging and technical explanations.' },
        { bold: 'Customer Support', text: 'Customer service interactions for support chatbot evaluation. Tests helpfulness, accuracy and appropriate responses to common support queries.' },
      ],
    },
    {
      type: 'heading',
      id: 'rag-datasets',
      level: 3,
      text: 'RAG datasets',
    },
    {
      type: 'paragraph',
      text: 'For retrieval-augmented generation systems:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Product Documentation', text: 'Tests accuracy of information retrieval and contextual response generation with product docs.' },
        { bold: 'Research Papers', text: 'Academic and technical content retrieval, testing comprehension of complex material.' },
        { bold: 'Wikipedia', text: 'General knowledge retrieval from encyclopedia-style content.' },
        { bold: 'Document QA', text: 'Multi-turn question-answering against a document corpus.' },
        { bold: 'Knowledge Base', text: 'Retrieval-augmented Q&A over an internal knowledge base.' },
        { bold: 'Research Assistant', text: 'Multi-turn assistant interactions over technical research material.' },
      ],
    },
    {
      type: 'heading',
      id: 'agent-datasets',
      level: 3,
      text: 'Agent datasets',
    },
    {
      type: 'paragraph',
      text: 'For agentic AI assistants. Agent datasets are conversation-based multi-turn evaluations that exercise planning, tool selection and follow-through over several turns; they are not isolated single-call examples.',
    },
    {
      type: 'callout',
      variant: 'tip',
      text: 'Each dataset card shows its type (single-turn or multi-turn) and use case. Filter by use case to find datasets that match your application.',
    },
    {
      type: 'heading',
      id: 'custom-datasets',
      level: 2,
      text: 'Creating custom datasets',
    },
    {
      type: 'paragraph',
      text: 'While built-in datasets are great for getting started, custom datasets let you evaluate what really matters for your specific application. A healthcare chatbot needs different test cases than a code assistant.',
    },
    {
      type: 'paragraph',
      text: 'Good custom datasets typically include:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Real user queries', text: 'Sample from your actual traffic or support tickets. These represent how people really phrase questions, not how you imagine they might.' },
        { bold: 'Known failure cases', text: 'Prompts where you\'ve observed problems. Turn bugs into regression tests.' },
        { bold: 'Edge cases', text: 'Unusual inputs, ambiguous questions or requests at the boundaries of your model\'s capabilities.' },
        { bold: 'Adversarial examples', text: 'Attempts to confuse, mislead or manipulate your model. What happens when someone asks something inappropriate?' },
      ],
    },
    {
      type: 'heading',
      id: 'uploading',
      level: 2,
      text: 'Uploading a dataset',
    },
    {
      type: 'paragraph',
      text: 'Navigate to the **Datasets** tab and click **Upload dataset**. Select a JSON file from your computer. Once uploaded, the dataset becomes available for all experiments in your project.',
    },
    {
      type: 'paragraph',
      text: 'Your JSON file should contain an array of test cases. Here\'s the expected structure:',
    },
    {
      type: 'code',
      language: 'json',
      code: `[
  {
    "id": "support-001",
    "category": "billing",
    "prompt": "I was charged twice for my subscription. Can you help?",
    "expected_output": "I'm sorry to hear about the double charge. I can see your account and will process a refund for the duplicate payment. It should appear in 3-5 business days.",
    "expected_keywords": ["refund", "duplicate", "business days"],
    "difficulty": "medium"
  },
  {
    "id": "support-002",
    "category": "technical",
    "prompt": "The app keeps crashing when I try to upload a photo.",
    "expected_output": "Let's troubleshoot the crash. First, try clearing the app cache in Settings > Apps > [App Name] > Clear Cache. If that doesn't work, try reinstalling the app.",
    "expected_keywords": ["cache", "settings", "reinstall"],
    "difficulty": "easy"
  }
]`,
    },
    {
      type: 'heading',
      id: 'field-reference',
      level: 2,
      text: 'Dataset field reference',
    },
    {
      type: 'paragraph',
      text: 'Each test case can include the following fields:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'id', text: '(required) A unique identifier for the test case. Use something descriptive like "billing-refund-001" rather than just numbers.' },
        { bold: 'category', text: '(required) A grouping label. Use this to organize test cases by topic, feature, or difficulty. You can filter by category when running experiments.' },
        { bold: 'prompt', text: '(required) The input that will be sent to your model. For conversational datasets, this is the user\'s current message.' },
        { bold: 'expected_output', text: '(required) What a good response looks like. The judge uses this to evaluate answer quality. Be specific enough to enable meaningful comparison.' },
        { bold: 'expected_keywords', text: '(optional) Key terms that should appear in a good response. Useful for checking that models mention specific products, procedures, or concepts.' },
        { bold: 'difficulty', text: '(optional) How hard this test case is: easy, medium, or hard. Helps you understand whether failures are on routine cases or challenging ones.' },
        { bold: 'retrieval_context', text: '(optional) For RAG evaluations, the context documents that should inform the answer. Include this when testing whether models properly use provided information.' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'The expected_output doesn\'t need to be an exact match. The judge LLM evaluates semantic similarity, checking whether the model\'s response conveys the same meaning and covers the same points.',
    },
    {
      type: 'heading',
      id: 'conversational-format',
      level: 2,
      text: 'Conversational datasets',
    },
    {
      type: 'paragraph',
      text: 'Multi-turn datasets test how models handle ongoing conversations. Unlike single-turn prompts where you provide pre-written expected outputs, multi-turn evaluation works differently: the model actually generates responses at each turn, which are then evaluated for quality. These datasets unlock [[conversational metrics]](llm-evals/configuring-scorers) like knowledge retention and coherence.',
    },
    {
      type: 'heading',
      id: 'multi-turn-structure',
      level: 3,
      text: 'Multi-turn dataset structure',
    },
    {
      type: 'paragraph',
      text: 'Multi-turn datasets use a conversation array format where each item represents one turn in the conversation:',
    },
    {
      type: 'code',
      language: 'json',
      code: `{
  "id": "support-conv-001",
  "category": "customer-support",
  "conversation": [
    { "role": "user", "content": "Hi, I need help with my order" },
    { "role": "assistant", "content": "" },
    { "role": "user", "content": "Order #12345 hasn't arrived yet" },
    { "role": "assistant", "content": "" },
    { "role": "user", "content": "Can you check where it is?" },
    { "role": "assistant", "content": "" }
  ]
}`,
    },
    {
      type: 'paragraph',
      text: 'Notice the empty assistant content fields. During evaluation, the model generates these responses based on the conversation context up to that point. This tests real conversational ability rather than just comparing against pre-written answers.',
    },
    {
      type: 'heading',
      id: 'legacy-format',
      level: 3,
      text: 'Single-turn format for conversations',
    },
    {
      type: 'paragraph',
      text: 'You can also include conversation history in single-turn format by embedding it in the prompt. This approach uses pre-written expected outputs:',
    },
    {
      type: 'code',
      language: 'json',
      code: `{
  "id": "conv-followup-001",
  "category": "multi-turn",
  "prompt": "User: What's the return policy?\\nAssistant: You can return any item within 30 days of purchase with a receipt.\\nUser: What if I don't have the receipt?",
  "expected_output": "Without a receipt, we can offer store credit for the current selling price. Just bring the item and a valid ID.",
  "difficulty": "medium"
}`,
    },
    {
      type: 'callout',
      variant: 'tip',
      text: 'For chatbot evaluation, the multi-turn conversation format is recommended. It tests actual model behavior across turns rather than comparing against static expected outputs.',
    },
    {
      type: 'heading',
      id: 'browsing-datasets',
      level: 2,
      text: 'Browsing and previewing',
    },
    {
      type: 'paragraph',
      text: 'The Datasets tab shows all available datasets, both built-in and custom. Each card displays the dataset name, type (built-in or custom) and the number of prompts it contains.',
    },
    {
      type: 'paragraph',
      text: 'Click any dataset to open a preview drawer showing all its prompts. You can expand individual prompts to see the full expected output and metadata. This is useful for understanding what a dataset covers before using it in an experiment.',
    },
    {
      type: 'heading',
      id: 'editing-datasets',
      level: 2,
      text: 'Editing and customizing',
    },
    {
      type: 'paragraph',
      text: 'Want to tweak an existing dataset? Click the action menu on any dataset and select **Open in editor**. This loads all prompts into an editable view where you can:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Modify prompts and expected outputs' },
        { text: 'Change categories and difficulty levels' },
        { text: 'Add or remove expected keywords' },
        { text: 'Delete test cases that aren\'t relevant' },
      ],
    },
    {
      type: 'paragraph',
      text: 'When you\'re done, click **Save copy** to create a new custom dataset with your changes. The original dataset stays unchanged, so this is non-destructive editing.',
    },
    {
      type: 'heading',
      id: 'multi-turn-editor',
      level: 3,
      text: 'Multi-turn dataset editor',
    },
    {
      type: 'paragraph',
      text: 'Multi-turn datasets have a specialized editor that displays conversations in a chat-like format. Each turn shows role icons (user or assistant) with color-coded backgrounds, making it easy to see the conversation flow at a glance.',
    },
    {
      type: 'paragraph',
      text: 'In the editor, you can add new turns to existing conversations, modify message content, or rearrange the conversation flow. The visual format helps you maintain realistic dialogue patterns while editing.',
    },
    {
      type: 'callout',
      variant: 'warning',
      text: 'Built-in datasets can\'t be modified directly. Use "Save copy" to create an editable version that you can customize for your needs.',
    },
    {
      type: 'heading',
      id: 'best-practices',
      level: 2,
      text: 'Dataset best practices',
    },
    {
      type: 'paragraph',
      text: 'After helping many teams build effective evaluation datasets, here\'s what we\'ve learned works well:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Start with real data', text: 'Sample actual user queries from logs, support tickets, or user research. Synthetic prompts often miss the quirks of how real people phrase things.' },
        { bold: 'Include failures', text: 'When you find a bug or user complaint, turn it into a test case. Your dataset should grow from production experience.' },
        { bold: 'Cover the distribution', text: 'Don\'t just test happy paths. Include common variations, typos, ambiguous requests and edge cases. If 10% of your users ask questions in a particular way, 10% of your test cases should too.' },
        { bold: 'Write specific expected outputs', text: 'Vague expectations lead to vague evaluations. If there\'s a specific procedure or piece of information the model should include, spell it out.' },
        { bold: 'Use meaningful categories', text: 'Categories help you identify patterns. If your model struggles with "refund" questions but handles "shipping" well, you want to know that.' },
        { bold: 'Update regularly', text: 'Your product changes, your users change and your model\'s failure modes evolve. Review and refresh your datasets periodically.' },
      ],
    },
    {
      type: 'heading',
      id: 'managing-datasets',
      level: 2,
      text: 'Managing your datasets',
    },
    {
      type: 'paragraph',
      text: 'Over time, you\'ll accumulate multiple datasets. Keep them organized:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Use clear names', text: 'Include the purpose, version or date in the name. "Customer Support v2 - Dec 2024" is better than "test_data_final".' },
        { bold: 'Delete obsolete versions', text: 'Click the action menu and select "Remove" to delete datasets you no longer need. This keeps your list manageable.' },
        { bold: 'Document your datasets', text: 'Keep notes (even externally) about what each dataset covers, when it was last updated and any known limitations.' },
      ],
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        { collectionId: 'llm-evals', articleId: 'running-experiments', title: 'Running experiments', description: 'Use your datasets in evaluation runs' },
        { collectionId: 'llm-evals', articleId: 'configuring-scorers', title: 'Configuring scorers', description: 'Set up metrics for multi-turn and single-turn evaluations' },
      ],
    },
  ],
};
