/**
 * @fileoverview AI/ML Framework Detection Patterns
 * @module lib/ai-detection/patterns/frameworks
 *
 * Frameworks that orchestrate AI/ML operations. These can connect to
 * cloud providers (medium risk) but also support local models.
 */

import type { DetectionPattern } from "../types";

/**
 * AI/ML Framework patterns
 * These frameworks orchestrate AI operations and can use various backends
 */
export const FRAMEWORK_PATTERNS: DetectionPattern[] = [
  // ============================================================================
  // LangChain
  // ============================================================================
  {
    name: "langchain",
    provider: "LangChain",
    description: "Framework for building applications with LLMs through composable components",
    documentationUrl: "https://python.langchain.com/docs/",
    confidence: "high",
    keywords: [
      "langchain",
      "chatopenai",
      "chatanthropic",
      "chatgooglegenerativeai",
      "azurechatopenai",
      "bedrockchat",
      "chatcohere",
      "chatmistrala",
    ],
    patterns: {
      imports: [
        /from\s+langchain[._]/,
        /import\s+langchain/,
        /from\s+["']langchain/,
        /require\s*\(\s*["']langchain/,
      ],
      dependencies: [
        /"langchain":\s*"/,
        /"@langchain\/core":\s*"/,
        /"@langchain\/openai":\s*"/,
        /"@langchain\/anthropic":\s*"/,
        /"@langchain\/google-genai":\s*"/,
        /langchain[>=<~^]/,
        /langchain-openai[>=<~^]/,
        /langchain-anthropic[>=<~^]/,
        /langchain-google-genai[>=<~^]/,
      ],
      apiCalls: [
        // Provider-specific chat models (Tier 2 - Instantiation)
        /ChatOpenAI\s*\(/,
        /ChatAnthropic\s*\(/,
        /ChatGoogleGenerativeAI\s*\(/,
        /AzureChatOpenAI\s*\(/,
        /BedrockChat\s*\(/,
        /ChatCohere\s*\(/,
        /ChatMistralAI\s*\(/,
        /ChatGroq\s*\(/,
        /ChatTogether\s*\(/,
        /ChatFireworks\s*\(/,
        // LLM wrappers
        /OpenAI\s*\(\s*model\s*=/,
        /Anthropic\s*\(\s*model\s*=/,
        // Chain invocations (Tier 3 - needs context)
        /\.invoke\s*\(\s*\{/,
        /\.ainvoke\s*\(\s*\{/,
        /\.stream\s*\(\s*\{/,
        /\.astream\s*\(\s*\{/,
      ],
    },
  },

  // ============================================================================
  // LlamaIndex
  // ============================================================================
  {
    name: "llamaindex",
    provider: "LlamaIndex",
    description: "Data framework for LLM applications with indexing and retrieval",
    documentationUrl: "https://docs.llamaindex.ai/",
    confidence: "high",
    keywords: ["llama_index", "llamaindex", "llama-index", "query_engine", "vectorstoreindex"],
    patterns: {
      imports: [
        /from\s+llama_index/,
        /import\s+llama_index/,
        /from\s+["']llama-index/,
        /require\s*\(\s*["']llama-index/,
        /from\s+llamaindex/,
      ],
      dependencies: [
        /"llama-index":\s*"/,
        /"llamaindex":\s*"/,
        /llama-index[>=<~^]/,
        /llama_index[>=<~^]/,
      ],
      apiCalls: [
        // LLM initialization with model parameter
        /OpenAI\s*\(\s*model\s*=/,
        /Anthropic\s*\(\s*model\s*=/,
        /Gemini\s*\(\s*model\s*=/,
        // Index operations
        /VectorStoreIndex\s*\.\s*from_documents\s*\(/,
        /GPTVectorStoreIndex\s*\(/,
        // Query operations
        /query_engine\s*\.\s*query\s*\(/,
        /\.as_query_engine\s*\(/,
        /index\s*\.\s*as_query_engine\s*\(/,
        // Chat operations
        /\.as_chat_engine\s*\(/,
        /chat_engine\s*\.\s*chat\s*\(/,
      ],
    },
  },

  // ============================================================================
  // Haystack
  // ============================================================================
  {
    name: "haystack",
    provider: "Haystack",
    description: "End-to-end NLP framework for building search and QA systems",
    documentationUrl: "https://haystack.deepset.ai/",
    confidence: "high",
    keywords: ["haystack", "deepset", "farm-haystack"],
    patterns: {
      imports: [/from\s+haystack/, /import\s+haystack/, /from\s+["']haystack/],
      dependencies: [
        /"haystack-ai":\s*"/,
        /"farm-haystack":\s*"/,
        /haystack-ai[>=<~^]/,
        /farm-haystack[>=<~^]/,
      ],
      apiCalls: [
        // Generator components
        /OpenAIGenerator\s*\(/,
        /AnthropicGenerator\s*\(/,
        /HuggingFaceLocalGenerator\s*\(/,
        /AzureOpenAIGenerator\s*\(/,
        // Pipeline operations
        /Pipeline\s*\(\s*\)/,
        /pipeline\s*\.\s*run\s*\(/,
      ],
    },
  },

  // ============================================================================
  // CrewAI
  // ============================================================================
  {
    name: "crewai",
    provider: "CrewAI",
    description: "Framework for orchestrating role-playing AI agents",
    documentationUrl: "https://docs.crewai.com/",
    confidence: "high",
    keywords: ["crewai", "crew", "agent"],
    patterns: {
      imports: [/from\s+crewai/, /import\s+crewai/],
      dependencies: [/"crewai":\s*"/, /crewai[>=<~^]/],
      apiCalls: [
        // Agent and Crew creation
        /Agent\s*\(\s*role\s*=/,
        /Crew\s*\(\s*agents\s*=/,
        /Task\s*\(\s*description\s*=/,
        // Crew execution
        /crew\s*\.\s*kickoff\s*\(/,
        /\.kickoff\s*\(\s*\)/,
      ],
    },
  },

  // ============================================================================
  // Semantic Kernel
  // ============================================================================
  {
    name: "semantic-kernel",
    provider: "Semantic Kernel",
    description: "Microsoft's SDK for integrating LLMs into applications",
    documentationUrl: "https://learn.microsoft.com/en-us/semantic-kernel/overview/",
    confidence: "high",
    keywords: ["semantic_kernel", "semantic-kernel", "semantickernel"],
    patterns: {
      imports: [
        /from\s+semantic_kernel/,
        /import\s+semantic_kernel/,
        /using\s+Microsoft\.SemanticKernel/,
        /from\s+["']@microsoft\/semantic-kernel/,
      ],
      dependencies: [
        /"@microsoft\/semantic-kernel":\s*"/,
        /semantic-kernel[>=<~^]/,
        /Microsoft\.SemanticKernel/,
      ],
      apiCalls: [
        // Kernel creation
        /Kernel\s*\.\s*CreateBuilder\s*\(/,
        /KernelBuilder\s*\(/,
        // AI services
        /AddAzureOpenAIChatCompletion\s*\(/,
        /AddOpenAIChatCompletion\s*\(/,
        // Function invocation
        /kernel\s*\.\s*InvokeAsync\s*\(/,
        /kernel\s*\.\s*InvokePromptAsync\s*\(/,
      ],
    },
  },

  // ============================================================================
  // AutoGen
  // ============================================================================
  {
    name: "autogen",
    provider: "AutoGen",
    description: "Microsoft's framework for multi-agent conversational systems",
    documentationUrl: "https://microsoft.github.io/autogen/",
    confidence: "high",
    keywords: ["autogen", "pyautogen", "autogen-agentchat"],
    patterns: {
      imports: [/from\s+autogen/, /import\s+autogen/, /from\s+pyautogen/],
      dependencies: [
        /"pyautogen":\s*"/,
        /"autogen-agentchat":\s*"/,
        /pyautogen[>=<~^]/,
        /autogen-agentchat[>=<~^]/,
      ],
      apiCalls: [
        // Agent creation
        /AssistantAgent\s*\(/,
        /UserProxyAgent\s*\(/,
        /ConversableAgent\s*\(/,
        /GroupChat\s*\(/,
        // Chat initiation
        /\.initiate_chat\s*\(/,
        /GroupChatManager\s*\(/,
      ],
    },
  },

  // ============================================================================
  // Instructor
  // ============================================================================
  {
    name: "instructor",
    provider: "Instructor",
    description: "Library for structured outputs from LLMs using Pydantic",
    documentationUrl: "https://python.useinstructor.com/",
    confidence: "high",
    keywords: ["instructor"],
    patterns: {
      imports: [/import\s+instructor/, /from\s+instructor/],
      dependencies: [/"instructor":\s*"/, /instructor[>=<~^]/],
      apiCalls: [
        /instructor\s*\.\s*from_openai\s*\(/,
        /instructor\s*\.\s*from_anthropic\s*\(/,
        /instructor\s*\.\s*patch\s*\(/,
        /client\s*\.\s*chat\s*\.\s*completions\s*\.\s*create\s*\(.*response_model/,
      ],
    },
  },

  // ============================================================================
  // Guidance
  // ============================================================================
  {
    name: "guidance",
    provider: "Guidance",
    description: "Microsoft's language for controlling LLM generation",
    documentationUrl: "https://github.com/guidance-ai/guidance",
    confidence: "high",
    keywords: ["guidance"],
    patterns: {
      imports: [/import\s+guidance/, /from\s+guidance/],
      dependencies: [/"guidance":\s*"/, /guidance[>=<~^]/],
      apiCalls: [
        /guidance\s*\.\s*models\s*\.\s*OpenAI\s*\(/,
        /guidance\s*\.\s*models\s*\.\s*Anthropic\s*\(/,
        /guidance\s*\.\s*models\s*\.\s*LlamaCpp\s*\(/,
      ],
    },
  },

  // ============================================================================
  // DSPy
  // ============================================================================
  {
    name: "dspy",
    provider: "DSPy",
    description: "Framework for programming with foundation models",
    documentationUrl: "https://dspy-docs.vercel.app/",
    confidence: "high",
    keywords: ["dspy"],
    patterns: {
      imports: [/import\s+dspy/, /from\s+dspy/],
      dependencies: [/"dspy-ai":\s*"/, /dspy-ai[>=<~^]/],
      apiCalls: [
        /dspy\s*\.\s*OpenAI\s*\(/,
        /dspy\s*\.\s*Anthropic\s*\(/,
        /dspy\s*\.\s*Together\s*\(/,
        /dspy\s*\.\s*configure\s*\(/,
        /dspy\s*\.\s*ChainOfThought\s*\(/,
        /dspy\s*\.\s*Predict\s*\(/,
      ],
    },
  },

  // ============================================================================
  // LiteLLM
  // ============================================================================
  {
    name: "litellm",
    provider: "LiteLLM",
    description: "Unified interface for calling 100+ LLM APIs",
    documentationUrl: "https://docs.litellm.ai/",
    confidence: "high",
    keywords: ["litellm"],
    patterns: {
      imports: [/import\s+litellm/, /from\s+litellm/],
      dependencies: [/"litellm":\s*"/, /litellm[>=<~^]/],
      apiCalls: [
        /litellm\s*\.\s*completion\s*\(/,
        /litellm\s*\.\s*acompletion\s*\(/,
        /litellm\s*\.\s*embedding\s*\(/,
        /litellm\s*\.\s*text_completion\s*\(/,
      ],
    },
  },

  // ============================================================================
  // Phidata (AI Agents & Assistants)
  // ============================================================================
  {
    name: "phidata",
    provider: "Phidata",
    description: "Framework for building AI assistants with memory and tools",
    documentationUrl: "https://docs.phidata.com/",
    confidence: "high",
    keywords: ["phidata", "phi", "assistant"],
    patterns: {
      imports: [/from\s+phi\./, /import\s+phi\./, /from\s+phidata/],
      dependencies: [/"phidata":\s*"/, /phidata[>=<~^]/],
      apiCalls: [
        // Agent creation
        /Assistant\s*\(/,
        /Agent\s*\(/,
        // Knowledge base
        /PDFKnowledgeBase\s*\(/,
        /WebsiteKnowledgeBase\s*\(/,
        // Tools
        /DuckDuckGo\s*\(/,
        /Newspaper4k\s*\(/,
      ],
    },
  },

  // ============================================================================
  // Pydantic AI (Type-safe AI)
  // ============================================================================
  {
    name: "pydantic-ai",
    provider: "Pydantic AI",
    description: "Type-safe AI agent framework from Pydantic team",
    documentationUrl: "https://ai.pydantic.dev/",
    confidence: "high",
    keywords: ["pydantic_ai", "pydantic-ai"],
    patterns: {
      imports: [/from\s+pydantic_ai/, /import\s+pydantic_ai/],
      dependencies: [/"pydantic-ai":\s*"/, /pydantic-ai[>=<~^]/],
      apiCalls: [/Agent\s*\(/, /\.run\s*\(/, /\.run_sync\s*\(/],
    },
  },

  // ============================================================================
  // Smolagents (Hugging Face)
  // ============================================================================
  {
    name: "smolagents",
    provider: "Hugging Face",
    description: "Lightweight AI agent library from Hugging Face",
    documentationUrl: "https://huggingface.co/docs/smolagents/",
    confidence: "high",
    keywords: ["smolagents"],
    patterns: {
      imports: [/from\s+smolagents/, /import\s+smolagents/],
      dependencies: [/"smolagents":\s*"/, /smolagents[>=<~^]/],
      apiCalls: [/CodeAgent\s*\(/, /ToolCallingAgent\s*\(/, /ManagedAgent\s*\(/, /HfApiModel\s*\(/],
    },
  },

  // ============================================================================
  // Agency Swarm (Multi-Agent)
  // ============================================================================
  {
    name: "agency-swarm",
    provider: "Agency Swarm",
    description: "Framework for creating collaborative AI agent systems",
    documentationUrl: "https://github.com/VRSEN/agency-swarm",
    confidence: "high",
    keywords: ["agency_swarm", "agency-swarm"],
    patterns: {
      imports: [/from\s+agency_swarm/, /import\s+agency_swarm/],
      dependencies: [/"agency-swarm":\s*"/, /agency-swarm[>=<~^]/],
      apiCalls: [/Agency\s*\(/, /Agent\s*\(/, /\.run_demo\s*\(/],
    },
  },

  // ============================================================================
  // ControlFlow (Prefect AI)
  // ============================================================================
  {
    name: "controlflow",
    provider: "ControlFlow",
    description: "Agentic workflow framework from Prefect team",
    documentationUrl: "https://controlflow.ai/",
    confidence: "high",
    keywords: ["controlflow"],
    patterns: {
      imports: [/from\s+controlflow/, /import\s+controlflow/],
      dependencies: [/"controlflow":\s*"/, /controlflow[>=<~^]/],
      apiCalls: [/cf\.run\s*\(/, /cf\.Agent\s*\(/, /cf\.Task\s*\(/, /@cf\.flow/],
    },
  },

  // ============================================================================
  // Marvin (Prefect AI)
  // ============================================================================
  {
    name: "marvin",
    provider: "Marvin",
    description: "AI engineering toolkit from Prefect team",
    documentationUrl: "https://www.askmarvin.ai/",
    confidence: "high",
    keywords: ["marvin"],
    patterns: {
      imports: [/from\s+marvin/, /import\s+marvin/],
      dependencies: [/"marvin":\s*"/, /marvin[>=<~^]/],
      apiCalls: [
        /marvin\.classify\s*\(/,
        /marvin\.extract\s*\(/,
        /marvin\.cast\s*\(/,
        /marvin\.fn\s*\(/,
        /@marvin\.fn/,
      ],
    },
  },

  // ============================================================================
  // Vercel AI SDK
  // ============================================================================
  {
    name: "vercel-ai",
    provider: "Vercel",
    description: "Vercel AI SDK for building AI-powered applications",
    documentationUrl: "https://sdk.vercel.ai/docs",
    confidence: "high",
    keywords: ["@ai-sdk", "ai-sdk", "vercel-ai", "streamText", "generateText", "useChat"],
    patterns: {
      imports: [/from\s+["']ai["']/, /from\s+["']@ai-sdk\//, /import\s+.*\s+from\s+["']ai["']/],
      dependencies: [
        /"ai":\s*"/,
        /"@ai-sdk\/openai":\s*"/,
        /"@ai-sdk\/anthropic":\s*"/,
        /"@ai-sdk\/google":\s*"/,
      ],
      apiCalls: [
        /generateText\s*\(/,
        /streamText\s*\(/,
        /generateObject\s*\(/,
        /streamObject\s*\(/,
        /useChat\s*\(/,
        /useCompletion\s*\(/,
      ],
    },
  },
];
