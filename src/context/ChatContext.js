// src/context/ChatContext.js
import React, { createContext, useState } from 'react';

export const ChatContext = createContext();

export const ChatProvider = ({ children }) => {
  const [chatHistory, setChatHistory] = useState([]);

  // Adds a message to the chat history
  const addMessage = (message) => {
    setChatHistory((prev) => [...prev, message]);
  };

  return (
    <ChatContext.Provider value={{ chatHistory, addMessage }}>
      {children}
    </ChatContext.Provider>
  );
};
