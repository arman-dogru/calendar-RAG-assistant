// server.js
const express = require('express');
const cors = require('cors'); // <-- Add this
const { google } = require('googleapis');
const path = require('path');
const serviceAccount = require('./service-account-key.json');

const app = express();

// Add a CORS setup before defining your routes
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true // Allow cookies/credentials to be sent
}));

app.use(express.json());

// Define the scopes you need
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events'
];

// Create a reusable Auth client from service account
async function getAuthClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: SCOPES
  });
  return await auth.getClient();
}

// GET single event by ID
app.get('/api/calendar/events/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    const client = await getAuthClient();
    const calendar = google.calendar({ version: 'v3', auth: client });

    // Use calendar.events.get to fetch the specific event
    const response = await calendar.events.get({
      calendarId: 'primary',
      eventId
    });

    // Return the event object
    return res.json(response.data);
  } catch (error) {
    console.error('Error fetching event details:', error);
    return res.status(500).send('Failed to fetch event details');
  }
});

// GET events
app.get('/api/calendar/events', async (req, res) => {
  try {
    const client = await getAuthClient();
    const calendar = google.calendar({ version: 'v3', auth: client });
    const response = await calendar.events.list({
      calendarId: 'primary',
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime'
    });
    return res.json(response.data.items);
  } catch (error) {
    console.error('Error fetching events:', error);
    return res.status(500).send('Failed to fetch events');
  }
});

// POST events (create)
app.post('/api/calendar/events', async (req, res) => {
  try {
    const { summary, startDateTime, endDateTime } = req.body;
    const client = await getAuthClient();
    const calendar = google.calendar({ version: 'v3', auth: client });

    const event = {
      summary,
      start: {
        dateTime: startDateTime,
        timeZone: 'America/Toronto'
      },
      end: {
        dateTime: endDateTime,
        timeZone: 'America/Toronto'
      }
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event
    });

    return res.json(response.data);
  } catch (error) {
    console.error('Error creating event:', error);
    return res.status(500).send('Failed to create event');
  }
});

// DELETE events
app.delete('/api/calendar/events/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    const client = await getAuthClient();
    const calendar = google.calendar({ version: 'v3', auth: client });

    await calendar.events.delete({
      calendarId: 'primary',
      eventId
    });

    return res.send('Event deleted successfully!');
  } catch (error) {
    console.error('Error deleting event:', error);
    return res.status(500).send('Failed to delete event');
  }
});

// PATCH events (update)
app.patch('/api/calendar/events/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { summary, startDateTime, endDateTime } = req.body;
    const client = await getAuthClient();
    const calendar = google.calendar({ version: 'v3', auth: client });

    const event = {
      summary,
      start: {
        dateTime: startDateTime,
        timeZone: 'America/Los_Angeles'
      },
      end: {
        dateTime: endDateTime,
        timeZone: 'America/Los_Angeles'
      }
    };

    const response = await calendar.events.update({
      calendarId: 'primary',
      eventId,
      requestBody: event
    });

    return res.json(response.data);
  } catch (error) {
    console.error('Error updating event:', error);
    return res.status(500).send('Failed to update event');
  }
});

// Start the server
app.listen(3001, () => {
  console.log('Server listening on http://localhost:3001');
});
