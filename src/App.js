// src/App.js
import React from 'react';
import Chatbot from './components/Chatbot';
import { ChatProvider } from './context/ChatContext';
import './styles/Chatbot.css';


function App() {
  return (
    <ChatProvider>
      <div className="App">
        <h1>BAKLAVA (Bot Assistant and Knowledge LLM Automation for Virtual Agenda) Bot </h1>
        <Chatbot />
      </div>
    </ChatProvider>
  );
}

export default App;
