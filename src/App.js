// src/App.js

import React, { useState, useEffect } from 'react';
import Chatbot from './components/Chatbot';
import CalendarView from './components/CalendarView';
import { ChatProvider } from './context/ChatContext';
import { getCalendarEvents } from './api/googleCalendarAPI';
import './styles/Chatbot.css';
import './styles/CalendarView.css';
import './App.css'; // Ensure you're importing App.css

function App() {
  const [calendarEvents, setCalendarEvents] = useState([]);

  const refreshCalendarEvents = async () => {
    try {
      const events = await getCalendarEvents();
      setCalendarEvents(events);
    } catch (error) {
      console.error("Failed to refresh calendar events:", error);
    }
  };

  useEffect(() => {
    refreshCalendarEvents();
  }, []);

  return (
    <ChatProvider>
      <div className="App">
        {/* Centered title */}
        <h1 className="app-title">BAKLAVA Bot</h1>
        
        {/* Flex container for chatbot and calendar */}
        <div className="app-container">
          <Chatbot refreshCalendar={refreshCalendarEvents} />
          <CalendarView events={calendarEvents} />
        </div>
      </div>
    </ChatProvider>
  );
}

export default App;
