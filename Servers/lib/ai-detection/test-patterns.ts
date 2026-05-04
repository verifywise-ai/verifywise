/**
 * @fileoverview Pattern Testing Script
 *
 * Tests the AI detection patterns against sample code snippets
 * to verify detection works correctly.
 *
 * Run with: npx tsx lib/ai-detection/test-patterns.ts
 */

import { AIDetector } from "./scanner";
import { ALL_PATTERNS } from "./patterns";

// Test cases for different providers and finding types
const TEST_CASES = [
  // ============================================================================
  // OpenAI
  // ============================================================================
  {
    name: "OpenAI Python Import",
    file: "app.py",
    content: `
import openai
from openai import OpenAI

client = OpenAI()
response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello"}]
)
`,
    expectedPatterns: ["openai"],
    expectedTypes: ["library", "api_call"],
  },
  {
    name: "OpenAI JavaScript Import",
    file: "app.js",
    content: `
import OpenAI from 'openai';

const openai = new OpenAI();
const completion = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: "Hello" }]
});
`,
    expectedPatterns: ["openai"],
    expectedTypes: ["library", "api_call"],
  },
  {
    name: "OpenAI API Key Secret",
    file: "config.py",
    content: `
# Configuration - env var assignment pattern
OPENAI_API_KEY = "sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz123456789abcdefghij"
`,
    expectedPatterns: ["openai"],
    expectedTypes: ["secret"],
  },

  // ============================================================================
  // Anthropic
  // ============================================================================
  {
    name: "Anthropic Python Import",
    file: "claude.py",
    content: `
import anthropic

client = anthropic.Anthropic()
message = client.messages.create(
    model="claude-3-opus-20240229",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello, Claude"}]
)
`,
    expectedPatterns: ["anthropic"],
    expectedTypes: ["library", "api_call"],
  },
  {
    name: "Anthropic JavaScript Import",
    file: "claude.ts",
    content: `
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();
const message = await anthropic.messages.create({
    model: "claude-3-opus-20240229",
    max_tokens: 1024,
    messages: [{ role: "user", content: "Hello, Claude" }]
});
`,
    expectedPatterns: ["anthropic"],
    expectedTypes: ["library", "api_call"],
  },

  // ============================================================================
  // Google AI (Gemini)
  // ============================================================================
  {
    name: "Google Gemini Python",
    file: "gemini.py",
    content: `
import google.generativeai as genai

genai.configure(api_key="AIzaSyABC123xyz")
model = genai.GenerativeModel('gemini-pro')
response = model.generate_content("Hello")
`,
    expectedPatterns: ["google-generativeai"],
    expectedTypes: ["library", "api_call"],
  },

  // ============================================================================
  // LangChain
  // ============================================================================
  {
    name: "LangChain Python",
    file: "langchain_app.py",
    content: `
from langchain.chat_models import ChatOpenAI
from langchain.chains import ConversationChain

llm = ChatOpenAI(model="gpt-4")
chain = ConversationChain(llm=llm)
`,
    expectedPatterns: ["langchain"],
    expectedTypes: ["library", "api_call"],
  },

  // ============================================================================
  // PyTorch (Local ML)
  // ============================================================================
  {
    name: "PyTorch Import",
    file: "model.py",
    content: `
import torch
import torch.nn as nn

class SimpleModel(nn.Module):
    def __init__(self):
        super().__init__()
        self.linear = nn.Linear(10, 1)
`,
    expectedPatterns: ["pytorch"],
    expectedTypes: ["library"],
  },

  // ============================================================================
  // Transformers
  // ============================================================================
  {
    name: "Transformers Import",
    file: "nlp.py",
    content: `
from transformers import AutoTokenizer, AutoModel

tokenizer = AutoTokenizer.from_pretrained("bert-base-uncased")
model = AutoModel.from_pretrained("bert-base-uncased")
`,
    expectedPatterns: ["transformers"],
    expectedTypes: ["library", "api_call"],
  },

  // ============================================================================
  // Dependency Files
  // ============================================================================
  {
    name: "Python requirements.txt",
    file: "requirements.txt",
    content: `
openai>=1.0.0
anthropic>=0.5.0
langchain>=0.1.0
torch>=2.0.0
transformers>=4.30.0
`,
    expectedPatterns: ["openai", "anthropic", "langchain", "pytorch", "transformers"],
    expectedTypes: ["dependency"],
  },
  {
    name: "Node package.json",
    file: "package.json",
    content: `
{
  "dependencies": {
    "openai": "^4.0.0",
    "@anthropic-ai/sdk": "^0.9.0",
    "langchain": "^0.1.0"
  }
}
`,
    expectedPatterns: ["openai", "anthropic", "langchain"],
    expectedTypes: ["dependency"],
  },

  // ============================================================================
  // API URLs (Tier 1 - Most Reliable)
  // ============================================================================
  {
    name: "Direct API URL Detection",
    file: "api_client.py",
    content: `
import requests

# OpenAI API call
response = requests.post("https://api.openai.com/v1/chat/completions", json=data)

# Anthropic API call
response = requests.post("https://api.anthropic.com/v1/messages", json=data)
`,
    expectedPatterns: ["openai", "anthropic"],
    expectedTypes: ["api_call"],
  },

  // ============================================================================
  // Groq (New Provider)
  // ============================================================================
  {
    name: "Groq Python",
    file: "groq_app.py",
    content: `
from groq import Groq

client = Groq()
chat_completion = client.chat.completions.create(
    messages=[{"role": "user", "content": "Hello"}],
    model="llama3-8b-8192"
)
`,
    expectedPatterns: ["groq"],
    expectedTypes: ["library", "api_call"],
  },

  // ============================================================================
  // Together AI (New Provider)
  // ============================================================================
  {
    name: "Together AI Python",
    file: "together_app.py",
    content: `
import together

together.api_key = "xxx"
output = together.Complete.create(
    prompt="Hello",
    model="togethercomputer/llama-2-7b"
)
`,
    expectedPatterns: ["together"],
    expectedTypes: ["library", "api_call"],
  },

  // ============================================================================
  // New Phase 2 Providers
  // ============================================================================
  {
    name: "ElevenLabs Voice AI",
    file: "voice_app.py",
    content: `
from elevenlabs import ElevenLabs

client = ElevenLabs()
audio = client.text_to_speech(text="Hello world", voice="Rachel")
`,
    expectedPatterns: ["elevenlabs"],
    expectedTypes: ["library", "api_call"],
  },
  {
    name: "AssemblyAI Speech-to-Text",
    file: "transcribe.py",
    content: `
import assemblyai as aai

transcriber = aai.Transcriber()
# Uses AssemblyAI API
url = "https://api.assemblyai.com/v2/transcript"
`,
    expectedPatterns: ["assemblyai"],
    expectedTypes: ["library", "api_call"],
  },
  {
    name: "Deepgram Speech Recognition",
    file: "deepgram_app.py",
    content: `
from deepgram import Deepgram

dg_client = DeepgramClient()
response = dg_client.listen.prerecorded(audio)
`,
    expectedPatterns: ["deepgram"],
    expectedTypes: ["library", "api_call"],
  },
  {
    name: "LangSmith Observability",
    file: "tracing.py",
    content: `
from langsmith import Client

client = langsmith.Client()
# Uses LangSmith API
url = "https://api.smith.langchain.com"
`,
    expectedPatterns: ["langsmith"],
    expectedTypes: ["library", "api_call"],
  },
  {
    name: "LangFuse Observability",
    file: "langfuse_app.py",
    content: `
from langfuse import Langfuse

langfuse = Langfuse()
trace = langfuse.trace(name="my_trace")
`,
    expectedPatterns: ["langfuse"],
    expectedTypes: ["library", "api_call"],
  },
  {
    name: "Weights & Biases Experiment Tracking",
    file: "train.py",
    content: `
import wandb

wandb.init(project="my_project")
wandb.log({"loss": 0.5})
`,
    expectedPatterns: ["wandb"],
    expectedTypes: ["library", "api_call"],
  },
  {
    name: "Databricks ML Platform",
    file: "databricks_app.py",
    content: `
from databricks.sdk import WorkspaceClient

client = WorkspaceClient()
# Uses Databricks workspace
endpoint = "myworkspace.cloud.databricks.com"
`,
    expectedPatterns: ["databricks"],
    expectedTypes: ["library", "api_call"],
  },
  {
    name: "Stability AI Image Generation",
    file: "image_gen.py",
    content: `
import stability_sdk

client = StabilityClient()
response = client.text_to_image(prompt="A sunset")
`,
    expectedPatterns: ["stability-ai"],
    expectedTypes: ["library", "api_call"],
  },

  // ============================================================================
  // New Providers (Phase 3)
  // ============================================================================
  {
    name: "OpenRouter Multi-Provider",
    file: "router.py",
    content: `
import openrouter

# Uses OpenRouter API
url = "https://openrouter.ai/api/v1/chat/completions"
`,
    expectedPatterns: ["openrouter"],
    expectedTypes: ["api_call"],
  },
  {
    name: "Pinecone Vector Database",
    file: "vectors.py",
    content: `
from pinecone import Pinecone

pc = Pinecone()
index = pc.Index("my-index")
index.upsert(vectors=data)
`,
    expectedPatterns: ["pinecone"],
    expectedTypes: ["library", "api_call"],
  },
  {
    name: "Weaviate Vector Database",
    file: "weaviate_app.py",
    content: `
import weaviate

client = weaviate.connect_to_weaviate_cloud(
    cluster_url="https://my-cluster.weaviate.cloud"
)
`,
    expectedPatterns: ["weaviate"],
    expectedTypes: ["library", "api_call"],
  },
  {
    name: "Qdrant Vector Database",
    file: "qdrant_app.py",
    content: `
from qdrant_client import QdrantClient

client = QdrantClient(url="https://my-cluster.qdrant.io")
client.search(collection_name="my_collection")
`,
    expectedPatterns: ["qdrant"],
    expectedTypes: ["library", "api_call"],
  },
  {
    name: "Chroma Vector Database",
    file: "chroma_app.py",
    content: `
import chromadb

client = chromadb.Client()
collection = client.get_or_create_collection("my_collection")
collection.add(documents=docs)
`,
    expectedPatterns: ["chroma"],
    expectedTypes: ["library", "api_call"],
  },
  {
    name: "Vercel AI SDK",
    file: "chat.ts",
    content: `
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

// Call the AI SDK
const result = await streamText({
  model: openai('gpt-4'),
  prompt: 'Hello'
});
`,
    expectedPatterns: ["vercel-ai"],
    expectedTypes: ["library", "api_call"],
  },
  {
    name: "Helicone Observability",
    file: "observe.py",
    content: `
# Using Helicone proxy
url = "https://oai.helicone.ai/v1/chat/completions"
headers = {"Helicone-Auth": "Bearer xxx"}
`,
    expectedPatterns: ["helicone"],
    expectedTypes: ["api_call"],
  },
  {
    name: "Phidata Agents",
    file: "agent.py",
    content: `
from phi.assistant import Assistant
from phi.tools.duckduckgo import DuckDuckGo

assistant = Assistant(tools=[DuckDuckGo()])
`,
    expectedPatterns: ["phidata"],
    expectedTypes: ["library", "api_call"],
  },
];

