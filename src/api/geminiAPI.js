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
 * Store a simple "in-memory" map of summary → eventId
 *
 * Example:
 * knownEventsMap = {
 *   "making baklava": "11kbb0fvbko7a43itv32c19mo0",
 *   "baklava meeting": "ao9g5vqbp1732vio7iugce6l1k"
 * };
 */
let knownEventsMap = {};

/**
 * Determines user intent and produces a list of tasks in JSON format.
 * Calls Gemini to analyze the user prompt and structure tasks accordingly.
 */
const detectIntent = async (userPrompt) => {
  try {
    // 1. Gather today's date/time in ISO
    const now = new Date();
    const currentLocalISODate = now.toISOString().slice(0, 10); // e.g. "2025-03-29"
    const hours = String(now.getHours()).padStart(2, "0");      // e.g. "09"
    const minutes = String(now.getMinutes()).padStart(2, "0");  // e.g. "07"

    // 2. Build a "memory note" listing known events
    let memoryNote = `Here is the list of known events. 
    The user may refer to them by index, time, date, or summary:
    `;

    for (const [evtId, details] of Object.entries(knownEventsMap)) {
      const index = details.userFriendlyIndex;
      const summary = details.summary;
      const startTime = details.startTime;
      
      // Example formatting
      // "1) (ID = rq4v7atnabgkcv1keg5glt5sck) summary: 'group meeting for pistacios' 
      //     starts at: 2025-03-30T17:00:00-07:00"
      memoryNote += `${index}) [ID: ${evtId}]
          summary: "${summary}"
          starts at: ${startTime}
          \n\n`;
    }


    // 3. Build the specialized system instructions
    const systemInstruction = `
You are an intent classification system. 
Today’s date is ${currentLocalISODate}, and the current local time is ${hours}:${minutes}.
Any relative date/time references in the user prompt must be converted to valid ISO.

KNOWN EVENTS (with indexes, IDs, times, summaries):
${memoryNote}

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
Do not include triple backticks (\`\`\`) or any extra text besides the JSON.
Return only valid JSON. Nothing else.
`;

    // 4. Combine systemInstruction + user prompt
    const prompt = `${systemInstruction}\n\nUser prompt:\n${userPrompt}\n\nPlease output your JSON now:`;

    // 5. Call Gemini
    const genAI = new GoogleGenerativeAI("AIzaSyDsFwcze7fmXP5IEpnMfsv7KpEdPHB2L88"); // Replace with your own key
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(prompt);

    // 6. Extract the text from Gemini
    const geminiRawResponse = await result.response.text();

    // 7. Look for a JSON code block
    const codeBlockRegex = /```json([\s\S]*?)```/i;
    const codeBlockMatch = geminiRawResponse.match(codeBlockRegex);

    let jsonString;
    if (codeBlockMatch) {
      jsonString = codeBlockMatch[1];
    } else {
      jsonString = geminiRawResponse;
    }

    // 8. Remove stray backticks
    jsonString = jsonString.replace(/`/g, "").trim();

    // 9. Attempt to parse JSON
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (err) {
      console.error("Failed to parse JSON from Gemini:", err);
      console.error("Gemini Raw Response:", geminiRawResponse);
      parsed = { tasks: [] };
    }

    // 10. Ensure we have a tasks array
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
 * We update or read knownEventsMap as needed.
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
          let { eventId, title } = parameters;
        
          // If eventId is not given, try to find it from the summary
          if (!eventId && title) {
            // Option 1: an exact match on knownEventsMap if the user’s “title” is exactly the event’s summary
            // (This is what you already do)
            const summaryLower = title.toLowerCase();
            if (knownEventsMap[summaryLower]) {
              eventId = knownEventsMap[summaryLower];
            } else {
              // Option 2: partial matching if the user’s text is close but not exact
              // e.g. user says “pistacio” but real summary is “group meeting for pistacios”
              for (const [knownSummary, knownId] of Object.entries(knownEventsMap)) {
                if (knownSummary.includes(summaryLower)) {
                  eventId = knownId;
                  break;
                }
              }
            }
          }
        
          if (!eventId) {
            // If still not found, return an error or handle differently
            throw new Error(`Cannot find an event matching "${title}"`);
          }
        
          const result = await deleteCalendarEvent(eventId);
          resultsLog.push(`Deleted event ${eventId}: ${result}`);
          break;
        }        
        
        case "updateEvent": {
          // 1) If we only got a title from user (e.g. “pistacio event”), look up event ID from the knownEventsMap:
          if (!parameters.eventId && parameters.title) {
            const summaryLower = parameters.title.toLowerCase();
            parameters.eventId = knownEventsMap[summaryLower];
          }
        
          // 2) Retrieve the existing event from Google Calendar if we need to fill missing info:
          //    e.g., user only specified a new time, but no date or summary
          const existingEvent = await getCalendarEventDetails(parameters.eventId);
        
          // existingEvent.start.dateTime might look like "2025-03-30T17:00:00-07:00" or just "2025-03-30T17:00:00Z".
          // We can safely split on "T" to get the date portion if needed:
        
          // 3) Determine final date, time, and summary.
          //    If user provided them, use them; else keep from existing event.
          let finalTitle = parameters.title;
          let finalDate  = parameters.date;
          let finalTime  = parameters.time;
        
          // If user did NOT provide a new summary/title, default to the existing summary
          if (!finalTitle) {
            finalTitle = existingEvent.summary || "Untitled event";
          }
        
          // If user did NOT provide a new date, parse the existing date from existingEvent.start.dateTime
          if (!finalDate) {
            const existingStartDT = existingEvent.start?.dateTime; 
            if (existingStartDT) {
              finalDate = existingStartDT.split("T")[0]; // e.g. "2025-03-30"
            } else {
              finalDate = "2025-01-01"; // fallback, or handle differently
            }
          }
        
          // If user did NOT provide a new time, parse the existing time from existingEvent.start.dateTime
          if (!finalTime) {
            const existingStartDT = existingEvent.start?.dateTime;
            if (existingStartDT) {
              // e.g. "2025-03-30T17:00:00-07:00"
              // after splitting on "T" => "2025-03-30", "17:00:00-07:00"
              // then split again on ":" => ["17","00","00-07","00"]
              const timePart = existingStartDT.split("T")[1]; // "17:00:00-07:00"
              finalTime = timePart.slice(0,5); // "17:00"
            } else {
              finalTime = "09:00"; // fallback if truly missing
            }
          }
        
          // 4) Now call your existing updateCalendarEvent with final merged info
          const result = await updateCalendarEvent(
            parameters.eventId,
            finalTitle,
            finalDate,
            finalTime
          );
        
          resultsLog.push(
            `Updated event ${parameters.eventId} → summary "${finalTitle}", date ${finalDate} time ${finalTime}: ${result}`
          );
          break;
        }        

        case "getEvents": {
          const events = await getCalendarEvents();
          resultsLog.push(`Fetched calendar events: ${JSON.stringify(events)}`);
        
          // Clear and rebuild our knownEventsMap
          knownEventsMap = {};
        
          // We'll also keep a simple counter so we can label them "1st event," "2nd event," etc.
          let eventIndex = 1;
        
          for (const evt of events) {
            const eventId = evt.id;
            const summary = evt.summary || "Untitled event";
            const start = evt.start?.dateTime || evt.start?.date;
            const end   = evt.end?.dateTime   || evt.end?.date;
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
          // Just log the plain text so the final response can incorporate it
          resultsLog.push(`Plain answer to user: ${text}`);
          break;
        }

        default:
          resultsLog.push(`Unknown function "${funcName}". No action taken.`);
      }
    } catch (error) {
      console.error(`Error processing task "${funcName}":`, error);
      resultsLog.push(
        `Error in function "${funcName}" with parameters ${JSON.stringify(parameters)}: ${error.message}`
      );
    }
  }

  // Combine all results into one text block
  return resultsLog.join("\n");
};

/**
 * Main function to handle the conversation with Baklava Bot:
 * 1. Build the prompt from the conversation.
 * 2. Detect user intent (returns tasks in JSON).
 * 3. Perform the tasks (if any).
 * 4. Generate the final reply, providing task results as part of the context.
 */
export const sendMessageToBaklava = async (chatHistory, newMessage) => {
  try {
    // 1) Build prompt from conversation
    const basePrompt = buildPromptFromHistory(chatHistory, newMessage);
    console.log("Prompt to Gemini (base):", basePrompt);

    // 2) Get tasks from detectIntent
    const { tasks } = await detectIntent(newMessage);

    // 3) Execute tasks (call calendar or web search functions, etc.)
    const taskResults = await workTasks(tasks);
    console.log("Tasks results:\n", taskResults);

    // 4) Incorporate the tasks results into a final prompt for Gemini
    const finalPrompt = `
${basePrompt}
System note: The following tasks were performed, if you need use the following information to help you craft your response, and here are the results:
${taskResults}
Now craft your final answer to the user. Remember to only reply in plain text (no formatting).`;

    console.log("Prompt to Gemini (final):", finalPrompt);

    // 5) Make final call to Gemini with updated context
    const genAI = new GoogleGenerativeAI("AIzaSyDsFwcze7fmXP5IEpnMfsv7KpEdPHB2L88"); // your key
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(finalPrompt);

    // 6) Return the plain text result
    return await result.response.text();
  } catch (error) {
    console.error("Error in sendMessageToBaklava:", error);
    return "I'm sorry, but I encountered an error handling your request. Please try again.";
  }
};
