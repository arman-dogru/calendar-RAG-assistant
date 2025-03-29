// src/api/googleCalendarAPI.js
export const getCalendarEvents = async () => {
  // Make a request to your Node server’s endpoint:
  try {
    const response = await fetch('http://localhost:3001/api/calendar/events', {
      credentials: 'include', // Important for sending session cookies
    });

    if (!response.ok) {
      throw new Error('Failed to fetch calendar events');
    }

    const events = await response.json();
    // Return them or handle as needed
    return events;
  } catch (error) {
    console.error('Error fetching events:', error);
    throw error;
  }
};

export const createCalendarEvent = async (title, date, time) => {
  // Example: date/time can be merged into an ISO string if you want
  // a single dateTime field. This is flexible, but you have to
  // ensure the backend’s format matches the calendar insert request.
  const startDateTime = `${date}T${time}:00`; // e.g. "2023-04-01T14:00:00"
  const endDateTime = `${date}T${parseInt(time, 10) + 1}:00:00`;

  try {
    const response = await fetch('http://localhost:3001/api/calendar/events', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: title,
        startDateTime,
        endDateTime
      })
    });

    if (!response.ok) {
      throw new Error('Failed to create calendar event');
    }

    const newEvent = await response.json();
    return newEvent; // or some message string
  } catch (error) {
    console.error('Error creating event:', error);
    throw error;
  }
};

export const deleteCalendarEvent = async (eventId) => {
  try {
    // Implement a DELETE route in your server for /api/calendar/events/:eventId
    const response = await fetch(`http://localhost:3001/api/calendar/events/${eventId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error('Failed to delete event');
    }
    return 'Event deleted successfully!';
  } catch (error) {
    console.error('Error deleting event:', error);
    throw error;
  }
};

export const updateCalendarEvent = async (eventId, title, date, time) => {
  try {
    // Similarly, you’d implement a PATCH route or PUT route to your server.
    const startDateTime = `${date}T${time}:00`;
    const endDateTime = `${date}T${parseInt(time, 10) + 1}:00:00`;

    const response = await fetch(`http://localhost:3001/api/calendar/events/${eventId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: title,
        startDateTime,
        endDateTime
      })
    });
    if (!response.ok) {
      throw new Error('Failed to update event');
    }
    return 'Event updated successfully!';
  } catch (error) {
    console.error('Error updating event:', error);
    throw error;
  }
};

export const getCalendarEventDetails = async (eventId) => {
  try {
    // E.g. GET /api/calendar/events/:eventId
    const response = await fetch(`http://localhost:3001/api/calendar/events/${eventId}`, {
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error('Failed to fetch event details');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching event details:', error);
    throw error;
  }
};
