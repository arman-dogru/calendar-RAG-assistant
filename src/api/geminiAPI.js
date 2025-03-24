// src/api/geminiAPI.js

const { GoogleGenerativeAI } = require("@google/generative-ai");

// Import the calendar functions
const {
  getCalendarEvents,
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
  getCalendarEventDetails,
} = require("./googleCalendarAPI.js");

// Import the web search function
const { searchWeb } = require("./webSearchAPI.js");

/**
 * Builds a prompt that includes conversation history
 * and the new user message for the Gemini model.
 *
 * @param {Array<{sender: string, text: string}>} chatHistory - The conversation history
 * @param {string} newMessage - The user’s new input
 * @returns {string} - The final prompt for the Gemini model
 */
const buildPromptFromHistory = (chatHistory, newMessage) => {
  let prompt =
    "You are Baklava Bot, a helpful virtual assistant." +
    "Your job is to help users manage their schedules and appointments efficiently or answer questions by using your internal knowledge or looking up things online." +
    "You only reply in plain text and no formatting of any type.\n";
  chatHistory.forEach((msg) => {
    prompt += `${msg.sender}: ${msg.text}\n`;
  });
  prompt += `user: ${newMessage}\n`;
  return prompt;
};

/**
 * Determines user intent and produces a list of tasks in JSON format.
 * Calls Gemini to analyze the user prompt and structure tasks accordingly.
 */
