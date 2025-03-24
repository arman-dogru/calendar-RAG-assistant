// src/components/Chatbot.js
import React, { useState, useContext } from 'react';
import { sendMessageToBaklava } from '../api/geminiAPI';
import { ChatContext } from '../context/ChatContext';

const Chatbot = () => {
  const [input, setInput] = useState('');
  const { chatHistory, addMessage } = useContext(ChatContext);
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = { sender: 'user', text: input };
    addMessage(userMessage);
    setLoading(true);

    // Call the Gemini API with the full chat history and new input
    const response = await sendMessageToBaklava(chatHistory, input);
    const botMessage = { sender: 'bot', text: response };
    addMessage(botMessage);

    setInput('');
    setLoading(false);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  return (
    <div className="chatbot-container">
      <div className="chat-history">
        {chatHistory.map((msg, index) => (
          <div key={index} className={`chat-message ${msg.sender}`}>
            {msg.text}
          </div>
        ))}
      </div>
      <div className="chat-input-container">
        <input
          type="text"
          placeholder="Type your message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
        />
        <button onClick={handleSend} disabled={loading}>
          {loading ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
};

export default Chatbot;
