const { randomUUID } = require("crypto").webcrypto;

// Constants for the API configuration
const baseUrl = "https://chat.openai.com";
const apiUrl = `${baseUrl}/backend-api/conversation`;

// Initialize global variables to store the session token and device ID
let token;
let oaiDeviceId;

function GenerateCompletionId(prefix = "cmpl-") {
  const characters =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const length = 28;

  for (let i = 0; i < length; i++) {
    prefix += characters.charAt(Math.floor(Math.random() * characters.length));
  }

  return prefix;
}

// Function to get a new session ID and token from the OpenAI API
async function getNewSessionId() {
  let newDeviceId = randomUUID();
  const init = {
    headers: {
      "oai-device-id": newDeviceId,
      accept: "*/*",
      "content-type": "application/json",
      // ...other headers
    },
  };
  const response = await fetch(`${baseUrl}/backend-anon/sentinel/chat-requirements`, init);
  const data = await response.json();
  oaiDeviceId = newDeviceId;
  token = data.token;
}

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  if (request.method === "OPTIONS") {
    // Handle CORS preflight request
    return handleOptions(request);
  } else if (request.method === "POST") {
    // Handle POST request
    const url = new URL(request.url);
    if (url.pathname === "/v1/chat/completions") {
      return handleChatCompletion(request);
    }
  }

  // Return 404 for other routes
  return new Response(JSON.stringify({
    status: false,
    error: {
      message: "The requested endpoint was not found.",
      type: "invalid_request_error",
    },
  }), { status: 404, headers: { "Content-Type": "application/json" } });
}

function handleOptions(request) {
  // Handle CORS
  let headers = request.headers;
  if (headers.get("Origin") !== null &&
      headers.get("Access-Control-Request-Method") !== null &&
      headers.get("Access-Control-Request-Headers") !== null) {
    // Handle CORS pre-flight request.
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  } else {
    // Handle standard OPTIONS request.
    return new Response(null, {
      headers: {
        "Allow": "GET, POST, OPTIONS",
      }
    });
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Max-Age": "86400",
  // ...other CORS headers...
};

async function handleChatCompletion(request) {
  try {
    const requestBody = await request.json();
    const messages = requestBody.messages.map(message => ({
      author: { role: message.role },
      content: { content_type: "text", parts: [message.content] },
    }));

    const body = {
      action: "next",
      messages: messages,
      parent_message_id: randomUUID(),
      model: "text-davinci-002-render-sha",
      timezone_offset_min: -180,
      suggestions: [],
      history_and_training_disabled: true,
      conversation_mode: { kind: "primary_assistant" },
      websocket_request_id: randomUUID(),
    };

    const init = {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "oai-device-id": oaiDeviceId,
        "openai-sentinel-chat-requirements-token": token,
        // ...other headers
      },
    };

    const response = await fetch(apiUrl, init);

    if (response.ok) {
      const responseData = await response.json();
      return new Response(JSON.stringify(responseData), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    } else {
      throw new Error(`API response status: ${response.status}`);
    }
  } catch (error) {
    return new Response(JSON.stringify({
      status: false,
      error: {
        message: error.message || "Unknown error",
        type: "invalid_request_error",
      },
    }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
  }
}

// Refresh session ID periodically
async function refreshSessionId() {
  await getNewSessionId();
  // Schedule next refresh
  setTimeout(refreshSessionId, 60000);
}

// Start session ID refresh loop
refreshSessionId();