// Run tests
function runTests() {
  const detector = new AIDetector();
  let passed = 0;
  let failed = 0;

  console.log("=".repeat(70));
  console.log("AI Detection Pattern Tests");
  console.log("=".repeat(70));
  console.log(`\nTotal patterns loaded: ${ALL_PATTERNS.length}`);
  console.log(`Total test cases: ${TEST_CASES.length}\n`);

  for (const testCase of TEST_CASES) {
    const result = detector.scanFile(testCase.content, testCase.file);
    const detectedPatterns = new Set(result.matches.map((m) => m.pattern.name));
    const detectedTypes = new Set(result.matches.map((m) => m.findingType));

    // Check if expected patterns were found
    const missingPatterns = testCase.expectedPatterns.filter((p) => !detectedPatterns.has(p));
    const missingTypes = testCase.expectedTypes.filter((t) => !detectedTypes.has(t));

    const success = missingPatterns.length === 0 && missingTypes.length === 0;

    if (success) {
      console.log(`✅ ${testCase.name}`);
      console.log(
        `   Detected: ${[...detectedPatterns].join(", ")} (${[...detectedTypes].join(", ")})`,
      );
      passed++;
    } else {
      console.log(`❌ ${testCase.name}`);
      console.log(`   Expected patterns: ${testCase.expectedPatterns.join(", ")}`);
      console.log(`   Detected patterns: ${[...detectedPatterns].join(", ") || "none"}`);
      console.log(`   Expected types: ${testCase.expectedTypes.join(", ")}`);
      console.log(`   Detected types: ${[...detectedTypes].join(", ") || "none"}`);
      if (missingPatterns.length > 0) {
        console.log(`   Missing patterns: ${missingPatterns.join(", ")}`);
      }
      if (missingTypes.length > 0) {
        console.log(`   Missing types: ${missingTypes.join(", ")}`);
      }
      failed++;
    }
    console.log();
  }

  console.log("=".repeat(70));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(70));

  // Exit with error code if any tests failed
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
