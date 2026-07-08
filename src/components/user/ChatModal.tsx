import React, { useEffect, useState, useRef } from 'react';
import { ref, push, query, limitToLast, onChildAdded, off, serverTimestamp } from 'firebase/database';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';

interface ChatModalProps {
  tournamentId: string;
  tournamentName: string;
  onClose: () => void;
}

interface ChatMessage {
  id: string;
  uid: string;
  displayName: string;
  message: string;
  timestamp: number;
  replyTo?: {
    originalSenderName: string;
    originalMessage: string;
  };
}

const ChatModal: React.FC<ChatModalProps> = ({ tournamentId, tournamentName, onClose }) => {
  const { currentUser, userProfile } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputVal, setInputVal] = useState('');
  
  // Reply context state
  const [replyTo, setReplyTo] = useState<{ originalSenderName: string; originalMessage: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Subscribe to real-time chat updates
  useEffect(() => {
    const chatRef = query(ref(db, `chats/${tournamentId}`), limitToLast(60));

    const handleChildAdded = onChildAdded(chatRef, (snapshot) => {
      const val = snapshot.val();
      if (val) {
        const msg: ChatMessage = {
          id: snapshot.key as string,
          uid: val.uid,
          displayName: val.displayName || 'Player',
          message: val.message,
          timestamp: val.timestamp || Date.now(),
          replyTo: val.replyTo
        };
        setMessages(prev => {
          if (prev.some(x => x.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
    });

    return () => {
      off(chatRef, 'child_added', handleChildAdded);
    };
  }, [tournamentId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim() || !currentUser || !userProfile) return;

    // Security check - must have joined the tournament
    if (!userProfile.joinedTournaments?.[tournamentId]) {
      alert('You can only send messages in matches you have joined.');
      return;
    }

    const messageData: any = {
      uid: currentUser.uid,
      displayName: userProfile.displayName,
      message: inputVal.trim(),
      timestamp: serverTimestamp()
    };

    if (replyTo) {
      messageData.replyTo = replyTo;
    }

    try {
      await push(ref(db, `chats/${tournamentId}`), messageData);
      setInputVal('');
      setReplyTo(null);
    } catch (err: any) {
      console.error('Error sending message:', err);
      alert('Failed to send message: ' + err.message);
    }
  };

  const formatTime = (ts: number) => {
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleBubbleClick = (msg: ChatMessage) => {
    const snippet = msg.message.length > 50 ? msg.message.substring(0, 50) + '...' : msg.message;
    setReplyTo({
      originalSenderName: msg.displayName,
      originalMessage: snippet
    });
  };

  return (
    <div 
      className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
      style={{ zIndex: 1060, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)' }}
    >
      <div 
        className="custom-card d-flex flex-column mx-3 overflow-hidden border border-secondary border-opacity-30 shadow-lg" 
        style={{ width: '100%', maxWidth: '500px', height: '80vh', borderRadius: '16px' }}
      >
        {/* Sleek Header */}
        <div className="modal-header d-flex justify-content-between align-items-center bg-dark bg-opacity-40 px-4 py-3 border-bottom border-secondary border-opacity-20">
          <div>
            <h5 className="modal-title m-0 text-white fw-bold"><i className="bi bi-chat-dots-fill text-primary me-2"></i>Lobby Chat</h5>
            <span className="text-secondary" style={{ fontSize: '0.72rem' }}>{tournamentName}</span>
          </div>
          <button className="btn-close btn-close-white" onClick={onClose}></button>
        </div>

        {/* Messaging Area */}
        <div className="flex-grow-1 p-3 overflow-y-auto d-flex flex-column gap-3" style={{ background: 'rgba(15, 23, 42, 0.45)' }}>
          {messages.length > 0 ? (
            messages.map(msg => {
              const isMine = msg.uid === currentUser?.uid;
              return (
                <div 
                  key={msg.id} 
                  className={`d-flex ${isMine ? 'justify-content-end' : 'justify-content-start'}`}
                >
                  <div 
                    className={`p-3 rounded-3 text-start position-relative ${
                      isMine 
                        ? 'premium-chat-mine text-white' 
                        : 'premium-chat-other text-light'
                    }`}
                    style={{ maxWidth: '80%', cursor: 'pointer', borderRadius: '12px' }}
                    onClick={() => handleBubbleClick(msg)}
                  >
                    {/* Reply Context Block Inside Bubble */}
                    {msg.replyTo && (
                      <div className="mb-2 p-2 bg-black bg-opacity-30 rounded-3 border-start border-warning border-3" style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                        <strong className="text-warning d-block small mb-1">{msg.replyTo.originalSenderName}</strong>
                        {msg.replyTo.originalMessage}
                      </div>
                    )}
                    
                    {!isMine && (
                      <span className="text-accent fw-bold d-block small mb-1" style={{ fontSize: '0.75rem' }}>
                        {msg.displayName}
                      </span>
                    )}

                    <div className="text-wrap" style={{ wordBreak: 'break-word', fontSize: '0.86rem', lineHeight: '1.4' }}>
                      {msg.message}
                    </div>

                    <span className="d-block text-end mt-2 text-secondary" style={{ fontSize: '0.62rem', opacity: 0.6 }}>
                      {formatTime(msg.timestamp)}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-5 my-auto text-secondary">
              <i className="bi bi-chat-quote-fill text-secondary display-3 d-block mb-3 opacity-30"></i>
              No messages in lobby yet.<br />Be the first to speak!
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Reply Context Bar */}
        {replyTo && (
          <div className="p-3 border-top border-secondary border-opacity-20 bg-dark bg-opacity-50 d-flex justify-content-between align-items-center">
            <div className="text-start border-start border-3 border-warning ps-3 overflow-hidden">
              <span className="small text-warning block fw-bold" style={{ fontSize: '0.72rem' }}>Replying to {replyTo.originalSenderName}</span>
              <p className="small text-secondary m-0 text-truncate" style={{ fontSize: '0.78rem' }}>{replyTo.originalMessage}</p>
            </div>
            <button className="btn btn-sm btn-outline-secondary py-0 border-0" onClick={() => setReplyTo(null)}>
              <i className="bi bi-x-lg"></i>
            </button>
          </div>
        )}

        {/* Bottom Form Bar */}
        <div className="modal-footer p-3 bg-dark bg-opacity-40 border-top border-secondary border-opacity-25">
          <form onSubmit={handleSend} className="d-flex w-100 gap-2">
            <input 
              type="text" 
              className="form-control px-3 py-2" 
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder="Type lobby message..." 
              required 
              autoComplete="off"
              style={{ borderRadius: '8px', fontSize: '0.88rem' }}
            />
            <button type="submit" className="btn btn-primary d-flex align-items-center justify-content-center" style={{ width: '46px', height: '38px', padding: 0, borderRadius: '8px' }}>
              <i className="bi bi-send-fill" style={{ fontSize: '1rem' }}></i>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ChatModal;
