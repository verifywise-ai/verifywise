/**
 * @fileoverview Static example JSON payloads for the Project Datasets
 * "Download example" action in the upload instructions modal.
 *
 * @module pages/EvalsDashboard/ProjectDatasets/exampleDatasetPayloads
 */

export type ExampleUseCase = "chatbot" | "rag" | "agent";

export type ExampleTurnType = "single-turn" | "multi-turn" | "simulated";

/** Single-turn example rows keyed by use case. */
export const SINGLE_TURN_EXAMPLE_DATASETS = {
  chatbot: [
    {
      id: "chatbot_001",
      category: "general_knowledge",
      prompt: "What is the capital of France?",
      expected_output: "The capital of France is Paris.",
      expected_keywords: ["Paris", "capital", "France"],
      difficulty: "easy",
    },
    {
      id: "chatbot_002",
      category: "coding",
      prompt: "Write a Python function to reverse a string.",
      expected_output: "def reverse_string(s):\n    return s[::-1]",
      expected_keywords: ["def", "return"],
      difficulty: "medium",
    },
  ],
  rag: [
    {
      id: "rag_001",
      category: "document_qa",
      prompt: "What are the key benefits of renewable energy?",
      expected_output: "The key benefits include reduced carbon emissions and energy independence.",
      expected_keywords: ["carbon emissions", "energy independence"],
      difficulty: "medium",
      retrieval_context: [
        "Renewable energy sources offer significant environmental benefits by reducing greenhouse gas emissions.",
        "Countries that invest in renewable energy achieve greater energy independence.",
      ],
    },
  ],
  agent: [
    {
      id: "agent_001",
      category: "task_execution",
      prompt: "Search for the weather in New York and summarize it.",
      expected_output: "I searched for the current weather in New York. The temperature is 72°F.",
      expected_keywords: ["weather", "New York", "temperature"],
      difficulty: "medium",
      tools_available: ["web_search", "calculator", "calendar"],
      expected_tools: ["web_search"],
    },
  ],
} as const;

/** Multi-turn conversation examples keyed by use case. */
export const MULTI_TURN_EXAMPLE_DATASETS = {
  chatbot: [
    {
      scenario: "Customer asking about product features",
      expected_outcome: "Successfully explain product features and answer follow-up questions",
      turns: [
        {
          role: "user",
          content: "Hi, I'm interested in your premium plan. What features does it include?",
        },
        {
          role: "assistant",
          content:
            "Hello! Our premium plan includes unlimited storage, priority support, and advanced analytics. Would you like details on any specific feature?",
        },
        { role: "user", content: "Yes, tell me more about the advanced analytics." },
        {
          role: "assistant",
          content:
            "Our advanced analytics provides real-time dashboards, custom reports, and predictive insights powered by AI.",
        },
      ],
    },
    {
      scenario: "Technical troubleshooting conversation",
      expected_outcome: "Guide user through troubleshooting steps",
      turns: [
        { role: "user", content: "My app keeps crashing when I try to upload files." },
        {
          role: "assistant",
          content:
            "I'm sorry to hear that. Let me help you troubleshoot. What type of files are you trying to upload, and what's their size?",
        },
        { role: "user", content: "PDFs, around 50MB each." },
        {
          role: "assistant",
          content:
            "That file size should work fine. Can you try clearing your browser cache and attempting the upload again?",
        },
      ],
    },
  ],
  rag: [
    {
      scenario: "Document-based Q&A about company policies",
      expected_outcome: "Accurately answer questions using retrieved context",
      context: [
        "Employees are entitled to 20 days of paid time off per year.",
        "Remote work is permitted up to 3 days per week with manager approval.",
      ],
      turns: [
        { role: "user", content: "How many vacation days do I get per year?" },
        {
          role: "assistant",
          content:
            "According to the company policy, employees are entitled to 20 days of paid time off per year.",
        },
        { role: "user", content: "Can I work from home?" },
        {
          role: "assistant",
          content:
            "Yes, remote work is permitted up to 3 days per week, but you'll need your manager's approval.",
        },
      ],
    },
  ],
  agent: [
    {
      scenario: "Planning a trip with multiple tools",
      expected_outcome: "Successfully use tools to help plan a trip",
      tools_available: ["web_search", "calendar", "weather_api"],
      turns: [
        { role: "user", content: "Help me plan a trip to Paris next month." },
        {
          role: "assistant",
          content:
            "I'd be happy to help! Let me check the weather forecast for Paris next month. [uses weather_api]",
        },
        { role: "user", content: "What are the must-see attractions?" },
        {
          role: "assistant",
          content:
            "Let me search for top Paris attractions. [uses web_search] The top attractions include the Eiffel Tower, Louvre Museum, and Notre-Dame Cathedral.",
        },
      ],
    },
  ],
} as const;

/**
 * Simulated examples (scenario-only, no turns — AI generates the conversation).
 * Keyed by use case.
 */
export const SIMULATED_EXAMPLE_DATASETS = {
  chatbot: [
    {
      scenario: "User wants to book a flight to Paris",
      expected_outcome:
        "Successfully complete flight booking with date, class, and seat preference confirmed",
      user_description: "Frequent business traveler, prefers aisle seats, flexible on dates",
      max_turns: 8,
    },
    {
      scenario: "Customer complaining about a defective product",
      expected_outcome: "Resolve complaint with appropriate compensation (refund or replacement)",
      user_description: "Frustrated customer who bought the item last week, wants quick resolution",
      max_turns: 6,
    },
    {
      scenario: "New user asking for help getting started with the platform",
      expected_outcome: "User understands core features and can navigate the dashboard",
      user_description: "First-time user, not very tech-savvy, prefers step-by-step guidance",
    },
  ],
  rag: [
    {
      scenario: "Employee asking HR questions about benefits and policies",
      expected_outcome: "Provide accurate information from company documents",
      user_description: "New employee unfamiliar with company policies",
      max_turns: 8,
    },
    {
      scenario: "User researching a technical topic using documentation",
      expected_outcome: "Synthesize information from multiple documents accurately",
      user_description: "Developer looking for API integration guidance",
    },
  ],
  agent: [
    {
      scenario: "User planning a multi-city vacation with budget constraints",
      expected_outcome: "Create complete itinerary using search, calendar, and weather tools",
      user_description: "Budget-conscious traveler, flexible dates, prefers cultural experiences",
      max_turns: 10,
    },
    {
      scenario: "Manager scheduling a team meeting across time zones",
      expected_outcome: "Find optimal meeting time using calendar integration",
      user_description: "Busy manager with team members in 3 different time zones",
    },
  ],
} as const;

/**
 * Resolve the example payload for a given turn type and use case.
 * Used by the upload-modal "Download example" action.
 */
export const getExampleDatasetPayload = (turnType: ExampleTurnType, useCase: ExampleUseCase) => {
  if (turnType === "single-turn") {
    return SINGLE_TURN_EXAMPLE_DATASETS[useCase];
  }
  if (turnType === "multi-turn") {
    return MULTI_TURN_EXAMPLE_DATASETS[useCase];
  }
  return SIMULATED_EXAMPLE_DATASETS[useCase];
};
