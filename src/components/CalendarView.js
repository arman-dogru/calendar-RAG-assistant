// src/components/CalendarView.js
import React from 'react';
import '../styles/CalendarView.css';

const CalendarView = ({ events }) => {
  const formatEventTime = (start) => {
    if (!start) return "No start time";
    if (start.dateTime) {
      return new Date(start.dateTime).toLocaleString();
    }
    if (start.date) {
      return new Date(start.date).toLocaleDateString();
    }
    return "Unknown time";
  };

  return (
    <div className="calendar-view">
      <h2>Calendar Events</h2>
      {events.length === 0 ? (
        <p>No events found.</p>
      ) : (
        <ul>
          {events.map((event) => (
            <li key={event.id}>
              <strong>{event.summary}</strong>
              <br />
              {formatEventTime(event.start)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default CalendarView;
