// geminiAPI.js

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
    "You are Baklava Bot, a helpful virtual assistant. " +
    "Your job is to help users manage their schedules and appointments efficiently or answer questions by using your internal knowledge or looking up things online. " +
    "You only reply in plain text and no formatting of any type.\n\n";

  chatHistory.forEach((msg) => {
    prompt += `${msg.sender}: ${msg.text}\n`;
  });
  prompt += `user: ${newMessage}\n`;

  return prompt;
};

/**
 * "in-memory" map of eventId → event details.
 *
 * Example:
 * knownEventsMap = {
 *   "11kbb0fvbko7a43itv32c19mo0": {
 *       summary: "making baklava",
 *       startTime: "2025-03-30T17:00:00-07:00",
 *       userFriendlyIndex: 1
 *   },
 *   "ao9g5vqbp1732vio7iugce6l1k": {
 *       summary: "baklava meeting",
 *       startTime: "2025-03-30T18:00:00-07:00",
 *       userFriendlyIndex: 2
 *   }
 * };
 */
let knownEventsMap = {};

/**
 * Determines user intent and produces a list of tasks in JSON format.
 * Calls Gemini to analyze the user prompt and structure tasks accordingly.
 * 
 * @param {string} userPrompt - The user’s new message.
 * @param {string} conversationContext - A string containing the entire conversation so far.
 * @returns {Promise<Object>} - The parsed JSON object with tasks.
 */