const detectIntent = async (userPrompt) => {
  try {
    // Build a specialized prompt instructing Gemini to return only JSON with tasks.
    const systemInstruction = `
You are an intent classification system. Available intents are: createEvent, deleteEvent, updateEvent, getEvents, getEventDetails, searchWeb.
EXAMPLE OUTPUT:
  {
    "tasks": [
      {
        "function": "createEvent",
        "parameters": {
          "title": "Meeting with John",
          "date": "2022-12-31",
          "time": "14:00"
        }
      },
      {
        "function": "getEvents",
        "parameters": {
          "date": "2022-12-31"
        }
      },
      {
        "function": "searchWeb",
        "parameters": {
          "query": "What is the name of the CEO of Google?"
        }
      }
    ]
  }
You will read the user prompt, then output a valid JSON object containing a key 'tasks' (an array of objects).
Each object must have 'function' and 'parameters' fields.
Do not include triple backticks ( \`\`\` ), code blocks, or any extra text besides the JSON.
Return only valid JSON. Nothing else.
`;

    const prompt = `${systemInstruction}\n\nUser prompt:\n${userPrompt}\n\nPlease output your JSON now:`;

    // Call Gemini
    const genAI = new GoogleGenerativeAI("AIzaSyDsFwcze7fmXP5IEpnMfsv7KpEdPHB2L88"); // Replace with your own
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(prompt);

    const geminiRawResponse = await result.response.text();

    // 1) Detect code block (```json ... ```) if present
    const codeBlockRegex = /```json([\s\S]*?)```/i;
    const codeBlockMatch = geminiRawResponse.match(codeBlockRegex);

    let jsonString;
    if (codeBlockMatch) {
      jsonString = codeBlockMatch[1];
    } else {
      jsonString = geminiRawResponse;
    }

    // 2) Remove stray backticks and trim
    jsonString = jsonString.replace(/`/g, "").trim();

    // 3) Parse JSON
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (err) {
      console.error("Failed to parse JSON from Gemini:", err);
      console.error("Gemini Raw Response:", geminiRawResponse);
      parsed = { tasks: [] };
    }

    // Ensure we have a "tasks" array
    if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
      parsed.tasks = [];
    }

    return parsed;
  } catch (error) {
    console.error("Error in detectIntent:", error);
    return { tasks: [] };
  }
};

/**
 * Processes each task from the "tasks" array and
 * invokes the respective calendar or web search functions.
 *
 * @param {Array<Object>} tasks - List of tasks specifying function and parameters
 * @returns {Promise<string>} - A summary text of the actions taken and their results
 */
const workTasks = async (tasks) => {
  let resultsLog = [];

  for (const task of tasks) {
    const { function: funcName, parameters } = task;
    try {
      switch (funcName) {
        case "createEvent": {
          const { title, date, time } = parameters;
          const result = await createCalendarEvent(title, date, time);
          resultsLog.push(`Created event "${title}" on ${date} at ${time}: ${result}`);
          break;
        }
        case "deleteEvent": {
          const { eventId } = parameters;
          const result = await deleteCalendarEvent(eventId);
          resultsLog.push(`Deleted event ${eventId}: ${result}`);
          break;
        }
        case "updateEvent": {
          const { eventId, title, date, time } = parameters;
          const result = await updateCalendarEvent(eventId, title, date, time);
          resultsLog.push(`Updated event ${eventId} to "${title}" on ${date} at ${time}: ${result}`);
          break;
        }
        case "getEvents": {
          const result = await getCalendarEvents();
          resultsLog.push(`Fetched calendar events: ${JSON.stringify(result)}`);
          break;
        }
        case "getEventDetails": {
          const { eventId } = parameters;
          const result = await getCalendarEventDetails(eventId);
          resultsLog.push(`Fetched details for event ${eventId}: ${JSON.stringify(result)}`);
          break;
        }
        case "searchWeb": {
          const { query } = parameters;
          const result = await searchWeb(query);
          resultsLog.push(`Searched the web for "${query}": ${JSON.stringify(result)}`);
          break;
        }
        default:
          resultsLog.push(`Unknown function "${funcName}". No action taken.`);
      }
    } catch (error) {
      console.error(`Error processing task "${funcName}":`, error);
      resultsLog.push(`Error in function "${funcName}" with parameters ${JSON.stringify(parameters)}: ${error.message}`);
    }
  }

  // Concatenate all action results into a single string
  return resultsLog.join("\n");
};

/**
 * Main function to handle the conversation with Baklava Bot:
 * 1. Build the prompt from the conversation.
 * 2. Detect user intent (returns tasks in JSON).
 * 3. Perform the tasks (if any).
 * 4. Generate the final reply, providing task results as part of the context.
 *
 * @param {Array<{sender: string, text: string}>} chatHistory - The prior conversation
 * @param {string} newMessage - The user’s new input
 * @returns {Promise<string>} - The final Gemini response to the user
 */
export const sendMessageToBaklava = async (chatHistory, newMessage) => {
  try {
    // 1. Build the prompt from conversation context
    const basePrompt = buildPromptFromHistory(chatHistory, newMessage);
    console.log("Prompt to Gemini (base):", basePrompt);

    // 2. Detect user intent → parse tasks
    const { tasks } = await detectIntent(newMessage);

    // 3. Execute the tasks (calendar actions, web search, etc.)
    const taskResults = await workTasks(tasks);
    console.log("Tasks results:\n", taskResults);

    /**
     * 4. Incorporate `taskResults` into the final prompt:
     *    The final prompt includes everything from `basePrompt` plus
     *    a new "assistant" system note describing the outcomes of tasks.
     *
     *    This way, Gemini can see what was done and can reference it
     *    in its final message to the user.
     */
    const finalPrompt = `
${basePrompt}
System note: The following tasks were performed, if you need use the following information to help you craft your response, and here are the results:
${taskResults}
Now craft your final answer to the user. Remember to only reply in plain text (no formatting).`;

    console.log("Prompt to Gemini (final):", finalPrompt);

    // Make the final call to Gemini with the updated context
    const genAI = new GoogleGenerativeAI("AIzaSyDsFwcze7fmXP5IEpnMfsv7KpEdPHB2L88"); // Replace with your own key
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(finalPrompt);

    // Return the plain text result to the user
    return await result.response.text();
  } catch (error) {
    console.error("Error in sendMessageToBaklava:", error);
    // Provide a fallback message if something goes wrong
    return "I'm sorry, but I encountered an error handling your request. Please try again.";
  }
};
