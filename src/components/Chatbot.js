// src/components/Chatbot.js
import React, { useState, useContext, useRef } from 'react';
import { sendMessageToBaklava } from '../api/geminiAPI';
import { ChatContext } from '../context/ChatContext';
import VoiceMode from './VoiceMode';
import '../styles/Chatbot.css';

const Chatbot = ({ refreshCalendar }) => {
  const [input, setInput] = useState('');
  const { chatHistory, addMessage } = useContext(ChatContext);
  const [loading, setLoading] = useState(false);
  const [voiceModeEnabled, setVoiceModeEnabled] = useState(false);
  const voiceModeRef = useRef(null);

  // Function to speak text using TTS and auto-restart recording when finished
  const speakText = (text) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => {
        // Restart recording automatically if voice mode is enabled
        if (voiceModeEnabled && voiceModeRef.current) {
          voiceModeRef.current.startRecording();
        }
      };
      window.speechSynthesis.speak(utterance);
    } else {
      console.error("Text-to-speech is not supported in your browser.");
    }
  };

  const handleSend = async (userInput) => {
    if (!userInput.trim()) return;

    const userMessage = { sender: 'user', text: userInput };
    addMessage(userMessage);
    setLoading(true);

    // Pass the refreshCalendar callback so that any calendar update will trigger a refresh.
    const response = await sendMessageToBaklava(chatHistory, userInput, refreshCalendar);
    const botMessage = { sender: 'bot', text: response };
    addMessage(botMessage);

    // If voice mode is enabled, speak the bot response and auto-restart recording
    if (voiceModeEnabled) {
      speakText(response);
    }

    setInput('');
    setLoading(false);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSend(input);
    }
  };

  // Callback function for voice input from VoiceMode component.
  // Checks if the input contains farewell words to disable voice mode.
  const handleVoiceResult = (transcript) => {
    const lowerTranscript = transcript.toLowerCase();
    if (/(goodbye|bye|thanks|thank you|that is all|that's all)/.test(lowerTranscript)) {
      // Disable voice mode if a farewell phrase is detected.
      setVoiceModeEnabled(false);
      if (voiceModeRef.current) {
        voiceModeRef.current.stopRecording();
      }
    }
    setInput(transcript);
    handleSend(transcript);
  };

  return (
    <div className="chatbot-container">
      <div className="chat-controls">
        {/* Toggle Voice Mode */}
        <button
          onClick={() => {
            setVoiceModeEnabled(!voiceModeEnabled);
            // If enabling voice mode, start recording immediately
            if (!voiceModeEnabled && voiceModeRef.current) {
              voiceModeRef.current.startRecording();
            }
          }}
        >
          {voiceModeEnabled ? 'Disable Voice Mode' : 'Enable Voice Mode'}
        </button>
      </div>

      {/* Show the VoiceMode component only if voice mode is enabled */}
      {voiceModeEnabled && <VoiceMode ref={voiceModeRef} onResult={handleVoiceResult} />}

      <div className="chat-history">
        {chatHistory.map((msg, index) => (
          <div key={index} className={`chat-message ${msg.sender}`}>
            {msg.text}
          </div>
        ))}
      </div>

      {/* Hide text input if voice mode is active; otherwise, show it */}
      {!voiceModeEnabled && (
        <div className="chat-input-container">
          <input
            type="text"
            placeholder="Type your message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
          />
          <button onClick={() => handleSend(input)} disabled={loading}>
            {loading ? 'Sending...' : 'Send'}
          </button>
        </div>
      )}
    </div>
  );
};

export default Chatbot;