const detectIntent = async (userPrompt, conversationContext) => {
  try {
    const now = new Date();
    const currentLocalISODate = now.toISOString().slice(0, 10);
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");

    let memoryNote = `Here is the list of known events. 
The user may refer to them by index, time, date, or summary:
`;
    for (const [evtId, details] of Object.entries(knownEventsMap)) {
      const index = details.userFriendlyIndex;
      const summary = details.summary;
      const startTime = details.startTime;
      memoryNote += `${index}) [ID: ${evtId}]
          summary: "${summary}"
          starts at: ${startTime}
          \n\n`;
    }

    const systemInstruction = `
You are an intent classification system. 
Today's date is ${currentLocalISODate}, and the current local time is ${hours}:${minutes}.
Any relative date/time references in the user prompt must be converted to valid ISO.

KNOWN EVENTS (with indexes, IDs, times, summaries):
${memoryNote}

CONVERSATION HISTORY:
${conversationContext}

The user may say things like:
- "Change the second event to 6pm"
- "Cancel the pistachio event"
- "Move my 5pm event to tomorrow"
In all these cases, figure out which event they are referencing by summary, date/time, or index.

# Date/Time Rules
- "tomorrow" means today+1 day. 
- "noon" means "12:00" in 24-hour format. 
- "2 pm" means "14:00".
- If a user says "next Tuesday," find the date that is Tuesday after the current day, etc.
- Output the final date in YYYY-MM-DD format, and time in HH:mm (24-hour) format.
- If the user does not specify a date or time, use the current date or time.

Available intents are: createEvent, deleteEvent, updateEvent, getEvents, getEventDetails, searchWeb, plainAnswer.

EXAMPLE OUTPUT:
{
  "tasks": [
    {
      "function": "createEvent",
      "parameters": {
        "title": "Meeting with John",
        "date": "2025-03-30",
        "time": "12:00"
      }
    },
    {
      "function": "getEvents",
      "parameters": {
        "date": "2025-03-29"
      }
    },
    {
      "function": "deleteEvent",
      "parameters": {
        "eventId": "11kbb0fvbko7a43itv32c19mo0"
      }
    },
    {
      "function": "updateEvent",
      "parameters": {
        "eventId": "ao9g5vqbp1732vio7iugce6l1k",
        "title": "Updated Event Title",
        "date": "2025-03-30",
        "time": "14:00"
      }
    },
    {
      "function": "searchWeb",
      "parameters": {
        "query": "What is the name of the CEO of Google?"
      }
    },
    {
      "function": "plainAnswer",
      "parameters": {
        "text": "Sure, here's a direct response with no further action."
      }
    }
  ]
}

You will read the user prompt, then output a valid JSON object containing a key 'tasks' (an array of objects).
Each object must have 'function' and 'parameters' fields.
Do not include triple backticks or any extra text besides the JSON.
Return only valid JSON. Nothing else.
`;

    const prompt = `${systemInstruction}\n\nUser prompt:\n${userPrompt}\n\nPlease output your JSON now:`;

    const genAI = new GoogleGenerativeAI("AIzaSyDsFwcze7fmXP5IEpnMfsv7KpEdPHB2L88");
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(prompt);

    const geminiRawResponse = await result.response.text();
    const codeBlockRegex = /```json([\s\S]*?)```/i;
    const codeBlockMatch = geminiRawResponse.match(codeBlockRegex);

    let jsonString;
    if (codeBlockMatch) {
      jsonString = codeBlockMatch[1];
    } else {
      jsonString = geminiRawResponse;
    }

    jsonString = jsonString.replace(/`/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (err) {
      console.error("Failed to parse JSON from Gemini:", err);
      console.error("Gemini Raw Response:", geminiRawResponse);
      parsed = { tasks: [] };
    }

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
 * Updates or reads knownEventsMap as needed.
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
          resultsLog.push(`Created event "${title}" on ${date} at ${time}: ${JSON.stringify(result)}`);
          break;
        }
        case "deleteEvent": {
          let { eventId, title } = parameters;
          if (!eventId && title) {
            const lowerTitle = title.toLowerCase();
            // Iterate through the knownEventsMap to find a match
            for (const [evtId, details] of Object.entries(knownEventsMap)) {
              if (details.summary.toLowerCase().includes(lowerTitle)) {
                eventId = evtId;
                break;
              }
            }
            if (!eventId) {
              throw new Error(`Cannot find an event matching "${title}"`);
            }
          }
          const result = await deleteCalendarEvent(eventId);
          resultsLog.push(`Deleted event ${eventId}: ${result}`);
          break;
        }
        case "updateEvent": {
          // If the provided eventId is not in knownEventsMap, try to resolve it using the title.
          if (!knownEventsMap[parameters.eventId] && parameters.title) {
            const lowerTitle = parameters.title.toLowerCase();
            for (const [evtId, details] of Object.entries(knownEventsMap)) {
              if (details.summary.toLowerCase().includes(lowerTitle)) {
                parameters.eventId = evtId;
                break;
              }
            }
          }
          // If we still don't have a valid eventId, throw an error.
          if (!parameters.eventId) {
            throw new Error("No valid event found to update.");
          }
          // Retrieve the existing event to fill missing details
          const existingEvent = await getCalendarEventDetails(parameters.eventId);
          let finalTitle = parameters.title || existingEvent.summary || "Untitled event";
          let finalDate = parameters.date || (existingEvent.start?.dateTime ? existingEvent.start.dateTime.split("T")[0] : "2025-01-01");
          let finalTime = parameters.time;
          if (!finalTime) {
            const existingStartDT = existingEvent.start?.dateTime;
            if (existingStartDT) {
              const timePart = existingStartDT.split("T")[1];
              finalTime = timePart.slice(0, 5);
            } else {
              finalTime = "09:00";
            }
          }
          const result = await updateCalendarEvent(parameters.eventId, finalTitle, finalDate, finalTime);
          resultsLog.push(`Updated event ${parameters.eventId} → summary "${finalTitle}", date ${finalDate} time ${finalTime}: ${result}`);
          break;
        }
        
        case "getEvents": {
          const events = await getCalendarEvents();
          resultsLog.push(`Fetched calendar events: ${JSON.stringify(events)}`);

          // Rebuild the knownEventsMap
          knownEventsMap = {};
          let eventIndex = 1;
          for (const evt of events) {
            const eventId = evt.id;
            const summary = evt.summary || "Untitled event";
            const start = evt.start?.dateTime || evt.start?.date;
            const end   = evt.end?.dateTime || evt.end?.date;
            knownEventsMap[eventId] = {
              summary,
              startTime: start,
              endTime: end,
              userFriendlyIndex: eventIndex,
            };
            eventIndex++;
          }
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
        case "plainAnswer": {
          const { text } = parameters;
          resultsLog.push(`Plain answer to user: ${text}`);
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

  return resultsLog.join("\n");
};

/**
 * Main function to handle the conversation with Baklava Bot:
 * 1. Builds the prompt from conversation history.
 * 2. Detects user intent.
 * 3. Executes tasks.
 * 4. Generates the final reply.
 */
export const sendMessageToBaklava = async (chatHistory, newMessage) => {
  
  try {
    // Update knownEventsMap with the current calendar events
    const events = await getCalendarEvents();
    knownEventsMap = {};
    let eventIndex = 1;
    for (const evt of events) {
      const eventId = evt.id;
      const summary = evt.summary || "Untitled event";
      const start = evt.start?.dateTime || evt.start?.date;
      const end = evt.end?.dateTime || evt.end?.date;
      knownEventsMap[eventId] = {
        summary,
        startTime: start,
        endTime: end,
        userFriendlyIndex: eventIndex,
      };
      eventIndex++;
    }

    const basePrompt = buildPromptFromHistory(chatHistory, newMessage);
    console.log("Prompt to Gemini (base, for final answer):", basePrompt);

    let conversationContext = "";
    chatHistory.forEach((msg) => {
      conversationContext += `${msg.sender}: ${msg.text}\n`;
    });
    conversationContext += `user: ${newMessage}\n`;

    const { tasks } = await detectIntent(newMessage, conversationContext);
    const taskResults = await workTasks(tasks);
    console.log("Tasks results:\n", taskResults);

    const finalPrompt = `
${basePrompt}
System note: The following tasks were performed, if you need to use this information to help you craft your response, here are the results:
${taskResults}
Now craft your final answer to the user. Remember to only reply in plain text (no formatting).
`;

    console.log("Prompt to Gemini (final):", finalPrompt);

    const genAI = new GoogleGenerativeAI("AIzaSyDsFwcze7fmXP5IEpnMfsv7KpEdPHB2L88");
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(finalPrompt);

    return await result.response.text();
  } catch (error) {
    console.error("Error in sendMessageToBaklava:", error);
    return "I'm sorry, but I encountered an error handling your request. Please try again.";
  }
};
